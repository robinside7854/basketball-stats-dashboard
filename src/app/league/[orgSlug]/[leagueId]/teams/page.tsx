'use client'
import LeagueGroupTabs from '@/components/league/LeagueGroupTabs'
import { getStatsGroupTabs } from '@/components/league/statsTabs'
import { useState, useEffect, useMemo, useRef } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { Crown, ChevronUp, ChevronDown, ChevronsUpDown, X, Users } from 'lucide-react'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import Link from 'next/link'
import TeamInsights from '@/components/league/TeamInsights'
import SectionCard from '@/components/league/ui/SectionCard'
import { textOnBg, accentOrInk } from '@/lib/util/contrastColor'

const PlayerQuickViewModal = dynamic(() => import('@/components/league/PlayerQuickViewModal'), { ssr: false })
import { PercentBar } from '@/components/league/StatCell'
import StatHeader from '@/components/league/StatHeader'
import StatsReadingGuide from '@/components/league/stats/StatsReadingGuide'
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
const SHOOTING_COLS: { key: ShootingKey; label: string; desc: string; barColor: string }[] = [
  { key: 'fg_pct',      label: 'FG%',   desc: '전체 야투 성공률 · FGM/FGA',                        barColor: '#34d399' },
  { key: 'fg2_pct',     label: '2P%',   desc: '2점 야투 성공률 · (FGM-3PM)/(FGA-3PA)',             barColor: '#fb923c' },
  { key: 'fg3_pct',     label: '3P%',   desc: '3점 야투 성공률 · 3PM/3PA',                          barColor: '#eab308' },
  { key: 'efg_pct',     label: 'eFG%',  desc: '유효야투율 · (FGM+0.5×3PM)/FGA',                     barColor: '#14b8a6' },
  { key: 'ft_pct',      label: 'FT%',   desc: '자유투 성공률 · FTM/FTA',                            barColor: '#06b6d4' },
  { key: 'ts_pct',      label: 'TS%',   desc: '진실야투율 · PTS/(2×(FGA+0.44×FTA))',                barColor: '#2dd4bf' },
  { key: 'ft_rate',     label: 'FTr',   desc: '야투 대비 자유투 시도 · FTA/FGA',                     barColor: '#0891b2' },
  { key: 'ds_pct',      label: 'DS',    desc: '골밑슛 비중 · 골밑슛시도/전체야투시도',                barColor: '#ef4444' },
  { key: 'lu_pct',      label: 'LU',    desc: '레이업 비중 · 레이업 시도/전체야투시도',   barColor: '#f97316' },
  { key: 'md_pct',      label: 'MD',    desc: '미드레인지 비중 · 미들시도/전체야투시도',             barColor: '#eab308' },
  { key: 'three_share', label: '3P',    desc: '3점 비중 · 3PA/FGA',                                 barColor: '#3b82f6' },
]

const BASIC_PCT_KEYS = new Set<BasicKey>(['fg_pct', 'fg3_pct', 'ft_pct', 'efg_pct'])
const BASIC_INT_KEYS = new Set<BasicKey>(['gp','pts','reb','oreb','dreb','ast','stl','blk','tov','fgm','fg3m','ftm'])

// 기본 색상 (셀) — mm-* 팔레트에 맞춰 라이트/다크 자동 대응
const BASIC_COLOR: Partial<Record<BasicKey, string>> = {
  gp: 'text-[color:var(--mm-muted)]',
  ppg: 'font-black text-[color:var(--mm-ink)]', pts: 'font-black text-[color:var(--mm-ink)]',
  rpg: 'text-[color:var(--mm-ink-soft)]', reb: 'text-[color:var(--mm-ink-soft)]',
  orp: 'text-[color:var(--mm-muted)]', oreb: 'text-[color:var(--mm-muted)]',
  drp: 'text-[color:var(--mm-muted)]', dreb: 'text-[color:var(--mm-muted)]',
  apg: 'text-[color:var(--mm-ink-soft)]', ast: 'text-[color:var(--mm-ink-soft)]',
  spg: 'text-purple-600', stl: 'text-purple-600',
  bpg: 'text-indigo-600', blk: 'text-indigo-600',
  topg: 'text-red-600', tov: 'text-red-600',
  fg_pct: 'text-[color:var(--mm-muted)]', fg3_pct: 'text-[color:var(--mm-yellow-strong)]',
  ft_pct: 'text-cyan-700', efg_pct: 'text-teal-700',
  fgm: 'text-[color:var(--mm-muted)]', fg3m: 'text-[color:var(--mm-muted)]', ftm: 'text-[color:var(--mm-muted)]',
}
const ADV_COLOR: Partial<Record<AdvKey, string>> = {
  at_ratio: 'text-blue-600',
  ast_pct: 'text-purple-600', tov_pct: 'text-red-600',
  a1_total: 'text-orange-600', a1_rate: 'text-amber-700',
  orb_pct: 'text-amber-700', drb_pct: 'text-emerald-600', trb_pct: 'text-violet-600',
}
const SHOOT_COLOR: Partial<Record<ShootingKey, string>> = {
  fg_pct: 'text-[color:var(--mm-ink-soft)]', fg2_pct: 'text-orange-600', fg3_pct: 'text-[color:var(--mm-yellow-strong)]',
  efg_pct: 'text-teal-700', ft_pct: 'text-cyan-700', ts_pct: 'text-teal-600',
  ft_rate: 'text-cyan-700',
  ds_pct: 'text-red-600', lu_pct: 'text-orange-600', md_pct: 'text-[color:var(--mm-yellow-strong)]', three_share: 'text-blue-600',
}

