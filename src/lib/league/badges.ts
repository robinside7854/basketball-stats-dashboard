// ── 배지 도감 시스템 (Phase 1) ───────────────────────────────────
// 리그 내 선수 백분위 기반으로 Gold/Silver/Bronze 배지 자동 부여

export type BadgeTier = 'gold' | 'silver' | 'bronze'

export interface BadgeResult {
  id: string
  name: string
  nameEn: string
  category: 'offensive' | 'defensive' | 'playmaking'
  icon: string
  description: string
  tier: BadgeTier
}

// 배지 계산에 필요한 선수 종합 스탯 (리그 전원 대상)
export interface PlayerMetrics {
  gp: number
  ppg: number; rpg: number; apg: number; spg: number; bpg: number; topg: number
  drebPerG: number; orebPerG: number; pfPerG: number
  fg3_pct: number; fg3aPerG: number
  efg_pct: number; fgaPerG: number
  ft_pct: number; ftaPerG: number
  atoRatio: number       // ast/tov (tov=0이면 ast값)
  defComposite: number   // spg + bpg
  hustleComposite: number // spg + bpg + orebPerG
  stlTotal: number       // 누적 스틸
}

// 백분위 계산 (lowerBetter=true → 낮을수록 좋은 스탯)
function pctRank(value: number, all: number[], lowerBetter = false): number {
  if (all.length <= 1) return 50
  if (lowerBetter) return all.filter(v => v > value).length / all.length * 100
  return all.filter(v => v < value).length / all.length * 100
}

// 백분위 → 티어 변환
function tier(pct: number): BadgeTier | null {
  if (pct >= 92) return 'gold'
  if (pct >= 85) return 'silver'
  if (pct >= 70) return 'bronze'
  return null
}

// 복합 조건 티어: 두 백분위 모두 충족해야 함
function tierBoth(pct1: number, pct2: number): BadgeTier | null {
  if (pct1 >= 92 && pct2 >= 92) return 'gold'
  if (pct1 >= 85 && pct2 >= 85) return 'silver'
  if (pct1 >= 70 && pct2 >= 70) return 'bronze'
  return null
}

function tierAll(pcts: number[]): BadgeTier | null {
  if (pcts.every(p => p >= 92)) return 'gold'
  if (pcts.every(p => p >= 85)) return 'silver'
  if (pcts.every(p => p >= 70)) return 'bronze'
  return null
}

// ── 배지 정의 25개 ──────────────────────────────────────────────
// Phase 1: stats 컬럼 기반 (이벤트 집계 불필요) 18개 + 이벤트 기반 7개 (O3/O4/O5/O8/O9/O10)
// Phase 1 구현: 18개 (이벤트 기반 Phase 2 배지는 tier=undefined로 skip)

interface BadgeDef {
  id: string
  name: string
  nameEn: string
  category: 'offensive' | 'defensive' | 'playmaking'
  icon: string
  description: string
  minGP: number
  compute: (p: PlayerMetrics, pct: (metric: keyof PlayerMetrics, lower?: boolean) => number) => BadgeTier | null
}

