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
├── .gitignore                git に載せないもの
├── .claude/settings.json     Claude Code の権限とフック
│
├── apps/api/
│   ├── package.json          api の依存とスクリプト
│   └── tsconfig.json         base + Node 環境の設定
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
| ポート番号・proxy 先 | `apps/web/vite.config.ts` と `apps/api/src/index.ts` |
| ワークスペースを増やす | `pnpm-workspace.yaml` |

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

## 導入したバージョン（2026-09-20 時点）

| | |
|---|---|
| Node | 24.3.0 |
| pnpm | 12.4.2 |
| TypeScript | 7.0.2 |
| Hono / @hono/node-server | 4.13.8 / 2.1.1 |
| React / React DOM | 19.3.0 |
| Vite / @vitejs/plugin-react | 8.3.0 / 6.1.1 |
| Zod | 4.6.5 |
| Biome | 2.5.14 |
| tsx | 4.23.13 |
