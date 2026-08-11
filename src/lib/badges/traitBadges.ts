// 개인특성 배지 (14종) — 정의와 평가 로직.
//
// ## 옛 `lib/stats/badges.ts` 와 무엇이 다른가
//
// 옛 19종은 선수 한 명을 팀 평균과 비교해 판정했다(`evaluateAllBadges(player, teamAvg)`).
// 그 방식은 미라클 실측에서 세 가지로 무너졌다(2026-08-11 측정):
//   · 3종(동호회커리·강심장·킥아웃)은 기준이 리그 최고 기록보다 높아 **아무도 못 받았다**
//   · 팀 평균 배수(×1.5/×2.0/×2.5)는 평균이 작은 지표에서 사다리가 뒤집혔다
//     (블록: 팀평균 0.1 → 골드 5명 > 브론즈 1명)
//   · 1종은 76%가 받아 희소성이 없었다
//
// 그래서 대부분을 **모집단 안 순위(상위 10%/20%/30%)** 로 바꿨다. 순위는 한 명만 보고
// 계산할 수 없다 — 그래서 이 파일의 평가 함수는 **선수 전원을 한 번에** 받는다.
//
// ## 공통 규칙 (2026-08-11 사용자 확정)
//   · 티어: 금 = 상위 10% · 은 = 20% · 동 = 30% (누적, 위 티어 우선)
//   · "평균"은 경기당이 아니라 **라운드(하루)당**. 하루에 여러 경기를 뛰므로 값이 크다 —
//     화면에는 반드시 `/R`·"라운드(하루)당"으로 표기한다
//   · 슛 유형 배지는 **그 유형 비중 상위 50%** 를 모집단으로 삼고 성공률로 순위를 매긴다
//   · 순위 배지의 기본 모집단은 **3라운드 이상 출전자**

export type TraitTier = 'gold' | 'silver' | 'bronze'
export type TraitCategory = 'attack' | 'shooting' | 'defense' | 'playmaking'

export const TRAIT_CATEGORY_LABELS: Record<TraitCategory, string> = {
  attack: '공격',
  shooting: '슈팅',
  defense: '수비',
  playmaking: '플레이메이킹',
}

export interface TraitDefinition {
  code: string
  name: string
  icon: string
  category: TraitCategory
  /** 한 줄 설명 — 카드에 노출 */
  description: string
  /** 판정 기준을 사람 말로. 화면에 그대로 보여준다 */
  criteria: string
  /** 값 표기 단위 접미사 ('%' | '/R' | '') */
  unit: string
}

/** 상위 백분율로 티어를 나누는 배지의 컷 */
export const TIER_CUTS: Record<TraitTier, number> = { gold: 0.10, silver: 0.20, bronze: 0.30 }
/** 슛 유형 배지의 모집단 = 그 유형 비중 상위 50% */
export const SHOT_POOL_RATIO = 0.50
/** 순위 배지 자격 — 이보다 적게 나온 선수는 표본이 없어 순위가 무의미하다 */
export const MIN_ROUNDS = 3
/** 슛 유형 모집단에 들기 위한 최소 시도 — 1~2회로 성공률 100%가 되는 것을 막는다 */
export const MIN_SHOT_ATTEMPTS = 5
/** 어시스트 비율 배지의 최소 어시스트 */
export const MIN_ASSISTS = 10
/** 3점 성향 배지의 최소 3점 시도 */
export const MIN_THREE_ATTEMPTS = 10

