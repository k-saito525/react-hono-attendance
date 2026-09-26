# STEP 02: DB 基盤

| | |
|---|---|
| 状態 | 完了 |
| 期間 | 2026-09-20 〜 2026-09-27 |

## 目的

Docker で Postgres を動かし、Drizzle でスキーマ・マイグレーション・seed を整える。
API から DB を読んでブラウザに表示できるところまで通す。

認証（STEP 04）も打刻（STEP 07）も DB が前提なので、ここを先に固める。
対象テーブルは `users` と `work_schedules` の2つだけで、他のテーブルは必要になった STEP で足す。

## やったこと

| ファイル | 内容 |
|---|---|
| [docker-compose.yml](../../docker-compose.yml) | Postgres 18（ホスト側 5433） |
| [.env.example](../../.env.example) | `DATABASE_URL` と `PORT` の雛形 |
| [apps/api/src/env.ts](../../apps/api/src/env.ts) | `.env` の読み込みと Zod による起動時検証 |
| [apps/api/src/db/schema.ts](../../apps/api/src/db/schema.ts) | `users` / `work_schedules` |
| [apps/api/src/db/client.ts](../../apps/api/src/db/client.ts) | 接続プール |
| [apps/api/drizzle.config.ts](../../apps/api/drizzle.config.ts) | drizzle-kit の設定 |
| `apps/api/drizzle/0000_*.sql` | 生成したマイグレーション（`CREATE EXTENSION citext` を手で追記） |
| [apps/api/src/db/seed.ts](../../apps/api/src/db/seed.ts) | admin 2人 + employee 2人 + 各勤務体系 |
| [apps/api/src/index.ts](../../apps/api/src/index.ts) | `GET /api/users` を追加 |
| [packages/shared/src/index.ts](../../packages/shared/src/index.ts) | `Role` 型を追加（web と api で共有） |

設定ファイルの解説は [config-files.md](../config-files.md) に追記した。

## なぜそうしたか

| 判断 | 採用案 | 対案と外した理由 |
|---|---|---|
| DB ドライバ | node-postgres (`pg`) | postgres.js。高速でモダンだが、詰まったときの情報量で劣る |
| マイグレーション | `generate` → SQL をレビュー → `migrate` | `push`。スキーマを直接反映するので速いが、履歴がファイルに残らない |
| 主キー | **UUID v7**（`uuidv7()`） | 連番は URL に出たとき件数が推測される。v4 はランダムで B-tree の挿入が散らばる（下記「判断の変更」） |
| `role` の型 | `text` + `CHECK` 制約 | Postgres の `enum`。DB で値を保証できるが、値の追加・削除が硬い。TS 側は `$type<Role>()` で union 型にできるので安全性は同等 |
| `email` の型 | `citext` | `text` + `lower(email)` の一意インデックス。拡張に依存しない利点はあるが、検索のたびに `lower()` を書く必要があり、書き忘れが重複登録を許す |
| 時刻の型 | 絶対時刻は `timestamptz`、暦日は `date`、所定始業は `time` | すべて `timestamptz`。所定始業は「特定の瞬間」ではなく「毎日の9時」なので、日付を持たせると意味がずれる |
| `ON DELETE` | `user_id` は CASCADE、`created_by` は NO ACTION | 両方 CASCADE。`created_by` は監査情報で、管理者が消えても「誰が設定したか」は残す必要がある |
| パスワードハッシュ | `@node-rs/argon2`（argon2id） | `argon2` パッケージ。ネイティブビルド（node-gyp）が必要で環境依存のトラブルが起きやすい。`@node-rs/argon2` はビルド済みバイナリで配布される |
| `.env` の読み込み | Node 標準の `process.loadEnvFile()` | `dotenv`。依存が1つ増えるだけで得るものがない |
| 環境変数の検証 | 起動時に Zod で検証 | 検証しない。`DATABASE_URL` の設定漏れに DB 接続の瞬間まで気づけない |
| seed | 冪等（`onConflictDoNothing`） | 毎回 TRUNCATE してから入れる。開発中に作ったデータまで消える |
| API のレスポンス | 返す列を明示して select | テーブル全体を select。`password_hash` がレスポンスに載る。「除外し忘れ」は気づけないが「含め忘れ」は気づける |

## 判断の変更: 主キーを UUID v4 から v7 へ

- **元の判断**: `defaultRandom()`（= `gen_random_uuid()`、UUID v4）
- **覆した理由**: DB 設計の根拠を説明する中で、v4 を選んだ理由を説明できなかった。
  Postgres 18 を採用している以上 `uuidv7()` が組み込みで使え、
  v4 の欠点（ランダムなので B-tree の挿入位置が散らばる）を解消できる。検討不足だった
- **新しい判断**: 全テーブルの主キーを `uuidv7()` にする

### マイグレーションを「追加」ではなく「作り直し」にした理由

通常、適用済みのマイグレーションを修正するときは新しいマイグレーション（`0001`）を足す。
今回は `0000` を削除して生成し直した。

- STEP 02 は**まだ一度もコミットしていなかった**（他の環境に `0000` が存在しない）
- DB の中身は seed の4件だけで、作り直しても失うものがない
- 「初期マイグレーション + それを直すマイグレーション」を履歴に残すのはノイズになる

**一度でも push したマイグレーションは書き換えない。** 他の環境で適用済みの可能性があり、
書き換えると DB の状態とマイグレーション履歴が食い違う。今回はその条件に当たらなかった。

