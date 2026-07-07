# Hermes 게이트웨이로 Slack 연결하기 (dongyeon) — Gemini 키 + Slack 실제 연동 기록

`bot.py`(순수 Python 실습)와 별개로, **Hermes 자체를 설치해서 Gemini로
대화 엔진을 붙이고, Hermes의 내장 게이트웨이로 Slack에 연결한 과정** 기록.
문제 생겼을 때 로그로 원인 찾은 과정도 같이 남겨둠 (다음에 같은 문제
만나면 참고용).

## 0. 설치

WSL에서 공식 설치 스크립트로 설치 (Windows PowerShell에 설치한 것과는
별개 — WSL/Windows는 파일시스템이 분리된 별도 환경이라 서로 안 이어짐):

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

설치 후 확인:
```bash
hermes doctor
```

## 1. LLM 연결 — Gemini API 키

1. https://aistudio.google.com/apikey 에서 API 키 발급 (무료 등급 있음)
2. 키를 `.env`에 등록:
   ```bash
   hermes setup   # 마법사로 Google AI Studio(Gemini) 선택 후 키 입력
   ```
   또는 `nano ~/.hermes/.env` 로 직접 `GEMINI_API_KEY=` 값 입력
3. `hermes doctor`로 확인 → "API Connectivity"에 `✓ gemini` 뜨면 성공

### 겪은 문제 1: `Attempted to access streaming response content, without having called read()`

- 화면에 뜬 에러는 이거였지만, **이건 진짜 원인이 아니라 Hermes 내부
  버그로 가려진 표면 에러**였음
- `~/.hermes/logs/errors.log` (또는 `agent.log`)를 열어서 전체
  트레이스백을 보니, `During handling of the above exception, another
  exception occurred:` 문구 위에 **진짜 원인**이 있었음:
  ```
  GeminiAPIError: Gemini HTTP 403 (PERMISSION_DENIED):
  Your project has been denied access. Please contact support.
  ```
- 즉 **처음 발급받은 키(가 속한 구글 클라우드 프로젝트)가 Google 쪽에서
  차단된 상태**였음 (신규 프로젝트에서 종종 발생하는, Hermes와 무관한
  Google 쪽 이슈)
- **해결**: https://aistudio.google.com/apikey 에서 **새 프로젝트로 키를
  다시 발급**받아서 교체 → 정상 동작

### 키 교체 방법 (전체 설정 마법사 안 거치고 간단히)

```bash
nano ~/.hermes/.env
```
`GEMINI_API_KEY=` 줄만 새 값으로 교체 → 저장 → `hermes doctor`로 재확인.

## 2. Slack 앱 만들기

`SETUP.md`(순수 Python 실습)에서 한 것과 절차 동일 — Slack에 봇을 붙이려면
**어떤 방식으로 하든 Slack 앱 등록은 필수** (플랫폼 자체 규칙, Hermes로도
생략 불가):

1. https://api.slack.com/apps → **Create New App** → **From scratch**
2. **Socket Mode** 켜기 → `xapp-` App Token 발급 (scope: `connections:write`)
3. **OAuth & Permissions** → Bot Token Scopes에 `app_mentions:read`,
   `chat:write` 추가 → **Install to Workspace** → `xoxb-` Bot Token 발급
4. **Event Subscriptions** → Enable → `app_mention` 이벤트 구독 → Save

## 3. Hermes에 Slack 토큰 등록 & 실행

```bash
hermes gateway setup     # 마법사로 Slack 선택, 토큰 두 개 입력
hermes gateway run       # 포그라운드 실행
```

Slack 채널에서 `/invite @봇이름` 으로 봇 초대 후 `@봇이름` 멘션해서 테스트.

### 겪은 문제 2: 멘션해도 채널에서 응답이 없음

`~/.hermes/logs/agent.log`에서 원인 확인:
```
WARNING gateway.run: Unauthorized user: U0BFL3QCSAE (U0BFL3QCSAE) on slack
```
→ **멘션 자체는 정상 수신됐지만, 내 Slack 사용자 ID가 허용 목록
(allowlist)에 없어서 응답을 거부**한 것. Hermes는 기본이 "허용된 사람만
응답"이라 이 목록을 채워야 함.

**해결**:
```bash
nano ~/.hermes/.env
```
```
SLACK_ALLOWED_USERS=U0BFL3QCSAE
```
(여러 명이면 쉼표로 구분) 저장 후 `hermes gateway restart`(또는 다시
`hermes gateway run`)

**내 Slack User ID 찾는 법**: 프로필 사진 클릭 → Profile → 오른쪽 위
⋮ → **Copy member ID**. 또는 허용 안 된 상태로 멘션해보면 로그에
"Unauthorized user: U0XXXXXXX" 형태로 그대로 찍혀 나와서 거기서 복사해도 됨.

**더 편한 대안**: 매번 ID를 직접 안 찾아도, 봇에게 **DM**을 보내면
기본적으로 "페어링 코드 입력" 절차로 자동 등록되는 기능도 있음
(`unauthorized_dm_behavior` 설정).

### 참고: 같이 뜬 경고 (응답 자체엔 무관)

```
missing_scope: needed 'channels:read,groups:read,mpim:read,im:read',
provided 'app_mentions:read,chat:write'
```
채널 목록 조회 같은 부가 기능용 권한 부족 경고 — 멘션 응답 기능에는
영향 없어서 지금은 무시. 필요해지면 Slack 앱 관리 페이지에서 해당
스코프 추가 후 재설치.

## 4. 최종 상태

- Gemini API 연결 정상 (`hermes doctor` 전부 통과)
- Slack 게이트웨이 연결, 허용 목록 등록 후 채널 멘션에 정상 응답 확인

## 배운 점 정리

- **API는 원래 무상태(stateless)** — 이전 대화를 매번 다시 붙여 보내는
  걸 Hermes/앱이 대신 해주는 것일 뿐. 대화가 길어질수록 토큰(비용)이
  누적되는 게 이 방식의 근본적 트레이드오프.
- **화면에 뜨는 에러가 항상 진짜 원인은 아님** — 특히 스택 트레이스에
  `During handling of the above exception, another exception occurred`가
  있으면, 그 위에 있는 첫 번째 에러가 진짜 원인.
- **Slack 앱 등록 절차는 어떤 방법(직접 코드 vs Hermes)을 쓰든 동일하게
  필요** — Hermes가 줄여주는 건 그 뒤(토큰 등록, 멘션 처리 로직) 부분.
- **Hermes는 기본이 "허용된 사람만 응답"** — 새 메신저 연결할 때마다
  allowlist 설정을 빼먹지 않도록 체크리스트에 넣어둘 것.
