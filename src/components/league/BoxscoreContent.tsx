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
//   · 팀별 비교 · 어시스트(네트워크). 공격 유형 탭은 2026-10-31 운영진 결정으로 뺐다(팀 탭 인사이트에는 남음). 경기별 박스스코어는 경기 카드를 펼친 안에서 팀별로 나눠 본다.
import { useState, useEffect, useCallback, useRef, createContext, useContext, type ReactNode } from 'react'
import { useOptionalCurrentUser } from '@/contexts/LeagueAuthContext'
import { Loader2, ChevronDown, ChevronUp, ChevronsUpDown, Youtube, Trophy, Camera, Flame, Hand, Handshake, Shield, Zap, Target, Sparkles, ExternalLink, CalendarX, AlertTriangle, CloudOff, UserX, Swords } from 'lucide-react'
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
import SortSelect from '@/components/league/ui/SortSelect'
import AssistNetwork, { type AssistLink } from '@/components/league/boxscore/AssistNetwork'
import DayHighlightsLauncher, { type HighlightScope } from '@/components/league/boxscore/DayHighlightsLauncher'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { PenLine } from 'lucide-react'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { tallyDayRecord, identityKeyOf } from '@/lib/stats/dayRecord'

type BoxTab = 'result' | 'players'
const BOX_TABS: readonly BoxTab[] = ['result', 'players']
// 마지막으로 본 탭 — 같은 탭 세션 안에서 다른 날짜 박스스코어로 넘어가도 이어진다(2026-10-15)
const BOX_TAB_KEY = 'mm_boxscore_tab'
const isBoxTab = (v: unknown): v is BoxTab => typeof v === 'string' && (BOX_TABS as readonly string[]).includes(v)

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
      className="inline-flex items-center px-1.5 text-xs font-bold whitespace-nowrap shrink-0 align-middle"
      style={kind === 'TD'
        ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', borderRadius: 'var(--mm-radius-chip)' }
        : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)' }}
    >{kind}</span>
  )
}

function DdLegend() {
  return (
    <p className="t-label" style={{ color: 'var(--mm-muted)' }}>
      DD = 더블더블 (득점·리바운드·어시스트·스틸·블록 중 2개가 두 자릿수) · TD = 트리플더블 (3개 이상)
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
  /** 친선전 — 목록에는 남고 「팀별 일일 전적」에서는 빠진다(lib/stats/dayRecord.ts). 옛 응답엔 없다 */
  is_exhibition?: boolean
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
  /** ?hl=mine|team|all — 「하이라이트 보기」를 펼친 채 그 범위로 연다(홈 「내 하이라이트 ▶」). 기본은 접힘 */
  initialHl?: HighlightScope | null
  /** ?tab= — 안쪽 탭. 없으면 이 세션에서 마지막으로 본 탭 */
  initialTab?: string | null
  /** ?me=1 — 선수 기록 탭으로 열고 내 줄로 스크롤(홈 「지난 토요일 나」) */
  initialMe?: boolean
}

// 로그인 회원 본인 — 표·카드에서 내 줄을 노랑으로 (2026-10-26 점검 MVP 1: 47명 표에서 내 이름을 눈으로 찾아야 했다)
const MyIdCtx = createContext<string | null>(null)
const MY_ROW_BG = 'color-mix(in srgb, var(--mm-yellow) 22%, var(--mm-panel))'
function MeTag() {
  return <span className="shrink-0 px-1 text-[11px] font-black leading-4" style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: 3 }}>나</span>
}

