// 어드민(팀 운영진)용 가이드 본문 (2026-11-10 운영진) — 화면 `/guide/admin` 의 정본.
//   2026-11-10 운영진: 「글로 쭉 쓰면 읽기 싫다 · 매뉴얼처럼 도식화 · 도형·아이콘 적극」 → 글 목록이 아니라
//   흐름도(flow) · 갈래 흐름(lanes) · 카드(cards) · 상태표(status) 블록으로 쓴다. 캡처 그림은 쓰지 않는다.
//   그리기는 components/league/guide/AdminGuideView.tsx. 문구는 짧게(카드 제목 ≤ 12자, 설명 ≤ 2줄).
//   ⚠ 동호회 이름·실명·계좌번호를 넣지 않는다. 기능이 바뀌면 회원 가이드(memberGuide.ts)와 같이 고친다.
import type { GuideFaq } from './memberGuide'

/** 누가 하나 — 자동(초록 번개) · 어드민(노랑 손) · 회원(회색 사람) */
export type Who = 'auto' | 'admin' | 'member'

/** 화면에서 쓰는 아이콘 이름 — AdminGuideView 의 ICONS 와 같은 목록 */
export type IconKey =
  | 'calendar' | 'check' | 'x' | 'users' | 'userPlus' | 'lock' | 'pen' | 'video' | 'ticket' | 'wallet'
  | 'bank' | 'phone' | 'bell' | 'drag' | 'tap' | 'undo' | 'crown' | 'shirt' | 'alert' | 'ok' | 'key'
  | 'shield' | 'receipt' | 'copy' | 'battery' | 'list' | 'swap' | 'zap' | 'coins' | 'refresh' | 'home' | 'gear'

export interface FlowStep { icon: IconKey; who: Who; title: string; desc?: string; when?: string }
export interface GuideCard { icon: IconKey; title: string; desc: string; who?: Who; path?: string[] }
export interface StatusRow { tone: 'ok' | 'warn' | 'bad'; title: string; desc: string; action: string }

export type GuideBlock =
  | { kind: 'flow'; title?: string; steps: FlowStep[] }
  | { kind: 'lanes'; title?: string; lanes: { label: string; icon: IconKey; steps: FlowStep[] }[] }
  | { kind: 'cards'; title?: string; items: GuideCard[] }
  | { kind: 'status'; title?: string; items: StatusRow[] }
  | { kind: 'faq'; faqs: GuideFaq[] }

export interface AdminSection { id: string; icon: IconKey; title: string; summary: string; where?: string[]; blocks: GuideBlock[] }