const BADGE_DEFS: BadgeDef[] = [
  // ── 오펜시브 ────────────────────────────────────────────────
  {
    id: 'O1', name: '득점 머신', nameEn: 'Scoring Machine',
    category: 'offensive', icon: '🎯',
    description: '리그를 압도하는 득점력',
    minGP: 5,
    compute: (p, pct) => tier(pct('ppg')),
  },
  {
    id: 'O2', name: '외곽 저격수', nameEn: 'Sharpshooter',
    category: 'offensive', icon: '🏹',
    description: '3점 슛 명사수 (3PA ≥ 1.5/G)',
    minGP: 5,
    compute: (p, pct) => p.fg3aPerG >= 1.5 ? tier(pct('fg3_pct')) : null,
  },
  {
    id: 'O6', name: '효율의 정석', nameEn: 'Efficient Scorer',
    category: 'offensive', icon: '🎓',
    description: '적은 슛으로 최대 득점 (FGA ≥ 3/G)',
    minGP: 5,
    compute: (p, pct) => p.fgaPerG >= 3 ? tier(pct('efg_pct')) : null,
  },
  {
    id: 'O7', name: '자유투 장인', nameEn: 'Free Throw Ace',
    category: 'offensive', icon: '🆓',
    description: '클러치 자유투 라인 (FTA ≥ 1/G)',
    minGP: 5,
    compute: (p, pct) => p.ftaPerG >= 1 ? tier(pct('ft_pct')) : null,
  },
  // ── 디펜시브 ────────────────────────────────────────────────
  {
    id: 'D1', name: '스틸 마스터', nameEn: 'Pickpocket',
    category: 'defensive', icon: '✋',
    description: '패스 길목의 사신',
    minGP: 5,
    compute: (p, pct) => tier(pct('spg')),
  },
  {
    id: 'D2', name: '림 프로텍터', nameEn: 'Rim Protector',
    category: 'defensive', icon: '🚫',
    description: '골밑 차단 전문가',
    minGP: 5,
    compute: (p, pct) => tier(pct('bpg')),
  },
  {
    id: 'D3', name: '수비 리바 왕', nameEn: 'Defensive Glass',
    category: 'defensive', icon: '🪟',
    description: '수비 리바운드 지배',
    minGP: 5,
    compute: (p, pct) => tier(pct('drebPerG')),
  },
  {
    id: 'D4', name: '철벽 수비수', nameEn: 'Lockdown Defender',
    category: 'defensive', icon: '🧱',
    description: '스틸 + 블록 종합 수비',
    minGP: 5,
    compute: (p, pct) => tier(pct('defComposite')),
  },
  {
    id: 'D5', name: '클린 디펜더', nameEn: 'Clean Defender',
    category: 'defensive', icon: '🦴',
    description: '적은 파울로 강한 수비',
    minGP: 5,
    compute: (p, pct) => {
      const defPct = Math.max(pct('spg'), pct('bpg'))
      if (defPct < 65) return null
      return tier(pct('pfPerG', true)) // 파울 적을수록 좋음
    },
  },
  {
    id: 'D6', name: '인터셉터', nameEn: 'Interceptor',
    category: 'defensive', icon: '🎣',
    description: '시즌 전체 스틸 절대량',
    minGP: 5,
    compute: (p, pct) => tier(pct('stlTotal')),
  },
  {
    id: 'D7', name: '리바운드 머신', nameEn: 'Rebound Machine',
    category: 'defensive', icon: '⛓️',
    description: '공·수 리바운드 모두',
    minGP: 5,
    compute: (p, pct) => tier(pct('rpg')),
  },
  {
    id: 'D8', name: '허슬 플레이어', nameEn: 'Hustle Hero',
    category: 'defensive', icon: '🐝',
    description: '스틸 + 블록 + 공격리바 종합 허슬',
    minGP: 5,
    compute: (p, pct) => tier(pct('hustleComposite')),
  },
  // ── 플레이메이킹 ─────────────────────────────────────────────
  {
    id: 'P1', name: '플로어 제너럴', nameEn: 'Floor General',
    category: 'playmaking', icon: '🎩',
    description: '리그 최고의 패서',
    minGP: 5,
    compute: (p, pct) => tier(pct('apg')),
  },
  {
    id: 'P2', name: '영리한 핸들러', nameEn: 'Smart Handler',
    category: 'playmaking', icon: '🧠',
    description: '어시스트 대비 턴오버가 적음 (APG ≥ 1.5)',
    minGP: 5,
    compute: (p, pct) => p.apg >= 1.5 ? tier(pct('atoRatio')) : null,
  },
  {
    id: 'P3', name: '볼 안전 요원', nameEn: 'Ball Protector',
    category: 'playmaking', icon: '🛡️',
    description: '턴오버 최소화 (APG ≥ 1/G)',
    minGP: 5,
    compute: (p, pct) => p.apg >= 1 ? tier(pct('topg', true)) : null,
  },
  {
    id: 'P4', name: '듀얼 위협', nameEn: 'Dual Threat',
    category: 'playmaking', icon: '🤝',
    description: '득점 + 어시스트 모두 상위권',
    minGP: 5,
    compute: (p, pct) => tierBoth(pct('ppg'), pct('apg')),
  },
  {
    id: 'P5', name: '트리플 위협', nameEn: 'Triple Threat',
    category: 'playmaking', icon: '📊',
    description: '득점 + 리바운드 + 어시스트 균형',
    minGP: 5,
    compute: (p, pct) => tierAll([pct('ppg'), pct('rpg'), pct('apg')]),
  },
  {
    id: 'P6', name: '클러치 핸들러', nameEn: 'Clutch Handler',
    category: 'playmaking', icon: '🪄',
    description: '어시스트 상위 + A/TO 비율 우수',
    minGP: 5,
    compute: (p, pct) => {
      const apgPct = pct('apg')
      if (apgPct < 70) return null
      if (apgPct >= 92 && p.atoRatio >= 2.0) return 'gold'
      if (apgPct >= 85 && p.atoRatio >= 1.5) return 'silver'
      if (apgPct >= 70 && p.atoRatio >= 1.2) return 'bronze'
      return null
    },
  },
  {
    id: 'P7', name: '만능 스탯', nameEn: 'Stat Stuffer',
    category: 'playmaking', icon: '🌟',
    description: '5개 스탯 중 4개 이상 상위권',
    minGP: 5,
    compute: (p, pct) => {
      const pcts = [pct('ppg'), pct('rpg'), pct('apg'), pct('spg'), pct('bpg')]
      const gold   = pcts.filter(x => x >= 92).length
      const silver = pcts.filter(x => x >= 85).length
      const bronze = pcts.filter(x => x >= 70).length
      if (gold >= 4) return 'gold'
      if (silver >= 4) return 'silver'
      if (bronze >= 4) return 'bronze'
      return null
    },
  },
]

