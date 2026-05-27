'use client'
import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { Loader2, Crown, ChevronUp, ChevronDown, ChevronsUpDown, X } from 'lucide-react'
import Link from 'next/link'
import PlayerQuickViewModal from '@/components/league/PlayerQuickViewModal'
import TeamInsights from '@/components/league/TeamInsights'
import type { Quarter, PlayerStat, Leader } from '@/types/league'

type Team = { id: string; name: string; color: string }
type Game = {
  id: string
  home_team_id: string | null
  away_team_id: string | null
  home_score: number
  away_score: number
  is_complete: boolean
  home_team?: { id: string; name: string; color: string } | null
  away_team?: { id: string; name: string; color: string } | null
}

type BasicKey =
  | 'gp'|'ppg'|'rpg'|'orp'|'drp'|'apg'|'spg'|'bpg'|'topg'
  | 'fg_pct'|'fg3_pct'|'ft_pct'|'efg_pct'
  | 'pts'|'reb'|'oreb'|'dreb'|'ast'|'stl'|'blk'|'tov'
  | 'fgm'|'fg3m'|'ftm'
type AdvKey = 'at_ratio'|'ast_pct'|'tov_pct'|'a1_total'|'a1_rate'|'orb_pct'|'drb_pct'|'trb_pct'
type ShootingKey = 'fg_pct'|'fg2_pct'|'fg3_pct'|'efg_pct'|'ft_pct'|'ts_pct'|'ft_rate'|'ds_pct'|'lu_pct'|'md_pct'|'three_share'
type StatMode = 'basic'|'shooting'|'advanced'

const AVG_COLS: { key: BasicKey; label: string }[] = [
  { key: 'gp',      label: 'R'    },
  { key: 'ppg',     label: 'PPG'  },
  { key: 'rpg',     label: 'RPG'  },
  { key: 'orp',     label: 'ORpg' },
  { key: 'drp',     label: 'DRpg' },
  { key: 'apg',     label: 'APG'  },
  { key: 'spg',     label: 'SPG'  },
  { key: 'bpg',     label: 'BPG'  },
  { key: 'topg',    label: 'TOPG' },
  { key: 'fg_pct',  label: 'FG%'  },
  { key: 'fg3_pct', label: '3P%'  },
  { key: 'ft_pct',  label: 'FT%'  },
  { key: 'efg_pct', label: 'eFG%' },
]
const TOTAL_COLS: { key: BasicKey; label: string }[] = [
  { key: 'gp',      label: 'R'    },
  { key: 'pts',     label: 'PTS'  },
  { key: 'reb',     label: 'REB'  },
  { key: 'oreb',    label: 'OR'   },
  { key: 'dreb',    label: 'DR'   },
  { key: 'ast',     label: 'AST'  },
  { key: 'stl',     label: 'STL'  },
  { key: 'blk',     label: 'BLK'  },
  { key: 'tov',     label: 'TOV'  },
  { key: 'fgm',     label: 'FG'   },
  { key: 'fg3m',    label: '3P'   },
  { key: 'ftm',     label: 'FT'   },
  { key: 'fg_pct',  label: 'FG%'  },
  { key: 'fg3_pct', label: '3P%'  },
  { key: 'ft_pct',  label: 'FT%'  },
]
const ADV_COLS: { key: AdvKey; label: string; desc: string }[] = [
  { key: 'at_ratio',  label: 'A/T',   desc: '어시스트/턴오버 비율' },
  { key: 'ast_pct',   label: 'AST%',  desc: '볼소유 중 어시스트 비중' },
  { key: 'tov_pct',   label: 'TOV%',  desc: '볼소유 중 턴오버 비중' },
  { key: 'a1_total',  label: 'A1',    desc: '성공한 앤드원(And-One) 횟수 (누적)' },
  { key: 'a1_rate',   label: 'A1%',   desc: '야투 성공 중 앤드원 비율 · A1/FGM' },
  { key: 'orb_pct',   label: 'ORB%',  desc: '본인 리바운드 중 공격 리바운드 비중 · OREB/REB' },
  { key: 'drb_pct',   label: 'DRB%',  desc: '본인 리바운드 중 수비 리바운드 비중 · DREB/REB' },
  { key: 'trb_pct',   label: 'TRB%',  desc: '본인 출전 경기에서 팀 리바운드 대비 본인 비중 · REB/팀 REB' },
]
const SHOOTING_COLS: { key: ShootingKey; label: string; desc: string }[] = [
  { key: 'fg_pct',      label: 'FG%',   desc: '전체 야투 성공률 · FGM/FGA' },
  { key: 'fg2_pct',     label: '2P%',   desc: '2점 야투 성공률 · (FGM-3PM)/(FGA-3PA)' },
  { key: 'fg3_pct',     label: '3P%',   desc: '3점 야투 성공률 · 3PM/3PA' },
  { key: 'efg_pct',     label: 'eFG%',  desc: '유효야투율 · (FGM+0.5×3PM)/FGA' },
  { key: 'ft_pct',      label: 'FT%',   desc: '자유투 성공률 · FTM/FTA' },
  { key: 'ts_pct',      label: 'TS%',   desc: '진실야투율 · PTS/(2×(FGA+0.44×FTA))' },
  { key: 'ft_rate',     label: 'FTr',   desc: '야투 대비 자유투 시도 · FTA/FGA' },
  { key: 'ds_pct',      label: 'DS',    desc: '골밑슛 비중 · 골밑슛시도/전체야투시도' },
  { key: 'lu_pct',      label: 'LU',    desc: '레이업 비중 · (레이업+드라이브) 시도/전체야투시도' },
  { key: 'md_pct',      label: 'MD',    desc: '미드레인지 비중 · 미들시도/전체야투시도' },
  { key: 'three_share', label: '3P',    desc: '3점 비중 · 3PA/FGA' },
]

const BASIC_PCT_KEYS = new Set<BasicKey>(['fg_pct', 'fg3_pct', 'ft_pct', 'efg_pct'])
const BASIC_INT_KEYS = new Set<BasicKey>(['gp','pts','reb','oreb','dreb','ast','stl','blk','tov','fgm','fg3m','ftm'])

