#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_dir"

input="$(cat)"
transcript_path="$(echo "$input" | jq -r '.transcript_path // empty')"

user_name="$(git config user.name || true)"
if [ -z "$user_name" ]; then
  echo '{"suppressOutput": true}'
  exit 0
fi

if [ -z "$transcript_path" ] || [ ! -f "$transcript_path" ]; then
  echo '{"suppressOutput": true}'
  exit 0
fi

day="$(date +"%Y-%m-%d")"
hms="$(date +"%H-%M-%S")"
mkdir -p "log/raw/$user_name/$day"

out="log/raw/$user_name/$day/${hms}.md"

# 이번 턴의 실제 사용자 발화(도구 결과가 아닌 진짜 사람 입력)를 찾고,
# 그 이후에 나온 assistant 텍스트 전체(여러 조각이어도 다 이어붙임)를 가져온다.
last_user="$(jq -rs '
  . as $all
  | ([ $all | to_entries[] | select(.value.type=="user" and (
        (.value.message.content|type)=="string"
        or ((.value.message.content|type)=="array" and (.value.message.content|any(.type=="text")))
      )) ] | last) as $lastEntry
  | if $lastEntry == null then "" else
      ($lastEntry.value.message.content | if type=="array" then ([.[] | select(.type=="text") | .text] | join("\n")) else . end)
    end
' "$transcript_path" 2>/dev/null || true)"

turn_assistant="$(jq -rs '
  . as $all
  | ([ $all | to_entries[] | select(.value.type=="user" and (
        (.value.message.content|type)=="string"
        or ((.value.message.content|type)=="array" and (.value.message.content|any(.type=="text")))
      )) ] | last) as $lastEntry
  | if $lastEntry == null then "" else
      ($all[($lastEntry.key+1):]
        | map(select(.type=="assistant"))
        | map(.message.content | if type=="array" then ([.[] | select(.type=="text") | .text] | join("\n")) else . end)
        | join("\n\n"))
    end
' "$transcript_path" 2>/dev/null || true)"

{
  echo "## [turn] $(date +"%Y-%m-%d %H:%M:%S")"
  echo
  echo "### user"
  echo "${last_user:-}"
  echo
  echo "### assistant"
  echo "${turn_assistant:-}"
} > "$out"

# 시크릿으로 보이는 패턴이 있으면 커밋/푸시하지 않고 파일만 남겨서 사람이 직접 확인하게 한다.
secret_pattern='AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{30,}|xox[baprs]-[A-Za-z0-9-]{10,}'
if grep -Eiq "$secret_pattern" "$out"; then
  echo '{"systemMessage": "log/raw에 비밀키로 보이는 내용이 감지되어 이 턴은 자동 push하지 않았습니다. 내용을 확인 후 직접 처리해주세요."}'
  exit 0
fi

git add "$out" >/dev/null 2>&1
git commit -q -m "log: raw entry ($user_name, $day $hms)" -- "$out" >/dev/null 2>&1 || true
git pull --rebase --quiet origin main >/dev/null 2>&1 || git rebase --abort >/dev/null 2>&1 || true
if ! git push -q origin main >/dev/null 2>&1; then
  echo '{"systemMessage": "로그 push가 실패했습니다 (네트워크 또는 충돌). 로컬에는 커밋되어 있으니, 다음 턴에서 다시 시도되거나 git status로 직접 확인해주세요."}'
  exit 0
fi

echo '{"suppressOutput": true}'
