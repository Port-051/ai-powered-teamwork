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

mkdir -p "log/raw/$user_name"

ts="$(date +"%Y-%m-%d_%H%M%S")"
out="log/raw/$user_name/${ts}.md"

last_user="$(jq -rs '
  [.[] | select(.type=="user")] | last
  | .message.content
  | if type=="array" then ([.[] | select(.type=="text") | .text] | join("\n")) else . end
' "$transcript_path" 2>/dev/null || true)"

last_assistant="$(jq -rs '
  [.[] | select(.type=="assistant")] | last
  | .message.content
  | if type=="array" then ([.[] | select(.type=="text") | .text] | join("\n")) else . end
' "$transcript_path" 2>/dev/null || true)"

{
  echo "## [turn] $(date +"%Y-%m-%d %H:%M:%S")"
  echo
  echo "### user"
  echo "${last_user:-}"
  echo
  echo "### assistant"
  echo "${last_assistant:-}"
} > "$out"

git add "$out" >/dev/null 2>&1
git commit -q -m "log: raw entry ($user_name, $ts)" >/dev/null 2>&1 || true
git push -q origin main >/dev/null 2>&1 || true

echo '{"suppressOutput": true}'
