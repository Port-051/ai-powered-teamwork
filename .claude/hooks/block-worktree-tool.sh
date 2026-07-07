#!/bin/bash
# PreToolUse(EnterWorktree) 훅: 이 레포는 워크트리를 쓰지 않기로 한 팀 방침
# (port_051/decisions.md 2026-07-03)이 있어 EnterWorktree 도구 자체를 막는다.
cat <<'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "이 프로젝트는 워크트리를 쓰지 않고 항상 main 브랜치에서, 이 폴더에서 바로 작업하기로 팀이 정했습니다. 이 폴더에서 계속 작업해주세요."
  }
}
JSON
exit 0
