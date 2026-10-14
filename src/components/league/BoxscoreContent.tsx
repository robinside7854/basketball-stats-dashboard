'use client'
import { useOpenPlayerCard } from '@/contexts/PlayerCardContext'
import PlayerCardName from '@/components/league/ui/PlayerName'
// 일별 박스스코어 콘텐츠 — 페이지에서 사용
//
// 기존 DailyBoxscoreModal 의 콘텐츠 로직을 그대로 이식한 재사용 뷰.
// 모달 크롬(오버레이/닫기/focus trap/aria-modal/ESC)은 제거하고
// 페이지 컨텍스트에서 렌더되도록 조정.
//
// 탭 구조 (2026-10-12 재구성): 경기결과(팀 전적 · 스탯 리더 · 경기 카드) · 선수 기록(하루 합산표)
//   · 공격 유형(슛 유형별 비중·야투율) · 팀별 비교 · 어시스트(네트워크). 경기별 박스스코어는 경기 카드를 펼친 안에서 팀별로 나눠 본다.
import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { Loader2, ChevronDown, ChevronUp, ChevronsUpDown, Youtube, Trophy, Camera, Flame, Hand, Handshake, Shield, Zap, Target, Sparkles, ExternalLink, CalendarX } from 'lucide-react'
import { toast } from 'sonner'
import { textOnBg, accentOrInk } from '@/lib/util/contrastColor'
import { doubleDoubleKind } from '@/lib/stats/doubleDouble'
import { ProgressBar } from '@/components/league/ui/viz'
import Avatar from '@/components/league/ui/Avatar'
import EmptyState from '@/components/league/ui/EmptyState'
import SegmentedTabs from '@/components/league/ui/SegmentedTabs'
// html-to-image 는 카메라 버튼 클릭 시에만 필요 → 동적 로드로 초기 번들에서 제거
import ShareableBoxscore from '@/components/league/ShareableBoxscore'
import HeadToHeadBars from '@/components/league/HeadToHeadBars'
import AssistNetwork, { type AssistLink } from '@/components/league/boxscore/AssistNetwork'
import ShotTypeBreakdown, { type ShotTypeRow } from '@/components/league/boxscore/ShotTypeBreakdown'

// 큰 모달(선수 카드) — 이름을 눌렀을 때만 로드한다(초기 번들 제외)

/** 선수 id → DD/TD. 넘겨받은 줄 기준이다 — 하루 합산표엔 하루 합산, 경기별 표엔 그 경기 한 줄.
 *  (종전엔 경기별 표에도 하루 합산 판정이 붙어, 그 경기 기록으로는 DD 가 아닌 선수에게 DD 가 떴다.) */
type DdMap = Map<string, 'DD' | 'TD'>

function ddMapOf(rows: { player_id: string; pts: number; reb: number; ast: number; stl: number; blk: number }[]): DdMap {
  return new Map(
    rows
      .map(d => [d.player_id, doubleDoubleKind(d)] as const)
      .filter((e): e is readonly [string, 'DD' | 'TD'] => e[1] !== null),
  )
}

/** 이름 클릭 핸들러. 없으면 이름은 버튼이 아니라 글자 그대로 그린다. */
type PlayerPick = (playerId: string, name: string) => void

const DD_LABEL = { DD: '더블더블', TD: '트리플더블' } as const

// DD/TD 칩. TD 는 채움(노랑), DD 는 테두리만 — 눈에 띄는 정도를 다르게 둔다.
function DdChip({ kind }: { kind: 'DD' | 'TD' }) {
  const full = DD_LABEL[kind]
  return (
    <span
      title={full}
      aria-label={full}
      className="inline-flex items-center px-1.5 text-xs font-black tracking-wider whitespace-nowrap shrink-0 align-middle"
      style={kind === 'TD'
        ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }
        : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}
    >{kind}</span>
  )
}

function DdLegend() {
  return (
    <p className="t-label" style={{ color: 'var(--mm-muted)' }}>
      DD = 더블더블 (득점·리바운드·어시스트·스틸·블락 중 2개가 두 자릿수) · TD = 트리플더블 (3개 이상)
    </p>
  )
}

type PlayerRow = {
  player_id: string; name: string; number: number | null
  /** 이름 옆 얼굴 — 없으면 Avatar 가 첫 글자로 대체 */
  photo_url?: string | null
  team_id: string | null; team_name: string | null; team_color: string | null
  pts: number; reb: number; oreb: number; dreb: number
  ast: number; stl: number; blk: number; tov: number; pf: number
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
  fg_pct: number | null; fg3_pct: number | null
}

type GameData = {
  id: string; slot_num: number; round_num: number
  is_complete: boolean; is_started: boolean
  home_score: number; away_score: number
  home_team: { id: string; name: string; color: string } | null
  away_team: { id: string; name: string; color: string } | null
  youtube_url: string | null; youtube_start_offset: number
  /** 쿼터별 스코어. 쿼터를 나누지 않은 경기는 항목이 1개(또는 0개)라 화면에 그리지 않는다. */
  quarter_scores?: { quarter: number; home: number; away: number }[]
  players: PlayerRow[]
  /** 이 경기를 이루는 슬롯 번호. 대진 롤업으로 여러 슬롯이 묶이면 2개 이상이 된다(쿼터별 영상 등). */
  slot_nums?: number[]
  /** 묶인 슬롯 id 전부 — ?game= 딥링크가 중간 슬롯을 가리켜도 이 경기를 찾아야 한다. */
  slot_ids?: string[]
  /** 슬롯마다 붙은 영상. 쿼터별로 쪼갠 날은 여러 개다. */
  // quarter 가 있으면 경기 하나에 붙은 쿼터 영상(대회), 없으면 슬롯마다 붙은 영상(친선전).
  videos?: { slot_num: number; quarter?: number | null; url: string; start_offset: number }[]
}

type DailyStat = {
  player_id: string; name: string; number: number | null; gp: number
  team_id: string | null; team_name: string | null; team_color: string | null
  /** "그날의 주인공" 히어로용 (2026-08-10) — daily-boxscore route 가 league_players 에서 조회해 실어줌 */
  photo_url?: string | null
  pts: number; reb: number; oreb: number; dreb: number
  ast: number; stl: number; blk: number; tov: number; pf: number
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
  fg_pct: number | null; fg3_pct: number | null
}

type TeamAgg = {
  id: string; name: string; color: string | null
  pts: number; reb: number; oreb: number; dreb: number
  ast: number; stl: number; blk: number; tov: number; pf: number
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
}

// 5·6 은 league_game_events.quarter CHECK(1~6) 상한에서 온 연장 슬롯이다.
const quarterLabel = (q: number) => (q <= 4 ? `${q}Q` : q === 5 ? '연장' : '연장2')

type ColDef = { key: string; label: string; sortKey?: string }

interface Props {
  leagueId: string
  date: string
  /** 공유 이미지 헤더에 표기할 리그 이름 (없으면 기본값) */
  leagueName?: string
  /** 이 경기를 펼친 채로 연다. 명경기 카드처럼 "그날"이 아니라 "그 경기"로 보내는 진입점용.
   *  하루에 여러 경기가 열리므로, 날짜만 넘기면 어느 경기였는지 다시 찾아야 한다. */
  initialGameId?: string
}

// 선수명. 누르면 선수 카드 모달이 열린다 — 글자 크기·굵기·색은 기존 그대로 두고
// 눌린다는 신호(커서·밑줄·포커스 링)만 더한다. player_id 가 없으면 글자로만 그린다.
function PlayerName({ row, onPlayerPick, className = 'whitespace-nowrap' }: { row: PlayerRow | DailyStat; onPlayerPick?: PlayerPick; className?: string }) {
  const base = `font-semibold text-base ${className}`
  if (!onPlayerPick || !row.player_id) {
    return <span className={base} style={{ color: 'var(--mm-ink)' }}>{row.name}</span>
  }
  return (
    <button
      type="button"
      onClick={() => onPlayerPick(row.player_id, row.name)}
      title={`${row.name} 선수 카드 열기`}
      className={`${base} text-left cursor-pointer hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]`}
      style={{ color: 'var(--mm-ink)' }}
    >{row.name}</button>
  )
}

/** 얼굴 테두리 — 팀 색을 두 테마 대비에 맞춰(accentOrInk). 팀을 모르면 null → Avatar 의 1px rule */
const ringOf = (color: string | null | undefined) => color ? accentOrInk(color) : null

const ftPct = (r: { ftm: number; fta: number }) => r.fta > 0 ? Math.round(r.ftm / r.fta * 1000) / 10 : null

/** 팀 합계 한 줄 — 경기별 표의 맨 아래 */
type TotalLine = Omit<PlayerRow, 'player_id' | 'name' | 'number' | 'photo_url' | 'team_id' | 'team_name' | 'team_color'>

function sumLine(rows: PlayerRow[]): TotalLine {
  const t = { pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0 }
  for (const r of rows) for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += r[k] ?? 0
  const pct = (m: number, a: number) => a > 0 ? Math.round(m / a * 1000) / 10 : null
  return { ...t, fg_pct: pct(t.fgm, t.fga), fg3_pct: pct(t.fg3m, t.fg3a) }
}

