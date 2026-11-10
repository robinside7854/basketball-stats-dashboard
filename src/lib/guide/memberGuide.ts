// 회원용 이용 가이드 본문 (2026-11-10 운영진) — 화면(`/guide`)과 릴스 시리즈 대본의 정본.
//   기능이 바뀌면 여기 한 곳만 고친다. 그림은 public/guide/<image>.png (시험 데이터로 찍은 진짜 화면).
//   ⚠ 실제 회원 이름이 든 캡처를 넣지 말 것 — 공개 폴더라 누구나 받을 수 있다.
//   ⚠ 동호회 이름(「미라클」)을 글·그림에 넣지 말 것 — 가입 전 사람도 보는 화면이다(비공개 리그 잠금 화면에서 열림, 2026-11-10).
//   ⚠ 문장 = 한 줄(2026-11-10 운영진): lines 의 한 항목이 한 문장이고 화면에서 줄을 나눠 보인다.
//     짧게 쓴다 — 폰(360)에서도 되도록 한 줄에 들어가게. 그림에 대한 문장은 그 그림의 묶음(group)에 둔다.

//   2026-11-10 운영진 「글로 쭉 쓰면 읽기 싫다 · 도식화」 → 문장마다 아이콘(icon)을 붙이고, 저절로 되는 일은 auto, 팁은 tip.
//     그림 묶음마다 짧은 제목(title). 그리기는 GuideContent(폰 화면 그림 + 아이콘 단계 줄, PC 는 좌우 번갈아).
//     문장 글(t)은 릴스 대본으로도 쓴다 — 글만 필요하면 lineText().

/** 누가 하나 — 자동(초록 번개) · 어드민(노랑 손) · 회원(회색 사람). 회원 가이드는 auto 만 표시한다. */
export type Who = 'auto' | 'admin' | 'member'

/** 가이드 화면에서 쓰는 아이콘 이름 — components/league/guide/guideKit.tsx 의 ICONS 와 같은 목록 */
export type IconKey =
  | 'calendar' | 'check' | 'x' | 'users' | 'userPlus' | 'lock' | 'pen' | 'video' | 'ticket' | 'wallet'
  | 'bank' | 'phone' | 'bell' | 'drag' | 'tap' | 'undo' | 'crown' | 'shirt' | 'alert' | 'ok' | 'key'
  | 'shield' | 'receipt' | 'copy' | 'battery' | 'list' | 'swap' | 'zap' | 'coins' | 'refresh' | 'home' | 'gear'
  | 'link' | 'search' | 'card' | 'chart' | 'star' | 'play' | 'expand' | 'clock' | 'gift' | 'idea' | 'user' | 'trophy'

/** 한 문장 — 글만 쓰거나 { t, icon, auto(저절로 되는 일), tip(덧붙이는 말) } */
export type GuideLine = string | { t: string; icon?: IconKey; auto?: boolean; tip?: boolean }
export const lineText = (l: GuideLine): string => (typeof l === 'string' ? l : l.t)

export interface GuideGroup { image?: string; caption?: string; title?: string; lines: GuideLine[] }
export type FaqCategory = '참가신청' | '월렛' | '기록 · 영상' | '계정'
export const FAQ_CATEGORIES: FaqCategory[] = ['참가신청', '월렛', '기록 · 영상', '계정']
/** cat — 회원 가이드는 FAQ_CATEGORIES, 어드민 가이드는 자기 묶음 이름(칩 순서 = 처음 나온 순서) */
export interface GuideFaq { cat: string; q: string; a: string[] }
export interface GuideSection { id: string; icon?: IconKey; title: string; summary: string; groups: GuideGroup[]; faqs?: GuideFaq[] }

