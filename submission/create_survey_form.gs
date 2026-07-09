/**
 * TeamBrain 수요조사 구글폼 자동 생성 스크립트
 * 사용법: script.google.com에서 새 프로젝트 만들고 이 코드를 붙여넣은 뒤
 *        createTeamBrainSurvey 함수를 실행(▶)하면 폼이 자동으로 생성됩니다.
 *        실행 후 로그(보기 > 로그)에 폼 편집 URL과 응답 URL이 출력됩니다.
 */
function createTeamBrainSurvey() {
  var form = FormApp.create('팀 협업 AI 신규 서비스 사용자 니즈 조사');
  form.setDescription(
    '안녕하세요! 저희는 팀 메신저에서 오갔던 중요한 논의와 결정들이 시간이 지나면 흩어지고 잊히는 문제에 주목해, ' +
    'AI가 자연스럽게 팀의 지식을 쌓아주는 새로운 협업 서비스를 기획 중입니다. ' +
    '여러분이 겪으신 팀 협업의 불편함을 바탕으로 정말 필요한 서비스를 만들고자 하니, 솔직한 의견 부탁드립니다. (소요 시간: 약 3분)'
  );
  form.setCollectEmail(false);
  form.setProgressBar(true);

  // 1. 소속/역할
  form.addMultipleChoiceItem()
    .setTitle('소속/역할을 선택해주세요')
    .setChoiceValues(['스타트업/기업 팀 리더', '팀원', '학생 프로젝트/동아리', '프리랜서/1인 사업'])
    .showOtherOption(true)
    .setRequired(true);

  // 2. 팀 규모
  form.addMultipleChoiceItem()
    .setTitle('팀 규모는 몇 명인가요?')
    .setChoiceValues(['2~4명', '5~9명', '10~29명', '30명 이상'])
    .setRequired(false);

  // 3. 사용 중인 협업 툴 (복수선택) — "기타" 선택 시 자유 입력 가능하도록 showOtherOption 사용
  form.addCheckboxItem()
    .setTitle('평소 팀 협업에 어떤 메신저/툴을 쓰시나요? (복수선택)')
    .setChoiceValues([
      '카카오톡/카카오워크', '슬랙', '잔디', '노션', 'Mattermost',
      'MS Teams', '네이버웍스', '플로우'
    ])
    .showOtherOption(true)
    .setRequired(false);

  // 4. 위키/문서 툴 별도 사용 여부
  form.addMultipleChoiceItem()
    .setTitle('노션·컨플루언스 같은 위키/문서 정리 툴을 따로 쓰고 계신가요?')
    .setChoiceValues(['쓴다 (그리고 잘 정리되고 있다)', '쓴다 (그런데 정리가 잘 안 된다)', '안 쓴다'])
    .setRequired(false);

  // 5. 오프닝 개방형 질문 — 어떤 점이 불편한지 먼저 자유롭게 물어봄
  form.addParagraphTextItem()
    .setTitle('팀 협업 시 가장 불편하다고 느끼시는 점은 무엇인가요? 편하게 말씀해주세요.')
    .setRequired(false);

  // 6. 빈도/행동 기반 질문 (동의 척도 대신 실제 행동을 물어 신호 강도를 높임)
  form.addMultipleChoiceItem()
    .setTitle('최근 1개월간, 팀 채팅에서 나눈 결정 사항을 다시 찾아보려고 스크롤하거나 검색한 적이 몇 번 정도 있나요?')
    .setChoiceValues(['0회', '1~2회', '3회 이상'])
    .setRequired(false);

  // 7. 결과 확인
  form.addParagraphTextItem()
    .setTitle('그때 원하는 내용을 찾으셨나요? 못 찾았다면 어떻게 해결하셨는지도 알려주세요. (예: 다시 물어봄 / 포기함 / 기억에 의존 / 직접 문서로 정리 등)')
    .setRequired(false);

  // 8. 실제 손해 (구체적 사례)
  form.addParagraphTextItem()
    .setTitle('결정 사항을 못 찾아서 같은 논의를 반복했거나, 잘못된 내용으로 일을 진행한 적이 있나요? 있다면 어떤 상황이었는지 알려주세요.')
    .setRequired(false);

  // 9. 현재 대안
  form.addMultipleChoiceItem()
    .setTitle('지금은 이런 문제를 어떻게 관리하고 계신가요?')
    .setChoiceValues(['채팅방에 고정 메시지로 남김', '별도 위키/노션에 정리', '담당자에게 직접 물어봄', '따로 관리하지 않음'])
    .showOtherOption(true)
    .setRequired(false);

  // 10. 컨셉 반응
  form.addScaleItem()
    .setTitle(
      '"팀이 평소 쓰는 메신저에서 AI 봇을 멘션하기만 하면, 대화 내용이 자동으로 팀 지식으로 쌓이고 ' +
      '필요할 때 다시 꺼내볼 수 있는 서비스"가 있다면 써보고 싶으신가요?'
    )
    .setBounds(1, 5)
    .setLabels('전혀 아니다', '매우 그렇다')
    .setRequired(false);

  // 11. 개인화 AI 에이전트 관심도 (추상적이라는 피드백 반영 — 구체적 사용 예시 추가)
  form.addScaleItem()
    .setTitle(
      '팀 지식과는 별개로, 내가 나눈 대화·질문·업무 이력을 기억해뒀다가 "저번에 물어봤던 그거 이어서 알려줘" 처럼 ' +
      '맥락을 이어가며 답해주고, 내 관심사에 맞는 학습 자료나 다음에 공부하면 좋을 내용을 알아서 추천해주는 ' +
      '"나만의 AI 비서" 기능이 있다면 얼마나 써보고 싶으신가요?'
    )
    .setBounds(1, 5)
    .setLabels('전혀 없다', '매우 크다')
    .setRequired(false);

  // 12. 매력적인 기능 (복수선택)
  form.addCheckboxItem()
    .setTitle('아래 기능 중 가장 매력적인 것을 골라주세요 (복수선택)')
    .setChoiceValues([
      '대화 내용 자동 요약',
      '결정사항 자동 기록',
      '질문하면 과거 대화에서 답 찾아주기',
      '신규 팀원 온보딩 자료 자동 생성',
      '개인별 학습 에이전트'
    ])
    .setRequired(false);

  // 13. 프라이버시 거부감
  form.addScaleItem()
    .setTitle('팀 대화 내용을 AI가 학습/저장하는 것에 대해 거부감이 있나요?')
    .setBounds(1, 5)
    .setLabels('전혀 없다', '매우 크다')
    .setRequired(false);

  // 14. 선호 방식
  form.addMultipleChoiceItem()
    .setTitle('이런 서비스가 있다면 어떤 방식이 가장 끌리시나요?')
    .setChoiceValues([
      '무료로 쓰고 광고/제한 감수',
      '월 소액 유료 구독',
      '우리 회사가 직접 서버 호스팅(온프레미스)',
      '아직 잘 모르겠다'
    ])
    .setRequired(false);

  // 15. 우려 사항 (존댓말)
  form.addParagraphTextItem()
    .setTitle('이 서비스에서 가장 걱정되시는 점이 있다면 편하게 말씀해주세요. (보안, 비용, 학습 난이도 등)')
    .setRequired(false);

  // 16. 베타테스트 이메일
  form.addTextItem()
    .setTitle('출시 시 베타테스트 참여에 관심 있으시면 이메일을 남겨주세요')
    .setRequired(false);

  Logger.log('폼 생성 완료!');
  Logger.log('편집 URL: ' + form.getEditUrl());
  Logger.log('응답(공유) URL: ' + form.getPublishedUrl());
}
