# Mattermost Bot/Integration API 딥다이브

> 분석 대상: Mattermost 공식 개발자 문서(developers.mattermost.com, api.mattermost.com), 공식 GitHub 소스(`mattermost/mattermost`), 커뮤니티 봇 프레임워크(`mmpy_bot`, `python-mattermost-driver`) (2026-07-08 조사)
> `port_051/hermes-deep-dive.md` 04절("Mattermost 어댑터, 실제로는 이런 모습")과 서로 교차검증됨 — 이 문서는 "공식 API가 뭘 제공하는가"를, hermes-deep-dive.md는 "Hermes가 그걸 실제로 어떻게 구현했는가"를 다룬다.

## 01. 왜 이 문서인가

우리 어댑터(①)는 반드시 Mattermost 소스를 건드리지 않고 공개 REST/WebSocket API만으로 별도 프로세스로 동작해야 한다(CLAUDE.md 라이선스 제약, PLAN.md Phase 6). A안(Hermes 내장 게이트웨이 재사용)이든 B안(직접 어댑터)이든, 결국 이 공개 API 표면을 정확히 알아야 8월 재결정을 제대로 할 수 있다.

## 02. 인증 3종과 우리 선택

| 방식 | 특징 | 우리 케이스 적합성 |
|---|---|---|
| **Bot Access Token** | 로그인 불가능한 서비스 계정 전용. Enterprise 유저 수 계산에 안 잡힘 | ✅ 팀 전체가 상시 멘션하는 자체호스팅 봇에 정확히 맞음 |
| Personal Access Token | 실제 사람 계정에 발급, 만료 없음 | ❌ 그 사람 퇴사/계정삭제 시 봇이 죽음 |
| OAuth2 App | 사용자가 매번 위임(authorize)하는 서드파티 통합용 | ❌ 우리 시나리오와 안 맞음 |

