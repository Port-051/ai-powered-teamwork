# Mattermost 서버 소스 분석 (2026-07-08)

`github.com/mattermost/mattermost` (server/) 소스코드를 얕게 클론해서 직접
읽고 정리한 노트. 목적은 PLAN.md Phase 4의 ①②③(팀 지능 레이어 통합 방식)
설계 근거를 만드는 것.

> **주의**: 이 분석용으로 클론한 Mattermost 소스는 스크래치패드에만 있고
> 우리 레포에는 안 들어감. CLAUDE.md 원칙대로 우리는 이 소스를 **절대
> 수정하지 않고 읽기만** 했음 — 실제 연동은 REST/WebSocket API로만 한다.

**왜 `server/public/` 위주로만 봤는가**: 이 폴더는 Mattermost가 외부에서
쓰라고 공식적으로 노출한 부분(REST API가 주고받는 데이터 구조,
플러그인이 구현할 인터페이스 등)이고, `server/channels/`,
`server/services/` 같은 나머지는 서버 내부 구현이라 API로 연동만 하는
우리 입장에선 신경 쓸 필요가 없다. 오히려 내부 구현까지 파고드는 건
"소스를 깊이 이해해서 수정하려는 것"처럼 보여 우리 원칙(순정 설치 +
API 연동만)과 방향이 안 맞는다 — 그래서 `public/`만 본 건 시간 절약이
아니라, 우리가 실제로 API로 접할 수 있는 전부이기 때문이다.

---

## 0. 레포 전체 구조 — 뭘 안 봤고 왜 안 봤는가

`mattermost/mattermost` 레포는 `server/` 말고도 여러 최상위 폴더가 있다.
우리가 안 본 것들과 그 이유를 정리하면:

| 폴더 | 내용 | 우리가 본 것과 무관한 이유 |
|---|---|---|
| `webapp/` | 공식 웹 클라이언트(React) 소스 | 우리는 이 화면을 그대로 쓰기만 함 — 우리가 새로 만들 부분이 아님 |
| (모바일 앱, 보통 별도 레포) | 공식 모바일 앱 | 마찬가지로 클라이언트단, 우리와 무관 |
| `e2e-tests/` | Mattermost 자체 테스트 코드 | Mattermost 팀의 QA용, 우리 프로젝트엔 참고 가치 없음 |
| `server/channels/`, `server/services/` 등 | 서버 내부 구현(핸들러, DB 쿼리, 비즈니스 로직) | API 연동만 하는 우리 입장에선 결과(응답 형식)만 알면 되고, 내부에서 어떻게 처리하는지는 볼 필요 없음 |

**우리가 집중해서 본 것 — `server/public/`**: Mattermost가 "외부에서
쓰라"고 공식적으로 노출한 부분만 여기 모여 있다. 구체적으로:

- `server/public/model/` — REST API가 주고받는 데이터 구조 (`channel.go`,
  `post.go`, `websocket_message.go`, `permission.go`, `role.go` 등)
- `server/public/plugin/` — 플러그인이 구현해야 할 인터페이스(`hooks.go`)

**코드 대신 봐도 되는 대안 — 공식 API 문서**: 지금처럼 설계 단계에서
"뭘 할 수 있는지" 파악할 땐 소스를 직접 읽는 게 맞지만, 나중에 실제
구현 단계에서 "이 엔드포인트에 어떤 파라미터를 넣어야 하는지" 같은
디테일을 찾을 땐 Mattermost가 공개한 REST API 레퍼런스(OpenAPI 스펙
기반)를 보는 게 소스 읽는 것보다 더 편하다 — 코드 분석은 "설계 근거
확보용", API 문서는 "실제 구현할 때 참고서용"으로 역할이 다르다.

---

## 1. 플러그인 시스템 (hooks.go)

`server/public/plugin/hooks.go` 에 정의된 Hooks 인터페이스에 **40개 이상의
훅**이 있음. 그중 우리 맥락에서 의미 있는 것들:

- **메시지 관련**: `MessageWillBePosted`(등록 전, 내용 수정/차단 가능),
  `MessageHasBeenPosted`(등록 후 통지), `MessageWillBeUpdated`,
  `MessagesWillBeConsumed`(클라이언트가 읽기 직전 — 마스킹 등 가능),
  `MessageHasBeenDeleted`
- **채널/팀 멤버십**: `ChannelHasBeenCreated`, `UserHasJoinedChannel`,
  `UserHasLeftChannel`, `TeamMemberWillBeAdded`, `UserHasJoinedTeam`
- **실시간**: `WebSocketMessageHasBeenPosted`, `OnWebSocketConnect/Disconnect`
- **기타**: 파일 업로드/다운로드, 리액션, 슬래시 커맨드(`ExecuteCommand`)

