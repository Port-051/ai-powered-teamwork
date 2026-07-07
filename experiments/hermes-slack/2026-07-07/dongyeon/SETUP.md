# 슬랙 봇 실습 (dongyeon) — Hermes 없이 순수 Python으로 멘션 왕복 연습

Hermes CLI 없이, Slack 앱 생성부터 `slack_bolt`로 직접 봇을 만들어서 "멘션 →
응답" 왕복을 처음부터 끝까지 손으로 만들어보는 실습.

## 0. 토큰을 이 대화창에 붙여넣지 말 것

이 레포는 매 턴 대화 내용을 `log/raw/`에 자동으로 커밋·푸시한다(`CLAUDE.md`
참고). 슬랙 토큰(`xoxb-...`, `xapp-...`)이나 Claude API 키를 대화창에
붙여넣으면 GitHub에 그대로 올라갈 수 있다. **토큰·키는 아래 6단계처럼 코드
파일이나 `.env`에 직접 적어 넣고, Claude Code 세션에는 값 자체를 말하거나
붙여넣지 않는다.**

## 1단계 — 슬랙 앱(봇) 만들기

1. 브라우저에서 https://api.slack.com/apps 접속 (로그인 상태여야 함)
2. **Create New App** 버튼 클릭
3. **From scratch** 선택
4. App Name 입력 (예: `ai-bot-test`), Pick a workspace → 실습용 워크스페이스 선택
5. **Create App** 클릭 → 앱 관리 화면으로 이동

## 2단계 — Socket Mode 켜기 (서버 노출 없이 연습하기 위한 핵심)

1. 왼쪽 메뉴에서 **Socket Mode** 클릭
2. **Enable Socket Mode** 토글을 켬
3. 토큰 이름 입력창이 뜸 → 아무 이름(예: `socket-token`) 입력 후 생성
4. `xapp-`로 시작하는 토큰이 나옴 → 메모장 등에 임시로 복사해둔다 (아직
   코드에 넣지 않음)

## 3단계 — 봇 권한(Scope) 설정

1. 왼쪽 메뉴에서 **OAuth & Permissions** 클릭
2. 아래로 스크롤 → **Scopes** → **Bot Token Scopes**
3. **Add an OAuth Scope** 클릭해서 아래 2개 추가
   - `app_mentions:read` (누가 봇을 멘션했는지 읽을 권한)
   - `chat:write` (메시지 보낼 권한)
4. 페이지 맨 위로 스크롤 → **Install to Workspace** 버튼 클릭
5. 권한 확인 화면 나오면 **Allow** 클릭
6. 설치 완료되면 `xoxb-`로 시작하는 토큰이 보임 → 복사해두기 (Bot Token)

## 4단계 — 멘션 이벤트 구독하기

1. 왼쪽 메뉴에서 **Event Subscriptions** 클릭
2. **Enable Events** 토글을 켬 (Socket Mode라서 URL 검증 없이 그냥 켜짐)
3. 아래로 스크롤 → **Subscribe to bot events** 섹션
4. **Add Bot User Event** 클릭 → `app_mention` 추가
5. **Save Changes** 클릭
6. 화면 위에 "재설치 필요" 알림이 뜨면 → **reinstall** 클릭 → 권한 확인
   화면에서 다시 **Allow**

이제 토큰 2개(`xoxb-...`, `xapp-...`)가 준비됐다.

## 5단계 — 봇을 채널에 초대

1. 슬랙 앱으로 돌아가서 아무 채널이나 연다
2. `/invite @ai-bot-test` 입력 (앱 이름은 4단계와 무관하게, 1단계에서 지은
   이름 그대로)

## 6단계 — 코드 작성 (WSL 터미널에서)

WSL에 Python 3.10이 이미 있으므로, 실습용 폴더에서 진행한다 (이미
`slack-bot-practice/` 폴더가 만들어져 있음).

```bash
cd ~/slack-bot-practice   # 또는 이 실습 폴더 안 slack-bot-practice
pip3 install slack_bolt
```

`bot.py` 파일을 아래처럼 작성한다:

```python
from slack_bolt import App
from slack_bolt.adapter.socket_mode import SocketModeHandler

BOT_TOKEN = "xoxb-여기에-복사한-Bot-Token"
APP_TOKEN = "xapp-여기에-복사한-App-Token"

app = App(token=BOT_TOKEN)


@app.event("app_mention")
def handle_mention(event, say):
    user = event["user"]
    text = event["text"]
    say(f"안녕하세요 <@{user}>님! '{text}' 잘 받았어요.")


if __name__ == "__main__":
    SocketModeHandler(app, APP_TOKEN).start()
```

## 7단계 — 실행 & 테스트

```bash
python3 bot.py
```

터미널에 `⚡️ Bolt app is running!` 같은 메시지가 뜨면 성공. 슬랙 채널에서:

```
@ai-bot-test 안녕
```

쳐보면 봇이 바로 답장한다. 이게 되면 "멘션 → 응답" 왕복을 실제로 완성한
것이고, 이게 우리 Mattermost 어댑터에서 만들 것과 원리가 동일하다.

## 8단계 (선택) — 진짜 AI가 답하게 해보기

`say(...)` 부분을 진짜 AI 호출로 바꾸면 된다. 예를 들어 Claude API를 쓰면:

```python
import anthropic

client = anthropic.Anthropic(api_key="여기에-Claude-API-키")


@app.event("app_mention")
def handle_mention(event, say):
    text = event["text"]
    response = client.messages.create(
        model="claude-sonnet-5",
        max_tokens=500,
        messages=[{"role": "user", "content": text}],
    )
    say(response.content[0].text)
```

이렇게 되면 "슬랙 멘션 → 진짜 AI가 답변" 왕복이 완성되고, 우리 프로젝트
MVP의 핵심(`@ai` 멘션 → 답 돌아옴)을 슬랙으로 미리 연습해본 셈이 된다.
