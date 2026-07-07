# Hermes ↔ Slack 연결 (hongjae)

Mattermost 서버가 아직 없어서, Hermes 응답 로직만 먼저 검증하려고 Slack으로
임시 테스트한 기록. `unho/SETUP.md`와 큰 흐름은 같고, 겪었던 막힌 지점 위주로 남긴다.

## 진행 순서

1. 공식 설치 스크립트로 Hermes 설치
   ```bash
   curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
   ```
2. Slack 앱을 수동으로 생성 (manifest 없이 하나씩): OAuth & Permissions에서
   Bot Token Scopes 추가 → Install to Workspace → `xoxb-` 토큰 발급.
   Basic Information → App-Level Tokens → `connections:write` scope로
   `xapp-` 토큰 발급.
3. `hermes setup gateway`로 대화형 마법사를 통해 Slack 토큰 등록
   (`~/.hermes/.env`를 손으로 직접 편집하는 대신 마법사가 물어보는 값에
   붙여넣는 방식. 결과는 동일).
4. `hermes gateway install` + `hermes gateway start`로 systemd user
   서비스 등록 (터미널 꺼도 유지됨).

## 겪은 막힌 지점들

- **Bot Token Scopes를 안 넣고 설치하면 `xoxb-`가 아니라 `xoxe.xoxp-`(사용자
  토큰)만 나온다.** 반드시 OAuth & Permissions → Bot Token Scopes에
  `app_mentions:read`, `chat:write`를 먼저 추가하고 Install/Reinstall해야
  봇 토큰이 생성됨.
- **채널 목록 조회 실패**: `channels:read`, `groups:read`, `mpim:read`,
  `im:read` 스코프가 없으면 게이트웨이가 `missing_scope` 경고를 반복
  출력함(치명적이진 않지만 스코프 추가 권장).
- **멘션에 응답이 아예 안 옴 (연결은 되는데 무반응)**: Bot Token Scope만
  갖고는 부족하고, **Event Subscriptions에서 `app_mention` bot event를
  따로 구독해야** 함. Socket Mode 연결 로그(`✓ slack connected`)가 떠도
  이벤트 구독이 안 돼 있으면 아무 이벤트도 안 들어온다.
- **`hermes gateway status`가 "outdated"라고 경고할 때**: `hermes gateway
  restart`로 재시작하면 서비스 정의를 자동 갱신함.
- **모델 호출이 402/결제 에러로 실패**: OpenRouter의 유료 모델(예:
  `anthropic/claude-sonnet-5`)이나 Anthropic "Claude Code" 로그인(구독
  플랜 한도는 서드파티 앱엔 안 먹히고 별도 "extra usage" 결제가 필요함)
  둘 다 카드/크레딧이 필요해서 막힘. → 해결: OpenRouter의 **무료 모델**로
  전환.
  ```bash
  hermes config set model.provider openrouter
  hermes config set model.default "nvidia/nemotron-3-super-120b-a12b:free"
  hermes gateway restart
  ```
  (unho님 컴퓨터도 이 무료 모델 조합으로 카드 등록 없이 이미 잘 쓰고 있었음.)

## 결론

카드/크레딧 등록 없이 테스트하려면 OpenRouter `:free` 모델로 맞추는 게
제일 간단하다. 이 내용은 `shared/`에도 옮겨서 팀 전체가 같은 삽질을
반복하지 않게 하는 게 좋을 듯.
