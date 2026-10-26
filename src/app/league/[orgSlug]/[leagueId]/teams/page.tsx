'use client'
import { useOpenPlayerCard } from '@/contexts/PlayerCardContext'
import PlayerName from '@/components/league/ui/PlayerName'
import HeadToHeadSection from '@/components/league/HeadToHeadSection'
import TeamInsightView, { useTeamInsights } from '@/components/league/TeamInsightsSection'
import LeagueGroupTabs from '@/components/league/LeagueGroupTabs'
import { getStatsGroupTabs } from '@/components/league/statsTabs'
import { QuarterChips } from '@/components/league/QuarterChips'
import { useLeagueQuarter } from '@/contexts/LeagueQuarterContext'
import { useState, useEffect, useMemo, useRef, Suspense, type ReactNode } from 'react'
import Image from 'next/image'
import { useParams, useSearchParams, useRouter, usePathname } from 'next/navigation'
import { Crown, ChevronUp, ChevronDown, ChevronsUpDown, X, Users, Pencil } from 'lucide-react'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { useOptionalCurrentUser } from '@/contexts/LeagueAuthContext'
import RosterEditor from './_components/RosterEditor'
import type { Team } from './_types'
import { pickTeamLeader } from './_lib/teamLeaders'
import TeamsSkeleton from '@/components/league/teams/TeamsSkeleton'
import { isPctStatKey, meetsAttemptMin, attemptRuleLabel } from '@/lib/stats/eligibility'
import TeamInsights from '@/components/league/TeamInsights'
import SectionCard from '@/components/league/ui/SectionCard'
import SectionHeader from '@/components/league/ui/SectionHeader'
import SegmentedTabs from '@/components/league/ui/SegmentedTabs'
import TeamDailyRecordGrid, { type GridGame } from '@/components/league/TeamDailyRecordGrid'
import { RecordBar, VersusBar, Ring } from '@/components/league/ui/viz'
import { textOnBg, accentOrInk } from '@/lib/util/contrastColor'
import TeamFormLine from '@/components/league/nba/TeamFormLine'
import type { TeamForm } from '@/lib/stats/standings'

// 명단 로드 전 기본값 — 렌더마다 새 Set 을 만들면 TeamDetailPanel useMemo 가 매번 다시 돈다
const EMPTY_IDS: ReadonlySet<string> = new Set()
// RecordBar 칸은 반투명 배경이라 1위 카드(ink 배경) 위에서 대비가 무너진다 — 패널색 바탕을 깔아 준다
function OnPanel({ children }: { children: ReactNode }) {
  return <div style={{ background: 'var(--mm-panel)', borderRadius: 'var(--mm-radius-chip)' }}>{children}</div>
}

// 팀 내 1위 칩의 작은 얼굴 — 사진이 없으면 팀색 바탕 + 이름(성 뺀) 글자
function LeaderAvatar({ name, photoUrl, color }: { name: string; photoUrl?: string | null; color: string }) {
  return (
    <div className="relative w-10 h-10 rounded-full overflow-hidden shrink-0" style={{ border: '1px solid var(--mm-rule)', background: photoUrl ? 'var(--mm-panel)' : color }}>
      {photoUrl ? (
        <Image src={photoUrl} alt="" fill sizes="40px" className="object-cover object-top" />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-xs font-black" style={{ color: textOnBg(color) }} aria-hidden>
          {name.length > 1 ? name.slice(1) : name}
        </span>
      )}
    </div>
  )
}
import StatHeader from '@/components/league/StatHeader'
import StatsGlossarySheet from '@/components/league/stats/StatsGlossarySheet'
import type { PlayerStat } from '@/types/league'

type StatMode = 'basic'|'shooting'|'advanced'

// 열 이름은 스탯 탭과 같은 한글 한 벌(2026-10-26) — term 은 용어 풀이(glossary) 키라 영어 그대로 둔다.
// 2026-10-25 운영진: 「성공 개수와 성공률은 한 칸으로」 — 누적의 야투·3점·자유투는 성공률 한 칸(아래 줄 성공/시도),
//   공격·수비 리바는 리바 칸 아래 줄. 하루 평균의 성공률은 「슈팅」 보기에만 둔다.
// 2026-08-15: 셀 아래 컬러 막대는 뺐다(뜻이 다른 지표가 같은 길이로 비교돼 보인다) — 숫자만.
type Col = { key: string; label: string; term: string; desc?: string }
const AVG_COLS: Col[] = [
  { key: 'gp',   label: '출전',   term: 'R' },
  { key: 'ppg',  label: '득점',   term: '득점' },
  { key: 'rpg',  label: '리바',   term: '리바' },
  { key: 'apg',  label: '어시',   term: '어시' },
  { key: 'spg',  label: '스틸',   term: '스틸' },
  { key: 'bpg',  label: '블록',   term: '블록' },
  { key: 'topg', label: '턴오버', term: '턴오버' },
]
const TOTAL_COLS: Col[] = [
  { key: 'gp',      label: '출전',     term: 'R' },
  { key: 'pts',     label: '득점',     term: 'PTS' },
  { key: 'reb',     label: '리바',     term: 'REB' },
  { key: 'ast',     label: '어시',     term: 'AST' },
  { key: 'stl',     label: '스틸',     term: 'STL' },
  { key: 'blk',     label: '블록',     term: 'BLK' },
  { key: 'tov',     label: '턴오버',   term: 'TOV' },
  { key: 'fg_pct',  label: '야투율',   term: 'FG%' },
  { key: 'fg3_pct', label: '3점률',    term: '3P%' },
  { key: 'ft_pct',  label: '자유투율', term: 'FT%' },
]
const SHOOTING_COLS: Col[] = [
  { key: 'fg_pct',      label: '야투율',     term: 'FG%',  desc: '전체 야투 성공률' },
  { key: 'fg2_pct',     label: '2점률',      term: '2P%',  desc: '2점슛 성공률' },
  { key: 'fg3_pct',     label: '3점률',      term: '3P%',  desc: '3점슛 성공률' },
  { key: 'efg_pct',     label: '유효야투',   term: 'eFG%', desc: '3점을 1.5개로 쳐 준 야투율' },
  { key: 'ft_pct',      label: '자유투율',   term: 'FT%',  desc: '자유투 성공률' },
  { key: 'ts_pct',      label: '진실야투',   term: 'TS%',  desc: '자유투까지 합친 슛 효율' },
  { key: 'ft_rate',     label: '자유투 유도', term: 'FTr', desc: '야투 시도 대비 자유투 시도' },
  // 골밑·레이업·미드·3점 비중 4칸 → 「슛 분포」 한 칸(정렬은 3점 비중, 아래 줄에 나머지 셋) — 2026-10-25
  { key: 'three_share', label: '슛 분포',    term: '3P share', desc: '야투 시도 비중 · 3점 / 골밑 · 레이업 · 미드 (정렬은 3점 비중)' },
]
const ADV_COLS: Col[] = [
  { key: 'at_ratio', label: '어시/턴오버', term: 'A/T',  desc: '턴오버 하나당 어시스트' },
  { key: 'ast_pct',  label: '어시 비중',   term: 'AST%', desc: '공격 기회 중 어시스트 비중' },
  { key: 'tov_pct',  label: '턴오버 비중', term: 'TOV%', desc: '공격 기회 중 턴오버 비중' },
  { key: 'a1_total', label: '앤드원',      term: 'A1',   desc: '성공한 앤드원 횟수 (누적)' },
  // 수비 리바 비중은 100 − 공격 리바 비중이라 뺐다(2026-10-25 — 같은 정보가 두 칸)
  { key: 'orb_pct',  label: '공리 비중',   term: 'ORB%', desc: '내 리바운드 중 공격 리바운드 비중' },
  { key: 'trb_pct',  label: '리바 비중',   term: 'TRB%', desc: '내가 뛴 경기의 팀 리바운드 중 내 몫' },
]

const COLS_OF = (mode: StatMode, viewMode: 'avg'|'total'): Col[] =>
  mode === 'shooting' ? SHOOTING_COLS : mode === 'advanced' ? ADV_COLS : viewMode === 'avg' ? AVG_COLS : TOTAL_COLS
const DEFAULT_SORT = (mode: StatMode, viewMode: 'avg'|'total') =>
  // 슈팅 기본 정렬은 스탯 탭과 같은 진실야투(ts_pct)
  mode === 'shooting' ? 'ts_pct' : mode === 'advanced' ? 'at_ratio' : viewMode === 'avg' ? 'ppg' : 'pts'

const INT_KEYS = new Set(['gp','pts','reb','ast','stl','blk','tov','a1_total'])
const PCT_KEYS = new Set(['fg_pct','fg2_pct','fg3_pct','efg_pct','ft_pct','ts_pct','ft_rate','ast_pct','tov_pct','orb_pct','trb_pct'])