// 선수명. 누르면 선수 카드 모달이 열린다 — 글자 크기·굵기·색은 기존 그대로 두고
// 눌린다는 신호(커서·밑줄·포커스 링)만 더한다. player_id 가 없으면 글자로만 그린다.
function PlayerName({ row, onPlayerPick, className = 'whitespace-nowrap' }: { row: PlayerRow | DailyStat; onPlayerPick?: PlayerPick; className?: string }) {
  const base = `font-semibold text-base ${className}`
  if (!onPlayerPick || !row.player_id) {
    return <span className={base} title={row.name} style={{ color: 'var(--mm-ink)' }}>{row.name}</span>
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
  const myId = useContext(MyIdCtx)
  const [sortKey, setSortKey] = useState('pts')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const COLS: ColDef[] = [
    ...(showGP ? [{ key: 'gp', label: '경기', sortKey: 'gp' }] : []),
    { key: 'pts',     label: '득점',  sortKey: 'pts'  },
    { key: 'reb',     label: '리바',  sortKey: 'reb'  },
    { key: 'oreb',    label: '공리',   sortKey: 'oreb' },
    { key: 'dreb',    label: '수리',   sortKey: 'dreb' },
    { key: 'ast',     label: '어시',  sortKey: 'ast'  },
    { key: 'stl',     label: '스틸',  sortKey: 'stl'  },
    { key: 'blk',     label: '블록',  sortKey: 'blk'  },
    { key: 'tov',     label: '턴오버',  sortKey: 'tov'  },
    { key: 'fgm_fga', label: '야투',   sortKey: 'fgm'  },
    { key: 'fg_pct',  label: '야투율',  sortKey: 'fg_pct' },
    { key: 'fg3m_fg3a', label: '3점', sortKey: 'fg3m' },
    { key: 'fg3_pct', label: '3점률',  sortKey: 'fg3_pct' },
    { key: 'ftm_fta', label: '자유투',   sortKey: 'ftm'  },
    { key: 'ft_pct',  label: '자유투율',  sortKey: 'ft_pct' },
    { key: 'pf',      label: '파울',   sortKey: 'pf'   },
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
              scope="col"
              className="t-th text-left px-3 sticky left-0 min-w-[150px]"
              style={{ background: 'var(--mm-panel-alt)' }}
            >선수 / 팀</th>
            {COLS.map(c => {
              const isActive = sortKey === c.sortKey
              return (
                <th key={c.key}
                  scope="col"
                  aria-sort={c.sortKey ? (isActive ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none') : undefined}
                  className={c.sortKey ? 't-th p-0' : 't-th'}
                  style={isActive ? { color: 'var(--mm-yellow-strong)' } : undefined}>
                  {c.sortKey ? (
                    // 정렬은 th 안의 버튼으로 — th 에 onClick 을 걸면 키보드로 닿지 않는다
                    <button
                      type="button"
                      onClick={() => handleSort(c.sortKey!)}
                      className="mm-press w-full h-full inline-flex items-center justify-center whitespace-nowrap px-2 py-2.5 cursor-pointer select-none transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-inset"
                      style={{ font: 'inherit', color: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', borderRadius: 'var(--mm-radius-ctl)' }}
                    >
                      {c.label}
                      {isActive
                        ? (sortDir === 'desc' ? <ChevronDown size={14} className="inline ml-0.5" aria-hidden /> : <ChevronUp size={14} className="inline ml-0.5" aria-hidden />)
                        : <ChevronsUpDown size={14} className="inline ml-0.5 opacity-30" aria-hidden />}
                    </button>
                  ) : c.label}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            const rr = r as PlayerRow & DailyStat
            const isMe = !!myId && rr.player_id === myId
            return (
              <tr
                key={rr.player_id}
                className={`transition-colors duration-200 hover:bg-[color:var(--mm-yellow-soft)] ${isMe ? '' : i % 2 === 0 ? 'bg-[color:var(--mm-panel)]' : 'bg-[color:var(--mm-panel-alt)]'}`}
                style={{ borderBottom: '1px solid var(--mm-rule)', ...(isMe ? { background: MY_ROW_BG, boxShadow: 'inset 3px 0 0 var(--mm-yellow-strong)' } : null) }}
                data-me={isMe || undefined}
              >
                <th scope="row" className="py-2 px-3 sticky left-0 text-left font-normal" style={{ background: 'inherit' }}>
                  <div className="flex items-center gap-2">
                    {/* 팀 색 점 대신 얼굴(팀 색 테두리) — 점(8px)보다 16px 넓을 뿐이라 이름 칸 min-w 안에 든다 */}
                    <Avatar src={rr.photo_url} name={rr.name} size={24} ringColor={ringOf(rr.team_color)} decorative />
                    <div className="leading-tight min-w-0">
                      {/* 선수명은 본문체 600 — 유니폼체(좁음)와 900 굵기를 뺀 것이 이번 작업의 요지 */}
                      <span className="flex items-center gap-1.5 min-w-0">
                        <PlayerName row={rr} onPlayerPick={onPlayerPick} />
                        {isMe && <MeTag />}
                        {ddKinds?.get(rr.player_id) && <DdChip kind={ddKinds.get(rr.player_id)!} />}
                      </span>
                      {rr.team_name && <p className="text-xs leading-tight mt-0.5" style={{ color: 'var(--mm-muted)' }}>{rr.team_name}</p>}
                    </div>
                  </div>
                </th>
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
  const myId = useContext(MyIdCtx)
  // 2026-10-31 운영진: 스틸·블록·3점도 정렬 — 같으면 득점 순
  type MobileSortKey = 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'fg3m'
  const [sortKey, setSortKey] = useState<MobileSortKey>('pts')
  const num = (r: unknown, k: string) => ((r as Record<string, unknown>)[k] as number) ?? 0
  const sorted = [...rows].sort((a, b) => num(b, sortKey) - num(a, sortKey) || num(b, 'pts') - num(a, 'pts'))
  const sortBtns: { key: MobileSortKey; label: string }[] = [
    { key: 'pts', label: '득점' },
    { key: 'reb', label: '리바' },
    { key: 'ast', label: '어시' },
    { key: 'stl', label: '스틸' },
    { key: 'blk', label: '블록' },
    { key: 'fg3m', label: '3점' },
  ]
  return (
    <div className="space-y-2">
      {!hideSort && <SortSelect value={sortKey} options={sortBtns} onChange={setSortKey} />}
      {/* 카드 안의 카드가 세 겹이 되던 것 — 선수 줄은 배경 없이 얇은 구분선만 둔다(2026-10-17) */}
      <div>
      {sorted.map(r => {
        const rr = r as PlayerRow & DailyStat
        const isMe = !!myId && rr.player_id === myId
        return (
          <div key={rr.player_id} className={isMe ? 'py-3 px-2 -mx-2' : 'py-3'} data-me={isMe || undefined}
            style={{ borderBottom: '1px solid var(--mm-rule)', ...(isMe ? { background: MY_ROW_BG, boxShadow: 'inset 3px 0 0 var(--mm-yellow-strong)' } : null) }}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Avatar src={rr.photo_url} name={rr.name} size={32} ringColor={ringOf(rr.team_color)} decorative />
                {/* 팀명·경기 수는 이름 아래 줄로 — 한 줄에 다 두면 360px 에서 이름이 「이…」로 잘렸다 */}
                <span className="flex flex-col min-w-0">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <PlayerName row={rr} onPlayerPick={onPlayerPick} className="truncate min-w-0 leading-tight" />
                    {isMe && <MeTag />}
                  </span>
                  {(rr.team_name || showGP) && (
                    <span className="flex items-center gap-1.5 min-w-0 text-xs leading-tight mt-0.5" style={{ color: 'var(--mm-muted)' }}>
                      {rr.team_name && <span className="truncate min-w-0">{rr.team_name}</span>}
                      {showGP && <span className="font-semibold shrink-0 tabular-nums">{rr.gp}G</span>}
                    </span>
                  )}
                </span>
                {ddKinds?.get(rr.player_id) && <DdChip kind={ddKinds.get(rr.player_id)!} />}
              </div>
              <div className="flex items-baseline gap-1 shrink-0">
                {/* 큰 점수 숫자(≥20px)만 유니폼체 유지 — 운영자 결정 */}
                <span className="text-xl font-jersey font-black tabular-nums" style={{ color: 'var(--mm-yellow-strong)' }}>{rr.pts}</span>
                <span className="t-label">득점</span>
              </div>
            </div>
            <LineGrid r={rr} />
          </div>
        )
      })}
      {total && (
        <div className="py-3" style={{ borderTop: '1px solid var(--mm-rule)' }}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="flex items-baseline gap-2 min-w-0">
              <span className="text-base font-black truncate min-w-0" style={{ color: 'var(--mm-ink)' }}>{totalOpts?.label ?? '팀 합계'}</span>
              {showGP && totalOpts?.gp != null && <span className="text-xs font-semibold shrink-0 tabular-nums" style={{ color: 'var(--mm-muted)' }}>{totalOpts.gp}경기</span>}
            </span>
            <div className="flex items-baseline gap-1 shrink-0">
              <span className="text-xl font-jersey font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>{total.pts}</span>
              <span className="t-label">득점</span>
            </div>
          </div>
          <LineGrid r={total} />
        </div>
      )}
      </div>
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
    { Icon: Shield,    label: '블록',     p: byBlk,   val: byBlk ? `${byBlk.blk}개` : null,     sub: gpSub(byBlk) },
    { Icon: Zap,       label: '스틸',     p: byStl,   val: byStl ? `${byStl.stl}개` : null,     sub: gpSub(byStl) },
    { Icon: Target,    label: '야투율',   p: byFgPct, val: byFgPct?.fg_pct != null ? `${byFgPct.fg_pct}%` : null, sub: byFgPct ? `${byFgPct.fgm}/${byFgPct.fga}` : '' },
    { Icon: Sparkles,  label: '3점슛',    p: byFg3,   val: byFg3 ? `${byFg3.fg3m}개` : null,   sub: byFg3 && byFg3.fg3a > 0 ? `${byFg3.fg3_pct}%` : '' },
  ]

  return (
    <section aria-labelledby="daily-leaders-title">
      <h2 id="daily-leaders-title" className="text-base lg:text-lg font-black mb-2.5" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>당일 스탯 리더</h2>
      <div className="flex gap-2 overflow-x-auto snap-x -mx-4 px-4 pb-1 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-4 xl:grid-cols-7 sm:overflow-visible">
        {leaders.map(({ Icon, label, p, val, sub }) => (
          <div
            key={label}
            className="shrink-0 w-[10.5rem] sm:w-auto snap-start px-2.5 py-2 flex flex-col gap-0.5"
            style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}
          >
            {/* DD/TD 칩은 머리 줄 오른쪽 — 이름 줄에 두면 PC 7칸(칸당 ~140px)에서 이름이 「이...」로 잘렸다(2026-10-15) */}
            <div className="flex items-center gap-1.5 min-h-[20px]">
              <Icon size={14} aria-hidden style={{ color: 'var(--mm-muted)' }} />
              <span className="t-label">{label}</span>
              {p && ddKinds.get(p.player_id) && <span className="ml-auto shrink-0"><DdChip kind={ddKinds.get(p.player_id)!} /></span>}
            </div>
            {/* 얼굴(40) 옆에 이름·기록 두 줄 — 이름 칸이 카드 폭을 다 쓴다 */}
            <div className="flex items-center gap-2 min-w-0 mt-0.5">
              {p && <Avatar src={p.photo_url} name={p.name} size={40} ringColor={ringOf(p.team_color)} decorative />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 min-w-0">
                  {p
                    ? <PlayerName row={p} onPlayerPick={onPlayerPick} className="truncate min-w-0 leading-tight" />
                    : <span className="text-base font-semibold leading-tight" style={{ color: 'var(--mm-ink)' }}>—</span>}
                </div>
                <p className="t-num text-base font-black leading-tight" style={{ color: 'var(--mm-yellow-strong)' }}>
                  {val ?? ''}
                  {sub && <span className="block text-xs font-semibold truncate" title={sub} style={{ color: 'var(--mm-muted)' }}>{sub}</span>}
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
              <span className="font-jersey font-bold text-base truncate min-w-0" title={side.name ?? undefined} style={{ color: 'var(--mm-ink)' }}>{side.name}</span>
              <span className="ml-1 text-sm font-black tabular-nums shrink-0" style={{ color: 'var(--mm-ink-soft)' }}>{total.pts}점</span>
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
export default function BoxscoreContent({ leagueId, date, leagueName = '', initialGameId, initialHl, initialTab, initialMe = false }: Props) {
  const { orgSlug } = useParams<{ orgSlug: string }>()
  const myId = useOptionalCurrentUser()?.user?.player_id ?? null
  // 팀 어드민 · CEO — 펼친 경기 카드에 「기록 수정」(→ 기록 화면 · 기록 내역)
  const { isEditMode } = useLeagueEditMode()
  const [games, setGames] = useState<GameData[]>([])
  // 이 날짜에 대진 롤업이 걸렸는지 — 화면에는 안내 문구로만 쓴다(슬롯별 보기는 제공하지 않는다)
  const [rolledUp, setRolledUp] = useState(false)
  const [dailyStats, setDailyStats] = useState<DailyStat[]>([])
  const [loading, setLoading] = useState(true)
  // 불러오기 실패 — 빈 날과 구분해 「다시 시도」를 준다
  const [error, setError] = useState(false)
  // 초기값으로 넣는다 — 마운트 후 effect 로 펼치면 화면이 한 번 접힌 채 그려졌다 열린다.
  const [expandedGame, setExpandedGame] = useState<string | null>(initialGameId ?? null)
  // 탭 기억(2026-10-15) — ?tab= 이 우선, 없으면 sessionStorage. 첫 그림이 로딩 스피너라(탭은 데이터 뒤에 그린다)
  //   서버 렌더(늘 'result')와 달라도 하이드레이션 어긋남이 없다.
  const [activeTab, setActiveTabState] = useState<BoxTab>(() => {
    // 리뉴얼 R1 (2026-10-31): 탭 4 → 2. 옛 ?tab=compare·assist 는 경기결과(그 아래에 같은 내용이 있다)로 연다.
    if (initialTab === 'compare' || initialTab === 'assist') return 'result'
    if (isBoxTab(initialTab)) return initialTab
    // ?me=1 (홈 「지난 토요일 나」 → 그날 기록표) — 선수 기록 탭으로 연다
    if (initialMe) return 'players'
    if (typeof window === 'undefined') return 'result'
    try { const v = sessionStorage.getItem(BOX_TAB_KEY); return v === 'players' ? 'players' : 'result' } catch { return 'result' }
  })
  // 탭을 바꾸면 주소(?tab=)도 바꾼다 — 공유·새로고침에 남게. replaceState 라 뒤로가기 기록이 쌓이지 않고,
  //   Next 라우터를 거치지 않으므로 다시 그리거나 스크롤이 튀지 않는다.
  const setActiveTab = useCallback((t: BoxTab) => {
    setActiveTabState(t)
    try { sessionStorage.setItem(BOX_TAB_KEY, t) } catch { /* 저장소가 막혀 있으면 기억만 안 한다 */ }
    const url = new URL(window.location.href)
    if (t === 'result') url.searchParams.delete('tab')
    else url.searchParams.set('tab', t)
    window.history.replaceState(window.history.state, '', url)
  }, [])
  const [teamFilter, setTeamFilter] = useState<string>('all')
  // 경기별 박스스코어는 경기 카드를 펼친 안에 팀별로 있다 — 선수 기록 탭은 하루 합산만 (2026-10-12).
  const [assistLinks, setAssistLinks] = useState<AssistLink[]>([])
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

  // ?me=1 — 다 그린 뒤 내 줄로 한 번 스크롤
  const scrolledToMe = useRef(false)
  useEffect(() => {
    if (!initialMe || loading || scrolledToMe.current || !myId) return
    const el = document.querySelector('[data-me="true"]')
    if (el) { scrolledToMe.current = true; el.scrollIntoView({ block: 'center', behavior: 'smooth' }) }
  })

  const dateLabel = (() => {
    const d = new Date(date + 'T00:00:00')
    const days = ['일','월','화','수','목','금','토']
    return `${d.getMonth()+1}월 ${d.getDate()}일 (${days[d.getDay()]})`
  })()

  async function saveAsImage() {
    if (games.length === 0) {
      toast.error('저장할 경기 데이터가 없어요')
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
      // 폰이면 공유 시트(카톡 등)로 바로 — 「다운로드 → 갤러리 → 카톡」 세 단계를 한 번으로 (2026-10-26 점검 MVP 1).
      //   파일 공유를 못 하는 브라우저(대부분의 PC)는 종전처럼 내려받는다. 공유 창을 닫은 것(AbortError)은 실패가 아니다.
      const fileName = `boxscore-${date}.png`
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], fileName, { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
      if (nav.share && nav.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: `${dateLabel} 박스스코어` })
        } catch (err) {
          if ((err as { name?: string })?.name !== 'AbortError') throw err
        }
      } else {
        const link = document.createElement('a')
        link.download = fileName
        link.href = dataUrl
        link.click()
        toast.success('박스스코어 공유 이미지를 저장했어요')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(`이미지를 저장하지 못했어요: ${msg}`)
    } finally {
      setSavingImage(false)
      setRenderingShare(false)
    }
  }

  // 팀 전적 (공유 이미지용 + 경기결과 탭 요약) — 정본 lib/stats/dayRecord.ts. 홈·일정·하이라이트와 같은 규칙:
  //   친선전 제외(친선전뿐인 날은 친선전으로 세고 「친선전」 표시) · 정체성 키(team_id + 그 분기 이름)로 묶음 · 승률 → 득실.
  //   팀 이름은 daily-boxscore 가 이미 (team_id, quarter_id) 로 풀어 준 값이다.
  const dayRecord = tallyDayRecord(games.map(g => ({
    home: g.home_team ? { key: identityKeyOf(g.home_team.id, g.home_team.name), name: g.home_team.name, color: g.home_team.color } : null,
    away: g.away_team ? { key: identityKeyOf(g.away_team.id, g.away_team.name), name: g.away_team.name, color: g.away_team.color } : null,
    home_score: g.home_score, away_score: g.away_score,
    is_complete: g.is_complete, is_exhibition: g.is_exhibition,
  })))
  const teamRecords = dayRecord.teams.map(t => ({
    id: t.key, name: t.name, color: t.color, W: t.wins, L: t.losses, D: t.draws, PF: t.ptsFor, PA: t.ptsAgainst,
  }))

  const load = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/daily-boxscore?date=${date}`)
      if (!r.ok) { setError(true); return }
      const d = await r.json()
      const gs: GameData[] = d.games ?? []
      setGames(gs)
      setRolledUp(d.rolled_up === true)
      setDailyStats(d.daily_stats ?? [])
      setAssistLinks(d.assist_links ?? [])
      // ?game= 딥링크가 묶인 중간 슬롯을 가리킬 수 있다. 롤업 뒤에는 그 id 가 카드 key 가
      //   아니므로 슬롯 id 목록으로 되짚어 그 경기를 펼친다(명경기 카드 → 그 경기로 보내는 진입점).
      if (initialGameId) {
        const owner = gs.find(g => g.id === initialGameId || g.slot_ids?.includes(initialGameId))
        if (owner && owner.id !== initialGameId) setExpandedGame(owner.id)
      }
    } catch {
      // 네트워크 실패 — 「경기가 없어요」로 보이면 안 된다(기록이 지워진 것처럼 읽힌다)
      setError(true)
    } finally { setLoading(false) }
  }, [leagueId, date, initialGameId])

  useEffect(() => { load() }, [load])

  const completedCount = games.filter(g => g.is_complete).length
  const recordedCount = games.filter(g => g.is_started || g.is_complete).length  // 실제 진행된 경기 (미사용 슬롯 제외)

  const myLine = myId ? dailyStats.find(r => r.player_id === myId) ?? null : null

  return (
    <MyIdCtx.Provider value={myId}>
    <div className="mm-brand overflow-hidden" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)', boxShadow: 'var(--mm-edge-light), var(--mm-shadow-sm)' }}>
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
              className="mm-press inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold cursor-pointer transition-colors duration-200 disabled:opacity-50 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
              style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', borderRadius: 'var(--mm-radius-ctl)' }}
            >
              {savingImage ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
              <span className="hidden sm:inline">이미지 공유</span>
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
            {/* 점수는 절대 잘리지 않게 shrink-0 — 좁으면 팀명만 말줄임 */}
            <p className="text-xs sm:text-sm min-w-0 flex-1 flex items-center gap-1" style={{ color: 'var(--mm-ink-soft)' }}>
              <span className="shrink-0 whitespace-nowrap">
                <Trophy size={14} className="inline mr-1 -mt-0.5" style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden />
                이날의 주인공 · <PlayerCardName id={hero.player_id} name={hero.name} className="font-bold" hitArea={false} style={{ color: 'var(--mm-ink)' }} />
              </span>
              {ddKinds.get(hero.player_id) && <span className="shrink-0"><DdChip kind={ddKinds.get(hero.player_id)!} /></span>}
              {hero.team_name && <span className="min-w-0 truncate" title={hero.team_name} style={{ color: 'var(--mm-muted)' }}>({hero.team_name})</span>}
              <span className="shrink-0 font-bold tabular-nums" style={{ color: accentOrInk(heroColor) }}>{hero.pts}점</span>
            </p>
          </div>
        )
      })()}

      {/* 내 기록 한 줄 (2026-10-26 점검 MVP 1) — 그날 뛰었으면 표를 뒤지지 않아도 위에서 바로 보인다 */}
      {!loading && myLine && (
        <button
          type="button"
          onClick={() => setActiveTab('players')}
          className="mm-press w-full shrink-0 px-4 lg:px-6 py-2 flex items-center gap-2.5 min-h-11 text-left cursor-pointer"
          style={{ background: MY_ROW_BG, borderBottom: '1px solid var(--mm-rule)', boxShadow: 'inset 3px 0 0 var(--mm-yellow-strong)' }}
        >
          <MeTag />
          <span className="text-sm font-black tabular-nums min-w-0 flex-1" style={{ color: 'var(--mm-ink)' }}>
            {myLine.pts}점 · {myLine.reb}리바 · {myLine.ast}어시
            <span className="font-bold" style={{ color: 'var(--mm-ink-soft)' }}> · {myLine.gp}경기</span>
          </span>
          <span className="text-xs font-bold shrink-0" style={{ color: 'var(--mm-ink-soft)' }}>선수 기록 →</span>
        </button>
      )}

      {/* 하이라이트 보기 — 전체 · 우리 팀 · 내 기록 → 전체화면 연속 재생 (2026-10-14). 클립은 펼칠 때 받는다 */}
      {!loading && games.length > 0 && (
        <DayHighlightsLauncher leagueId={leagueId} date={date} games={games} initialScope={initialHl} />
      )}

      {/* 탭 바 — 스코어보드 접이식 섹션 제거, 콘텐츠는 경기결과 탭으로 이관 */}
      {!loading && games.length > 0 && (
        // 공용 SegmentedTabs(리뉴얼 1단계) — 5탭은 360px 에 빠듯해 트랙이 가로로 밀리고, 고른 탭은 화면 안으로 당겨 온다
        <div className="shrink-0 px-4 lg:px-6 py-2.5" style={{ background: 'var(--mm-panel)', borderBottom: '1px solid var(--mm-rule)' }}>
          <SegmentedTabs
            items={[
              { key: 'result',  label: '경기결과',  count: games.length },
              { key: 'players', label: '선수 기록', count: dailyStats.length },
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
        <BoxscoreSkeleton />
      ) : error ? (
        <EmptyState
          icon={CloudOff}
          title="기록을 불러오지 못했어요"
          description="잠시 뒤 다시 시도해 주세요."
          action={
            <button
              type="button"
              onClick={() => void load()}
              className="mm-press inline-flex items-center min-h-11 px-4 text-sm font-bold cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
              style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', borderRadius: 'var(--mm-radius-ctl)' }}
            >다시 시도</button>
          }
        />
      ) : games.length === 0 ? (
        <EmptyState icon={CalendarX} title="이 날 기록된 경기가 없어요" />
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
                  <h2
                    className="text-base lg:text-lg font-black mb-2.5"
                    style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
                  >팀별 일일 전적{dayRecord.exhibitionOnly && (
                    <span className="ml-2 align-middle text-xs font-bold px-1.5 py-0.5" style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-muted)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)' }}>친선전</span>
                  )}</h2>
                  {!dayRecord.exhibitionOnly && dayRecord.exhibitionGames > 0 && (
                    <p className="text-xs -mt-1.5 mb-2" style={{ color: 'var(--mm-muted)' }}>친선전 {dayRecord.exhibitionGames}경기는 전적에서 뺐어요.</p>
                  )}
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
                              title={r.name ?? undefined}
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
                <h2
                  className="text-base lg:text-lg font-black"
                  style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
                >경기별 스코어</h2>

                {/* ⚠ "카드를 누르면 박스스코어가 열린다"는 안내가 rolledUp 일 때만 떴다.
                    정규전은 같은 대진이 연속될 수 없어(2연속 뛴 팀 강제 휴식) 롤업이 한 칸도
                    안 일어나므로, 이 안내가 **영영 안 떴다.** 접힌 카드에 셰브론 아이콘 하나뿐이라
                    맞대결 기록이 있는 줄도 몰랐다는 신고로 이어졌다(2026-09-18). 안내는 늘 띄운다. */}
                <p className="text-xs -mt-1.5 mb-2.5 max-w-prose text-pretty" style={{ color: 'var(--mm-muted)' }}>
                  {rolledUp && '쿼터별로 나눠 올린 경기는 한 경기로 묶어 보여 줘요. '}
                  카드를 누르면 그 경기의 박스스코어가 열려요.
                </p>

                {games.map(g => {
                  const isExpanded = expandedGame === g.id
                  const videoList = (g.videos && g.videos.length > 0)
                    ? g.videos
                    : g.youtube_url ? [{ slot_num: g.slot_num, quarter: null, url: g.youtube_url, start_offset: g.youtube_start_offset }] : []
                  const homeWin = g.is_complete && g.home_score > g.away_score
                  const awayWin = g.is_complete && g.away_score > g.home_score
                  const draw = g.is_complete && g.home_score === g.away_score

                  return (
                    <div
                      key={g.id}
                      className="mm-lift overflow-hidden relative"
                      style={{
                        background: !g.is_complete && g.is_started ? 'var(--mm-yellow-soft)' : 'var(--mm-panel-alt)',
                        border: '1px solid var(--mm-rule)',
                        borderRadius: 'var(--mm-radius-ctl)',
                      }}
                    >
                      {/* 경기 헤더 — 클릭하면 확장 */}
                      <button
                        type="button"
                        className="w-full text-left px-4 sm:px-5 py-3 sm:py-4 cursor-pointer transition-colors duration-200 min-h-11 hover:bg-[color:var(--mm-yellow-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-inset"
                        onClick={() => setExpandedGame(isExpanded ? null : g.id)}
                        aria-expanded={isExpanded}
                        aria-controls={`game-details-${g.id}`}
                      >
                        {/* 상단 라인: 슬롯 · 상태 배지 · YT · 화살표 */}
                        <div className="flex items-center gap-2 mb-2">
                          {/* 묶인 경기는 슬롯 범위를 보여준다 — "#1" 만 뜨면 나머지 세 칸이 어디 갔는지 알 수 없다 */}
                          <span className="text-xs font-bold shrink-0 tabular-nums" style={{ color: 'var(--mm-muted)' }}>
                            {gameNumLabel(g)}
                          </span>
                          {g.is_complete && (
                            <span
                              className="text-xs font-bold shrink-0"
                              style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', padding: '2px 8px', borderRadius: 'var(--mm-radius-chip)' }}
                            >완료</span>
                          )}
                          {!g.is_complete && g.is_started && (
                            <span
                              className="text-xs font-bold shrink-0"
                              style={{ background: 'var(--mm-panel)', color: 'var(--mm-live)', border: '1px solid var(--mm-live)', padding: '1px 8px', borderRadius: 'var(--mm-radius-chip)' }}
                            >진행 중</span>
                          )}
                          {!g.is_started && (
                            <span className="text-xs font-semibold shrink-0" style={{ color: 'var(--mm-muted)' }}>예정</span>
                          )}
                          <div className="ml-auto flex items-center gap-2 shrink-0">
                            {videoList.length > 0 && <Youtube size={14} style={{ color: 'var(--mm-live)' }} aria-label="경기 영상 있음" />}
                            {/* 아이콘만으로는 눌러서 열 수 있다는 게 안 읽힌다 — 글자로 적는다.
                                모바일에서 숨기지 않는다(이 화면을 실제로 보는 곳이 휴대폰이다).
                                좁은 폭에서는 팀명 쪽이 truncate 되므로 이 글자가 밀어내지 않는다. */}
                            <span className="text-xs font-semibold whitespace-nowrap" style={{ color: 'var(--mm-muted)' }}>
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
                              title={g.home_team?.name ?? '미정'}
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
                              title={g.away_team?.name ?? '미정'}
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
                                      <span className="truncate" title={row.team?.name ?? '미정'}>{row.team?.name ?? '미정'}</span>
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
                          {isEditMode && (
                            // 팀 어드민 · CEO 전용 — 이 경기의 기록 화면을 「기록 내역」이 열린 채로 연다(record/_hooks/useDeepLink)
                            <div className="px-4 sm:px-5 pt-3 flex justify-end">
                              <Link
                                href={`/league/${orgSlug}/${leagueId}/record?date=${date}&game=${g.slot_ids?.[0] ?? g.id}&log=1`}
                                className="mm-press inline-flex items-center gap-1.5 min-h-11 px-3 text-sm font-bold whitespace-nowrap hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                                style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}
                              >
                                <PenLine size={14} aria-hidden />
                                기록 수정
                              </Link>
                            </div>
                          )}
                          <div className="px-4 sm:px-5 pb-4">
                            {g.players.length > 0
                              ? <GameBoxscore game={g} onPlayerPick={pickPlayer} />
                              : <EmptyState variant="compact" icon={UserX} title="기록된 선수 데이터가 없어요" />}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </section>

              {/* 리뉴얼 R1 (2026-10-31): 종전 3·4번 탭 — 팀 비교는 막대 그림으로 바로, 어시스트 연결은 접어 둔다 */}
              <section aria-label="팀 비교">
                <h2 className="text-base font-black mb-2" style={{ color: 'var(--mm-ink)' }}>팀 비교</h2>
                <TeamComparePanel games={games} />
              </section>
              <details className="group" style={{ borderTop: '1px solid var(--mm-rule)' }}>
                <summary className="mm-press list-none cursor-pointer flex items-center justify-between min-h-11 pt-3 text-base font-black" style={{ color: 'var(--mm-ink)' }}>
                  누가 누구를 도왔나 · 어시스트
                  <ChevronDown size={18} aria-hidden className="transition-transform group-open:rotate-180" style={{ color: 'var(--mm-muted)' }} />
                </summary>
                <div className="pt-3">
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
              </details>
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
                    type="button"
                    className="mm-press px-3 py-2 text-xs font-bold transition-colors duration-200 cursor-pointer min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
                    style={teamFilter === 'all'
                      ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', borderRadius: 'var(--mm-radius-chip)' }
                      : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)' }}
                  >전체</button>
                  {teamList.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTeamFilter(t.id)}
                      aria-pressed={teamFilter === t.id}
                      type="button"
                      className="mm-press px-3 py-2 text-xs font-bold transition-colors duration-200 cursor-pointer min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
                      style={teamFilter === t.id
                        // 팀 컬러가 흰색 등 밝은 색이면 하드코딩 '#fff' 텍스트가 사라진다 →
                        // 배경 밝기에 맞춰 textOnBg 로 대비색 자동 결정 (2026-08-08 핫픽스).
                        // t.color 가 없어 mm-yellow 폴백일 땐 기존처럼 mm-black 유지.
                        ? { backgroundColor: t.color ?? 'var(--mm-yellow)', borderColor: t.color ?? 'var(--mm-yellow)', border: '1px solid', color: t.color ? textOnBg(t.color) : 'var(--mm-black)', borderRadius: 'var(--mm-radius-chip)' }
                        : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)' }}
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
                : <EmptyState variant="compact" icon={UserX} title="집계된 스탯이 없어요" framed />}
            </div>
            )
          })()}

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
    </MyIdCtx.Provider>
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
              className="mm-press px-3 min-h-11 text-xs font-bold cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
              style={i === idx
                ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: 'var(--mm-radius-chip)' }
                : { background: 'var(--mm-panel)', color: 'var(--mm-muted)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)' }}
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

// 팀 색이 없는 팀의 비교 막대 색. accentOrInk 가 hex 만 파싱해서 CSS 변수를 못 넘긴다 —
//   값은 globals.css 라이트 테마 토큰 그대로(--mm-live / --mm-dr). 토큰을 바꾸면 여기도 같이 고친다.
const FALLBACK_COLOR_A = '#C4362B' // = --mm-live (light)
const FALLBACK_COLOR_B = '#175278' // = --mm-dr (light)

// 불러오는 동안의 자리 — 탭 바 · 팀 전적 카드 3장 · 경기 카드 4줄. 실제 화면과 같은 높이로 둬 그려질 때 튀지 않는다.
function BoxscoreSkeleton() {
  const block = (cls: string, radius = 'var(--mm-radius-ctl)') => (
    <div className={`mm-shimmer ${cls}`} style={{ borderRadius: radius }} />
  )
  return (
    <div role="status" aria-label="박스스코어 불러오는 중" aria-busy="true">
      <div className="px-4 lg:px-6 py-2.5 flex gap-1.5 overflow-hidden" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="shrink-0">{block('h-9 w-20', 'var(--mm-radius-chip)')}</div>)}
      </div>
      <div className="px-4 py-4 lg:px-6 lg:py-5 space-y-6">
        <div>
          {block('h-6 w-32 mb-2.5')}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[0, 1, 2].map(i => <div key={i}>{block('h-[76px] w-full')}</div>)}
          </div>
        </div>
        <div className="space-y-3">
          {block('h-6 w-28')}
          {[0, 1, 2, 3].map(i => <div key={i}>{block('h-[88px] w-full')}</div>)}
        </div>
      </div>
      <span className="sr-only">불러오는 중이에요</span>
    </div>
  )
}

function TeamComparePanel({ games }: { games: GameData[] }) {
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
      <EmptyState variant="compact" icon={Swords} title="이날 두 팀이 맞붙은 기록이 없어요." framed />
    )
  }

  const activePair = pairs.find(p => p.key === activePairKey)
  if (!activePair) return null

  const h2h = aggregateHeadToHead(games, activePair.a, activePair.b, teamMeta)
  const A = h2h.A
  const B = h2h.B
  const colorA = A.color ?? FALLBACK_COLOR_A
  const colorB = B.color ?? FALLBACK_COLOR_B

  return (
    <div className="space-y-4">
      {!allComplete && (
        <div
          role="note"
          className="flex items-start gap-1.5 text-xs px-3 py-2 font-medium"
          style={{ color: 'var(--mm-ink)', background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow)', borderRadius: 'var(--mm-radius-ctl)' }}
        >
          <AlertTriangle size={14} aria-hidden className="shrink-0 mt-px" style={{ color: 'var(--mm-yellow-strong)' }} />
          <span>아직 마감 안 된 경기가 있어서, 숫자는 마감 뒤에 확정돼요.</span>
        </div>
      )}

      {/* 조합 버튼 — 팀 3개면 3쌍이 자연스럽게 grid-cols-3 */}
      <div>
        <h2 className="text-base lg:text-lg font-black mb-2" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>
          이날 맞붙은 팀
        </h2>
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
                type="button"
                className="mm-press px-3 py-2.5 text-xs font-bold transition-colors duration-200 cursor-pointer flex items-center justify-center gap-1.5 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
                style={active
                  ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', borderRadius: 'var(--mm-radius-ctl)' }
                  : { background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)', borderRadius: 'var(--mm-radius-ctl)' }}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colA }} />
                <span className="truncate min-w-0" title={nameA}>{nameA}</span>
                <span className="opacity-70 shrink-0">vs</span>
                <span className="truncate min-w-0" title={nameB}>{nameB}</span>
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: colB }} />
              </button>
            )
          })}
        </div>
      </div>

      {h2h.gameCount === 0 ? (
        <EmptyState
          variant="compact"
          icon={Swords}
          framed
          title={<>
            <span style={{ color: 'var(--mm-ink)' }}>{A.name}</span>
            {' vs '}
            <span style={{ color: 'var(--mm-ink)' }}>{B.name}</span>
            {', 이 날짜에 맞붙은 경기가 없어요.'}
          </>}
          description="두 팀이 실제로 맞붙은 경기 기록만 세요."
        />
      ) : (
        // 팀 탭 「누적 맞대결」과 같이 폭을 묶어 가운데로 — PC 전폭이면 항목명과 양끝 숫자가 너무 멀다
        <div className="max-w-3xl mx-auto">
          <HeadToHeadBars
            a={{ name: A.name, color: colorA, sub: '', totals: A }}
            b={{ name: B.name, color: colorB, sub: '', totals: B }}
            centerSub={`맞대결 ${h2h.gameCount}경기`}
          />
        </div>
      )}
    </div>
  )
}
