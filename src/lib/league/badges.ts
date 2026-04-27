// ── 배지 도감 시스템 (Phase 1 + Phase 2) ─────────────────────────
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

export interface BadgeDisplayInfo {
  id: string
  name: string
  nameEn: string
  category: 'offensive' | 'defensive' | 'playmaking'
  icon: string
  description: string
  tierDesc: { gold: string; silver: string; bronze: string }
  minGP: number
}

// 배지 계산에 필요한 선수 종합 스탯 (리그 전원 대상)
export interface PlayerMetrics {
  gp: number
  ppg: number; rpg: number; apg: number; spg: number; bpg: number; topg: number
  drebPerG: number; orebPerG: number; pfPerG: number
  fg3_pct: number; fg3aPerG: number
  efg_pct: number; fgaPerG: number
  ft_pct: number; ftaPerG: number
  atoRatio: number
  defComposite: number
  hustleComposite: number
  stlTotal: number
  // Phase 2
  midPerG: number
  slashPerG: number
  postPerG: number
  andOnePerG: number
  threeDistPct: number
  midDistPct: number
  slashDistPct: number
}

function pctRank(value: number, all: number[], lowerBetter = false): number {
  if (all.length <= 1) return 50
  if (lowerBetter) return all.filter(v => v > value).length / all.length * 100
  return all.filter(v => v < value).length / all.length * 100
}

function tier(pct: number): BadgeTier | null {
  if (pct >= 92) return 'gold'
  if (pct >= 85) return 'silver'
  if (pct >= 70) return 'bronze'
  return null
}

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

interface BadgeDef {
  id: string
  name: string
  nameEn: string
  category: 'offensive' | 'defensive' | 'playmaking'
  icon: string
  description: string
  tierDesc: { gold: string; silver: string; bronze: string }
  minGP: number
  compute: (p: PlayerMetrics, pct: (metric: keyof PlayerMetrics, lower?: boolean) => number) => BadgeTier | null
}

