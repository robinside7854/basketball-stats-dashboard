export type BadgeCategory = 'scoring' | 'rebounding' | 'defense' | 'playmaking' | 'clutch' | 'special'

export interface BadgeTheme {
  bg: string
  text: string
  border: string
  dot: string
}

export interface BadgeDefinition {
  code: string
  name: string
  icon: string
  description: string
  criteria: string
  category: BadgeCategory
  theme: BadgeTheme
  minGames: number
}

export interface EarnedBadge extends BadgeDefinition {
  achievedValue: number
  threshold: number
  tooltip: string
}

const T = {
  red:    { bg: 'bg-red-950/60',    text: 'text-red-400',    border: 'border-red-700/60',    dot: 'bg-red-500' },
  orange: { bg: 'bg-orange-950/60', text: 'text-orange-400', border: 'border-orange-700/60', dot: 'bg-orange-500' },
  amber:  { bg: 'bg-amber-950/60',  text: 'text-amber-400',  border: 'border-amber-700/60',  dot: 'bg-amber-500' },
  green:  { bg: 'bg-green-950/60',  text: 'text-green-400',  border: 'border-green-700/60',  dot: 'bg-green-500' },
  teal:   { bg: 'bg-teal-950/60',   text: 'text-teal-400',   border: 'border-teal-700/60',   dot: 'bg-teal-500' },
  blue:   { bg: 'bg-blue-950/60',   text: 'text-blue-400',   border: 'border-blue-700/60',   dot: 'bg-blue-500' },
  indigo: { bg: 'bg-indigo-950/60', text: 'text-indigo-400', border: 'border-indigo-700/60', dot: 'bg-indigo-500' },
  purple: { bg: 'bg-purple-950/60', text: 'text-purple-400', border: 'border-purple-700/60', dot: 'bg-purple-500' },
  pink:   { bg: 'bg-pink-950/60',   text: 'text-pink-400',   border: 'border-pink-700/60',   dot: 'bg-pink-500' },
  slate:  { bg: 'bg-slate-800/60',  text: 'text-slate-300',  border: 'border-slate-600/60',  dot: 'bg-slate-400' },
  yellow: { bg: 'bg-yellow-950/60', text: 'text-yellow-400', border: 'border-yellow-700/60', dot: 'bg-yellow-500' },
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  // ─── 클러치 ───
  {
    code: 'FOURTH_QUARTER_MAN',
    name: '4쿼터의 사나이',
    icon: '⏰',
    description: '승부처에서 빛나는 선수. 커리어 득점의 40% 이상을 4쿼터에서 기록',
    criteria: 'Q4 득점 / 총 득점 ≥ 40% (최소 5경기, 총 30득점 이상)',
    category: 'clutch',
    theme: T.red,
    minGames: 5,
  },
  {
    code: 'ICE_IN_VEINS',
    name: '강심장',
    icon: '🧊',
    description: '압박 상황에서도 자유투를 꽂아넣는 멘탈. FTA 팀 평균 이상 + FT% 70%',
    criteria: 'FTA/G ≥ 팀평균 & FT% ≥ 70% (최소 20시도)',
    category: 'clutch',
    theme: T.blue,
    minGames: 5,
  },

  // ─── 득점 ───
  {
    code: 'SNIPER',
    name: '3점 저격수',
    icon: '🏹',
    description: '팀 평균 이상 3점을 쏘면서 35% 이상 성공. 외곽 지향 슈터',
    criteria: '3PA/G ≥ 팀평균 & 3P% ≥ 35% (최소 3PA×5경기)',
    category: 'scoring',
    theme: T.purple,
    minGames: 5,
  },
  {
    code: 'PAINT_MASTER',
    name: '골밑 지배자',
    icon: '🏛️',
    description: '전체 슛의 80% 이상이 2점 슛이고 2P FG% 50% 이상인 인사이드 킬러',
    criteria: '2P FGM / 전체 FGM ≥ 80% & 2P FG% ≥ 50% (최소 FGA 20)',
    category: 'scoring',
    theme: T.orange,
    minGames: 5,
  },
  {
    code: 'FLAMETHROWER',
    name: '득점 화신',
    icon: '🔥',
    description: '경기당 20점 이상을 꾸준히 뽑아내는 팀의 에이스 스코어러',
    criteria: 'PPG ≥ 20.0 (최소 5경기)',
    category: 'scoring',
    theme: T.amber,
    minGames: 5,
  },
  {
    code: 'FOUL_MAGNET',
    name: '파울 자판기',
    icon: '📢',
    description: '수비수를 괴롭혀 자유투를 뽑아내는 파울 유도 전문가',
    criteria: 'FTA/G ≥ 팀 평균의 1.5배 (최소 20시도)',
    category: 'scoring',
    theme: T.pink,
    minGames: 5,
  },

  // ─── 리바운드 ───
  {
    code: 'RODMAN',
    name: '로드맨',
    icon: '💪',
    description: 'Dennis Rodman 계승자. 공격 리바운드 비중 40% 이상의 허슬맨',
    criteria: 'OREB / 총 REB ≥ 40% (최소 REB 20개)',
    category: 'rebounding',
    theme: T.slate,
    minGames: 5,
  },
  {
    code: 'GLASS_CLEANER',
    name: '유리청소부',
    icon: '🧹',
    description: '수비 리바운드 전문가. DREB 비중 70% 이상으로 상대 2차 공격 원천 차단',
    criteria: 'DREB / 총 REB ≥ 70% (최소 REB 20개)',
    category: 'rebounding',
    theme: T.teal,
    minGames: 5,
  },

  // ─── 수비 ───
  {
    code: 'PICKPOCKET',
    name: '소매치기',
    icon: '🥷',
    description: '상대 볼을 빼앗는 수비 전문가. SPG 2.0 이상 + 팀 평균 초과',
    criteria: 'SPG ≥ 2.0 & 팀 평균 이상 (최소 5경기)',
    category: 'defense',
    theme: T.indigo,
    minGames: 5,
  },
  {
    code: 'RIM_PROTECTOR',
    name: '골밑 수문장',
    icon: '🛡️',
    description: '골밑의 수호자. BPG 1.5 이상 + 팀 평균 초과',
    criteria: 'BPG ≥ 1.5 & 팀 평균 이상 (최소 5경기)',
    category: 'defense',
    theme: T.green,
    minGames: 5,
  },

  // ─── 플레이메이킹 ───
  {
    code: 'MAESTRO',
    name: '지휘자',
    icon: '🎼',
    description: '경기를 꿰뚫어 보는 눈을 가진 플레이메이커. APG 5 이상 + AST/TOV 2 이상',
    criteria: 'APG ≥ 5.0 & AST/TOV ≥ 2.0 (최소 5경기)',
    category: 'playmaking',
    theme: T.yellow,
    minGames: 5,
  },
  {
    code: 'SAFE_HANDS',
    name: '안전한 손',
    icon: '🤲',
    description: '볼을 잃지 않는 볼 핸들러. AST/TOV 비율 3.0 이상',
    criteria: 'AST/TOV ≥ 3.0 & 총 AST ≥ 15 (최소 5경기)',
    category: 'playmaking',
    theme: T.teal,
    minGames: 5,
  },

  // ─── 특수 ───
  {
    code: 'STAT_STUFFER',
    name: '만능재주꾼',
    icon: '🎭',
    description: '득점·리바·어시 가리지 않는 팔방미인. 더블더블 3회 이상 또는 트리플더블 1회',
    criteria: '더블더블 ≥ 3 또는 트리플더블 ≥ 1 (최소 5경기)',
    category: 'special',
    theme: T.purple,
    minGames: 5,
  },
  {
    code: 'IRON_MAN',
    name: '철인',
    icon: '🦾',
    description: '팀의 모든 경기에 빠짐없이 참여하는 헌신과 체력의 아이콘',
    criteria: '전체 팀 경기의 80% 이상 출전 (최소 5경기)',
    category: 'special',
    theme: T.amber,
    minGames: 5,
  },
]

