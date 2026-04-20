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
export interface BadgeTheme { bg: string; text: string; border: string; dot: string }

export interface BadgeDefinition {
  code: string
  name: string
  icon: string
  description: string
  criteria: string
  category: BadgeCategory
  theme: BadgeTheme
  minGames: number
  unit: string
}

export interface EvaluatedBadge extends BadgeDefinition {
  achievedValue: number
  threshold: number
  achievedLabel: string
  thresholdLabel: string
  earned: boolean
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

// === 뱃지 정의 20개 ===
export const BADGE_DEFINITIONS: BadgeDefinition[] = [

  // -- 공격 (5) --
  {
    code: 'PAINT_BUSTER', name: '골밑파괴자', icon: '\u2694\ufe0f', category: 'attack', theme: T.orange, minGames: 3, unit: '%',
    description: '골밑슛으로 골밑을 지배하는 인사이드 킬러',
    criteria: '골밑슛 시도 비중 \u226535% & 성공률 \u226540% (최소 10회 시도)',
  },
  {
    code: 'GLASS_EATER', name: '로드맨', icon: '\u{1F4AA}', category: 'attack', theme: T.amber, minGames: 3, unit: '%',
    description: 'Dennis Rodman 계보의 공격 리바운드 기계',
    criteria: '공격 리바운드 / 전체 리바운드 \u226535% (최소 15개)',
  },
  {
    code: 'FINISHER', name: '피니셔', icon: '\u{1F3C3}', category: 'attack', theme: T.orange, minGames: 3, unit: '%',
    description: '빠른 발과 감각으로 레이업을 완성하는 마무리 전문가',
    criteria: '레이업 시도 비중 \u226525% & 성공률 \u226540% (최소 10회 시도)',
  },
  {
    code: 'CLUTCH_Q4', name: '4쿼터의 사나이', icon: '\u23f0', category: 'attack', theme: T.amber, minGames: 3, unit: 'pts',
    description: '4쿼터에서 더욱 강해지는 클러치 플레이어',
    criteria: '4쿼터 평균 득점이 1~3쿼터 평균보다 모두 높은 선수 (최소 3경기)',
  },
  {
    code: 'SCORING_MACHINE', name: '득점 화신', icon: '\u{1F525}', category: 'attack', theme: T.orange, minGames: 3, unit: 'PPG',
    description: '팀 평균 1.5배 이상을 혼자 책임지는 에이스 스코어러',
    criteria: 'PPG \u2265 팀 평균 \xd7 1.5배 (최소 3경기)',
  },

  // -- 슈팅 (5) --
  {
    code: 'JUNG_DAEMAN', name: '정대만', icon: '\u{1F3AF}', category: 'shooting', theme: T.blue, minGames: 3, unit: '%',
    description: '슛이 전부다. FGA의 50% 이상을 3점슛으로만 해결',
    criteria: '3점슛 시도 / 전체 FGA \u226550% (최소 15회 3점 시도)',
  },
  {
    code: 'DONG_HO_CURRY', name: '동호회커리', icon: '\u{1F35B}', category: 'shooting', theme: T.sky, minGames: 3, unit: '%',
    description: '3점슛 성공률 33% 이상의 준수한 외곽 슈터',
    criteria: '3점슛 성공률 \u226533% (최소 15회 시도)',
  },
  {
    code: 'ICE_VEINS', name: '강심장', icon: '\u{1F9CA}', category: 'shooting', theme: T.cyan, minGames: 3, unit: '%',
    description: '긴장된 순간에도 자유투를 확실히 꽂아넣는 철의 멘탈',
    criteria: 'FT% \u226570% & FTA \u2265 팀 평균 (최소 15회 시도)',
  },
  {
    code: 'MID_MAESTRO', name: '미드레인지 장인', icon: '\u{1F4CD}', category: 'shooting', theme: T.sky, minGames: 3, unit: '%',
    description: '사라진 중거리를 부활시키는 정확한 미드레인지 슈터',
    criteria: '미드레인지 시도 비중 \u226530% & 성공률 \u226540% (최소 10회 시도)',
  },
  {
    code: 'EFFICIENCY_GOD', name: '효율의 신', icon: '\u2728', category: 'shooting', theme: T.blue, minGames: 3, unit: '%',
    description: 'FG% 50% 이상의 압도적 효율로 팀을 이끄는 선수',
    criteria: 'FG% \u266550% (최소 FGA 20회)',
  },

  // -- 수비 (5) --
  {
    code: 'GLASS_CLEANER', name: '유리청소부', icon: '\u{1FA9F}', category: 'defense', theme: T.teal, minGames: 3, unit: '%',
    description: '상대 2차 공격을 원천 봉쇄하는 수비 리바운드 전문가',
    criteria: '수비 리바운드 / 전체 리바운드 \u266560% (최소 15개)',
  },
  {
    code: 'PICKPOCKET', name: '대도', icon: '\u{1F985}', category: 'defense', theme: T.green, minGames: 3, unit: 'SPG',
    description: '날카로운 눈과 빠른 손으로 볼을 낚아채는 스틸 전문가',
    criteria: 'SPG \u2265 팀 평균 \xd7 2배 (최소 3경기)',
  },
  {
    code: 'SHOT_BLOCKER', name: '골밑 수문장', icon: '\u{1F6E1}\ufe0f', category: 'defense', theme: T.emerald, minGames: 3, unit: 'BPG',
    description: '골밑을 지키는 수호자. 상대의 슛을 걷어내는 블로킹 전문가',
    criteria: 'BPG \u2265 팀 평균 \xd7 2배 (최소 3경기)',
  },
  {
    code: 'HUSTLE_KING', name: '허슬킹', icon: '\u26a1', category: 'defense', theme: T.green, minGames: 3, unit: '/G',
    description: '스틸+블록+수비리바운드 합산이 팀 평균의 1.3배 이상',
    criteria: '(STL+BLK+DREB)/경기 \u2265 팀 평균 \xd7 1.3배 (최소 3경기)',
  },

  // -- 플레이메이킹 (5) --
  {
    code: 'CLEAN_HANDS', name: '안전운반', icon: '\u{1F91D}', category: 'playmaking', theme: T.purple, minGames: 3, unit: 'AST/TOV',
    description: '볼을 잃지 않는 안정적인 볼 핸들러. AST/TOV 2.0 이상',
    criteria: 'AST/TOV \u22652.0 (최소 어시스트 10개)',
  },
  {
    code: 'KICKOUT', name: '킥아웃 전도사', icon: '\u{1F3A6}', category: 'playmaking', theme: T.violet, minGames: 3, unit: '%',
    description: '어시스트의 40% 이상이 3점슛으로 이어지는 외곽 연결 플레이메이커',
    criteria: '3점 연결 어시스트 / 전체 어시스트 \u266540% (최소 어시스트 10개)',
  },
  {
    code: 'FLOOR_GENERAL', name: '지휘자', icon: '\u{1F451}', category: 'playmaking', theme: T.indigo, minGames: 3, unit: 'APG',
    description: '경기 전체를 조율하는 사령탑. APG가 팀 평균의 1.5배 이상',
    criteria: 'APG \u2265 팀 평균 \xd7 1.5배 (최소 어시스트 10개)',
  },
  {
    code: 'POCKET_PASSER', name: '포켓패서', icon: '\u{1F3AF}', category: 'playmaking', theme: T.purple, minGames: 3, unit: '%',
    description: '어시스트의 40% 이상이 골밑슛·레이업으로 연결되는 내부 침투 플레이메이커',
    criteria: '골밑·레이업 연결 어시스트 / 전체 어시스트 \u266540% (최소 어시스트 10개)',
  },
  {
    code: 'ALL_ROUNDER', name: '올라운더', icon: '\u{1F527}', category: 'playmaking', theme: T.violet, minGames: 3, unit: '항목',
    description: '득점·리바운드·어시스트 모두 팀 평균 이상을 기록하는 만능 선수',
    criteria: 'PPG & RPG & APG 모두 팀 평균 이상 (최소 3경기)',
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

// === 평가 함수 (전체 20개 반환) ===
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
    code: string, earned: boolean,
    av: number, th: number,
    avLabel: string, thLabel: string,
  ): EvaluatedBadge {
    const def = BADGE_DEFINITIONS.find(b => b.code === code)!
    return { ...def, earned, achievedValue: av, threshold: th, achievedLabel: avLabel, thresholdLabel: thLabel }
  }

  const ok = (cond: boolean) => gp >= 3 && cond
  const results: EvaluatedBadge[] = []

  // ---- 공격 ----
  const postPct = shotSharePct('shot_post')
  const postSP  = shotSuccPct('shot_post')
  const postA   = sb['shot_post']?.attempted ?? 0
  results.push(make('PAINT_BUSTER', ok(postA >= 10 && postPct >= 35 && postSP >= 40),
    r(postPct), 35,
    `포스트슛 비중 ${r(postPct)}% (성공률 ${r(postSP, 0)}%)`,
    '기준: 비중\u226535%, 성공률\u266540%, 최소10회'))

  const orebPct = s.reb > 0 ? s.oreb / s.reb * 100 : 0
  results.push(make('GLASS_EATER', ok(s.reb >= 15 && orebPct >= 35),
    r(orebPct), 35,
    `공격리바 비중 ${r(orebPct)}% (${s.oreb}/${s.reb})`,
    '기준: OREB/REB\u226535%, 최소15개'))

  const layupPct = shotSharePct('shot_layup')
  const layupSP  = shotSuccPct('shot_layup')
  const layupA   = sb['shot_layup']?.attempted ?? 0
  results.push(make('FINISHER', ok(layupA >= 10 && layupPct >= 25 && layupSP >= 40),
    r(layupPct), 25,
    `레이업 비중 ${r(layupPct)}% (성공률 ${r(layupSP, 0)}%)`,
    '기준: 비중\u226525%, 성공률\u266540%, 최소10회'))

  const q1avg = gp > 0 ? s.q1pts / gp : 0
  const q2avg = gp > 0 ? s.q2pts / gp : 0
  const q3avg = gp > 0 ? s.q3pts / gp : 0
  const q4avg = gp > 0 ? s.q4pts / gp : 0
  const isQ4Best = q4avg > 0 && q4avg > q1avg && q4avg > q2avg && q4avg > q3avg
  results.push(make('CLUTCH_Q4', ok(isQ4Best),
    r(q4avg), Math.max(r(q1avg), r(q2avg), r(q3avg)),
    `Q1:${r(q1avg)} Q2:${r(q2avg)} Q3:${r(q3avg)} Q4:${r(q4avg)} pts/G`,
    '기준: 4Q평균득점이 1~3Q 평균보다 모두 높을 것'))

  const smTh = r(team.ptsPerGame * 1.5)
  results.push(make('SCORING_MACHINE', ok(team.ptsPerGame > 0 && s.ppg >= team.ptsPerGame * 1.5),
    r(s.ppg), smTh,
    `PPG ${r(s.ppg)} (팀 평균 ${r(team.ptsPerGame)})`,
    `기준: PPG\u2265${smTh} (팀평균\xd71.5배)`))

  // ---- 슈팅 ----
  const threeShare = s.fga > 0 ? s.fg3a / s.fga * 100 : 0
  results.push(make('JUNG_DAEMAN', ok(s.fg3a >= 15 && threeShare >= 50),
    r(threeShare), 50,
    `3점슛 비중 ${r(threeShare)}% (${s.fg3a}/${s.fga})`,
    '기준: 3PA/FGA\u226550%, 최소15회'))

  results.push(make('DONG_HO_CURRY', ok(s.fg3a >= 15 && s.fg3Pct >= 33),
    r(s.fg3Pct), 33,
    `3점슛 성공률 ${r(s.fg3Pct)}% (${s.fg3m}/${s.fg3a})`,
    '기준: 3P%\u266533%, 최소15회'))

  const ftaPerGame = gp > 0 ? s.fta / gp : 0
  results.push(make('ICE_VEINS', ok(s.fta >= 15 && s.ftPct >= 70 && ftaPerGame >= team.ftaPerGame),
    r(s.ftPct), 70,
    `FT ${s.ftm}/${s.fta} = ${r(s.ftPct)}%`,
    '기준: FT%\u266570%, FTA\u2265팀평균'))

  const midPct = shotSharePct('shot_2p_mid')
  const midSP  = shotSuccPct('shot_2p_mid')
  const midA   = sb['shot_2p_mid']?.attempted ?? 0
  results.push(make('MID_MAESTRO', ok(midA >= 10 && midPct >= 30 && midSP >= 40),
    r(midPct), 30,
    `미드레인지 비중 ${r(midPct)}% (성공률 ${r(midSP, 0)}%)`,
    '기준: 비중\u266530%, 성공률\u266540%, 최소10회'))

  const fgPct = s.fga > 0 ? s.fgm / s.fga * 100 : 0
  results.push(make('EFFICIENCY_GOD', ok(s.fga >= 20 && fgPct >= 50),
    r(fgPct), 50,
    `FG% ${r(fgPct)}% (${s.fgm}/${s.fga})`,
    '기준: FG%\u266550%, 최소FGA20회'))

  // ---- 수비 ----
  const drebPct = s.reb > 0 ? s.dreb / s.reb * 100 : 0
  results.push(make('GLASS_CLEANER', ok(s.reb >= 15 && drebPct >= 60),
    r(drebPct), 60,
    `수비리바 비중 ${r(drebPct)}% (${s.dreb}/${s.reb})`,
    '기준: DREB/REB\u266560%, 최소15개'))

  const ppTh = r(team.stlPerGame * 2)
  results.push(make('PICKPOCKET', ok(team.stlPerGame > 0 && s.spg >= team.stlPerGame * 2),
    r(s.spg), ppTh,
    `SPG ${r(s.spg)} (팀 평균 ${r(team.stlPerGame)})`,
    `기준: SPG\u2265${ppTh} (팀평균\xd72배)`))

  const sbTh = r(team.blkPerGame * 2)
  results.push(make('SHOT_BLOCKER', ok(team.blkPerGame > 0 && s.bpg >= team.blkPerGame * 2),
    r(s.bpg), sbTh,
    `BPG ${r(s.bpg)} (팀 평균 ${r(team.blkPerGame)})`,
    `기준: BPG\u2265${sbTh} (팀평균\xd72배)`))

  const hustlePerGame = gp > 0 ? (s.stl + s.blk + s.dreb) / gp : 0
  const hustleTh = r(team.hustlePerGame * 1.3)
  results.push(make('HUSTLE_KING', ok(team.hustlePerGame > 0 && hustlePerGame >= team.hustlePerGame * 1.3),
    r(hustlePerGame), hustleTh,
    `허슬 ${r(hustlePerGame)}/G (팀 평균 ${r(team.hustlePerGame)})`,
    `기준: (STL+BLK+DREB)/G\u2265${hustleTh} (팀평균\xd71.3배)`))

  // ---- 플레이메이킹 ----
  results.push(make('CLEAN_HANDS', ok(s.ast >= 10 && s.astToTov >= 2.0),
    r(s.astToTov), 2.0,
    `AST/TOV ${r(s.astToTov)} (A${s.ast} T${s.tov})`,
    '기준: AST/TOV\u22652.0, 최소AST10'))

  const ast3r = s.ast > 0 && (s.ast3pts ?? 0) > 0 ? (s.ast3pts ?? 0) / s.ast * 100 : 0
  results.push(make('KICKOUT', ok(s.ast >= 10 && ast3r >= 40),
    r(ast3r), 40,
    `3점 어시스트 ${s.ast3pts ?? 0}/${s.ast} = ${r(ast3r)}%`,
    '기준: 3점연결AST\u266540%, 최소AST10'))

  const fgTh = r(team.astPerGame * 1.5)
  results.push(make('FLOOR_GENERAL', ok(s.ast >= 10 && team.astPerGame > 0 && s.apg >= team.astPerGame * 1.5),
    r(s.apg), fgTh,
    `APG ${r(s.apg)} (팀 평균 ${r(team.astPerGame)})`,
    `기준: APG\u2265${fgTh} (팀평균\xd71.5배), 최소AST10`))

  const astPaint = s.astPaint ?? 0
  const ppRatio = s.ast > 0 ? astPaint / s.ast * 100 : 0
  results.push(make('POCKET_PASSER', ok(s.ast >= 10 && ppRatio >= 40),
    r(ppRatio), 40,
    `골밑·레이업 연결 어시스트 ${astPaint}/${s.ast} = ${r(ppRatio)}%`,
    '기준: 골밑·레이업AST\u266540%, 최소AST10'))

  const arPts = team.ptsPerGame > 0 && s.ppg >= team.ptsPerGame
  const arReb = team.rebPerGame > 0 && s.rpg >= team.rebPerGame
  const arAst = team.astPerGame > 0 && s.apg >= team.astPerGame
  const arCount = [arPts, arReb, arAst].filter(Boolean).length
  results.push(make('ALL_ROUNDER', ok(arPts && arReb && arAst),
    arCount, 3,
    `PTS${arPts ? '\u2705' : '\u274c'} REB${arReb ? '\u2705' : '\u274c'} AST${arAst ? '\u2705' : '\u274c'}`,
    `기준: PPG\u2265${r(team.ptsPerGame)} & RPG\u2265${r(team.rebPerGame)} & APG\u2265${r(team.astPerGame)}`))

  return results
}

export function calculateBadges(s: PlayerCareerInput, team: TeamAverages): EarnedBadge[] {
  return evaluateAllBadges(s, team).filter(b => b.earned)
}
