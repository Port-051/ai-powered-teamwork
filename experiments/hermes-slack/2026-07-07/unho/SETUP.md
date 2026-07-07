# Hermes ↔ Slack 연결 (unho)

이 컴퓨터엔 Hermes가 이미 설치·설정돼 있어서 (`hermes doctor`로 확인됨) 남은 건
슬랙 앱 생성 + 토큰 두 개 발급뿐이다.

## 0. 왜 토큰을 이 대화창에 붙여넣으면 안 되나

이 레포는 매 턴의 대화 내용을 자동으로 `log/raw/`에 커밋·푸시하는 정책이 있다
(`CLAUDE.md` 참고). 슬랙 봇 토큰(`xoxb-...`, `xapp-...`)은 비밀값이라 대화창에
붙여넣으면 GitHub에 그대로 올라갈 수 있다. **토큰은 아래 4단계처럼 텍스트
에디터로 `~/.hermes/.env` 파일에 직접 적어 넣는다.** Claude Code 세션에는
토큰 값을 말하거나 붙여넣지 않는다.

## 1. Slack App 생성 (manifest로 한 번에)

1. 브라우저에서 https://api.slack.com/apps 접속 → 로그인.
2. **Create New App** → **From an app manifest** 선택.
3. 방금 만든 워크스페이스 선택.
4. 이 폴더의 `slack-manifest.json` 파일 내용을 통째로 복사해서 붙여넣기 →
   **Next** → **Create**.
   (이 manifest에는 필요한 권한(scope), 이벤트 구독, Socket Mode 설정이 전부
   미리 채워져 있음. 화면에 뜨는 권한 요약만 확인하고 넘어가면 됨.)

## 2. 앱 레벨 토큰 발급 (SLACK_APP_TOKEN, `xapp-`로 시작)

1. 생성된 앱 페이지 → 좌측 메뉴 **Basic Information**.
2. 아래로 스크롤 → **App-Level Tokens** → **Generate Token and Scopes**.
3. 토큰 이름은 아무거나 (예: `socket-mode`), Scope는 `connections:write` 추가.
4. **Generate** → `xapp-`로 시작하는 값이 나옴. 이 값을 복사해둔다 (아직 어디에도
   붙여넣지 말고 메모장 등에만).

## 3. 봇 토큰 발급 + 워크스페이스 설치 (SLACK_BOT_TOKEN, `xoxb-`로 시작)

1. 좌측 메뉴 **OAuth & Permissions**.
2. 맨 위 **Install to Workspace** (또는 **Reinstall**) 클릭 → 권한 동의 화면에서
   **허용**.
3. 설치 후 같은 페이지 상단에 **Bot User OAuth Token**이 `xoxb-`로 시작하는
   값으로 나타남. 복사해둔다.

## 4. 토큰을 Hermes에 등록

터미널(이 대화창 말고, 사용자가 직접 여는 터미널)에서:

```bash
open -e ~/.hermes/.env
```

파일을 열어서 아래 세 줄을 찾아 주석(`#`)을 지우고 값 채우기:

```
SLACK_BOT_TOKEN=xoxb-여기에-3단계-토큰
SLACK_APP_TOKEN=xapp-여기에-2단계-토큰
```

저장하고 닫는다.

## 5. 실행

```bash
hermes gateway run
```

포그라운드로 뜨면서 슬랙에 연결됐다는 로그가 보이면 성공. 슬랙 워크스페이스에서
봇을 채널에 초대(`/invite @TeamBrain Hermes`)하고 멘션해서 대화해본다.

계속 켜두려면 (터미널 닫아도 유지):

```bash
hermes gateway install   # 백그라운드 서비스로 등록
hermes gateway start
```

상태 확인: `hermes gateway status`
