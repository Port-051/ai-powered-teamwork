# Hermes 에이전트 소스 분석 (2026-07-08)

`github.com/NousResearch/hermes-agent` (MIT, Python)을 얕게 클론해서 직접
읽고 정리한 노트. 동연님의 `hermes.md`(문서 기반 정리)보다 한 단계 더
들어가, 실제 소스코드에서 "팀 지능 레이어를 어디에 끼울 수 있는가"를
찾는 게 목적.

> 클론한 소스는 스크래치패드에만 있었고 분석 후 삭제함. Hermes는 MIT라
> Mattermost와 달리 포크·수정 자체는 법적으로 자유롭다 — 다만 아래 내용은
> "수정 없이 확장점만 써도 충분한지"를 먼저 확인하는 데 초점을 맞췄다.

---

## 1. Mattermost 게이트웨이 — 이미 완성된 어댑터

`plugins/platforms/mattermost/adapter.py` (1,281줄) 하나가 전부다.
외부 Mattermost 전용 라이브러리 없이 REST v4 + WebSocket을 직접 구현.

- **연결**: `connect()`가 REST로 봇 인증 후 `_ws_loop()`을 백그라운드로
  띄움. WebSocket URL은 `{base_url}/api/v4/websocket`로 REST URL을
  그대로 변환해서 만듦.
- **이벤트 처리**: `_handle_ws_event()`가 들어오는 이벤트를 처리.
  `channel_id = post["channel_id"]`를 뽑아 바로 라우팅 키로 씀.
- **멘션 판별**: DM은 무조건 통과, 채널은 정규식으로 `@봇이름` 패턴
  매칭. `MATTERMOST_REQUIRE_MENTION`(기본 true), `MATTERMOST_ALLOWED_CHANNELS`,
  `MATTERMOST_FREE_RESPONSE_CHANNELS` 환경변수로 세밀 제어 가능 — 이미
  Mattermost 쪽 문서(mattermost-source-analysis.md)에서 본 채널
  타입(D/G vs O/P) 개념과 그대로 맞물림.
- **설정 방식**: `plugin.yaml`에 필요한 env var가 선언적으로 정의돼
  있고 (`MATTERMOST_URL`, `MATTERMOST_TOKEN` 등), `interactive_setup()`로
  CLI 대화형 설정도 지원.

**결론**: 이 어댑터는 사실상 완성품이고, 우리가 밑바닥부터 새로 짤
이유가 코드 레벨로도 없다. 다만 이 파일 자체를 고치는 건 "포크해서
유지보수 부담을 떠안는 것"이라 — 아래 훅/프로바이더 확장점으로 충분한지
가 실질적 질문이다.

---

## 2. 세션 격리 — 정확히 `platform:chat_id` 문자열

동연님 노트의 "세션 = 대화방 단위"가 코드로 정확히 확인된다.

`gateway/run.py`에 `session_key = f"{platform_str}:{chat_id}"` 형태로
직접 조합하는 코드가 있고 (예: `"mattermost:<channel_id>"`), 이 값이
`SessionSource`/`SessionContext` 객체를 거쳐 세션 저장소 키로 그대로
쓰인다. 즉 **"팀"이나 "사용자" 개념이 세션 키 어디에도 없다** — 순수하게
`플랫폼 + 대화방 ID` 두 값만으로 완전히 격리된다.

`gateway/session.py`의 `_is_session_key_unsafe()`를 보면 세션 키가
`agent:main:<platform>:...` 같은 콜론 구분 다중 세그먼트를 이미
허용하는 구조다 — 이론적으로는 세션 키 생성 지점(`_session_key_for_source`,
`build_session_key`, 코드베이스 전체에 12곳 이상 호출부 산재)에 팀
ID를 세그먼트로 끼워 넣는 패치가 가능하긴 하다. 하지만 **호출부가
`gateway/run.py` 한 파일에 십여 곳 넘게 흩어져 있어서, 이 경로로
가려면 사실상 Hermes 코어를 포크해서 유지보수해야 한다** — 나중에
Hermes가 업스트림에서 업데이트될 때마다 병합 충돌 위험을 계속 안고
가는 것. 세션 키 레벨 개입은 비추천.

---

## 3. 메모리 Provider 인터페이스 — 가장 유력한 확장점

`agent/memory_provider.py`에 `MemoryProvider` 추상 클래스(ABC)가 정의돼
있고, 이게 Honcho/Mem0/Hindsight 등 9종 외부 메모리가 실제로 구현하는
공식 인터페이스다. 문서 레벨 짐작이 아니라 코드로 확인됨.

**핵심 메서드**(구현 필수):
- `is_available()` — 설정/자격증명 확인
- `initialize(session_id, **kwargs)` — `platform`, `user_id`,
  `agent_workspace` 등을 kwargs로 받음
- `system_prompt_block()` — 시스템 프롬프트에 넣을 정적 텍스트
- `prefetch(query, session_id=...)` — **매 턴 시작 전 호출**, 관련
  맥락을 텍스트로 반환 (팀 지식을 여기서 주입하면 됨)
- `sync_turn(user_content, assistant_content, session_id=..., messages=...)`
  — **매 턴 종료 후 호출**, 대화 내용을 백엔드에 기록 (팀 지식으로
  올릴지 판별·저장하는 지점)
- `get_tool_schemas()` / `handle_tool_call()` — 필요하면 도구(함수
  호출)도 노출 가능

**선택 훅**(오버라이드하면 켜짐): `on_turn_start`, `on_session_end`,
`on_session_switch`, `on_pre_compress`, `on_memory_write`,
`on_delegation`, `backup_paths`.