export const TRAIT_DEFINITIONS: TraitDefinition[] = [
  // ── 공격 ────────────────────────────────────────────
  { code: 'PAINT_BUSTER', name: '골밑파괴자', icon: '⚔️', category: 'attack', unit: '%',
    description: '골밑을 지배하는 인사이드 킬러',
    criteria: '골밑슛 비중 상위 50% 중 골밑 성공률 순위' },
  { code: 'GLASS_EATER', name: '로드맨', icon: '💪', category: 'attack', unit: '/R',
    description: '공격 리바운드를 쓸어 담는 선수',
    criteria: '라운드(하루)당 공격 리바운드 순위' },
  { code: 'FINISHER', name: '피니셔', icon: '🏃', category: 'attack', unit: '%',
    description: '레이업을 확실히 마무리하는 선수',
    criteria: '레이업 비중 상위 50% 중 레이업 성공률 순위' },
  { code: 'SCORING_MACHINE', name: '득점기계', icon: '🔥', category: 'attack', unit: '%',
    description: '팀 득점을 혼자 책임지는 에이스',
    criteria: '본인이 뛴 경기에서 팀 총득점 대비 본인 득점 비율 순위' },

  // ── 슈팅 ────────────────────────────────────────────
  { code: 'JUNG_DAEMAN', name: '발맞으면쏜다!', icon: '🎯', category: 'shooting', unit: '%',
    description: '슛의 절반 가까이를 3점으로 해결',
    criteria: '3점 시도 / 전체 야투 40% · 50% · 60%' },
  { code: 'MID_MAESTRO', name: '미드레인지 장인', icon: '📍', category: 'shooting', unit: '%',
    description: '사라진 중거리를 살려 쓰는 슈터',
    criteria: '미들슛 비중 상위 50% 중 미들 성공률 순위' },

  // ── 수비 ────────────────────────────────────────────
  { code: 'GLASS_CLEANER', name: '수비의 끝은 리바운드', icon: '🪟', category: 'defense', unit: '/R',
    description: '상대 2차 공격을 끊는 수비 리바운더',
    criteria: '라운드(하루)당 수비 리바운드 순위' },
  { code: 'PICKPOCKET', name: '소매치기', icon: '🦅', category: 'defense', unit: '/R',
    description: '공을 낚아채는 스틸 전문가',
    criteria: '라운드(하루)당 스틸 순위' },
  { code: 'SHOT_BLOCKER', name: '목동타워', icon: '🛡️', category: 'defense', unit: '/R',
    description: '골밑을 지키는 수호자',
    criteria: '라운드(하루)당 블록 순위' },
  { code: 'HUSTLE_KING', name: '허슬킹', icon: '⚡', category: 'defense', unit: '/R',
    description: '몸을 아끼지 않는 허슬 플레이어',
    criteria: '(스틸+블록+수비리바)/라운드 ≥ 팀 평균 ×1.3 · ×1.6 · ×2.0' },

  // ── 플레이메이킹 ────────────────────────────────────
  { code: 'CLEAN_HANDS', name: '안전운반', icon: '🤝', category: 'playmaking', unit: '',
    description: '공을 잃지 않는 안정적인 핸들러',
    criteria: '어시스트 / 턴오버 1.8 · 2.3 · 2.8' },
  { code: 'KICKOUT', name: '킥아웃 전도사', icon: '🎦', category: 'playmaking', unit: '%',
    description: '외곽으로 빼주는 연결 플레이메이커',
    criteria: '3점으로 이어진 어시스트 비율 22% · 30% · 36%' },
  { code: 'FLOOR_GENERAL', name: '마에스트로', icon: '👑', category: 'playmaking', unit: '/R',
    description: '경기를 조율하는 사령탑',
    criteria: '라운드(하루)당 어시스트 순위' },
  { code: 'POCKET_PASSER', name: '포켓패서', icon: '🎯', category: 'playmaking', unit: '%',
    description: '골밑으로 찔러 넣는 침투 플레이메이커',
    criteria: '골밑·레이업으로 이어진 어시스트 비율 50% · 60% · 70%' },
]

export const TRAIT_BY_CODE: Record<string, TraitDefinition> =
  Object.fromEntries(TRAIT_DEFINITIONS.map(d => [d.code, d]))

