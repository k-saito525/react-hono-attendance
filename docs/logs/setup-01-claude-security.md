# setup-01: Claude Code のセキュリティ設定

| | |
|---|---|
| 状態 | 完了 |
| 期間 | 2026-09-20 |

## 目的

このプロジェクトでは `.env` に Postgres の認証情報を置き、Docker で DB を動かす。
実装に入る前に、以下の2つを機械的に防げる状態にしておく。

- **認証情報の流出** — `.env` が読まれる / コミットされる
- **復旧不能な破壊** — DB ボリュームの削除、履歴の上書き、再帰削除

STEP 01 でコードを書き始める前にやるのは、事故が起きうる状態で作業を始めないため。

## やったこと

| ファイル | 役割 |
|---|---|
| [.claude/settings.json](../../.claude/settings.json) | `permissions.deny` と PreToolUse フックの登録 |
| [.claude/hooks/guard-bash.sh](../../.claude/hooks/guard-bash.sh) | 破壊的コマンドのブロック |
| [.claude/hooks/guard-git.sh](../../.claude/hooks/guard-git.sh) | 機密ファイルのコミット阻止 |
| [.gitignore](../../.gitignore) | `.env`・鍵ファイル・依存・ビルド成果物 |

ブロック対象（「標準」レベル）:

```
✖ rm -rf で / ~ $HOME 単独の * を対象にしたもの
✖ git push --force / -f          （--force-with-lease は通す）
✖ docker compose down -v
✖ docker volume rm / prune
✖ DROP DATABASE / DROP SCHEMA
✖ curl|wget をシェルにパイプ
✖ git add / stage で .env を対象にしたもの
✖ 機密ファイルがステージされた状態での commit

○ rm -rf node_modules       は通る
○ git reset --hard          は通る（厳格レベルの対象）
```

## なぜそうしたか

| 判断 | 採用案 | 対案と外した理由 |
|---|---|---|
| コマンド検査の方法 | PreToolUse フック | `permissions.deny` の Bash ルールは**前方一致**しか効かず、`cd /tmp && rm -rf /` を素通りさせる。フックは stdin でコマンド全文を受け取れる |
| `rm` の危険判定 | コマンドを**単語に分割**して `rm` のフラグと対象を追う | 正規表現一本。`rm -rf /` を止めつつ `rm -rf /path/to/project/dist` を通す条件が組み立てにくく、読めない式になった |
| フックの起動条件 | スクリプト内で `git` を含むか判定 | settings.json の `if: "Bash(git *)"`。`if` も前方一致なので `cd apps/api && git commit` を取りこぼす |
| 家の外のファイル保護 | `permissions.blockReadsOutsideWorkingDirectories: true` | `Read(~/.ssh/**)` のような個別 deny。`~` の展開仕様が不確かで、書いたのに効かない事故が起きやすい。作業ディレクトリ外を一括で塞ぐ方が確実 |
| ブロックの強度 | 標準（復旧不能なものだけ） | 厳格（`git reset --hard` や main への直接 push も禁止）。安全だが、git のやり直しで毎回手動作業が挟まる |

## つまづき

| 事象 | 原因 | 解決 |
|---|---|---|
| `git check-ignore -v .env` と `git rm --cached .env` が誤ブロックされた | 全 git コマンドに対して `.env` を含むだけで拒否していた | 判定を `git add` / `git stage` に限定した |
| 検証コマンド `echo "DROP DATABASE ..."` 自体がブロックされ、検証が走らなかった | フックが既に稼働しており、テスト文字列の中身まで検査された | フックが動いている証明にはなった。以降のテスト文字列は変数経由（`E='.env'`）で組み立てた |
| `Write(.env)` を deny に足そうとした | `Write(path)` はファイル権限チェックに**マッチしない**綴り | `Edit(path)` が Write / Edit / NotebookEdit すべてを指すと確認し、追加しなかった |

### 誤ブロックが循環していた件

最初の `guard-git.sh` は「コマンドに `.env` が含まれていたら拒否」という素朴な条件だった。
このとき拒否メッセージには
「`git rm --cached <ファイル>` でステージから外してください」と書いていたが、
**その復旧コマンド自体が同じルールでブロックされる**状態になっていた。

`git add` / `git stage` のみを対象にすることで、
`git rm --cached` `git check-ignore` `git log --` `git diff` は通るようになった。