export const MEMBER_GUIDE: GuideSection[] = [
  {
    id: 'signup', icon: 'userPlus',
    title: '가입하기',
    summary: '아이디 · 실명 · 생년월일만 넣으면 돼요.',
    groups: [
      {
        image: 'signup', caption: '가입 화면', title: '가입',
        lines: [
          { t: '단톡방 링크로 들어와 「가입 요청」을 눌러요.', icon: 'link' },
          { t: '아이디 · 실명 · 생년월일 6자리를 넣어요.', icon: 'pen' },
          { t: '아이디는 자유롭게 정해요.', icon: 'user' },
          { t: '생년월일 6자리가 처음 비밀번호예요.', icon: 'key' },
          { t: '명단에 있는 실명이면 바로 시작해요.', icon: 'zap', auto: true },
          { t: '새로 온 회원은 운영진이 승인하면 돼요.', icon: 'userPlus' },
          { t: '로그인은 30일 동안 유지돼요.', icon: 'key', tip: true },
        ],
      },
    ],
  },
  {
    id: 'rsvp', icon: 'calendar',
    title: '매주 참가신청',
    summary: '월요일에 열리고, 참 / 불만 누르면 끝이에요.',
    groups: [
      {
        image: 'rsvp-card', caption: '홈 맨 위 참가신청 카드', title: '참 / 불 누르기',
        lines: [
          { t: '매주 월요일 홈 맨 위에 참 / 불이 열려요.', icon: 'bell', auto: true },
          { t: '금요일 밤까지 누를 수 있어요.', icon: 'clock' },
          { t: '정규 멤버는 「참」이면 바로 배정돼요.', icon: 'crown', auto: true },
          { t: '못 나오면 「불」을 눌러 주세요.', icon: 'x' },
          { t: '취소해도 쓴 티켓은 내 월렛에 남아요.', icon: 'ticket', tip: true },
        ],
      },
      {
        image: 'rsvp-board', caption: '신청 현황 — 팀별 명단과 대기명단', title: '팀 배정',
        lines: [
          { t: '비정규 멤버는 대기명단에 들어가요.', icon: 'list' },
          { t: '운영진이 팀마다 필요한 인원에 맞춰 배정해요.', icon: 'users' },
          { t: '보통 수요일에서 금요일 사이에 배정돼요.', icon: 'calendar' },
        ],
      },
      {
        image: 'guest-sheet', caption: '게스트 신청 창', title: '게스트 부르기',
        lines: [
          { t: '「게스트 신청」에서 게스트 정보를 넣어요.', icon: 'userPlus' },
          { t: '지난 게스트는 「다시 신청」 한 번이면 돼요.', icon: 'refresh' },
          { t: '게스트비는 통장 입금이나 내 포인트로 내요.', icon: 'coins' },
          { t: '괜찮은 분이면 회원으로 꼬셔 주세요 ㅋ', icon: 'idea', tip: true },
        ],
      },
    ],
  },
  {
    id: 'wallet', icon: 'wallet',
    title: '월렛',
    summary: '입금하면 자동 충전, 비정규 티켓은 신청 마감 때 자동으로 빠져요.',
    groups: [
      {
        image: 'wallet-charge', caption: '충전 창 — 계좌 복사', title: '충전',
        lines: [
          { t: '모임통장에 본인 이름으로 입금만 하세요.', icon: 'bank' },
          { t: '1분 안에 포인트가 자동으로 충전돼요.', icon: 'zap', auto: true },
          { t: '다른 이름으로 입금했다면 알려 주세요.', icon: 'alert', tip: true },
        ],
      },
      {
        image: 'wallet', caption: '내 월렛 — 포인트와 티켓', title: '보너스와 환불',
        lines: [
          { t: '5만원 이상 충전하면 10%를 더 드려요.', icon: 'gift' },
          { t: '5만원을 넣으면 55,000P가 돼요.', icon: 'coins' },
          { t: '남은 포인트는 환불 신청할 수 있어요.', icon: 'undo' },
          { t: '보너스로 받은 포인트는 환불되지 않아요.', icon: 'alert', tip: true },
        ],
      },
      {
        image: 'wallet-ticket', caption: '티켓 사기', title: '티켓',
        lines: [
          { t: '정규권은 한 달 28,000P예요.', icon: 'crown' },
          { t: '운영진이 판매를 열면 선착순으로 사요.', icon: 'calendar' },
          { t: '지난달 정규였다면 같은 팀이 돼요.', icon: 'users', auto: true },
          { t: '남은 비정규 티켓만큼 값이 깎여요.', icon: 'gift' },
          { t: '비정규 티켓은 한 번에 12,000P예요.', icon: 'ticket' },
          { t: '비정규 티켓은 미리 안 사도 돼요.', icon: 'ok' },
          { t: '신청이 마감되면 티켓 1장이 빠져요.', icon: 'zap', auto: true },
          { t: '티켓이 없으면 포인트로 1장을 사서 써요.', icon: 'check', auto: true },
          { t: '한 달 3번 이상이면 정규권이 이득이에요.', icon: 'idea', tip: true },
        ],
      },
    ],
  },
  {
    id: 'me', icon: 'user',
    title: '내 기록 보기',
    summary: '홈 · 박스스코어 · 「나」 탭 · 선수 카드에서 봐요.',
    groups: [
      {
        image: 'last-day', caption: '지난 토요일 나', title: '지난 토요일 나',
        lines: [
          { t: '홈 「지난 토요일」 카드에 내 기록이 있어요.', icon: 'home' },
        ],
      },
      {
        image: 'boxscore', caption: '박스스코어 — 내 줄 노란 테두리', title: '박스스코어',
        lines: [
          { t: '자세한 기록은 그날 박스스코어에서 봐요.', icon: 'list' },
          { t: '내 줄은 노란 테두리로 보여요.', icon: 'star' },
        ],
      },
      {
        image: 'me', caption: '「나」 탭', title: '「나」 탭',
        lines: [
          { t: '「나」 탭에 내 기록 · 월렛 · 계정이 있어요.', icon: 'user' },
        ],
      },
      {
        image: 'player-card', caption: '선수 카드', title: '선수 카드',
        lines: [
          { t: '선수 이름을 누르면 선수 카드가 열려요.', icon: 'card' },
          { t: '기록과 플레이스타일을 볼 수 있어요.', icon: 'chart' },
          { t: '접힌 칸도 펼쳐서 둘러보세요.', icon: 'expand' },
          { t: '위쪽 검색으로 다른 선수도 찾아볼 수 있어요.', icon: 'search' },
          { t: '상대의 강점과 약점을 분석해 보세요!', icon: 'idea', tip: true },
        ],
      },
    ],
  },
  {
    id: 'games', icon: 'trophy',
    title: '경기 · 기록 · 영상',
    summary: '경기 결과, 리더보드, 팀 성적, 하이라이트까지.',
    groups: [
      {
        image: 'leaderboard', caption: '리더보드', title: '경기 결과와 순위',
        lines: [
          { t: '「경기」 탭에서 날짜별 결과를 봐요.', icon: 'calendar' },
          { t: '「기록」 탭에는 명단 · 리더보드 · 팀이 있어요.', icon: 'list' },
          { t: '리더보드에서 분기별 상위 선수를 봐요.', icon: 'trophy' },
        ],
      },
      {
        image: 'teams', caption: '팀 기록', title: '팀 기록',
        lines: [
          { t: '분기마다 3개 팀이 있어요.', icon: 'users' },
          { t: '팀 성적과 플레이스타일을 볼 수 있어요.', icon: 'chart' },
          { t: '우리 팀이 보완할 점도 함께 살펴보세요.', icon: 'idea', tip: true },
        ],
      },
      {
        image: 'highlights', caption: '하이라이트', title: '하이라이트',
        lines: [
          { t: '「영상」 탭에서 내 플레이를 다시 볼 수 있어요.', icon: 'video' },
          { t: '맨 위 「바로 재생」은 지난 경기 장면을 이어서 틀어요.', icon: 'video' },
          { t: '기록 시각 기준이라 몇 초 어긋날 수 있어요.', icon: 'clock', tip: true },
          { t: '전체화면으로도 볼 수 있어요.', icon: 'expand' },
          { t: '링크 버튼으로 그 클립을 팀원에게 보내요.', icon: 'link' },
          { t: '인생샷은 「베스트샷 핀」으로 저장해 두세요.', icon: 'star' },
          { t: '「나」 화면에서 언제든 다시 볼 수 있어요.', icon: 'user' },
        ],
      },
    ],
  },
  {
    id: 'faq', icon: 'alert',
    title: '자주 묻는 질문',
    summary: '궁금한 묶음을 눌러 보세요.',
    groups: [],
    faqs: [
      { cat: '참가신청', q: '「참」을 눌렀는데 팀이 안 보여요.', a: ['비정규는 대기명단에서 기다려요.', '보통 금요일까지 정해져요.'] },
      { cat: '참가신청', q: '금요일 이후에 못 나가게 됐어요.', a: ['신청은 금요일에 마감돼요.', '운영진에게 바로 말해 주세요.'] },
      { cat: '월렛', q: '입금했는데 포인트가 안 들어와요.', a: ['본인 이름으로 보냈나요?', '아니면 충전 창에서 알려 주세요.'] },
      { cat: '월렛', q: '정규권은 언제 살 수 있어요?', a: ['운영진이 단톡방에 판매를 알려요.', '판매 기간에 선착순으로 사요.', '지난달 정규였다면 같은 팀이 돼요.', '남은 비정규 티켓은 할인으로 써요.'] },
      { cat: '월렛', q: '비정규 티켓은 언제 빠져요?', a: ['신청이 마감될 때 빠져요.', '팀에 배정된 사람만 빠져요.', '티켓이 없으면 포인트로 1장을 사서 써요.', '포인트가 모자라지 않게 미리 충전해 두세요.', '「불」로 취소해도 티켓은 내 월렛에 남아요.', '남은 티켓은 다음에 나올 때 써요.'] },
      { cat: '기록 · 영상', q: '「하루 평균」은 무슨 뜻이에요?', a: ['토요일 하루 9경기를 합쳐서 봐요.', '한 경기 10분은 너무 짧아서예요.'] },
      { cat: '기록 · 영상', q: '순위에 제 이름이 없어요.', a: ['열린 날의 30% 이상 나와야 해요.', '프로농구도 같은 방식이에요.'] },
      { cat: '기록 · 영상', q: '영상이 검은 화면이에요.', a: ['몇 초 기다리면 다시 켜져요.', '그래도 안 되면 새로고침해 주세요.'] },
      { cat: '계정', q: '비밀번호를 잊었어요.', a: ['운영진에게 초기화를 요청해 주세요.', '초기 비밀번호는 123456 이에요.'] },
      { cat: '계정', q: '예전에 실명으로 가입했어요.', a: ['지금 아이디는 실명 그대로예요.', '「나」 탭 계정에서 아이디를 바꿀 수 있어요.'] },
    ],
  },
]