/** 합계 줄 옵션 — label 기본 「팀 합계」, gp 를 주면 G 칸에 그 값(하루 합산표 = 그날 경기 수) */
type TotalOpts = { label?: string; gp?: number }

function StatTable({ rows, showGP = false, ddKinds, onPlayerPick, total, totalOpts }: { rows: (PlayerRow | DailyStat)[]; showGP?: boolean; ddKinds?: DdMap; onPlayerPick?: PlayerPick; total?: TotalLine; totalOpts?: TotalOpts }) {
  const [sortKey, setSortKey] = useState('pts')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const COLS: ColDef[] = [
    ...(showGP ? [{ key: 'gp', label: 'G', sortKey: 'gp' }] : []),
    { key: 'pts',     label: 'PTS',  sortKey: 'pts'  },
    { key: 'reb',     label: 'REB',  sortKey: 'reb'  },
    { key: 'oreb',    label: 'OR',   sortKey: 'oreb' },
    { key: 'dreb',    label: 'DR',   sortKey: 'dreb' },
    { key: 'ast',     label: 'AST',  sortKey: 'ast'  },
    { key: 'stl',     label: 'STL',  sortKey: 'stl'  },
    { key: 'blk',     label: 'BLK',  sortKey: 'blk'  },
    { key: 'tov',     label: 'TOV',  sortKey: 'tov'  },
    { key: 'fgm_fga', label: 'FG',   sortKey: 'fgm'  },
    { key: 'fg_pct',  label: 'FG%',  sortKey: 'fg_pct' },
    { key: 'fg3m_fg3a', label: '3P', sortKey: 'fg3m' },
    { key: 'fg3_pct', label: '3P%',  sortKey: 'fg3_pct' },
    { key: 'ftm_fta', label: 'FT',   sortKey: 'ftm'  },
    { key: 'ft_pct',  label: 'FT%',  sortKey: 'ft_pct' },
    { key: 'pf',      label: 'PF',   sortKey: 'pf'   },
  ]

  function handleSort(sk: string) {
    if (sk === sortKey) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(sk); setSortDir('desc') }
  }

  const sorted = [...rows].sort((a, b) => {
    const rr = (x: PlayerRow | DailyStat) => sortKey === 'ft_pct' ? (ftPct(x) ?? 0) : (x as Record<string, unknown>)[sortKey] as number ?? 0
    const diff = rr(a) - rr(b)
    return sortDir === 'desc' ? -diff : diff
  })

  function cellVal(rr: TotalLine & { gp?: number }, key: string): string {
    if (key === 'gp')       return String(rr.gp ?? 1)
    if (key === 'pts')      return String(rr.pts)
    if (key === 'reb')      return String(rr.reb)
    if (key === 'oreb')     return String(rr.oreb ?? 0)
    if (key === 'dreb')     return String(rr.dreb ?? 0)
    if (key === 'ast')      return String(rr.ast)
    if (key === 'stl')      return String(rr.stl)
    if (key === 'blk')      return String(rr.blk)
    if (key === 'tov')      return String(rr.tov)
    if (key === 'fgm_fga')  return `${rr.fgm}/${rr.fga}`
    if (key === 'fg_pct')   return rr.fg_pct  != null ? `${rr.fg_pct}%`  : '—'
    if (key === 'fg3m_fg3a') return `${rr.fg3m}/${rr.fg3a}`
    if (key === 'fg3_pct')  return rr.fg3_pct != null ? `${rr.fg3_pct}%` : '—'
    if (key === 'ftm_fta')  return `${rr.ftm}/${rr.fta}`
    if (key === 'ft_pct')   { const v = ftPct(rr); return v != null ? `${v}%` : '—' }
    if (key === 'pf')       return String(rr.pf ?? 0)
    return '—'
  }

  return (
    <div className="overflow-x-auto">
      {/* 셀 크기·굵기는 globals.css 의 t-th / t-td / t-td-key 가 정본이다(가독성 업그레이드 2026-09-18).
          여기서 text-sm 같은 크기를 다시 주면 11벌 표가 또 갈라진다. 숫자는 본문체 tabular. */}
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}>
            <th
              className="t-th text-left px-3 sticky left-0 min-w-[150px]"
              style={{ background: 'var(--mm-panel-alt)' }}
            >선수 / 팀</th>
            {COLS.map(c => {
              const isActive = sortKey === c.sortKey
              return (
                <th key={c.key}
                  onClick={() => c.sortKey && handleSort(c.sortKey)}
                  className="t-th cursor-pointer select-none transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-inset"
                  style={isActive ? { color: 'var(--mm-yellow-strong)' } : undefined}>
                  {c.label}
                  {c.sortKey && (isActive
                    ? (sortDir === 'desc' ? <ChevronDown size={14} className="inline ml-0.5" /> : <ChevronUp size={14} className="inline ml-0.5" />)
                    : <ChevronsUpDown size={14} className="inline ml-0.5 opacity-30" />)}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const rr = r as PlayerRow & DailyStat
            const rowBg = i % 2 === 0 ? 'var(--mm-panel)' : 'var(--mm-panel-alt)'
            return (
              <tr
                key={rr.player_id}
                style={{ borderBottom: '1px solid var(--mm-rule)', background: rowBg }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--mm-yellow-soft)' }}
                onMouseLeave={e => { e.currentTarget.style.background = rowBg }}
              >
                <td className="py-2 px-3 sticky left-0" style={{ background: 'inherit' }}>
                  <div className="flex items-center gap-2">
                    {/* 팀 색 점 대신 얼굴(팀 색 테두리) — 점(8px)보다 16px 넓을 뿐이라 이름 칸 min-w 안에 든다 */}
                    <Avatar src={rr.photo_url} name={rr.name} size={24} ringColor={ringOf(rr.team_color)} decorative />
                    <div className="leading-tight min-w-0">
                      {/* 선수명은 본문체 600 — 유니폼체(좁음)와 900 굵기를 뺀 것이 이번 작업의 요지 */}
                      <span className="flex items-center gap-1.5 min-w-0">
                        <PlayerName row={rr} onPlayerPick={onPlayerPick} />
                        {ddKinds?.get(rr.player_id) && <DdChip kind={ddKinds.get(rr.player_id)!} />}
                      </span>
                      {rr.team_name && <p className="text-xs leading-tight mt-0.5" style={{ color: 'var(--mm-muted)' }}>{rr.team_name}</p>}
                    </div>
                  </div>
                </td>
                {COLS.map(c => {
                  const isActive = sortKey === c.sortKey
                  // 강조는 굵기(t-td-key = 700)로만. 예전엔 인라인 900 이라 토큰 하향을 안 탔다.
                  // OR/DR 색은 토큰 — 하드코딩 주황·파랑이 라이트 3.9:1 / 다크 3.17:1 로 미달이었다.
                  const key = isActive || c.key === 'pts'
                  const color = isActive ? 'var(--mm-yellow-strong)'
                    : c.key === 'oreb' ? 'var(--mm-or)'
                    : c.key === 'dreb' ? 'var(--mm-dr)'
                    : undefined
                  return (
                    <td key={c.key} className={key ? 't-td-key' : 't-td'} style={color ? { color } : undefined}>
                      {cellVal(rr, c.key)}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
        {total && (
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}>
              <th scope="row" className="t-th text-left px-3 sticky left-0" style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)' }}>{totalOpts?.label ?? '팀 합계'}</th>
              {COLS.map(c => (
                <td key={c.key} className="t-td-key" style={{ color: 'var(--mm-ink)' }}>
                  {c.key === 'gp' ? (totalOpts?.gp != null ? String(totalOpts.gp) : '') : cellVal(total, c.key)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

// 모바일 카드 뷰 — 세로 스택, 스크롤 없이 한눈에 요약
// 카드 본문 숫자 격자 — 선수 카드와 팀 합계 카드가 같이 쓴다.
//   본문은 17px(text-base). 12.75px 한 단계에 몰려 있던 것이 모바일 가독성의 주범이었다.
//   값 숫자는 본문체 tabular(t-num) 600. 라벨은 한 단계 작게 둬 360px 에서 4칸이 한 줄에 든다.
function L({ children }: { children: ReactNode }) {
  return <span className="text-sm" style={{ color: 'var(--mm-muted)' }}>{children} </span>
}
function V({ children }: { children: ReactNode }) {
  return <span className="t-num font-semibold" style={{ color: 'var(--mm-ink)' }}>{children}</span>
}

function LineGrid({ r }: { r: TotalLine }) {
  const ft = ftPct(r)
  return (
    <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-base tabular-nums">
      <div><L>REB</L><V>{r.reb}</V></div>
      <div><L>AST</L><V>{r.ast}</V></div>
      <div><L>STL</L><V>{r.stl}</V></div>
      <div><L>BLK</L><V>{r.blk}</V></div>
      <div><L>TOV</L><V>{r.tov}</V></div>
      <div><L>PF</L><V>{r.pf ?? 0}</V></div>
      <ShootCell label="FT" made={r.ftm} att={r.fta} pct={ft} />
      <ShootCell label="FG" made={r.fgm} att={r.fga} pct={r.fg_pct} />
      <ShootCell label="3P" made={r.fg3m} att={r.fg3a} pct={r.fg3_pct} />
    </div>
  )
}

// 슛 한 칸 — 「m/a (pct%)」 글자 아래 성공/시도 미니 막대. 카드 높이가 거의 안 늘게 4px.
//   시도가 0이면 막대를 빈 채로 둬 칸 높이를 맞춘다(옆 칸과 줄이 어긋나지 않게).
function ShootCell({ label, made, att, pct }: { label: string; made: number; att: number; pct: number | null }) {
  return (
    <div className="col-span-2">
      <L>{label}</L><V>{made}/{att}</V>{pct != null && <span className="text-sm" style={{ color: 'var(--mm-muted)' }}> ({pct}%)</span>}
      <ProgressBar value={made} max={att} height={4} className="mt-0.5 max-w-[9rem]" label={`${label} ${att}개 중 ${made}개 성공`} />
    </div>
  )
}

function MobileStatCards({ rows, showGP = false, ddKinds, onPlayerPick, hideSort = false, total, totalOpts }: { rows: (PlayerRow | DailyStat)[]; showGP?: boolean; ddKinds?: DdMap; onPlayerPick?: PlayerPick; hideSort?: boolean; total?: TotalLine; totalOpts?: TotalOpts }) {
  const [sortKey, setSortKey] = useState<'pts' | 'reb' | 'ast'>('pts')
  const sorted = [...rows].sort((a, b) => {
    const av = (a as Record<string, unknown>)[sortKey] as number ?? 0
    const bv = (b as Record<string, unknown>)[sortKey] as number ?? 0
    return bv - av
  })
  const sortBtns: { key: 'pts' | 'reb' | 'ast'; label: string }[] = [
    { key: 'pts', label: 'PTS' },
    { key: 'reb', label: 'REB' },
    { key: 'ast', label: 'AST' },
  ]
  return (
    <div className="space-y-2">
      {!hideSort && <div className="flex items-center gap-1.5">
        <span className="t-label mr-1">정렬</span>
        {sortBtns.map(b => {
          const active = sortKey === b.key
          return (
            <button
              key={b.key}
              onClick={() => setSortKey(b.key)}
              className="px-3 min-h-11 text-sm font-black transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
              style={active
                ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }
                : { background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)' }}
            >{b.label}</button>
          )
        })}
      </div>}
      {sorted.map(r => {
        const rr = r as PlayerRow & DailyStat
        return (
          <div key={rr.player_id} className="p-3" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Avatar src={rr.photo_url} name={rr.name} size={32} ringColor={ringOf(rr.team_color)} decorative />
                <PlayerName row={rr} onPlayerPick={onPlayerPick} className="truncate min-w-0" />
                {ddKinds?.get(rr.player_id) && <DdChip kind={ddKinds.get(rr.player_id)!} />}
                {rr.team_name && <span className="text-xs shrink-0" style={{ color: 'var(--mm-muted)' }}>{rr.team_name}</span>}
                {showGP && <span className="text-xs font-semibold shrink-0 tabular-nums" style={{ color: 'var(--mm-muted)' }}>{rr.gp}G</span>}
              </div>
              <div className="flex items-baseline gap-1 shrink-0">
                {/* 큰 점수 숫자(≥20px)만 유니폼체 유지 — 운영자 결정 */}
                <span className="text-xl font-jersey font-black tabular-nums" style={{ color: 'var(--mm-yellow-strong)' }}>{rr.pts}</span>
                <span className="t-label">PTS</span>
              </div>
            </div>
            <LineGrid r={rr} />
          </div>
        )
      })}
      {total && (
        <div className="p-3" style={{ background: 'var(--mm-panel)', border: '2px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="flex items-baseline gap-2 min-w-0">
              <span className="text-base font-black truncate min-w-0" style={{ color: 'var(--mm-ink)' }}>{totalOpts?.label ?? '팀 합계'}</span>
              {showGP && totalOpts?.gp != null && <span className="text-xs font-semibold shrink-0 tabular-nums" style={{ color: 'var(--mm-muted)' }}>{totalOpts.gp}경기</span>}
            </span>
            <div className="flex items-baseline gap-1 shrink-0">
              <span className="text-xl font-jersey font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>{total.pts}</span>
              <span className="t-label">PTS</span>
            </div>
          </div>
          <LineGrid r={total} />
        </div>
      )}
    </div>
  )
}

function youtubeId(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) return u.pathname.slice(1)
    return u.searchParams.get('v') ?? ''
  } catch { return '' }
}

function getYoutubeEmbedUrl(url: string, offset: number): string {
  const vid = youtubeId(url)
  if (!vid) return ''
  return `https://www.youtube.com/embed/${vid}?start=${offset}&autoplay=0&rel=0`
}

/** 휴대폰에서 누르면 YouTube 앱이 열리는 일반 시청 링크 */
function getYoutubeWatchUrl(url: string, offset: number): string {
  const vid = youtubeId(url)
  if (!vid) return url
  return `https://www.youtube.com/watch?v=${vid}${offset > 0 ? `&t=${offset}s` : ''}`
}

// 당일 스탯 리더 — 경기결과 탭 상단. 하루 합산(daily_stats) 기준.
//   휴대폰: 작은 카드 한 줄 가로 스크롤(7장을 2열로 쌓으면 경기 카드가 화면 밖으로 밀린다).
//   sm 이상: 종전처럼 격자.
function DailyLeaders({ stats, ddKinds, onPlayerPick }: { stats: DailyStat[]; ddKinds: DdMap; onPlayerPick?: PlayerPick }) {
  if (stats.length === 0) return null
  const MIN_FGA = 3, MIN_FG3A = 2
  const top = (f: (r: DailyStat) => number) => [...stats].sort((a, b) => f(b) - f(a))[0]
  const byPts = top(r => r.pts)
  const byReb = top(r => r.reb)
  const byAst = top(r => r.ast)
  const byBlk = top(r => r.blk)
  const byStl = top(r => r.stl)
  const byFgPct = [...stats].filter(p => p.fga >= MIN_FGA).sort((a, b) => (b.fg_pct ?? 0) - (a.fg_pct ?? 0))[0]
  const byFg3 = [...stats].filter(p => p.fg3a >= MIN_FG3A).sort((a, b) => b.fg3m - a.fg3m)[0]
  const gpSub = (r?: DailyStat) => r ? `${r.gp}경기` : ''

  // 아이콘은 lucide 단일 패밀리 — 이모지는 OS 마다 모양이 다르고 아이콘 자리에 쓰지 않는다(CLAUDE.md)
  const leaders = [
    { Icon: Flame,     label: '득점',     p: byPts,   val: byPts ? `${byPts.pts}점` : null,     sub: gpSub(byPts) },
    { Icon: Hand,      label: '리바운드', p: byReb,   val: byReb ? `${byReb.reb}개` : null,     sub: byReb ? `OR ${byReb.oreb} / DR ${byReb.dreb}` : '' },
    { Icon: Handshake, label: '어시스트', p: byAst,   val: byAst ? `${byAst.ast}개` : null,     sub: gpSub(byAst) },
    { Icon: Shield,    label: '블락',     p: byBlk,   val: byBlk ? `${byBlk.blk}개` : null,     sub: gpSub(byBlk) },
    { Icon: Zap,       label: '스틸',     p: byStl,   val: byStl ? `${byStl.stl}개` : null,     sub: gpSub(byStl) },
    { Icon: Target,    label: '야투율',   p: byFgPct, val: byFgPct?.fg_pct != null ? `${byFgPct.fg_pct}%` : null, sub: byFgPct ? `${byFgPct.fgm}/${byFgPct.fga}` : '' },
    { Icon: Sparkles,  label: '3점슛',    p: byFg3,   val: byFg3 ? `${byFg3.fg3m}개` : null,   sub: byFg3 && byFg3.fg3a > 0 ? `${byFg3.fg3_pct}%` : '' },
  ]

  return (
    <section aria-labelledby="daily-leaders-title">
      <h3 id="daily-leaders-title" className="text-base lg:text-lg font-black mb-2.5" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>당일 스탯 리더</h3>
      <div className="flex gap-2 overflow-x-auto snap-x -mx-4 px-4 pb-1 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-4 lg:grid-cols-7 sm:overflow-visible">
        {leaders.map(({ Icon, label, p, val, sub }) => (
          <div
            key={label}
            className="shrink-0 w-[9.5rem] sm:w-auto snap-start px-2.5 py-2 flex flex-col gap-0.5"
            style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}
          >
            <div className="flex items-center gap-1.5">
              <Icon size={14} aria-hidden style={{ color: 'var(--mm-muted)' }} />
              <span className="t-label">{label}</span>
            </div>
            {/* 얼굴(40) 옆에 이름·기록 두 줄. 카드 폭 9.5rem 에서 이름 칸이 ~80px — 세 글자 이름이 안 잘린다.
                칩이 이름에 밀려 잘리지 않게 이름 쪽만 줄어든다(min-w-0 + shrink-0). */}
            <div className="flex items-center gap-2 min-w-0 mt-0.5">
              {p && <Avatar src={p.photo_url} name={p.name} size={40} ringColor={ringOf(p.team_color)} decorative />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 min-w-0">
                  {p
                    ? <PlayerName row={p} onPlayerPick={onPlayerPick} className="truncate min-w-0 leading-tight" />
                    : <span className="text-base font-semibold leading-tight" style={{ color: 'var(--mm-ink)' }}>—</span>}
                  {p && ddKinds.get(p.player_id) && <DdChip kind={ddKinds.get(p.player_id)!} />}
                </div>
                <p className="t-num text-base font-black leading-tight" style={{ color: 'var(--mm-yellow-strong)' }}>
                  {val ?? ''}
                  {sub && <span className="block text-xs font-semibold truncate" style={{ color: 'var(--mm-muted)' }}>{sub}</span>}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** 카드에 쓰는 경기 번호 — 쿼터별로 나눠 올려 묶인 경기는 범위로 적는다 */
function gameNumLabel(g: GameData): string {
  return g.slot_nums && g.slot_nums.length > 1
    ? `${g.slot_nums[0]}~${g.slot_nums[g.slot_nums.length - 1]}경기`
    : `${g.slot_num}경기`
}

// 펼친 경기 카드 안의 박스스코어 — 팀별로 나눠, 득점순 + 맨 아래 팀 합계.
//   DD/TD 는 이 경기 한 줄 기준(ddMapOf(g.players)). 하루 합산 판정을 붙이면
//   이 경기에선 DD 가 아닌 선수에게 칩이 붙는다.
function GameBoxscore({ game, onPlayerPick }: { game: GameData; onPlayerPick?: PlayerPick }) {
  const dd = ddMapOf(game.players)
  const sides: { key: string; name: string; color: string | null; rows: PlayerRow[] }[] = []
  for (const t of [game.home_team, game.away_team]) {
    if (!t) continue
    sides.push({ key: t.id, name: t.name, color: t.color, rows: game.players.filter(p => p.team_id === t.id) })
  }
  // 이 경기의 두 팀 어디에도 안 붙은 줄(옛 기록) — 버리지 않고 소속 팀 이름으로 따로 모은다
  const known = new Set(sides.map(x => x.key))
  for (const p of game.players) {
    if (p.team_id && known.has(p.team_id)) continue
    const key = p.team_id ?? 'none'
    let side = sides.find(x => x.key === key)
    if (!side) { side = { key, name: p.team_name ?? '팀 미정', color: p.team_color, rows: [] }; sides.push(side) }
    side.rows.push(p)
  }
  const visible = sides.filter(x => x.rows.length > 0)
  return (
    <div className="space-y-5">
      {visible.map(side => {
        const rows = [...side.rows].sort((a, b) => b.pts - a.pts)
        const total = sumLine(rows)
        return (
          <section key={side.key} aria-label={`${side.name} 선수 기록`}>
            <div
              className="flex items-center gap-2 mb-2 pb-1.5 min-w-0"
              style={{ borderBottom: `3px solid ${side.color ?? 'var(--mm-rule)'}` }}
            >
              <span aria-hidden className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: side.color ?? 'var(--mm-muted)' }} />
              <span className="font-jersey font-bold text-base truncate min-w-0" style={{ color: 'var(--mm-ink)' }}>{side.name}</span>
              <span className="ml-auto text-sm font-black tabular-nums shrink-0" style={{ color: 'var(--mm-ink-soft)' }}>{total.pts}점</span>
            </div>
            <div className="hidden md:block">
              <StatTable rows={rows} ddKinds={dd} onPlayerPick={onPlayerPick} total={total} />
            </div>
            <div className="md:hidden">
              <MobileStatCards rows={rows} ddKinds={dd} onPlayerPick={onPlayerPick} hideSort total={total} />
            </div>
          </section>
        )
      })}
      {dd.size > 0 && <DdLegend />}
    </div>
  )
}

// 멀티테넌트 전환(온볼): leagueName 은 항상 호출부(boxscore page)에서 DB league.name 을 넘겨받음 —
// 기본값은 다른 클럽명이 아닌 빈 문자열로 폴백 (호출부 fallback 미전달 시에도 특정 클럽명 노출 방지)
export default function BoxscoreContent({ leagueId, date, leagueName = '', initialGameId }: Props) {
  const [games, setGames] = useState<GameData[]>([])
  // 이 날짜에 대진 롤업이 걸렸는지 — 화면에는 안내 문구로만 쓴다(슬롯별 보기는 제공하지 않는다)
  const [rolledUp, setRolledUp] = useState(false)
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([])
  const [loading, setLoading] = useState(true)
  // 초기값으로 넣는다 — 마운트 후 effect 로 펼치면 화면이 한 번 접힌 채 그려졌다 열린다.
  const [expandedGame, setExpandedGame] = useState<string | null>(initialGameId ?? null)
  const [activeTab, setActiveTab] = useState<'result' | 'players' | 'shots' | 'compare' | 'assist'>('result')
  const [teamFilter, setTeamFilter] = useState<string>('all')
  // 경기별 박스스코어는 경기 카드를 펼친 안에 팀별로 있다 — 선수 기록 탭은 하루 합산만 (2026-10-12).
  const [assistLinks, setAssistLinks] = useState<AssistLink[]>([])
  // 공격 유형 — (경기, 선수, 슛 유형) 시도·성공. 합산은 ShotTypeBreakdown 이 한다.
  const [shotTypes, setShotTypes] = useState<ShotTypeRow[]>([])
  // 이미지 저장 진행 상태
  const [savingImage, setSavingImage] = useState(false)
  // 공유용 hidden 캡처 대상 ref (실제 캡처는 ShareableBoxscore)
  const shareCaptureRef = useRef<HTMLDivElement>(null)
  // 공유 렌더링 표시 flag — true 일 때만 off-screen 렌더
  const [renderingShare, setRenderingShare] = useState(false)
  // 이름을 눌러 연 선수 카드. 탭·필터·스크롤 state 와 독립이라 닫으면 보던 화면 그대로다.
  // 선수 카드는 레이아웃의 전역 카드 하나로 연다(2026-10-14, contexts/PlayerCardContext)
  const openPlayerCard = useOpenPlayerCard()
  const pickPlayer: PlayerPick = useCallback((id, name) => openPlayerCard?.({ playerId: id, playerName: name }), [openPlayerCard])

  // 하루 합산 판정 — 선수 기록 탭(하루 합산표)·스탯 리더·이날의 주인공에만 붙인다.
  //   경기별 표는 GameBoxscore 가 그 경기 한 줄로 따로 판정한다.
  const ddKinds: DdMap = ddMapOf(dailyStats)
  const hasDd = ddKinds.size > 0

  const dateLabel = (() => {
    const d = new Date(date + 'T00:00:00')
    const days = ['일','월','화','수','목','금','토']
    return `${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`
  })()

  async function saveAsImage() {
    if (games.length === 0) {
      toast.error('저장할 경기 데이터가 없습니다')
      return
    }
    setSavingImage(true)
    setRenderingShare(true)
    try {
      // React 가 hidden ShareableBoxscore 를 커밋할 때까지 대기 (2 rAF)
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      if (!shareCaptureRef.current) throw new Error('render 실패')
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(shareCaptureRef.current, {
        backgroundColor: '#0a0f1c',
        pixelRatio: 2,
        cacheBust: true,
      })
      const link = document.createElement('a')
      link.download = `boxscore-${date}.png`
      link.href = dataUrl
      link.click()
      toast.success('박스스코어 공유 이미지 저장 완료')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(`이미지 저장 실패: ${msg}`)
    } finally {
      setSavingImage(false)
      setRenderingShare(false)
    }
  }

  // 팀 전적 계산 (공유 이미지용 + 경기결과 탭 요약)
  const teamRecords = (() => {
    const map = new Map<string, { id: string; name: string; color: string | null; W: number; L: number; D: number; PF: number; PA: number }>()
    for (const g of games.filter(gg => gg.is_complete)) {
      if (!g.home_team || !g.away_team) continue
      const home = map.get(g.home_team.id) ?? { id: g.home_team.id, name: g.home_team.name, color: g.home_team.color, W: 0, L: 0, D: 0, PF: 0, PA: 0 }
      const away = map.get(g.away_team.id) ?? { id: g.away_team.id, name: g.away_team.name, color: g.away_team.color, W: 0, L: 0, D: 0, PF: 0, PA: 0 }
      home.PF += g.home_score; home.PA += g.away_score
      away.PF += g.away_score; away.PA += g.home_score
      if (g.home_score > g.away_score) { home.W++; away.L++ }
      else if (g.home_score < g.away_score) { home.L++; away.W++ }
      else { home.D++; away.D++ }
      map.set(g.home_team.id, home); map.set(g.away_team.id, away)
    }
    return [...map.values()].sort((a, b) => (b.W - b.L) - (a.W - a.L) || (b.PF - b.PA) - (a.PF - a.PA))
  })()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/daily-boxscore?date=${date}`)
      if (r.ok) {
        const d = await r.json()
        const gs: GameData[] = d.games ?? []
        setGames(gs)
        setRolledUp(d.rolled_up === true)
        setDailyStats(d.daily_stats ?? [])
        setAssistLinks(d.assist_links ?? [])
        setShotTypes(d.shot_types ?? [])
        // ?game= 딥링크가 묶인 중간 슬롯을 가리킬 수 있다. 롤업 뒤에는 그 id 가 카드 key 가
        //   아니므로 슬롯 id 목록으로 되짚어 그 경기를 펼친다(명경기 카드 → 그 경기로 보내는 진입점).
        if (initialGameId) {
          const owner = gs.find(g => g.id === initialGameId || g.slot_ids?.includes(initialGameId))
          if (owner && owner.id !== initialGameId) setExpandedGame(owner.id)
        }
      }
    } finally { setLoading(false) }
  }, [leagueId, date, initialGameId])

  useEffect(() => { load() }, [load])

  const completedCount = games.filter(g => g.is_complete).length
  const recordedCount = games.filter(g => g.is_started || g.is_complete).length  // 실제 진행된 경기 (미사용 슬롯 제외)

  return (
    <div className="mm-brand overflow-hidden" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' }}>
      {/* 요약 서브헤더 — 경기 수 · 이미지 저장 버튼 */}
      <div
        className="shrink-0 px-4 lg:px-6 py-2.5 flex items-center justify-between gap-2"
        style={{ background: 'var(--mm-panel)', borderBottom: '1px solid var(--mm-rule)' }}
      >
        {/* 날짜는 페이지 제목에 이미 있다 — 여기선 경기 수만 (2026-10-12) */}
        <div className="min-w-0 flex-1">
          <p id="daily-boxscore-title" className="text-sm tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>
            {/* 회원 화면이라 운영 용어(슬롯·미사용 슬롯)는 쓰지 않는다 (2026-10-11) */}
            <span className="font-bold" style={{ color: 'var(--mm-ink)' }}>{recordedCount}경기</span>
            {recordedCount - completedCount > 0 && <span style={{ color: 'var(--mm-muted)' }}> · 기록 중 {recordedCount - completedCount}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {/* 이미지 저장 — 팀 카톡방 공유용 클린 레이아웃 PNG */}
          {!loading && games.length > 0 && (
            <button
              onClick={saveAsImage}
              disabled={savingImage}
              title="팀 카톡방 공유용 박스스코어 PNG 저장"
              aria-label="박스스코어 이미지 저장"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-black uppercase tracking-widest cursor-pointer transition-colors duration-200 disabled:opacity-50 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
              style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
            >
              {savingImage ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              <span className="hidden sm:inline">이미지 저장</span>
            </button>
          )}
        </div>
      </div>

      {/* "그날의 주인공" — 박스스코어 상세 첫 화면이 곧장 표였던 것 개선(2026-08-10).
          그날 최다 득점자 얼굴 + 한 줄. 접이식이 아니라 고정 한 줄 높이(약 44px)로 — 표를
          밀어내지 않으면서도 항상 보인다(탭과 무관하게 상단 고정). 얼굴은 공용 Avatar —
          팀 색은 테두리로만, accentOrInk 로 대비를 맞춘다(팀 색이 #ffffff 인 팀도 안전). */}
      {!loading && dailyStats.length > 0 && dailyStats[0].pts > 0 && (() => {
        const hero = dailyStats[0]
        const heroColor = hero.team_color
        return (
          <div
            className="shrink-0 px-4 lg:px-6 py-2 flex items-center gap-2.5 min-h-11"
            style={{ background: 'var(--mm-panel-alt)', borderBottom: '1px solid var(--mm-rule)' }}
          >
            <Avatar src={hero.photo_url} name={hero.name} size={32} ringColor={heroColor ? accentOrInk(heroColor) : null} decorative />
            <p className="text-xs sm:text-sm min-w-0 truncate" style={{ color: 'var(--mm-ink-soft)' }}>
              <Trophy size={14} className="inline mr-1 -mt-0.5" style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden />
              이날의 주인공 · <PlayerCardName id={hero.player_id} name={hero.name} className="font-black" hitArea={false} style={{ color: 'var(--mm-ink)' }} />
              {ddKinds.get(hero.player_id) && <> <DdChip kind={ddKinds.get(hero.player_id)!} /></>}
              {hero.team_name && <span style={{ color: 'var(--mm-muted)' }}> ({hero.team_name})</span>}
              {' '}<span className="font-black tabular-nums" style={{ color: accentOrInk(heroColor) }}>{hero.pts}점</span>
            </p>
          </div>
        )
      })()}

      {/* 탭 바 — 스코어보드 접이식 섹션 제거, 콘텐츠는 경기결과 탭으로 이관 */}
      {!loading && games.length > 0 && (
        // 공용 SegmentedTabs(리뉴얼 1단계) — 5탭은 360px 에 빠듯해 트랙이 가로로 밀리고, 고른 탭은 화면 안으로 당겨 온다
        <div className="shrink-0 px-4 lg:px-6 py-2.5" style={{ background: 'var(--mm-panel)', borderBottom: '1px solid var(--mm-rule)' }}>
          <SegmentedTabs
            items={[
              { key: 'result',  label: '경기결과',  count: games.length },
              { key: 'players', label: '선수 기록', count: dailyStats.length },
              { key: 'shots',   label: '공격 유형' },
              { key: 'compare', label: '팀별 비교' },
              { key: 'assist',  label: '어시스트' },
            ]}
            value={activeTab}
            onChange={setActiveTab}
            ariaLabel="박스스코어 뷰"
            idPrefix="daily-boxscore"
            size="sm"
          />
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 size={24} className="animate-spin" style={{ color: 'var(--mm-muted)' }} /></div>
      ) : games.length === 0 ? (
        <EmptyState icon={CalendarX} title="이 날 기록된 경기가 없습니다" />
      ) : (
        <div>

          {/* 탭 1: 경기결과 — 팀별 승률 요약 + 게임 카드 (확장 시 하이라이트/경기별 박스스코어) */}
          {activeTab === 'result' && (
            <div
              role="tabpanel"
              id="daily-boxscore-panel-result"
              aria-labelledby="daily-boxscore-tab-result"
              className="px-4 py-4 lg:px-6 lg:py-5 space-y-6"
            >
              {/* 팀별 일일 전적 요약 */}
              {teamRecords.length > 0 && (
                <div>
                  <h3
                    className="text-base lg:text-lg font-black mb-2.5"
                    style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
                  >팀별 일일 전적</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {teamRecords.map(r => {
                      const diff = r.PF - r.PA
                      return (
                        <div
                          key={r.id}
                          className="p-3"
                          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}
                        >
                          <div className="flex items-center gap-2 mb-2 min-w-0">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: r.color ?? 'var(--mm-muted)' }} />
                            <span
                              className="font-jersey font-bold text-sm truncate min-w-0"
                              style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
                            >{r.name}</span>
                          </div>
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-xl font-jersey font-black tabular-nums leading-none">
                              <span style={{ color: 'var(--mm-positive)' }}>{r.W}</span>
                              <span style={{ color: 'var(--mm-muted)' }}> - </span>
                              <span style={{ color: 'var(--mm-negative)' }}>{r.L}</span>
                              {r.D > 0 && (<>
                                <span style={{ color: 'var(--mm-muted)' }}> - </span>
                                <span style={{ color: 'var(--mm-muted)' }}>{r.D}</span>
                              </>)}
                            </span>
                            <span className="text-xs tabular-nums" style={{ color: 'var(--mm-muted)' }}>
                              {r.PF}득 · {r.PA}실 · <span style={{ color: diff > 0 ? 'var(--mm-positive)' : diff < 0 ? 'var(--mm-negative)' : 'var(--mm-muted)' }}>{diff >= 0 ? '+' : ''}{diff}</span>
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 당일 스탯 리더 — 선수 기록 탭에서 옮겨 왔다(2026-10-12 「리더카드는 경기결과와 합치기」).
                  휴대폰에선 7장을 2열로 쌓으면 경기 카드가 화면 밖으로 밀려나므로 가로 스크롤 한 줄로. */}
              <DailyLeaders stats={dailyStats} ddKinds={ddKinds} onPlayerPick={pickPlayer} />

              {/* 경기별 스코어 카드 — 클릭 시 확장(하이라이트 + 경기별 박스스코어) */}
              <section className="space-y-3">
                <h3
                  className="text-base lg:text-lg font-black"
                  style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
                >경기별 스코어</h3>

                {/* ⚠ "카드를 누르면 박스스코어가 열린다"는 안내가 rolledUp 일 때만 떴다.
                    정규전은 같은 대진이 연속될 수 없어(2연속 뛴 팀 강제 휴식) 롤업이 한 칸도
                    안 일어나므로, 이 안내가 **영영 안 떴다.** 접힌 카드에 셰브론 아이콘 하나뿐이라
                    맞대결 기록이 있는 줄도 몰랐다는 신고로 이어졌다(2026-09-18). 안내는 늘 띄운다. */}
                <p className="text-xs -mt-1.5 mb-2.5" style={{ color: 'var(--mm-muted)' }}>
                  {rolledUp && '쿼터별로 나눠 올린 경기는 한 경기로 묶어 보여줍니다. '}
                  카드를 누르면 그 경기의 박스스코어가 열립니다.
                </p>

                {games.map(g => {
                  const isExpanded = expandedGame === g.id
                  const videoList = (g.videos && g.videos.length > 0)
                    ? g.videos
                    : g.youtube_url ? [{ slot_num: g.slot_num, quarter: null, url: g.youtube_url, start_offset: g.youtube_start_offset }] : []
                  const homeWin = g.is_complete && g.home_score > g.away_score
                  const awayWin = g.is_complete && g.away_score > g.home_score
                  const draw = g.is_complete && g.home_score === g.away_score
                  const winnerColor = homeWin ? (g.home_team?.color ?? 'var(--mm-yellow)') : awayWin ? (g.away_team?.color ?? 'var(--mm-yellow)') : 'transparent'

                  return (
                    <div
                      key={g.id}
                      className="overflow-hidden relative"
                      style={{
                        background: !g.is_complete && g.is_started ? 'var(--mm-yellow-soft)' : 'var(--mm-panel-alt)',
                        border: '1px solid var(--mm-rule)',
                        borderRadius: 'var(--mm-radius-ctl)',
                      }}
                    >
                      {/* 승자 팀 좌측 4px 컬러 바 */}
                      {g.is_complete && !draw && (
                        <div
                          className="absolute inset-y-0 left-0 pointer-events-none"
                          style={{ width: '4px', background: winnerColor }}
                          aria-hidden
                        />
                      )}

                      {/* 경기 헤더 — 클릭하면 확장 */}
                      <button
                        className="w-full text-left px-4 sm:px-5 py-3 sm:py-4 cursor-pointer transition-colors duration-200 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-inset"
                        onClick={() => setExpandedGame(isExpanded ? null : g.id)}
                        aria-expanded={isExpanded}
                        aria-controls={`game-details-${g.id}`}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--mm-yellow-soft)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                      >
                        {/* 상단 라인: 슬롯 · 상태 배지 · YT · 화살표 */}
                        <div className="flex items-center gap-2 mb-2">
                          {/* 묶인 경기는 슬롯 범위를 보여준다 — "#1" 만 뜨면 나머지 세 칸이 어디 갔는지 알 수 없다 */}
                          <span className="text-xs font-bold shrink-0 tabular-nums" style={{ color: 'var(--mm-muted)' }}>
                            {gameNumLabel(g)}
                          </span>
                          {g.is_complete && (
                            <span
                              className="text-xs font-black uppercase tracking-widest shrink-0"
                              style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', padding: '2px 6px' }}
                            >완료</span>
                          )}
                          {!g.is_complete && g.is_started && (
                            <span
                              className="text-xs font-black uppercase tracking-widest shrink-0"
                              style={{ background: 'var(--mm-panel)', color: 'var(--mm-live)', border: '1px solid var(--mm-live)', padding: '1px 6px' }}
                            >진행 중</span>
                          )}
                          {!g.is_started && (
                            <span className="text-xs font-bold uppercase tracking-widest shrink-0" style={{ color: 'var(--mm-muted)' }}>예정</span>
                          )}
                          <div className="ml-auto flex items-center gap-2 shrink-0">
                            {videoList.length > 0 && <Youtube size={14} style={{ color: 'var(--mm-live)' }} aria-label="경기 영상 있음" />}
                            {/* 아이콘만으로는 눌러서 열 수 있다는 게 안 읽힌다 — 글자로 적는다.
                                모바일에서 숨기지 않는다(이 화면을 실제로 보는 곳이 휴대폰이다).
                                좁은 폭에서는 팀명 쪽이 truncate 되므로 이 글자가 밀어내지 않는다. */}
                            <span className="text-xs font-black uppercase tracking-widest whitespace-nowrap" style={{ color: 'var(--mm-muted)' }}>
                              {isExpanded ? '접기' : '박스스코어'}
                            </span>
                            {isExpanded
                              ? <ChevronUp size={16} style={{ color: 'var(--mm-muted)' }} />
                              : <ChevronDown size={16} style={{ color: 'var(--mm-muted)' }} />}
                          </div>
                        </div>

                        {/* 하단 라인: 스코어 */}
                        <div className="flex items-center gap-2 sm:gap-3">
                          {/* HOME */}
                          <div className="flex items-center gap-1.5 min-w-0 flex-1 justify-end">
                            {homeWin && <Trophy size={14} className="shrink-0 mm-stamp-in" style={{ color: 'var(--mm-yellow-strong)' }} fill="currentColor" aria-label="승" />}
                            <span
                              className="font-jersey font-bold text-sm truncate min-w-0"
                              style={{
                                color: homeWin ? 'var(--mm-ink)' : g.is_complete ? (draw ? 'var(--mm-ink-soft)' : 'var(--mm-muted)') : 'var(--mm-ink-soft)',
                                letterSpacing: '-0.005em',
                              }}
                            >{g.home_team?.name ?? '미정'}</span>
                            {g.home_team && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.home_team.color }} />}
                            <span
                              className="text-xl sm:text-2xl font-jersey font-black tabular-nums shrink-0"
                              style={{ color: homeWin ? 'var(--mm-ink)' : g.is_complete ? (draw ? 'var(--mm-ink-soft)' : 'var(--mm-muted)') : 'var(--mm-ink-soft)' }}
                            >{g.home_score}</span>
                          </div>

                          <span className="text-sm font-bold shrink-0" style={{ color: 'var(--mm-muted)' }}>:</span>

                          {/* AWAY */}
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <span
                              className="text-xl sm:text-2xl font-jersey font-black tabular-nums shrink-0"
                              style={{ color: awayWin ? 'var(--mm-ink)' : g.is_complete ? (draw ? 'var(--mm-ink-soft)' : 'var(--mm-muted)') : 'var(--mm-ink-soft)' }}
                            >{g.away_score}</span>
                            {g.away_team && <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: g.away_team.color }} />}
                            <span
                              className="font-jersey font-bold text-sm truncate min-w-0"
                              style={{
                                color: awayWin ? 'var(--mm-ink)' : g.is_complete ? (draw ? 'var(--mm-ink-soft)' : 'var(--mm-muted)') : 'var(--mm-ink-soft)',
                                letterSpacing: '-0.005em',
                              }}
                            >{g.away_team?.name ?? '미정'}</span>
                            {awayWin && <Trophy size={14} className="shrink-0 mm-stamp-in" style={{ color: 'var(--mm-yellow-strong)' }} fill="currentColor" aria-label="승" />}
                          </div>
                        </div>
                      </button>

                      {/* 쿼터별 스코어 — 1~4쿼터로 치른 정식 경기에만 나온다.
                          좁은 화면에서 쿼터가 늘어나면 이 줄만 가로로 스크롤한다(본문은 그대로). */}
                      {(g.quarter_scores?.length ?? 0) > 1 && (
                        <div className="px-4 sm:px-5 pb-3 overflow-x-auto">
                          <table className="w-full text-xs tabular-nums" style={{ minWidth: '15rem' }}>
                            <caption className="sr-only">
                              {`${g.home_team?.name ?? '홈'} 대 ${g.away_team?.name ?? '원정'} 쿼터별 스코어`}
                            </caption>
                            <thead>
                              <tr>
                                <th scope="col" className="t-label text-left py-1 pr-2" style={{ color: 'var(--mm-muted)' }}>팀</th>
                                {g.quarter_scores!.map(q => (
                                  <th key={q.quarter} scope="col" className="t-label py-1 px-2 text-right" style={{ color: 'var(--mm-muted)' }}>
                                    {quarterLabel(q.quarter)}
                                  </th>
                                ))}
                                <th scope="col" className="t-label py-1 pl-2 text-right" style={{ color: 'var(--mm-ink-soft)' }}>합계</th>
                              </tr>
                            </thead>
                            <tbody>
                              {([
                                { side: 'home' as const, team: g.home_team, total: g.home_score },
                                { side: 'away' as const, team: g.away_team, total: g.away_score },
                              ]).map(row => (
                                <tr key={row.side} style={{ borderTop: '1px solid var(--mm-rule)' }}>
                                  {/* 말줄임은 셀이 아니라 안쪽 span 에 걸어야 먹는다(표 셀의 max-width 는 무시된다).
                                      390px 에서 「챗지피지기」 행이 표를 7px 넘겼다. */}
                                  <th scope="row" className="text-left py-1.5 pr-2 text-sm" style={{ color: 'var(--mm-ink-soft)' }}>
                                    <span className="inline-flex items-center gap-1.5 min-w-0 max-w-[6rem]">
                                      {row.team && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.team.color }} />}
                                      <span className="truncate">{row.team?.name ?? '미정'}</span>
                                    </span>
                                  </th>
                                  {g.quarter_scores!.map(q => (
                                    <td key={q.quarter} className="py-1.5 px-2 text-right" style={{ color: 'var(--mm-ink-soft)' }}>{q[row.side]}</td>
                                  ))}
                                  <td className="py-1.5 pl-2 text-right font-black" style={{ color: 'var(--mm-ink)' }}>{row.total}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* 펼쳐진 상세 — 하이라이트 + 경기별 박스스코어 */}
                      {isExpanded && (
                        <div id={`game-details-${g.id}`} className="space-y-4" style={{ borderTop: '1px solid var(--mm-rule)' }}>
                          {videoList.length > 0 && (
                            <div className="px-4 sm:px-5 pt-4">
                              <GameVideos
                                videos={videoList}
                                label={`${g.home_team?.name ?? '?'} vs ${g.away_team?.name ?? '?'}`}
                              />
                            </div>
                          )}
                          <div className="px-4 sm:px-5 pb-4">
                            {g.players.length > 0
                              ? <GameBoxscore game={g} onPlayerPick={pickPlayer} />
                              : <p className="text-sm text-center py-4" style={{ color: 'var(--mm-muted)' }}>기록된 선수 데이터가 없습니다</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </section>
            </div>
          )}

          {/* 탭 2: 선수 기록 — 하루 합산표 하나 + 팀 필터 (모바일 카드 + 데스크탑 테이블).
              경기별 표는 경기결과 탭의 경기 카드를 펼친 안에 팀별로 있다(2026-10-12). */}
          {activeTab === 'players' && (() => {
            const teamList = Array.from(
              new Map(
                dailyStats
                  .filter(d => d.team_id && d.team_name)
                  .map(d => [d.team_id!, { id: d.team_id!, name: d.team_name!, color: d.team_color }])
              ).values()
            )
            const filteredStats = teamFilter === 'all'
              ? dailyStats
              : dailyStats.filter(d => d.team_id === teamFilter)
            // 합계 줄 — 숫자는 더하고 % 는 합에서 다시 낸다(선수 % 의 평균이 아니다).
            //   G 칸은 그날 경기 수(팀을 고르면 그 팀이 뛴 경기 수) — 선수 G 의 합은 의미가 없다.
            const filteredTeam = teamList.find(t => t.id === teamFilter)
            const dayTotal = sumLine(filteredStats)
            const totalOpts: TotalOpts = {
              label: filteredTeam ? `${filteredTeam.name} 합계` : '합계',
              gp: filteredTeam
                ? games.filter(g => g.home_team?.id === filteredTeam.id || g.away_team?.id === filteredTeam.id).length
                : games.length,
            }

            return (
            <div
              role="tabpanel"
              id="daily-boxscore-panel-players"
              aria-labelledby="daily-boxscore-tab-players"
              className="px-4 py-4 lg:px-6 lg:py-5 space-y-4"
            >
              {/* 팀 필터 chip */}
              {teamList.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => setTeamFilter('all')}
                    aria-pressed={teamFilter === 'all'}
                    className="px-3 py-2 text-xs font-black uppercase tracking-widest transition-colors duration-200 cursor-pointer min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                    style={teamFilter === 'all'
                      ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }
                      : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}
                  >전체</button>
                  {teamList.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTeamFilter(t.id)}
                      aria-pressed={teamFilter === t.id}
                      className="px-3 py-2 text-xs font-black uppercase tracking-widest transition-colors duration-200 cursor-pointer min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                      style={teamFilter === t.id
                        // 팀 컬러가 흰색 등 밝은 색이면 하드코딩 '#fff' 텍스트가 사라진다 →
                        // 배경 밝기에 맞춰 textOnBg 로 대비색 자동 결정 (2026-08-08 핫픽스).
                        // t.color 가 없어 mm-yellow 폴백일 땐 기존처럼 mm-black 유지.
                        ? { backgroundColor: t.color ?? 'var(--mm-yellow)', borderColor: t.color ?? 'var(--mm-yellow)', border: '1px solid', color: t.color ? textOnBg(t.color) : 'var(--mm-black)' }
                        : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}
                    >{t.name}</button>
                  ))}
                </div>
              )}

              {filteredStats.length > 0
                ? (
                  <>
                    <div className="hidden md:block overflow-hidden" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}>
                      <StatTable rows={filteredStats} showGP ddKinds={ddKinds} onPlayerPick={pickPlayer} total={dayTotal} totalOpts={totalOpts} />
                    </div>
                    {/* 모바일 카드 뷰 */}
                    <div className="md:hidden">
                      <MobileStatCards rows={filteredStats} showGP ddKinds={ddKinds} onPlayerPick={pickPlayer} total={dayTotal} totalOpts={totalOpts} />
                    </div>
                    {/* 약어는 처음 보는 사람에게 읽히지 않는다 — 표 바로 아래 한 줄 범례 */}
                    {hasDd && <DdLegend />}
                  </>
                )
                : <p className="text-sm text-center py-10" style={{ color: 'var(--mm-muted)' }}>집계된 스탯이 없습니다</p>}
            </div>
            )
          })()}

          {/* 탭 3: 공격 유형 — 슛 유형별 시도 비중 · 야투율 (2026-10-12) */}
          {activeTab === 'shots' && (
            <div
              role="tabpanel"
              id="daily-boxscore-panel-shots"
              aria-labelledby="daily-boxscore-tab-shots"
              className="px-4 py-4 lg:px-6 lg:py-5"
            >
              <ShotTypeBreakdown
                rows={shotTypes}
                games={games.map(g => ({
                  id: g.id,
                  numLabel: gameNumLabel(g),
                  homeName: g.home_team?.name ?? '미정',
                  awayName: g.away_team?.name ?? '미정',
                }))}
                // 경기의 두 팀 + (옛 기록처럼) 그 밖의 팀으로 잡힌 선수의 팀 — 이름을 「팀 미정」으로 잃지 않게
                teams={[
                  ...extractTeams(games),
                  ...dailyStats
                    .filter(d => d.team_id && d.team_name && !games.some(g => g.home_team?.id === d.team_id || g.away_team?.id === d.team_id))
                    .map(d => ({ id: d.team_id!, name: d.team_name!, color: d.team_color })),
                ].filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i)}
                players={new Map(dailyStats.map(d => [d.player_id, { name: d.name, team_id: d.team_id }]))}
              />
            </div>
          )}

          {/* 탭 4: 팀별 비교 — 조합 버튼(팀 3개=3쌍) */}
          {activeTab === 'compare' && (
            <div
              role="tabpanel"
              id="daily-boxscore-panel-compare"
              aria-labelledby="daily-boxscore-tab-compare"
              className="px-4 py-4 lg:px-6 lg:py-5"
            >
              <TeamComparePanel dailyStats={dailyStats} games={games} />
            </div>
          )}

          {/* 탭 5: 어시스트 네트워크 — 누가 누구의 득점을 도왔나 (2026-10-12) */}
          {activeTab === 'assist' && (
            <div
              role="tabpanel"
              id="daily-boxscore-panel-assist"
              aria-labelledby="daily-boxscore-tab-assist"
              className="px-4 py-4 lg:px-6 lg:py-5"
            >
              <AssistNetwork
                links={assistLinks}
                games={games.map(g => ({
                  id: g.id,
                  numLabel: gameNumLabel(g),
                  homeName: g.home_team?.name ?? '미정',
                  awayName: g.away_team?.name ?? '미정',
                }))}
                players={new Map(dailyStats.map(d => [d.player_id, { name: d.name, photo_url: d.photo_url ?? null }]))}
              />
            </div>
          )}
        </div>
      )}


      {/* Hidden 공유용 캡처 대상 — 저장 클릭 시에만 렌더 (off-screen) */}
      {renderingShare && (
        <div style={{
          position: 'fixed', left: '-99999px', top: 0,
          pointerEvents: 'none', opacity: 1,  // opacity 0 이면 html-to-image 가 놓칠 수 있음
        }} aria-hidden>
          <div ref={shareCaptureRef}>
            <ShareableBoxscore
              dateLabel={dateLabel}
              games={games.map(g => ({
                id: g.id, slot_num: g.slot_num,
                home_team: g.home_team, away_team: g.away_team,
                home_score: g.home_score, away_score: g.away_score,
                is_complete: g.is_complete,
                is_started: g.is_started,
              }))}
              dailyStats={dailyStats}
              teamRecords={teamRecords}
              leagueName={leagueName}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── 팀 비교 패널 ──────────────────────────────────────────────
// 그날 출전한 모든 팀 목록 (선택지용)
function extractTeams(games: GameData[]): { id: string; name: string; color: string | null }[] {
  const map = new Map<string, { id: string; name: string; color: string | null }>()
  for (const g of games) {
    if (g.home_team) map.set(g.home_team.id, { id: g.home_team.id, name: g.home_team.name, color: g.home_team.color })
    if (g.away_team) map.set(g.away_team.id, { id: g.away_team.id, name: g.away_team.name, color: g.away_team.color })
  }
  return [...map.values()]
}

// 두 팀이 맞붙은 경기에서만 집계 (head-to-head 상대 전적)
function aggregateHeadToHead(
  games: GameData[],
  teamAId: string,
  teamBId: string,
  meta: Map<string, { name: string; color: string | null }>,
): { A: TeamAgg; B: TeamAgg; gameCount: number } {
  const h2hGames = games.filter(g => {
    if (!g.home_team || !g.away_team) return false
    const ids = [g.home_team.id, g.away_team.id]
    return ids.includes(teamAId) && ids.includes(teamBId)
  })

  const init = (id: string): TeamAgg => ({
    id,
    name: meta.get(id)?.name ?? '?',
    color: meta.get(id)?.color ?? null,
    pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0,
    fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0,
  })
  const A = init(teamAId)
  const B = init(teamBId)

  for (const g of h2hGames) {
    for (const p of g.players) {
      const target = p.team_id === teamAId ? A : p.team_id === teamBId ? B : null
      if (!target) continue
      target.pts += p.pts; target.reb += p.reb; target.oreb += p.oreb; target.dreb += p.dreb
      target.ast += p.ast; target.stl += p.stl; target.blk += p.blk; target.tov += p.tov; target.pf += (p.pf ?? 0)
      target.fgm += p.fgm; target.fga += p.fga; target.fg3m += p.fg3m; target.fg3a += p.fg3a
      target.ftm += p.ftm; target.fta += p.fta
    }
  }

  return { A, B, gameCount: h2hGames.length }
}

// 한 경기에 붙은 영상들. 슬롯을 쿼터 단위로 쓴 날은 영상이 여러 개라 탭으로 고른다.
//   한 개뿐이면 탭 없이 그대로 그린다 — 정규전 화면을 건드리지 않기 위해서다.
// 경기 영상 탭. 두 갈래가 같은 배열로 들어온다(daily-boxscore 의 videos 주석 참고).
//   - 슬롯을 쿼터 단위로 쓴 날 → 슬롯마다 하나, quarter 는 null → 순서대로 1·2·3쿼터로 읽는다
//   - 경기 하나에 쿼터 영상을 단 경우(대회) → quarter 가 있으므로 **그 값을 그대로 쓴다**.
//     순서로 매기면 1·3쿼터만 연결된 경기가 "1쿼터·2쿼터" 로 잘못 표시된다.
function GameVideos({ videos, label }: { videos: { slot_num: number; quarter?: number | null; url: string; start_offset: number }[]; label: string }) {
  const [idx, setIdx] = useState(0)
  const active = videos[Math.min(idx, videos.length - 1)]
  const embedUrl = getYoutubeEmbedUrl(active.url, active.start_offset)
  if (!embedUrl) return null
  return (
    <div className="space-y-2">
      {videos.length > 1 && (
        <div className="flex items-center gap-1.5 flex-wrap" role="tablist" aria-label={`${label} 쿼터 영상`}>
          {videos.map((v, i) => (
            <button
              // 대회 경기는 슬롯 번호가 4개 다 같다 — slot_num 만 쓰면 key 가 겹친다.
              key={`${v.slot_num}-${v.quarter ?? i}`}
              type="button"
              role="tab"
              aria-selected={i === idx}
              onClick={() => setIdx(i)}
              className="px-3 min-h-11 text-xs font-black uppercase tracking-widest cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
              style={i === idx
                ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '4px' }
                : { background: 'var(--mm-panel)', color: 'var(--mm-muted)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
            >
              {quarterLabel(v.quarter ?? i + 1)}
            </button>
          ))}
        </div>
      )}
      <div className="aspect-video overflow-hidden" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}>
        <iframe
          key={active.url}
          src={embedUrl}
          title={`${label} ${videos.length > 1 ? quarterLabel(active.quarter ?? idx + 1) + ' ' : ''}하이라이트`}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
      <div className="flex justify-end">
        <a
          href={getYoutubeWatchUrl(active.url, active.start_offset)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 min-h-11 px-1 text-xs font-bold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
          style={{ color: 'var(--mm-ink-soft)' }}
        >
          <Youtube size={14} aria-hidden style={{ color: 'var(--mm-live)' }} />
          YouTube 앱으로 열기
          <ExternalLink size={12} aria-hidden />
        </a>
      </div>
    </div>
  )
}

function TeamComparePanel({ dailyStats, games }: { dailyStats: DailyStat[]; games: GameData[] }) {
  void dailyStats  // games 기반 head-to-head 집계만 사용
  const teams = extractTeams(games)
  const teamMeta = new Map(teams.map(t => [t.id, { name: t.name, color: t.color }]))

  // 팀 쌍 — 그날 실제로 맞붙은 조합만. 모든 조합을 늘어놓으면 안 붙은 쌍을 눌렀을 때
  //   빈 화면만 나온다(2026-10-12). 순서는 그날 처음 맞붙은 순.
  const pairs: { a: string; b: string; key: string }[] = []
  for (const g of games) {
    if (!g.home_team || !g.away_team) continue
    const [a, b] = [g.home_team.id, g.away_team.id].sort()
    const key = `${a}__${b}`
    if (!pairs.some(p => p.key === key)) pairs.push({ a, b, key })
  }

  // 기본값은 그날 처음 맞붙은 조합(= pairs[0]). 고른 값이 목록에 없으면 기본값으로.
  const [chosenPairKey, setActivePairKey] = useState<string | null>(null)
  const activePairKey = pairs.some(p => p.key === chosenPairKey) ? chosenPairKey : (pairs[0]?.key ?? null)

  const allComplete = games.length > 0 && games.every(g => g.is_complete)

  if (pairs.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: 'var(--mm-muted)' }}>
        <p className="text-sm">이날 두 팀이 맞붙은 기록이 없습니다.</p>
      </div>
    )
  }

  const activePair = pairs.find(p => p.key === activePairKey)
  if (!activePair) return null

  const h2h = aggregateHeadToHead(games, activePair.a, activePair.b, teamMeta)
  const A = h2h.A
  const B = h2h.B
  const colorA = A.color ?? '#C4362B' // accentOrInk 가 hex 만 파싱한다 — 토큰 못 씀
  const colorB = B.color ?? '#2563eb'

  return (
    <div className="space-y-4">
      {!allComplete && (
        <div
          className="text-xs px-3 py-2 font-bold"
          style={{ color: 'var(--mm-ink)', background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow)', borderRadius: 'var(--mm-radius-ctl)' }}
        >
          ⚠ 이 날의 일부 경기가 아직 마감되지 않았습니다 — 최종 수치는 마감 후 확정됩니다.
        </div>
      )}

      {/* 조합 버튼 — 팀 3개면 3쌍이 자연스럽게 grid-cols-3 */}
      <div>
        <h3 className="text-base lg:text-lg font-black mb-2" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>
          이날 맞붙은 팀
        </h3>
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(auto-fit, minmax(180px, 1fr))` }}
        >
          {pairs.map(p => {
            const active = p.key === activePairKey
            const nameA = teamMeta.get(p.a)?.name ?? '?'
            const nameB = teamMeta.get(p.b)?.name ?? '?'
            const colA = teamMeta.get(p.a)?.color ?? 'var(--mm-muted)'
            const colB = teamMeta.get(p.b)?.color ?? 'var(--mm-muted)'
            return (
              <button
                key={p.key}
                onClick={() => setActivePairKey(p.key)}
                aria-pressed={active}
                className="px-3 py-2.5 text-xs font-black uppercase tracking-widest transition-colors duration-200 cursor-pointer flex items-center justify-center gap-1.5 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                style={active
                  ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }
                  : { background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)' }}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colA }} />
                <span className="truncate min-w-0">{nameA}</span>
                <span className="opacity-70 shrink-0">vs</span>
                <span className="truncate min-w-0">{nameB}</span>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colB }} />
              </button>
            )
          })}
        </div>
      </div>

      {h2h.gameCount === 0 ? (
        <div className="text-center py-10 px-4" style={{ color: 'var(--mm-muted)', border: '1px dashed var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}>
          <p className="text-sm">
            <span className="font-bold" style={{ color: 'var(--mm-ink)' }}>{A.name}</span>
            {' vs '}
            <span className="font-bold" style={{ color: 'var(--mm-ink)' }}>{B.name}</span>
            {' — 이 날짜에 맞붙은 경기가 없습니다.'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--mm-muted)' }}>두 팀이 실제 맞붙은 경기 기록만 집계됩니다.</p>
        </div>
      ) : (
        <>
          <HeadToHeadBars
            a={{ name: A.name, color: colorA, sub: '', totals: A }}
            b={{ name: B.name, color: colorB, sub: '', totals: B }}
            centerSub={`맞대결 ${h2h.gameCount}경기`}
          />
        </>
      )}
    </div>
  )
}
