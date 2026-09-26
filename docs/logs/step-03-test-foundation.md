# STEP 03: テスト基盤

| | |
|---|---|
| 状態 | 完了 |
| 期間 | 2026-09-27 |

## 目的

3パッケージでテストを書いて走らせられる状態を作り、GitHub Actions で自動実行する。

STEP 04 以降は機能ごとにテストを書いていくので、その前に
「テストが信用できる状態」を作っておく。特に api のテストは DB を作り直すため、
**開発用 DB を誤って消さない仕組み**をこの時点で入れる必要があった。

## やったこと

| ファイル | 内容 |
|---|---|
| [vitest.config.ts](../../vitest.config.ts) | 各パッケージをプロジェクトとして束ねる |
| [apps/api/src/app.ts](../../apps/api/src/app.ts) | `index.ts` からアプリ定義を分離（テストと web はこちらを import） |
| [apps/api/vitest.config.ts](../../apps/api/vitest.config.ts) | テスト用 DB の準備、直列実行 |
| [apps/api/test/db-guard.ts](../../apps/api/test/db-guard.ts) | `_test` で終わらない DB を拒否する安全装置 |
| [apps/api/test/global-setup.ts](../../apps/api/test/global-setup.ts) | テスト用 DB を DROP → CREATE → マイグレーション |
| [apps/api/test/setup.ts](../../apps/api/test/setup.ts) | 各テストの前に全テーブルを TRUNCATE |
| [apps/api/test/factories.ts](../../apps/api/test/factories.ts) | テストデータの生成 |
| [apps/api/src/app.test.ts](../../apps/api/src/app.test.ts) | health / users のテスト |
| [apps/api/test/infra.test.ts](../../apps/api/test/infra.test.ts) | テスト基盤そのもののテスト |
| `packages/shared`・`apps/web` | Vitest の設定とスモークテスト |
| [.github/workflows/ci.yml](../../.github/workflows/ci.yml) | lint / typecheck / test |

テストは 4 ファイル・13 件。CI は初回で green（38 秒）。

あわせて CLAUDE.md に「選択肢は現在の主流を踏まえ、このプロジェクトに最も合うものを推奨にする」
ルールを追加した（ユーザーの指示による）。

## なぜそうしたか

| 判断 | 採用案 | 対案と外した理由 |
|---|---|---|
| テスト用 DB | 既存コンテナ内に別 DB（`attendance_test`） | **Testcontainers** は統合テストで広く使われており、開発用 DB と物理的に分離できる。ただ起動に毎回数秒かかり依存も増える。今回は安全装置で分離を担保できるので、追加ツールなしを優先した。**PGlite** は Docker 不要で速いが、本番の Postgres 18 とバージョンや拡張（`uuidv7()` / `citext`）の対応が一致する保証がない |
| テスト間の隔離 | 各テスト前に TRUNCATE | トランザクションのロールバック。速いが、db をハンドラに注入する仕組みが要り、STEP 13 の承認処理のようにコード自身がトランザクションを使うと SAVEPOINT の入れ子になる |
| テスト用 DB の作り直し | テスト開始時に毎回 DROP → CREATE → マイグレーション | 一度作った DB を使い回す。速いが、マイグレーションがまっさらな DB に適用されることを毎回確かめられない |
| 接続先の差し替え | Vitest の `test.env` で `DATABASE_URL` を上書き | アプリのコードで「テスト中ならテスト用 DB」と分岐する。アプリがテストランナーを知ることになる |
| API のテスト | `hono/testing` の `testClient` | supertest などで HTTP 越しに叩く。サーバの起動が要り、型も付かない |
| 機密列の回帰テスト | 返す項目を**許可リスト**で固定 | 「`passwordHash` が無いこと」を確認する。別の機密列が増えたときに素通りする |
| web のテスト | Testing Library + jsdom。MSW は STEP 05 | MSW を今入れる。モックする対象が仮画面しかない |
| DOM 環境 | jsdom | happy-dom。速いが、互換性の情報量は jsdom が多い |
| CI の権限 | `permissions: contents: read` | 既定のまま。書き込み権限を持ったワークフローは、依存が乗っ取られたときの被害が大きい |