// 리뉴얼 1단계(2026-10-12): 의미색만 — 턴오버=negative · 공격 리바=--mm-or · 3점 계열=yellow-strong · 나머지 잉크 단계
const CELL_COLOR: Record<string, string> = {
  gp: 'text-[color:var(--mm-muted)]',
  ppg: 'font-black text-[color:var(--mm-ink)]', pts: 'font-black text-[color:var(--mm-ink)]',
  topg: 'text-[color:var(--mm-negative)]', tov: 'text-[color:var(--mm-negative)]', tov_pct: 'text-[color:var(--mm-negative)]',
  fg_pct: 'text-[color:var(--mm-muted)]', fg3_pct: 'text-[color:var(--mm-yellow-strong)]', three_share: 'text-[color:var(--mm-yellow-strong)]',
  orb_pct: 'text-[color:var(--mm-or)]',
}

const pct = (n: number, d: number) => (d > 0 ? +(n / d * 100).toFixed(1) : null)

/** 칸 값 — 시도가 0이라 뜻이 없는 값은 null(화면에 「—」, 정렬은 늘 맨 뒤) */
function metric(p: PlayerStat, key: string): number | null {
  const poss = p.fga + 0.44 * p.fta + p.tov
  switch (key) {
    case 'fg_pct':  return p.fga > 0 ? p.fg_pct : null
    case 'fg2_pct': return (p.fg2a ?? 0) > 0 ? p.fg2_pct : null
    case 'fg3_pct': return p.fg3a > 0 ? p.fg3_pct : null
    case 'ft_pct':  return p.fta > 0 ? p.ft_pct : null
    case 'efg_pct': return p.fga > 0 ? p.efg_pct : null
    case 'ts_pct':  return pct(p.pts, 2 * (p.fga + 0.44 * p.fta))
    case 'ft_rate': return pct(p.fta, p.fga)
    case 'three_share': return pct(p.fg3a, p.fga)
    // 턴오버 0 이면 비율이 정의되지 않는다 — 예전엔 ∞ 로 1위에 앉혔다
    case 'at_ratio': return p.tov > 0 ? +(p.ast / p.tov).toFixed(2) : null
    case 'ast_pct':  return pct(p.ast, poss + p.ast)
    case 'tov_pct':  return pct(p.tov, poss)
    case 'a1_total': return p.and_one ?? 0
    case 'orb_pct':  return pct(p.oreb, p.reb)
    case 'trb_pct':  return pct(p.reb, p.team_reb_in_games ?? 0)
    default: return ((p as unknown as Record<string, number>)[key] ?? 0)
  }
}

function fmt(key: string, v: number | null): string {
  if (v == null) return '—'
  if (key === 'three_share') return `3점 ${v.toFixed(0)}%`
  if (key === 'at_ratio') return v.toFixed(2)
  if (PCT_KEYS.has(key)) return `${v.toFixed(1)}%`
  if (INT_KEYS.has(key)) return String(v)
  return v.toFixed(1)
}

/** 한 칸에 합친 값의 아래 줄 — 성공/시도 · 공격/수비 리바 · 슛 분포 나머지 (2026-10-25) */
function subText(p: PlayerStat, key: string): string | null {
  if (key === 'fg_pct')  return `${p.fgm}/${p.fga}`
  if (key === 'fg3_pct') return `${p.fg3m}/${p.fg3a}`
  if (key === 'ft_pct')  return `${p.ftm}/${p.fta}`
  if (key === 'reb') return `공${p.oreb}·수${p.dreb}`
  if (key === 'rpg') return `공${(p.orp ?? 0).toFixed(1)}·수${(p.drp ?? 0).toFixed(1)}`
  if (key === 'three_share') {
    const s = (a: number | undefined) => (p.fga > 0 ? ((a ?? 0) / p.fga * 100).toFixed(0) : '0')
    return `골${s(p.ds_a)}·레${s(p.lu_a)}·미${s(p.md_a)}`
  }
  return null
}

/** 성공률 순위 자격 — 정본 meetsAttemptMin(lib/stats/eligibility.ts). 성공률 칸이 아니면 늘 true */
const qualifies = (p: PlayerStat, key: string) => !isPctStatKey(key) || meetsAttemptMin(p, key)

function SortIcon({ active, dir }: { active: boolean; dir: 'asc'|'desc' }) {
  if (!active) return <ChevronsUpDown size={14} className="inline ml-0.5 opacity-30" />
  return dir === 'desc'
    ? <ChevronDown size={14} className="inline ml-0.5" style={{ color: 'var(--mm-ink)' }} />
    : <ChevronUp   size={14} className="inline ml-0.5" style={{ color: 'var(--mm-ink)' }} />
}

