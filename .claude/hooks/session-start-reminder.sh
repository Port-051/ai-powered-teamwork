#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$repo_dir"

today="$(date +"%Y-%m-%d")"

pending=0
if [ -d log/raw ]; then
  while IFS= read -r d; do
    day="$(basename "$d")"
    if [ "$day" != "$today" ]; then
      pending=$((pending + 1))
    fi
  done < <(find log/raw -mindepth 2 -maxdepth 2 -type d 2>/dev/null)
fi

if [ "$pending" -gt 0 ]; then
  echo "{\"systemMessage\": \"아직 처리 안 된 이전 날짜 로그(log/raw)가 ${pending}개 있습니다. /teambrain-process 실행해서 정리해주세요.\"}"
else
  echo '{"suppressOutput": true}'
fi