## つまづき

| 事象 | 原因 | 解決 |
|---|---|---|
| Vitest の起動時に `configLoader: 'native'` の警告 | Vite の設定読み込みが将来ネイティブ方式になり、相対 import に拡張子を求める | 設定ファイルの import だけ `.ts` を付け、`tsconfig.base.json` に `allowImportingTsExtensions` を追加 |
| CI の結果待ちスクリプトが即座に失敗した | シェルが zsh で、`status` が読み取り専用の予約変数だった。CI 自体の失敗ではない | 変数名を `run_state` に変えた |

### 記憶で書かずに確かめて正解だったこと

GitHub Actions のバージョンを書く前に各リポジトリの最新リリースを API で確認したところ、
`actions/checkout@v7` / `actions/setup-node@v7` / `pnpm/action-setup@v6` だった。
記憶のまま書いていたら v5 / v4 を指定していた。

## 気づき・学び

**安全装置は「どの経路を見ているか」まで確かめる。**
setup-01 のフックは Claude が打つコマンドしか見ていない。
`pnpm test` の中で実行される `DROP DATABASE` は、フックからは見えない。
「安全装置がある」ではなく「**その装置はこの経路を見ているか**」を毎回問う。

**同じ安全確認でも、入口が2つあれば2か所で確かめる。**
テスト用 DB の作り直し（`TEST_DATABASE_URL`）と TRUNCATE（アプリの `DATABASE_URL`）は、
接続先を別の経路で決めている。片方だけ確認すると、
「正しい DB を作り直して、間違った DB を空にする」という事故が起こりうる。

**ライブラリの挙動は推測せずに確かめる。**
`process.loadEnvFile()` が既存の環境変数を上書きするかどうかで設計が変わるため、
小さなスクリプトで実際に確かめてから設計した（上書きしない）。
Hono の `hc` が `fetch` をいつ参照するか（import 時か呼び出し時か）も不明だったが、
テストで `vi.stubGlobal('fetch', ...)` が効いたことで、呼び出し時に参照していると確認できた。

**否定形のテストより許可リストのテスト。**
「`passwordHash` を含まない」は、今わかっている危険しか防げない。
「返す項目はこの5つだけ」なら、将来の未知の漏洩も落とせる。
実際に API へ `passwordHash` を足してみたところ、差分に `+ "passwordHash"` と出て原因が一目で分かった。

**テストは「壊して落ちる」ところまで見て完成。**
STEP 01 の型、STEP 02 の seed と同じく、今回も次の2点を実際に壊して確かめた。

| 壊したもの | 結果 |
|---|---|
| `TEST_DATABASE_URL` を開発用 DB に向けた | 設定の読み込み時点で起動を拒否。開発用 DB は 4 件のまま |
| API のレスポンスに `passwordHash` を足した | 回帰テストが失敗し、漏れたキーが差分に出た |

**知識の鮮度を疑う。**
Action のバージョンのように「よく書くもの」ほど記憶で書きがちで、古くなっていることに気づきにくい。
書く前に一次情報で確かめるのを習慣にする（CLAUDE.md の推奨ルールにも反映した）。

## 次への申し送り

- **MSW は STEP 05 で導入する。** 現在の web のテストは `fetch` を手で差し替えている暫定措置で、
  URL やメソッドを区別できない
- **`/api/users` に項目を増やすときは、`app.test.ts` の許可リストも意図して更新する**
- DB を使うテストはファイル間で直列に走る。テストが増えて遅くなったら、
  ワーカーごとに DB を分ける方式を検討する
- テストデータは `test/factories.ts` の `createUser()` で作る。
  seed は流用しない（seed の変更で無関係なテストが壊れるため）
- テスト前に `docker compose up -d` が必要（CI は `services` で自動）
- STEP 04 で `requireAuth` を入れたら、`/api/users` のテストに「未ログインなら 401」を追加する