interface PlayerCareerInput {
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
}

interface TeamAverages {
  ftaPerGame: number
  fg3aPerGame: number
  stlPerGame: number
  blkPerGame: number
  astPerGame: number
}

export function calculateBadges(
  s: PlayerCareerInput,
  team: TeamAverages,
): EarnedBadge[] {
  const earned: EarnedBadge[] = []
  const gp = s.gamesPlayed
  const def = (code: string) => BADGE_DEFINITIONS.find(b => b.code === code)!

  function push(code: string, achievedValue: number, threshold: number, tooltip: string) {
    earned.push({ ...def(code), achievedValue, threshold, tooltip })
  }

  // 4쿼터의 사나이
  if (gp >= 5 && s.pts >= 30) {
    const ratio = s.pts > 0 ? s.q4pts / s.pts : 0
    if (ratio >= 0.4) {
      push('FOURTH_QUARTER_MAN', Math.round(ratio * 1000) / 10, 40,
        `4쿼터 ${s.q4pts}pts / 총 ${s.pts}pts = ${Math.round(ratio * 1000) / 10}%`)
    }
  }

  // 강심장
  const ftaPerGame = gp > 0 ? s.fta / gp : 0
  if (gp >= 5 && s.fta >= 20 && ftaPerGame >= team.ftaPerGame && s.ftPct >= 70) {
    push('ICE_IN_VEINS', s.ftPct, 70,
      `FT ${s.ftm}/${s.fta} (${s.ftPct}%) · 팀평균 FTA ${team.ftaPerGame.toFixed(1)}/G`)
  }

  // 3점 저격수
  const fg3aPerGame = gp > 0 ? s.fg3a / gp : 0
  if (gp >= 5 && s.fg3a >= 15 && fg3aPerGame >= team.fg3aPerGame && s.fg3Pct >= 35) {
    push('SNIPER', s.fg3Pct, 35,
      `3P ${s.fg3m}/${s.fg3a} (${s.fg3Pct}%) · 경기당 ${fg3aPerGame.toFixed(1)}시도`)
  }

  // 골밑 지배자
  if (gp >= 5 && s.fga >= 20) {
    const fg2Ratio = s.fgm > 0 ? s.fg2m / s.fgm : 0
    const fg2Pct = s.fg2a > 0 ? (s.fg2m / s.fg2a) * 100 : 0
    if (fg2Ratio >= 0.8 && fg2Pct >= 50) {
      push('PAINT_MASTER', Math.round(fg2Ratio * 1000) / 10, 80,
        `2점 슛 ${s.fg2m}/${s.fg2a} (${Math.round(fg2Pct)}%) · 비중 ${Math.round(fg2Ratio * 100)}%`)
    }
  }

  // 득점 화신
  if (gp >= 5 && s.ppg >= 20) {
    push('FLAMETHROWER', s.ppg, 20, `PPG ${s.ppg.toFixed(1)}`)
  }

  // 파울 자판기
  if (gp >= 5 && s.fta >= 20 && ftaPerGame >= team.ftaPerGame * 1.5) {
    push('FOUL_MAGNET', Math.round(ftaPerGame * 10) / 10, Math.round(team.ftaPerGame * 1.5 * 10) / 10,
      `FTA ${s.fta}회 · 경기당 ${ftaPerGame.toFixed(1)} (팀평균 ${team.ftaPerGame.toFixed(1)})`)
  }

  // 로드맨
  if (gp >= 5 && s.reb >= 20) {
    const orebRatio = s.reb > 0 ? (s.oreb / s.reb) * 100 : 0
    if (orebRatio >= 40) {
      push('RODMAN', Math.round(orebRatio * 10) / 10, 40,
        `OREB ${s.oreb} / 총 REB ${s.reb} = ${Math.round(orebRatio * 10) / 10}%`)
    }
  }

  // 유리청소부
  if (gp >= 5 && s.reb >= 20) {
    const drebRatio = s.reb > 0 ? (s.dreb / s.reb) * 100 : 0
    if (drebRatio >= 70) {
      push('GLASS_CLEANER', Math.round(drebRatio * 10) / 10, 70,
        `DREB ${s.dreb} / 총 REB ${s.reb} = ${Math.round(drebRatio * 10) / 10}%`)
    }
  }

  // 소매치기
  if (gp >= 5 && s.spg >= 2.0 && s.spg > team.stlPerGame) {
    push('PICKPOCKET', s.spg, 2.0,
      `SPG ${s.spg.toFixed(1)} · 팀평균 ${team.stlPerGame.toFixed(1)}`)
  }

  // 골밑 수문장
  if (gp >= 5 && s.bpg >= 1.5 && s.bpg > team.blkPerGame) {
    push('RIM_PROTECTOR', s.bpg, 1.5,
      `BPG ${s.bpg.toFixed(1)} · 팀평균 ${team.blkPerGame.toFixed(1)}`)
  }

  // 지휘자
  if (gp >= 5 && s.apg >= 5.0 && s.astToTov >= 2.0) {
    push('MAESTRO', s.apg, 5.0,
      `APG ${s.apg.toFixed(1)} · AST/TOV ${s.astToTov.toFixed(1)}`)
  }

  // 안전한 손
  if (gp >= 5 && s.ast >= 15 && s.astToTov >= 3.0) {
    push('SAFE_HANDS', s.astToTov, 3.0,
      `AST/TOV ${s.astToTov.toFixed(1)} · 총 AST ${s.ast}`)
  }

  // 만능재주꾼
  if (gp >= 5 && (s.doubleDoubles >= 3 || s.tripleDoubles >= 1)) {
    const val = s.tripleDoubles >= 1 ? s.tripleDoubles : s.doubleDoubles
    const thr = s.tripleDoubles >= 1 ? 1 : 3
    const label = s.tripleDoubles >= 1 ? `트리플더블 ${s.tripleDoubles}회` : `더블더블 ${s.doubleDoubles}회`
    push('STAT_STUFFER', val, thr, label)
  }

  // 철인
  if (gp >= 5 && s.totalTeamGames > 0) {
    const attendance = s.gamesPlayed / s.totalTeamGames
    if (attendance >= 0.8) {
      push('IRON_MAN', Math.round(attendance * 1000) / 10, 80,
        `${s.gamesPlayed} / ${s.totalTeamGames}경기 출전 (${Math.round(attendance * 100)}%)`)
    }
  }

  return earned
}

export const CATEGORY_LABELS: Record<BadgeCategory, string> = {
  clutch: '클러치',
  scoring: '득점',
  rebounding: '리바운드',
  defense: '수비',
  playmaking: '플레이메이킹',
  special: '특수',
}
