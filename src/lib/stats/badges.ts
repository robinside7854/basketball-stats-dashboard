// === 카테고리 (4종) ===
export type BadgeCategory = 'attack' | 'shooting' | 'defense' | 'playmaking'

export const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  attack:     '공격',
  shooting:   '슈팅',
  defense:    '수비',
  playmaking: '플레이메이킹',
}

export const CATEGORY_COLORS: Record<BadgeCategory, { header: string; badge: string }> = {
  attack:     { header: 'text-orange-400', badge: 'bg-orange-950/60 text-orange-300 border-orange-700/60' },
  shooting:   { header: 'text-blue-400',   badge: 'bg-blue-950/60   text-blue-300   border-blue-700/60'   },
  defense:    { header: 'text-green-400',  badge: 'bg-green-950/60  text-green-300  border-green-700/60'  },
  playmaking: { header: 'text-purple-400', badge: 'bg-purple-950/60 text-purple-300 border-purple-700/60' },
}

// === 타입 ===
export type BadgeTier = 'gold' | 'silver' | 'bronze' | null

export interface BadgeTheme { bg: string; text: string; border: string; dot: string }

export interface BadgeDefinition {
  code: string
  name: string
  icon: string
  description: string
  criteria: string
  tierCriteria: { bronze: string; silver: string; gold: string }
  category: BadgeCategory
  theme: BadgeTheme
  minGames: number
  unit: string
}

export interface EvaluatedBadge extends BadgeDefinition {
  tier: BadgeTier
  earned: boolean        // tier !== null  (keep for backward compat)
  achievedValue: number
  threshold: number      // bronze 기준값
  achievedLabel: string
  thresholdLabel: string
}

export type EarnedBadge = EvaluatedBadge

// === 테마 ===
const T: Record<string, BadgeTheme> = {
  orange:  { bg: 'bg-orange-950/60',  text: 'text-orange-300',  border: 'border-orange-700/60',  dot: 'bg-orange-500'  },
  amber:   { bg: 'bg-amber-950/60',   text: 'text-amber-300',   border: 'border-amber-700/60',   dot: 'bg-amber-500'   },
  blue:    { bg: 'bg-blue-950/60',    text: 'text-blue-300',    border: 'border-blue-700/60',    dot: 'bg-blue-500'    },
  sky:     { bg: 'bg-sky-950/60',     text: 'text-sky-300',     border: 'border-sky-700/60',     dot: 'bg-sky-500'     },
  cyan:    { bg: 'bg-cyan-950/60',    text: 'text-cyan-300',    border: 'border-cyan-700/60',    dot: 'bg-cyan-500'    },
  teal:    { bg: 'bg-teal-950/60',    text: 'text-teal-300',    border: 'border-teal-700/60',    dot: 'bg-teal-500'    },
  green:   { bg: 'bg-green-950/60',   text: 'text-green-300',   border: 'border-green-700/60',   dot: 'bg-green-500'   },
  emerald: { bg: 'bg-emerald-950/60', text: 'text-emerald-300', border: 'border-emerald-700/60', dot: 'bg-emerald-500' },
  indigo:  { bg: 'bg-indigo-950/60',  text: 'text-indigo-300',  border: 'border-indigo-700/60',  dot: 'bg-indigo-500'  },
  purple:  { bg: 'bg-purple-950/60',  text: 'text-purple-300',  border: 'border-purple-700/60',  dot: 'bg-purple-500'  },
  violet:  { bg: 'bg-violet-950/60',  text: 'text-violet-300',  border: 'border-violet-700/60',  dot: 'bg-violet-500'  },
}