**결정적 제약**: 파일 상단 주석에 명시됨 — *"MemoryManager enforces
a one-external-provider limit to prevent tool schema bloat and
conflicting memory backends. Only one external provider runs at a
time."* 즉 **Honcho를 쓰는 동시에 우리 팀 지식 프로바이더를 또 쓸 수
없다** — 하나만 골라야 한다. `hermes_cli/memory_providers.py`에
`plugins/<name>/`로 배치하고 `memory.provider` config 키로 활성화하는
등록 방식이 선언적으로 돼 있어, 우리가 새 provider를 플러그인
디렉토리 규격에 맞춰 넣으면 등록 자체는 어렵지 않다.

**왜 이게 최선의 확장점인가**: (1) 공식 인터페이스라 업스트림
업데이트에도 안 깨짐, (2) `prefetch`/`sync_turn`이 정확히 우리가
필요한 지점(대화 읽기·쓰기)과 일치, (3) `platform`/`user_id` kwargs가
이미 들어오므로 "이 사용자가 어느 팀 소속인지" 매핑만 우리 쪽에서
관리하면 됨.

---

## 4. 이벤트 훅 시스템 — 별도 파일 기반, 가볍지만 범위가 다름

`gateway/hooks.py` (227줄)에 `HookRegistry`가 있다. `~/.hermes/hooks/`
아래 `HOOK.yaml` + `handler.py`(async `handle(event_type, context)`)
쌍을 발견해서 로드하는 구조 — Mattermost 쪽 플러그인 훅(서버 프로세스
내장)과는 전혀 다른, **Hermes 자체 프로세스 안에서 도는 경량 이벤트
시스템**이다.

이벤트 종류: `gateway:startup`, `session:start`, `session:end`,
`session:reset`, `agent:start`, `agent:step`, `agent:end`,
`command:*`. `agent:start`/`agent:end` 컨텍스트엔 `platform`,
`user_id`, `chat_id`, `session_id`, `message`(500자 절단),
`response`(end만) 가 담김.

`_register_builtin_hooks()`가 현재는 빈 채로 "미래를 위한 확장점"이라고
주석에 적혀 있어 — 아직 아무도 기본 내장 훅을 안 만들었다는 뜻. 우리가
`~/.hermes/hooks/`에 핸들러 파일 하나 떨어뜨리면 코드 수정 없이 바로
동작한다(파일 발견 방식이라 배포도 쉬움). 다만 이 훅은 **본문 500자로
잘려서 넘어오고, 대화 원문 전체나 메모리 조작 API에 직접 접근하는
용도가 아니라 "이벤트 발생을 옆에서 관찰"하는 용도**에 가깝다 — 로깅,
알림, 트리거성 작업엔 적합하지만 팀 지식을 실제로 프롬프트에 주입하는
역할은 메모리 provider 쪽이 정공법이다.

---

## 5. TeamBrain 프로젝트 관점 정리

**PLAN.md Phase 8 "Mattermost 통합 A안 vs B안"에 대한 근거**:

코드를 직접 보고 나니 A안(Hermes 내장 게이트웨이 확장)이 코드 레벨로
훨씬 현실적이다. 이유:

1. Mattermost 어댑터(`plugins/platforms/mattermost/adapter.py`)는 이미
   완성돼 있고, REST/WebSocket 프로토콜 세부사항(인증, 재연결, 파일
   업로드, 스레드 모드)까지 다 구현돼 있다. B안(얇은 어댑터를 직접
   짜기)을 택하면 이 1,281줄짜리 구현을 처음부터 다시 만드는 셈이고,
   Mattermost API 변경·엣지케이스 대응 부담을 전부 우리가 진다.
2. A안이라고 해서 Hermes 코어를 포크할 필요도 없다 — **메모리
   Provider 인터페이스(`agent/memory_provider.py`)가 코드 수정 없이
   꽂을 수 있는 공식 확장점**이라, "Hermes 게이트웨이 확장"은 사실상
   "새 memory provider 플러그인 하나 추가"로 구현 가능하다는 게 이번
   분석의 핵심 발견이다.
3. 단, **한 프로세스에 외부 메모리 provider는 하나만** 허용된다는
   제약이 있다 — 만약 나중에 Honcho(딜렉틱 사용자 모델링)도 같이 쓰고
   싶다면, 우리 팀 지식 provider 안에서 Honcho를 내부적으로 호출하는
   식으로 합치거나, 팀 지식 provider 자체가 개인 모델링까지 흡수하는
   설계를 고려해야 한다 — 8월 재결정 시 같이 짚어야 할 사항.
4. 이벤트 훅 시스템(`gateway/hooks.py`)은 보조 용도로 병행 가능 —
   예를 들어 "팀 지식이 새로 추가됐을 때 관련 채널에 알림 보내기"
   같은 부가 기능은 훅으로, 실제 지식 주입·저장은 provider로 역할
   분담하면 깔끔하다.
5. 세션 격리(`platform:chat_id` 키)를 코어 레벨에서 바꾸는 접근은
   호출부가 코드베이스 전역에 흩어져 있어 유지보수 비용이 크므로
   **비추천** — "세션은 그대로 대화방 단위로 두고, provider가 여러
   세션에 걸쳐 지식을 공유"하는 지금 설계(PLAN.md ③ 개인↔팀 지식
   브릿지)가 코드 구조와도 자연스럽게 맞아떨어진다.

**아직 안 풀린 것**: memory provider의 `initialize()`가 세션당 한 번
호출되는데, 여기서 "이 세션이 어느 팀/워크스페이스 소속인지"를 어떻게
알아낼지(설정 파일? 채널ID→팀 매핑 테이블?)는 우리 쪽에서 별도 설계가
필요하다 — Hermes 코드엔 "팀" 개념 자체가 아예 없기 때문에 당연히
없는 부분.