Bot Access Token 발급은 System Console → Integrations → Bot Accounts에서 **Team Edition(무료)도 그대로 가능** — Enterprise 전용 기능 아님. 권한은 세밀한 스코프가 아니라 "전체/공개 채널만" 토글 + Member/System Admin 두 축뿐이라, 세밀 제어가 필요하면 봇을 채널 멤버로 명시적으로 관리해야 한다.
([Bot accounts](https://developers.mattermost.com/integrate/reference/bot-accounts/), [Personal access tokens](https://developers.mattermost.com/integrate/reference/personal-access-token/), [OAuth2](https://developers.mattermost.com/integrate/apps/authentication/oauth2/), [Editions and Offerings](https://docs.mattermost.com/product-overview/editions-and-offerings.html))

## 03. REST API 표면

- 포스트 생성: `POST /api/v4/posts` — `channel_id`, `message` 필수. 스레드 답글은 `root_id`(반드시 스레드의 "루트" 포스트 ID)로 만든다. `file_ids`(최대 5개), `metadata.priority` 등도 지원.
- 레이트리밋: **기본 비활성화**. 켜면 기본값 `PerSec: 10`, `MaxBurst: 100`. 응답 헤더 `X-Ratelimit-Limit`/`Remaining`/`Reset`. 공식 문서가 이 기능 자체를 "소규모 배포용"이라고 명시 — 우리가 자체호스팅+실서비스로 갈 때는 헤더 체크와 backoff을 설계에 넣어야 함.
- 리스트 엔드포인트는 대체로 `page`/`per_page` 쿼리 파라미터 관례.
([posts.yaml](https://github.com/mattermost/mattermost-api-reference/blob/master/v4/source/posts.yaml), [Rate limiting settings](https://docs.mattermost.com/configure/rate-limiting-configuration-settings.html))

## 04. WebSocket API

- `/api/v4/websocket`에 연결 후 **소켓 안에서** `{"seq": n, "action": "authentication_challenge", "data": {"token": "..."}}`로 인증 — REST(헤더 기반)와 인증 방식이 다르다. 성공 시 `hello` 이벤트.
- 주요 이벤트: `posted`(신규 메시지), `post_edited`, `post_deleted`, `channel_viewed`, `typing`, `channel_created` 등.
- **멘션 판별**: `posted` 이벤트 data의 `mentions` 필드(서버가 브로드캐스트 대상 계산용으로 이미 계산해서 내려줌)에 봇의 user_id가 있으면 멘션된 것 — 이를 1차로 신뢰하고 `@botname` 텍스트 파싱을 폴백으로 병행하는 게 실무 관행.
- 재연결에 강제 프로토콜은 없고, 커뮤니티 라이브러리(`python-mattermost-driver`)는 `keepalive` 옵션으로 자동 재연결한다. **이벤트 유실 대비**: 재연결 후 REST로 최근 포스트를 다시 조회하는 catch-up 로직이 실무 권장 패턴.
([introduction.yaml](https://github.com/mattermost/mattermost-api-reference/blob/master/v4/source/introduction.yaml), [python-mattermost-driver](https://github.com/Vaelor/python-mattermost-driver))

> **hermes-deep-dive.md와 교차검증**: Hermes의 실제 Mattermost 어댑터(`plugins/platforms/mattermost/adapter.py`)도 정확히 이 구조다 — REST v4로 인증(`GET users/me`)·발신(`POST posts`), WebSocket은 소켓 안에서 `authentication_challenge`. 재연결은 2초→60초 지수 백오프(+지터)지만 401/403은 영구 포기. 공식 문서 기반 조사와 실제 구현체가 정확히 일치해서, 이 API 이해를 A안/B안 어느 쪽에도 그대로 적용할 수 있다는 확신이 생겼다.

## 05. 실전 구현 사례 — 참고용 레퍼런스

- **mmpy_bot** (`attzonko/mmpy_bot`): WebSocket + REST를 결합한 순수 외부 프로세스 봇 프레임워크. 플러그인 방식, 자동 재연결, asyncio, 잡 스케줄링 지원 — Mattermost 서버를 전혀 건드리지 않는, 정확히 우리가 원하는 아키텍처의 참고 사례.
- **python-mattermost-driver** (`Vaelor/python-mattermost-driver`): REST(`login()`) + WebSocket(`init_websocket()`) 저수준 드라이버.
- 공통 패턴: **REST 로그인/조회 → WebSocket 이벤트 구독 → 트리거 시 REST 응답**. 라이선스 재확인 후 참고/vendoring 후보.

## 06. 라이선스 확인 — PLAN.md 정정 필요 발견

공식 `LICENSE.txt`([mattermost/mattermost](https://github.com/mattermost/mattermost/blob/master/LICENSE.txt)) 확인 결과: **`server/public/`, `webapp/`, `server/templates/`, `server/i18n/`("Admin Tools and Configuration Files")만 Apache License 2.0**이고, 그 외 서버 소스는 AGPLv3다. "바이너리는 MIT"라는 표현은 공식 문서 어디에도 없었다 — PLAN.md Phase 6 표(155행)의 "바이너리=MIT" 서술을 이 근거로 정정함(아래 04번 항목 참고).

LICENSE.txt는 "Admin Tools/Configuration Files(Apache 2.0 부분)만 쓰고 소스를 개조하지 않은 애플리케이션"에 대해서는 AGPL 카피레프트를 집행하지 않겠다고 명시한다. 우리 시나리오(소스에 링크조차 안 하고 REST/WebSocket만 호출)는 이보다 더 안전한 케이스로 보이나, **이를 명시적으로 확인해주는 공식 문장은 못 찾았다** — 논리적 추론이지 공식 확답은 아니므로, 상업 출시 전 법률 전문가 최종 검토가 필요하다(PLAN.md Phase 6-1과 동일한 유보).

## 07. 우리 어댑터 설계에 바로 적용할 것

1. Bot Access Token으로 인증 → REST(로그인/채널조회/포스트) + WebSocket(`posted` 구독) 하이브리드.
2. 스레드는 `root_id`, 멘션 판별은 `mentions` 배열 우선 + 텍스트 파싱 폴백.
3. 레이트리밋 헤더 상시 체크 + backoff.
4. WebSocket 재연결 직후 REST catch-up으로 이벤트 유실 보완.
5. mmpy_bot/python-mattermost-driver를 구현 참고 레퍼런스로 활용 가능(vendoring 시 각 라이브러리 라이선스 별도 확인 필요 — 이번 조사에선 미확인).

## 08. 불확실/추가 검증 필요

- "REST/WebSocket만 쓰는 완전 별도 프로세스"에 대한 AGPL 미적용 공식 확답 없음 (06절 참고).
- `reaction_added` 등 일부 이벤트의 정확한 payload 스키마는 introduction.yaml 목록 확인에 그침 — 필요 시 `server/public/model` 소스 직접 확인 필요.
- mmpy_bot/python-mattermost-driver 정확한 라이선스 재확인 필요.
