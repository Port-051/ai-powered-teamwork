#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_dir"

user_name="$(git config user.name || true)"

if [ -z "$user_name" ]; then
  echo '{"decision":"block","continue":false,"stopReason":"git 사용자 이름이 설정되어 있지 않습니다. 터미널에서 git config user.name \"본인이름\" 을 먼저 실행한 뒤 다시 시도해주세요."}'
  exit 0
fi

git pull --quiet origin main >/dev/null 2>&1 || true

echo '{"suppressOutput": true}'