## つまづき

| 事象 | 原因 | 解決 |
|---|---|---|
| `Bind for 0.0.0.0:5432 failed: port is already allocated` | 別プロジェクトの Postgres（`task-board-app-db-1`）が 5432 を使っていた | ホスト側のポートを 5433 にずらした。**他プロジェクトのコンテナは止めていない** |
| コンテナが起動直後に `Exited (1)` で終了した | Postgres 18 からボリュームのマウント先の規約が変わった | マウント先を `/var/lib/postgresql/data` から `/var/lib/postgresql` に変更 |
| `citext` 型のテーブルが作れない（はずだった） | drizzle-kit は型が拡張に依存していることを知らず、`CREATE EXTENSION` を生成しない | 生成 SQL をレビューした段階で気づき、手で先頭に追加した |
| Biome が `drizzle/meta/*.json` の書式を指摘した | drizzle-kit の生成物が Biome の整形規則と合わない | `biome.json` の `files.includes` で `apps/api/drizzle` を除外 |
| 除外設定に警告が出た（`useBiomeIgnoreFolder`） | Biome 2.2 以降、フォルダの除外に末尾の `/**` は不要 | `!apps/api/drizzle/**` を `!apps/api/drizzle` に修正 |
| コミット用のコマンドが `guard-git.sh` にブロックされた | 確認用の `echo` の文言に ` .env ` が含まれ、同じコマンド内の `git add` と合わせて検知された。フックはコマンド全文を見るため、文字列リテラルも対象になる | 文言を変えて再実行。誤検知だが全文検査の性質上避けられないので許容する |

### Postgres 18 のボリュームの件

ログの該当箇所:

```
Counter to that, there appears to be PostgreSQL data in:
  /var/lib/postgresql/data (unused mount/volume)
...
The suggested container configuration for 18+ is to place a single mount
at /var/lib/postgresql which will then place PostgreSQL data in a
subdirectory, allowing usage of "pg_upgrade --link" without mount point
boundary issues.
```

最初に考えた解決は「ボリュームを消して作り直す」だったが、
`docker volume rm` は setup-01 で入れた `guard-bash.sh` がブロックする操作だった。
そこで**そもそも消す必要があるのか**を確かめる方に切り替え、
使い捨てのコンテナでボリュームの中身を覗いたところ空だった。
空ならマウント先を変えるだけで済み、何も消さずに解決した。

## 気づき・学び

**生成物は必ず読む。ツールが知り得ないことがある。**
drizzle-kit は `citext` という型名は出力するが、それが拡張機能であることは知らない。
生成された SQL を読まずに `migrate` していれば、エラーで初めて気づいていた。
「TS を正として SQL を生成する」方針は、**生成物のレビューとセットで**初めて成立する。

**時刻は3つの概念に分けて型を選ぶ。**
絶対時刻（`timestamptz`）・暦日（`date`）・壁時計の時刻（`time`）は別物。
`timestamptz` は名前に反してタイムゾーンを保存しない（UTC の絶対時刻を保存し、表示時に変換する）。
「日時っぽいから timestamp」で選ぶと、所定始業のような「毎日の9時」を表現できなくなる。

**同じテーブルを参照する外部キーでも、意味が違えば挙動を変える。**
`work_schedules.user_id` と `created_by` はどちらも `users.id` を指すが、
前者は従属（本人が消えれば不要）、後者は監査（設定者が消えても残す）。
外部キーを貼るときは「参照先が消えたらこの行はどうあるべきか」を毎回問う。

**「期待通りでないケース」を見て検証する。**
STEP 01 の「型を壊して落ちるか」と同じ考え方で、今回もこう確かめた。

| 検証したいこと | やったこと |
|---|---|
| citext が効いているか | `SATO@EXAMPLE.COM`（大文字）で検索して見つかるか |
| seed が冪等か | 2回流して件数が変わらないか |
| パスワードが漏れないか | レスポンスに `passwordHash` キーが**無い**ことを確認 |
| UUID v7 になっているか | ID の並びと作成順が一致するか |
| argon2id か | ハッシュの先頭が `$argon2id$` か |

「動いた」だけでは、たまたま動いている可能性を排除できない。

**pnpm の依存隔離がさっそく効いた。**
`shared` は `zod` に依存しているが、`api` から `zod` を直接 import するには
`api` 自身の `package.json` にも書く必要がある。npm なら巻き上げで動いてしまうところ。

**安全装置は「雑な解決」も止める。**
ボリュームの件で、自分で入れたフックが最初の解決策（消して作り直す）を封じた。
結果として「本当に消す必要があるか」を確かめることになり、より小さな変更で済んだ。

## 次への申し送り

- **`GET /api/users` は認証なしで全員分を返している。** STEP 04 で `requireAuth` を必ず付ける
- DB のホスト側ポートは **5433**。接続情報は `.env` の `DATABASE_URL`
- seed のログインパスワードは全員 `password123`（開発専用）
- マイグレーション履歴は Postgres の `drizzle.__drizzle_migrations` テーブルにある
- **push 済みのマイグレーションは書き換えない。** 修正は新しいマイグレーションを足す
- STEP 03（テスト基盤）で、テスト用の DB をどう用意するか決める必要がある
  （同じコンテナに別データベースを作る案が有力）
- `getScheduleFor()` は STEP 09 で実装する。`work_schedules` の構造は整っている
- `apps/web/src/App.tsx` はユーザー一覧を表示する仮画面。STEP 05 で置き換える