export const ADMIN_GUIDE: AdminSection[] = [
  {
    id: 'week', icon: 'calendar', title: '한 주 흐름', summary: '대부분 자동이에요. 어드민은 노란 칸만 하면 돼요.',
    blocks: [
      {
        kind: 'flow', steps: [
          { icon: 'bell', who: 'auto', when: '월 0시', title: '신청 열림', desc: '홈 맨 위에 참 / 불' },
          { icon: 'drag', who: 'admin', when: '월~금', title: '대기명단 배치', desc: '비정규·게스트를 팀으로' },
          { icon: 'lock', who: 'auto', when: '토요일', title: '신청 마감', desc: '일정·빈 경기 칸 생김' },
          { icon: 'pen', who: 'admin', when: '경기 뒤', title: '경기 기록', desc: '일정 탭 「기록하기」' },
          { icon: 'video', who: 'auto', when: '매일 밤', title: '영상 연결', desc: '유튜브 영상이 경기에 붙음' },
        ],
      },
    ],
  },
  {
    id: 'rsvp', icon: 'users', title: '참가신청', summary: '누가 「참」을 누르면 어디로 가는지 보세요.',
    where: ['홈', '신청 현황 보기'],
    blocks: [
      {
        kind: 'lanes', title: '「참」을 누른 뒤', lanes: [
          {
            label: '정규', icon: 'crown', steps: [
              { icon: 'check', who: 'member', title: '「참」' },
              { icon: 'zap', who: 'auto', title: '이번 달 팀에 바로' },
            ],
          },
          {
            label: '비정규', icon: 'ticket', steps: [
              { icon: 'check', who: 'member', title: '「참」' },
              { icon: 'ticket', who: 'auto', title: '티켓 자동 구매', desc: '포인트에서 12,000P' },
              { icon: 'list', who: 'auto', title: '대기명단' },
              { icon: 'drag', who: 'admin', title: '팀에 배치', desc: '이때 티켓 사용' },
            ],
          },
          {
            label: '게스트', icon: 'userPlus', steps: [
              { icon: 'userPlus', who: 'member', title: '회원이 게스트 신청' },
              { icon: 'list', who: 'auto', title: '대기명단' },
              { icon: 'drag', who: 'admin', title: '팀에 배치' },
              { icon: 'coins', who: 'auto', title: '게스트비 확인', desc: '포인트·입금 모두 자동' },
            ],
          },
        ],
      },
      {
        kind: 'cards', title: '어드민이 하는 일', items: [
          { icon: 'drag', who: 'admin', title: '배치', desc: 'PC는 이름을 끌어 팀 카드에 놓기 · 폰은 「팀 고르기」' },
          { icon: 'check', who: 'admin', title: '대신 참 · 불', desc: '정규 줄의 V / X 한 번 누르기' },
          { icon: 'userPlus', who: 'admin', title: '대신 참 넣기', desc: '비정규를 화면 아래 칸에서 골라 넣기' },
          { icon: 'undo', who: 'admin', title: '취소', desc: '배치를 풀어도 티켓은 회원 월렛에 남아요' },
          { icon: 'lock', who: 'admin', title: '일찍 마감', desc: '「참가신청 마감하기」 · 대기명단이 남으면 한 번 더 물어요' },
          { icon: 'pen', who: 'admin', title: '마감 뒤 수정', desc: '일정 탭 날짜 카드 「참가 명단」 · 기록 시작 전까지', path: ['일정', '참가 명단'] },
        ],
      },
      {
        kind: 'status', title: '대기명단 이름 옆 표시', items: [
          { tone: 'ok', title: '티켓 N장', desc: '남은 티켓이 있어요', action: '그냥 배치하면 돼요' },
          { tone: 'ok', title: '포인트로 자동', desc: '티켓은 없지만 포인트가 있어요', action: '배치하면 저절로 1장 사요' },
          { tone: 'bad', title: '포인트 부족', desc: '티켓도 포인트도 모자라요', action: '회원에게 충전을 부탁해요' },
        ],
      },
    ],
  },
  {
    id: 'wallet', icon: 'wallet', title: '월렛 · 포인트', summary: '돈은 이렇게 흘러가요. 거의 다 자동이에요.',
    where: ['월렛', '어드민 탭'],
    blocks: [
      {
        kind: 'flow', title: '충전에서 경기까지', steps: [
          { icon: 'bank', who: 'member', title: '모임통장 입금', desc: '본인 이름으로' },
          { icon: 'phone', who: 'auto', title: '입금 알림', desc: '어드민 폰이 온볼로' },
          { icon: 'wallet', who: 'auto', title: '포인트 충전', desc: '5만원↑ 10% 보너스' },
          { icon: 'ticket', who: 'auto', title: '티켓 구매', desc: '「참」 누를 때' },
          { icon: 'check', who: 'auto', title: '경기 참가', desc: '배치 때 티켓 사용' },
        ],
      },
      {
        kind: 'cards', title: '어드민이 하는 일', items: [
          { icon: 'check', who: 'admin', title: '요청 승인', desc: '다른 이름으로 입금한 회원의 충전 요청 · 통장 확인 후 「승인」' },
          { icon: 'copy', who: 'admin', title: '환불 송금', desc: '「계좌번호 복사」 → 송금 → 「송금했어요」' },
          { icon: 'swap', who: 'admin', title: '보정', desc: '잘못 들어간 포인트 더하기·빼기 · 이유 필수' },
          { icon: 'receipt', who: 'admin', title: '처리 내역', desc: '달을 고르면 그 달 충전·환불 합계' },
        ],
      },
      {
        kind: 'status', title: '이럴 때는', items: [
          { tone: 'warn', title: '회비가 포인트로 들어감', desc: '회원 이름으로 입금하면 충전으로 처리돼요', action: '보정으로 빼기(이유 적기)' },
          { tone: 'warn', title: '티켓을 포인트로 돌려줘야 함', desc: '취소해도 티켓은 회원에게 남는 게 기본이에요', action: '회원 이름 → 티켓 「돌려주기」' },
        ],
      },
    ],
  },
  {
    id: 'month', icon: 'refresh', title: '매달 준비', summary: '달이 바뀌기 전에 세 가지를 챙겨요.',
    blocks: [
      {
        kind: 'flow', steps: [
          { icon: 'bell', who: 'auto', when: '매달 20일~', title: '정규권 알림', desc: '홈 맨 위에 안 산 사람 목록' },
          { icon: 'copy', who: 'admin', title: '단톡방 안내', desc: '「단톡방 안내 복사」 → 붙여 넣기' },
          { icon: 'users', who: 'admin', title: '다음 달 정규 멤버', desc: '팀 탭 → 명단 편집 → 달별 정규 멤버' },
          { icon: 'shirt', who: 'admin', title: '유니폼 색', desc: '팀 칸 위 노랑 · 흰색 · 검정' },
        ],
      },
      {
        kind: 'cards', items: [
          { icon: 'crown', who: 'admin', title: '팀장 정하기', desc: '달별 정규 멤버에서 이름에 마우스 → 왕관' },
          { icon: 'alert', title: '정규권이 없으면', desc: '정규 멤버도 그 달은 비정규로 잡혀요' },
        ],
      },
    ],
  },
  {
    id: 'bank', icon: 'phone', title: '입금 자동 확인', summary: '어드민 한 명의 안드로이드 폰이 입금 알림을 온볼에 보내요.',
    where: ['월렛', '어드민 탭', '입금 자동 승인'],
    blocks: [
      {
        kind: 'status', title: '「최근 받은 알림」 읽는 법', items: [
          { tone: 'ok', title: '요청 자동 승인 · 입금 자동 충전', desc: '이름·금액이 맞아 저절로 처리됐어요', action: '할 일 없음' },
          { tone: 'ok', title: '게스트비 확인', desc: '통장 게스트비가 「입금✓」 됐어요', action: '할 일 없음' },
          { tone: 'warn', title: '짝 없음', desc: '명단에 없는 이름이거나 다른 이름으로 보냈어요', action: '회원 확인 → 충전 요청 승인' },
          { tone: 'warn', title: '여러 명 — 손으로', desc: '같은 이름·같은 금액이 둘이에요', action: '직접 승인' },
          { tone: 'bad', title: '알림이 아예 없음', desc: '폰이 꺼졌거나 앱이 멈췄어요', action: '폰 확인 · 그동안은 직접 승인' },
        ],
      },
      {
        kind: 'cards', items: [
          { icon: 'battery', who: 'admin', title: '배터리 최적화 끄기', desc: '알림 보내는 앱이 잠들지 않게' },
          { icon: 'key', who: 'admin', title: '폰을 바꾸면', desc: '「비밀번호 새로 만들기」 → 새 폰에 넣기' },
          { icon: 'shield', title: '돈이 잘못 들어가진 않아요', desc: '자동이 멈추면 직접 승인하면 돼요' },
        ],
      },
    ],
  },
  {
    id: 'members', icon: 'shield', title: '회원 관리', summary: '가입은 대부분 자동 승인이에요.',
    where: ['설정', '회원 패널'],
    blocks: [
      {
        kind: 'cards', items: [
          { icon: 'zap', who: 'auto', title: '가입 자동 승인', desc: '명단에 있는 이름이면 바로 승인' },
          { icon: 'userPlus', who: 'admin', title: '새 사람 승인', desc: '홈 맨 위 「가입 신청」 알림에서' },
          { icon: 'key', who: 'admin', title: '비밀번호 초기화', desc: '회원 패널에서 그 회원 줄' },
          { icon: 'crown', who: 'admin', title: '어드민 지정', desc: '회원 패널 머리의 「어드민 지정」 · 2명 이상 권장' },
        ],
      },
    ],
  },
  {
    id: 'record', icon: 'pen', title: '경기 기록', summary: '1 · 2경기만 정하면 나머지는 저절로 채워져요.',
    where: ['일정', '날짜 카드', '기록하기'],
    blocks: [
      {
        kind: 'flow', steps: [
          { icon: 'video', who: 'auto', title: '영상이 일정에', desc: '매일 밤 자동' },
          { icon: 'users', who: 'admin', title: '1 · 2경기 팀', desc: '나머지 대진 자동' },
          { icon: 'swap', who: 'admin', title: '좌우 확인', desc: '경기마다 ⇄' },
          { icon: 'pen', who: 'admin', title: '기록 · 마감', desc: '「다음 경기 기록하기」' },
        ],
      },
      {
        kind: 'cards', items: [
          { icon: 'list', who: 'auto', title: '명단 자동', desc: '참가신청에서 배치한 사람이 그 팀으로' },
          { icon: 'alert', who: 'admin', title: '친선전', desc: '「경기 종류」에서 고르면 순위에서 빠져요' },
        ],
      },
    ],
  },
  {
    id: 'faq', icon: 'alert', title: '자주 묻는 질문', summary: '궁금한 묶음을 눌러 보세요.',
    blocks: [
      {
        kind: 'faq', faqs: [
          { cat: '참가신청', q: '비정규를 배치하려는데 안 돼요.', a: ['포인트가 티켓값보다 모자란 거예요.', '충전되면 다시 배치하면 돼요.'] },
          { cat: '참가신청', q: '마감 뒤에 한 명 더 넣어야 해요.', a: ['일정 탭 그 날짜 카드의 「참가 명단」에서 넣어요.', '기록이 시작되기 전까지만 돼요.'] },
          { cat: '참가신청', q: '배치를 취소하면 티켓은요?', a: ['회원 월렛에 티켓으로 남아요.', '다음에 나올 때 그 티켓을 써요.'] },
          { cat: '월렛', q: '입금했다는데 포인트가 안 들어갔대요.', a: ['「최근 받은 알림」에서 그 입금을 찾아봐요.', '이름이 달랐다면 충전 요청을 부탁해요.'] },
          { cat: '월렛', q: '포인트를 현금으로 돌려 달래요.', a: ['회원이 월렛에서 「환불」을 요청해요.', '어드민은 송금하고 「송금했어요」를 눌러요.'] },
          { cat: '운영', q: '정규 멤버가 비정규로 보여요.', a: ['그 달 정규권이 없는 거예요.', '정규권을 사면 바로 정규로 바뀌어요.'] },
          { cat: '운영', q: '어드민이 바뀌어요.', a: ['설정 → 회원 패널 → 「어드민 지정」에서 바꿔요.', '알림 보내는 폰도 바뀌면 비밀번호를 새로 만들어요.'] },
        ],
      },
    ],
  },
]