function SortIcon({ active, dir }: { active: boolean; dir: 'asc'|'desc' }) {
  if (!active) return <ChevronsUpDown size={9} className="inline ml-0.5 opacity-30" />
  return dir === 'desc'
    ? <ChevronDown size={9} className="inline ml-0.5" style={{ color: 'var(--mm-ink)' }} />
    : <ChevronUp   size={9} className="inline ml-0.5" style={{ color: 'var(--mm-ink)' }} />
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
    return <p className="text-xs py-4 text-center" style={{ color: 'var(--mm-muted)' }}>기록된 스탯이 없습니다</p>
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
            basicCols.map(({ key, label }) => {
              const active = basicSortKey === key
              return (
                <button key={key} onClick={() => handleBasicSort(key)}
                  className="px-2.5 py-1 text-xs font-black uppercase tracking-wider transition-colors shrink-0 cursor-pointer"
                  style={{
                    background: active ? 'var(--mm-ink)' : 'var(--mm-panel)',
                    color: active ? 'var(--mm-panel)' : 'var(--mm-muted)',
                    border: '1px solid var(--mm-rule)',
                  }}>
                  {label}{active && (basicSortDir === 'desc' ? ' ↓' : ' ↑')}
                </button>
              )
            })
          ) : statMode === 'shooting' ? (
            SHOOTING_COLS.map(({ key, label }) => {
              const active = shootSortKey === key
              return (
                <button key={key} onClick={() => handleShootSort(key)}
                  className="px-2.5 py-1 text-xs font-black uppercase tracking-wider transition-colors shrink-0 cursor-pointer"
                  style={{
                    background: active ? 'var(--mm-ink)' : 'var(--mm-panel)',
                    color: active ? 'var(--mm-panel)' : 'var(--mm-muted)',
                    border: '1px solid var(--mm-rule)',
                  }}>
                  {label}{active && (shootSortDir === 'desc' ? ' ↓' : ' ↑')}
                </button>
              )
            })
          ) : (
            ADV_COLS.map(({ key, label }) => {
              const active = advSortKey === key
              return (
                <button key={key} onClick={() => handleAdvSort(key)}
                  className="px-2.5 py-1 text-xs font-black uppercase tracking-wider transition-colors shrink-0 cursor-pointer"
                  style={{
                    background: active ? 'var(--mm-ink)' : 'var(--mm-panel)',
                    color: active ? 'var(--mm-panel)' : 'var(--mm-muted)',
                    border: '1px solid var(--mm-rule)',
                  }}>
                  {label}{active && (advSortDir === 'desc' ? ' ↓' : ' ↑')}
                </button>
              )
            })
          )}
        </div>
      </div>
      <div className="overflow-hidden" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}>
        {statMode === 'basic' ? (
          basicSorted.map((p, i) => {
            const isLeader = leaderId && p.player_id === leaderId
            const sortLabel = basicCols.find(c => c.key === basicSortKey)?.label ?? ''
            const subKeys = basicCols.map(c => c.key).filter(k => k !== basicSortKey).slice(0, 4)
            const openPlayer = () => setQuickView({ id: p.player_id, name: p.name })
            return (
              // StatHelpTooltip 이 카드 안에 버튼으로 들어가므로 카드 자체는 role="button" div
              // (버튼 안 버튼은 invalid HTML — 클릭 이벤트가 깨짐). 키보드 동작은 그대로 유지.
              <div key={p.player_id} role="button" tabIndex={0}
                onClick={openPlayer}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPlayer() } }}
                className="w-full text-left px-3 py-2.5 cursor-pointer transition-colors hover:bg-[color:var(--mm-yellow-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-inset"
                style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-jersey font-black tabular-nums w-5 shrink-0" style={{ color: 'var(--mm-muted)', fontSize: '18px' }}>{i + 1}</span>
                  {isLeader && <Crown size={11} className="shrink-0" style={{ color: 'var(--mm-ink-soft)' }} />}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-base break-keep" style={{ color: 'var(--mm-ink)', wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>
                      {p.name}
                      {p.number != null && <span className="font-mono ml-1 text-xs" style={{ color: 'var(--mm-muted)' }}>#{p.number}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-jersey font-black tabular-nums leading-none" style={{ color: color ?? 'var(--mm-ink)', fontSize: '26px' }}>{basicVal(p, basicSortKey)}</div>
                    <div className="text-xs font-bold uppercase tracking-wider mt-0.5 flex items-center justify-end" style={{ color: 'var(--mm-muted)' }}>
                      <StatHeader term={basicSortKey === 'gp' ? 'R' : sortLabel} label={sortLabel} helpSize={10} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5 pt-1.5" style={{ borderTop: '1px dashed var(--mm-rule)' }}>
                  {subKeys.map(k => {
                    const lbl = basicCols.find(c => c.key === k)?.label ?? k
                    return (
                      <div key={k} className="text-center">
                        <div className="text-xs font-bold uppercase tracking-wider flex items-center justify-center" style={{ color: 'var(--mm-muted)' }}>
                          <StatHeader term={k === 'gp' ? 'R' : lbl} label={lbl} helpSize={9} />
                        </div>
                        <div className="text-xs font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>{basicVal(p, k)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        ) : statMode === 'shooting' ? (
          shootSorted.map(({ p, sh }, i) => {
            const isLeader = leaderId && p.player_id === leaderId
            const sortLabel = SHOOTING_COLS.find(c => c.key === shootSortKey)?.label ?? ''
            const subKeys = SHOOTING_COLS.map(c => c.key).filter(k => k !== shootSortKey).slice(0, 4)
            const openPlayer = () => setQuickView({ id: p.player_id, name: p.name })
            return (
              <div key={p.player_id} role="button" tabIndex={0}
                onClick={openPlayer}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPlayer() } }}
                className="w-full text-left px-3 py-2.5 cursor-pointer transition-colors hover:bg-[color:var(--mm-yellow-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-inset"
                style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-jersey font-black tabular-nums w-5 shrink-0" style={{ color: 'var(--mm-muted)', fontSize: '18px' }}>{i + 1}</span>
                  {isLeader && <Crown size={11} className="shrink-0" style={{ color: 'var(--mm-ink-soft)' }} />}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-base break-keep" style={{ color: 'var(--mm-ink)', wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>
                      {p.name}
                      {p.number != null && <span className="font-mono ml-1 text-xs" style={{ color: 'var(--mm-muted)' }}>#{p.number}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-jersey font-black tabular-nums leading-none" style={{ color: color ?? 'var(--mm-ink)', fontSize: '26px' }}>{shootVal(sh, shootSortKey)}</div>
                    <div className="text-xs font-bold uppercase tracking-wider mt-0.5 flex items-center justify-end" style={{ color: 'var(--mm-muted)' }}>
                      <StatHeader term={sortLabel} label={sortLabel} helpSize={10} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5 pt-1.5" style={{ borderTop: '1px dashed var(--mm-rule)' }}>
                  {subKeys.map(k => {
                    const lbl = SHOOTING_COLS.find(c => c.key === k)?.label ?? k
                    return (
                      <div key={k} className="text-center">
                        <div className="text-xs font-bold uppercase tracking-wider flex items-center justify-center" style={{ color: 'var(--mm-muted)' }}>
                          <StatHeader term={lbl} label={lbl} helpSize={9} />
                        </div>
                        <div className="text-xs font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>{shootVal(sh, k)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        ) : (
          advSorted.map(({ p, adv }, i) => {
            const isLeader = leaderId && p.player_id === leaderId
            const sortLabel = ADV_COLS.find(c => c.key === advSortKey)?.label ?? ''
            const subKeys = ADV_COLS.map(c => c.key).filter(k => k !== advSortKey).slice(0, 4)
            const openPlayer = () => setQuickView({ id: p.player_id, name: p.name })
            return (
              <div key={p.player_id} role="button" tabIndex={0}
                onClick={openPlayer}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPlayer() } }}
                className="w-full text-left px-3 py-2.5 cursor-pointer transition-colors hover:bg-[color:var(--mm-yellow-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-inset"
                style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-jersey font-black tabular-nums w-5 shrink-0" style={{ color: 'var(--mm-muted)', fontSize: '18px' }}>{i + 1}</span>
                  {isLeader && <Crown size={11} className="shrink-0" style={{ color: 'var(--mm-ink-soft)' }} />}
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-base break-keep" style={{ color: 'var(--mm-ink)', wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>
                      {p.name}
                      {p.number != null && <span className="font-mono ml-1 text-xs" style={{ color: 'var(--mm-muted)' }}>#{p.number}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-jersey font-black tabular-nums leading-none" style={{ color: color ?? 'var(--mm-ink)', fontSize: '26px' }}>{advVal(adv, advSortKey)}</div>
                    <div className="text-xs font-bold uppercase tracking-wider mt-0.5 flex items-center justify-end" style={{ color: 'var(--mm-muted)' }}>
                      <StatHeader term={sortLabel} label={sortLabel} helpSize={10} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-1.5 pt-1.5" style={{ borderTop: '1px dashed var(--mm-rule)' }}>
                  {subKeys.map(k => {
                    const lbl = ADV_COLS.find(c => c.key === k)?.label ?? k
                    return (
                      <div key={k} className="text-center">
                        <div className="text-xs font-bold uppercase tracking-wider flex items-center justify-center" style={{ color: 'var(--mm-muted)' }}>
                          <StatHeader term={lbl} label={lbl} helpSize={9} />
                        </div>
                        <div className="text-xs font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>{advVal(adv, k)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>

    {/* 데스크탑 테이블 (md 이상) */}
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full text-xs whitespace-nowrap">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--mm-rule)' }}>
            <th className="text-left py-2 pr-3 text-xs font-black uppercase tracking-wider sticky left-0 min-w-[90px]" style={{ color: 'var(--mm-muted)', background: 'var(--mm-panel)' }}>선수</th>
            {statMode === 'basic' ? (
              basicCols.map(({ key, label }) => {
                const active = basicSortKey === key
                const term = key === 'gp' ? 'R' : label
                return (
                  <th key={key} onClick={() => handleBasicSort(key)}
                    className="py-2 px-1.5 text-xs font-black uppercase cursor-pointer select-none text-right transition-colors"
                    style={{ color: active ? 'var(--mm-ink)' : 'var(--mm-muted)' }}>
                    <StatHeader term={term} label={label} helpSize={10} />
                    <SortIcon active={active} dir={basicSortDir} />
                  </th>
                )
              })
            ) : statMode === 'shooting' ? (
              SHOOTING_COLS.map(({ key, label, desc }, idx) => {
                const active = shootSortKey === key
                const divider = idx === 7 ? { borderLeft: '1px solid var(--mm-rule)' } : {}
                return (
                  <th key={key} onClick={() => handleShootSort(key)} title={desc}
                    className="py-2 px-1.5 text-xs font-black uppercase cursor-pointer select-none text-right transition-colors"
                    style={{ color: active ? 'var(--mm-ink)' : 'var(--mm-muted)', ...divider }}>
                    <StatHeader term={label} label={label} helpSize={10} />
                    <SortIcon active={active} dir={shootSortDir} />
                  </th>
                )
              })
            ) : (
              ADV_COLS.map(({ key, label, desc }) => {
                const active = advSortKey === key
                return (
                  <th key={key} onClick={() => handleAdvSort(key)} title={desc}
                    className="py-2 px-1.5 text-xs font-black uppercase cursor-pointer select-none text-right transition-colors"
                    style={{ color: active ? 'var(--mm-ink)' : 'var(--mm-muted)' }}>
                    <StatHeader term={label} label={label} helpSize={10} />
                    <SortIcon active={active} dir={advSortDir} />
                  </th>
                )
              })
            )}
          </tr>
        </thead>
        <tbody>
          {statMode === 'basic' ? (
            basicSorted.map(p => {
              const isLeader = leaderId && p.player_id === leaderId
              return (
                <tr key={p.player_id} className="transition-colors hover:bg-[color:var(--mm-yellow-soft)]" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                  <td className="py-2 pr-3 sticky left-0" style={{ background: 'var(--mm-panel)' }}>
                    <button onClick={() => setQuickView({ id: p.player_id, name: p.name })}
                      className="flex items-center gap-1.5 cursor-pointer transition-colors text-left hover:underline decoration-[color:var(--color-hoop-orange-500)] underline-offset-4">
                      {isLeader && <Crown size={10} className="shrink-0" style={{ color: 'var(--mm-ink-soft)' }} />}
                      <span className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: '14px', letterSpacing: '-0.005em' }}>
                        {p.number != null && <span className="font-mono mr-1 text-xs" style={{ color: 'var(--mm-muted)' }}>#{p.number}</span>}
                        {p.name}
                      </span>
                    </button>
                  </td>
                  {basicCols.map(({ key }) => {
                    const isSortLeader = key === basicSortKey
                    const baseClass = BASIC_COLOR[key] ?? 'text-[color:var(--mm-ink-soft)]'
                    const style = isSortLeader && color ? { color, fontWeight: 900 } : undefined
                    return (
                      <td key={key} className={`py-2 px-1.5 text-right tabular-nums ${baseClass}`} style={style}>
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
                <tr key={p.player_id} className="transition-colors hover:bg-[color:var(--mm-yellow-soft)]" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                  <td className="py-2 pr-3 sticky left-0" style={{ background: 'var(--mm-panel)' }}>
                    <button onClick={() => setQuickView({ id: p.player_id, name: p.name })}
                      className="flex items-center gap-1.5 cursor-pointer transition-colors text-left hover:underline decoration-[color:var(--color-hoop-orange-500)] underline-offset-4">
                      {isLeader && <Crown size={10} className="shrink-0" style={{ color: 'var(--mm-ink-soft)' }} />}
                      <span className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: '14px', letterSpacing: '-0.005em' }}>
                        {p.number != null && <span className="font-mono mr-1 text-xs" style={{ color: 'var(--mm-muted)' }}>#{p.number}</span>}
                        {p.name}
                      </span>
                    </button>
                  </td>
                  {SHOOTING_COLS.map(({ key, barColor }, idx) => {
                    const isSortLeader = key === shootSortKey
                    const baseClass = SHOOT_COLOR[key] ?? 'text-[color:var(--mm-ink-soft)]'
                    const dividerStyle = idx === 7 ? { borderLeft: '1px solid var(--mm-rule)' } : {}
                    const style = isSortLeader && color ? { color, ...dividerStyle } : dividerStyle
                    const barMax = key === 'ft_rate' ? 80 : 100
                    return (
                      <td key={key} className={`relative py-2 px-1.5 text-right tabular-nums font-bold ${baseClass}`} style={style}>
                        {shootVal(sh, key)}
                        <PercentBar value={sh[key]} max={barMax} color={barColor} />
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
                <tr key={p.player_id} className="transition-colors hover:bg-[color:var(--mm-yellow-soft)]" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                  <td className="py-2 pr-3 sticky left-0" style={{ background: 'var(--mm-panel)' }}>
                    <button onClick={() => setQuickView({ id: p.player_id, name: p.name })}
                      className="flex items-center gap-1.5 cursor-pointer transition-colors text-left hover:underline decoration-[color:var(--color-hoop-orange-500)] underline-offset-4">
                      {isLeader && <Crown size={10} className="shrink-0" style={{ color: 'var(--mm-ink-soft)' }} />}
                      <span className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: '14px', letterSpacing: '-0.005em' }}>
                        {p.number != null && <span className="font-mono mr-1 text-xs" style={{ color: 'var(--mm-muted)' }}>#{p.number}</span>}
                        {p.name}
                      </span>
                    </button>
                  </td>
                  {ADV_COLS.map(({ key }) => {
                    const isSortLeader = key === advSortKey
                    const baseClass = ADV_COLOR[key] ?? 'text-[color:var(--mm-ink-soft)]'
                    const style = isSortLeader && color ? { color, fontWeight: 900 } : undefined
                    return (
                      <td key={key} className={`py-2 px-1.5 text-right tabular-nums ${baseClass}`} style={style}>
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
    <SectionCard variant="standalone" className="mt-3 relative">
      {/* 팀 컬러 좌측 accent bar */}
      <div className="absolute top-0 left-0 bottom-0 w-1" style={{ background: team.color }} aria-hidden />
      {/* Header */}
      <div className="px-6 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
        <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
        <span className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: '24px', letterSpacing: '-0.005em' }}>{team.name}</span>
        <span className="text-sm font-bold" style={{ color: 'var(--mm-muted)' }}>{standing.w}승 {standing.d > 0 ? `${standing.d}무 ` : ''}{standing.l}패</span>
      </div>

      <div className="p-6 space-y-6">
        {players.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--mm-muted)' }}>팀 없음 — 스탯이 없습니다</p>
        ) : (
          <>
            {/* B. 팀 스탯 Grid */}
            {computed && (
              <div>
                <p className="text-xs font-black uppercase tracking-[0.20em] mb-3" style={{ color: 'var(--mm-ink-soft)' }}>팀 스탯</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                  {[
                    { label: '팀 평균득점', value: avgPf.toFixed(1), sub: '경기당 득점', color: team.color },
                    { label: '팀 평균실점', value: avgPa.toFixed(1), sub: '경기당 허용', color: 'var(--mm-negative)' },
                    { label: '득실차', value: (ptsDiff >= 0 ? '+' : '') + ptsDiff.toFixed(0), sub: `총 ${ptsDiff >= 0 ? '양수' : '음수'}`, color: ptsDiff >= 0 ? 'var(--mm-positive)' : 'var(--mm-negative)' },
                    { label: '팀 FG%', value: `${computed.fgPct.toFixed(1)}%`, sub: '야투율', color: 'var(--mm-positive)' },
                    { label: '팀 eFG%', value: `${computed.efgPct.toFixed(1)}%`, sub: '유효 야투율', color: '#0F766E' },
                    { label: 'STL+BLK/G', value: computed.defPg.toFixed(1), sub: '수비 이벤트', color: '#7C3AED' },
                  ].map(card => (
                    <div key={card.label} className="p-3 text-center" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}>
                      <div className="font-jersey font-black tabular-nums leading-none" style={{ color: card.color, fontSize: '30px' }}>{card.value}</div>
                      <div className="text-xs font-black uppercase mt-2 tracking-wider" style={{ color: 'var(--mm-ink)' }}>{card.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>{card.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* C. Top Performers */}
            {computed && (
              <div>
                <p className="text-xs font-black uppercase tracking-[0.20em] mb-3" style={{ color: 'var(--mm-ink-soft)' }}>팀 내 1위</p>
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
                      className="shrink-0 px-3.5 py-2.5 text-left transition-colors cursor-pointer hover:bg-[color:var(--mm-yellow-soft)]"
                      style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
                    >
                      <div className="text-xs font-black uppercase tracking-wider mb-1" style={{ color: 'var(--mm-muted)' }}>{item.label}</div>
                      <div className="font-bold whitespace-nowrap" style={{ color: 'var(--mm-ink)', fontSize: '16px' }}>{item.player?.name}</div>
                      <div className="text-xs font-black tabular-nums whitespace-nowrap mt-0.5" style={{ color: team.color }}>{item.val}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* D. 재미있는 팀 통계 */}
            {computed && (
              <div>
                <p className="text-xs font-black uppercase tracking-[0.20em] mb-3" style={{ color: 'var(--mm-ink-soft)' }}>팀 특성</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {[
                    {
                      title: '에이스 의존도',
                      value: `${computed.acePct.toFixed(0)}%`,
                      desc: `에이스 비중 ${computed.acePct.toFixed(0)}%`,
                      color: computed.acePct > 40 ? 'var(--mm-negative)' : computed.acePct > 30 ? 'var(--mm-neutral-strong)' : 'var(--mm-positive)',
                    },
                    {
                      title: '외곽 스타일',
                      value: `${computed.threePct.toFixed(0)}%`,
                      desc: `3점 시도 비율`,
                      color: computed.threePct > 35 ? 'var(--mm-neutral-strong)' : '#2563EB',
                    },
                    {
                      title: '수비 강도',
                      value: computed.defPg.toFixed(1),
                      desc: `게임당 수비 이벤트`,
                      color: computed.defPg > 5 ? 'var(--mm-positive)' : computed.defPg > 3 ? 'var(--mm-neutral-strong)' : 'var(--mm-muted)',
                    },
                    {
                      title: '자유투 성공률',
                      value: `${computed.ftPct.toFixed(1)}%`,
                      desc: `팀 클러치 지표`,
                      color: computed.ftPct > 75 ? 'var(--mm-positive)' : computed.ftPct > 60 ? 'var(--mm-neutral-strong)' : 'var(--mm-negative)',
                    },
                  ].map(tile => (
                    <div key={tile.title} className="p-3" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}>
                      <div className="font-jersey font-black tabular-nums leading-none" style={{ color: tile.color, fontSize: '26px' }}>{tile.value}</div>
                      <div className="text-xs font-black uppercase tracking-wider mt-2" style={{ color: 'var(--mm-ink)' }}>{tile.title}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>{tile.desc}</div>
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
              <p className="text-xs font-black uppercase tracking-[0.20em] mb-3" style={{ color: 'var(--mm-ink-soft)' }}>선수 스탯</p>
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
    </SectionCard>
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
  // teamStatsApi 는 이제 identity.key 기준 (기존 team_id 대신)
  const [teamStatsApi, setTeamStatsApi] = useState<Record<string, PlayerStat[]>>({})
  // 분기 정규 명단 (team_id + is_regular=true)
  // — 아직 경기 없는 분기(예: Q3)에도 등록된 선수를 표시하기 위함
  type RosterRow = { id: string; name: string; number: number | null; position: string | null; team_id: string | null; is_regular: boolean | null }
  const [quarterRoster, setQuarterRoster] = useState<Record<string, RosterRow[]>>({})
  // 팀 정체성 그룹 (team_id × override 조합) — 전체 뷰에서 5팀 노출
  type TeamIdentity = {
    key: string
    team_id: string
    display_name: string
    color: string
    quarter_ids: string[]
    quarter_labels: string[]
    gp: number
    wins: number
    draws: number
    losses: number
    goals_for: number
    goals_against: number
    h2h: Record<string, { w: number; d: number; l: number }>
  }
  const [identities, setIdentities] = useState<TeamIdentity[]>([])
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
  // ⚠ race condition fix: 초기 마운트 시 selectedQId='all' 로 fetch 시작 후
  //    quarters 로드되면서 selectedQId=현재 분기로 바뀌면 새 fetch 시작.
  //    'all' 응답이 늦게 도착하면 최신 분기 데이터를 덮어써 시즌누적으로 보임.
  //    → cancelled 플래그로 stale 응답 무시.
  useEffect(() => {
    if (!selectedQId) return
    setDataLoading(true)
    let cancelled = false

    if (selectedQId === 'all') {
      Promise.all([
        fetch(`/api/leagues/${leagueId}/games?complete=true`).then(r => r.json()),
        fetch(`/api/leagues/${leagueId}/stats`).then(r => r.json()),
      ]).then(async ([gs, st]) => {
        if (cancelled) return
        setGames(gs ?? [])
        setAllStats(st.players ?? [])

        if (quarters.length > 0) {
          const allLeaderResults = await Promise.all(quarters.map(q =>
            fetch(`/api/leagues/${leagueId}/quarters/${q.id}/leaders`).then(r => r.json())
          ))
          if (cancelled) return
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
      }).catch(() => { if (!cancelled) { setLoading(false); setDataLoading(false) } })
    } else {
      Promise.all([
        fetch(`/api/leagues/${leagueId}/games?quarterId=${selectedQId}&complete=true`).then(r => r.json()),
        fetch(`/api/leagues/${leagueId}/stats?quarterId=${selectedQId}`).then(r => r.json()),
        fetch(`/api/leagues/${leagueId}/quarters/${selectedQId}/leaders`).then(r => r.json()),
      ]).then(([gs, st, ld]) => {
        if (cancelled) return
        setGames(gs ?? [])
        setAllStats(st.players ?? [])
        setLeaders(ld ?? [])
        setLoading(false)
        setDataLoading(false)
      }).catch(() => { if (!cancelled) { setLoading(false); setDataLoading(false) } })
    }
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, selectedQId])

  // 팀 정체성 페치 — 팀명 override 반영한 정체성 그룹
  useEffect(() => {
    if (!selectedQId) return
    let cancelled = false
    const url = selectedQId === 'all'
      ? `/api/leagues/${leagueId}/team-identities`
      : `/api/leagues/${leagueId}/team-identities?quarterId=${selectedQId}`
    fetch(url)
      .then(r => r.ok ? r.json() : { identities: [] })
      .then((d: { identities?: TeamIdentity[] }) => {
        if (cancelled) return
        setIdentities(d.identities ?? [])
      })
      .catch(() => null)
    return () => { cancelled = true }
  }, [leagueId, selectedQId])

  // 정체성별 팀 스탯 페치 — 각 정체성의 quarter_ids 기반 (다중 분기 지원)
  useEffect(() => {
    if (identities.length === 0) { setTeamStatsApi({}); return }
    let cancelled = false
    Promise.all(identities.map(id => {
      const qParam = id.quarter_ids.length > 0 ? `&quarterIds=${id.quarter_ids.join(',')}` : ''
      return fetch(`/api/leagues/${leagueId}/stats?teamId=${id.team_id}${qParam}`)
        .then(r => r.json())
        .then(d => [id.key, (d.players ?? []) as PlayerStat[]] as const)
        .catch(() => [id.key, [] as PlayerStat[]] as const)
    })).then(results => {
      if (cancelled) return
      const m: Record<string, PlayerStat[]> = {}
      for (const [key, players] of results) m[key] = players
      setTeamStatsApi(m)
    })
    return () => { cancelled = true }
  }, [leagueId, identities])

  // 분기별 팀명/색상 override 자동 반영 — selectedQId 변경 시 teams 재fetch
  useEffect(() => {
    if (!selectedQId || selectedQId === 'all') return
    fetch(`/api/leagues/${leagueId}/teams?quarterId=${selectedQId}`)
      .then(r => r.ok ? r.json() : null)
      .then(ts => { if (Array.isArray(ts)) setTeams(ts) })
      .catch(() => null)
  }, [leagueId, selectedQId])

  // 분기 정규 명단 페치 — 특정 분기 선택 시 (스탯 없어도 명단 노출)
  useEffect(() => {
    if (!selectedQId || selectedQId === 'all') { setQuarterRoster({}); return }
    let cancelled = false
    fetch(`/api/leagues/${leagueId}/quarters/${selectedQId}/players`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: RosterRow[]) => {
        if (cancelled) return
        const map: Record<string, RosterRow[]> = {}
        for (const r of rows) {
          if (!r.team_id || !r.is_regular) continue
          if (!map[r.team_id]) map[r.team_id] = []
          map[r.team_id].push(r)
        }
        setQuarterRoster(map)
      })
      .catch(() => null)
    return () => { cancelled = true }
  }, [leagueId, selectedQId])

  // ── 데이터 가공 ───────────────────────────────────────────
  const teamMap = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t])), [teams])
  const leaderMap = useMemo(() => Object.fromEntries(leaders.map(l => [l.team_id, l.leader_player_id])), [leaders])

  // 순위표: 정체성 API 데이터로 대체 (팀명 override 반영, 전체 뷰에서 5팀 노출)
  // identityKey 를 추가해 상대전적 조회에 사용
  const standings = useMemo(() => {
    return identities.map(id => ({
      identityKey: id.key,
      teamId: id.team_id,
      displayName: id.display_name,
      color: id.color,
      quarterLabels: id.quarter_labels,
      w: id.wins,
      d: id.draws,
      l: id.losses,
      gf: id.goals_for,
      ga: id.goals_against,
    }))
  }, [identities])

  // 상대 전적 — 정체성 API 에서 이미 h2h 를 반환 (identityKey → opponentKey → {w,d,l})
  const h2h = useMemo(() => {
    const m: Record<string, Record<string, { w: number; d: number; l: number }>> = {}
    for (const id of identities) m[id.key] = id.h2h
    return m
  }, [identities])

  // 팀별 선수 스탯: API에서 team_id 이벤트 기준으로 분할된 데이터를 그대로 사용
  // → 같은 선수가 여러 팀에서 뛰었으면 각 팀에 그 팀에서의 스탯만 표시됨
  // + 등록된 정규 명단(quarterRoster)의 선수가 스탯에 없으면 0-fill로 추가 (미경기 분기 대응)
  const teamStats = useMemo(() => {
    const emptyStat = (r: RosterRow): PlayerStat => ({
      player_id: r.id,
      name: r.name,
      number: r.number,
      position: r.position,
      gp: 0,
      pts: 0, ppg: 0,
      reb: 0, rpg: 0,
      oreb: 0, orp: 0,
      dreb: 0, drp: 0,
      ast: 0, apg: 0,
      stl: 0, spg: 0,
      blk: 0, bpg: 0,
      tov: 0, topg: 0,
      pf: 0,
      fgm: 0, fga: 0, fg_pct: 0,
      fg2m: 0, fg2a: 0, fg2_pct: 0,
      fg3m: 0, fg3a: 0, fg3_pct: 0,
      ftm: 0, fta: 0, ft_pct: 0,
      efg_pct: 0,
      and_one: 0,
      ds_a: 0, ds_m: 0,
      lu_a: 0, lu_m: 0,
      md_a: 0, md_m: 0,
      team_reb_in_games: 0,
      team_poss_in_games: 0,
      minutes_played: 0,
      minutes_est: 0,
      minutes_est_used: false,
      pie_num: 0,
      pie_denom: 0,
    })
    const m: Record<string, PlayerStat[]> = {}
    for (const id of identities) {
      const statsArr = teamStatsApi[id.key] ?? []
      // 로스터는 team_id 기준. 정체성이 여러 분기를 포함하면 각 분기 로스터 병합.
      // 현재 quarterRoster 는 특정 분기 선택 시만 페치됨 → 그 분기의 team_id 로스터 사용.
      const rosterArr = quarterRoster[id.team_id] ?? []
      const statPids = new Set(statsArr.map(p => p.player_id))
      const missing = rosterArr.filter(r => !statPids.has(r.id))
      m[id.key] = [...statsArr, ...missing.map(emptyStat)]
    }
    return m
  }, [identities, teamStatsApi, quarterRoster])

  // ── 팀별 선수 스탯 · 팀 탭 (2026-08-13) ────────────────────────────
  // 팀 3개를 세로로 이어 붙이면 팀당 약 12명 → 한 화면에 37행이 쌓여 이 화면이 가장 길었다.
  // 한 번에 한 팀만 그려 세로 길이를 1/3 로 줄인다. 데이터는 그대로(추가 페치 없음) —
  // 이미 받아둔 teamStats 를 화면에서 나눠 보여주기만 한다.
  //
  // 기본 선택은 순위 1위 팀. standings 는 정체성 API 가 순위순으로 내려주므로 standings[0].
  // 사용자가 고른 팀은 유지하되, 분기를 바꿔 그 팀이 사라지면 다시 1위로 폴백한다
  // (별도 effect 없이 파생값으로 처리 — setState 루프가 생기지 않는다).
  const [statsTeamKey, setStatsTeamKey] = useState<string | null>(null)
  const activeStatsTeamKey =
    statsTeamKey && standings.some(s => s.identityKey === statsTeamKey)
      ? statsTeamKey
      : (standings[0]?.identityKey ?? null)

  // 탭 전환 시 스크롤 튐 방지 — block:'nearest' 는 탭 바가 이미 보이면 아무것도 하지 않고,
  // 표 아래로 스크롤한 상태에서만 최소한으로 되돌린다(behavior 기본 auto — 애니메이션 없음).
  const statsTabBarRef = useRef<HTMLDivElement>(null)
  const statsTabSwitched = useRef(false)
  useEffect(() => {
    if (!statsTabSwitched.current) return
    statsTabSwitched.current = false
    statsTabBarRef.current?.scrollIntoView({ block: 'nearest' })
  }, [statsTeamKey])

  // 비정규 섹션 — 어떤 정체성에도 귀속되지 않은 선수 (이벤트의 team_id 가 모두 null)
  const irregularStats = useMemo(() => {
    const identityPlayerIds = new Set<string>()
    for (const key of Object.keys(teamStatsApi)) {
      for (const p of teamStatsApi[key]) identityPlayerIds.add(p.player_id)
    }
    return allStats.filter(s => !identityPlayerIds.has(s.player_id))
  }, [allStats, teamStatsApi])

  const rosterHref = `/league/${orgSlug}/${leagueId}/roster`
  const base = `/league/${orgSlug}/${leagueId}`

  if (loading) return <div className="flex justify-center py-12"><BasketballLoader size={32} /></div>

  if (quarters.length === 0) return (
    <div className="mm-brand text-center py-16" style={{ color: 'var(--mm-muted)' }}>
      <p className="text-sm">등록된 분기가 없습니다</p>
      <Link href={rosterHref} className="inline-block mt-3 text-xs font-bold uppercase tracking-wider hover:underline" style={{ color: 'var(--mm-ink-soft)' }}>→ 선수단 탭으로 이동</Link>
    </div>
  )

  const totalPlayed = standings.reduce((s, t) => s + t.w + t.d + t.l, 0) / 2

  return (
    <div className="mm-brand space-y-6">
      {/* 스탯 우산 서브탭 — 리더보드 · 어워즈 · 선수 명단 · 팀 순위 (2026-08-08 이동, 2026-08-09 시즌하이 흡수) */}
      <LeagueGroupTabs tabs={getStatsGroupTabs(base, 'teams')} />
      {/* ── 분기 버튼 탭 ── */}
      <div>
        <h2 className="font-bold mb-4" style={{ color: 'var(--mm-ink)', fontSize: '32px', letterSpacing: '-0.005em' }}>팀 순위</h2>
        <div className="flex flex-wrap gap-2">
          {/* 전체 버튼 */}
          <button
            onClick={() => setSelectedQId('all')}
            className="px-4 py-1.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
            style={{
              background: selectedQId === 'all' ? 'var(--mm-ink)' : 'var(--mm-panel)',
              color: selectedQId === 'all' ? 'var(--mm-panel)' : 'var(--mm-muted)',
              border: '1px solid var(--mm-rule)',
            }}
          >
            전체
          </button>
          {quarters.map(q => {
            const active = selectedQId === q.id
            return (
              <button key={q.id} onClick={() => setSelectedQId(q.id)}
                className="px-4 py-1.5 text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
                style={{
                  background: active ? 'var(--mm-ink)' : 'var(--mm-panel)',
                  color: active ? 'var(--mm-panel)' : 'var(--mm-muted)',
                  border: '1px solid var(--mm-rule)',
                }}>
                {String(q.year).slice(2)}.{q.quarter}Q
                {q.is_current && <span className="ml-1.5 w-1.5 h-1.5 rounded-full inline-block" style={{ background: active ? 'var(--mm-panel)' : 'var(--mm-positive)' }} />}
              </button>
            )
          })}
        </div>
      </div>

      {dataLoading ? (
        <div className="flex justify-center py-12"><BasketballLoader size={28} /></div>
      ) : (
        <>
        {/* ── 섹션 1: 팀별 전적 + 상대 전적 ── */}
        <div className="space-y-3">
          <h3 className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: '22px', letterSpacing: '-0.005em' }}>팀 전적</h3>

          {/* 팀 카드 그리드 — 정체성(identityKey) 기준. 전체 뷰에서 5팀 노출 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {standings.map((s, idx) => {
              const played = s.w + s.d + s.l
              const winPct = played > 0 ? (s.w / played * 100).toFixed(1) : '—'
              const isSelected = selectedTeamId === s.identityKey
              const isFirst = idx === 0
              return (
                <div
                  key={s.identityKey}
                  className="overflow-hidden relative"
                  style={{
                    background: isFirst ? 'var(--mm-ink)' : 'var(--mm-panel)',
                    border: isSelected ? '2px solid var(--mm-ink)' : '1px solid var(--mm-rule)',
                  }}
                >
                  {/* 팀 컬러 좌측 accent bar */}
                  <div className="absolute top-0 left-0 bottom-0 w-1" style={{ background: s.color }} aria-hidden />
                  {/* 팀 헤더 — 클릭하면 상세 패널 토글 */}
                  <button
                    className="w-full px-4 py-3 pl-5 flex items-center justify-between transition-colors cursor-pointer"
                    style={{ borderBottom: '1px solid var(--mm-rule)' }}
                    onClick={() => setSelectedTeamId(prev => prev === s.identityKey ? null : s.identityKey)}
                    aria-expanded={isSelected}
                    aria-label={`${s.displayName} 상세 정보 ${isSelected ? '닫기' : '열기'}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-jersey font-black tabular-nums w-8 shrink-0" style={{ color: isFirst ? 'var(--mm-panel)' : 'var(--mm-muted)', fontSize: '28px' }}>{idx + 1}</span>
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                      <div className="min-w-0">
                        <span className="font-bold block break-keep" style={{ color: isFirst ? 'var(--mm-panel)' : 'var(--mm-ink)', fontSize: '20px', letterSpacing: '-0.005em', lineHeight: 1.15, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{s.displayName}</span>
                        {s.quarterLabels.length > 0 && selectedQId === 'all' && (
                          <span className="text-xs font-mono" style={{ color: isFirst ? 'color-mix(in srgb, var(--mm-panel) 60%, transparent)' : 'var(--mm-muted)' }}>{s.quarterLabels.join(' · ')}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-jersey font-black tabular-nums" style={{ color: isFirst ? 'var(--mm-panel)' : s.color, fontSize: '28px' }}>{winPct}{played > 0 ? '%' : ''}</p>
                      <p className="text-xs font-bold" style={{ color: isFirst ? 'color-mix(in srgb, var(--mm-panel) 60%, transparent)' : 'var(--mm-muted)' }}>{s.w}승 {s.d > 0 ? `${s.d}무 ` : ''}{s.l}패 · {played}경기</p>
                      {played > 0 && (
                        <div className="flex h-1 overflow-hidden w-16 mt-1 ml-auto">
                          <div className="h-full" style={{ width: `${s.w/played*100}%`, backgroundColor: s.color }} />
                          {s.d > 0 && <div className="h-full" style={{ width: `${s.d/played*100}%`, background: isFirst ? 'color-mix(in srgb, var(--mm-panel) 70%, transparent)' : 'var(--mm-muted)' }} />}
                          <div className="h-full flex-1" style={{ background: isFirst ? 'color-mix(in srgb, var(--mm-panel) 15%, transparent)' : 'var(--mm-rule)' }} />
                        </div>
                      )}
                    </div>
                  </button>
                  {/* 상대 전적 — 정체성 기준 (같은 정체성 그룹 안의 다른 정체성들과 대전) */}
                  <div className="px-4 py-3 pl-5">
                    <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: isFirst ? 'color-mix(in srgb, var(--mm-panel) 60%, transparent)' : 'var(--mm-muted)' }}>상대 전적</p>
                    {standings.filter(op => op.identityKey !== s.identityKey).map(op => {
                      const rec = h2h[s.identityKey]?.[op.identityKey] ?? { w: 0, d: 0, l: 0 }
                      const total = rec.w + rec.d + rec.l
                      const isWin = rec.w > rec.l
                      const isLoss = rec.w < rec.l
                      return (
                        <div key={op.identityKey} className="flex items-center justify-between px-2 py-1 mb-1" style={{
                          background: isFirst ? 'color-mix(in srgb, var(--mm-panel) 6%, transparent)' : isWin ? 'rgba(5,150,105,0.10)' : isLoss ? 'rgba(220,38,38,0.10)' : 'var(--mm-panel-alt)',
                          border: `1px solid ${isFirst ? 'color-mix(in srgb, var(--mm-panel) 15%, transparent)' : isWin ? 'rgba(5,150,105,0.25)' : isLoss ? 'rgba(220,38,38,0.25)' : 'var(--mm-rule)'}`,
                        }}>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: op.color }} />
                            <span className="text-xs font-bold break-keep min-w-0" style={{ color: isFirst ? 'var(--mm-panel)' : 'var(--mm-ink)', lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>vs {op.displayName}</span>
                          </div>
                          {total === 0 ? (
                            <span className="text-xs shrink-0" style={{ color: isFirst ? 'color-mix(in srgb, var(--mm-panel) 65%, transparent)' : 'var(--mm-muted)' }}>기록 없음</span>
                          ) : (
                            <div className="flex items-center gap-1 text-xs font-black tabular-nums shrink-0">
                              <span style={{ color: isWin ? 'var(--mm-positive)' : isFirst ? 'var(--mm-panel)' : 'var(--mm-muted)' }}>{rec.w}W</span>
                              {rec.d > 0 && <><span style={{ color: isFirst ? 'color-mix(in srgb, var(--mm-panel) 70%, transparent)' : 'var(--mm-muted)' }}>·</span><span style={{ color: isFirst ? 'var(--mm-panel)' : 'var(--mm-neutral-strong)' }}>{rec.d}D</span></>}
                              <span style={{ color: isFirst ? 'color-mix(in srgb, var(--mm-panel) 70%, transparent)' : 'var(--mm-muted)' }}>·</span>
                              <span style={{ color: isLoss ? 'var(--mm-negative)' : isFirst ? 'var(--mm-panel)' : 'var(--mm-muted)' }}>{rec.l}L</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {totalPlayed === 0 && <p className="text-xs py-1" style={{ color: isFirst ? 'color-mix(in srgb, var(--mm-panel) 65%, transparent)' : 'var(--mm-muted)' }}>완료된 경기 없음</p>}
                  </div>
                </div>
              )
            })}
          </div>

          {/* 선택된 팀 상세 패널 (그리드 아래에 full-width) */}
          {selectedTeamId && (() => {
            // selectedTeamId 는 이제 identityKey. 해당 standing 조회
            const selStanding = standings.find(s => s.identityKey === selectedTeamId)
            if (!selStanding) return null
            const teamForPanel = { id: selStanding.teamId, name: selStanding.displayName, color: selStanding.color }
            const oppositeTeams = standings
              .filter(s => s.identityKey !== selStanding.identityKey)
              .map(s => ({ id: s.identityKey, name: s.displayName, color: s.color }))
            const h2hByIdentity = h2h[selStanding.identityKey] ?? {}
            return (
              <div className="relative">
                <button
                  className="absolute top-4 right-4 z-10 w-11 h-11 flex items-center justify-center transition-colors cursor-pointer hover:bg-[color:var(--mm-yellow-soft)]"
                  style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)' }}
                  onClick={() => setSelectedTeamId(null)}
                  aria-label="패널 닫기"
                >
                  <X size={14} />
                </button>
                <TeamDetailPanel
                  teamId={selStanding.teamId}
                  team={teamForPanel}
                  standing={{ w: selStanding.w, d: selStanding.d, l: selStanding.l, gf: selStanding.gf, ga: selStanding.ga, teamId: selStanding.teamId }}
                  h2h={h2hByIdentity}
                  players={teamStats[selectedTeamId] ?? []}
                  allTeams={oppositeTeams}
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
              <h3 className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: '22px', letterSpacing: '-0.005em' }}>팀별 선수 스탯</h3>
              <p className="text-xs mt-1" style={{ color: 'var(--mm-muted)' }}>이 팀에서 뛴 경기 기준 (정규/비정규 무관) · 한 선수가 여러 팀에서 뛰었다면 각 팀에 분리 표시</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Basic / Shooting / Advanced */}
              <div className="flex overflow-hidden shrink-0" style={{ border: '1px solid var(--mm-rule)' }}>
                {([
                  { k: 'basic'    as StatMode, label: 'Basic' },
                  { k: 'shooting' as StatMode, label: 'Shooting' },
                  { k: 'advanced' as StatMode, label: 'Advanced' },
                ]).map(({ k, label }) => {
                  const active = statMode === k
                  return (
                    <button key={k} onClick={() => setStatMode(k)}
                      className="px-3 py-1.5 text-xs font-black uppercase tracking-wider cursor-pointer transition-colors min-h-[36px]"
                      style={{
                        background: active ? 'var(--mm-ink)' : 'var(--mm-panel)',
                        color: active ? 'var(--mm-panel)' : 'var(--mm-muted)',
                      }}>
                      {label}
                    </button>
                  )
                })}
              </div>
              {/* 평균 / 누적 (Basic 모드에서만 의미) */}
              <div className={`flex overflow-hidden shrink-0 ${statMode !== 'basic' ? 'opacity-40 pointer-events-none' : ''}`} style={{ border: '1px solid var(--mm-rule)' }}>
                {(['avg','total'] as const).map(m => {
                  const active = viewMode === m
                  return (
                    <button key={m} onClick={() => setViewMode(m)}
                      className="px-3 py-1.5 text-xs font-black uppercase tracking-wider cursor-pointer transition-colors min-h-[36px]"
                      style={{
                        background: active ? 'var(--mm-ink)' : 'var(--mm-panel)',
                        color: active ? 'var(--mm-panel)' : 'var(--mm-muted)',
                      }}>
                      {m === 'avg' ? '평균' : '누적'}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* "이 표 읽는 법" — 기본 접힘, 펼치면 주요 지표 쉬운 말 설명 (라이트 유저용) */}
          <StatsReadingGuide items={[
            { term: 'PPG', text: '한 경기에 평균 몇 점을 넣는지예요. 높을수록 득점력이 좋아요.' },
            { term: 'RPG', text: '한 경기에 평균 리바운드를 몇 개 잡는지예요. 높을수록 골밑 장악력이 좋아요.' },
            { term: 'APG', text: '한 경기에 평균 어시스트를 몇 개 하는지예요. 높을수록 동료를 잘 살려요.' },
            { term: 'TOPG', text: '한 경기에 평균 몇 번 공을 뺏기는지예요. 이건 반대로 낮을수록 좋아요.' },
          ]} />

          {/* 팀 탭 — 팀을 세로로 잇지 않고 한 번에 하나만 그린다 (2026-08-13, 스크롤 단축).
              계층 구분: 상위 스탯 우산탭(LeagueGroupTabs)은 밑줄형, 분기·모드 세그먼트는 ink 채움형이라
              팀 탭은 '팀 컬러 테두리 칩'으로 셋 다 겹치지 않게 했다.
              ⚠ 팀 컬러를 전경(테두리·텍스트)으로 쓸 때는 반드시 accentOrInk() 를 거친다 —
              흰색·아주 연한 팀 컬러가 라이트 모드에서 사라진다. */}
          <div
            ref={statsTabBarRef}
            role="tablist"
            aria-label="팀별 선수 스탯 · 팀 선택"
            className="-mx-2 sm:mx-0 px-2 sm:px-0 flex gap-2 overflow-x-auto scrollbar-hide"
            style={{ scrollMarginTop: '12px' }}
          >
            {standings.map(s => {
              const on = s.identityKey === activeStatsTeamKey
              const accent = accentOrInk(s.color)
              const count = (teamStats[s.identityKey] ?? []).length
              return (
                <button
                  key={s.identityKey}
                  role="tab"
                  id={`stats-team-tab-${s.identityKey}`}
                  aria-selected={on}
                  aria-controls={`stats-team-panel-${s.identityKey}`}
                  onClick={() => { statsTabSwitched.current = true; setStatsTeamKey(s.identityKey) }}
                  className="shrink-0 min-h-[44px] flex items-center gap-2 px-4 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                  style={{
                    // 활성/비활성 모두 테두리 2px — 폭이 변하지 않아 전환 시 옆 칩이 밀리지 않는다
                    border: `2px solid ${on ? accent : 'var(--mm-rule)'}`,
                    borderRadius: 'var(--mm-radius-chip)',
                    background: on ? `color-mix(in srgb, ${accent} 12%, var(--mm-panel))` : 'var(--mm-panel)',
                    color: on ? accent : 'var(--mm-muted)',
                    transitionDuration: 'var(--mm-motion-fast)',
                    transitionTimingFunction: 'var(--mm-ease-out)',
                  }}
                >
                  {/* 팀 컬러 점 — 흰 팀 컬러도 보이도록 안쪽 1px 링 */}
                  <span
                    aria-hidden
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: s.color, boxShadow: 'inset 0 0 0 1px var(--mm-rule)' }}
                  />
                  <span className={`text-sm whitespace-nowrap ${on ? 'font-bold' : 'font-medium'}`}>{s.displayName}</span>
                  <span className="text-xs tabular-nums" style={{ color: on ? accent : 'var(--mm-muted)' }}>{count}</span>
                </button>
              )
            })}
          </div>

          {standings.filter(s => s.identityKey === activeStatsTeamKey).map(s => {
            const players = teamStats[s.identityKey] ?? []
            const leaderId = leaderMap[s.teamId] ?? null
            return (
              <div
                key={s.identityKey}
                role="tabpanel"
                id={`stats-team-panel-${s.identityKey}`}
                aria-labelledby={`stats-team-tab-${s.identityKey}`}
              >
              <SectionCard variant="standalone" className="relative">
                {/* 팀 컬러 좌측 accent bar */}
                <div className="absolute top-0 left-0 bottom-0 w-1" style={{ background: s.color }} aria-hidden />
                <div className="px-4 py-3 pl-5 flex items-center gap-2" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: '18px', letterSpacing: '-0.005em' }}>{s.displayName}</span>
                  {s.quarterLabels.length > 0 && selectedQId === 'all' && (
                    <span className="text-xs font-mono" style={{ color: 'var(--mm-muted)' }}>· {s.quarterLabels.join(', ')}</span>
                  )}
                  <span className="text-xs font-bold uppercase tracking-wider ml-auto" style={{ color: 'var(--mm-muted)' }}>{players.length}명</span>
                </div>
                <div className="px-4 py-3 pl-5">
                  {/* 2026-08-10: "팀 순위 화면 사진 0건" 피드백 대응 — 로스터의 4:5 사진 + 팀컬러
                      스트립 패턴을 그대로 재사용(새 패턴 만들지 않음). 표 위에 얹되 기본 접힘
                      (<details>, 로 세로 증가 0 — 스탯 읽는 법 안내와 동일한 검증된 패턴 재사용).
                      photo_url 은 이미 이 페이지가 쓰는 /api/leagues/[id]/stats 응답에 들어있어
                      (leagueStats.ts:409) 새 fetch·새 게이트가 필요 없다. */}
                  {players.length > 0 && (
                    <details className="group mb-3" style={{ border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)', background: 'var(--mm-panel-alt)' }}>
                      <summary
                        className="flex items-center gap-2 px-3 cursor-pointer select-none min-h-[44px] [&::-webkit-details-marker]:hidden"
                        style={{ color: 'var(--mm-ink-soft)', listStyle: 'none' }}
                      >
                        <Users size={14} aria-hidden style={{ color: 'var(--mm-muted)', flexShrink: 0 }} />
                        <span className="text-xs font-black uppercase" style={{ letterSpacing: '0.08em' }}>선수단 보기 · {players.length}명</span>
                        <ChevronDown
                          size={14}
                          aria-hidden
                          className="ml-auto transition-transform duration-200 group-open:rotate-180"
                          style={{ color: 'var(--mm-muted)', flexShrink: 0 }}
                        />
                      </summary>
                      <div className="flex gap-2 overflow-x-auto scrollbar-hide px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--mm-rule)' }}>
                        {players.map(p => (
                          <div key={p.player_id} className="shrink-0 w-16 sm:w-20 text-center">
                            <div className="relative w-16 h-20 sm:w-20 sm:h-24 rounded-md overflow-hidden border" style={{ borderColor: 'var(--mm-rule)', background: 'var(--mm-panel)' }}>
                              {/* 팀 컬러 좌측 스트립 — 로스터 카드와 동일 */}
                              <div className="absolute left-0 top-0 bottom-0 w-[3px] z-10" style={{ background: s.color }} aria-hidden />
                              {p.photo_url ? (
                                <Image
                                  src={p.photo_url}
                                  alt={p.name}
                                  fill
                                  sizes="80px"
                                  className="object-cover object-top"
                                />
                              ) : (
                                // 사진 없는 선수 폴백 — 팀 컬러 배경 + textOnBg 로 4.5:1 대비 확보
                                // (팀 색이 #ffffff 인 팀도 안전 — contrastColor.ts textOnBg 참조)
                                <div className="w-full h-full flex items-center justify-center" style={{ background: s.color }}>
                                  <span className="font-jersey font-black" style={{ color: textOnBg(s.color), fontSize: '18px' }}>
                                    {p.name.length > 1 ? p.name.slice(1) : p.name}
                                  </span>
                                </div>
                              )}
                            </div>
                            <p className="text-[10px] font-bold mt-1 truncate" style={{ color: 'var(--mm-ink-soft)' }}>{p.name}</p>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  {/* 선수가 없는 팀도 탭은 남긴다(개수가 흔들리면 안 되므로).
                      빈 상태 문구는 StatsTable 이 이미 갖고 있는 "기록된 스탯이 없습니다" 를 그대로 쓴다. */}
                  <StatsTable
                    players={players}
                    leagueId={leagueId}
                    leaderId={leaderId}
                    color={s.color}
                    viewMode={viewMode}
                    statMode={statMode}
                  />
                </div>
              </SectionCard>
              </div>
            )
          })}
        </div>

        {/* ── 섹션 3: 비정규 선수 스탯 ── */}
        {irregularStats.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: '22px', letterSpacing: '-0.005em' }}>비정규 선수</h3>
            <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>팀 배정 없이 게임에 참가한 선수 (이벤트의 team_id가 모두 비어있음)</p>
            <SectionCard variant="standalone">
              <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                <span className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: '16px' }}>비정규 참가자</span>
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--mm-muted)' }}>{irregularStats.length}명</span>
              </div>
              <div className="px-4 py-3">
                <StatsTable
                  players={irregularStats}
                  leagueId={leagueId}
                  viewMode={viewMode}
                  statMode={statMode}
                />
              </div>
            </SectionCard>
          </div>
        )}
        </>
      )}
    </div>
  )
}
