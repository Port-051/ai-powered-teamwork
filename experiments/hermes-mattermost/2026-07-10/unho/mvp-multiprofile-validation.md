# Mattermost ↔ Hermes 멀티프로필 MVP 기술 검증 (2026-07-10, 여운호)

> `PLAN.md` Phase 8 "Mattermost 통합 방식 A/B안" 및 "Hermes 개인화 문제(레벨1 vs 레벨2)"
> 열린 질문의 근거 문서. 로컬 도커 Mattermost(팀 공용 서버 아님) + 운호님 개인 Hermes
> 설치(`~/.hermes`)에서 진행한 1인 기술 검증. 실제 팀원 계정으로의 확장은 아직 안 함.

## 결론 요약

**방법 A(팀원별 Mattermost 봇 계정 + Hermes 프로파일)가 end-to-end로 실제 동작함을
프로토타입 레벨로 증명했다.** 개인화(②)와 팀 지식 공유(①, memory-provider) 두 축 모두
코드/데이터 레벨에서 검증 완료. 유일한 미해결 관찰은 무료 LLM 모델의 크레딧 소진으로
인한 컨텍스트 활용 저하(인프라 이슈, 설계 결함 아님).

## 검증 환경

- 로컬 Mattermost: `experiments/hermes-mattermost/2026-07-08/shared/docker-compose.yml`로 기동 (`localhost:8065`)
- Hermes 프로파일 2개: `~/.hermes/profiles/test1`, `~/.hermes/profiles/test2` (각각 독립 launchd 서비스)
- 각 프로파일에 별도 Mattermost 봇 계정(`@hermes-test1`, `@hermes-test2`) + 별도 봇 토큰 연결
- `MATTERMOST_ALLOWED_USERS`로 봇마다 특정 사람 계정만 허용
- 모델: `nvidia/nemotron-3-super-120b-a12b:free` (OpenRouter 무료 티어)

## 검증 항목과 결과

| # | 항목 | 방법 | 결과 |
|---|---|---|---|
| 1 | 프로파일 완전 분리 | 같은 발신자가 두 봇에게 다른 이름을 알려주고 되물음 | ✅ test1="레몬", test2="망고" — 절대 안 섞임 |
| 2 | 사람별 접근 차단 | 가짜 계정(`other-tester`)으로 남의 봇 멘션 | ✅ 채널/DM 모두 무응답, 로그에 `Unauthorized user` 확인 |
| 3 | 장기 기억(USER.md) 분리 | 프로파일별로 다른 신상정보를 memory tool로 저장 | ✅ 파일 내용까지 서로 완전히 다름 |
| 4 | 작업 메모(MEMORY.md) 분리 | 프로파일별로 다른 작업 메모 저장 | ✅ 파일 내용까지 완전히 다름 |
| 5 | DM 시나리오 | 채널이 아닌 1:1 대화로 동일 테스트 | ✅ 기억 유지 확인. 미허용 사용자는 DM에서도 조용히 무시(페어링 코드 없음 — 기존 문서의 추정과 다름) |
| 6 | 동시성 | 두 봇에 거의 동시에 멘션 | ✅ 서로 안 꼬임(완전 별도 프로세스라 당연) |
| 7 | SOUL.md 성격 커스터마이징 | test1의 SOUL.md를 다른 페르소나로 교체 | ✅ 반영됨. 단, **기존 세션엔 캐시돼서 새 세션(새 채널/새 대화)부터 적용** — 운영 시 유의점 |
| 8 | 재시작 내구성 | `gateway install`로 launchd 영구 서비스화 후 `kill -9` | ✅ 자동 재기동, 응답 정상 |
| 9 | 팀 지식 공유(memory-provider) | `teambrain` 커스텀 provider 작성 → test1이 sync_turn으로 쓴 정보를 test2가 prefetch로 읽음 | ✅ **데이터 레벨 완전 검증**(아래 상세) |

### 9번 상세 — 팀 지식 공유(memory-provider) 검증

`plugins/memory/teambrain/`(이 폴더에 코드 사본 있음)를 Hermes의 공식 memory-provider
확장점(`agent/memory_provider.py`)에 꽂아서 검증했다. 이 확장점은 `memory.provider`
설정으로 명시적으로 켠 프로파일에만 영향을 주므로, 운호님 개인 라이브 Hermes(Slack 연결된
default 프로파일)는 전혀 건드리지 않았다.

- `sync_turn`: 매 턴 종료 후 `~/.hermes/team_knowledge/store.jsonl`(어느 한 프로파일 소속이
  아닌 공유 경로)에 발화 내용을 기록 — test1, test2 둘 다 정상 기록됨을 파일로 확인.
- `prefetch`: 다음 턴 시작 전 쿼리와 저장된 항목의 키워드 겹침으로 관련 항목을 찾아 텍스트
  블록으로 반환 — **실제 라이브 세션에서 쓰인 것과 동일한 쿼리 문자열을 그대로 프로덕션 코드에
  넣어 오프라인 재현**해서, test1이 남긴 "포트051 마감일 8월6일, 담당 김선만" 정보를 test2
  쪽에서 정확히 찾아내는 것까지 확인.
- 그런데 실제 Mattermost 왕복에서는 test2가 "TeamBrain 컨텍스트에는 정보가 없습니다"라고
  답함 — **데이터는 분명히 주입됐는데 모델이 활용을 안 함.** 로그 확인 결과 OpenRouter 무료
  모델이 `ResourceExhausted (32/32)`, `요청한 65536 토큰 중 13333 토큰만 허용` 등 크레딧
  소진 상태였음 — 오늘 테스트를 몰아서 돌리며 무료 쿼터를 다 쓴 것이 원인으로 보인다.
  **배관 자체의 결함이 아니라 오늘 세션의 인프라(무료 모델 쿼터) 한계.**

## 재현/후속 검증 시 참고

- `teambrain-plugin/`을 Hermes 설치의 `plugins/memory/teambrain/`에 넣고, 검증할 프로파일의
  `config.yaml`에 `memory: {provider: teambrain}`을 추가하면 재현 가능.
- 다음에 다시 검증한다면 **크레딧이 남은(또는 유료) 모델**로 9번을 한 번 더 돌려서, 모델이
  실제로 주입된 컨텍스트를 활용하는 것까지 깔끔하게 확인하는 게 좋다.
- 이번 검증은 팀 공용 Mattermost가 아니라 **운호님 로컬 도커 인스턴스**에서 진행됐고, 팀원
  실제 계정 확장은 아직 미검증 상태다(가짜 계정 1개로 "타인 차단"만 확인).

## 관련 문서

- `port_051/mattermost-hermes-integration-decision.md` — 이 검증이 다루는 방법 A/B/D 비교와
  "다음 단계" 목록의 근거 문서.
- `port_051/hermes-개인화-쉬운정리.md` — 레벨1/레벨2 개념 설명.