const BADGE_DEFS: BadgeDef[] = [
  // ══════════════════ 오펜시브 ══════════════════
  {
    id: 'O1', name: '득점 머신', nameEn: 'Scoring Machine',
    category: 'offensive', icon: '🎯',
    description: '리그를 압도하는 득점력을 보유한 선수',
    tierDesc: { gold: '리그 득점 상위 8%', silver: '상위 15%', bronze: '상위 30%' },
    minGP: 3,
    compute: (p, pct) => tier(pct('ppg')),
  },
  {
    id: 'O2', name: '외곽 저격수', nameEn: 'Sharpshooter',
    category: 'offensive', icon: '🏹',
    description: '3점 슛을 즐기고 성공시키는 명사수 (3PA ≥ 1.5/G)',
    tierDesc: { gold: '3점 시도 1.5/G 이상 + 3P% 상위 8%', silver: '3P% 상위 15%', bronze: '3P% 상위 30%' },
    minGP: 3,
    compute: (p, pct) => p.fg3aPerG >= 1.5 ? tier(pct('fg3_pct')) : null,
  },
  {
    id: 'O3', name: '미들 장인', nameEn: 'Midrange Maestro',
    category: 'offensive', icon: '🔥',
    description: '중거리 슛을 즐겨 쏘는 미드레인지 스페셜리스트',
    tierDesc: { gold: '미들슛 시도 상위 8%', silver: '상위 15%', bronze: '상위 30%' },
    minGP: 3,
    compute: (p, pct) => p.midPerG > 0 ? tier(pct('midPerG')) : null,
  },
  {
    id: 'O4', name: '돌파의 신', nameEn: 'Slasher',
    category: 'offensive', icon: '⚡',
    description: '레이업과 드라이브로 림을 끈질기게 공략하는 슬래셔',
    tierDesc: { gold: '레이업+드라이브 시도 상위 8%', silver: '상위 15%', bronze: '상위 30%' },
    minGP: 3,
    compute: (p, pct) => p.slashPerG > 0 ? tier(pct('slashPerG')) : null,
  },
  {
    id: 'O5', name: '골밑 지배자', nameEn: 'Post Beast',
    category: 'offensive', icon: '💪',
    description: '포스트업으로 상대를 짓누르는 골밑의 지배자',
    tierDesc: { gold: '골밑슛 시도 상위 8%', silver: '상위 15%', bronze: '상위 30%' },
    minGP: 3,
    compute: (p, pct) => p.postPerG > 0 ? tier(pct('postPerG')) : null,
  },
  {
    id: 'O6', name: '효율의 정석', nameEn: 'Efficient Scorer',
    category: 'offensive', icon: '🎓',
    description: '적은 슛으로 최대 득점을 뽑아내는 효율 스코어러 (FGA ≥ 3/G)',
    tierDesc: { gold: 'FGA 3/G 이상 + eFG% 상위 8%', silver: 'eFG% 상위 15%', bronze: 'eFG% 상위 30%' },
    minGP: 3,
    compute: (p, pct) => p.fgaPerG >= 3 ? tier(pct('efg_pct')) : null,
  },
  {
    id: 'O7', name: '자유투 장인', nameEn: 'Free Throw Ace',
    category: 'offensive', icon: '🆓',
    description: '클러치 상황에서 흔들리지 않는 자유투 라인의 달인 (FTA ≥ 1/G)',
    tierDesc: { gold: 'FTA 1/G 이상 + FT% 상위 8%', silver: 'FT% 상위 15%', bronze: 'FT% 상위 30%' },
    minGP: 3,
    compute: (p, pct) => p.ftaPerG >= 1 ? tier(pct('ft_pct')) : null,
  },
  {
    id: 'O8', name: '앤드원 헌터', nameEn: 'And-One Hunter',
    category: 'offensive', icon: '💥',
    description: '파울을 유도하며 득점을 동시에 해내는 앤드원 전문가',
    tierDesc: { gold: '앤드원 시도 상위 8%', silver: '상위 15%', bronze: '상위 30%' },
    minGP: 3,
    compute: (p, pct) => p.andOnePerG > 0 ? tier(pct('andOnePerG')) : null,
  },
  {
    id: 'O9', name: '풋백 스페셜', nameEn: 'Putback Specialist',
    category: 'offensive', icon: '♻️',
    description: '공격 리바운드를 잡고 높은 효율로 득점하는 2차 공격의 달인',
    tierDesc: { gold: '공격리바 상위 10% + eFG% 상위 25%', silver: '상위 20% + 상위 35%', bronze: '상위 30% + 상위 45%' },
    minGP: 3,
    compute: (p, pct) => {
      const o = pct('orebPerG'); const e = pct('efg_pct')
      if (o >= 90 && e >= 75) return 'gold'
      if (o >= 80 && e >= 65) return 'silver'
      if (o >= 70 && e >= 55) return 'bronze'
      return null
    },
  },
  {
    id: 'O10', name: '만능 스코어러', nameEn: 'Three-Level Scorer',
    category: 'offensive', icon: '👑',
    description: '3점·중거리·림 공략을 모두 균형있게 갖춘 올라운드 스코어러',
    tierDesc: { gold: '3P·미들·레이업 각 25%↑ + PPG 상위 20%', silver: '각 22%↑', bronze: '각 18%↑' },
    minGP: 3,
    compute: (p, pct) => {
      const { threeDistPct, midDistPct, slashDistPct } = p
      if (threeDistPct >= 25 && midDistPct >= 25 && slashDistPct >= 25 && pct('ppg') >= 80) return 'gold'
      if (threeDistPct >= 22 && midDistPct >= 22 && slashDistPct >= 22) return 'silver'
      if (threeDistPct >= 18 && midDistPct >= 18 && slashDistPct >= 18) return 'bronze'
      return null
    },
  },
  // ══════════════════ 디펜시브 ══════════════════
  {
    id: 'D1', name: '스틸 마스터', nameEn: 'Pickpocket',
    category: 'defensive', icon: '✋',
    description: '패스 길목에서 공을 가로채는 수비의 사신',
    tierDesc: { gold: '스틸 평균 상위 8%', silver: '상위 15%', bronze: '상위 30%' },
    minGP: 3,
    compute: (p, pct) => tier(pct('spg')),
  },
  {
    id: 'D2', name: '림 프로텍터', nameEn: 'Rim Protector',
    category: 'defensive', icon: '🚫',
    description: '골밑에서 상대의 슛을 막아내는 블록 전문가',
    tierDesc: { gold: '블록 평균 상위 8%', silver: '상위 15%', bronze: '상위 30%' },
    minGP: 3,
    compute: (p, pct) => tier(pct('bpg')),
  },
  {
    id: 'D3', name: '수비 리바 왕', nameEn: 'Defensive Glass',
    category: 'defensive', icon: '🪟',
    description: '수비 리바운드를 지배하며 상대의 2차 공격을 차단',
    tierDesc: { gold: '수비리바 상위 8%', silver: '상위 15%', bronze: '상위 30%' },
    minGP: 3,
    compute: (p, pct) => tier(pct('drebPerG')),
  },
  {
    id: 'D4', name: '철벽 수비수', nameEn: 'Lockdown Defender',
    category: 'defensive', icon: '🧱',
    description: '스틸과 블록을 모두 갖춘 종합 수비 능력자',
    tierDesc: { gold: '스틸+블록 합산 상위 8%', silver: '상위 15%', bronze: '상위 30%' },
    minGP: 3,
    compute: (p, pct) => tier(pct('defComposite')),
  },
  {
    id: 'D5', name: '클린 디펜더', nameEn: 'Clean Defender',
    category: 'defensive', icon: '🦴',
    description: '적은 파울로 강한 수비를 유지하는 영리한 디펜더',
    tierDesc: { gold: '수비 기여 상위 35% + 파울 최소 상위 8%', silver: '파울 최소 상위 15%', bronze: '파울 최소 상위 30%' },
    minGP: 3,
    compute: (p, pct) => {
      if (Math.max(pct('spg'), pct('bpg')) < 65) return null
      return tier(pct('pfPerG', true))
    },
  },
  {
    id: 'D6', name: '인터셉터', nameEn: 'Interceptor',
    category: 'defensive', icon: '🎣',
    description: '시즌 누적 스틸 절대량이 리그 최상위권인 선수',
    tierDesc: { gold: '누적 스틸 상위 8%', silver: '상위 15%', bronze: '상위 30%' },
    minGP: 3,
    compute: (p, pct) => tier(pct('stlTotal')),
  },
  {
    id: 'D7', name: '리바운드 머신', nameEn: 'Rebound Machine',
    category: 'defensive', icon: '⛓️',
    description: '공수 양면에서 리바운드를 지배하는 보드 장악 선수',
    tierDesc: { gold: '총 리바운드 상위 8%', silver: '상위 15%', bronze: '상위 30%' },
    minGP: 3,
    compute: (p, pct) => tier(pct('rpg')),
  },
  {
    id: 'D8', name: '허슬 플레이어', nameEn: 'Hustle Hero',
    category: 'defensive', icon: '🐝',
    description: '스틸·블록·공격리바를 모두 챙기는 허슬의 화신',
    tierDesc: { gold: '허슬 종합(STL+BLK+OREB) 상위 8%', silver: '상위 15%', bronze: '상위 30%' },
    minGP: 3,
    compute: (p, pct) => tier(pct('hustleComposite')),
  },
  // ══════════════════ 플레이메이킹 ══════════════════
  {
    id: 'P1', name: '플로어 제너럴', nameEn: 'Floor General',
    category: 'playmaking', icon: '🎩',
    description: '팀 공격의 사령탑으로 가장 많은 어시스트를 기록하는 선수',
    tierDesc: { gold: '어시스트 평균 상위 8%', silver: '상위 15%', bronze: '상위 30%' },
    minGP: 3,
    compute: (p, pct) => tier(pct('apg')),
  },
  {
    id: 'P2', name: '영리한 핸들러', nameEn: 'Smart Handler',
    category: 'playmaking', icon: '🧠',
    description: '어시스트는 많고 턴오버는 적은 영리한 볼 핸들러 (APG ≥ 1.5)',
    tierDesc: { gold: 'APG ≥ 1.5 + A/TO 비율 상위 8%', silver: '상위 15%', bronze: '상위 30%' },
    minGP: 3,
    compute: (p, pct) => p.apg >= 1.5 ? tier(pct('atoRatio')) : null,
  },
  {
    id: 'P3', name: '볼 안전 요원', nameEn: 'Ball Protector',
    category: 'playmaking', icon: '🛡️',
    description: '볼을 안전하게 운반하며 턴오버를 최소화하는 선수 (APG ≥ 1/G)',
    tierDesc: { gold: 'APG ≥ 1 + 턴오버 최소 상위 8%', silver: '상위 15%', bronze: '상위 30%' },
    minGP: 3,
    compute: (p, pct) => p.apg >= 1 ? tier(pct('topg', true)) : null,
  },
  {
    id: 'P4', name: '듀얼 위협', nameEn: 'Dual Threat',
    category: 'playmaking', icon: '🤝',
    description: '득점과 어시스트 두 가지 모두 상위권인 양면 위협 선수',
    tierDesc: { gold: 'PPG & APG 모두 상위 8%', silver: '모두 상위 15%', bronze: '모두 상위 30%' },
    minGP: 3,
    compute: (p, pct) => tierBoth(pct('ppg'), pct('apg')),
  },
  {
    id: 'P5', name: '트리플 위협', nameEn: 'Triple Threat',
    category: 'playmaking', icon: '📊',
    description: '득점·리바운드·어시스트 세 가지 모두 균형잡힌 만능 선수',
    tierDesc: { gold: 'PPG·RPG·APG 모두 상위 8%', silver: '모두 상위 15%', bronze: '모두 상위 30%' },
    minGP: 3,
    compute: (p, pct) => tierAll([pct('ppg'), pct('rpg'), pct('apg')]),
  },
  {
    id: 'P6', name: '클러치 핸들러', nameEn: 'Clutch Handler',
    category: 'playmaking', icon: '🪄',
    description: '어시스트 상위권 + 높은 A/TO 비율의 믿음직한 볼 핸들러',
    tierDesc: { gold: 'APG 상위 8% + A/TO ≥ 2.0', silver: 'APG 상위 15% + A/TO ≥ 1.5', bronze: 'APG 상위 30% + A/TO ≥ 1.2' },
    minGP: 3,
    compute: (p, pct) => {
      const a = pct('apg')
      if (a < 70) return null
      if (a >= 92 && p.atoRatio >= 2.0) return 'gold'
      if (a >= 85 && p.atoRatio >= 1.5) return 'silver'
      if (a >= 70 && p.atoRatio >= 1.2) return 'bronze'
      return null
    },
  },
  {
    id: 'P7', name: '만능 스탯', nameEn: 'Stat Stuffer',
    category: 'playmaking', icon: '🌟',
    description: 'PPG·RPG·APG·SPG·BPG 중 4개 이상이 상위권인 완성형 선수',
    tierDesc: { gold: '5개 스탯 중 4개 이상 상위 8%', silver: '4개 이상 상위 15%', bronze: '4개 이상 상위 30%' },
    minGP: 3,
    compute: (p, pct) => {
      const pcts = [pct('ppg'), pct('rpg'), pct('apg'), pct('spg'), pct('bpg')]
      if (pcts.filter(x => x >= 92).length >= 4) return 'gold'
      if (pcts.filter(x => x >= 85).length >= 4) return 'silver'
      if (pcts.filter(x => x >= 70).length >= 4) return 'bronze'
      return null
    },
  },
]

