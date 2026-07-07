# hermes-slack 실습

Hermes(NousResearch/hermes-agent, MIT)를 슬랙 워크스페이스에 연결해보는 실습 공간.
최종 제품 아키텍처는 Mattermost 기반(`PLAN.md` 참고)이며, 여긴 07/09 일정의
"Hermes/Mattermost 세팅 및 메모리 구조 학습"을 위한 별도 실습용 폴더다.

## 폴더 구조

```
experiments/hermes-slack/
  <날짜>/
    shared/      ← 팀 전체가 같이 보는 메모, 합의된 설정
    unho/
    dongyeon/
    hongjae/
```

각자 폴더 안에서 자유롭게 실습하고, 팀이 공유해야 할 내용(설정법, 막힌 점, 배운 점)은
`shared/`에 정리해서 옮긴다.

폴더명은 원래 한글 실명이었으나, 여러 OS(맥/윈도우/리눅스)에서 한글 파일명의
유니코드 정규화 방식이 달라 git이 파일을 다르게 인식할 수 있는 문제를 피하려고
영문 이니셜로 바꿨다.
