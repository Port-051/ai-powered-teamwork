# Hermes ↔ Mattermost: 멀티유저(Profile) 설정 + 멘션 필터링 동작 방식

소스코드(`~/.hermes/hermes-agent`) 및 공식 문서(`website/docs/user-guide/`) 확인 기반 정리.
로컬 Hermes 소스 경로: `~/.hermes/hermes-agent` (커밋 536ffed 기준, 세부 분석은
`experiments/hermes-mattermost/2026-07-08/dongyeon/hermes-source-analysis.md` 참고).

## 1. 팀원별로 "진짜 개인 에이전트"를 갖게 하는 방법 — Profile

Hermes는 분리 레벨이 2개다.

- **레벨1 세션 격리**: 대화 기억만 사람별로 나뉨. SOUL.md·skills·config는 공유.
- **레벨2 Profile**: `~/.hermes/profiles/<name>/`이 완전히 독립된 HERMES_HOME. SOUL.md·skills·기억 전부 별개.
  "각 팀원이 진짜 개인 에이전트를 갖는다"는 기획 요구사항에는 **레벨2 Profile**이 필요.

### 방법 A — 프로세스 여러 개 (기본값)

```bash
hermes profile create dongyeon
dongyeon setup
dongyeon gateway install
dongyeon gateway start
```

사람마다 완전히 독립된 프로세스. 장점: 한 명 것이 죽어도 다른 사람에게 영향 없음(격리 강함).
단점: 사람이 늘수록 서버 자원(프로세스 수)이 그만큼 늘어남.

### 방법 B — 멀티플렉싱 (프로세스 하나로 통합)

```bash
hermes config set gateway.multiplex_profiles true
hermes gateway restart
```

default profile의 게이트웨이 프로세스 **하나**가 모든 profile의 어댑터를 자기 안에서 띄움.
개별 profile은 `hermes gateway start`를 직접 하면 안 됨(멀티플렉서가 이미 서빙 중이라 에러).

**중요 — 검증된 함정**: 공식 문서는 "webhook, api_server 등 port-binding 플랫폼이 `/p/<profile>/`
prefix로 접근 가능"이라고 적어놨지만, 실제로 `/p/{profile}/...` 라우트를 등록하는 건
`gateway/platforms/webhook.py`뿐이다. `api_server.py`에는 `profile`/`multiplex` 관련 코드가
전혀 없다(grep 0건) — 멀티플렉싱을 켜도 api_server는 요청별로 profile을 골라 호출할 방법이 없다.
멀티플렉싱이 api_server에 대해 실제로 하는 일은 "secondary profile이 자기 api_server를 못 띄우게
막는 것"뿐.

**Mattermost는 이 함정과 무관**: Mattermost 어댑터는 WebSocket(바깥으로 나가는 연결) 방식이라
`_PORT_BINDING_PLATFORM_VALUES`(webhook, api_server, msgraph_webhook, feishu, wecom_callback,
bluebubbles, sms)에 안 들어감. 그래서 각 profile이 자기 Mattermost 어댑터를 멀티플렉싱 모드에서도
정상적으로 띄울 수 있음 — 다만 **profile마다 서로 다른 Mattermost 봇 토큰은 여전히 필요**
(같은 토큰을 두 profile이 쓰면 시작 시 충돌 에러).

## 2. Mattermost 봇 계정 만들기 (사람 수만큼 반복)

1. System Admin으로 로그인 → 시스템 콘솔(`/admin_console`) → **Integrations → Bot Accounts** →
   "Enable Bot Account Creation" 켜기
2. 메뉴(☰) → **Integrations → Bot Accounts → Add Bot Account** (Username 예: `hermes-dongyeon`)
3. 생성 시 표시되는 **봇 토큰은 그 순간 한 번만 보임** — 즉시 복사 보관 (git 커밋 금지)
4. 봇을 대화할 채널에 멤버로 추가

각 팀원의 **Mattermost User ID**(아바타 → Profile, 26자리 문자열, `@username`이 아님)도 확인해둘 것 —
`MATTERMOST_ALLOWED_USERS`에 씀.

## 3. profile별 `.env` 설정 예시

