#!/usr/bin/env bash
# PreToolUse / Bash（git コマンドのみ）— 機密ファイルのコミットを止める。
#
# .env には Postgres の認証情報が入る。読み取りは permissions.deny で
# 禁止しているが、それだけでは「中身を見ないまま git add . でコミットする」
# 経路が残る。ここでステージ内容を検査して塞ぐ。
#
# .env.example は雛形なのでコミットを許可する。

set -uo pipefail

cmd=$(jq -r '.tool_input.command // ""')

# git を含まないコマンドは対象外。
# settings.json の `if` ではなくここで判定しているのは、`if` が前方一致のため
# `cd apps/api && git commit ...` のような複合コマンドを取りこぼすため。
case "$cmd" in
  *git*) ;;
  *) exit 0 ;;
esac

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

# 機密とみなすパス。.env.example / .env.sample は意図的に含めない。
SECRET_RE='(^|/)\.env($|\.(local|development|production|test))|\.(pem|key|p12|pfx)$|(^|/)id_(rsa|ed25519)$'

# --- 1. git add / git stage が機密ファイルを直接指している -------------------
#
# 対象を add / stage に絞るのが肝心。全 git コマンドで .env を弾くと
# `git rm --cached .env` や `git check-ignore .env` まで止まり、
# ブロックされたあとに自力で復旧できなくなる（下の deny メッセージが
# 案内している手順すら実行できない）。
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+(add|stage)([[:space:]]|$)' &&
  printf '%s' "$cmd" | grep -Eq '(^|[[:space:]/])\.env([[:space:]]|$|\.(local|development|production|test))'; then
  deny ".env を git の追加対象に含めようとしています。認証情報が履歴に残ると、リポジトリを作り直すまで消えません。.env は .gitignore に入っているので、コミットせず手元だけで管理してください。"
fi

# --- 2. ステージ済み（および commit -a の対象）を検査 ------------------------
targets=$(git diff --cached --name-only 2>/dev/null) || exit 0

# commit -a / -am は未ステージの変更も巻き込む
if printf '%s' "$cmd" | grep -Eq 'git[[:space:]]+commit[^;&|]*[[:space:]]-[[:alnum:]]*a'; then
  targets="${targets}
$(git diff --name-only 2>/dev/null)"
fi

[ -n "$(printf '%s' "$targets" | tr -d '[:space:]')" ] || exit 0

bad=$(printf '%s\n' "$targets" | grep -E "$SECRET_RE" || true)
if [ -n "$bad" ]; then
  deny "機密ファイルがステージされています: $(printf '%s' "$bad" | tr '\n' ' ')
git rm --cached <ファイル> でステージから外し、.gitignore に入っているか確認してから再実行してください。"
fi

exit 0
