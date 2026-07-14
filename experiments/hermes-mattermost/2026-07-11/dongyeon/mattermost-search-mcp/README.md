# mattermost-search-mcp (프로토타입, dongyeon, 2026-07-11)

Mattermost의 읽기 전용(조회) REST API를 여러 개의 작은 MCP 도구로 나눠 노출하는
서버 프로토타입. 검색어 하나로 뭉뚱그리지 않고, 어떤 조회가 필요한지는
Hermes(LLM)가 상황에 맞게 스스로 고르게 한다. 쓰기/관리 계열(채널 생성·삭제,
멤버 추방, 설정 변경 등)은 의도적으로 빼고 조회로만 좁혔다 — 아직 비밀정보
필터링/권한 브릿지 레이어가 없어서, 표면을 넓히면 그만큼 필터링 안 된 통로도
늘어나기 때문 (Hermes 공식 MCP 가이드의 "smallest useful surface" 원칙).

배경/왜 이런 구조인지는 옆 폴더의 `../mattermost-db-search-검증.md` 참고.
요약하면: Hermes 소스도 Mattermost 소스도 안 건드리고, 이 파일 하나가 독립
프로세스로 떠서 Mattermost의 공개 REST API만 호출한다. Hermes 쪽은
`~/.hermes/config.yaml`의 `mcp_servers`에 등록만 하면 자동으로 도구로
잡아간다 (Hermes 소스 수정 0줄).

## 제공하는 도구 7개

| 도구 | 용도 | 실제 호출하는 API |
|---|---|---|
| `list_my_teams` | 봇이 가입된 팀 목록(team_id 포함) 확인 | `GET /users/me/teams` |
| `search_mattermost` | 키워드/사람/채널로 메시지 검색 | `POST /teams/{team_id}/posts/search` |
| `get_channel_recent_posts` | 검색어 없이 특정 채널 최근 대화를 시간순으로 훑기 | `GET /channels/{channel_id}/posts` |
| `get_thread` | 특정 post가 속한 스레드 전체(원글+답글) 보기 | `GET /posts/{post_id}/thread` |
| `get_user_by_username` | username → user_id 등 사용자 정보 조회 | `GET /users/username/{username}` |
| `get_user_by_id` | user_id → username 등 사용자 정보 조회 | `GET /users/{user_id}` |
| `list_channels_for_team` | 봇이 접근 가능한 채널 목록 확인 | `GET /users/me/teams/{team_id}/channels` |

어떤 도구를 언제 쓸지는 각 도구의 docstring에 "이럴 때는 이 도구 대신 저 도구가
낫다"는 식으로 서로 교차 안내를 넣어뒀다 — LLM이 사용자 질문을 보고 스스로
고를 수 있도록.

## 준비물

1. Mattermost에서 봇 계정 생성 → **Personal Access Token** 발급
2. 그 봇 계정을 조회 대상 채널들에 멤버로 초대
   (모든 조회 API가 봇이 속한 채널만 대상으로 함. 시스템 관리자 권한을 줘도
   이 제약은 그대로 — 채널 멤버십 자체가 접근 범위를 결정함)
3. team_id는 몰라도 된다 — 봇이 팀 하나에만 가입돼 있으면 도구들이
   `list_my_teams`(`GET /users/me/teams`)로 자동 조회해서 쓴다. 봇을 여러
   팀에 가입시켜야 하는 상황이면 `MATTERMOST_TEAM_ID`를 직접 지정하거나,
   도구 호출 시마다 `team_id` 인자를 명시해야 한다 (아래 "team_id 처리 방식"
   참고).

## 로컬 실행

```bash
cd experiments/hermes-mattermost/2026-07-11/dongyeon/mattermost-search-mcp
uv pip install -r requirements.txt

export MATTERMOST_URL="https://우리팀메신저.example.com"
export MATTERMOST_TOKEN="여기_봇_토큰"
# MATTERMOST_TEAM_ID는 생략 가능 (봇이 팀 하나에만 가입돼 있으면 자동 조회됨)

python mattermost_search_mcp.py
```

## Hermes에 등록 (토큰을 두 곳에 따로 적지 않는 방법)

이 서버가 읽는 환경변수 이름(`MATTERMOST_URL`, `MATTERMOST_TOKEN`)은 Hermes
자신의 Mattermost 어댑터가 읽는 이름과 **일부러 똑같이** 맞췄다
(`plugins/platforms/mattermost/adapter.py`, `gateway/config.py`가 읽는 값과
동일). 그래서 값 자체는 `~/.hermes/.env`에 한 번만 적어두고, `config.yaml`
양쪽(Mattermost 어댑터 설정 + 우리 MCP 서버 설정)에서 `${VAR}` 문법으로
그 값을 참조만 하면 된다.

Hermes가 MCP 서버를 자식 프로세스로 띄울 때, Hermes 자신의 환경변수를
통째로 물려주지는 않는다(`tools/mcp_tool.py`의 `_build_safe_env` — PATH/HOME
같은 안전한 것만 남기고 나머지는 보안상 걸러냄). 대신 config 로딩 단계에서
`~/.hermes/.env`를 먼저 읽고(`load_hermes_dotenv()`) `${VAR}` 자리를 실제
값으로 치환한 다음, 그 치환된 값을 `mcp_servers.*.env`에 명시적으로 적어둔
것만 서브프로세스에 넘긴다 — 그래서 "값은 한 곳에만 저장, 필요한 곳마다
참조만" 이 가능하면서도, 우리가 config에 안 적은 다른 비밀값은 여전히
안 새어나간다.