// === 뱃지 정의 19개 ===
export const BADGE_DEFINITIONS: BadgeDefinition[] = [

  // -- 공격 (5) --
  {
    code: 'PAINT_BUSTER', name: '골밑파괴자', icon: '\u2694\ufe0f', category: 'attack', theme: T.orange, minGames: 3, unit: '%',
    description: '골밑슛으로 골밑을 지배하는 인사이드 킬러',
    criteria: '골밑슛 시도 비중 \u226540% & 성공률 \u226540% (최소 10회 시도)',
    tierCriteria: { bronze: '비중≥40% & 성공률≥40%', silver: '비중≥40% & 성공률≥45%', gold: '비중≥40% & 성공률≥50%' },
  },
  {
    code: 'GLASS_EATER', name: '로드맨', icon: '\u{1F4AA}', category: 'attack', theme: T.amber, minGames: 3, unit: '%',
    description: 'Dennis Rodman 계보의 공격 리바운드 기계',
    criteria: '공격 리바운드 / 전체 리바운드 \u226529.9% (최소 15개)',
    tierCriteria: { bronze: 'OREB/REB ≥29.9%', silver: 'OREB/REB ≥40%', gold: 'OREB/REB ≥50%' },
  },
  {
    code: 'FINISHER', name: '피니셔', icon: '\u{1F3C3}', category: 'attack', theme: T.orange, minGames: 3, unit: '%',
    description: '빠른 발과 감각으로 레이업을 완성하는 마무리 전문가',
    criteria: '레이업 시도 비중 \u226535% & 성공률 \u226540% (최소 10회 시도)',
    tierCriteria: { bronze: '비중≥35% & 성공률≥40%', silver: '비중≥35% & 성공률≥50%', gold: '비중≥35% & 성공률≥60%' },
  },
  {
    code: 'CLUTCH_Q4', name: 'Mr. Clutch', icon: '\u23f0', category: 'attack', theme: T.amber, minGames: 3, unit: 'pts',
    description: '4쿼터에서 더욱 강해지는 클러치 플레이어',
    criteria: '4쿼터 평균 득점이 1~3쿼터 평균보다 모두 높은 선수 (최소 3경기)',
    tierCriteria: { bronze: 'Q4 평균 > 1~3Q 최고치', silver: 'Q4 차이 ≥1.5pts', gold: 'Q4 차이 ≥3.0pts' },
  },
  {
    code: 'SCORING_MACHINE', name: '득점 화신', icon: '\u{1F525}', category: 'attack', theme: T.orange, minGames: 3, unit: 'PPG',
    description: '팀 평균 1.5배 이상을 혼자 책임지는 에이스 스코어러',
    criteria: 'PPG \u2265 팀 평균 \xd7 1.5배 (최소 3경기)',
    tierCriteria: { bronze: 'PPG ≥ 팀평균 ×1.5배', silver: 'PPG ≥ 팀평균 ×1.8배', gold: 'PPG ≥ 팀평균 ×2.2배' },
  },

  // -- 슈팅 (5) --
  {
    code: 'JUNG_DAEMAN', name: '발맞으면쏜다!', icon: '\u{1F3AF}', category: 'shooting', theme: T.blue, minGames: 3, unit: '%',
    description: '슛이 전부다. FGA의 40% 이상을 3점슛으로만 해결',
    criteria: '3점슛 시도 / 전체 FGA \u226540% (최소 10회 3점 시도)',
    tierCriteria: { bronze: '3PA/FGA ≥40%', silver: '3PA/FGA ≥50%', gold: '3PA/FGA ≥60%' },
  },
  {
    code: 'DONG_HO_CURRY', name: '동호회커리', icon: '\u{1F35B}', category: 'shooting', theme: T.sky, minGames: 3, unit: '%',
    description: '3점슛 성공률 33% 이상의 준수한 외곽 슈터',
    criteria: '3점슛 성공률 \u266530% (최소 15회 시도)',
    tierCriteria: { bronze: '3P% ≥30%', silver: '3P% ≥35%', gold: '3P% ≥38%' },
  },
  {
    code: 'ICE_VEINS', name: '강심장', icon: '\u{1F9CA}', category: 'shooting', theme: T.cyan, minGames: 3, unit: '%',
    description: '긴장된 순간에도 자유투를 확실히 꽂아넣는 철의 멘탈',
    criteria: 'FT% \u266570% & FTA \u2265 팀 평균 (최소 15회 시도)',
    tierCriteria: { bronze: 'FT% ≥70%', silver: 'FT% ≥80%', gold: 'FT% ≥90%' },
  },
  {
    code: 'MID_MAESTRO', name: '미드레인지 장인', icon: '\u{1F4CD}', category: 'shooting', theme: T.sky, minGames: 3, unit: '%',
    description: '사라진 중거리를 부활시키는 정확한 미드레인지 슈터',
    criteria: '미드레인지 시도 비중 \u266533% & 성공률 \u266540% (최소 10회 시도)',
    tierCriteria: { bronze: '비중≥33% & 성공률≥40%', silver: '비중≥33% & 성공률≥45%', gold: '비중≥33% & 성공률≥50%' },
  },
  {
    code: 'EFFICIENCY_GOD', name: '극한의효율충', icon: '\u2728', category: 'shooting', theme: T.blue, minGames: 3, unit: '%',
    description: 'FG% 45% 이상의 압도적 효율로 팀을 이끄는 선수',
    criteria: 'FG% \u266545% (최소 FGA 20회)',
    tierCriteria: { bronze: 'FG% ≥45%', silver: 'FG% ≥50%', gold: 'FG% ≥55%' },
  },

  // -- 수비 (5) --
  {
    code: 'GLASS_CLEANER', name: '수비의 끝은 리바운드', icon: '\u{1FA9F}', category: 'defense', theme: T.teal, minGames: 3, unit: '%',
    description: '상대 2차 공격을 원천 봉쇄하는 수비 리바운드 전문가',
    criteria: '수비 리바운드 / 전체 리바운드 \u266560% (최소 15개)',
    tierCriteria: { bronze: 'DREB/REB ≥60%', silver: 'DREB/REB ≥70%', gold: 'DREB/REB ≥80%' },
  },
  {
    code: 'PICKPOCKET', name: '소매치기', icon: '\u{1F985}', category: 'defense', theme: T.green, minGames: 3, unit: 'SPG',
    description: '날카로운 눈과 빠른 손으로 볼을 낚아채는 스틸 전문가',
    criteria: 'SPG \u2265 팀 평균 \xd7 1.5배 (최소 3경기)',
    tierCriteria: { bronze: 'SPG ≥ 팀평균 ×1.5배', silver: 'SPG ≥ 팀평균 ×2.0배', gold: 'SPG ≥ 팀평균 ×2.5배' },
  },
  {
    code: 'SHOT_BLOCKER', name: '남동타워', icon: '\u{1F6E1}\ufe0f', category: 'defense', theme: T.emerald, minGames: 3, unit: 'BPG',
    description: '골밑을 지키는 수호자. 상대의 슛을 걷어내는 블로킹 전문가',
    criteria: 'BPG \u2265 팀 평균 \xd7 1.5배 (최소 3경기)',
    tierCriteria: { bronze: 'BPG ≥ 팀평균 ×1.5배', silver: 'BPG ≥ 팀평균 ×2.0배', gold: 'BPG ≥ 팀평균 ×2.5배' },
  },
  {
    code: 'HUSTLE_KING', name: '허슬킹', icon: '\u26a1', category: 'defense', theme: T.green, minGames: 3, unit: '/G',
    description: '스틸+블록+수비리바운드 합산이 팀 평균의 1.3배 이상',
    criteria: '(STL+BLK+DREB)/경기 \u2265 팀 평균 \xd7 1.3배 (최소 3경기)',
    tierCriteria: { bronze: '허슬/G ≥ 팀평균 ×1.3배', silver: '허슬/G ≥ 팀평균 ×1.6배', gold: '허슬/G ≥ 팀평균 ×2.0배' },
  },

  // -- 플레이메이킹 (5) --
  {
    code: 'CLEAN_HANDS', name: '안전운반', icon: '\u{1F91D}', category: 'playmaking', theme: T.purple, minGames: 3, unit: 'AST/TOV',
    description: '볼을 잃지 않는 안정적인 볼 핸들러. AST/TOV 2.0 이상',
    criteria: 'AST/TOV \u22651.8 (최소 어시스트 10개)',
    tierCriteria: { bronze: 'AST/TOV ≥1.8', silver: 'AST/TOV ≥2.3', gold: 'AST/TOV ≥2.8' },
  },
  {
    code: 'KICKOUT', name: '킥아웃 전도사', icon: '\u{1F3A6}', category: 'playmaking', theme: T.violet, minGames: 3, unit: '%',
    description: '어시스트의 50% 이상이 3점슛으로 이어지는 외곽 연결 플레이메이커',
    criteria: '3점 연결 어시스트 / 전체 어시스트 \u266550% (최소 어시스트 10개)',
    tierCriteria: { bronze: '3점 연결AST ≥50%', silver: '3점 연결AST ≥60%', gold: '3점 연결AST ≥70%' },
  },
  {
    code: 'FLOOR_GENERAL', name: '마에스트로', icon: '\u{1F451}', category: 'playmaking', theme: T.indigo, minGames: 3, unit: 'APG',
    description: '경기 전체를 조율하는 사령탑. APG가 팀 평균의 1.5배 이상',
    criteria: 'APG \u2265 팀 평균 \xd7 1.5배 (최소 어시스트 10개)',
    tierCriteria: { bronze: 'APG ≥ 팀평균 ×1.5배', silver: 'APG ≥ 팀평균 ×2.0배', gold: 'APG ≥ 팀평균 ×2.5배' },
  },
  {
    code: 'POCKET_PASSER', name: '포켓패서', icon: '\u{1F3AF}', category: 'playmaking', theme: T.purple, minGames: 3, unit: '%',
    description: '어시스트의 50% 이상이 골밑슛·레이업으로 연결되는 내부 침투 플레이메이커',
    criteria: '골밑·레이업 연결 어시스트 / 전체 어시스트 \u266550% (최소 어시스트 10개)',
    tierCriteria: { bronze: '골밑 연결AST ≥50%', silver: '골밑 연결AST ≥60%', gold: '골밑 연결AST ≥70%' },
  },
  {
    code: 'ALL_ROUNDER', name: '올라운더', icon: '\u{1F527}', category: 'playmaking', theme: T.violet, minGames: 3, unit: '항목',
    description: '득점·리바운드·어시스트 모두 팀 평균 이상을 기록하는 만능 선수',
    criteria: 'PPG & RPG & APG 모두 팀 평균 이상 (최소 3경기)',
    tierCriteria: { bronze: 'PTS·REB·AST 모두 팀평균 ×1.0배', silver: '모두 팀평균 ×1.2배', gold: '모두 팀평균 ×1.5배' },
  },
]

