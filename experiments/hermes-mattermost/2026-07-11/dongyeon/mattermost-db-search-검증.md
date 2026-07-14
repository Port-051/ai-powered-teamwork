# 봇 권한과 "Mattermost DB 검색" 기능은 별개다 (dongyeon, 2026-07-11)

## 질문

기획서(`submission/기획서_draft.md`)의 "주요 기능2 — 팀 공유 지능"을 구현하려면 봇이
Mattermost 안의 대화(DB)를 읽어야 한다. 그럼 **Mattermost 봇 계정에 시스템 관리자 권한만
넉넉히 주면, Hermes가 알아서 내부 DB를 검색해서 답변에 쓸 수 있는가?** (개인정보 문제는
일단 제쳐두고, "권한만 주면 기능이 저절로 생기는가"만 확인)

## 결론

**아니다.** 권한(authorization)과 기능(capability)은 다른 문제다.

- **권한** = 봇 계정이 어디까지 접근 "자격"이 있는가 (Mattermost 시스템 콘솔에서 설정)
- **기능** = 그 자격을 실제로 사용해서 데이터를 가져오는 **코드**가 있는가

시스템 관리자 권한을 줘도, Hermes 안에 그 권한을 실제로 써먹는 코드 경로가 없으면
아무 일도 일어나지 않는다. 실제로 로컬에 설치된 Hermes-Agent 소스
(`/home/rlaehddus302/.hermes/hermes-agent`, 커밋 `536ffed`)를 직접 확인한 결과, 그 코드가
**없다.**

## 확인한 근거 3가지

### 1. Mattermost 어댑터가 실제로 호출하는 API는 6개뿐

`plugins/platforms/mattermost/adapter.py`를 grep한 결과, 호출하는 Mattermost REST API
엔드포인트는:

```
posts (메시지 전송) / posts/{id} / users/me / channels/{id} / files/{id}/info
```

전부 "봇이 멘션된 순간 그 자리에서 답장하는 데" 필요한 최소한의 호출이다. Mattermost의
검색 API(`/api/v4/posts/search`)나 관리자 API(`system_console` 등)는 코드 전체에 단 한
줄도 나오지 않는다.

### 2. Discord에는 있고 Mattermost에는 없는 "플랫폼 전용 조회 도구"

Hermes는 메신저별로 AI가 대화 중에 스스로 호출할 수 있는 "플랫폼 전용 도구"를 따로 둘 수
있는 구조다 (`tools/discord_tool.py` 같은 파일 + `toolsets.py`의 툴셋 등록).

`toolsets.py`를 보면:

```python
"hermes-discord": {
    "tools": _HERMES_CORE_TOOLS + ["discord", "discord_admin"],  # Discord 전용 조회/관리 도구 추가
},

"hermes-mattermost": {
    "tools": _HERMES_CORE_TOOLS,  # 딱 이것뿐. 추가 도구 없음
    "includes": []
},
```

`tools/discord_tool.py`는 "Discord server introspection and management tool"이라는
설명대로, 봇 토큰으로 Discord REST API를 직접 호출해 서버/멤버 검색까지 해주는 도구다.
**Mattermost에는 이 짝이 되는 `mattermost_tool.py` 자체가 존재하지 않는다.** Discord
봇은 대화 중에 "서버 뒤져봐"를 스스로 실행할 수 있지만, Mattermost 봇은 애초에 그런 도구가
구현이 안 돼 있다.

### 3. 유일한 "검색" 도구(`session_search`)는 Mattermost가 아니라 Hermes 자기 자신을 검색

`_HERMES_CORE_TOOLS`(모든 메신저 공통, Mattermost 포함)에 들어있는 `session_search` 도구를
열어보면 (`tools/session_search_tool.py` 상단 docstring):

> All three modes operate on the SQLite session DB via the FTS5 index [...]
> No LLM calls anywhere — every shape returns actual messages from the DB.

여기서 말하는 "DB"는 **Hermes 자신의 세션 SQLite DB** (지금까지 Hermes와 나눈 대화 기록)
다. Mattermost 서버의 DB나 API가 아니다. 이름만 보고 "Mattermost도 검색해주나?" 하고
오해하기 쉬운 지점이라 따로 짚어둔다.

## 그래서 뭘 만들어야 하나

권한 설정만으로는 안 되고, Discord의 `discord_tool.py`에 대응하는 **Mattermost 전용
조회 도구**를 우리가 직접 만들어야 한다 — Mattermost REST API(`/api/v4/posts/search` 등)를
호출해서 결과를 에이전트에게 돌려주는 코드. 이게 바로 기획서의 "주요 기능2 — 팀 공유 지능",
"팀 협업 지능 레이어"가 메꿔야 하는 빈자리다. Hermes나 Mattermost 어느 쪽도 이 기능을
공짜로 제공하지 않는다는 뜻이므로, 오히려 우리 프로젝트의 핵심 novel 파트가 정확히 여기
있다는 걸 코드 레벨에서 재확인한 셈이다.

## 참고

- 전체 이전 분석: `experiments/hermes-mattermost/2026-07-08/dongyeon/hermes-source-analysis.md`
- 관련 메모리: `hermes_source_findings.md` (api_server.py가 라이선스에 맞는 연동 지점이라는
  내용과 이번 검증은 서로 다른 질문 — 이번 건은 "연동 지점이 아니라 연동 지점에서 무엇을
  구현해야 하는가"에 대한 확인)
