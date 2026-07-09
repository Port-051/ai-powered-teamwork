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
    .setChoiceValues(['스타트업/기업 팀 리더', '팀원', '학생 프로젝트/동아리', '프리랜서/1인 사업', '기타'])
    .setRequired(true);

  // 2. 팀 규모
  form.addMultipleChoiceItem()
    .setTitle('팀 규모는 몇 명인가요?')
    .setChoiceValues(['2~4명', '5~9명', '10~29명', '30명 이상'])
    .setRequired(false);

  // 3. 사용 중인 협업 툴 (복수선택)
  form.addCheckboxItem()
    .setTitle('평소 팀 협업에 어떤 메신저/툴을 쓰시나요? (복수선택)')
    .setChoiceValues(['카카오톡/카카오워크', '슬랙', '잔디', '노션', 'Mattermost', '기타'])
    .setRequired(false);

  // 4. 위키/문서 툴 별도 사용 여부
  form.addMultipleChoiceItem()
    .setTitle('노션·컨플루언스 같은 위키/문서 정리 툴을 따로 쓰고 계신가요?')
    .setChoiceValues(['쓴다 (그리고 잘 정리되고 있다)', '쓴다 (그런데 정리가 잘 안 된다)', '안 쓴다'])
    .setRequired(false);

  // 5. 공감도 - 정보 유실
  form.addScaleItem()
    .setTitle('"회의나 채팅에서 오간 중요한 결정/논의 내용을 나중에 다시 찾기 어렵다"에 얼마나 공감하시나요?')
    .setBounds(1, 5)
    .setLabels('전혀 아니다', '매우 그렇다')
    .setRequired(false);

  // 6. 시간 낭비 정도
  form.addMultipleChoiceItem()
    .setTitle('한 주에 이런 문제(정보를 못 찾거나 다시 물어봐야 하는 것)로 낭비하는 시간은 어느 정도인가요?')
    .setChoiceValues(['30분 미만', '30분~1시간', '1~3시간', '3시간 이상'])
    .setRequired(false);

  // 7. 현재 해결 방식
  form.addParagraphTextItem()
    .setTitle('위와 같은 문제를 지금은 어떻게 해결(또는 그냥 포기)하고 계신가요?')
    .setRequired(false);

  // 8. 컨셉 반응
  form.addScaleItem()
    .setTitle(
      '"팀이 평소 쓰는 메신저에서 AI 봇을 멘션하기만 하면, 대화 내용이 자동으로 팀 지식으로 쌓이고 ' +
      '필요할 때 다시 꺼내볼 수 있는 서비스"가 있다면 써보고 싶으신가요?'
    )
    .setBounds(1, 5)
    .setLabels('전혀 아니다', '매우 그렇다')
    .setRequired(false);

  // 9. 매력적인 기능 (복수선택)
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

  // 10. 프라이버시 거부감
  form.addScaleItem()
    .setTitle('팀 대화 내용을 AI가 학습/저장하는 것에 대해 거부감이 있나요?')
    .setBounds(1, 5)
    .setLabels('전혀 없다', '매우 크다')
    .setRequired(false);

  // 11. 선호 방식
  form.addMultipleChoiceItem()
    .setTitle('이런 서비스가 있다면 어떤 방식이 가장 끌리시나요?')
    .setChoiceValues([
      '무료로 쓰고 광고/제한 감수',
      '월 소액 유료 구독',
      '우리 회사가 직접 서버 호스팅(온프레미스)',
      '아직 잘 모르겠다'
    ])
    .setRequired(false);

  // 12. 우려 사항
  form.addParagraphTextItem()
    .setTitle('이 서비스에서 가장 걱정되는 점이 있다면? (보안, 비용, 학습 난이도 등 자유롭게)')
    .setRequired(false);

  // 13. 베타테스트 이메일
  form.addTextItem()
    .setTitle('출시 시 베타테스트 참여에 관심 있으시면 이메일을 남겨주세요')
    .setRequired(false);

  Logger.log('폼 생성 완료!');
  Logger.log('편집 URL: ' + form.getEditUrl());
  Logger.log('응답(공유) URL: ' + form.getPublishedUrl());
}
