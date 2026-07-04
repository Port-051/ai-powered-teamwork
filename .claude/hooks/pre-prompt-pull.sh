#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_dir"

user_name="$(git config user.name || true)"

if [ -z "$user_name" ]; then
  echo '{"decision":"block","continue":false,"stopReason":"git 사용자 이름이 설정되어 있지 않습니다. 터미널에서 git config user.name \"본인이름\" 을 먼저 실행한 뒤 다시 시도해주세요."}'
  exit 0
fi

if ! git pull --quiet origin main >/dev/null 2>&1; then
  echo '{"systemMessage": "세션 시작 전 자동 pull이 실패했습니다 (원격과 갈라졌거나 커밋 안 된 변경사항과 충돌했을 수 있습니다). git status로 확인 후 직접 pull/커밋해주세요."}'
  exit 0
fi

echo '{"suppressOutput": true}'