```bash
# ~/.hermes/profiles/dongyeon/.env
MATTERMOST_URL=https://<mattermost-주소>
MATTERMOST_TOKEN=<dongyeon용 봇 토큰>
MATTERMOST_ALLOWED_USERS=<동연님 User ID>
```

`MATTERMOST_ALLOWED_USERS`를 비워두면 아무나 그 봇을 부를 수 있는 open access가 됨 — 특정 사용자만
허용하려면 반드시 값을 채워야 함.

## 4. 멘션 시 응답하는 동작 원리 (Slack과의 결정적 차이)

**핵심 결론**: Mattermost 쪽에는 Slack의 OAuth scope(`app_mentions:read`) 같은 "권한으로 미리
걸러주는" 개념이 없음. 봇 계정 자체는 아무 판단도 안 하고 그냥 "채널 멤버 중 하나"일 뿐 — 필터링은
전부 Hermes 게이트웨이 코드가 메시지를 다 받은 뒤 처리한다.

| | Slack | Mattermost |
|---|---|---|
| 필터링 주체 | Slack 서버 (OAuth scope 설정) | Hermes 코드 (텍스트 매칭) |
| 봇이 받는 이벤트 범위 | 권한 범위 안에서 선별된 이벤트만 | 봇이 멤버인 채널의 **모든 메시지** |
| "권한 설정" | 앱 관리 화면에서 scope 체크 | 없음 — 채널에 초대하면 끝 |

동작 흐름 (`plugins/platforms/mattermost/adapter.py:769-861`):

1. 봇이 멤버인 채널에 올라오는 **모든 `posted` WebSocket 이벤트**가 어댑터로 흘러들어옴
   (멘션 여부와 무관, 일단 전부 수신)
2. 자기 자신이 보낸 메시지, 시스템 포스트, 중복 이벤트는 걸러냄
3. DM이 아닌 채널 메시지는 순서대로:
   - `MATTERMOST_ALLOWED_CHANNELS` 화이트리스트에 없으면 조용히 무시
   - `MATTERMOST_REQUIRE_MENTION`(기본 `true`)이 켜져 있고, 메시지 텍스트에
     `@봇이름` 또는 `@봇user_id` 문자열 매칭이 없고, `MATTERMOST_FREE_RESPONSE_CHANNELS`에도
     없으면 조용히 무시 (거부 응답 없음)
   - 멘션이 있으면 그 `@` 문자열을 텍스트에서 지우고 에이전트로 전달
4. 허용되지 않은 사용자(`MATTERMOST_ALLOWED_USERS` 미포함)의 메시지도 같은 방식으로
   **조용히 무시**됨 (그룹/채널 기준. DM은 대신 페어링 코드 안내가 뜰 수 있음)

**의미**: "봇"이라는 게 Mattermost에서는 필터링 로직을 갖지 않는 단순 파이프(통로)다. 실제 동작은
그 파이프 반대편(Hermes 게이트웨이)의 설정값(`MATTERMOST_REQUIRE_MENTION`,
`MATTERMOST_ALLOWED_USERS`, `MATTERMOST_ALLOWED_CHANNELS`, `MATTERMOST_FREE_RESPONSE_CHANNELS`)이
전부 결정한다.

## 관련 환경변수 요약

| 변수 | 역할 | 기본값 |
|---|---|---|
| `MATTERMOST_URL` | 서버 주소 | 필수 |
| `MATTERMOST_TOKEN` | 봇/개인 액세스 토큰 | 필수 |
| `MATTERMOST_ALLOWED_USERS` | 허용 발신자 User ID (콤마 구분) | 비우면 open access |
| `MATTERMOST_ALLOWED_CHANNELS` | 응답할 채널 화이트리스트 | 비우면 전체 채널 |
| `MATTERMOST_REQUIRE_MENTION` | 채널에서 멘션 필수 여부 | `true` |
| `MATTERMOST_FREE_RESPONSE_CHANNELS` | 멘션 없이도 응답하는 채널 ID | 없음 |
| `MATTERMOST_HOME_CHANNEL` | cron/알림 발송 채널 | `/sethome`으로도 설정 가능 |
| `group_sessions_per_user` (config.yaml) | 채널 내 사람별 세션 격리 | `true` |
