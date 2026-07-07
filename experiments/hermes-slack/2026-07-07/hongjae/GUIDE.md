# Hermes ↔ Slack 연결 — 처음부터 한 번에 되는 순서

`SETUP.md`가 겪은 시행착오 기록이라면, 이건 그 시행착오를 반영해서
"이 순서대로 하면 한 번에 된다"고 정리한 결론이다.

## 0. 토큰은 절대 이 대화창(Claude Code)에 붙여넣지 않는다

이 레포는 매 턴 대화를 자동으로 `log/raw/`에 커밋·푸시한다 (`CLAUDE.md`
참고). 슬랙 토큰(`xoxb-...`, `xapp-...`)을 대화창에 적으면 GitHub에
그대로 올라갈 수 있다. 토큰은 항상 텍스트 에디터로 `~/.hermes/.env`나
`hermes setup gateway` 마법사에만 입력한다.

## 1. Hermes 설치

```bash
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

레포 안에 Hermes 소스를 넣지 않는다 (파일 수천 개라 레포가 무거워짐).
`~/.hermes/hermes-agent`에 설치되는 게 정상.

## 2. Slack 앱 생성 — manifest로 한 번에

1. https://api.slack.com/apps → **Create New App** → **From an app manifest**
2. 워크스페이스 선택 → `unho/slack-manifest.json` 내용 통째로 붙여넣기 →
   **Next** → **Create**

수동으로 하나씩 만들면 아래 두 가지를 빠뜨리기 쉽다 (실제로 겪음):

- **Bot Token Scopes**를 안 넣고 설치하면 봇 토큰(`xoxb-`)이 아니라 사용자
  토큰(`xoxe.xoxp-`)만 발급된다. 최소 `app_mentions:read`, `chat:write` +
  채널 조회용 `channels:read`, `groups:read`, `mpim:read`, `im:read` 필요.
- **Event Subscriptions**에서 `app_mention` bot event를 구독하지 않으면,
  Socket Mode 연결은 성공해도(`✓ slack connected` 로그) 멘션 이벤트 자체가
  안 들어와서 봇이 영원히 무응답이다.

manifest를 쓰면 이 두 가지가 이미 다 채워져 있어서 이 문제를 피한다.

## 3. 토큰 2개 발급

- **App-Level Token** (`xapp-`): Basic Information → App-Level Tokens →
  Generate, scope `connections:write`
- **Bot Token** (`xoxb-`): OAuth & Permissions → Install to Workspace →
  상단에 표시됨

## 4. Hermes에 등록

```bash
hermes setup gateway
```

대화형으로 Slack 선택 → 토큰 입력 → allowed user ID(본인 Slack member ID)
입력 → home channel은 비워도 됨(`/set-home`으로 나중에 지정) →
systemd 서비스로 설치할지 물으면 **Y** (터미널 꺼도 유지됨).

## 5. 모델 provider 설정

원하는 모델/provider로 설정하면 된다 (`hermes setup model`). 각자 쓰는
구독/API 키에 맞춰 자유롭게 고르면 되고, 크레딧/결제가 안 걸린 상태로
빨리 테스트만 해보고 싶으면 OpenRouter의 `:free` 모델(예:
`nvidia/nemotron-3-super-120b-a12b:free`)도 선택지 중 하나다.

```bash
hermes config set model.provider openrouter
hermes config set model.default "nvidia/nemotron-3-super-120b-a12b:free"
hermes gateway restart
```

## 6. 확인

Slack에서 봇을 채널에 초대(`/invite @봇이름`) 후 `@봇이름 안녕`으로
멘션. 응답이 안 오면:

```bash
hermes gateway status                          # 서비스 상태
journalctl --user -u hermes-gateway -n 50       # 최근 로그
tail -50 ~/.hermes/logs/agent.log               # 모델 호출 에러 확인
```

`hermes gateway status`가 "outdated"라고 뜨면 `hermes gateway restart`로
서비스 정의를 자동 갱신한다.

## 참고: 이건 어디까지나 임시 실습

최종 제품은 Mattermost 기반(`PLAN.md`)이라, 이 Slack 연동 코드/설정은
제품에 남기지 않는다. Mattermost 서버가 세팅되면 이 폴더는 정리 대상.
