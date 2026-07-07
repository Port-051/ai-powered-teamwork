# hermes-mattermost 실습

Hermes(NousResearch/hermes-agent, MIT)를 로컬 Docker로 띄운 Mattermost 서버에
연결해보는 실습 공간. `experiments/hermes-slack/`과 같은 07/09 일정
("Hermes/Mattermost 세팅 및 메모리 구조 학습")의 후속으로, 실제 제품
아키텍처(`PLAN.md`)와 가장 가까운 조합(Hermes ↔ Mattermost)을 검증해본다.

## 폴더 구조

```
experiments/hermes-mattermost/
  <날짜>/
    shared/      ← 팀 전체가 같이 보는 메모, docker-compose.yml, 배운 점
    unho/
    dongyeon/
    hongjae/
```

## 지금까지 확인한 것 (2026-07-07)

- `shared/docker-compose.yml`로 로컬에 Mattermost(Team Edition) + Postgres를
  띄우고, Hermes 게이트웨이에 Slack과 Mattermost를 동시에 연결해 두 플랫폼
  모두에서 멘션 응답이 되는 것까지 확인함. 자세한 내용은
  `2026-07-07/shared/NOTES.md` 참고.
- **중요한 발견**: Mattermost 어댑터가 Hermes 자체에 이미 내장돼 있었다
  (`MATTERMOST_URL`/`MATTERMOST_TOKEN` env만 넣으면 연결됨). PLAN.md의
  "① Mattermost 어댑터"를 우리가 새로 짜야 한다는 전제와 달리, 이 부분은
  Hermes가 대신 해주는 셈 — 우리 원본 코드는 ②/③ 레이어(팀 공유 지능,
  개인-팀 브릿지)에 집중하면 됨.
