# 設定ファイルの役割

どのファイルが何を決めているかの一覧。
設定を変えたいときに「どこを触ればいいか」を引くためのページ。

## 全体像

```
react-hono-attendance/
├── package.json              ルート。スクリプトの入口と共通の開発ツール
├── pnpm-workspace.yaml       どのディレクトリをワークスペースとして扱うか
├── tsconfig.base.json        TypeScript の共通設定（3パッケージが継承）
├── biome.json                lint と format
├── docker-compose.yml        開発用 Postgres のコンテナ定義
├── .env.example              環境変数の雛形（.env はこれをコピーして作る）
├── .gitignore                git に載せないもの
├── .claude/settings.json     Claude Code の権限とフック
│
├── apps/api/
│   ├── package.json          api の依存とスクリプト
│   ├── tsconfig.json         base + Node 環境の設定
│   ├── drizzle.config.ts     マイグレーションの生成・適用の設定
│   └── drizzle/              生成されたマイグレーション SQL（コミット対象・lint 対象外）
├── apps/web/
│   ├── package.json          web の依存とスクリプト
│   ├── tsconfig.json         base + ブラウザ環境 + JSX の設定
│   └── vite.config.ts        開発サーバ・ビルド・proxy
└── packages/shared/
    ├── package.json          shared の依存
    └── tsconfig.json         base をそのまま継承
```

| 変えたいこと | 触るファイル |
|---|---|
| コマンドを追加したい | ルートの `package.json` の `scripts` |
| ライブラリを追加したい | `pnpm -F <パッケージ名> add <ライブラリ>` |
| 型チェックの厳しさ | `tsconfig.base.json` |
| インデントやクォート | `biome.json` |
| ポート番号・proxy 先 | `.env` の `PORT` と `apps/web/vite.config.ts` |
| ワークスペースを増やす | `pnpm-workspace.yaml` |
| DB の接続先・ポート | `.env` の `DATABASE_URL` と `docker-compose.yml` の `ports`（両方揃える） |
| テーブルを追加・変更したい | `apps/api/src/db/schema.ts` → `db:generate` → 生成 SQL を確認 → `db:migrate` |
| 環境変数を追加したい | `.env.example` と `apps/api/src/env.ts` のスキーマ（両方） |

## ルートの `package.json`

モノレポ全体の入口。**アプリのコードは持たず、コマンドと開発ツールだけを置く。**

```json
"private": true          npm に公開しない宣言。誤 publish を防ぐ
"type": "module"         配下の .js を ESM として解釈する
"packageManager"         使う pnpm のバージョンを固定。別マシンでも揃う
"engines": { "node" }    必要な Node バージョン。古い環境で警告が出る
```

### scripts で使う pnpm のフラグ

| フラグ | 意味 |
|---|---|
| `-F` (`--filter`) | そのワークスペースだけで実行。`pnpm -F @attendance/api dev` |
| `-r` (`--recursive`) | 全ワークスペースで再帰実行。`pnpm -r typecheck` |

`dev` は `concurrently` で api と web を同時に起動する。
`-n api,web` がログの接頭辞、`-c cyan,magenta` が色で、
2つのプロセスの出力が混ざったときに見分けるためのもの。

## `pnpm-workspace.yaml`

**どのディレクトリをワークスペース（= 1つのパッケージ）として扱うか**を宣言する。
ここに書いたパッケージ同士は `workspace:*` で参照し合える。

```yaml
packages:
  - "apps/*"
  - "packages/*"

allowBuilds:
  esbuild: true
```

### `allowBuilds` が必要な理由

pnpm 10 以降、依存パッケージの `postinstall` スクリプトは**デフォルトで実行されない**。
`postinstall` は任意のコードを実行できるため、サプライチェーン攻撃の主要な入口になっている。
信頼するものだけを明示的に許可する方式。

`esbuild` は Vite と tsx が内部で使うバンドラで、
プラットフォーム別のネイティブバイナリを postinstall で配置する。
許可しないと `vite` も `tsx` も起動しない。

新しいライブラリを入れて `ERR_PNPM_IGNORED_BUILDS` が出たら、
**そのパッケージが postinstall で何をするか確認してから**ここに追加する。

## `tsconfig.base.json`

3つのパッケージが `extends` する共通設定。
各パッケージの `tsconfig.json` は、これを継承して環境差分だけを足す。

### 意図のある設定

| オプション | 効果 | なぜ入れたか |
|---|---|---|
| `verbatimModuleSyntax` | 型だけの import は `import type` と書かないとエラー | web が api の `AppType` を参照するため。値として import すると **API のコードが web のバンドルに混入する**。規約ではなく型チェックで防ぐ |
| `noUncheckedIndexedAccess` | `arr[0]` の型が `T \| undefined` になる | 打刻の配列を大量に扱うので、「空配列の先頭を見て落ちる」事故を型で潰す |
| `moduleResolution: "bundler"` | 拡張子なしの import が書ける | Vite と tsx が解決する前提 |
| `noEmit` | tsc は型チェック専用 | 実際の変換は Vite と tsx がやる |
| `isolatedModules` | ファイル単位で変換可能であることを保証 | Vite / esbuild の動作前提 |
| `skipLibCheck` | `node_modules` の型定義を検査しない | 型チェックが大幅に速くなる |