/** 한 선수의 커리어 집계 — 평가에 필요한 값만 */
export interface TraitInput {
  playerId: string
  rounds: number          // 출전한 경기일 수
  fga: number; fgm: number
  threeA: number
  postA: number; postM: number
  layA: number;  layM: number
  midA: number;  midM: number
  oreb: number; dreb: number
  stl: number; blk: number; tov: number
  ast: number; ast3: number; astPaint: number
  myPoints: number        // 본인 득점 (본인이 뛴 경기 합)
  teamPoints: number      // 본인이 뛴 경기에서 본인 팀의 총득점
}

export interface EarnedTrait {
  code: string
  tier: TraitTier
  /** 판정에 쓰인 값 */
  value: number
  /** 모집단 안 등수 (고정 기준 배지는 null) */
  rank: number | null
  /** 모집단 크기 */
  poolSize: number
}

const ratio = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0)
const perRound = (v: number, rounds: number) => (rounds > 0 ? v / rounds : 0)

/** 값이 큰 순으로 줄 세워 상위 백분율로 티어를 매긴다 */
function rankTier(pool: TraitInput[], valueOf: (p: TraitInput) => number): Map<string, EarnedTrait> {
  const sorted = [...pool].sort((a, b) => valueOf(b) - valueOf(a))
  const size = sorted.length
  const out = new Map<string, EarnedTrait>()
  if (size === 0) return out
  const cut = (q: number) => Math.ceil(size * q)
  sorted.forEach((p, i) => {
    const rank = i + 1
    const tier: TraitTier | null =
      rank <= cut(TIER_CUTS.gold) ? 'gold'
      : rank <= cut(TIER_CUTS.silver) ? 'silver'
      : rank <= cut(TIER_CUTS.bronze) ? 'bronze'
      : null
    if (tier) out.set(p.playerId, { code: '', tier, value: valueOf(p), rank, poolSize: size })
  })
  return out
}

/** 비중 상위 SHOT_POOL_RATIO 를 모집단으로 자른다 */
function shareePool(
  players: TraitInput[],
  shareOf: (p: TraitInput) => number,
  attemptsOf: (p: TraitInput) => number,
): TraitInput[] {
  const eligible = players.filter(p => attemptsOf(p) >= MIN_SHOT_ATTEMPTS)
  const sorted = [...eligible].sort((a, b) => shareOf(b) - shareOf(a))
  return sorted.slice(0, Math.ceil(sorted.length * SHOT_POOL_RATIO))
}

/**
 * 리그 전원의 커리어 집계를 받아 선수별 획득 배지를 돌려준다.
 * 순위 기반이라 한 명만 따로 평가할 수 없다 — 반드시 전원을 넣어야 한다.
 */
