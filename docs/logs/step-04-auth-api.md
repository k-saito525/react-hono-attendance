# STEP 04: 認証 API

| | |
|---|---|
| 状態 | 完了 |
| 期間 | 2026-09-27 〜 2026-09-28 |

## 目的

ログイン・ログアウト・本人確認の API と、認可のミドルウェアを作る。
STEP 02 から「`/api/users` が認証なしで全員分を返している」状態が続いていたので、ここで解消する。

画面（STEP 05）より先に API だけを作るのは、Cookie の属性・期限・失敗時の応答といった
**セキュリティ上の性質をテストで固定してから**画面を載せたいため。

## 主流の確認（提案時）

| | 状況 |
|---|---|
| TS の認証ライブラリ | Better Auth が事実上の主流（週 約970万 DL） |
| Lucia | 2025 年に非推奨。作者はライブラリをやめ、自前実装のための学習資料に転換 |
| Hono の入力検証 | `@hono/zod-validator`（週 約490万 DL、Zod 4 対応） |
| CSRF | SameSite Cookie + Origin / `Sec-Fetch-Site` の確認。Hono に `csrf()` が組み込み |

実務なら Better Auth を選ぶが、学習目的なので spec どおり自前で実装した。
spec の設計（トークンは Cookie に、DB にはその SHA-256、延長は期限内のみ）は、
Lucia の学習資料が示す現在の定石とそのまま一致していた。

## やったこと

| ファイル | 内容 |
|---|---|
| `apps/api/drizzle/0001_*.sql` | `sessions` テーブル（**`0000` は書き換えず追加**） |
| [apps/api/src/auth/session.ts](../../apps/api/src/auth/session.ts) | セッションの発行・検証・延長・破棄 |
| [apps/api/src/auth/password.ts](../../apps/api/src/auth/password.ts) | argon2 の照合（ダミー照合を含む） |
| [apps/api/src/middleware/auth.ts](../../apps/api/src/middleware/auth.ts) | Cookie の読み書き、`requireAuth` / `requireRole` |
| [apps/api/src/lib/validator.ts](../../apps/api/src/lib/validator.ts) | 入力検証と 400 の形の統一 |
| [apps/api/src/routes/auth.ts](../../apps/api/src/routes/auth.ts) | `login` / `logout` / `me` |
| [apps/api/src/routes/admin.ts](../../apps/api/src/routes/admin.ts) | `GET /api/admin/members`（旧 `/api/users` を admin 限定にして移動） |
| [apps/api/src/app.ts](../../apps/api/src/app.ts) | ルートの合成、`csrf()`、`onError` |
| [packages/shared/src/auth.ts](../../packages/shared/src/auth.ts) | ログインの入力スキーマ（STEP 05 のフォームでも使う） |
| `apps/api/src/db/schema.ts` | 返してよい項目を `publicUserColumns` に一元化 |

テストは 6 ファイル・34 件（認証・認可・CSRF で 21 件増）。

## なぜそうしたか

| 判断 | 採用案 | 対案と外した理由 |
|---|---|---|
| 認証の実装 | 自前（spec どおり） | Better Auth（主流）。実務なら第一候補だが、学ぶ対象が隠れる |
| トークンの保存 | Cookie に生のトークン、DB に SHA-256 | DB に生のトークン。DB が漏れるとログイン中のセッションを乗っ取られる |
| ログイン失敗の応答 | ステータス・メッセージ・**応答時間**を揃える | メッセージだけ揃える。応答時間からメールの存在が分かる（下記で実測） |
| ログイン時のセッション | 毎回新規発行し、前のセッションは破棄 | 既存の Cookie を使い回す。セッション固定攻撃が成立する |
| 期限の延長 | 残りが半分を切ったときだけ DB に書く | 毎リクエストで延長。読み取りだけの API でも毎回書き込みが発生する |
| CSRF | SameSite=Lax + `csrf()` | SameSite だけ。フォーム形式の送信には穴が残る。CSRF トークンは同一オリジン構成では過剰 |
| 期限の検証方法（テスト） | DB 側の期限を書き換える | 偽の時計（fake timers）。I/O を含むテストで扱いが面倒になる。コードは `Date.now()` と DB の値を比べるだけなので、どちらを動かしても等価 |
| 返す項目 | `publicUserColumns` に一元化 | ルートごとに列を並べる。`/me` と `/admin/members` の片方だけに機密列が混ざりうる |
| `/api/users` | `/api/admin/members` に移し admin 限定 | ログイン必須にするだけ。employee でも全員のメールアドレスが見える |
| 試行回数の制限 | 別 STEP（04b）に切り出す | 今回入れる。数える単位（開発時は proxy 経由で全員 127.0.0.1）と保存先の判断が要り、範囲が膨らむ |