### なぜ `tsconfig.json` が4つあるのか

環境が違うため。api は Node、web はブラウザ + JSX、shared はどちらでもない。

```
tsconfig.base.json            共通の厳しさ・モジュール解決
├── apps/api/tsconfig.json    + types: ["node"]
├── apps/web/tsconfig.json    + lib: DOM, jsx: react-jsx, types: ["vite/client"]
└── packages/shared/…         差分なし（base をそのまま）
```

## 各ワークスペースの `package.json`

### `exports` が `src` を直接指している

```json
"exports": { ".": "./src/index.ts" }
```

通常はビルド成果物（`dist/index.js`）を指すところを、**TypeScript のソースを直接**指している。
Vite と tsx は TS をそのまま解決できるので、これで**開発中にビルドが不要**になる。

ビルド成果物を経由する方式（project references）も選べるが、
ビルド順序の管理が必要になり、変更が即座に反映されない。この規模では割に合わない。

### `workspace:*`

```json
"@attendance/shared": "workspace:*"
```

npm レジストリではなく**同じリポジトリ内のパッケージ**を参照する pnpm の記法。
`pnpm install` すると `node_modules` にシンボリックリンクが張られる。

```
apps/web/node_modules/@attendance/shared -> ../../../../packages/shared
```

`packages/shared` を編集すれば api と web に即座に反映される。

### api が web の `devDependencies` にある理由

web が使うのは型 (`AppType`) だけで、**実行時には不要**だから。
`dependencies` に置くと「実行時に必要」という誤ったシグナルになる。

## `biome.json`

lint と format を1つのツール・1つの設定ファイルで担当する。
ESLint + Prettier なら設定が2つに分かれるところ。

```json
"vcs": { "useIgnoreFile": true }   .gitignore を尊重する
"formatter": { "indentStyle": "space", "indentWidth": 2, "lineWidth": 100 }
"javascript": { "formatter": { "quoteStyle": "single", "semicolons": "asNeeded" } }
"assist": { "actions": { "source": { "organizeImports": "on" } } }
```

`organizeImports` は import の並び順を自動整列する。
`pnpm lint:fix` で適用される（手で並べ替える必要はない）。

### 生成物は対象から外す

```json
"files": { "includes": ["**", "!apps/api/drizzle"] }
```

`apps/api/drizzle/` は drizzle-kit が生成するマイグレーションで、Biome の書式とは合わない。
整形してしまうと `db:generate` のたびに差分が出て揉めるため、対象外にしている。
「人が書くもの」と「ツールが書くもの」は lint の対象を分ける。

Biome 2.2 以降、フォルダの除外は末尾の `/**` なしで書く（`!apps/api/drizzle`）。
`/**` を付けると警告が出る。

| コマンド | 内容 |
|---|---|
| `pnpm lint` | 検査のみ。CI ではこれ |
| `pnpm lint:fix` | 自動修正（import 整列を含む） |
| `pnpm format` | 整形のみ |

## `apps/web/vite.config.ts`

開発サーバとビルドの設定。**このプロジェクトで最も重要な設定は proxy。**

```ts
server: {
  port: 5173,
  proxy: {
    '/api': { target: 'http://localhost:3000', changeOrigin: false },
  },
}
```

web（`:5173`）に来た `/api` へのリクエストを api（`:3000`）へ転送する。
これによりブラウザから見ると **web と api が同一オリジン**になる。

別オリジンのままだと `SameSite=Lax` の Cookie が送信されず、
CORS 設定と CSRF トークンが芋づる式に必要になる。
詳細は [spec.md の「オリジン方針」](spec.md) を参照。

## `docker-compose.yml`

開発用の Postgres をコンテナで動かす定義。

| 設定 | 値 | 理由 |
|---|---|---|
| `image` | `postgres:18-alpine` | `uuidv7()` が組み込みで使える最初のメジャーバージョン |
| `ports` | `5433:5432` | ホスト側を 5433 にずらしている。**別プロジェクトの Postgres が 5432 を使っていたため**。左がホスト、右がコンテナ |
| `volumes` | `pgdata:/var/lib/postgresql` | **Postgres 18 からマウント先が変わった**（下記） |
| `TZ` / `PGTZ` | `UTC` | DB は UTC で保存し、JST 変換は表示側の責務にする |
| `healthcheck` | `pg_isready` | 「コンテナが起動した」と「接続を受け付けられる」は別。初期化中に接続すると失敗する |

