#!/bin/bash
# PreToolUse(Bash) 훅: 이 레포는 항상 main에서만 작업하기로 한 팀 방침(CLAUDE.md/PLAN.md/
# port_051/decisions.md 2026-07-03)이 있다. 브랜치를 새로 만드는 git 명령을 자동 차단한다.
input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command // empty')
# 커밋 메시지 heredoc(예: cat <<'EOF' ... EOF) 안에 "git checkout -b" 같은
# 문구가 설명용으로 들어있어도 오탐하지 않도록, 매칭 전에 heredoc 본문을 제거한다.
scan=$(echo "$cmd" | perl -0777 -pe "s/<<-?[\"']?(\w+)[\"']?\n.*?\n\s*\1\b/<<HEREDOC_STRIPPED/gs")

if echo "$scan" | grep -qE '(^|[;&|]|\bgit )\s*checkout\s+-b\b|(^|[;&|]|\bgit )\s*switch\s+-c\b|(^|[;&|]|\bgit )\s*worktree\s+add\b|(^|[;&|]|\bgit )\s*branch\s+[^-[:space:]]'; then
  cat <<'JSON'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "이 프로젝트는 항상 main 브랜치에서만 작업하기로 팀이 정했습니다 (git 경험이 적은 팀 특성상 브랜치/워크트리가 늘어나면 혼란과 유실 위험이 커짐 — CLAUDE.md/PLAN.md 참고). 새 브랜치나 워크트리가 정말 필요하다고 느껴지면, 먼저 팀원에게 이유를 설명하고 확인받은 뒤 진행하세요."
  }
}
JSON
  exit 0
fi
exit 0