## つまづき

| 事象 | 原因 | 解決 |
|---|---|---|
| テストでログアウトが 403 になった | 本文なしの POST は `Content-Type` が無く、`csrf()` はそれを `text/plain`（フォーム送信）とみなして Origin を確認する。testClient は Origin を付けない | **csrf 側は緩めず**、テストのリクエストに `Origin` を付けた（実際のブラウザは POST に必ず付ける） |
| 400 のレスポンスで `errors` の型が `{}` になった | `@hono/zod-validator` が `result.error` を `ZodError<スキーマの型>` で渡してくる。Zod の `ZodError<T>` の T は本来データの型 | `as z.ZodError<z.output<T>>` は TS2352 で拒否されたため、理由をコメントに書いて `as unknown as` で付け直した |
| dev サーバを止めても `:3000` が解放されなかった | `tsx watch` の子プロセス（API 本体）が残った | ポートを掴んでいるプロセスを個別に停止 |

### csrf() の判定箇所

`hono/dist/middleware/csrf/index.js` の 46 行目:

```js
isRequestedByFormElementRe.test(c.req.header("content-type") || "text/plain")
```

`Content-Type` が無ければ `text/plain` 扱い。本文なしの POST は別サイトからでもプリフライトなしで送れるので、これは正しい挙動。

## 気づき・学び

**型共有がルートの移動を安全にした。**
`/api/users` を `/api/admin/members` に移した瞬間、それを参照していたテストと web の画面が
**コンパイルエラーになった**。実行して 404 に気づくのではなく、書き換え漏れがすべて型で見つかる。
STEP 01 で型共有を最初に固めた効果が、ここで初めて実務的な形で出た。

**ミドルウェアが返すステータスは RPC の型に現れない。**
`/api/admin/members` の型に出るのは `status: 200` だけで、`requireAuth` / `requireRole` の 401・403 は出ない。
型を信じて 200 だけを想定すると、未ログインで画面が壊れる。web 側ではステータスを `number` で受けて分岐する。

**自動テストで確かめにくい性質は、壊して実測する。**
「応答時間を揃える」はテストにすると不安定になるので自動化していない。代わりに、ダミー照合を外した状態と比べて実測した。

| | パスワード違い | 存在しないメール |
|---|---|---|
| ダミー照合あり | 21ms | 19ms |
| **ダミー照合なし** | 22ms | **3.6ms** |

外すと約6倍の差がつき、10回測れば判別できる。対策の効果が数字で確認できた。

**安全側の既定をテストの都合で緩めない。**
ログアウトの 403 は、`csrf()` を外すかテストを直すかの二択だった。
`csrf()` の判定は正しく、テストが実際のブラウザの振る舞い（POST に Origin を付ける）を再現していなかっただけ。
テストが落ちたときは「どちらが現実に合っていないか」を先に確かめる。

**許可リストは「テスト」だけでなく「定義」も1か所に。**
STEP 03 ではテストを許可リスト方式にした。今回は返す項目が2か所に増えたので、
定義側も `publicUserColumns` に一元化した。テストで検知するより、混ざらない構造にする方が強い。

**主流を確認したら、既存の判断の裏付けにもなった。**
Lucia が非推奨になり「自前実装の学習資料」に転換したことは、
学習目的で自前実装を選んだ spec の判断が、今の流れにも沿っていることを示していた。

## 次への申し送り

- **STEP 05 のログインフォーム**は `@attendance/shared` の `loginInputSchema` で検証する。
  API の 400 は `{ message, errors: { email?: string[], password?: string[] } }` の形
- web から 401 / 403 を扱うときは、ステータスを `number` として受けてから分岐する（型に出ないため）
- **curl で本文なしの POST を試すときは `-H 'Origin: http://localhost:5173'` が必要**
- 管理者用の API は `routes/admin.ts` に足せば、自動的に admin 限定になる
- テストでログイン済みのリクエストを送るときは `withSession(token)`（Origin も付く）。
  レスポンスの型を絞るときは `assertStatus(res, 200)`
- 試行回数の制限は STEP 04b。spec の未決事項に `__Host-` プレフィックス、期限切れセッションの掃除を追加した
- dev サーバを止めたら、`:3000` と `:5173` が解放されたか確認する