// === 입력 타입 ===
export interface PlayerCareerInput {
  gamesPlayed: number
  totalTeamGames: number
  pts: number
  fgm: number; fga: number
  fg2m: number; fg2a: number
  fg3m: number; fg3a: number
  ftm: number; fta: number
  oreb: number; dreb: number; reb: number
  ast: number; stl: number; blk: number; tov: number
  ppg: number; rpg: number; apg: number; spg: number; bpg: number
  fg3Pct: number; ftPct: number
  astToTov: number
  doubleDoubles: number; tripleDoubles: number
  q1pts: number; q2pts: number; q3pts: number; q4pts: number
  ast3pts?: number
  astPaint?: number
  shotBreakdown?: Record<string, { attempted: number; made: number; pct: number }>
}

export interface TeamAverages {
  ftaPerGame: number
  fg3aPerGame: number
  stlPerGame: number
  blkPerGame: number
  astPerGame: number
  ptsPerGame: number
  rebPerGame: number
  hustlePerGame: number
}

// === 평가 함수 (전체 19개 반환) ===
export function evaluateAllBadges(s: PlayerCareerInput, team: TeamAverages): EvaluatedBadge[] {
  const gp = s.gamesPlayed
  const sb = s.shotBreakdown ?? {}
  const trackedFGA = Object.values(sb).reduce((sum, v) => sum + v.attempted, 0)
  const shotSharePct = (key: string) => trackedFGA > 0 ? (sb[key]?.attempted ?? 0) / trackedFGA * 100 : 0
  const shotSuccPct  = (key: string) => {
    const a = sb[key]?.attempted ?? 0
    return a > 0 ? (sb[key]?.made ?? 0) / a * 100 : 0
  }
  const r = (v: number, d = 1) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d)

  function make(
    code: string, tier: BadgeTier,
    av: number, th: number,
    avLabel: string, thLabel: string,
  ): EvaluatedBadge {
    const def = BADGE_DEFINITIONS.find(b => b.code === code)!
    return { ...def, tier, earned: tier !== null, achievedValue: av, threshold: th, achievedLabel: avLabel, thresholdLabel: thLabel }
  }

  // 단순 단일 지표 티어 계산
  function t1(minCond: boolean, value: number, b: number, sv: number, g: number): BadgeTier {
    if (gp < 3 || !minCond) return null
    if (value >= g) return 'gold'
    if (value >= sv) return 'silver'
    if (value >= b) return 'bronze'
    return null
  }

  // 복합 조건 (두 지표 모두 충족)
  function t2(minCond: boolean, v1: number, v2: number,
    bg: [number,number], sg: [number,number], gg: [number,number]): BadgeTier {
    if (gp < 3 || !minCond) return null
    if (v1 >= gg[0] && v2 >= gg[1]) return 'gold'
    if (v1 >= sg[0] && v2 >= sg[1]) return 'silver'
    if (v1 >= bg[0] && v2 >= bg[1]) return 'bronze'
    return null
  }

  const results: EvaluatedBadge[] = []

  // ---- 공격 ----
  const postPct = shotSharePct('shot_post')
  const postSP  = shotSuccPct('shot_post')
  const postA   = sb['shot_post']?.attempted ?? 0
  results.push(make('PAINT_BUSTER',
    t2(postA >= 10, postPct, postSP, [40,40], [40,45], [40,50]),
    r(postPct), 40,
    `포스트슛 비중 ${r(postPct)}% (성공률 ${r(postSP,0)}%)`,
    '기준: 비중≥40%, 성공률≥40%, 최소10회'))

  const orebPct = s.reb > 0 ? s.oreb / s.reb * 100 : 0
  results.push(make('GLASS_EATER',
    t1(s.reb >= 15, orebPct, 29.9, 40, 50),
    r(orebPct), 29.9,
    `공격리바 비중 ${r(orebPct)}% (${s.oreb}/${s.reb})`,
    '기준: OREB/REB≥29.9%, 최소15개'))

  const layupPct = shotSharePct('shot_layup')
  const layupSP  = shotSuccPct('shot_layup')
  const layupA   = sb['shot_layup']?.attempted ?? 0
  results.push(make('FINISHER',
    t2(layupA >= 10, layupPct, layupSP, [35,40], [35,50], [35,60]),
    r(layupPct), 35,
    `레이업 비중 ${r(layupPct)}% (성공률 ${r(layupSP,0)}%)`,
    '기준: 비중≥35%, 성공률≥40%, 최소10회'))

  const q1avg = gp > 0 ? s.q1pts / gp : 0
  const q2avg = gp > 0 ? s.q2pts / gp : 0
  const q3avg = gp > 0 ? s.q3pts / gp : 0
  const q4avg = gp > 0 ? s.q4pts / gp : 0
  const q4margin = q4avg - Math.max(q1avg, q2avg, q3avg)
  const clutchTier: BadgeTier = (() => {
    if (gp < 3 || q4avg <= 0 || q4margin <= 0) return null
    if (q4margin >= 3.0) return 'gold'
    if (q4margin >= 1.5) return 'silver'
    return 'bronze'
  })()
  results.push(make('CLUTCH_Q4', clutchTier,
    r(q4avg), Math.max(r(q1avg), r(q2avg), r(q3avg)),
    `Q1:${r(q1avg)} Q2:${r(q2avg)} Q3:${r(q3avg)} Q4:${r(q4avg)} pts/G`,
    '기준: 4Q평균득점이 1~3Q 평균보다 모두 높을 것'))

  const smRatio = team.ptsPerGame > 0 ? s.ppg / team.ptsPerGame : 0
  results.push(make('SCORING_MACHINE',
    t1(team.ptsPerGame > 0, smRatio, 1.5, 1.8, 2.2),
    r(s.ppg), r(team.ptsPerGame * 1.5),
    `PPG ${r(s.ppg)} (팀 평균 ${r(team.ptsPerGame)})`,
    `기준: PPG≥${r(team.ptsPerGame*1.5)} (팀평균×1.5배)`))

  // ---- 슈팅 ----
  const threeShare = s.fga > 0 ? s.fg3a / s.fga * 100 : 0
  results.push(make('JUNG_DAEMAN',
    t1(s.fg3a >= 10, threeShare, 40, 50, 60),
    r(threeShare), 40,
    `3점슛 비중 ${r(threeShare)}% (${s.fg3a}/${s.fga})`,
    '기준: 3PA/FGA≥40%, 최소10회'))

  results.push(make('DONG_HO_CURRY',
    t1(s.fg3a >= 15, s.fg3Pct, 30, 35, 38),
    r(s.fg3Pct), 30,
    `3점슛 성공률 ${r(s.fg3Pct)}% (${s.fg3m}/${s.fg3a})`,
    '기준: 3P%≥30%, 최소15회'))

  const ftaPerGame = gp > 0 ? s.fta / gp : 0
  results.push(make('ICE_VEINS',
    t1(s.fta >= 15 && ftaPerGame >= team.ftaPerGame, s.ftPct, 70, 80, 90),
    r(s.ftPct), 70,
    `FT ${s.ftm}/${s.fta} = ${r(s.ftPct)}%`,
    '기준: FT%≥70%, FTA≥팀평균'))

  const midPct = shotSharePct('shot_2p_mid')
  const midSP  = shotSuccPct('shot_2p_mid')
  const midA   = sb['shot_2p_mid']?.attempted ?? 0
  results.push(make('MID_MAESTRO',
    t2(midA >= 10, midPct, midSP, [33,40], [33,45], [33,50]),
    r(midPct), 33,
    `미드레인지 비중 ${r(midPct)}% (성공률 ${r(midSP,0)}%)`,
    '기준: 비중≥33%, 성공률≥40%, 최소10회'))

  const fgPct = s.fga > 0 ? s.fgm / s.fga * 100 : 0
  results.push(make('EFFICIENCY_GOD',
    t1(s.fga >= 20, fgPct, 45, 50, 55),
    r(fgPct), 45,
    `FG% ${r(fgPct)}% (${s.fgm}/${s.fga})`,
    '기준: FG%≥45%, 최소FGA20회'))

  // ---- 수비 ----
  const drebPct = s.reb > 0 ? s.dreb / s.reb * 100 : 0
  results.push(make('GLASS_CLEANER',
    t1(s.reb >= 15, drebPct, 60, 70, 80),
    r(drebPct), 60,
    `수비리바 비중 ${r(drebPct)}% (${s.dreb}/${s.reb})`,
    '기준: DREB/REB≥60%, 최소15개'))

  const ppRatioVal = team.stlPerGame > 0 ? s.spg / team.stlPerGame : 0
  results.push(make('PICKPOCKET',
    t1(team.stlPerGame > 0, ppRatioVal, 1.5, 2.0, 2.5),
    r(s.spg), r(team.stlPerGame * 1.5),
    `SPG ${r(s.spg)} (팀 평균 ${r(team.stlPerGame)})`,
    `기준: SPG≥${r(team.stlPerGame*1.5)} (팀평균×1.5배)`))

  const sbRatioVal = team.blkPerGame > 0 ? s.bpg / team.blkPerGame : 0
  results.push(make('SHOT_BLOCKER',
    t1(team.blkPerGame > 0, sbRatioVal, 1.5, 2.0, 2.5),
    r(s.bpg), r(team.blkPerGame * 1.5),
    `BPG ${r(s.bpg)} (팀 평균 ${r(team.blkPerGame)})`,
    `기준: BPG≥${r(team.blkPerGame*1.5)} (팀평균×1.5배)`))

  const hustlePerGame = gp > 0 ? (s.stl + s.blk + s.dreb) / gp : 0
  const hustleRatio = team.hustlePerGame > 0 ? hustlePerGame / team.hustlePerGame : 0
  results.push(make('HUSTLE_KING',
    t1(team.hustlePerGame > 0, hustleRatio, 1.3, 1.6, 2.0),
    r(hustlePerGame), r(team.hustlePerGame * 1.3),
    `허슬 ${r(hustlePerGame)}/G (팀 평균 ${r(team.hustlePerGame)})`,
    `기준: (STL+BLK+DREB)/G≥${r(team.hustlePerGame*1.3)} (팀평균×1.3배)`))

  // ---- 플레이메이킹 ----
  results.push(make('CLEAN_HANDS',
    t1(s.ast >= 10, s.astToTov, 1.8, 2.3, 2.8),
    r(s.astToTov), 1.8,
    `AST/TOV ${r(s.astToTov)} (A${s.ast} T${s.tov})`,
    '기준: AST/TOV≥1.8, 최소AST10'))

  const ast3r = s.ast > 0 && (s.ast3pts ?? 0) > 0 ? (s.ast3pts ?? 0) / s.ast * 100 : 0
  results.push(make('KICKOUT',
    t1(s.ast >= 10, ast3r, 50, 60, 70),
    r(ast3r), 50,
    `3점 어시스트 ${s.ast3pts ?? 0}/${s.ast} = ${r(ast3r)}%`,
    '기준: 3점연결AST≥50%, 최소AST10'))

  const fgRatio = team.astPerGame > 0 ? s.apg / team.astPerGame : 0
  results.push(make('FLOOR_GENERAL',
    t1(s.ast >= 10 && team.astPerGame > 0, fgRatio, 1.5, 2.0, 2.5),
    r(s.apg), r(team.astPerGame * 1.5),
    `APG ${r(s.apg)} (팀 평균 ${r(team.astPerGame)})`,
    `기준: APG≥${r(team.astPerGame*1.5)} (팀평균×1.5배), 최소AST10`))

  const astPaint = s.astPaint ?? 0
  const ppRatio = s.ast > 0 ? astPaint / s.ast * 100 : 0
  results.push(make('POCKET_PASSER',
    t1(s.ast >= 10, ppRatio, 50, 60, 70),
    r(ppRatio), 50,
    `골밑·레이업 연결 어시스트 ${astPaint}/${s.ast} = ${r(ppRatio)}%`,
    '기준: 골밑·레이업AST≥50%, 최소AST10'))

  const arTier: BadgeTier = (() => {
    if (gp < 3 || team.ptsPerGame <= 0 || team.rebPerGame <= 0 || team.astPerGame <= 0) return null
    const m = [s.ppg / team.ptsPerGame, s.rpg / team.rebPerGame, s.apg / team.astPerGame]
    if (m.every(v => v >= 1.5)) return 'gold'
    if (m.every(v => v >= 1.2)) return 'silver'
    if (m.every(v => v >= 1.0)) return 'bronze'
    return null
  })()
  const arPts = team.ptsPerGame > 0 && s.ppg >= team.ptsPerGame
  const arReb = team.rebPerGame > 0 && s.rpg >= team.rebPerGame
  const arAst = team.astPerGame > 0 && s.apg >= team.astPerGame
  results.push(make('ALL_ROUNDER', arTier,
    [arPts, arReb, arAst].filter(Boolean).length, 3,
    `PTS${arPts?'✅':'❌'} REB${arReb?'✅':'❌'} AST${arAst?'✅':'❌'}`,
    `기준: PPG≥${r(team.ptsPerGame)} & RPG≥${r(team.rebPerGame)} & APG≥${r(team.astPerGame)}`))

  return results
}

export function calculateBadges(s: PlayerCareerInput, team: TeamAverages): EarnedBadge[] {
  return evaluateAllBadges(s, team).filter(b => b.tier !== null)
}