**확인된 사실**: 플러그인은 Mattermost 서버 **프로세스 안에서 실행**되는
구조(Go 인터페이스를 구현해 서버가 직접 호출)다. 이게 CLAUDE.md에서
플러그인 방식을 금지한 이유를 소스 레벨에서 재확인해준다 — 플러그인은
서버 바이너리와 한 몸으로 동작하므로 파생저작물 논란에서 자유롭기
어렵고, AGPL 전파 리스크가 커진다. 반대로 REST/WebSocket API는 완전히
분리된 프로세스가 네트워크로 대화하는 구조라 우리가 채택한 "순정 설치 +
외부 API 연동"(C안) 원칙과 정확히 일치한다.

**PLAN.md Phase 8 A/B안에 대한 시사점**: A안("Hermes 내장 게이트웨이를
플러그인·이벤트 훅으로 확장")이라는 표현이 있는데, 만약 이게 "Mattermost
플러그인"을 의미하는 거라면 라이선스 원칙과 충돌한다. 하지만 실제로는
Hermes 쪽 게이트웨이가 REST/WebSocket로 폴링·구독하는 방식이라 "Hermes
프로세스 안의 이벤트 훅"을 뜻하는 것으로 보이며, 이는 Mattermost 플러그인
훅과는 다른 개념이다. **8월 재결정 시 이 구분을 명확히 하고 넘어가야 함**
— "Mattermost 플러그인 훅"과 "별도 프로세스가 API로 받는 이벤트"를 헷갈리면
안 됨.

---

## 2. REST API v4 — 우리가 실제로 쓸 만한 엔드포인트

`server/public/model/client4.go` 에 클라이언트 메서드가 정의돼 있고, 실제
라우트는 `/api/v4/...` 패턴. 이미 `team-intelligence/src/mattermost.ts`에서
쓰고 있는 것도 이 client4 라우트 구조를 그대로 반영한 것.

- **채널**: `GET /channels`, `/teams/{id}/channels`,
  `/channels/{id}/members` — 채널 목록·멤버 조회 (이미 mattermost.ts에서
  `listPublicChannels` 로 사용 중)
- **포스트**: `GET /channels/{id}/posts` (스레드/시간순 조회, 이미
  `getRecentPosts`로 사용 중), `POST /posts` (봇이 답장 보낼 때)
- **웹훅**: `incoming_webhooks`, `outgoing_webhooks` 라우트 존재 —
  아웃고잉 웹훅은 "특정 키워드/채널에 메시지가 오면 우리 서버로 HTTP
  콜백"을 서버가 대신 해주는 기능. **폴링 없이 멘션을 받는 대안**이 될 수
  있음(단, Hermes가 이미 WebSocket 구독을 내장하고 있어 우리가 굳이
  아웃고잉 웹훅을 쓸 필요는 크지 않아 보임 — 참고용으로만 기록)
- **팀/유저**: `GetUsersInChannel`, `SearchUsers`,
  `GetTeamsUnreadForUser` 등 — 팀원 매핑, 안 읽은 대화 추적에 쓸 수 있음
- **스레드**: `userThreadsRoute`, `userThreadRoute` — 스레드 단위로 최근
  대화 묶음을 가져올 수 있어 보임 (Hermes의 "세션=대화방" 개념과 결이
  다름 — 스레드 단위 지식 정리에 참고할만함)

---

## 3. WebSocket 이벤트

`server/public/model/websocket_message.go` 에 이벤트 타입이 문자열
상수로 60개 이상 정의돼 있음. 실시간으로 메시지를 받는 데 폴링이 필요
없다는 걸 확인.

핵심 이벤트:
- `posted` — 새 메시지 등록 (우리가 실시간으로 받아야 할 가장 중요한
  이벤트. Hermes 게이트웨이가 이미 이걸 구독하는 구조로 추정)
- `post_edited`, `post_deleted` — 수정/삭제 반영 (팀 지식으로 저장한 뒤
  원본이 수정/삭제되면 우리 쪽 저장본도 동기화할지 결정 필요 — 아직
  미검토 이슈로 남김)
- `channel_created`, `user_added`, `direct_added`, `group_added` —
  채널 생성/멤버 변경 감지에 사용 가능
- `reaction_added` — 이모지 반응. "이 답변이 팀에 도움이 됐다"는 암묵적
  신호로 지식 체계화 엔진(Phase 4-1 ②)에 활용할 여지 있음 (아이디어
  수준, 검증 안 됨)

**결론**: 폴링 없이 WebSocket 하나로 팀 전체의 실시간 대화 흐름을 받을 수
있고, Hermes가 이미 이 구독을 내장하고 있다는 게 `hermes.md`(동연 정리)
내용과 일치함. 우리가 새로 WebSocket 클라이언트를 밑바닥부터 짤 필요는
없어 보임.

---

## 4. 권한/역할(permission/role) 시스템 — 프라이버시 필터 설계 참고용

### 채널 타입 (`server/public/model/channel.go`)

```
O  = 공개 채널 (Open)
P  = 비공개 채널 (Private)
D  = 1:1 다이렉트 메시지 (Direct)
G  = 그룹 다이렉트 메시지 (Group DM)
BO/BP = 보드(Boards) 연동용 (우리 프로젝트엔 해당 없음)
```

`IsGroupOrDirect()`, `IsOpen()` 같은 헬퍼 메서드가 이미 채널 타입을
"개인적 성격"(D/G) vs "팀/공개 성격"(O/P)으로 구분해준다.

### 역할(role) 체계 (`server/public/model/role.go`)

시스템은 계층형 역할을 미리 정의해둠: `channel_guest` < `channel_user` <
`channel_admin`, `team_guest` < `team_user` < `team_admin`,
`system_guest` < `system_user` < ... < `system_admin`. 역할마다
`Permissions` 배열(문자열 권한 id 목록)을 가짐.

### Phase 4-1 프라이버시 필터에 주는 시사점

지금 Phase 4-1에서 논의 중인 "1차 판별기(룰베이스)"를 처음부터 순수
텍스트 분류로 설계하지 않아도 된다는 게 이번 분석의 핵심 발견이다:

- **채널 타입 자체가 이미 1차 신호**: DM(D)/그룹DM(G)은 태생적으로
  "개인적" 맥락일 확률이 높고, 공개(O)/비공개 팀 채널(P)은 "팀 지식"
  맥락일 확률이 높다. 룰베이스 1차 판별기의 트리 구조(PLAN.md Phase 4-1)
  맨 앞 가지에 "채널 타입"을 넣으면, 텍스트를 보기도 전에 상당수를 걸러낼
  수 있다.
- 단, 이건 **충분조건이 아니라 힌트일 뿐** — 공개 채널에서도 개인적인
  잡담은 나올 수 있고, DM에서도 팀 지식(예: 관리자에게 물어본 업무
  절차)이 나올 수 있다. 그래서 "회색지대챗" 검증(Phase 4-1에서 이미
  계획된 부분)은 여전히 필요하다. 채널 타입은 어디까지나 1차 필터의
  가중치 신호로 쓰는 정도로 제안.
- 권한(permission) 체계는 우리 쪽에서 재구현할 필요 없음 — Mattermost가
  이미 "누가 이 채널을 볼 수 있는가"를 관리해주므로, 우리 팀 지능
  레이어는 채널 멤버십 API(`GetUsersInChannel`)를 조회해서 "이 지식을
  누구에게 노출해도 되는가"를 그대로 상속받아 쓰면 된다 — 별도의 접근
  제어 시스템을 새로 설계할 필요가 없다는 뜻.

---

## 5. TeamBrain 프로젝트 관점 정리

**PLAN.md Phase 8 미결정 사항에 이 분석이 주는 근거**:

1. **"Mattermost 통합 A/B안" (8월 재결정)** — 이번 분석으로 "Mattermost
   플러그인 훅"과 "별도 프로세스의 API 이벤트 구독"이 명확히 다른
   메커니즘임을 확인했다. A안(Hermes 게이트웨이 확장)이라는 표현을 쓸 때
   "Mattermost 플러그인을 쓴다"는 뜻이 아니라 "Hermes가 이미 하고 있는
   REST/WebSocket 연동 위에 우리 로직을 얹는다"는 뜻으로 한정해야
   라이선스 원칙(CLAUDE.md)과 충돌하지 않는다. 8월 재결정 시 이 문구를
   명확히 하고 넘어갈 것.
2. **프라이버시 필터 설계 (Phase 4-1 ①)** — 채널 타입(D/G vs O/P)을
   룰베이스 1차 판별기의 최상위 가지로 쓰면, 텍스트 분류기(인코더/LLM)를
   돌리기 전에 상당수 케이스를 값싸게 걸러낼 수 있다는 게 새로운 제안.
   기존 계획(키워드 기반 트리)에 "채널 타입"이라는 축을 하나 추가하는
   정도의 작은 확장.
3. **접근 제어를 새로 안 만들어도 됨** — 팀 지능 레이어가 지식을 누구에게
   보여줄지 결정할 때, Mattermost의 기존 채널 멤버십을 그대로 조회해서
   따르면 된다. 별도 권한 시스템을 설계할 필요가 없다는 것도 이번에 새로
   확인된 부분.
4. **WebSocket만으로 실시간성 확보 가능** — 폴링 기반 설계를 고려할
   필요 없이, Hermes가 이미 구독 중인 WebSocket 이벤트(`posted` 등)에
   우리 팀 지능 레이어가 올라타면 된다는 게 재확인됨 (동연님의
   hermes.md 내용과 일치).

**아직 이 분석으로 안 풀린 것 (추가 검증 필요)**:
- `post_edited`/`post_deleted` 발생 시 우리가 이미 팀 지식으로 축적한
  내용을 어떻게 동기화할지 — 정책 미정
- 아웃고잉 웹훅 vs WebSocket 구독 중 실제 구현에서 어느 쪽이 더 안정적인지
  — PoC 단계에서 실측 필요