// 모든 배지 정의 export (미획득 배지 표시용)
export const ALL_BADGES = BADGE_DEFS.map(({ id, name, nameEn, category, icon, description }) => ({
  id, name, nameEn, category, icon, description,
}))

// 핵심 함수: 선수 배지 목록 계산
export function computeBadges(
  playerMetrics: PlayerMetrics,
  allPlayerMetrics: PlayerMetrics[],
): BadgeResult[] {
  const qualified = allPlayerMetrics.filter(p => p.gp >= 5)
  if (qualified.length === 0) return []

  // 각 메트릭의 전체 값 배열
  const metricValues: Record<keyof PlayerMetrics, number[]> = {} as Record<keyof PlayerMetrics, number[]>
  const keys: (keyof PlayerMetrics)[] = [
    'gp', 'ppg', 'rpg', 'apg', 'spg', 'bpg', 'topg',
    'drebPerG', 'orebPerG', 'pfPerG',
    'fg3_pct', 'fg3aPerG', 'efg_pct', 'fgaPerG', 'ft_pct', 'ftaPerG',
    'atoRatio', 'defComposite', 'hustleComposite', 'stlTotal',
  ]
  for (const k of keys) {
    metricValues[k] = qualified.map(p => p[k] as number)
  }

  // 타겟 선수의 특정 metric 백분위 반환하는 함수
  function getPct(metric: keyof PlayerMetrics, lowerBetter = false): number {
    const val = playerMetrics[metric] as number
    const all = metricValues[metric] ?? []
    return pctRank(val, all, lowerBetter)
  }

  const earned: BadgeResult[] = []

  for (const def of BADGE_DEFS) {
    if (playerMetrics.gp < def.minGP) continue
    const t = def.compute(playerMetrics, getPct)
    if (t) {
      earned.push({
        id: def.id, name: def.name, nameEn: def.nameEn,
        category: def.category, icon: def.icon, description: def.description,
        tier: t,
      })
    }
  }

  // 카테고리 → 티어 순 정렬
  const catOrder = { offensive: 0, defensive: 1, playmaking: 2 }
  const tierOrder = { gold: 0, silver: 1, bronze: 2 }
  return earned.sort((a, b) =>
    catOrder[a.category] - catOrder[b.category] ||
    tierOrder[a.tier] - tierOrder[b.tier]
  )
}