```bash
# ~/.hermes/.env  (실제 값은 여기 한 곳에만)
MATTERMOST_TOKEN=실제_봇_토큰_값
MATTERMOST_URL=https://우리팀메신저.example.com
```

```yaml
# ~/.hermes/config.yaml
mcp_servers:
  mattermost_search:
    command: "python"
    args: ["/절대경로/mattermost_search_mcp.py"]
    env:
      MATTERMOST_URL: "${MATTERMOST_URL}"      # .env 값을 참조만, 값을 또 안 적음
      MATTERMOST_TOKEN: "${MATTERMOST_TOKEN}"
      # MATTERMOST_TEAM_ID는 안 적어도 된다 — 봇이 팀 하나뿐이면 자동 조회됨.
      # 팀이 여러 개인 워크스페이스라면 여기에 값을 지정해서 자동조회를 건너뛸 수 있음.
    tools:
      include:
        - list_my_teams
        - search_mattermost
        - get_channel_recent_posts
        - get_thread
        - get_user_by_username
        - get_user_by_id
        - list_channels_for_team
```

등록 후:

```bash
hermes chat
```

켜서 `/reload-mcp` 실행 → "지금 쓸 수 있는 MCP 도구 뭐 있어?"로 확인 →
"지난주에 배포 관련해서 뭐라고 얘기했었는지 찾아봐"(검색), "이 채널 최근에
무슨 얘기 오갔는지 훑어봐줘"(최근 조회), "그 스레드 전체 내용 보여줘"(스레드)
같은 서로 다른 유형의 질문을 던져서 AI가 매번 맞는 도구를 고르는지 테스트.

## team_id 처리 방식

team_id를 필요로 하는 도구(`search_mattermost`, `list_channels_for_team`)는
아래 순서로 값을 정한다:

1. 도구 호출 시 `team_id` 인자를 직접 줬으면 그 값
2. 아니면 `MATTERMOST_TEAM_ID` 환경변수 값
3. 둘 다 없으면 `list_my_teams`를 내부적으로 호출해서 자동 판단:
   - 봇이 가입된 팀이 **하나**면 그 팀으로 자동 확정 (이후 호출부턴 캐싱해서
     매번 다시 조회하지 않음)
   - **여러 개**면 자동으로 못 고르니 에러를 내고, 어떤 팀들이 있는지
     목록까지 에러 메시지에 넣어준다 — LLM이 이 메시지를 보고 `list_my_teams`를
     불러 team_id를 확인한 뒤 다시 시도하면 된다
   - **하나도 없으면**(봇이 아직 어느 팀에도 안 들어가 있으면) 봇을 팀에
     초대하라는 에러

즉 team_id는 "팀 가입 전엔 알 수 없다"는 문제를 해결하려고 **아예 안 정해도
되는 값**으로 만들었다 — 단일 팀 환경(지금 우리 프로젝트처럼)이면 아무것도
안 넣어도 알아서 동작한다.

## search_mattermost 파라미터

- `query`: 검색어. 비워두고 `from_user`/`in_channel`만으로 필터링해도 됨.
- `from_user`: 특정 사람이 쓴 메시지만. **username**을 넣어야 함(user_id 아님 —
  모르면 `get_user_by_id`로 먼저 변환).
- `in_channel`: 특정 채널로 범위 좁히기. **채널명**(channel name, 표시 이름 아님).
- 내부적으로 `from:`/`in:` 검색 문법으로 조립해서 Mattermost API에 보냄 — LLM이
  검색 문법을 직접 몰라도 되게 하려고 파라미터로 분리해둠.

## 스레드 관련 동작

`search_mattermost`는 스레드 답글도 원글과 동일하게 검색 대상이지만, **매치된
개별 post 하나만** 돌려주고 스레드 전체를 묶어서 주지는 않는다. 결과의
`root_id`가 채워져 있으면 그 post는 답글이라는 뜻. 스레드 전체 맥락이 필요하면
그 값(또는 원글이면 `post_id`)으로 `get_thread`를 이어서 호출하면 된다.

## 아직 안 된 것 (프로토타입 범위 밖)

- 비밀정보 필터링 (기획서 "권한·비밀정보 필터를 통과한 지식만 공유된다"에
  해당하는 부분 — 지금은 조회 결과를 그대로 반환함)
- 채널별 접근 권한을 요청자(발신자)별로 다르게 주는 것 (지금은 봇 하나의
  채널 멤버십 기준으로만 필터링됨)
- 파일 검색 (`files/search`), 자동완성 (`posts/search/autocomplete`) 등
  나머지 조회 API는 아직 안 붙임 — 필요해지면 같은 패턴으로 추가하면 됨

이 항목들은 "팀 협업 지능 레이어" 본 개발에서 다뤄야 할 것들이고, 이 프로토타입은
"MCP로 여러 조회 도구를 붙여놓고 AI가 알아서 고르는 게 실제로 되는지"만
검증하는 용도.
