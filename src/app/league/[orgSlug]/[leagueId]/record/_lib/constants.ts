import type { YtTitleRule } from './types'

export const YT_RULE_LABEL: Record<YtTitleRule, string> = {
  quarter: '대진 + 쿼터',
  legacy: '경기 번호',
}

// 정식 경기(1~4쿼터 + 연장)용 선택지. league_game_events.quarter 는 CHECK(1~6) 이라 연장은 2회까지.
// 미라클의 짧은 슬롯 경기는 쿼터를 나누지 않으므로 1 을 그대로 두면 기존 기록과 동일하다.
export const QUARTER_OPTIONS = [
  { value: 1, label: '1Q' }, { value: 2, label: '2Q' },
  { value: 3, label: '3Q' }, { value: 4, label: '4Q' },
  { value: 5, label: '연장' }, { value: 6, label: '연장2' },
] as const

// 기록 중 이탈 확인 문구 (기록 중 이탈 경고 · confirmLeave)
export const LEAVE_MESSAGE = '기록 중인 경기가 있어요.\n이동해도 기록은 저장돼 있지만, 마감은 아직 안 됐어요.\n\n이동할까요?'