function StatsTable({
  players, leaderId, color, viewMode, statMode,
}: {
  players: PlayerStat[]
  leaderId?: string | null
  color?: string
  viewMode: 'avg'|'total'
  statMode: StatMode
}) {
  const cols = COLS_OF(statMode, viewMode)
  const [sort, setSort] = useState<{ key: string; dir: 'asc'|'desc' } | null>(null)
  // 보기를 바꿔 고른 열이 사라지면 그 보기의 기본 정렬로(별도 effect 없이 파생값)
  const sortKey = sort && cols.some(c => c.key === sort.key) ? sort.key : DEFAULT_SORT(statMode, viewMode)
  const sortDir = sort && sort.key === sortKey ? sort.dir : 'desc'
  const pctSort = isPctStatKey(sortKey)
  // 선수 카드는 레이아웃의 전역 카드 하나로 연다(2026-10-14, contexts/PlayerCardContext)
  const openPlayerCard = useOpenPlayerCard()
  // 카드는 이 화면에서 고른 분기로 연다(2026-10-15)
  const { selectedQuarterId: cardQuarterId } = useLeagueQuarter()
  const openPlayer = (p: PlayerStat) => openPlayerCard?.({ playerId: p.player_id, playerName: p.name, quarterId: cardQuarterId })

  const sorted = useMemo(() => {
    const rows = players.map(p => ({ p, v: metric(p, sortKey), ok: qualifies(p, sortKey) }))
    rows.sort((a, b) => {
      // 성공률은 시도 기준을 채운 선수가 먼저 · 값이 없는(시도 0) 선수는 늘 맨 뒤
      if (a.ok !== b.ok) return a.ok ? -1 : 1
      if (a.v == null || b.v == null) return a.v == null ? (b.v == null ? 0 : 1) : -1
      const diff = a.v - b.v
      return sortDir === 'desc' ? -diff : diff
    })
    // 순위 번호는 기준을 채운 선수에게만(미달은 「—」)
    let n = 0
    return rows.map(r => ({ ...r, rank: r.ok ? ++n : null }))
  }, [players, sortKey, sortDir])

  function handleSort(key: string) {
    setSort(key === sortKey ? { key, dir: sortDir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' })
  }

  if (players.length === 0) {
    return <p className="text-xs py-4 text-center" style={{ color: 'var(--mm-muted)' }}>아직 기록이 없어요</p>
  }

  const Sub = ({ text }: { text: string | null }) =>
    text ? <span className="block text-xs font-normal tabular-nums" style={{ color: 'var(--mm-muted)' }}>{text}</span> : null
  const sortCol = cols.find(c => c.key === sortKey) ?? cols[0]

  return (
    <>
    {pctSort && (
      <p className="text-xs mb-2" style={{ color: 'var(--mm-muted)' }}>{attemptRuleLabel(sortKey)} · 모자라면 「시도 부족」으로 뒤에 둬요</p>
    )}
    {/* 모바일 정렬 칩 + 카드뷰 (md 미만) — 칩은 스탯 탭 정렬 칩과 같은 36px, 가로 스크롤 없이 줄바꿈(2026-10-25) */}
    <div className="md:hidden">
      <div className="px-1 pb-2">
        <div className="flex flex-wrap gap-1.5">
          {cols.map(({ key, label }) => {
            const active = sortKey === key
            return (
              <button key={key} onClick={() => handleSort(key)} aria-pressed={active}
                className="mm-press inline-flex items-center min-h-9 px-3 text-xs font-semibold transition-colors shrink-0 cursor-pointer"
                style={{
                  background: active ? 'var(--mm-ink)' : 'var(--mm-panel)',
                  color: active ? 'var(--mm-panel)' : 'var(--mm-muted)',
                  border: '1px solid var(--mm-rule)',
                }}>
                {label}{active && (sortDir === 'desc' ? ' ↓' : ' ↑')}
              </button>
            )
          })}
        </div>
      </div>
      <div className="overflow-hidden" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}>
        {sorted.map(({ p, v, ok, rank }) => {
          const isLeader = leaderId && p.player_id === leaderId
          const subKeys = cols.map(c => c.key).filter(k => k !== sortKey).slice(0, 4)
          return (
            // StatHelpTooltip 이 카드 안에 버튼으로 들어가므로 카드 자체는 role="button" div (버튼 안 버튼 금지)
            <div key={p.player_id} role="button" tabIndex={0}
              onClick={() => openPlayer(p)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPlayer(p) } }}
              className="w-full text-left px-3 py-2.5 cursor-pointer transition-colors hover:bg-[color:var(--mm-yellow-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-inset"
              style={{ borderBottom: '1px solid var(--mm-rule)' }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="t-num font-bold w-5 shrink-0" style={{ color: 'var(--mm-muted)', fontSize: '18px' }}>{rank ?? '—'}</span>
                {isLeader && <Crown size={14} role="img" aria-label="리더" className="shrink-0" style={{ color: 'var(--mm-ink-soft)' }}><title>리더</title></Crown>}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base break-keep" style={{ color: 'var(--mm-ink)', wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>
                    {p.name}
                    {p.number != null && <span className="font-mono ml-1 text-xs" style={{ color: 'var(--mm-muted)' }}>#{p.number}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-jersey font-black tabular-nums leading-none" style={{ color: ok ? accentOrInk(color) : 'var(--mm-muted)', fontSize: '26px' }}>{fmt(sortKey, v)}</div>
                  <Sub text={ok ? subText(p, sortKey) : `시도 부족 · ${subText(p, sortKey) ?? ''}`} />
                  <div className="t-label mt-0.5 flex items-center justify-end" style={{ color: 'var(--mm-muted)' }}>
                    <StatHeader term={sortCol.term} label={sortCol.label} />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5 pt-1.5" style={{ borderTop: '1px dashed var(--mm-rule)' }}>
                {subKeys.map(k => {
                  const c = cols.find(x => x.key === k)!
                  return (
                    <div key={k} className="text-center">
                      <div className="t-label flex items-center justify-center" style={{ color: 'var(--mm-muted)' }}>
                        <StatHeader term={c.term} label={c.label} />
                      </div>
                      <div className="t-num text-base font-black" style={{ color: 'var(--mm-ink)' }}>{fmt(k, metric(p, k))}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>

    {/* 데스크탑 테이블 (md 이상) — 셀 크기·굵기는 globals.css 의 t-th / t-td 가 정본 */}
    <div className="hidden md:block overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--mm-rule)' }}>
            <th className="t-th text-left pr-3 sticky left-0 min-w-[90px]" style={{ color: 'var(--mm-muted)', background: 'var(--mm-panel)' }}>선수</th>
            {cols.map(({ key, label, term, desc }) => {
              const active = sortKey === key
              return (
                <th key={key} onClick={() => handleSort(key)} title={desc}
                  aria-sort={active ? (sortDir === 'desc' ? 'descending' : 'ascending') : undefined}
                  className="t-th text-right px-1.5 cursor-pointer select-none transition-colors duration-200"
                  style={{ color: active ? 'var(--mm-ink)' : 'var(--mm-muted)', ...(key === 'three_share' ? { borderLeft: '1px solid var(--mm-rule)' } : {}) }}>
                  <StatHeader term={term} label={label} />
                  <SortIcon active={active} dir={sortDir} />
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map(({ p, ok }) => {
            const isLeader = leaderId && p.player_id === leaderId
            return (
              <tr key={p.player_id} className="transition-colors hover:bg-[color:var(--mm-yellow-soft)]" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                <td className="py-2 pr-3 sticky left-0" style={{ background: 'var(--mm-panel)' }}>
                  <button onClick={() => openPlayer(p)}
                    className="flex items-center gap-1.5 cursor-pointer transition-colors text-left hover:underline decoration-[color:var(--mm-yellow-strong)] underline-offset-4">
                    {isLeader && <Crown size={14} role="img" aria-label="리더" className="shrink-0" style={{ color: 'var(--mm-ink-soft)' }}><title>리더</title></Crown>}
                    <span className="font-semibold text-base" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>
                      {p.number != null && <span className="font-mono mr-1 text-xs" style={{ color: 'var(--mm-muted)' }}>#{p.number}</span>}
                      {p.name}
                    </span>
                  </button>
                </td>
                {cols.map(({ key }) => {
                  const isSortCol = key === sortKey
                  const short = isSortCol && !ok
                  const baseClass = CELL_COLOR[key] ?? 'text-[color:var(--mm-ink-soft)]'
                  const style = {
                    ...(isSortCol && color && !short ? { color: accentOrInk(color) } : {}),
                    ...(short ? { color: 'var(--mm-muted)' } : {}),
                    ...(key === 'three_share' ? { borderLeft: '1px solid var(--mm-rule)' } : {}),
                  }
                  return (
                    <td key={key} className={`t-td text-right px-1.5 ${isSortCol ? 'font-bold' : ''} ${baseClass}`} style={style}>
                      {fmt(key, metric(p, key))}
                      <Sub text={short ? '시도 부족' : subText(p, key)} />
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
    </>
  )
}

// ── TeamDetailPanel ────────────────────────────────────────────────────────
type StandingEntry = { teamId: string; w: number; d: number; l: number; gf: number; ga: number }

function TeamDetailPanel({
  teamId, team, standing, players, regularIds, leagueId, quarterId,
}: {
  teamId: string
  team: Team
  standing: StandingEntry
  // 팀 스탯 카드는 전원 합계라 게스트·비정규 필터 없이 그대로 쓴다.
  // (선수별 표는 아래 「팀별 선수」 섹션 하나만 둔다 — 2026-10-15 패널 안 중복 표 제거)
  players: PlayerStat[]
  // 팀 내 1위 후보 — 그 분기 정규 명단(team_id 일치 + is_regular)
  regularIds: ReadonlySet<string>
  leagueId: string
  quarterId: string | 'all'
}) {
  // 선수 카드는 레이아웃의 전역 카드 하나로 연다(2026-10-14, contexts/PlayerCardContext)
  const openPlayerCard = useOpenPlayerCard()
  const setQuickView = (p: { id: string; name: string } | null) => { if (p) openPlayerCard?.({ playerId: p.id, playerName: p.name, quarterId }) }

  // 분모 = 카드에 보이는 그 팀의 마감 정규전 수(친선 제외 — 승패와 같은 경기 집합)
  const gp = (standing.w + standing.d + standing.l) || 1
  // 「팀 특성 · 하이라이트 · 4요소 · 공격 리바」는 한 번 접어 둔다(2026-10-26) — 펼칠 때만 요청이 나간다
  const [moreOpen, setMoreOpen] = useState(false)

  const computed = useMemo(() => {
    if (players.length === 0) return null

    const totPts    = players.reduce((s, p) => s + p.pts, 0)
    const totFgm    = players.reduce((s, p) => s + p.fgm, 0)
    const totFga    = players.reduce((s, p) => s + p.fga, 0)
    const totFg3a   = players.reduce((s, p) => s + p.fg3a, 0)
    const totFtm    = players.reduce((s, p) => s + p.ftm, 0)
    const totFta    = players.reduce((s, p) => s + p.fta, 0)
    const totStl    = players.reduce((s, p) => s + p.stl, 0)
    const totBlk    = players.reduce((s, p) => s + p.blk, 0)

    const ppg    = totPts / gp
    const fgPct  = totFga  > 0 ? totFgm / totFga * 100 : 0
    const defPg  = (totStl + totBlk) / gp
    const ftPct  = totFta  > 0 ? totFtm / totFta * 100 : 0
    const threePct = totFga > 0 ? totFg3a / totFga * 100 : 0

    // Top performers — 정규 명단만 후보 (비정규·게스트가 1경기로 1위 차지 방지)
    const byPpg   = pickTeamLeader(players, regularIds, p => p.ppg)
    const byRpg   = pickTeamLeader(players, regularIds, p => p.rpg)
    const byApg   = pickTeamLeader(players, regularIds, p => p.apg)
    const byDef   = pickTeamLeader(players, regularIds, p => p.spg + p.bpg)
    // 유효야투 1위는 시도 기준(정본 meetsAttemptMin)을 채운 선수만 — 몇 번 안 던진 선수가 100% 로 앉지 않게
    const byEfg   = pickTeamLeader(players.filter(p => meetsAttemptMin(p, 'efg_pct')), regularIds, p => p.efg_pct)

    // Fun: ace dependency
    const topScorer = byPpg
    const acePct = totPts > 0 && topScorer ? topScorer.pts / totPts * 100 : 0

    return { ppg, fgPct, defPg, ftPct, threePct, acePct, byPpg, byRpg, byApg, byDef, byEfg }
  }, [players, regularIds, gp])

  const played = standing.w + standing.d + standing.l

  // standings.gf/ga가 가장 신뢰성 있는 소스 (games 루프와 동일 기준)
  const avgPf = played > 0 ? standing.gf / played : 0
  const avgPa = played > 0 ? standing.ga / played : 0
  const ptsDiff = standing.gf - standing.ga

  return (
    <SectionCard variant="standalone" pad="none" className="mt-3 relative">
      {/* 팀 컬러 좌측 accent bar */}
      <div className="absolute top-0 left-0 bottom-0 w-1" style={{ background: team.color }} aria-hidden />
      {/* Header */}
      <div className="pl-5 pr-16 py-4 lg:pl-6 flex flex-wrap items-center gap-x-3 gap-y-1" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
        <div className="w-3.5 h-3.5 rounded-full shrink-0" style={{ backgroundColor: team.color }} />
        <span className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: '24px', letterSpacing: '-0.005em' }}>{team.name}</span>
        {/* 승·패는 바로 위 팀 카드 머리(승률 · N경기 + 승패 막대)에 이미 있다 — 여기서 다시 쓰지 않는다 */}
      </div>

      <div className="px-4 py-4 pl-5 lg:px-6 lg:py-5 space-y-6">
        {players.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: 'var(--mm-muted)' }}>이 기간에 이 팀 기록이 아직 없어요</p>
        ) : (
          <>
            {/* B. 팀 스탯 — 득점·실점은 한 막대로 맞대고, 나머지는 타일 (2026-10-12) */}
            {computed && (
              <div>
                <p className="text-base font-black mb-3" style={{ color: 'var(--mm-ink)' }}>팀 스탯</p>
                {/* PC: 득점·실점 막대와 타일 3개를 나란히 — 전폭 막대는 두 숫자가 화면 양 끝으로 갈라졌다 */}
                <div className="lg:grid lg:grid-cols-2 lg:gap-2.5">
                <div className="p-3 mb-2.5 lg:mb-0 lg:flex lg:flex-col lg:justify-center" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}>
                  <div className="flex items-end justify-between gap-3 mb-2">
                    <div>
                      <div className="font-jersey font-black tabular-nums leading-none" style={{ color: 'var(--mm-positive)', fontSize: '28px' }}>{avgPf.toFixed(1)}</div>
                      <div className="t-label mt-1" style={{ color: 'var(--mm-ink)' }}>평균 득점</div>
                    </div>
                    <div className="text-right">
                      <div className="font-jersey font-black tabular-nums leading-none" style={{ color: 'var(--mm-negative)', fontSize: '28px' }}>{avgPa.toFixed(1)}</div>
                      <div className="t-label mt-1" style={{ color: 'var(--mm-ink)' }}>평균 실점</div>
                    </div>
                  </div>
                  <VersusBar a={avgPf} b={avgPa} aLabel="평균 득점" bLabel="평균 실점" height={12} />
                </div>
                {/* 팀 eFG% 는 아래 TeamInsights 의 Four Factors 가 보여 준다 — 화면에서 따로 계산한 값을 두지 않는다 */}
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { label: '득실차', value: (ptsDiff >= 0 ? '+' : '') + ptsDiff.toFixed(0), sub: '누적', color: ptsDiff >= 0 ? 'var(--mm-positive)' : 'var(--mm-negative)' },
                    { label: '팀 야투율', value: `${computed.fgPct.toFixed(1)}%`, sub: '누적', color: 'var(--mm-positive)' },
                    { label: '스틸+블록', value: computed.defPg.toFixed(1), sub: '평균', color: 'var(--mm-ink)' },
                  ].map(card => (
                    <div key={card.label} className="p-3 text-center" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}>
                      <div className="font-jersey font-black tabular-nums leading-none" style={{ color: card.color, fontSize: '28px' }}>{card.value}</div>
                      <div className="t-label mt-2" style={{ color: 'var(--mm-ink)' }}>{card.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>{card.sub}</div>
                    </div>
                  ))}
                </div>
                </div>
              </div>
            )}

            {/* C. Top Performers — 모바일은 가로 스크롤, lg 이상은 5칸 그리드 */}
            {/* byPpg 가 없으면 정규 후보가 0명 — 나머지 1위도 전부 없으니 제목째 숨긴다 */}
            {computed?.byPpg && (
              <div>
                <p className="text-base font-black mb-3" style={{ color: 'var(--mm-ink)' }}>팀 내 1위</p>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide lg:grid lg:grid-cols-5 lg:overflow-visible lg:pb-0">
                  {[
                    { label: '득점왕', player: computed.byPpg, val: computed.byPpg ? `${computed.byPpg.ppg.toFixed(1)}점` : null },
                    { label: '리바운드', player: computed.byRpg, val: computed.byRpg ? `리바 ${computed.byRpg.rpg.toFixed(1)}` : null },
                    { label: '어시스트', player: computed.byApg, val: computed.byApg ? `어시 ${computed.byApg.apg.toFixed(1)}` : null },
                    { label: '수비왕', player: computed.byDef, val: computed.byDef ? `스틸+블록 ${(computed.byDef.spg + computed.byDef.bpg).toFixed(1)}` : null },
                    { label: '효율왕', player: computed.byEfg, val: computed.byEfg ? `유효야투 ${computed.byEfg.efg_pct.toFixed(1)}%` : null },
                  ].filter(item => item.player && item.val).map(item => (
                    <button
                      key={item.label}
                      onClick={() => item.player && setQuickView({ id: item.player.player_id, name: item.player.name })}
                      className="shrink-0 px-3 py-2.5 flex items-center gap-2.5 text-left transition-colors cursor-pointer hover:bg-[color:var(--mm-yellow-soft)] min-w-0"
                      style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}
                    >
                      {item.player && <LeaderAvatar name={item.player.name} photoUrl={item.player.photo_url} color={team.color} />}
                      <div className="min-w-0">
                        <div className="t-label" style={{ color: 'var(--mm-muted)' }}>{item.label}</div>
                        <div className="font-bold whitespace-nowrap lg:truncate" style={{ color: 'var(--mm-ink)', fontSize: '16px' }}>{item.player?.name}</div>
                        <div className="text-xs font-black tabular-nums whitespace-nowrap" style={{ color: accentOrInk(team.color) }}>{item.val}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 더 보기 — 팀 특성 · 공격 리바 · 하이라이트 · 4요소 · 효율 (2026-10-26 한 번 접음, 지우지 않음) */}
            <button
              type="button"
              onClick={() => setMoreOpen(o => !o)}
              aria-expanded={moreOpen}
              className="mm-press w-full min-h-11 px-3 flex items-center justify-center gap-1.5 text-sm font-bold cursor-pointer transition-colors hover:bg-[color:var(--mm-yellow-soft)]"
              style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)', color: 'var(--mm-ink-soft)' }}
            >
              {moreOpen ? '접기' : '더 보기 · 공격 리바운드 · 팀 하이라이트 · 팀 특성'}
              <ChevronDown size={16} aria-hidden className={`transition-transform duration-200 ${moreOpen ? 'rotate-180' : ''}`} />
            </button>
            {moreOpen && (<>
            {/* D. 팀 특성 — 비율은 고리 게이지, 숫자는 고리 안 (2026-10-12) */}
            {computed && (
              <div>
                <p className="text-base font-black mb-3" style={{ color: 'var(--mm-ink)' }}>팀 특성</p>
                {/* 에이스 칸이 빠져 3장이면 폰 2열에서 마지막 한 장만 가운데로(왼쪽 반만 차던 것) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-sm:[&>:last-child:nth-child(odd)]:col-span-2 max-sm:[&>:last-child:nth-child(odd)]:justify-self-center max-sm:[&>:last-child:nth-child(odd)]:w-[calc(50%-5px)]">
                  {[
                    // 에이스(정규 득점 1위)가 없으면 0% 가 초록으로 '좋음'처럼 보인다 — 카드째 뺀다
                    ...(computed.byPpg ? [{
                      title: '에이스 의존도',
                      ratio: (computed.acePct / 100) as number | null,
                      value: `${computed.acePct.toFixed(0)}%`,
                      desc: '팀 득점 중 1위 비중',
                      color: computed.acePct > 40 ? 'var(--mm-negative)' : computed.acePct > 30 ? 'var(--mm-neutral-strong)' : 'var(--mm-positive)',
                    }] : []),
                    {
                      title: '외곽 스타일',
                      ratio: (computed.threePct / 100) as number | null,
                      value: `${computed.threePct.toFixed(0)}%`,
                      desc: '3점 시도 비율',
                      color: computed.threePct > 35 ? 'var(--mm-neutral-strong)' : 'var(--mm-yellow-strong)',
                    },
                    {
                      title: '수비 강도',
                      // 비율이 아니라 횟수라 고리를 채우지 않는다(임의 상한을 만들지 않음)
                      ratio: null as number | null,
                      value: computed.defPg.toFixed(1),
                      desc: '평균 스틸+블록',
                      color: computed.defPg > 5 ? 'var(--mm-positive)' : computed.defPg > 3 ? 'var(--mm-neutral-strong)' : 'var(--mm-muted)',
                    },
                    {
                      title: '자유투 성공률',
                      ratio: (computed.ftPct / 100) as number | null,
                      value: `${computed.ftPct.toFixed(0)}%`,
                      desc: '팀 클러치 지표',
                      color: computed.ftPct > 75 ? 'var(--mm-positive)' : computed.ftPct > 60 ? 'var(--mm-neutral-strong)' : 'var(--mm-negative)',
                    },
                  ].map(tile => (
                    <div key={tile.title} className="p-3 flex flex-col items-center text-center" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}>
                      {tile.ratio != null ? (
                        <Ring ratio={tile.ratio} size={72} stroke={7} color={tile.color} label={`${tile.title} ${tile.value}`}>
                          <span className="text-base font-black tabular-nums" style={{ color: tile.color }}>{tile.value}</span>
                        </Ring>
                      ) : (
                        <div
                          className="flex items-center justify-center rounded-full shrink-0"
                          style={{ width: 72, height: 72, border: '7px solid var(--mm-panel)' }}
                          role="img"
                          aria-label={`${tile.title} ${tile.value}`}
                        >
                          <span className="text-base font-black tabular-nums" style={{ color: tile.color }}>{tile.value}</span>
                        </div>
                      )}
                      <div className="t-label mt-2" style={{ color: 'var(--mm-ink)' }}>{tile.title}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>{tile.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* F·G·H. 팀 인사이트 (공격 리바 + 하이라이트 + 승리 4요소 + 효율) */}
            <TeamInsights
              leagueId={leagueId}
              teamId={teamId}
              quarterId={quarterId}
              teamColor={team.color}
            />
            </>)}

            {/* 선수별 표는 패널에 두지 않는다 — 아래 「팀별 선수」 섹션과 같은 표가 두 번 나왔다(2026-10-15) */}
          </>
        )}
      </div>

    </SectionCard>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────
function LeagueTeamsPageInner() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params

  // 명단 편집(옛 /roster 운영자 화면) — URL ?edit=1 이 단일 진실이라 새로고침·/roster 리다이렉트가 그대로 이어진다.
  // 운영자가 아니면 ?edit=1 이 있어도 무시한다(토글도 안 보인다).
  const { isEditMode, openLogin } = useLeagueEditMode()
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const editing = isEditMode && searchParams.get('edit') === '1'
  // 편집기에서 바꾼 명단·분기·팀은 이 페이지 로드 effect 의 의존성에 안 걸리므로, 편집을 닫을 때 재조회를 건다
  const [reloadKey, setReloadKey] = useState(0)
  function toggleEditing() {
    const qs = new URLSearchParams(searchParams.toString())
    if (editing) { qs.delete('edit'); setReloadKey(k => k + 1) }
    else qs.set('edit', '1')
    const q = qs.toString()
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false })
  }

  // 분기 선택은 리더보드·어워즈와 공유한다(페이지 이동 시 같은 분기 유지). 이름은 기존 참조를 살리려 그대로 둔다.
  // 분기 목록·기본 분기(지금 분기) 판정도 컨텍스트가 단일 출처다 — 여기서 /quarters 를 다시 부르지 않는다(2026-10-12).
  const {
    selectedQuarterId: selectedQId, setSelectedQuarterId: setSelectedQId,
    quarters, currentQuarter, ready: quarterCtxReady, reloadQuarters,
  } = useLeagueQuarter()

  // 편집기에서 분기를 추가·수정했을 수 있다 — 닫을 때만 컨텍스트의 목록을 다시 받는다(첫 진입은 컨텍스트가 이미 받는 중)
  useEffect(() => {
    if (reloadKey > 0) void reloadQuarters()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  // 팀 목록(분기 팀명·색 반영)은 명단 편집기만 쓴다 — 편집을 열 때만 받는다(2026-10-26, 보는 화면에선 요청 0)
  const [teams, setTeams] = useState<Team[]>([])
  useEffect(() => {
    if (!editing || !selectedQId) return
    let cancelled = false
    const url = selectedQId === 'all' ? `/api/leagues/${leagueId}/teams` : `/api/leagues/${leagueId}/teams?quarterId=${selectedQId}`
    fetch(url)
      .then(r => r.ok ? r.json() : null)
      .then(ts => { if (!cancelled && Array.isArray(ts)) setTeams(ts) })
      .catch(() => null)
    return () => { cancelled = true }
  }, [leagueId, selectedQId, editing, reloadKey])

  // 팀 정체성 그룹 (team_id × 분기 팀명) — 전체 뷰에서 5팀 노출
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
    // 특정 분기일 때만 온다(team-identities 4-1) — 최근 5경기 · 연승/연패 · 최근 경기일 · 승차
    form?: TeamForm | null
    games_behind?: number | null
    // withPlayers=1 — 이 정체성의 선수 기록(/stats?teamId=&quarterIds= 와 같은 캐시) · 정규 명단 · 리더
    players?: PlayerStat[]
    regular?: RegularPlayer[]
    leader_player_id?: string | null
  }
  type RegularPlayer = { id: string; name: string; number: number | null; position: string | null; photo_url: string | null }
  type TeamsData = { identities: TeamIdentity[]; unassigned: PlayerStat[]; games: GridGame[] }

  // 요청 정리(2026-10-26): 종전엔 /teams·/games·/stats·/leaders·/team-identities·정체성마다 /stats?teamId=·
  //   분기마다 /players·(전체면) 현재 분기 /stats 가 따로 나갔다(특정 분기 11회 · 「전체」 20회 안팎, 일부는 앞 응답을 기다림).
  //   지금은 team-identities?withPlayers=1 한 번이 같은 내용을 준다(+ 누적 맞대결 1회).
  const [data, setData] = useState<TeamsData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'login' | 'error'>('loading')
  const [loadedFor, setLoadedFor] = useState<string | null>(null)
  // 「전체」에서 비정규·게스트는 시즌 누적이 아니라 현재 분기 기준 — 비정규 참가자는 분기마다 바뀐다.
  // 「지금 분기」 정본(pickCurrentQuarter) — 컨텍스트가 고른다
  const currentQuarterId = currentQuarter?.id ?? null
  useEffect(() => {
    // 분기 목록이 오기 전엔 기본 분기가 아직 안 정해졌다 — 헛요청을 막는다
    if (!selectedQId || !quarterCtxReady) return
    let cancelled = false
    setStatus('loading')
    const qs = new URLSearchParams({ withPlayers: '1' })
    if (selectedQId !== 'all') qs.set('quarterId', selectedQId)
    else if (currentQuarterId) qs.set('unassignedQuarterId', currentQuarterId)
    fetch(`/api/leagues/${leagueId}/team-identities?${qs}`)
      .then(async r => {
        if (cancelled) return
        if (r.status === 401) { setStatus('login'); return }
        if (!r.ok) { setStatus('error'); return }
        const d = await r.json() as { identities?: TeamIdentity[]; unassigned_players?: PlayerStat[]; games?: GridGame[] }
        if (cancelled) return
        setData({ identities: d.identities ?? [], unassigned: d.unassigned_players ?? [], games: d.games ?? [] })
        setLoadedFor(selectedQId)
        setStatus('ok')
      })
      .catch(() => { if (!cancelled) setStatus('error') })
    return () => { cancelled = true }
  }, [leagueId, selectedQId, quarterCtxReady, currentQuarterId, reloadKey])

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null)
  const [statMode, setStatMode] = useState<StatMode>('basic')
  const [viewMode, setViewMode] = useState<'avg'|'total'>('avg')

  const identities = useMemo(() => data?.identities ?? [], [data])
  const games = data?.games ?? []
  // 분기 칩을 바꾼 직후 — 옛 분기 데이터를 새 분기 이름 아래 보이지 않게 아래 섹션을 자리로 바꾼다
  const dataLoading = status === 'loading' || loadedFor !== selectedQId

  // 정체성별 정규 선수 id — 팀 내 1위 후보이자 「비정규 선수 보기」 끔일 때 남길 행
  const regularIdsByIdentity = useMemo(() => {
    const m: Record<string, Set<string>> = {}
    for (const id of identities) m[id.key] = new Set((id.regular ?? []).map(r => r.id))
    return m
  }, [identities])

  // ── 데이터 가공 ───────────────────────────────────────────
  // 순위표: 정체성 API 데이터(팀명 override 반영, 전체 뷰에서 5팀 노출). identityKey 로 상대전적·탭을 고른다.
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
      form: id.form ?? null,
      gamesBehind: id.games_behind ?? null,
      leaderId: id.leader_player_id ?? null,
    }))
  }, [identities])

  // 팀 카드의 「상대 전적」 막대는 뺐다(2026-10-15) — 아래 「누적 맞대결」 섹션이 같은 대진 전적을 득실까지 보여 준다.

  // 팀별 선수 스탯: 이벤트 team_id 기준으로 나뉜 정체성별 기록 그대로
  // → 같은 선수가 여러 팀에서 뛰었으면 각 팀에 그 팀에서의 스탯만 표시됨
  // + 특정 분기면 정규 명단 선수가 스탯에 없을 때 0-fill 로 추가 (아직 안 뛴 분기 대응)
  const teamStats = useMemo(() => {
    const emptyStat = (r: RegularPlayer): PlayerStat => ({
      player_id: r.id,
      name: r.name,
      number: r.number,
      position: r.position,
      photo_url: r.photo_url,
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
      const statsArr = id.players ?? []
      const statPids = new Set(statsArr.map(p => p.player_id))
      const missing = selectedQId === 'all' ? [] : (id.regular ?? []).filter(r => !statPids.has(r.id))
      m[id.key] = [...statsArr, ...missing.map(emptyStat)]
    }
    return m
  }, [identities, selectedQId])

  // ── 팀별 선수 스탯 · 팀 탭 (2026-08-13) ────────────────────────────
  // 한 번에 한 팀만 그려 세로 길이를 1/3 로 줄인다. 기본 선택은 순위 1위 팀(standings[0]).
  // 사용자가 고른 팀은 유지하되, 분기를 바꿔 그 팀이 사라지면 다시 1위로 폴백한다(파생값 — setState 루프 없음).
  const [statsTeamKey, setStatsTeamKey] = useState<string | null>(null)
  // 「어시스트 · 공격 유형」은 「더 보기」로 접어 둔다(2026-10-26) — 열 때만 받는다
  const [teamView, setTeamView] = useState<'assist' | 'shots'>('assist')
  const [insightOpen, setInsightOpen] = useState(false)
  const insights = useTeamInsights(leagueId, selectedQId, insightOpen)
  const activeStatsTeamKey =
    statsTeamKey && standings.some(s => s.identityKey === statsTeamKey)
      ? statsTeamKey
      : (standings[0]?.identityKey ?? null)

  // 탭 전환 시 스크롤 튐 방지 — block:'nearest' 는 탭 바가 이미 보이면 아무것도 하지 않는다.
  const statsTabBarRef = useRef<HTMLDivElement>(null)
  const statsTabSwitched = useRef(false)
  useEffect(() => {
    if (!statsTabSwitched.current) return
    statsTabSwitched.current = false
    statsTabBarRef.current?.scrollIntoView({ block: 'nearest' })
  }, [statsTeamKey])

  // 주소의 `#team-<team_id>` 로 들어오면(홈 순위표 링크) 그 팀 카드로 내려가 상세를 펼친다.
  const handledHash = useRef<string | null>(null)
  useEffect(() => {
    if (dataLoading || standings.length === 0) return
    const openFromHash = () => {
      const m = /^#team-(.+)$/.exec(window.location.hash)
      if (!m) return
      const hash = window.location.hash
      if (handledHash.current === hash) return
      const target = standings.find(st => st.teamId === decodeURIComponent(m[1]))
      if (!target) return
      handledHash.current = hash
      setSelectedTeamId(target.identityKey)
      requestAnimationFrame(() => {
        document.getElementById(`team-${target.teamId}`)?.scrollIntoView({ block: 'start' })
      })
    }
    openFromHash()
    const onHashChange = () => { handledHash.current = null; openFromHash() }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [standings, dataLoading])

  // 비정규 섹션 — 어떤 팀 기록에도 들지 않은 선수(서버가 골라 준다).
  // 게스트 판정은 roster/page.tsx 와 같은 규칙(is_guest 또는 이름에 '게스트').
  const isGuest = (p: { name: string; is_guest?: boolean | null }) => Boolean(p.is_guest) || p.name.includes('게스트')
  const irregularStats = (data?.unassigned ?? []).filter(p => !isGuest(p))

  // 「비정규 선수 보기」 — 기본 켬, 끈 상태만 브라우저에 기억(리그별)
  const showIrregularKey = `league:${leagueId}:teams:showIrregular`
  const [showIrregular, setShowIrregular] = useState(true)
  useEffect(() => {
    try { setShowIrregular(localStorage.getItem(showIrregularKey) !== '0') } catch { /* private mode */ }
  }, [showIrregularKey])
  const toggleShowIrregular = (next: boolean) => {
    setShowIrregular(next)
    try { localStorage.setItem(showIrregularKey, next ? '1' : '0') } catch { /* private mode */ }
  }
  // 로그인한 회원의 팀 정체성 — 누적 맞대결 기본 대진을 「내 팀」 쪽으로. 이미 받은 명단·스탯에서 찾는다(추가 요청 없음).
  const myPlayerId = useOptionalCurrentUser()?.user?.player_id ?? null
  const myIdentityKey = useMemo(() => {
    if (!myPlayerId) return null
    let best: { key: string; gp: number } | null = null
    for (const id of identities) {
      const row = (id.players ?? []).find(p => p.player_id === myPlayerId)
      const regular = regularIdsByIdentity[id.key]?.has(myPlayerId) ?? false
      if (!row && !regular) continue
      // 정규 명단이면 출전이 0이어도 후보 — 출전일로 우열을 가리되 정규에 가산
      const score = (row?.gp ?? 0) + (regular ? 1000 : 0)
      if (!best || score > best.gp) best = { key: id.key, gp: score }
    }
    return best?.key ?? null
  }, [myPlayerId, identities, regularIdsByIdentity])

  // 팀별 선수 탭에 보일 행 — 게스트는 늘 빼고, 끔이면 정규 명단만
  const visibleTeamPlayers = (key: string) => (teamStats[key] ?? []).filter(p =>
    !isGuest(p) && (showIrregular || (regularIdsByIdentity[key]?.has(p.player_id) ?? false)))
  const scopeSuffix = selectedQId === 'all' ? ' (현재 분기)' : ''

  const base = `/league/${orgSlug}/${leagueId}`

  // 첫 진입 — 분기 목록·팀 데이터가 오기 전에는 화면 모양 자리만 깐다
  if (!quarterCtxReady || (status === 'loading' && !data)) return <div className="mm-brand"><TeamsSkeleton /></div>

  const editToggle = isEditMode && (
    <button
      type="button"
      onClick={toggleEditing}
      aria-pressed={editing}
      className="inline-flex items-center gap-1.5 px-3 min-h-11 min-w-11 rounded-md text-sm font-bold whitespace-nowrap border cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
      style={editing
        ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)', borderColor: 'var(--mm-ink)' }
        : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', borderColor: 'var(--mm-rule)' }}
    >
      <Pencil size={16} aria-hidden />
      {editing ? '편집 닫기' : '명단 편집'}
    </button>
  )

  // 분기가 하나도 없으면 순위를 그릴 수 없다. 분기 추가는 명단 편집의 「분기 관리」에서 한다(옛 /roster 링크 대체).
  if (quarters.length === 0) return (
    <div className="mm-brand space-y-4">
      <SectionCard variant="standalone">
        <div className="text-center py-12">
          <p className="text-sm" style={{ color: 'var(--mm-muted)' }}>아직 분기가 없어요</p>
          {editToggle && <div className="mt-3 flex justify-center">{editToggle}</div>}
        </div>
      </SectionCard>
      {editing && <RosterEditor leagueId={leagueId} quarterId={selectedQId} teams={teams} quarters={quarters} />}
    </div>
  )

  return (
    <div className="mm-brand space-y-4 lg:space-y-5">
      {/* 스탯 우산 서브탭 — 리더보드 · 팀 (2026-09-28 4→2, 어워즈·명단 흡수) */}
      <LeagueGroupTabs tabs={getStatsGroupTabs(base, 'teams')} />
      {/* ── 분기 버튼 탭 ── */}
      <SectionCard variant="standalone">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h2 className="font-black" style={{ color: 'var(--mm-ink)', fontSize: '28px', letterSpacing: '-0.005em', lineHeight: 1.15 }}>팀</h2>
          {editToggle}
        </div>
        <QuarterChips
          quarters={quarters.map(q => ({ id: q.id, label: `${String(q.year).slice(2)}.${q.quarter}Q`, isCurrent: q.is_current }))}
          value={selectedQId}
          onChange={setSelectedQId}
        />
      </SectionCard>

      {status === 'login' ? (
        // 401 — 선수 기록은 승인 회원만(리그 비공개 유지). 빈 화면 대신 한 줄 안내
        <SectionCard variant="standalone">
          <div className="text-center py-10 space-y-3">
            <p className="text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>팀 기록은 로그인한 회원만 볼 수 있어요</p>
            <button type="button" onClick={openLogin}
              className="mm-press inline-flex items-center justify-center min-h-11 px-4 text-sm font-bold cursor-pointer"
              style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)', borderRadius: 'var(--mm-radius-ctl)' }}>
              로그인
            </button>
          </div>
        </SectionCard>
      ) : status === 'error' ? (
        <SectionCard variant="standalone">
          <p className="text-sm text-center py-10" style={{ color: 'var(--mm-muted)' }}>팀 기록을 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.</p>
        </SectionCard>
      ) : dataLoading ? (
        <TeamsSkeleton />
      ) : (
        <>
        {/* ── 섹션 1: 팀별 전적 (상대 전적은 섹션 4 「누적 맞대결」) ── */}
        <div className="space-y-3">
          <h3 className="font-black" style={{ color: 'var(--mm-ink)', fontSize: '22px', letterSpacing: '-0.005em' }}>팀 전적</h3>

          {/* 팀 카드 그리드 — 정체성(identityKey) 기준. 전체 뷰에서 5팀 노출 */}
          {/* xl 4칸은 팀이 4개 이상일 때만 — 3팀이면 오른쪽 한 칸이 통째로 비었다(2026-10-15) */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ${standings.length >= 4 ? 'xl:grid-cols-4' : ''} gap-3`}>
            {standings.map((s, idx) => {
              const played = s.w + s.d + s.l
              const winPct = played > 0 ? (s.w / played * 100).toFixed(1) : '—'
              const isSelected = selectedTeamId === s.identityKey
              const isFirst = idx === 0
              // 바로가기 앵커 `#team-<team_id>` — 홈 순위표가 여기로 링크한다.
              //   identityKey 는 팀명(공백·한글)이 들어가 id 로 쓰기 나빠 team_id 를 쓴다.
              //   「전체」에서는 한 team_id 가 여러 정체성(분기별 팀명)으로 나올 수 있어 순위가 가장 높은 카드에만 단다.
              const anchorId = standings.findIndex(o => o.teamId === s.teamId) === idx ? `team-${s.teamId}` : undefined
              return (
                <div
                  key={s.identityKey}
                  id={anchorId}
                  className="overflow-hidden relative"
                  style={{
                    scrollMarginTop: '12px',
                    background: isFirst ? 'var(--mm-ink)' : 'var(--mm-panel)',
                    border: isSelected ? '2px solid var(--mm-ink)' : '1px solid var(--mm-rule)',
                    borderRadius: 'var(--mm-radius-card)',
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
                        <span className="font-bold block break-keep text-base sm:text-xl" style={{ color: isFirst ? 'var(--mm-panel)' : 'var(--mm-ink)', letterSpacing: '-0.005em', lineHeight: 1.15 }}>{s.displayName}</span>
                        {s.quarterLabels.length > 0 && selectedQId === 'all' && (
                          <span className="text-xs font-mono" style={{ color: isFirst ? 'color-mix(in srgb, var(--mm-panel) 60%, transparent)' : 'var(--mm-muted)' }}>{s.quarterLabels.join(' · ')}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-jersey font-black tabular-nums leading-none" style={{ color: isFirst ? 'var(--mm-panel)' : accentOrInk(s.color), fontSize: '28px' }}>{winPct}{played > 0 ? '%' : ''}</p>
                      <p className="text-xs font-bold mt-1" style={{ color: isFirst ? 'color-mix(in srgb, var(--mm-panel) 60%, transparent)' : 'var(--mm-muted)' }}>승률 · {played}경기</p>
                    </div>
                  </button>
                  {/* 승·무·패 막대 — 헤더 바로 아래 전체 폭 (2026-10-12: w-16 미니바 → RecordBar) */}
                  {played === 0 ? (
                    <p className="px-4 py-3 pl-5 text-xs" style={{ color: isFirst ? 'color-mix(in srgb, var(--mm-panel) 65%, transparent)' : 'var(--mm-muted)' }}>아직 마감된 경기가 없어요</p>
                  ) : (
                    <div className="px-4 py-3 pl-5">
                      <OnPanel>
                        <RecordBar wins={s.w} losses={s.l} draws={s.d} height={26} />
                      </OnPanel>
                      {s.form && (
                        <div className="mt-2">
                          <TeamFormLine form={s.form} gamesBehind={s.gamesBehind} onDark={isFirst} />
                        </div>
                      )}
                    </div>
                  )}
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
            return (
              <div className="relative">
                <button
                  className="absolute top-4 right-4 z-10 w-11 h-11 flex items-center justify-center transition-colors cursor-pointer hover:bg-[color:var(--mm-yellow-soft)]"
                  style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)', borderRadius: 'var(--mm-radius-ctl)' }}
                  onClick={() => setSelectedTeamId(null)}
                  aria-label="패널 닫기"
                >
                  <X size={14} />
                </button>
                <TeamDetailPanel
                  teamId={selStanding.teamId}
                  team={teamForPanel}
                  standing={{ w: selStanding.w, d: selStanding.d, l: selStanding.l, gf: selStanding.gf, ga: selStanding.ga, teamId: selStanding.teamId }}
                  players={teamStats[selectedTeamId] ?? []}
                  regularIds={regularIdsByIdentity[selectedTeamId] ?? EMPTY_IDS}
                  leagueId={leagueId}
                  quarterId={selectedQId}
                />
              </div>
            )
          })()}
        </div>

        {/* 명단 편집 중에는 팀별 선수 이하(섹션 2~4)를 편집 화면(아래 RosterEditor)이 대신한다 */}
        {!editing && (<>
        {/* 화면 순서(2026-10-26): 팀 전적 → 팀별 선수 → 승패 흐름 → 누적 맞대결.
            「어시스트 · 공격 유형」은 팀별 선수 표 아래 「더 보기」에 접어 둔다(2026-10-18 합침 · 팀 필터는 한 벌) */}

        {/* ── 섹션 2: 팀별 선수 ── */}
        <div className="space-y-3">
          {/* 제목 · 보기 토글 · 읽는 법 · 팀 탭 — 한 카드로 묶는다(배경 위에 글자만 떠 있지 않게, 2026-10-13) */}
          <SectionCard variant="standalone" pad="none" ariaLabel="팀별 선수">
          <SectionHeader
            title="팀별 선수"
            description="팀을 고르면 그 팀 선수 기록이 나와요"
          />
          <div className="px-4 py-3 lg:px-6 lg:py-4 space-y-3">
            {/* 390px 에서 두 토글 묶음이 한 줄에 안 들어가 페이지가 406px 로 넘쳤다(글자 13.6px 로 키운 뒤).
                묶음 단위로 줄바꿈하게 두고 버튼은 44px 터치 높이·줄바꿈 금지. */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* 기본 / 슈팅 / 고급 — 스탯 탭과 같은 이름 */}
              <div className="flex overflow-hidden shrink-0" style={{ border: '1px solid var(--mm-rule)' }}>
                {([
                  { k: 'basic'    as StatMode, label: '기본' },
                  { k: 'shooting' as StatMode, label: '슈팅' },
                  { k: 'advanced' as StatMode, label: '고급' },
                ]).map(({ k, label }) => {
                  const active = statMode === k
                  return (
                    <button key={k} onClick={() => setStatMode(k)} aria-pressed={active}
                      className="px-3 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors duration-200 min-h-11"
                      style={{
                        background: active ? 'var(--mm-ink)' : 'var(--mm-panel)',
                        color: active ? 'var(--mm-panel)' : 'var(--mm-muted)',
                      }}>
                      {label}
                    </button>
                  )
                })}
              </div>
              {/* 평균 / 누적 (기본 보기에서만 의미) */}
              <div className={`flex overflow-hidden shrink-0 ${statMode !== 'basic' ? 'opacity-40 pointer-events-none' : ''}`} style={{ border: '1px solid var(--mm-rule)' }}>
                {(['avg','total'] as const).map(m => {
                  const active = viewMode === m
                  return (
                    <button key={m} onClick={() => setViewMode(m)} aria-pressed={active}
                      className="px-3 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors duration-200 min-h-11"
                      style={{
                        background: active ? 'var(--mm-ink)' : 'var(--mm-panel)',
                        color: active ? 'var(--mm-panel)' : 'var(--mm-muted)',
                      }}>
                      {m === 'avg' ? '하루 평균' : '누적'}
                    </button>
                  )
                })}
              </div>
              {/* 비정규 선수 보기 — 끄면 비정규 섹션과 팀 탭의 비정규 행이 함께 숨는다 */}
              <label
                className="inline-flex items-center gap-2 px-3 min-h-11 text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors duration-200 shrink-0 hover:bg-[color:var(--mm-panel-alt)] focus-within:ring-2 focus-within:ring-[color:var(--mm-yellow)] focus-within:ring-offset-1"
                style={{ border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)', background: 'var(--mm-panel)' }}
              >
                <input
                  type="checkbox"
                  checked={showIrregular}
                  onChange={e => toggleShowIrregular(e.target.checked)}
                  className="w-4 h-4 cursor-pointer focus:outline-none"
                  style={{ accentColor: 'var(--mm-ink)' }}
                />
                비정규 선수 보기
              </label>
              {/* 「숫자 읽는 법」 — 스탯 탭과 같은 시트(glossary.ts READING_GUIDE 하나). 종전 팀 탭 전용 접힘 상자는 없앴다(2026-10-15) */}
              <StatsGlossarySheet className="shrink-0" />
            </div>


          {/* 팀 탭 — 팀을 세로로 잇지 않고 한 번에 하나만 그린다 (2026-08-13, 스크롤 단축).
              계층 구분: 상위 스탯 우산탭(LeagueGroupTabs)은 밑줄형, 분기·모드 세그먼트는 ink 채움형이라
              팀 탭은 '팀 컬러 테두리 칩'으로 셋 다 겹치지 않게 했다.
              ⚠ 팀 컬러 대비: **라벨 텍스트에는 팀 컬러를 쓰지 않는다.** ink 토큰으로 4.5:1 을
              보장하고, 팀 컬러는 2px 테두리 · 12% 틴트 배경 · 점 — 비텍스트 요소로만 내보낸다.
              활성 표시(테두리·배경)에도 팀 컬러를 쓰지 않는다 — 새 동호회가 어떤 색을 골라도
              흰 패널 위에서 사라지지 않아야 한다. 팀 구분은 원색 점 + 안쪽 1px 링이 맡는다. */}
          <div
            ref={statsTabBarRef}
            role="tablist"
            aria-label="팀별 선수 · 팀 선택"
            className="flex gap-2 overflow-x-auto scrollbar-hide"
            style={{ scrollMarginTop: '12px' }}
          >
            {standings.map((s, i) => {
              const on = s.identityKey === activeStatsTeamKey
              const count = visibleTeamPlayers(s.identityKey).length
              return (
                <button
                  key={s.identityKey}
                  role="tab"
                  // ⚠ DOM id 에 identityKey 를 쓰지 않는다 — identityKey 는 `${team_id}::${팀명}` 이라
                  // 팀명의 공백이 그대로 들어간다. aria-controls 는 ID '목록'이라 공백이 있으면
                  // 두 개의 잘못된 참조로 쪼개져 탭↔패널 연결이 끊긴다. 인덱스로 만든다.
                  id={`stats-team-tab-${i}`}
                  aria-selected={on}
                  aria-controls={`stats-team-panel-${i}`}
                  onClick={() => { statsTabSwitched.current = true; setStatsTeamKey(s.identityKey) }}
                  className="shrink-0 min-h-[44px] flex items-center gap-2 px-4 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                  style={{
                    // 활성/비활성 모두 테두리 2px — 폭이 변하지 않아 전환 시 옆 칩이 밀리지 않는다
                    // ⚠ 활성 표시에 팀 컬러를 쓰지 않는다. 팀 컬러는 동호회가 자유롭게 고르는 값이라
                    //   흰색·노랑이면 흰 패널 위에서 테두리가 사라진다(실제 팀 셋 중 둘이 그렇다).
                    //   활성은 ink 로 일관되게 표시하고, 팀 정체성은 아래 '점'이 맡는다 —
                    //   점은 원색 + 안쪽 1px 링이라 어떤 색이든 형태가 남는다.
                    border: `2px solid ${on ? 'var(--mm-ink)' : 'var(--mm-rule)'}`,
                    borderRadius: 'var(--mm-radius-chip)',
                    background: on ? 'var(--mm-panel-alt)' : 'var(--mm-panel)',
                    color: on ? 'var(--mm-ink)' : 'var(--mm-muted)',
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
                  {/* 활성 = 굵기(색만으로 전달 금지). 굵어지면 폭이 늘어 옆 칩이 밀리므로
                      bold 사본을 invisible 로 겹쳐 두어 폭을 미리 예약한다 — 전환 시 이동 0. */}
                  <span className="grid text-sm whitespace-nowrap">
                    <span aria-hidden className="col-start-1 row-start-1 font-bold invisible">{s.displayName}</span>
                    <span className={`col-start-1 row-start-1 ${on ? 'font-bold' : 'font-medium'}`}>{s.displayName}</span>
                  </span>
                  <span className="text-xs tabular-nums" style={{ color: on ? 'var(--mm-ink-soft)' : 'var(--mm-muted)' }}>{count}</span>
                </button>
              )
            })}
          </div>
          </div>
          </SectionCard>

          {standings.filter(s => s.identityKey === activeStatsTeamKey).map(s => {
            const players = visibleTeamPlayers(s.identityKey)
            const leaderId = s.leaderId
            return (
              <div
                key={s.identityKey}
                role="tabpanel"
                id={`stats-team-panel-${standings.indexOf(s)}`}
                aria-labelledby={`stats-team-tab-${standings.indexOf(s)}`}
              >
              <SectionCard variant="standalone" pad="none" className="relative">
                {/* 팀 컬러 좌측 accent bar */}
                <div className="absolute top-0 left-0 bottom-0 w-1" style={{ background: s.color }} aria-hidden />
                <div className="px-4 py-3 pl-5 lg:px-6 flex items-center gap-2" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: '18px', letterSpacing: '-0.005em' }}>{s.displayName}</span>
                  {s.quarterLabels.length > 0 && selectedQId === 'all' && (
                    <span className="text-xs font-mono" style={{ color: 'var(--mm-muted)' }}>· {s.quarterLabels.join(', ')}</span>
                  )}
                  <span className="text-xs font-bold tracking-wider ml-1" style={{ color: 'var(--mm-muted)' }}>{players.length}명</span>
                </div>
                <div className="px-4 py-3 pl-5 lg:px-6 lg:py-4">
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
                        <span className="text-xs font-black" style={{ letterSpacing: '0.08em' }}>선수단 보기 · {players.length}명</span>
                        <ChevronDown
                          size={14}
                          aria-hidden
                          className="transition-transform duration-200 group-open:rotate-180"
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
                                  <span className="t-num font-bold" style={{ color: textOnBg(s.color), fontSize: '18px' }}>
                                    {p.name.length > 1 ? p.name.slice(1) : p.name}
                                  </span>
                                </div>
                              )}
                            </div>
                            <PlayerName id={p.player_id} name={p.name} hitArea={false} className="block w-full text-center text-xs font-bold mt-1 truncate min-h-6" style={{ color: 'var(--mm-ink-soft)' }} />
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                  {/* 선수가 없는 팀도 탭은 남긴다(개수가 흔들리면 안 되므로). 빈 상태 문구는 StatsTable 이 갖고 있다. */}
                  <StatsTable
                    players={players}
                    leaderId={leaderId}
                    color={s.color}
                    viewMode={viewMode}
                    statMode={statMode}
                  />
                  {/* 더 보기 — 시즌 어시스트 · 공격 유형(2026-10-18 이 칸에 합침 · 2026-10-26 접음). 열 때만 받는다 */}
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => setInsightOpen(o => !o)}
                      aria-expanded={insightOpen}
                      className="mm-press w-full min-h-11 px-3 flex items-center justify-center gap-1.5 text-sm font-bold cursor-pointer transition-colors hover:bg-[color:var(--mm-yellow-soft)]"
                      style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)', color: 'var(--mm-ink-soft)' }}
                    >
                      {insightOpen ? '접기' : '더 보기 · 어시스트 · 공격 유형'}
                      <ChevronDown size={16} aria-hidden className={`transition-transform duration-200 ${insightOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {insightOpen && (
                      <div className="mt-3 space-y-3">
                        <SegmentedTabs
                          ariaLabel="더 보기 항목"
                          value={teamView}
                          onChange={setTeamView}
                          fullWidth
                          items={[
                            { key: 'assist', label: '어시스트' },
                            { key: 'shots', label: '공격 유형' },
                          ] as const}
                        />
                        <TeamInsightView
                          data={insights}
                          teamKey={s.identityKey}
                          view={teamView}
                          scopeText={selectedQId === 'all' ? '시즌 전체' : '이 분기'}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </SectionCard>
              </div>
            )
          })}
        </div>

        {/* ── 섹션 2-1: 비정규 선수 스탯 ── */}
        {showIrregular && irregularStats.length > 0 && (
          <div>
            <SectionCard variant="standalone" pad="none" ariaLabel="비정규 선수">
              <SectionHeader
                title={`비정규 선수${scopeSuffix}`}
                description="팀을 정하지 않고 경기에 나온 선수예요"
              />
              <div className="px-4 py-3 lg:px-6 flex items-center gap-2" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                <span className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: '16px' }}>비정규 참가자</span>
                <span className="text-xs font-bold tracking-wider tabular-nums" style={{ color: 'var(--mm-muted)' }}>{irregularStats.length}명</span>
              </div>
              <div className="px-4 py-3 lg:px-6 lg:py-4">
                <StatsTable
                  players={irregularStats}
                  viewMode={viewMode}
                  statMode={statMode}
                />
              </div>
            </SectionCard>
          </div>
        )}

        {/* ── 섹션 3: 승패 흐름 (2026-10-25) — 팀마다 경기 단위 점 + 최장 연승·연패 (lib/stats/teamStreaks.ts) ── */}
        <SectionCard variant="standalone" pad="none" ariaLabel="승패 흐름">
          <SectionHeader
            title="승패 흐름"
            description={`${selectedQId === 'all' ? '시즌 전체' : '이 분기'} 경기마다 승·무·패 점 · 최장 연승·연패`}
          />
          <div className="px-4 py-3 lg:px-6 lg:py-4">
            <TeamDailyRecordGrid
              games={games}
              teams={identities.map(id => ({ key: id.key, team_id: id.team_id, name: id.display_name, color: id.color, quarter_ids: id.quarter_ids }))}
            />
          </div>
        </SectionCard>

        {/* ── 섹션 4: 누적 맞대결 (2026-10-10) — 날짜별 「팀별 비교」를 분기·전체로 쌓은 것 ── */}
        <HeadToHeadSection leagueId={leagueId} quarterId={selectedQId} myTeamKey={myIdentityKey} />

        </>)}
        </>
      )}
      {/* dataLoading 분기 밖에 둔다 — 분기 칩을 바꿀 때 편집 중인 폼·펼침 상태가 날아가지 않게 */}
      {editing && <RosterEditor leagueId={leagueId} quarterId={selectedQId} teams={teams} quarters={quarters} />}
    </div>
  )
}

// useSearchParams 는 Suspense 경계 내에서 호출해야 하므로 default export 에서 감싼다(stats 페이지와 같은 패턴).
export default function LeagueTeamsPage() {
  return (
    <Suspense fallback={<div className="mm-brand"><TeamsSkeleton /></div>}>
      <LeagueTeamsPageInner />
    </Suspense>
  )
}