export function evaluateTraitBadges(all: TraitInput[]): Map<string, EarnedTrait[]> {
  const result = new Map<string, EarnedTrait[]>()
  for (const p of all) result.set(p.playerId, [])
  const push = (pid: string, t: EarnedTrait) => result.get(pid)?.push(t)

  // 순위 배지의 기본 모집단
  const active = all.filter(p => p.rounds >= MIN_ROUNDS)

  const trackedShots = (p: TraitInput) => p.postA + p.layA + p.midA + p.threeA

  const rankBadges: { code: string; pool: TraitInput[]; valueOf: (p: TraitInput) => number }[] = [
    { code: 'GLASS_EATER',   pool: active, valueOf: p => perRound(p.oreb, p.rounds) },
    { code: 'GLASS_CLEANER', pool: active, valueOf: p => perRound(p.dreb, p.rounds) },
    { code: 'PICKPOCKET',    pool: active, valueOf: p => perRound(p.stl, p.rounds) },
    { code: 'SHOT_BLOCKER',  pool: active, valueOf: p => perRound(p.blk, p.rounds) },
    { code: 'FLOOR_GENERAL', pool: active, valueOf: p => perRound(p.ast, p.rounds) },
    { code: 'SCORING_MACHINE', pool: active, valueOf: p => ratio(p.myPoints, p.teamPoints) },
    { code: 'PAINT_BUSTER',
      pool: shareePool(active, p => ratio(p.postA, trackedShots(p)), p => p.postA),
      valueOf: p => ratio(p.postM, p.postA) },
    { code: 'FINISHER',
      pool: shareePool(active, p => ratio(p.layA, trackedShots(p)), p => p.layA),
      valueOf: p => ratio(p.layM, p.layA) },
    { code: 'MID_MAESTRO',
      pool: shareePool(active, p => ratio(p.midA, trackedShots(p)), p => p.midA),
      valueOf: p => ratio(p.midM, p.midA) },
  ]

  for (const { code, pool, valueOf } of rankBadges) {
    for (const [pid, t] of rankTier(pool, valueOf)) push(pid, { ...t, code })
  }

  // ── 고정 기준 배지 ─────────────────────────────────
  const fixedTier = (v: number, b: number, s: number, g: number): TraitTier | null =>
    v >= g ? 'gold' : v >= s ? 'silver' : v >= b ? 'bronze' : null

  for (const p of all) {
    // 발맞으면쏜다 — 3점 성향
    if (p.threeA >= MIN_THREE_ATTEMPTS) {
      const v = ratio(p.threeA, p.fga)
      const tier = fixedTier(v, 40, 50, 60)
      if (tier) push(p.playerId, { code: 'JUNG_DAEMAN', tier, value: v, rank: null, poolSize: 0 })
    }
    // 어시스트 계열 3종
    if (p.ast >= MIN_ASSISTS) {
      const atov = p.tov > 0 ? p.ast / p.tov : p.ast
      const t1 = fixedTier(atov, 1.8, 2.3, 2.8)
      if (t1) push(p.playerId, { code: 'CLEAN_HANDS', tier: t1, value: atov, rank: null, poolSize: 0 })

      const kick = ratio(p.ast3, p.ast)
      const t2 = fixedTier(kick, 22, 30, 36)
      if (t2) push(p.playerId, { code: 'KICKOUT', tier: t2, value: kick, rank: null, poolSize: 0 })

      const paint = ratio(p.astPaint, p.ast)
      const t3 = fixedTier(paint, 50, 60, 70)
      if (t3) push(p.playerId, { code: 'POCKET_PASSER', tier: t3, value: paint, rank: null, poolSize: 0 })
    }
  }

  // 허슬킹 — 팀 평균 배수. 세 지표를 합산해 폭이 넓어 배수 방식이 유일하게 잘 작동한다.
  const totalHustle = active.reduce((a, p) => a + p.stl + p.blk + p.dreb, 0)
  const totalRounds = active.reduce((a, p) => a + p.rounds, 0)
  const teamHustle = totalRounds > 0 ? totalHustle / totalRounds : 0
  if (teamHustle > 0) {
    for (const p of active) {
      const v = perRound(p.stl + p.blk + p.dreb, p.rounds)
      const tier = fixedTier(v, teamHustle * 1.3, teamHustle * 1.6, teamHustle * 2.0)
      if (tier) push(p.playerId, { code: 'HUSTLE_KING', tier, value: v, rank: null, poolSize: active.length })
    }
  }

  // 카탈로그 순서로 정렬해 화면마다 순서가 흔들리지 않게 한다
  const order = new Map(TRAIT_DEFINITIONS.map((d, i) => [d.code, i]))
  for (const list of result.values()) {
    list.sort((a, b) => (order.get(a.code) ?? 99) - (order.get(b.code) ?? 99))
  }
  return result
}

/** 화면 표기용 — 값 + 단위 */
export function formatTraitValue(code: string, value: number): string {
  const unit = TRAIT_BY_CODE[code]?.unit ?? ''
  if (unit === '%') return `${value.toFixed(1)}%`
  if (unit === '/R') return `${value.toFixed(2)}/R`
  return value.toFixed(2)
}
