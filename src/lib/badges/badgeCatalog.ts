// 배지 도감용 카탈로그 — **자동 4종 · 커리어 10종**의 라벨과 달성 조건 설명.
//
// ## 왜 이 파일이 따로 있나 (복제처럼 보이는 이유)
// 판정 정본은 여기가 아니다:
//   · 자동 4종   → `computeBadges.ts`
//   · 커리어 10종 → `careerBadges.ts`
//   · 특성 14종   → `traitBadges.ts` — **설명까지 그 파일이 정본이라 여기 옮겨 적지 않는다.**
//     도감은 `TRAIT_DEFINITIONS` 를 직접 읽는다.
//
// 그런데 위 두 정본은 `@supabase/supabase-js` 와 서버 전용 헬퍼(`scorePoints`,
// `fetchExternalTeamIds`)를 값으로 import 한다. 클라이언트 컴포넌트가 그 파일을 import 하면
// 서버 코드가 통째로 브라우저 번들에 끌려 들어온다. 그래서 **사람이 읽는 문구만** 이 파일에
// 따로 둔다.
//
// ⚠ 정본의 임계값(FGA 3 · 카테고리 10 · 라운드 10/25/50/100 · 득점 100/250/500/1000)을
//    바꾸면 **이 파일의 criteria 문구도 같이 고쳐야 한다.** 틀린 설명은 없는 것만 못하다.
//
// 아래 문구는 2026-08-13 기준 판정 코드에서 그대로 옮긴 것이다.

import { CalendarCheck, Flame, Layers, Target, Trophy, Zap, type LucideIcon } from 'lucide-react'

export interface BadgeCatalogEntry {
  /** DB `player_badges.badge_type` 값 */
  key: string
  label: string
  /** 판정 단위 — 같은 "10점"이라도 경기 단위인지 하루 합산인지가 다르다 */
  scope: string
  /** 달성 조건. 판정 코드에서 옮겨 적었다 */
  criteria: string
  Icon: LucideIcon
}

/**
 * 자동 배지 4종 — 정본 `computeBadges.ts`.
 * 순서는 `PlayerBadgeStrip` 의 표시 순서이기도 하다.
 */
export const AUTO_BADGES: BadgeCatalogEntry[] = [
  {
    key: 'perfect_game',
    label: '퍼펙트게임',
    scope: '경기당',
    // computePerGameBadges: s.fga >= 3 && s.fgm === s.fga (SHOT_TYPES = 레이업/미들/포스트/3점)
    criteria: '한 경기에서 야투를 3개 이상 시도해 전부 성공. 자유투는 시도·성공에 세지 않는다.',
    Icon: Target,
  },
  {
    key: 'double_double',
    label: '더블더블',
    scope: '라운드(하루)당',
    // computeRoundBadges: hitCats.length === 2 (pts/reb/ast/stl/blk >= 10)
    criteria: '그날 치른 모든 경기를 합산해 득점·리바운드·어시스트·스틸·블록 중 정확히 2개가 10 이상.',
    Icon: Layers,
  },
  {
    key: 'triple_double',
    label: '트리플더블',
    scope: '라운드(하루)당',
    // computeRoundBadges: hitCats.length >= 3 — TD 를 받으면 DD 는 주지 않는다
    criteria: '같은 하루 합산에서 3개 이상이 10 이상. 이걸 받으면 더블더블은 따로 주지 않는다.',
    Icon: Trophy,
  },
  {
    key: 'winning_shot',
    label: '위닝샷',
    scope: '경기당',
    // computePerGameBadges: 마지막 득점(video_timestamp max) · 그 팀이 승자 · margin <= pts
    criteria: '경기의 마지막 득점이 본인이고 그 팀이 이겼으며, 승리 점수차가 그 득점 이하일 때. 즉 그 슛이 없었으면 이기지 못했어야 한다.',
    Icon: Zap,
  },
]

/**
 * 커리어 배지 10종 — 정본 `careerBadges.ts`.
 * 전부 **평생 1회**이며 달성한 날짜가 함께 남는다. 순서는 쉬운 것 → 어려운 것.
 */
export const CAREER_BADGES: BadgeCatalogEntry[] = [
  {
    key: 'career_first_three',
    label: '첫 3점',
    scope: '평생 1회',
    // THREE_TYPES = new Set(['shot_3p']) — 자유투 3점(ft_3pt_*)은 슛이 아니라 제외
    criteria: '3점슛을 처음 성공한 날. 자유투로 얻은 3점은 세지 않는다.',
    Icon: Target,
  },
  {
    key: 'career_first_dd',
    label: '첫 더블더블',
    scope: '평생 1회',
    // 이미 쌓인 double_double 배지 중 가장 이른 날을 그대로 쓴다 (판정을 두 번 하지 않는다)
    criteria: '더블더블을 처음 달성한 날. 더블더블 배지 기록에서 가장 이른 날을 그대로 쓴다.',
    Icon: Layers,
  },
  { key: 'career_rounds_10',  label: '10라운드',  scope: '평생 1회', criteria: '경기일 기준 누적 10일 출전. 하루에 몇 경기를 뛰어도 1라운드로 센다.',  Icon: CalendarCheck },
  { key: 'career_rounds_25',  label: '25라운드',  scope: '평생 1회', criteria: '경기일 기준 누적 25일 출전.',  Icon: CalendarCheck },
  { key: 'career_rounds_50',  label: '50라운드',  scope: '평생 1회', criteria: '경기일 기준 누적 50일 출전.',  Icon: CalendarCheck },
  { key: 'career_rounds_100', label: '100라운드', scope: '평생 1회', criteria: '경기일 기준 누적 100일 출전.', Icon: CalendarCheck },
  { key: 'career_pts_100',    label: '100점',    scope: '평생 1회', criteria: '누적 득점 100점 돌파.',   Icon: Flame },
  { key: 'career_pts_250',    label: '250점',    scope: '평생 1회', criteria: '누적 득점 250점 돌파.',   Icon: Flame },
  { key: 'career_pts_500',    label: '500점',    scope: '평생 1회', criteria: '누적 득점 500점 돌파.',   Icon: Flame },
  { key: 'career_pts_1000',   label: '1000점',   scope: '평생 1회', criteria: '누적 득점 1000점 돌파.',  Icon: Flame },
]

/** 커리어 배지 전반에 걸린 조건 — 도감 각주로 한 번만 안내한다 */
export const CAREER_NOTE = '게스트 출전 기록은 커리어 배지에 쌓이지 않습니다.'