## 気づき・学び

**ブロックルールは「ブロックされた後に自力で復旧できるか」で検証する。**
今回の最大の学び。禁止対象を広げると、たいてい**復旧手段も一緒に塞ぐ**。
「止めたいもの」だけを見て書くと、ユーザーが詰む経路を作ってしまう。
拒否メッセージに書いた手順が、そのルール下で実行可能かを毎回確かめるべき。

**効いていないのに効いているつもりが一番危ない。**
`Write(.env)` は書いても何にもマッチしない。構文エラーにもならず静かに無効になる。
セキュリティ設定は「書いた」ではなく「**効いていることを確かめた**」で完了とする。

**多層防御は「どの層がどこまで守るか」を言語化しておく。**

| | 効く範囲 | 抜け穴 |
|---|---|---|
| `.gitignore` | リポジトリを触る全員・全ツール | `git add -f` |
| フック | Claude の Bash 呼び出しのみ | 人間が手で打つ操作 |
| `permissions.deny` | Claude のファイルツール | Bash 経由の `cat` |

どれか1つでは穴が残る。逆に、重なっている部分を把握していないと
「二重にやったつもりで実は同じ層」ということが起きる。

**フックは実際に危険なコマンドを打たずに検証できる。**
stdin に `{"tool_name":"Bash","tool_input":{"command":"rm -rf /"}}` を流すだけでよい。
今回は許可21件・拒否ケースを含めて35ケースを流して確認した。
破壊的な処理を扱うコードほど、この「副作用なしで試せる形」を先に用意する価値が大きい。

**前方一致で足りるかを最初に疑う。**
`permissions` の Bash ルールも、フックの `if` も前方一致。
複合コマンド（`&&`、`;`、パイプ）が絡むと簡単に抜ける。
コマンド文字列を条件にするときは、常に「これは行頭からの一致で足りるか」を確認する。

## 次への申し送り

- `.env` の扱いは下の追記で変更した（編集可能にした）
- フックの確認・無効化は `/hooks` から行える
- 厳格レベル（`git reset --hard`、`git clean -fd`、main への直接 push の禁止）に
  上げたくなったら [guard-bash.sh](../../.claude/hooks/guard-bash.sh) にチェックを追加する
- `.claude/settings.local.json` は個人の上書き用として `.gitignore` 済み。
  一時的にルールを緩めたい場合はそちらに書く

---

# 追記: `.env` を編集可能にした（2026-09-20）

## 判断の変更

- **元の判断**: `.env` は Read も Edit も deny する。認証情報を書くファイルに Claude を触らせない
- **覆した理由**: 開発の手数が増える。`.env` を用意・更新するたびに手動作業が挟まり、
  STEP 02 以降のたびに止まることになる
- **新しい判断**: `.env` 系の deny をすべて外す。
  鍵・証明書（`*.pem` `*.key` `id_rsa` など）の deny と
  `blockReadsOutsideWorkingDirectories` は維持する

## 判明した仕様

**`Read(path)` の deny は書き込みも弾く。「書けるが読めない」状態は作れない。**

最初は `Edit(...)` の deny だけを外して Write を試したが、こう拒否された。

```
File is covered by a Read deny rule in your permission settings and cannot be written.
```

`Edit(path)` が Write / Edit / NotebookEdit を指す一方で、`Read(path)` の deny は
読み書き両方を塞ぐ。editable にするには Read の deny も外すしかない。

## 残っている防御

`.env` の中身は Claude のコンテキストに入るようになったが、
**git に入る経路は塞がれたまま**（いずれも設定後に動作確認済み）。

| 層 | 状態 |
|---|---|
| `.gitignore` | `.env` を無視する |
| `guard-git.sh` | `git add .env` を deny する |
| `permissions.deny` | 鍵・証明書ファイルは引き続き読み取り禁止 |

## 気づき

**セキュリティ設定は「全部締める」ではなく「どの経路を最後まで塞ぐか」で考える。**

`.env` を読めなくすること（コンテキストに入れない）と
`.env` をコミットさせないこと（履歴に永久に残さない）は、別の脅威への対策になっている。
被害が回復不能なのは後者で、前者を緩めても後者が残っていれば実害は大きく変わらない。

締めた数ではなく、**回復不能な経路が塞がっているか**で設定の良し悪しを判断する。
