# Hermes 소스 딥다이브

> 분석 대상: `NousResearch/hermes-agent` (MIT), 로컬 설치본 `/Users/yeounho/.hermes/hermes-agent` 기준 (2026-07-08)
> 3개 탐색 에이전트(전체 구조/진입점, 게이트웨이/어댑터, 메모리/스킬) 결과를 종합.
> 원본은 [Artifact 페이지](https://claude.ai/code/artifact/9d18348a-34a9-4083-8dc3-75423c68dda7)로도 볼 수 있음(비공개, Team/Enterprise 플랜에서만 공유 가능해서 팀 공유는 이 문서가 기준).

## 01. 왜 이 문서인가

`PLAN.md`는 Hermes를 "검증된 심장, 포크해서 엔진으로 쓰는 개인 학습 에이전트"로 규정하고, Mattermost 통합 방식은 **A안**(Hermes 내장 게이트웨이에 훅으로 끼워넣기)과 **B안**(얇은 어댑터를 직접 짜서 가로채기) 중 8월에 재결정하기로 미뤄뒀다(`port_051/open-issues.md` 참고). 이 결정은 "Hermes가 실제로 무엇을 이미 해주고, 어디서 확장 지점을 열어두는지"를 정확히 알아야 제대로 내릴 수 있어서, 코드를 직접 읽고 정리했다.

## 02. 전체 지도

코어는 **Python**(3.11–3.13, `uv` 패키지 매니저), 터미널 UI는 **TypeScript/React(Ink)**, 데스크톱 앱은 **Electron**, 대시보드는 **FastAPI** — 여러 표면(CLI/게이트웨이/TUI/데스크톱)이 하나의 코어를 공유하는 구조다.

| 영역 | 핵심 파일 | 역할 |
|---|---|---|
| 진입점 | `hermes_cli/main.py` | argparse 부트스트랩, CLI/TUI 분기(`_resolve_use_tui`) |
| 에이전트 코어 | `run_agent.py` | `class AIAgent` — 대화 루프 |
| 도구 디스패치 | `model_tools.py` | `handle_function_call()` |
| 게이트웨이 | `gateway/run.py` | `class GatewayRunner` (약 20,000줄) |
| 메모리 | `agent/memory_manager.py` + `hermes_state.py` | SQLite/FTS5 |
| 스킬 | `tools/skills_tool.py` | agentskills.io 호환 로더 |
| 설계 철학 문서 | `AGENTS.md` | 71KB, 저장소 내부 문서 |

**AGENTS.md가 말하는 설계 원칙**: 저장소 루트의 `AGENTS.md`(AI 코딩 어시스턴트를 위한 개발 가이드)는 두 가지를 핵심 제약으로 못박는다 — **"narrow-waist core"**(코어는 최대한 안 커지게 하고 새 기능은 플러그인/스킬로 붙인다)와 **"prompt-cache sanctity"**(시스템 프롬프트를 세션 중간에 함부로 바꾸면 LLM 프리픽스 캐시가 깨져 비용/속도가 나빠지므로, 이를 건드리는 변경은 특히 신중히 리뷰한다). 새 기능 제안이 이 두 원칙과 충돌하면 반려하는 "Contribution Rubric"까지 문서화돼 있다. TeamBrain의 "별도 프로세스로 팀 지능 레이어를 만든다"는 원칙과 결이 같다.

**설정 파일이 나뉘는 지점**: `~/.hermes/config.yaml`(설정) + `~/.hermes/.env`(비밀키)로 나뉘는데, 이 설정을 읽는 코드가 세 군데(`cli.py`의 `load_cli_config()`, `hermes_cli/config.py`의 `load_config()`, `gateway/run.py`/`gateway/config.py`의 YAML 직접 읽기)로 분리돼 있다. `AGENTS.md`는 새 설정 키를 추가할 때 이 세 곳을 다 건드리지 않으면 CLI와 게이트웨이 동작이 갈라진다고 명시적으로 경고한다.

**공급망 사고의 흔적**: `pyproject.toml`의 핵심 의존성(`openai==2.24.0` 등)이 모두 "정확 버전 고정"돼 있는데, 주석에 2026년 5월 PyPI에서 있었던 **"Mini Shai-Hulud" 공급망 웜 사고** 이후 정책이 강화됐다고 적혀 있다. CLAUDE.md의 "Hermes 의존성 추가·업데이트 전 라이선스 재확인" 항목과 같은 결의 경계심이 Hermes 쪽에도 이미 있었다는 뜻 — 우리가 Hermes를 갱신할 때도 이 고정 버전을 함부로 올리지 않는 게 맞다.

## 03. 코어 에이전트 루프

`run_agent.py`의 `AIAgent` 하나가 CLI/게이트웨이/TUI/데스크톱 전부에서 공유된다. 매 턴의 흐름:

```
시스템 프롬프트 조립 → LLM 호출 → tool_calls 디스패치 → 결과 반영 후 반복 → 세션에 영속화 → (필요시) 컨텍스트 압축
```

"시스템 프롬프트 조립"이 매 턴 새로 되는 게 아니라 **세션당 한 번만 캐싱**되고 컨텍스트 압축 시점에만 다시 만들어진다는 점이 05절(메모리)의 스냅샷 캐싱과 직결된다 — 전부 prompt-cache sanctity 원칙 하나로 설명된다.

## 04. 게이트웨이 — 하나의 프로세스, 여러 플랫폼

`gateway/run.py`의 `class GatewayRunner`(20,139줄)가 `self.adapters: Dict[Platform, BasePlatformAdapter]` 하나로 Slack·Discord·Telegram·Mattermost 등 약 20개 플랫폼을 동시에 물고 있다. 각 어댑터는 `gateway/platforms/base.py`의 `BasePlatformAdapter(ABC)`를 구현하며, 필수 메서드는 3개뿐이다.

```python
async def connect(self, *, is_reconnect: bool = False) -> bool
async def disconnect(self) -> None
async def send(self, chat_id: str, content: str, reply_to=None, metadata=None) -> SendResult
```

어댑터마다 자신의 전송 루프(WebSocket 리스너 등)를 `asyncio.create_task`로 띄우고, 같은 이벤트 루프 위에서 `GatewayRunner`가 세션 만료 감시·칸반 알림·재연결 감시·핸드오프 감시 등 여러 백그라운드 워처를 나란히 돌린다 — "메신저 하나마다 봇을 따로 띄우는" 구조가 아니라 단일 프로세스 안의 협력형 멀티태스킹이다.

### Mattermost 어댑터, 실제로는 이런 모습

`plugins/platforms/mattermost/adapter.py`(1,280줄)는 별도 Mattermost SDK 없이 순수 `aiohttp`로 짜여 있다. `plugin.yaml`에 `kind: platform`로 등록된 정식 플러그인 — 즉 **이미 "포크 없이 확장 가능한 플러그인 형태"로 존재한다.**

- **REST v4**: 인증은 `GET users/me`, 발신은 `POST posts`, 파일은 `POST files` 멀티파트. 전부 `Authorization: Bearer` 헤더.
- **WebSocket**: `/api/v4/websocket`에 연결한 뒤, 헤더가 아니라 **소켓 안에서** `authentication_challenge` 메시지로 재인증한다 — REST와 인증 방식이 다르다.
- 재연결은 2초→60초 지수 백오프(+지터)지만, **401/403을 받으면 영구 포기**한다 — 토큰이 잘못됐는데 무한 재시도하지 않도록 하는 안전장치.

### 세션 격리와 접근 제어

`gateway/session.py`의 `build_session_key()`가 "세션 키의 유일한 근원"으로, 대략 다음 형태로 만들어진다.

```
agent:main:{platform}:{chat_type}:{chat_id}:{thread_id}:{user_id}
# 예: agent:main:mattermost:dm:<channel_id>
```

> **TeamBrain에 가장 중요한 사실 하나**: 세션 격리가 설정이 아니라 **키 구조 자체**에 박혀 있다. 플랫폼·대화방·스레드·사용자가 조합돼야 세션 하나가 정해지므로, "여운호가 A 채널에서 알아낸 걸 김동연 개인 세션도 알게 하는" 팀 공유는 이 키 구조 바깥에서 별도로 만들어야 한다 — 세션 데이터를 나중에 이어붙이는 정도로는 안 되고, 애초에 세션 경계를 넘나드는 저장소가 따로 필요하다는 뜻. PLAN.md ②(팀 공유 지능 레이어)가 진짜 필요한 이유가 코드 레벨로 확인된 셈이다.

Mattermost의 멘션 게이팅은 `MATTERMOST_REQUIRE_MENTION`(기본 `true`), `MATTERMOST_FREE_RESPONSE_CHANNELS`, `MATTERMOST_ALLOWED_CHANNELS` 세 환경변수로 제어된다. 단, Discord에는 있는 "멘션 순간 최근 50개 메시지를 되짚어 맥락으로 끌어오는" 히스토리 백필이 **Mattermost 어댑터엔 아직 없다.**

접근 제어는 `gateway/authz_mixin.py`의 `_is_user_authorized()` 한 곳에서 웹훅 우회 → 그룹 허용목록 → `*_ALLOW_ALL_USERS` → 역할 기반 인증 → 페어링 저장소 → `*_ALLOWED_USERS` 환경변수 → 기본 거부 순으로 계단식 판정한다. 모르는 사용자가 DM을 보내면 `gateway/pairing.py`가 8자리 코드(솔트+SHA256 해시, 10분당 1회 제한, 5회 실패 시 1시간 잠금)를 발급해 `hermes pairing approve`로 승인하는 흐름도 이미 구현돼 있다.

> **일부러 없앤 기능 — 배운 교훈**: `_platform_reconnect_watcher()`의 주석에 따르면, 예전엔 반복 실패 시 **자동으로** 플랫폼 연결을 일시정지시키는 로직이 있었는데, 이게 "일시적 DNS 장애 후에도 봇이 조용히 죽어있는" 사고의 원인이었다며 **의도적으로 제거**했다. 지금은 실패해도 최대 300초 캡으로 영원히 재시도하고, `/platform pause`로 사람이 직접 멈춰야만 멈춘다. "자동화가 항상 더 안전한 건 아니다"를 코드로 남긴 사례.

## 05. 메모리 — 압축 요약 + 전문 검색의 2계층

`tools/memory_tool.py`의 `MemoryStore`가 MEMORY.md(2,200자)/USER.md(1,375자) 예산을 관리한다. `add`/`replace`는 예산 초과 시 그냥 잘라내는 게 아니라 **에러를 반환하고 에이전트에게 스스로 합치거나 지우게** 시킨다 — 같은 턴에서 3번 넘게 실패하면 그제서야 포기 메시지를 낸다(무한 루프 방지). 디스크에 있는 파일이 손상됐거나 항목이 예산을 넘으면 `.bak.<timestamp>`로 백업하고 쓰기를 거부하는 방어 로직도 있다.

> **"세션당 한 번만 캡처된다"는 말의 정확한 의미**: `agent._cached_system_prompt`는 세션 시작 시 한 번 만들어지고, `memory` 도구로 중간에 add/replace/remove를 해도 디스크엔 바로 반영되지만 **프롬프트 캐시는 건드리지 않는다.** 유일한 예외는 컨텍스트 압축(compression) 시점 — 그때만 `invalidate_system_prompt()`가 캐시를 지우고 memory를 다시 읽어온다. "한 번"이 아니라 "세션 시작 + 압축 경계마다"가 더 정확하다.

전체 대화 원문은 `hermes_state.py`의 SQLite(`~/.hermes/state.db`)에 쌓이고, FTS5 가상 테이블(`messages_fts`)로 검색된다. 한글/한자처럼 기본 `unicode61` 토크나이저가 잘 못 쪼개는 문자 때문에 **트라이그램 토크나이저를 쓰는 `messages_fts_trigram` 테이블을 별도로 둔다** — CJK 지원이 애초에 설계에 들어가 있었다는 뜻. `session_search` 도구 하나가 검색(discover)/스크롤/전체읽기/브라우즈 네 가지 모드로 동작한다.

보존 정책은 기본 `auto_prune: false`, 켜면 `retention_days: 90`(끝난 세션만) + 삭제된 게 있을 때만 `vacuum()` 실행(VACUUM은 쓰기를 막으므로 불필요할 땐 안 돌림).

### Honcho 딜렉틱 모델링

외부 메모리 provider는 한 번에 하나만 활성화되며(`memory.provider` 설정), Honcho는 `contextCadence`(기반 맥락 새로고침 주기)와 `dialecticCadence`(LLM 추론 실행 주기)를 **서로 독립적으로** 조절할 수 있고, 결과가 비어있는 게 반복되면 주기를 스스로 넓히는 적응형 로직까지 있다(`_effective_cadence()`). `dialectic_depth`(1~3)는 한 번에 몇 단계 추론(cold/warm 선택 → 자기검토 → 조정)을 돌릴지 결정한다.

## 06. 스킬 — 점진적 공개와 자기개선 루프

`SKILL.md`는 YAML 프론트매터 + 마크다운 본문으로, **agentskills.io 공개 표준**을 그대로 따른다. 항상 프롬프트에는 목차(1단계)만 있고, 실제 내용은 `skill_view()`로 필요할 때만 로드된다(2·3단계) — 목차 자체도 메모리+디스크 스냅샷 2중 캐시로 관리돼 파일을 매번 스캔하지 않는다.

> **에이전트가 스스로 스킬을 쓰는 방법**: `agent/background_review.py`가 매 턴이 끝난 뒤 **살아있는 에이전트를 포크**해서 "방금 대화에서 저장하거나 갱신할 만한 스킬/메모리가 있나?"를 스스로 되묻는다. 이 포크는 메모리·스킬 관리 도구만 쓸 수 있게 제한되고, 부모의 캐시된 프롬프트를 그대로 물려받아 프리픽스 캐시를 깨지 않는다 — "자기개선 루프"가 별도 백그라운드 평가 단계로 명확히 분리돼 있다는 것.

큐레이터는 허브(agentskills.io)에서 설치한 스킬은 절대 자동 정리하지 않고, 에이전트가 스스로 만든 스킬만 비활성 기간이 지나면 정리 대상으로 삼는다 — 출처에 따라 신뢰 수준을 다르게 취급한다.

## 07. TeamBrain 관점 정리

### 그대로 가져다 쓸 수 있는 것

- Mattermost REST v4 + WebSocket 연동 코드 전체 (재구현 불필요)
- 멘션 게이팅·채널 허용목록·DM 페어링·역할 기반 접근 제어 (검증된 패턴)
- 메모리 2계층 구조(압축 요약 + FTS5 전문 검색) — PLAN.md의 "1차는 Mattermost DB, 나머지는 Hermes가 담당" 결정과 그대로 맞아떨어짐

### A안 vs B안 — 새로 확인된 사실

이번 딥다이브에서 **A안(내장 게이트웨이에 훅으로 끼워넣기)이 처음 생각보다 구체적으로 가능해 보이는 근거**가 나왔다. 저장소에는 두 개의 공식 확장점이 이미 문서화돼 있다.

- **Middleware 훅** (`docs/middleware/README.md`): `llm_request`/`tool_request`/`llm_execution`/`tool_execution` 콜백으로 요청·실행 자체를 가로채거나 바꿀 수 있음. `register(ctx)`로 등록.
- **Observability 훅** (`docs/observability/README.md`): 세션/턴/도구/승인 등 생명주기 이벤트를 읽기 전용으로 구독. Langfuse, NeMo Relay 플러그인이 이 방식.

> **단, 결정적 제약 하나**: 두 훅 모두 `session_id`/`turn_id` 단위로 호출된다 — 즉 **"이 순간 이 세션에서 일어난 일"에 개입하는 훅이지, 여러 세션의 데이터를 한데 모아 조회하는 통로가 아니다.** 04절에서 확인한 `build_session_key()`의 세션 격리는 훅 레이어에서도 그대로다. 그래서 A안을 택하더라도, 미들웨어 훅은 "각 세션에서 일어난 일을 팀 지식 저장소에 기록·조회하는 파이프"로만 쓸 수 있고, 그 팀 지식 저장소 자체(②번 레이어)는 어차피 우리가 별도로 만들어야 한다 — PLAN.md의 "①②는 우리가 만든다"는 결론은 그대로 유지된다. 다만 **①(Mattermost 어댑터를 완전히 새로 짜는 대신, 미들웨어 훅으로 기존 어댑터에 끼워넣는 방식)의 실현 가능성은 이번에 구체적으로 높아졌다** — 8월 재결정 때 "A안 = 미들웨어 훅 활용"을 유력한 기본안으로 검토해볼 만하다.

### 구현 전 재확인이 필요한 것

- 미들웨어 훅이 세션 *간* 통신(예: 다른 세션에 알림을 보내거나 다른 세션의 상태를 읽는 것)까지 지원하는지 — 이건 이번 탐색에서 확인 안 된 부분이라 실제 프로토타입으로 검증 필요.
- Nous Portal의 "유료 구독" 성격 — 정식 API 키 종량제 결제인지, 개인 웹 구독 재활용인지(후자면 약관 위반 소지, `experiments/hermes-slack/2026-07-07/dongyeon/hermes.md` §3 참고) 팀/멘토와 짚어야 함.

## 08. 라이선스 확인

저장소 루트 `LICENSE` 파일 확인 결과:

```
MIT License

Copyright (c) 2025 Nous Research
```

CLAUDE.md 4번 항목("Hermes MIT 저작권 고지는 포크·vendoring한 곳 어디든 유지")을 지키려면, 나중에 Hermes 코드를 우리 레포에 vendoring하거나 포크할 때 이 고지 문구를 그대로 옮겨야 한다 — 지금은 아직 이 레포에 Hermes 코드 자체를 들여온 게 없으니 당장 조치할 건 없고, 실제로 포크/vendoring하는 시점에 확인 목록에 넣어두면 된다.
