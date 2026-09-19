# STEP 01: モノレポ基盤と疎通

| | |
|---|---|
| 状態 | 完了 |
| 期間 | 2026-09-20 |

## 目的

pnpm workspaces でモノレポを作り、**web から API を型付きで呼べる状態**まで通す。

勤怠の機能はまだ作らない。この STEP の価値は
「`hc<AppType>` による型共有が実際に機能すること」を最初に確定させる点にある。
今回の技術選定の主目的がそこなので、配線が通らないまま進むと後半の手戻りが大きい。

## やったこと

```
package.json / pnpm-workspace.yaml / tsconfig.base.json / biome.json
apps/api/      package.json, tsconfig.json, src/index.ts
apps/web/      package.json, tsconfig.json, vite.config.ts, index.html,
               src/main.tsx, src/App.tsx, src/lib/api.ts
packages/shared/ package.json, tsconfig.json, src/index.ts
```

各設定ファイルの役割は [config-files.md](../config-files.md) にまとめた。

## なぜそうしたか

| 判断 | 採用案 | 対案と外した理由 |
|---|---|---|
| tsconfig | `tsconfig.base.json` を各パッケージが extends | project references + `dist` 経由参照。型チェックは速いが、ビルド順序の管理が必要で変更が即反映されない |
| shared の参照 | `exports` で `src/index.ts` を直接指す | ビルド成果物を参照する方式。開発中に毎回ビルドが要る |
| dev 起動 | `concurrently` で同時起動 | Turborepo。3パッケージでは恩恵が薄く学習コストだけ増える |
| api の実行 | `tsx watch` で TS を直接実行 | ビルドしてから `node`。開発では不要な一手間 |
| lint / format | Biome | ESLint + Prettier。設定ファイルが増え、モノレポでは配線が煩雑 |
| shared の作成時期 | STEP 01 で配線だけ通す | STEP 06 で新設。その時点で `pnpm-workspace.yaml` / 各 `tsconfig` / `vite.config.ts` を同時に触ることになり、動かないときの切り分けが難しい |
| 型混入の防止 | `verbatimModuleSyntax: true` | 規約として「`import type` を使う」と決めるだけ。人間が守る前提になる |

## つまづき

| 事象 | 原因 | 解決 |
|---|---|---|
| `corepack enable pnpm` 後も pnpm が動かない | キャッシュに pnpm 12.4.2 の登録があるのに実体がない。`corepack prepare pnpm@latest --activate` でも復旧しなかった | `corepack disable pnpm` でシムを外し、`npm install -g pnpm` |
| `ERR_PNPM_IGNORED_BUILDS` | pnpm 10 以降、依存の `postinstall` はデフォルトで実行されない | `pnpm-workspace.yaml` の `allowBuilds` に `esbuild: true` |
| `biome.json` 自身が lint エラーになった | `biome init` はタブで生成するが、設定を space 2 に変えたため自分自身が違反した | `pnpm lint:fix` |
| ルートで `vite` / `tsx` が見つからない | ワークスペースの実行ファイルは各パッケージの `node_modules/.bin` にある | `pnpm -F <パッケージ> exec which <コマンド>` で確認する |

### corepack のエラー全文

```
Error: Cannot find module '/Users/cheek/.cache/node/corepack/v1/pnpm/12.4.2/bin/pnpm.cjs'
```

キャッシュディレクトリを削除して `corepack prepare` を再実行しても、
`Preparing pnpm@latest for immediate activation...` と表示されるだけで実体が作られなかった。
Node 24.3.0 同梱の corepack 0.33.0 の問題と判断し、深追いせず npm に切り替えた。

## 気づき・学び

**Hono の RPC はルートをメソッドチェーンで書かないと型が積み上がらない。**
最大のハマりどころ。

```ts
const app = new Hono()
app.get('/api/health', handler)      // ✖ 戻り値を捨てると AppType に反映されない

const app = new Hono().get('/api/health', handler)   // ○
```

`.get()` は「そのルート情報を型に積んだ新しい型」を返すので、
受け取らないと `typeof app` に現れない。
エラーにはならず**型が静かに欠ける**のが厄介なところ。

**型共有が効いていることは「壊して落ちること」で確認する。**
今回いちばんの学び。`pnpm typecheck` が通るだけでは、
型が `any` に落ちていても気づけない。実際にこう検証した。

```ts
const _narrowed: 'ok'   = data.status   // 型エラーなし → リテラル型まで推論されている
const _broken:  number  = data.service  // error TS2322 → string と推論されている
```

```
src/App.tsx(22,15): error TS2322: Type 'string' is not assignable to type 'number'.
```

「通ること」の確認は、**通らないはずのものが通らない**ことを見て初めて意味を持つ。
型システムやバリデーションの検証には常にこの形を使う。

**pnpm の postinstall 禁止は良い既定。**
`postinstall` は任意のコードを実行でき、サプライチェーン攻撃の主要な入口になっている。
デフォルト禁止 + 明示的な許可という設計は正しい。
`ERR_PNPM_IGNORED_BUILDS` が出たときに反射的に許可するのではなく、
**そのパッケージが postinstall で何をするか確認する**習慣をつける。

**規約は型チェックに落とせるなら落とす。**
「`AppType` は `import type` で読むこと」は規約として書いても守られないことがある。
`verbatimModuleSyntax: true` を入れれば、値として import した時点でコンパイルエラーになる。
人間の注意力に頼る箇所を、機械が落とす箇所に置き換えられないかを常に考える。

**TypeScript 7 系（Go による書き直し）が入った。**
`pnpm add typescript` で 7.0.2 が入った。今回の範囲では 5 系との差は出ていない。
挙動の違いが出たら 5 系に固定する。

## 次への申し送り

- **dev サーバの起動方法**: `pnpm dev` で api (`:3000`) と web (`:5173`) が同時に立つ。
  ブラウザは `http://localhost:5173`
- STEP 02 で Drizzle と Postgres を入れる。`.env` は作成可能（setup-01 の追記を参照）
- ルートを追加するときは**必ずチェーンで繋ぐ**。
  分割するときは `app.route('/api/xxx', xxxRoutes)` で合成する
- `packages/shared` には現在 `healthSchema` しかない。STEP 06 で状態機械に置き換わる
- `apps/web` のスタイルはインラインの仮置き。STEP 05 で画面を作るときに方針を決める