// 기본 색상 (셀)
const BASIC_COLOR: Partial<Record<BasicKey, string>> = {
  gp: 'text-gray-400',
  ppg: 'font-bold text-white', pts: 'font-bold text-white',
  rpg: 'text-gray-300', reb: 'text-gray-300',
  orp: 'text-gray-400', oreb: 'text-gray-400',
  drp: 'text-gray-400', dreb: 'text-gray-400',
  apg: 'text-gray-300', ast: 'text-gray-300',
  spg: 'text-purple-400', stl: 'text-purple-400',
  bpg: 'text-indigo-400', blk: 'text-indigo-400',
  topg: 'text-red-400', tov: 'text-red-400',
  fg_pct: 'text-gray-400', fg3_pct: 'text-yellow-600',
  ft_pct: 'text-cyan-600', efg_pct: 'text-teal-500',
  fgm: 'text-gray-500', fg3m: 'text-gray-500', ftm: 'text-gray-500',
}
const ADV_COLOR: Partial<Record<AdvKey, string>> = {
  at_ratio: 'text-blue-400',
  ast_pct: 'text-purple-400', tov_pct: 'text-red-400',
  a1_total: 'text-orange-400', a1_rate: 'text-amber-400',
  orb_pct: 'text-amber-400', drb_pct: 'text-emerald-400', trb_pct: 'text-violet-400',
}
const SHOOT_COLOR: Partial<Record<ShootingKey, string>> = {
  fg_pct: 'text-gray-300', fg2_pct: 'text-orange-300', fg3_pct: 'text-yellow-500',
  efg_pct: 'text-teal-500', ft_pct: 'text-cyan-500', ts_pct: 'text-teal-400',
  ft_rate: 'text-cyan-600',
  ds_pct: 'text-red-400', lu_pct: 'text-orange-400', md_pct: 'text-yellow-500', three_share: 'text-blue-400',
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc'|'desc' }) {
  if (!active) return <ChevronsUpDown size={9} className="inline ml-0.5 opacity-30" />
  return dir === 'desc'
    ? <ChevronDown size={9} className="inline ml-0.5 text-blue-400" />
    : <ChevronUp   size={9} className="inline ml-0.5 text-blue-400" />
}

function calcAdv(p: PlayerStat): Record<AdvKey, number> {
  const poss = p.fga + 0.44 * p.fta + p.tov
  const a1 = p.and_one ?? 0
  const teamReb = p.team_reb_in_games ?? 0
  return {
    at_ratio:  p.tov > 0 ? +(p.ast / p.tov).toFixed(2) : (p.ast > 0 ? 99 : 0),
    ast_pct:   (poss + p.ast) > 0 ? +(p.ast / (poss + p.ast) * 100).toFixed(1) : 0,
    tov_pct:   poss > 0 ? +(p.tov / poss * 100).toFixed(1) : 0,
    a1_total:  a1,
    a1_rate:   p.fgm > 0 ? +(a1 / p.fgm * 100).toFixed(1) : 0,
    orb_pct:   p.reb > 0 ? +(p.oreb / p.reb * 100).toFixed(1) : 0,
    drb_pct:   p.reb > 0 ? +(p.dreb / p.reb * 100).toFixed(1) : 0,
    trb_pct:   teamReb > 0 ? +(p.reb / teamReb * 100).toFixed(1) : 0,
  }
}

function calcShoot(p: PlayerStat): Record<ShootingKey, number> {
  return {
    fg_pct:      p.fg_pct ?? 0,
    fg2_pct:     p.fg2_pct ?? 0,
    fg3_pct:     p.fg3_pct ?? 0,
    efg_pct:     p.efg_pct ?? 0,
    ft_pct:      p.ft_pct ?? 0,
    ts_pct:      (p.fga + 0.44 * p.fta) > 0 ? +(p.pts / (2 * (p.fga + 0.44 * p.fta)) * 100).toFixed(1) : 0,
    ft_rate:     p.fga > 0 ? +(p.fta / p.fga * 100).toFixed(1) : 0,
    ds_pct:      p.fga > 0 ? +((p.ds_a ?? 0) / p.fga * 100).toFixed(1) : 0,
    lu_pct:      p.fga > 0 ? +((p.lu_a ?? 0) / p.fga * 100).toFixed(1) : 0,
    md_pct:      p.fga > 0 ? +((p.md_a ?? 0) / p.fga * 100).toFixed(1) : 0,
    three_share: p.fga > 0 ? +(p.fg3a / p.fga * 100).toFixed(1) : 0,
  }
}