### Postgres 18 のボリューム規約

17 以前は `/var/lib/postgresql/data` にマウントするのが慣習だったが、
18 からは **`/var/lib/postgresql` にマウントする**。
内部でバージョン別のサブディレクトリ（`18/docker`）にデータを作ることで、
メジャーアップグレード時の `pg_upgrade --link` がマウント境界をまたがずに済む。

旧来の書き方のままだと、コンテナは起動直後に終了する（ログに理由が出る）。

### ボリュームを消さないこと

`pgdata` は名前付きボリュームで、コンテナを作り直してもデータが残る。
`docker compose down -v` はボリュームごと消すため、`.claude/hooks/guard-bash.sh` でブロックしている。
コンテナを止めるだけなら `-v` なしの `docker compose down`。

## `.env.example`

環境変数の**雛形**。キーの一覧と開発用の値を共有する。

```bash
cp .env.example .env
```

`.env` は `.gitignore` 済みでコミットされない。**キーを増やしたら雛形の側も更新する**。
更新し忘れると、他の環境で「何を設定すればいいか」が伝わらなくなる。

値の検証は `apps/api/src/env.ts` が起動時に Zod で行う。
`DATABASE_URL` が空なら、DB に接続しようとした瞬間ではなく**起動した瞬間に**落ちる。

## `apps/api/drizzle.config.ts`

drizzle-kit（マイグレーションの生成・適用ツール）の設定。

```ts
schema: './src/db/schema.ts',   // 正はこの TS ファイル
out: './drizzle',               // 生成された SQL の置き場
casing: 'snake_case',           // TS の camelCase を DB の snake_case に対応づける
```

### 運用: `generate` → レビュー → `migrate`

| コマンド | 内容 |
|---|---|
| `pnpm -F @attendance/api db:generate` | `schema.ts` の差分から SQL を生成する |
| `pnpm -F @attendance/api db:migrate` | 未適用の SQL を DB に流す |
| `pnpm -F @attendance/api db:seed` | 開発用データを入れる（何度流しても同じ結果） |
| `pnpm -F @attendance/api db:studio` | ブラウザで DB の中身を見る |

`push`（スキーマを DB へ直接反映）は使わない。履歴がファイルとして残らないため。

**生成された SQL は必ず目で確認する。** drizzle-kit が知り得ないことがあるため。
実際に `citext` 型を使ったとき、`CREATE EXTENSION citext` は生成されず、手で足している。

## `.gitignore`

git に載せないものの指定。**セキュリティ目的の行とリポジトリ衛生の行が混在している。**

| 区分 | 対象 | 理由 |
|---|---|---|
| セキュリティ | `.env`、`*.pem`、`*.key`、`id_rsa` | 認証情報。**一度コミットすると履歴から消すのが極めて困難** |
| 衛生 | `node_modules/`、`dist/`、`coverage/` | 生成物。リポジトリを膨らませるだけ |
| ツール | `.claude/settings.local.json` | 個人設定。共有しない |

注意点が2つある。

- **既に追跡済みのファイルには無力**。一度コミットした `.env` を後から ignore しても意味がなく、`git rm --cached` と履歴の書き換えが必要になる
- `!` による除外解除は、**親ディレクトリごと除外されている場合は効かない**

## `.claude/settings.json`

Claude Code の権限とフック。詳細は
[setup-01 の作業ログ](logs/setup-01-claude-security.md) を参照。

| 設定 | 内容 |
|---|---|
| `permissions.deny` | 鍵・証明書ファイルの読み取り禁止 |
| `permissions.blockReadsOutsideWorkingDirectories` | 作業ディレクトリ外の読み取り禁止 |
| `hooks.PreToolUse` | 破壊的コマンドと機密ファイルのコミットをブロック |

`/hooks` で一覧・無効化ができる。
一時的に緩めたい場合は `.claude/settings.local.json`（gitignore 済み）に書く。

## 導入したバージョン

| | | 導入 |
|---|---|---|
| Node | 24.3.0 | STEP 01 |
| pnpm | 12.4.2 | STEP 01 |
| TypeScript | 7.0.2 | STEP 01 |
| Hono / @hono/node-server | 4.13.8 / 2.1.1 | STEP 01 |
| React / React DOM | 19.3.0 | STEP 01 |
| Vite / @vitejs/plugin-react | 8.3.0 / 6.1.1 | STEP 01 |
| Zod | 4.6.5 | STEP 01 |
| Biome | 2.5.14 | STEP 01 |
| tsx | 4.23.13 | STEP 01 |
| PostgreSQL | 18.6 | STEP 02 |
| drizzle-orm / drizzle-kit | 0.45.2 / 0.31.10 | STEP 02 |
| pg (node-postgres) | 8.23.0 | STEP 02 |
| @node-rs/argon2 | 2.2.1 | STEP 02 |
