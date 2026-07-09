/**
 * TeamBrain 수요조사 구글폼 자동 생성 스크립트
 * 사용법: script.google.com에서 새 프로젝트 만들고 이 코드를 붙여넣은 뒤
 *        createTeamBrainSurvey 함수를 실행(▶)하면 폼이 자동으로 생성됩니다.
 *        실행 후 로그(보기 > 로그)에 폼 편집 URL과 응답 URL이 출력됩니다.
 */
function createTeamBrainSurvey() {
  var form = FormApp.create('팀 협업 AI 신규 서비스 사용자 니즈 조사');
  form.setDescription(
    '안녕하세요! 저희는 팀 협업 중에 겪는 다양한 불편함을 조사해서, 정말 필요한 서비스를 만들고자 합니다. ' +
    '여러분이 겪으신 경험을 바탕으로 솔직한 의견 부탁드립니다. (소요 시간: 약 4분)'
  );
  form.setCollectEmail(false);
  form.setProgressBar(true);

  // 1. 소속/역할
  form.addMultipleChoiceItem()
    .setTitle('1. 소속/역할을 선택해주세요')
    .setChoiceValues(['스타트업/기업 팀 리더', '팀원', '학생 프로젝트/동아리', '프리랜서/1인 사업'])
    .showOtherOption(true)
    .setRequired(true);

  // 2. 팀 규모
  form.addMultipleChoiceItem()
    .setTitle('2. 팀 규모는 몇 명인가요?')
    .setChoiceValues(['2~4명', '5~9명', '10~29명', '30명 이상'])
    .setRequired(false);

  // 3. 사용 중인 협업 툴 (복수선택) — "기타" 선택 시 자유 입력 가능하도록 showOtherOption 사용
  form.addCheckboxItem()
    .setTitle('3. 평소 팀 협업에 어떤 메신저/툴을 쓰시나요? (복수선택)')
    .setChoiceValues([
      '카카오톡/카카오워크', '슬랙', '잔디', '노션', 'Mattermost',
      'MS Teams', '네이버웍스', '플로우'
    ])
    .showOtherOption(true)
    .setRequired(false);

  // 4. 오프닝 개방형 질문 — 어떤 점이 불편한지 먼저 자유롭게 물어봄 (아직 솔루션 언급 전이라 편향 없음)
  form.addParagraphTextItem()
    .setTitle('4. 팀 협업 시 가장 불편하다고 느끼시는 점은 무엇인가요? 편하게 말씀해주세요.')
    .setRequired(false);

  // 5. 빈도/행동 기반 질문 (동의 척도 대신 실제 행동을 물어 신호 강도를 높임)
  form.addMultipleChoiceItem()
    .setTitle('5. 최근 1개월간, 팀 채팅에서 나눈 결정 사항을 다시 찾아보려고 스크롤하거나 검색한 적이 몇 번 정도 있나요?')
    .setChoiceValues(['0회', '1~2회', '3회 이상'])
    .setRequired(false);

  // 6. 결과 확인 — 찾았는지 여부(객관식)
  form.addMultipleChoiceItem()
    .setTitle('6. 그때 원하시는 내용을 찾으셨나요?')
    .setChoiceValues(['바로 찾았다', '한참 걸려서 찾았다', '결국 못 찾았다'])
    .setRequired(false);

  // 7. 대처 방법 + 실제 손해 사례 (서술형 하나로 통합 — 두 문장으로 나눠 가독성 확보)
  form.addParagraphTextItem()
    .setTitle(
      '7. 오래 걸렸거나 못 찾으셨다면 그때 어떻게 해결하셨나요? ' +
      '그로 인해 같은 논의를 반복했거나 잘못된 내용으로 일을 진행한 적이 있다면, 그 상황도 함께 알려주세요.'
    )
    .setRequired(false);

  // 8. 현재 대안 — 가장 흔한 "채팅 자체 검색" 옵션 포함
  form.addMultipleChoiceItem()
    .setTitle('8. 지금은 이런 문제를 어떻게 관리하고 계신가요?')
    .setChoiceValues([
      '채팅 자체 검색 기능으로 찾음', '채팅방에 고정 메시지로 남김',
      '별도 위키/노션에 정리', '담당자에게 직접 물어봄', '따로 관리하지 않음'
    ])
    .showOtherOption(true)
    .setRequired(false);

  // 9. 컨셉 반응 — 솔루션을 여기서 처음 소개해 그 이전 질문들의 편향을 막음
  form.addScaleItem()
    .setTitle(
      '9. "팀이 평소 쓰는 메신저에서 AI 봇을 멘션하기만 하면, 대화 내용이 자동으로 팀 지식으로 쌓이고 ' +
      '필요할 때 다시 꺼내볼 수 있는 서비스"가 있다면 써보고 싶으신가요?'
    )
    .setBounds(1, 5)
    .setLabels('전혀 아니다', '매우 그렇다')
    .setRequired(false);

  // 10. 개인화 AI 에이전트 관심도 (예시는 유지하되 세 문장으로 나눠 가독성 확보)
  form.addScaleItem()
    .setTitle(
      '10. 팀 지식과는 별개로, 나만을 위한 AI 비서 기능도 생각하고 있습니다. ' +
      '예를 들어 내가 나눈 대화·질문·업무 이력을 기억해뒀다가 "저번에 물어봤던 그거 이어서 알려줘"처럼 ' +
      '맥락을 이어서 답해주고, 내 관심사에 맞는 학습 자료를 추천해주는 식입니다. ' +
      '이런 기능이 있다면 얼마나 써보고 싶으신가요?'
    )
    .setBounds(1, 5)
    .setLabels('전혀 없다', '매우 크다')
    .setRequired(false);

  // 11. 매력적인 기능 (복수선택)
  form.addCheckboxItem()
    .setTitle('11. 아래 기능 중 가장 매력적인 것을 골라주세요 (복수선택)')
    .setChoiceValues([
      '대화 내용 자동 요약',
      '결정사항 자동 기록',
      '과거 대화에서 답 찾아주기',
      '신규 팀원 온보딩 자료 자동 생성',
      '개인별 학습 에이전트'
    ])
    .setRequired(false);

  // 12. 프라이버시 거부감
  form.addScaleItem()
    .setTitle('12. 팀 대화 내용을 AI가 학습/저장하는 것에 대해 거부감이 있나요?')
    .setBounds(1, 5)
    .setLabels('전혀 없다', '매우 크다')
    .setRequired(false);

  // 13. 선호 방식 + 지불 의향 금액 (하나로 통합 — 구독 선택지에 가격대를 포함시켜 WTP 신호 확보)
  form.addMultipleChoiceItem()
    .setTitle('13. 이런 서비스가 있다면 어떤 방식·가격대가 가장 끌리시나요?')
    .setChoiceValues([
      '무료로 쓰고 광고/제한 감수',
      '월 5,000원 미만 구독',
      '월 5,000~14,900원 구독',
      '월 15,000~29,900원 구독',
      '월 30,000원 이상 구독',
      '우리 회사가 직접 서버 호스팅(온프레미스)',
      '아직 잘 모르겠다'
    ])
    .setRequired(false);

  // 14. 우려 사항
  form.addParagraphTextItem()
    .setTitle('14. 이 서비스에서 가장 걱정되시는 점이 있다면 편하게 말씀해주세요. (보안, 비용, 학습 난이도 등)')
    .setRequired(false);

  // 15. 베타테스트 이메일 — 개인정보 성격이라 설문 맨 마지막에 배치
  form.addTextItem()
    .setTitle('15. 출시 시 베타테스트 참여에 관심 있으시면 이메일을 남겨주세요')
    .setRequired(false);

  Logger.log('폼 생성 완료!');
  Logger.log('편집 URL: ' + form.getEditUrl());
  Logger.log('응답(공유) URL: ' + form.getPublishedUrl());
}