function StatsTable({
  players, leagueId, leaderId, color, viewMode, statMode,
}: {
  players: PlayerStat[]
  leagueId: string
  leaderId?: string | null
  color?: string
  viewMode: 'avg'|'total'
  statMode: StatMode
}) {
  const defaultBasicSort: BasicKey = viewMode === 'avg' ? 'ppg' : 'pts'
  const [basicSortKey, setBasicSortKey] = useState<BasicKey>(defaultBasicSort)
  const [basicSortDir, setBasicSortDir] = useState<'asc'|'desc'>('desc')
  const [advSortKey, setAdvSortKey] = useState<AdvKey>('at_ratio')
  const [advSortDir, setAdvSortDir] = useState<'asc'|'desc'>('desc')
  const [shootSortKey, setShootSortKey] = useState<ShootingKey>('efg_pct')
  const [shootSortDir, setShootSortDir] = useState<'asc'|'desc'>('desc')
  const [quickView, setQuickView] = useState<{ id: string; name: string } | null>(null)

  // viewMode 변경 시 basicSortKey가 새 col 셋에 없으면 기본값으로
  useEffect(() => {
    const cols = viewMode === 'avg' ? AVG_COLS : TOTAL_COLS
    if (!cols.some(c => c.key === basicSortKey)) {
      setBasicSortKey(viewMode === 'avg' ? 'ppg' : 'pts')
      setBasicSortDir('desc')
    }
  }, [viewMode, basicSortKey])

  const basicSorted = useMemo(() => {
    return [...players].sort((a, b) => {
      const diff = ((a[basicSortKey] as number) ?? 0) - ((b[basicSortKey] as number) ?? 0)
      return basicSortDir === 'desc' ? -diff : diff
    })
  }, [players, basicSortKey, basicSortDir])

  const advSorted = useMemo(() => {
    return [...players]
      .map(p => ({ p, adv: calcAdv(p) }))
      .sort((a, b) => {
        const diff = a.adv[advSortKey] - b.adv[advSortKey]
        return advSortDir === 'desc' ? -diff : diff
      })
  }, [players, advSortKey, advSortDir])

  const shootSorted = useMemo(() => {
    return [...players]
      .map(p => ({ p, sh: calcShoot(p) }))
      .sort((a, b) => {
        const diff = a.sh[shootSortKey] - b.sh[shootSortKey]
        return shootSortDir === 'desc' ? -diff : diff
      })
  }, [players, shootSortKey, shootSortDir])

  function handleBasicSort(key: BasicKey) {
    if (key === basicSortKey) setBasicSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setBasicSortKey(key); setBasicSortDir('desc') }
  }
  function handleAdvSort(key: AdvKey) {
    if (key === advSortKey) setAdvSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setAdvSortKey(key); setAdvSortDir('desc') }
  }
  function handleShootSort(key: ShootingKey) {
    if (key === shootSortKey) setShootSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setShootSortKey(key); setShootSortDir('desc') }
  }

  if (players.length === 0) {
    return <p className="text-xs text-gray-500 py-4 text-center">기록된 스탯이 없습니다</p>
  }

  // Basic 셀 텍스트 변환
  function basicVal(p: PlayerStat, key: BasicKey): string {
    if (BASIC_INT_KEYS.has(key) && !BASIC_PCT_KEYS.has(key)) {
      if (key === 'fgm')  return `${p.fgm}/${p.fga}`
      if (key === 'fg3m') return `${p.fg3m}/${p.fg3a}`
      if (key === 'ftm')  return `${p.ftm}/${p.fta}`
      return String((p as unknown as Record<string, number>)[key] ?? 0)
    }
    if (key === 'fg_pct')  return p.fga  > 0 ? `${p.fg_pct.toFixed(1)}%`  : '—'
    if (key === 'fg3_pct') return p.fg3a > 0 ? `${p.fg3_pct.toFixed(1)}%` : '—'
    if (key === 'ft_pct')  return p.fta  > 0 ? `${p.ft_pct.toFixed(1)}%`  : '—'
    if (key === 'efg_pct') return p.fga  > 0 ? `${p.efg_pct.toFixed(1)}%` : '—'
    // 평균 키
    return ((p as unknown as Record<string, number>)[key] ?? 0).toFixed(1)
  }

  function advVal(adv: Record<AdvKey, number>, key: AdvKey): string {
    if (key === 'at_ratio') {
      return adv.at_ratio >= 99 ? '∞' : adv.at_ratio.toFixed(2)
    }
    if (key === 'a1_total') return String(adv.a1_total)
    return `${adv[key].toFixed(1)}%`
  }

  function shootVal(sh: Record<ShootingKey, number>, key: ShootingKey): string {
    return `${sh[key].toFixed(1)}%`
  }

  const basicCols = viewMode === 'avg' ? AVG_COLS : TOTAL_COLS

  return (
    <>
    {/* 모바일 정렬 칩 + 카드뷰 (md 미만) */}
    <div className="md:hidden">
      <div className="px-1 pb-2 overflow-x-auto">
        <div className="flex gap-1.5 whitespace-nowrap">
          {statMode === 'basic' ? (
            basicCols.map(({ key, label }) => (
              <button key={key} onClick={() => handleBasicSort(key)}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors shrink-0 ${
                  basicSortKey === key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}>
                {label}{basicSortKey === key && (basicSortDir === 'desc' ? ' ↓' : ' ↑')}
              </button>
            ))
          ) : statMode === 'shooting' ? (
            SHOOTING_COLS.map(({ key, label }) => (
              <button key={key} onClick={() => handleShootSort(key)}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors shrink-0 ${
                  shootSortKey === key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}>
                {label}{shootSortKey === key && (shootSortDir === 'desc' ? ' ↓' : ' ↑')}
              </button>
            ))
          ) : (
            ADV_COLS.map(({ key, label }) => (
              <button key={key} onClick={() => handleAdvSort(key)}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors shrink-0 ${
                  advSortKey === key ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}>
                {label}{advSortKey === key && (advSortDir === 'desc' ? ' ↓' : ' ↑')}
              </button>
            ))
          )}
        </div>
      </div>
      <div className="divide-y divide-gray-800/60 rounded-xl overflow-hidden bg-gray-900/40">
        {statMode === 'basic' ? (
          basicSorted.map((p, i) => {
            const isLeader = leaderId && p.player_id === leaderId
            const sortLabel = basicCols.find(c => c.key === basicSortKey)?.label ?? ''
            const subKeys = basicCols.map(c => c.key).filter(k => k !== basicSortKey).slice(0, 4)
            return (
              <button key={p.player_id} onClick={() => setQuickView({ id: p.player_id, name: p.name })}
                className="w-full text-left px-3 py-2.5 hover:bg-gray-800/40 transition-colors active:bg-gray-800/60">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-black text-gray-500 font-mono w-5 shrink-0">{i + 1}</span>
                  {isLeader && <Crown size={11} className="text-yellow-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm truncate">
                      {p.name}
                      {p.number != null && <span className="text-gray-600 font-mono ml-1 text-xs">#{p.number}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-black leading-none" style={{ color: color ?? '#facc15' }}>{basicVal(p, basicSortKey)}</div>
                    <div className="text-[11px] text-gray-500 font-bold mt-0.5">{sortLabel}</div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5 pt-1.5 border-t border-gray-800/60">
                  {subKeys.map(k => {
                    const lbl = basicCols.find(c => c.key === k)?.label ?? k
                    return (
                      <div key={k} className="text-center">
                        <div className="text-[11px] text-gray-500">{lbl}</div>
                        <div className="text-xs font-bold text-gray-200">{basicVal(p, k)}</div>
                      </div>
                    )
                  })}
                </div>
              </button>
            )
          })
        ) : statMode === 'shooting' ? (
          shootSorted.map(({ p, sh }, i) => {
            const isLeader = leaderId && p.player_id === leaderId
            const sortLabel = SHOOTING_COLS.find(c => c.key === shootSortKey)?.label ?? ''
            const subKeys = SHOOTING_COLS.map(c => c.key).filter(k => k !== shootSortKey).slice(0, 4)
            return (
              <button key={p.player_id} onClick={() => setQuickView({ id: p.player_id, name: p.name })}
                className="w-full text-left px-3 py-2.5 hover:bg-gray-800/40 transition-colors active:bg-gray-800/60">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-black text-gray-500 font-mono w-5 shrink-0">{i + 1}</span>
                  {isLeader && <Crown size={11} className="text-yellow-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm truncate">
                      {p.name}
                      {p.number != null && <span className="text-gray-600 font-mono ml-1 text-xs">#{p.number}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-black leading-none" style={{ color: color ?? '#60a5fa' }}>{shootVal(sh, shootSortKey)}</div>
                    <div className="text-[11px] text-gray-500 font-bold mt-0.5">{sortLabel}</div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5 pt-1.5 border-t border-gray-800/60">
                  {subKeys.map(k => {
                    const lbl = SHOOTING_COLS.find(c => c.key === k)?.label ?? k
                    return (
                      <div key={k} className="text-center">
                        <div className="text-[11px] text-gray-500">{lbl}</div>
                        <div className="text-xs font-bold text-gray-200">{shootVal(sh, k)}</div>
                      </div>
                    )
                  })}
                </div>
              </button>
            )
          })
        ) : (
          advSorted.map(({ p, adv }, i) => {
            const isLeader = leaderId && p.player_id === leaderId
            const sortLabel = ADV_COLS.find(c => c.key === advSortKey)?.label ?? ''
            const subKeys = ADV_COLS.map(c => c.key).filter(k => k !== advSortKey).slice(0, 4)
            return (
              <button key={p.player_id} onClick={() => setQuickView({ id: p.player_id, name: p.name })}
                className="w-full text-left px-3 py-2.5 hover:bg-gray-800/40 transition-colors active:bg-gray-800/60">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm font-black text-gray-500 font-mono w-5 shrink-0">{i + 1}</span>
                  {isLeader && <Crown size={11} className="text-yellow-400 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm truncate">
                      {p.name}
                      {p.number != null && <span className="text-gray-600 font-mono ml-1 text-xs">#{p.number}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xl font-black leading-none" style={{ color: color ?? '#a78bfa' }}>{advVal(adv, advSortKey)}</div>
                    <div className="text-[11px] text-gray-500 font-bold mt-0.5">{sortLabel}</div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5 pt-1.5 border-t border-gray-800/60">
                  {subKeys.map(k => {
                    const lbl = ADV_COLS.find(c => c.key === k)?.label ?? k
                    return (
                      <div key={k} className="text-center">
                        <div className="text-[11px] text-gray-500">{lbl}</div>
                        <div className="text-xs font-bold text-gray-200">{advVal(adv, k)}</div>
                      </div>
                    )
                  })}
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>

    {/* 데스크탑 테이블 (md 이상) */}
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-xs whitespace-nowrap">
        <thead>
          <tr className="border-b border-gray-800">
            <th className="text-left py-2 pr-3 text-xs text-gray-600 font-bold sticky left-0 bg-gray-900 min-w-[90px]">선수</th>
            {statMode === 'basic' ? (
              basicCols.map(({ key, label }) => (
                <th key={key} onClick={() => handleBasicSort(key)}
                  className={`py-2 px-1.5 text-xs font-bold cursor-pointer select-none text-right ${basicSortKey === key ? 'text-blue-400' : 'text-gray-600'} hover:text-gray-300 transition-colors`}>
                  {label}<SortIcon active={basicSortKey === key} dir={basicSortDir} />
                </th>
              ))
            ) : statMode === 'shooting' ? (
              SHOOTING_COLS.map(({ key, label, desc }, idx) => {
                const divider = idx === 7 ? 'border-l border-gray-800' : ''
                return (
                  <th key={key} onClick={() => handleShootSort(key)} title={desc}
                    className={`py-2 px-1.5 text-xs font-bold cursor-pointer select-none text-right ${divider} ${shootSortKey === key ? 'text-blue-400' : 'text-gray-600'} hover:text-gray-300 transition-colors`}>
                    {label}<SortIcon active={shootSortKey === key} dir={shootSortDir} />
                  </th>
                )
              })
            ) : (
              ADV_COLS.map(({ key, label, desc }) => (
                <th key={key} onClick={() => handleAdvSort(key)} title={desc}
                  className={`py-2 px-1.5 text-xs font-bold cursor-pointer select-none text-right ${advSortKey === key ? 'text-violet-400' : 'text-gray-600'} hover:text-gray-300 transition-colors`}>
                  {label}<SortIcon active={advSortKey === key} dir={advSortDir} />
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/40">
          {statMode === 'basic' ? (
            basicSorted.map(p => {
              const isLeader = leaderId && p.player_id === leaderId
              return (
                <tr key={p.player_id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="py-2 pr-3 sticky left-0 bg-gray-900">
                    <button onClick={() => setQuickView({ id: p.player_id, name: p.name })}
                      className="flex items-center gap-1.5 hover:text-blue-300 cursor-pointer transition-colors text-left">
                      {isLeader && <Crown size={10} className="text-yellow-400 shrink-0" />}
                      <span className="text-white font-medium">
                        {p.number != null && <span className="text-gray-600 font-mono mr-1 text-xs">#{p.number}</span>}
                        {p.name}
                      </span>
                    </button>
                  </td>
                  {basicCols.map(({ key }) => {
                    const isSortLeader = key === basicSortKey
                    const baseClass = BASIC_COLOR[key] ?? 'text-gray-300'
                    const style = isSortLeader && color ? { color } : undefined
                    return (
                      <td key={key} className={`py-2 px-1.5 text-right ${baseClass}`} style={style}>
                        {basicVal(p, key)}
                      </td>
                    )
                  })}
                </tr>
              )
            })
          ) : statMode === 'shooting' ? (
            shootSorted.map(({ p, sh }) => {
              const isLeader = leaderId && p.player_id === leaderId
              return (
                <tr key={p.player_id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="py-2 pr-3 sticky left-0 bg-gray-900">
                    <button onClick={() => setQuickView({ id: p.player_id, name: p.name })}
                      className="flex items-center gap-1.5 hover:text-blue-300 cursor-pointer transition-colors text-left">
                      {isLeader && <Crown size={10} className="text-yellow-400 shrink-0" />}
                      <span className="text-white font-medium">
                        {p.number != null && <span className="text-gray-600 font-mono mr-1 text-xs">#{p.number}</span>}
                        {p.name}
                      </span>
                    </button>
                  </td>
                  {SHOOTING_COLS.map(({ key }, idx) => {
                    const isSortLeader = key === shootSortKey
                    const baseClass = SHOOT_COLOR[key] ?? 'text-gray-300'
                    const style = isSortLeader && color ? { color } : undefined
                    const divider = idx === 7 ? 'border-l border-gray-800' : ''
                    return (
                      <td key={key} className={`py-2 px-1.5 text-right ${divider} ${baseClass}`} style={style}>
                        {shootVal(sh, key)}
                      </td>
                    )
                  })}
                </tr>
              )
            })
          ) : (
            advSorted.map(({ p, adv }) => {
              const isLeader = leaderId && p.player_id === leaderId
              return (
                <tr key={p.player_id} className="hover:bg-gray-800/30 transition-colors">
                  <td className="py-2 pr-3 sticky left-0 bg-gray-900">
                    <button onClick={() => setQuickView({ id: p.player_id, name: p.name })}
                      className="flex items-center gap-1.5 hover:text-blue-300 cursor-pointer transition-colors text-left">
                      {isLeader && <Crown size={10} className="text-yellow-400 shrink-0" />}
                      <span className="text-white font-medium">
                        {p.number != null && <span className="text-gray-600 font-mono mr-1 text-xs">#{p.number}</span>}
                        {p.name}
                      </span>
                    </button>
                  </td>
                  {ADV_COLS.map(({ key }) => {
                    const isSortLeader = key === advSortKey
                    const baseClass = ADV_COLOR[key] ?? 'text-gray-300'
                    const style = isSortLeader && color ? { color } : undefined
                    return (
                      <td key={key} className={`py-2 px-1.5 text-right ${baseClass}`} style={style}>
                        {advVal(adv, key)}
                      </td>
                    )
                  })}
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </div>
    {quickView && (
      <PlayerQuickViewModal
        leagueId={leagueId}
        playerId={quickView.id}
        playerName={quickView.name}
        onClose={() => setQuickView(null)}
      />
    )}
    </>
  )
}

// ── TeamDetailPanel ────────────────────────────────────────────────────────
type StandingEntry = { teamId: string; w: number; d: number; l: number; gf: number; ga: number }

function TeamDetailPanel({
  teamId, team, standing, h2h, players, allTeams, leagueId, games, quarterId,
}: {
  teamId: string
  team: Team
  standing: StandingEntry
  h2h: Record<string, { w: number; d: number; l: number }>
  players: PlayerStat[]
  allTeams: Team[]
  leagueId: string
  games: Game[]
  quarterId: string | 'all'
}) {
  const [quickView, setQuickView] = useState<{ id: string; name: string } | null>(null)

  const teamGames = useMemo(() => {
    return games.filter(g =>
      (g.home_team_id === teamId || g.away_team_id === teamId) && g.is_complete
    )
  }, [games, teamId])

  const gp = teamGames.length || (standing.w + standing.d + standing.l) || 1

  const computed = useMemo(() => {
    if (players.length === 0) return null

    const totPts    = players.reduce((s, p) => s + p.pts, 0)
    const totFgm    = players.reduce((s, p) => s + p.fgm, 0)
    const totFga    = players.reduce((s, p) => s + p.fga, 0)
    const totFg3m   = players.reduce((s, p) => s + p.fg3m, 0)
    const totFg3a   = players.reduce((s, p) => s + p.fg3a, 0)
    const totFtm    = players.reduce((s, p) => s + p.ftm, 0)
    const totFta    = players.reduce((s, p) => s + p.fta, 0)
    const totStl    = players.reduce((s, p) => s + p.stl, 0)
    const totBlk    = players.reduce((s, p) => s + p.blk, 0)

    const ppg    = totPts / gp
    const fgPct  = totFga  > 0 ? totFgm / totFga * 100 : 0
    const efgPct = totFga  > 0 ? (totFgm + 0.5 * totFg3m) / totFga * 100 : 0
    const defPg  = (totStl + totBlk) / gp
    const ftPct  = totFta  > 0 ? totFtm / totFta * 100 : 0
    const threePct = totFga > 0 ? totFg3a / totFga * 100 : 0

    // Top performers
    const byPpg   = [...players].sort((a, b) => b.ppg   - a.ppg)[0]
    const byRpg   = [...players].sort((a, b) => b.rpg   - a.rpg)[0]
    const byApg   = [...players].sort((a, b) => b.apg   - a.apg)[0]
    const byDef   = [...players].sort((a, b) => (b.spg + b.bpg) - (a.spg + a.bpg))[0]
    const byEfg   = [...players].filter(p => p.fga > 0).sort((a, b) => b.efg_pct - a.efg_pct)[0]

    // Fun: ace dependency
    const topScorer = byPpg
    const acePct = totPts > 0 && topScorer ? topScorer.pts / totPts * 100 : 0

    return { ppg, fgPct, efgPct, defPg, ftPct, threePct, acePct, byPpg, byRpg, byApg, byDef, byEfg }
  }, [players, gp])

  const played = standing.w + standing.d + standing.l
  const winPct = played > 0 ? (standing.w / played * 100).toFixed(1) : '—'

  // standings.gf/ga가 가장 신뢰성 있는 소스 (games 루프와 동일 기준)
  const avgPf = played > 0 ? standing.gf / played : 0
  const avgPa = played > 0 ? standing.ga / played : 0
  const ptsDiff = standing.gf - standing.ga

  return (
    <div
      className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden mt-3"
      style={{ borderTopColor: team.color, borderTopWidth: 3 }}
    >
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-800/60 flex items-center gap-2.5">
        <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
        <span className="font-black text-white text-lg">{team.name}</span>
        <span className="text-sm text-gray-500 font-semibold">{standing.w}승 {standing.d > 0 ? `${standing.d}무 ` : ''}{standing.l}패</span>
      </div>

      <div className="p-5 space-y-6">
        {players.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-6">팀 없음 — 스탯이 없습니다</p>
        ) : (
          <>
            {/* B. 팀 스탯 Grid */}
            {computed && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">팀 스탯</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  {[
                    { label: '팀 평균득점', value: avgPf.toFixed(1), sub: '경기당 득점', color: team.color },
                    { label: '팀 평균실점', value: avgPa.toFixed(1), sub: '경기당 허용', color: '#f87171' },
                    { label: '득실차', value: (ptsDiff >= 0 ? '+' : '') + ptsDiff.toFixed(0), sub: `총 ${ptsDiff >= 0 ? '양수' : '음수'}`, color: ptsDiff >= 0 ? '#4ade80' : '#f87171' },
                    { label: '팀 FG%', value: `${computed.fgPct.toFixed(1)}%`, sub: '야투율', color: '#34d399' },
                    { label: '팀 eFG%', value: `${computed.efgPct.toFixed(1)}%`, sub: '유효 야투율', color: '#2dd4bf' },
                    { label: 'STL+BLK/G', value: computed.defPg.toFixed(1), sub: '수비 이벤트', color: '#a78bfa' },
                  ].map(card => (
                    <div key={card.label} className="bg-gray-800/60 rounded-xl p-3 text-center border border-gray-700/40">
                      <div className="text-2xl font-black leading-none" style={{ color: card.color }}>{card.value}</div>
                      <div className="text-[11px] font-bold text-white mt-1">{card.label}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{card.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* C. Top Performers */}
            {computed && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">팀 내 1위</p>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {[
                    { label: '득점왕', player: computed.byPpg, val: computed.byPpg ? `${computed.byPpg.ppg.toFixed(1)} PPG` : null },
                    { label: '리바운드', player: computed.byRpg, val: computed.byRpg ? `${computed.byRpg.rpg.toFixed(1)} RPG` : null },
                    { label: '어시스트', player: computed.byApg, val: computed.byApg ? `${computed.byApg.apg.toFixed(1)} APG` : null },
                    { label: '수비왕', player: computed.byDef, val: computed.byDef ? `${(computed.byDef.spg + computed.byDef.bpg).toFixed(1)} SPG+BPG` : null },
                    { label: '효율왕', player: computed.byEfg, val: computed.byEfg ? `${computed.byEfg.efg_pct.toFixed(1)}% eFG` : null },
                  ].filter(item => item.player && item.val).map(item => (
                    <button
                      key={item.label}
                      onClick={() => item.player && setQuickView({ id: item.player.player_id, name: item.player.name })}
                      className="shrink-0 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl px-3.5 py-2.5 text-left transition-colors cursor-pointer"
                    >
                      <div className="text-[10px] text-gray-500 font-bold mb-0.5">{item.label}</div>
                      <div className="text-sm font-bold text-white whitespace-nowrap">{item.player?.name}</div>
                      <div className="text-[11px] font-semibold whitespace-nowrap" style={{ color: team.color }}>{item.val}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* D. 재미있는 팀 통계 */}
            {computed && (
              <div>
                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">팀 특성</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    {
                      title: '에이스 의존도',
                      value: `${computed.acePct.toFixed(0)}%`,
                      desc: `에이스 비중 ${computed.acePct.toFixed(0)}%`,
                      colorClass: computed.acePct > 40 ? 'text-red-400' : computed.acePct > 30 ? 'text-yellow-400' : 'text-green-400',
                    },
                    {
                      title: '외곽 스타일',
                      value: `${computed.threePct.toFixed(0)}%`,
                      desc: `3점 시도 비율`,
                      colorClass: computed.threePct > 35 ? 'text-yellow-400' : 'text-blue-400',
                    },
                    {
                      title: '수비 강도',
                      value: computed.defPg.toFixed(1),
                      desc: `게임당 수비 이벤트`,
                      colorClass: computed.defPg > 5 ? 'text-green-400' : computed.defPg > 3 ? 'text-yellow-400' : 'text-gray-400',
                    },
                    {
                      title: '자유투 성공률',
                      value: `${computed.ftPct.toFixed(1)}%`,
                      desc: `팀 클러치 지표`,
                      colorClass: computed.ftPct > 75 ? 'text-green-400' : computed.ftPct > 60 ? 'text-yellow-400' : 'text-red-400',
                    },
                  ].map(tile => (
                    <div key={tile.title} className="bg-gray-800/40 rounded-xl p-3 border border-gray-700/30">
                      <div className={`text-xl font-black leading-none ${tile.colorClass}`}>{tile.value}</div>
                      <div className="text-[11px] font-bold text-white mt-1">{tile.title}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{tile.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* F·G·H. 팀 인사이트 (하이라이트 + Four Factors + Advanced) */}
            <TeamInsights
              leagueId={leagueId}
              teamId={teamId}
              quarterId={quarterId}
              teamColor={team.color}
            />

            {/* E. Player Stats Table */}
            <div>
              <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">선수 스탯</p>
              <StatsTable players={players} leagueId={leagueId} color={team.color} viewMode="avg" statMode="basic" />
            </div>
          </>
        )}
      </div>

      {quickView && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={quickView.id}
          playerName={quickView.name}
          onClose={() => setQuickView(null)}
        />
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function LeagueTeamsPage() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params

  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [selectedQId, setSelectedQId] = useState<string | 'all'>('all')
  const [teams, setTeams] = useState<Team[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [allStats, setAllStats] = useState<PlayerStat[]>([])
  const [leaders, setLeaders] = useState<Leader[]>([])
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [teamStatsApi, setTeamStatsApi] = useState<Record<string, PlayerStat[]>>({})
  const [statMode, setStatMode] = useState<StatMode>('basic')
  const [viewMode, setViewMode] = useState<'avg'|'total'>('avg')

  // 분기 + 팀 초기 로드
  useEffect(() => {
    Promise.all([
      fetch(`/api/leagues/${leagueId}/quarters`).then(r => r.json()),
      fetch(`/api/leagues/${leagueId}/teams`).then(r => r.json()),
    ]).then(([qs, ts]) => {
      setQuarters(qs ?? [])
      setTeams(ts ?? [])
      const cur = (qs ?? []).find((q: Quarter) => q.is_current) ?? (qs ?? []).at(-1)
      // Default: current quarter if exists, otherwise 'all'
      if (cur) setSelectedQId(cur.id)
      else { setSelectedQId('all'); setLoading(false) }
    }).catch(() => setLoading(false))
  }, [leagueId])

  // 분기별 데이터 로드
  useEffect(() => {
    if (!selectedQId) return
    setDataLoading(true)

    if (selectedQId === 'all') {
      Promise.all([
        fetch(`/api/leagues/${leagueId}/games?complete=true`).then(r => r.json()),
        fetch(`/api/leagues/${leagueId}/stats`).then(r => r.json()),
      ]).then(async ([gs, st]) => {
        setGames(gs ?? [])
        setAllStats(st.players ?? [])

        if (quarters.length > 0) {
          const allLeaderResults = await Promise.all(quarters.map(q =>
            fetch(`/api/leagues/${leagueId}/quarters/${q.id}/leaders`).then(r => r.json())
          ))
          const leaderTeamMap: Record<string, Leader> = {}
          for (const ldResult of allLeaderResults) {
            for (const l of (ldResult ?? []) as Leader[]) {
              if (l.leader_player_id) leaderTeamMap[l.team_id] = l
            }
          }
          setLeaders(Object.values(leaderTeamMap))
        } else {
          setLeaders([])
        }

        setLoading(false)
        setDataLoading(false)
      }).catch(() => { setLoading(false); setDataLoading(false) })
    } else {
      Promise.all([
        fetch(`/api/leagues/${leagueId}/games?quarterId=${selectedQId}&complete=true`).then(r => r.json()),
        fetch(`/api/leagues/${leagueId}/stats?quarterId=${selectedQId}`).then(r => r.json()),
        fetch(`/api/leagues/${leagueId}/quarters/${selectedQId}/leaders`).then(r => r.json()),
      ]).then(([gs, st, ld]) => {
        setGames(gs ?? [])
        setAllStats(st.players ?? [])
        setLeaders(ld ?? [])
        setLoading(false)
        setDataLoading(false)
      }).catch(() => { setLoading(false); setDataLoading(false) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, selectedQId])

  // 팀별 스탯 병렬 페치 — 각 팀에서 실제로 뛴 선수만 (team_id 이벤트 기준)
  useEffect(() => {
    if (!selectedQId || teams.length === 0) { setTeamStatsApi({}); return }
    let cancelled = false
    const qParam = selectedQId === 'all' ? '' : `&quarterId=${selectedQId}`
    Promise.all(teams.map(t =>
      fetch(`/api/leagues/${leagueId}/stats?teamId=${t.id}${qParam}`)
        .then(r => r.json())
        .then(d => [t.id, (d.players ?? []) as PlayerStat[]] as const)
        .catch(() => [t.id, [] as PlayerStat[]] as const)
    )).then(results => {
      if (cancelled) return
      const m: Record<string, PlayerStat[]> = {}
      for (const [tid, players] of results) m[tid] = players
      setTeamStatsApi(m)
    })
    return () => { cancelled = true }
  }, [leagueId, selectedQId, teams])

  // ── 데이터 가공 ───────────────────────────────────────────
  const teamMap = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t])), [teams])
  const leaderMap = useMemo(() => Object.fromEntries(leaders.map(l => [l.team_id, l.leader_player_id])), [leaders])

  const standings = useMemo(() => {
    const st: Record<string, { w: number; d: number; l: number; gf: number; ga: number; teamId: string }> = {}
    for (const t of teams) st[t.id] = { w: 0, d: 0, l: 0, gf: 0, ga: 0, teamId: t.id }
    for (const g of games) {
      if (!g.home_team_id || !g.away_team_id) continue
      const h = st[g.home_team_id]; const a = st[g.away_team_id]
      if (!h || !a) continue
      h.gf += g.home_score; h.ga += g.away_score
      a.gf += g.away_score; a.ga += g.home_score
      if (g.home_score > g.away_score) { h.w++; a.l++ }
      else if (g.home_score < g.away_score) { a.w++; h.l++ }
      else { h.d++; a.d++ }
    }
    return Object.values(st)
      .sort((a, b) => {
        const aPts = a.w * 3 + a.d; const bPts = b.w * 3 + b.d
        if (bPts !== aPts) return bPts - aPts
        return (b.gf - b.ga) - (a.gf - a.ga)
      })
  }, [teams, games])

  const h2h = useMemo(() => {
    const m: Record<string, Record<string, { w: number; d: number; l: number }>> = {}
    for (const t of teams) { m[t.id] = {}; for (const t2 of teams) if (t.id !== t2.id) m[t.id][t2.id] = { w: 0, d: 0, l: 0 } }
    for (const g of games) {
      const h = g.home_team_id; const a = g.away_team_id
      if (!h || !a || !m[h] || !m[a]) continue
      if (g.home_score > g.away_score) { m[h][a].w++; m[a][h].l++ }
      else if (g.home_score < g.away_score) { m[a][h].w++; m[h][a].l++ }
      else { m[h][a].d++; m[a][h].d++ }
    }
    return m
  }, [teams, games])

  // 팀별 선수 스탯: API에서 team_id 이벤트 기준으로 분할된 데이터를 그대로 사용
  // → 같은 선수가 여러 팀에서 뛰었으면 각 팀에 그 팀에서의 스탯만 표시됨
  const teamStats = useMemo(() => {
    const m: Record<string, PlayerStat[]> = {}
    for (const t of teams) m[t.id] = teamStatsApi[t.id] ?? []
    return m
  }, [teams, teamStatsApi])

  // 비정규 섹션 — 어떤 팀에도 team_id로 귀속되지 않은 선수 (이벤트의 team_id가 모두 null)
  const irregularStats = useMemo(() => {
    const teamPlayerIds = new Set<string>()
    for (const tid of Object.keys(teamStatsApi)) {
      for (const p of teamStatsApi[tid]) teamPlayerIds.add(p.player_id)
    }
    return allStats.filter(s => !teamPlayerIds.has(s.player_id))
  }, [allStats, teamStatsApi])

  const rosterHref = `/league/${orgSlug}/${leagueId}/roster`

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-500" /></div>

  if (quarters.length === 0) return (
    <div className="text-center py-16 text-gray-500">
      <p className="text-sm">등록된 분기가 없습니다</p>
      <Link href={rosterHref} className="inline-block mt-3 text-xs text-blue-400 hover:underline">→ 선수단 탭으로 이동</Link>
    </div>
  )

  const totalPlayed = standings.reduce((s, t) => s + t.w + t.d + t.l, 0) / 2

  return (
    <div className="space-y-6">
      {/* ── 분기 버튼 탭 ── */}
      <div>
        <h2 className="text-xl font-bold text-white mb-3">팀 구성</h2>
        <div className="flex flex-wrap gap-2">
          {/* 전체 버튼 */}
          <button
            onClick={() => setSelectedQId('all')}
            className={`px-4 py-1.5 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
              selectedQId === 'all'
                ? 'bg-blue-600 border-blue-500 text-white shadow-lg'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
            }`}
          >
            전체
          </button>
          {quarters.map(q => (
            <button key={q.id} onClick={() => setSelectedQId(q.id)}
              className={`px-4 py-1.5 rounded-xl text-sm font-bold border transition-all cursor-pointer ${
                selectedQId === q.id
                  ? 'bg-blue-600 border-blue-500 text-white shadow-lg'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white'
              }`}>
              {String(q.year).slice(2)}.{q.quarter}Q
              {q.is_current && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}
            </button>
          ))}
        </div>
      </div>

      {dataLoading ? (
        <div className="flex justify-center py-12"><Loader2 size={20} className="animate-spin text-gray-500" /></div>
      ) : (
        <>
        {/* ── 섹션 1: 팀별 전적 + 상대 전적 ── */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">팀 전적</h3>

          {/* 팀 카드 그리드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {standings.map((s, idx) => {
              const t = teamMap[s.teamId]
              if (!t) return null
              const played = s.w + s.d + s.l
              const winPct = played > 0 ? (s.w / played * 100).toFixed(1) : '—'
              const isSelected = selectedTeamId === t.id
              return (
                <div
                  key={t.id}
                  className={`bg-gray-900 border rounded-2xl overflow-hidden transition-all ${
                    isSelected ? 'border-gray-600 ring-1' : 'border-gray-800'
                  }`}
                  style={{
                    borderTopColor: t.color,
                    borderTopWidth: 3,
                    ...(isSelected ? { ringColor: t.color } : {}),
                  }}
                >
                  {/* 팀 헤더 — 클릭하면 상세 패널 토글 */}
                  <button
                    className="w-full px-4 py-3 flex items-center justify-between border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors cursor-pointer"
                    onClick={() => setSelectedTeamId(prev => prev === t.id ? null : t.id)}
                    aria-expanded={isSelected}
                    aria-label={`${t.name} 상세 정보 ${isSelected ? '닫기' : '열기'}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-2xl font-black text-gray-500 font-mono w-8">{idx + 1}</span>
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                      <span className="font-black text-white text-base">{t.name}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black" style={{ color: t.color }}>{winPct}{played > 0 ? '%' : ''}</p>
                      <p className="text-xs text-gray-600">{s.w}승 {s.d > 0 ? `${s.d}무 ` : ''}{s.l}패 · {played}경기</p>
                      {played > 0 && (
                        <div className="flex h-1 rounded-full overflow-hidden w-16 mt-1 ml-auto">
                          <div className="h-full" style={{ width: `${s.w/played*100}%`, backgroundColor: t.color }} />
                          {s.d > 0 && <div className="h-full bg-yellow-500/60" style={{ width: `${s.d/played*100}%` }} />}
                          <div className="h-full bg-gray-700 flex-1" />
                        </div>
                      )}
                    </div>
                  </button>
                  {/* 상대 전적 */}
                  <div className="px-4 py-3">
                    <p className="text-xs text-gray-500 uppercase font-bold mb-2">상대 전적</p>
                    {teams.filter(op => op.id !== t.id).map(op => {
                      const rec = h2h[t.id]?.[op.id] ?? { w: 0, d: 0, l: 0 }
                      const total = rec.w + rec.d + rec.l
                      return (
                        <div key={op.id} className={`flex items-center justify-between px-2 py-1 rounded-lg border mb-1 ${
                          rec.w > rec.l ? 'bg-green-900/20 border-green-800/30' :
                          rec.w < rec.l ? 'bg-red-900/20 border-red-800/30' :
                          'bg-gray-800/30 border-gray-700/20'
                        }`}>
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: op.color }} />
                            <span className="text-xs text-gray-300">vs {op.name}</span>
                          </div>
                          {total === 0 ? (
                            <span className="text-xs text-gray-600">기록 없음</span>
                          ) : (
                            <div className="flex items-center gap-1 text-xs font-black">
                              <span className={rec.w > rec.l ? 'text-green-400' : 'text-gray-400'}>{rec.w}W</span>
                              {rec.d > 0 && <><span className="text-gray-600">·</span><span className="text-yellow-500">{rec.d}D</span></>}
                              <span className="text-gray-600">·</span>
                              <span className={rec.l > rec.w ? 'text-red-400' : 'text-gray-400'}>{rec.l}L</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {totalPlayed === 0 && <p className="text-xs text-gray-500 py-1">완료된 경기 없음</p>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 선택된 팀 상세 패널 (그리드 아래에 full-width) */}
          {selectedTeamId && teamMap[selectedTeamId] && (() => {
            const selStanding = standings.find(s => s.teamId === selectedTeamId)
            if (!selStanding) return null
            return (
              <div className="relative">
                <button
                  className="absolute top-3 right-3 z-10 w-11 h-11 flex items-center justify-center rounded-full bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer"
                  onClick={() => setSelectedTeamId(null)}
                  aria-label="패널 닫기"
                >
                  <X size={14} />
                </button>
                <TeamDetailPanel
                  teamId={selectedTeamId}
                  team={teamMap[selectedTeamId]}
                  standing={selStanding}
                  h2h={h2h[selectedTeamId] ?? {}}
                  players={teamStats[selectedTeamId] ?? []}
                  allTeams={teams}
                  leagueId={leagueId}
                  games={games}
                  quarterId={selectedQId}
                />
              </div>
            )
          })()}
        </div>

        {/* ── 섹션 2: 팀별 선수 스탯 ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">팀별 선수 스탯</h3>
              <p className="text-[11px] text-gray-600 mt-0.5">이 팀에서 뛴 경기 기준 (정규/비정규 무관) · 한 선수가 여러 팀에서 뛰었다면 각 팀에 분리 표시</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Basic / Shooting / Advanced */}
              <div className="flex rounded-lg overflow-hidden border border-gray-700 shrink-0">
                {([
                  { k: 'basic'    as StatMode, label: 'Basic' },
                  { k: 'shooting' as StatMode, label: 'Shooting' },
                  { k: 'advanced' as StatMode, label: 'Advanced' },
                ]).map(({ k, label }) => (
                  <button key={k} onClick={() => setStatMode(k)}
                    className={`px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors min-h-[36px] ${
                      statMode === k ? 'bg-violet-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
              {/* 평균 / 누적 (Basic 모드에서만 의미) */}
              <div className={`flex rounded-lg overflow-hidden border border-gray-700 shrink-0 ${statMode !== 'basic' ? 'opacity-40 pointer-events-none' : ''}`}>
                {(['avg','total'] as const).map(m => (
                  <button key={m} onClick={() => setViewMode(m)}
                    className={`px-3 py-1.5 text-xs font-bold cursor-pointer transition-colors min-h-[36px] ${
                      viewMode === m ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}>
                    {m === 'avg' ? '평균' : '누적'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {standings.map(s => {
            const t = teamMap[s.teamId]
            if (!t) return null
            const players = teamStats[t.id] ?? []
            const leaderId = leaderMap[t.id] ?? null
            return (
              <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden"
                style={{ borderTopColor: t.color, borderTopWidth: 3 }}>
                <div className="px-4 py-3 flex items-center gap-2 border-b border-gray-800/60">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="font-bold text-white">{t.name}</span>
                  <span className="text-xs text-gray-600 ml-auto">{players.length}명</span>
                </div>
                <div className="px-4 py-3">
                  <StatsTable
                    players={players}
                    leagueId={leagueId}
                    leaderId={leaderId}
                    color={t.color}
                    viewMode={viewMode}
                    statMode={statMode}
                  />
                </div>
              </div>
            )
          })}
        </div>

        {/* ── 섹션 3: 비정규 선수 스탯 ── */}
        {irregularStats.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest">비정규 선수</h3>
            <p className="text-[11px] text-gray-600">팀 배정 없이 게임에 참가한 선수 (이벤트의 team_id가 모두 비어있음)</p>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800/60 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-400">비정규 참가자</span>
                <span className="text-xs text-gray-600">{irregularStats.length}명</span>
              </div>
              <div className="px-4 py-3">
                <StatsTable
                  players={irregularStats}
                  leagueId={leagueId}
                  viewMode={viewMode}
                  statMode={statMode}
                />
              </div>
            </div>
          </div>
        )}
        </>
      )}
    </div>
  )
}
