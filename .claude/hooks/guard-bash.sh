#!/usr/bin/env bash
# PreToolUse / Bash — 復旧不能な操作をブロックする。
#
# permissions.deny の Bash ルールは「前方一致」しか効かないため、
#     cd /tmp && rm -rf /
# のような複合コマンドを止められない。このフックは stdin でコマンド全文を
# 受け取るので、中身を検査できる。
#
# 方針: 通常の開発作業（rm -rf node_modules など）は通し、
#       復旧不能なものだけを止める。

set -uo pipefail

cmd=$(jq -r '.tool_input.command // ""')

deny() {
  jq -n --arg r "$1" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: $r
    }
  }'
  exit 0
}

# --- 1. ルート / ホーム / 裸のワイルドカードを対象にした再帰削除 -------------
#
# 正規表現ではなく単語単位で見る。rm の直後のフラグと対象を追うことで、
# `rm -rf /` は止めつつ `rm -rf /path/to/project/node_modules` は通せる。
strip_quotes() {
  local s=$1
  s=${s//\"/}
  s=${s//\'/}
  printf '%s' "$s"
}

read -ra words <<<"$cmd"
if [ ${#words[@]} -gt 0 ]; then
  saw_rm=0
  recursive=0
  for raw in "${words[@]}"; do
    w=$(strip_quotes "$raw")
    case "$w" in
      ";" | "&&" | "||" | "|")
        saw_rm=0
        recursive=0
        ;;
      rm | /bin/rm | /usr/bin/rm)
        saw_rm=1
        recursive=0
        ;;
      -*)
        if [ "$saw_rm" -eq 1 ]; then
          case "$w" in
            *[rR]*) recursive=1 ;;
          esac
        fi
        ;;
      / | "/*" | "~" | "~/" | "~/*" | '$HOME' | '${HOME}' | "*" | "." | "./" | ".." | "../")
        if [ "$saw_rm" -eq 1 ] && [ "$recursive" -eq 1 ]; then
          deny "ルート・ホーム・ワイルドカードを対象にした再帰削除をブロックしました（対象: $w）。削除したいディレクトリを具体的なパスで指定してください。"
        fi
        ;;
    esac
  done
fi

# --- 2. 強制 push -----------------------------------------------------------
#
# --force-with-lease は他人の push を上書きしないため通す。
if printf '%s' "$cmd" |
  grep -Eq 'git[[:space:]]+push([[:space:]]+[^[:space:]]+)*[[:space:]]+(--force([[:space:]]|=|$)|-[[:alnum:]]*f([[:space:]]|$))'; then
  deny "git push --force をブロックしました。履歴を上書きすると復旧が困難です。どうしても必要なら --force-with-lease を使うか、手動で実行してください。"
fi

# --- 3. Docker ボリュームの破棄 ---------------------------------------------
#
# down -v は Postgres のデータボリュームごと消す。マイグレーションと seed を
# やり直すことになるため、意図しない実行を止める。
if printf '%s' "$cmd" |
  grep -Eq 'docker([[:space:]]+compose|-compose)[[:space:]]+down[^;&|]*[[:space:]]-(v([[:space:]]|$)|-volumes)'; then
  deny "docker compose down -v をブロックしました。DB のボリュームごと消えて seed のやり直しになります。コンテナだけ止めるなら -v なしで実行してください。"
fi

if printf '%s' "$cmd" | grep -Eq 'docker[[:space:]]+volume[[:space:]]+(rm|prune)'; then
  deny "docker volume の削除をブロックしました。DB のデータが失われます。必要なら手動で実行してください。"
fi

# --- 4. データベースの破棄 --------------------------------------------------
if printf '%s' "$cmd" | grep -Eiq '(^|[^[:alnum:]_])drop[[:space:]]+(database|schema)([^[:alnum:]_]|$)'; then
  deny "DROP DATABASE / DROP SCHEMA をブロックしました。スキーマの変更はマイグレーションで行ってください。"
fi

# --- 5. ネットワークから取得したスクリプトの直接実行 ------------------------
if printf '%s' "$cmd" | grep -Eq '(curl|wget)[^|]*\|[[:space:]]*(sudo[[:space:]]+)?(ba|z)?sh([[:space:]]|$)'; then
  deny "ダウンロードしたスクリプトのシェルへの直接パイプをブロックしました。一度ファイルに保存し、中身を確認してから実行してください。"
fi

exit 0
