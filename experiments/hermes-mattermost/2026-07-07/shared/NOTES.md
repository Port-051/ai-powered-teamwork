# 실습 기록 (2026-07-07)

## 한 것

1. `docker-compose.yml`로 로컬에 Mattermost(Team Edition) + Postgres 컨테이너를
   띄움. Apple Silicon(M칩)에서는 공식 Mattermost 이미지가 arm64를 지원하지
   않아 `platform: linux/amd64`로 로제타 에뮬레이션을 걸어야 정상 동작함
   (CPU/메모리 부담은 크지 않음, 실측 0.5% CPU / 475MiB RAM 수준).
2. `http://localhost:8065`에서 관리자 계정으로 가입 → System Console →
   Integrations → Bot Accounts에서 Hermes용 봇 계정과 토큰 발급.
3. `~/.hermes/.env`에 `MATTERMOST_URL`, `MATTERMOST_TOKEN`,
   `MATTERMOST_REPLY_MODE=thread` 설정 후 `hermes gateway run` →
   슬랙과 Mattermost 둘 다 `✓ connected` 뜨는 것 확인 (`Gateway running with
   2 platform(s)`).
4. Mattermost 채널에서 봇 멘션 → 정상 응답, 스레드로 대화 이어짐.

## 막혔던 점 (다음에 또 겪을 사람을 위해)

- **가입 화면이 계속 안 뜨고 `/preparing-workspace`로 무한 리다이렉트되던
  문제**: 기존 Docker volume에 남아있던 이전 설치 상태 + Mattermost의
  온보딩(체험판 라이선스 체크) 단계가 꼬여서 발생. `docker compose down -v`로
  볼륨을 완전히 밀고, `docker-compose.yml`에
  `MM_SERVICESETTINGS_ENABLEONBOARDINGFLOW: "false"`를 추가해 온보딩
  마법사 자체를 스킵하도록 하니 해결됨.
- **토큰 붙여넣기 시 앞에 공백이 끼어 인증 실패**: `.env` 파일에 토큰을 손으로
  붙여넣을 때 앞뒤 공백이 섞이면 `api.context.session_expired.app_error`가
  남. 값 앞뒤 공백 여부만 확인하면 됨 (토큰 자체를 대화창에 붙여넣지 않는
  것이 원칙이므로 텍스트 에디터에서 직접 확인/수정할 것).
- 멘션 시 "No home channel is set for Mattermost" 메시지는 에러가 아니라
  안내문. Hermes가 cron 결과나 플랫폼 간 메시지를 보낼 기본 채널이
  없다는 뜻으로, 원하면 `/sethome`으로 지정하고 무시해도 정상 동작에는
  지장 없음.

## 배운 것 (설계에 참고할 점)

- Hermes에 Mattermost 어댑터가 이미 내장돼 있어서, PLAN.md에서 상정한
  "① Mattermost 어댑터"를 처음부터 새로 만들 필요는 없어 보임. 실제로
  우리가 새로 짜야 하는 건 여전히 ②(팀 공유 지능 레이어)와 ③(개인-팀
  지식 브릿지)임 — 이 실습은 그 판단의 근거가 됨.
- 로컬 Docker Mattermost는 학습/실습용으로는 충분하지만, 08/16 목표인
  실제 MVP에는 별도의 호스팅 서버가 필요함 (07/05에 있던 서버는 이후
  내려간 상태로 확인됨 → PLAN.md 체크포인트 갱신 필요).