// 도감 표시용 (compute 제외한 전체 배지 정보)
export const ALL_BADGE_DEFS: BadgeDisplayInfo[] = BADGE_DEFS.map(
  ({ id, name, nameEn, category, icon, description, tierDesc, minGP }) =>
    ({ id, name, nameEn, category, icon, description, tierDesc, minGP })
)

// 핵심 함수: 선수 배지 목록 계산
export function computeBadges(
  playerMetrics: PlayerMetrics,
  allPlayerMetrics: PlayerMetrics[],
): BadgeResult[] {
  const qualified = allPlayerMetrics.filter(p => p.gp >= 5)
  if (qualified.length === 0) return []

  const keys: (keyof PlayerMetrics)[] = [
    'gp', 'ppg', 'rpg', 'apg', 'spg', 'bpg', 'topg',
    'drebPerG', 'orebPerG', 'pfPerG',
    'fg3_pct', 'fg3aPerG', 'efg_pct', 'fgaPerG', 'ft_pct', 'ftaPerG',
    'atoRatio', 'defComposite', 'hustleComposite', 'stlTotal',
    'midPerG', 'slashPerG', 'postPerG', 'andOnePerG',
  ]
  const metricValues: Partial<Record<keyof PlayerMetrics, number[]>> = {}
  for (const k of keys) {
    metricValues[k] = qualified.map(p => p[k] as number)
  }

  function getPct(metric: keyof PlayerMetrics, lowerBetter = false): number {
    const val = playerMetrics[metric] as number
    const all = metricValues[metric] ?? []
    return pctRank(val, all, lowerBetter)
  }

  const earned: BadgeResult[] = []
  for (const def of BADGE_DEFS) {
    if (playerMetrics.gp < def.minGP) continue
    const t = def.compute(playerMetrics, getPct)
    if (t) earned.push({
      id: def.id, name: def.name, nameEn: def.nameEn,
      category: def.category, icon: def.icon, description: def.description, tier: t,
    })
  }

  const catOrder = { offensive: 0, defensive: 1, playmaking: 2 }
  const tierOrder = { gold: 0, silver: 1, bronze: 2 }
  return earned.sort((a, b) =>
    catOrder[a.category] - catOrder[b.category] ||
    tierOrder[a.tier] - tierOrder[b.tier]
  )
}
