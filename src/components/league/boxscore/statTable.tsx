'use client'
import { useState, createContext, useContext, Fragment } from 'react'
import { ChevronDown, ChevronUp, ChevronsUpDown, Flame, Hand } from 'lucide-react'
import { accentOrInk } from '@/lib/util/contrastColor'
import { doubleDoubleKind } from '@/lib/stats/doubleDouble'
import Avatar from '@/components/league/ui/Avatar'
import SortSelect from '@/components/league/ui/SortSelect'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Play } from 'lucide-react'

// 박스스코어 선수 표·카드와 공용 조각 — BoxscoreContent.tsx 에서 나눔(2026-11-15). 화면 모양은 그대로.

export type DdMap = Map<string, 'DD' | 'TD'>

export function ddMapOf(rows: { player_id: string; pts: number; reb: number; ast: number; stl: number; blk: number }[]): DdMap {
  return new Map(
    rows
      .map(d => [d.player_id, doubleDoubleKind(d)] as const)
      .filter((e): e is readonly [string, 'DD' | 'TD'] => e[1] !== null),
  )
}

/** 이름 클릭 핸들러. 없으면 이름은 버튼이 아니라 글자 그대로 그린다. */
export type PlayerPick = (playerId: string, name: string) => void

export const DD_LABEL = { DD: '더블더블', TD: '트리플더블' } as const

// 더블더블·트리플더블 칩 (2026-11-04 운영진 — 「DD/TD 는 심심하다」).
// 약어 대신 우리말 전체 이름 + 불꽃 아이콘. 트리플더블은 노랑 채움, 더블더블은 진한 잉크 채움으로 둘 다 또렷하게.
export function DdChip({ kind }: { kind: 'DD' | 'TD' }) {
  const full = DD_LABEL[kind]
  return (
    <span
      title={full}
      className="inline-flex items-center gap-0.5 h-5 pl-1 pr-1.5 text-[12px] font-black whitespace-nowrap shrink-0 align-middle"
      style={kind === 'TD'
        ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1.5px solid var(--mm-black)', borderRadius: 'var(--mm-radius-chip)', letterSpacing: '-0.01em' }
        : { background: 'var(--mm-ink)', color: 'var(--mm-panel)', borderRadius: 'var(--mm-radius-chip)', letterSpacing: '-0.01em' }}
    >
      <Flame size={13} strokeWidth={2.5} aria-hidden />
      {full}
    </span>
  )
}

export function DdLegend() {
  return (
    <p className="t-label break-keep" style={{ color: 'var(--mm-muted)' }}>
      더블더블 = 득점·리바운드·어시스트·스틸·블록 중 2개가 두 자릿수<br />트리플더블 = 3개 이상
    </p>
  )
}

export type PlayerRow = {
  player_id: string; name: string; number: number | null
  /** 이름 옆 얼굴 — 없으면 Avatar 가 첫 글자로 대체 */
  photo_url?: string | null
  team_id: string | null; team_name: string | null; team_color: string | null
  pts: number; reb: number; oreb: number; dreb: number
  ast: number; stl: number; blk: number; tov: number; pf: number
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
  /** 속공 득점(2026-11) — 옛 캐시 응답엔 없을 수 있다 */
  fb_pts?: number
  /** 슛 종류별 성공·시도(2026-11-15) — 옛 캐시 응답엔 없을 수 있다 */
  lay_m?: number; lay_a?: number; post_m?: number; post_a?: number; mid_m?: number; mid_a?: number
  fg_pct: number | null; fg3_pct: number | null
}

export type GameData = {
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

export type DailyStat = {
  player_id: string; name: string; number: number | null; gp: number
  team_id: string | null; team_name: string | null; team_color: string | null
  /** "그날의 주인공" 히어로용 (2026-08-10) — daily-boxscore route 가 league_players 에서 조회해 실어줌 */
  photo_url?: string | null
  pts: number; reb: number; oreb: number; dreb: number
  ast: number; stl: number; blk: number; tov: number; pf: number
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
  /** 속공 득점 — 옛 캐시 응답엔 없을 수 있다 */
  fb_pts?: number
  /** 슛 종류별 성공·시도(2026-11-15) — 옛 캐시 응답엔 없을 수 있다 */
  lay_m?: number; lay_a?: number; post_m?: number; post_a?: number; mid_m?: number; mid_a?: number
  fg_pct: number | null; fg3_pct: number | null
}

export type TeamAgg = {
  id: string; name: string; color: string | null
  pts: number; reb: number; oreb: number; dreb: number
  ast: number; stl: number; blk: number; tov: number; pf: number
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number; fb_pts: number
}

// 5·6 은 league_game_events.quarter CHECK(1~6) 상한에서 온 연장 슬롯이다.

export type ColDef = { key: string; label: string; sortKey?: string }

export const MyIdCtx = createContext<string | null>(null)
// 내 줄은 바탕색 없이 노란 테두리만 — 리더보드(MINE_OUTLINE)와 같은 모양(2026-11-08 운영진).
//   표 줄 · 폰 카드 · 맨 위 「나」 요약 줄 모두 같다.
export const MINE_OUTLINE = '2px solid var(--mm-yellow-strong)'
export function MeTag() {
  return <span className="shrink-0 px-1 text-[12px] font-black leading-4" style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: 3 }}>나</span>
}

// 선수명. 누르면 선수 카드 모달이 열린다 — 글자 크기·굵기·색은 기존 그대로 두고
// 눌린다는 신호(커서·밑줄·포커스 링)만 더한다. player_id 가 없으면 글자로만 그린다.
export function PlayerName({ row, onPlayerPick, className = 'whitespace-nowrap' }: { row: PlayerRow | DailyStat; onPlayerPick?: PlayerPick; className?: string }) {
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

// 「▶ 장면」 — 그날 이 선수 하이라이트로 바로 간다(2026-11-10 운영진 — 사람들이 가장 많이 보는 화면이 박스스코어라
//   하이라이트 탭을 따로 찾아오지 않아도 영상으로 넘어가게). 클립은 득점·어시스트 장면이라 둘 다 0 이면 그리지 않는다.
export function ClipLink({ row }: { row: PlayerRow | DailyStat }) {
  const { orgSlug, leagueId, date } = useParams<{ orgSlug: string; leagueId: string; date: string }>()
  const r = row as PlayerRow
  if (!row.player_id || !date || ((r.pts ?? 0) === 0 && (r.ast ?? 0) === 0)) return null
  return (
    <Link
      href={`/league/${orgSlug}/${leagueId}/highlights?date=${date}&player=${encodeURIComponent(row.player_id)}`}
      className="mm-press shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-full active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
      style={{ color: 'var(--mm-ink)', background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', }}
      aria-label={`${row.name} 그날 장면 보기`}
      title="그날 장면 보기"
    >
      <Play size={11} fill="currentColor" className="ml-px" aria-hidden />
    </Link>
  )
}

/** 얼굴 테두리 — 팀 색을 두 테마 대비에 맞춰(accentOrInk). 팀을 모르면 null → Avatar 의 1px rule */
export const ringOf = (color: string | null | undefined) => color ? accentOrInk(color) : null

export const ftPct = (r: { ftm: number; fta: number }) => r.fta > 0 ? Math.round(r.ftm / r.fta * 1000) / 10 : null

/** 팀 합계 한 줄 — 경기별 표의 맨 아래 */
export type TotalLine = Omit<PlayerRow, 'player_id' | 'name' | 'number' | 'photo_url' | 'team_id' | 'team_name' | 'team_color'>

export function sumLine(rows: PlayerRow[]): TotalLine {
  const t = { pts: 0, fb_pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0, pf: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, lay_m: 0, lay_a: 0, post_m: 0, post_a: 0, mid_m: 0, mid_a: 0 }
  for (const r of rows) for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += r[k] ?? 0
  const pct = (m: number, a: number) => a > 0 ? Math.round(m / a * 1000) / 10 : null
  return { ...t, fg_pct: pct(t.fgm, t.fga), fg3_pct: pct(t.fg3m, t.fg3a) }
}

/** 합계 줄 옵션 — label 기본 「팀 합계」, gp 를 주면 G 칸에 그 값(하루 합산표 = 그날 경기 수) */
export type TotalOpts = { label?: string; gp?: number }

export type QuarterStandings = { label: string; days: number; teams: { key: string; name: string; color: string | null; W: number; L: number; D: number; PF: number; PA: number }[] }

/** 이미 승률 → 득실 순으로 정렬된 목록에 순위를 붙인다 — 승률·득실이 같으면 공동 순위(1·2·2·4) */
export function withRanks<T extends { W: number; L: number; D: number; PF: number; PA: number }>(rows: T[]): { row: T; rank: number }[] {
  const key = (r: T) => { const gp = r.W + r.L + r.D; return `${gp > 0 ? (r.W / gp).toFixed(4) : '0'}|${r.PF - r.PA}` }
  return rows.map((row, i) => ({ row, rank: rows.findIndex(x => key(x) === key(row)) + 1 || i + 1 }))
}

/** 「1위」 배지 — 1·2·3위는 금·은·동 바탕, 그 아래는 회색 */
export function RankBadge({ rank }: { rank: number }) {
  const tone = rank === 1 ? { bg: 'var(--rank-1-bg)', fg: 'var(--rank-1-fg)' }
    : rank === 2 ? { bg: 'var(--rank-2-bg)', fg: 'var(--rank-2-fg)' }
    : rank === 3 ? { bg: 'var(--rank-3-bg)', fg: 'var(--rank-3-fg)' }
    : { bg: 'var(--mm-panel-alt)', fg: 'var(--mm-muted)' }
  return (
    <span className="t-num shrink-0 inline-flex items-center justify-center h-6 min-w-9 px-1.5 text-xs font-bold"
      style={{ background: tone.bg, color: tone.fg, borderRadius: 'var(--mm-radius-chip)' }}>{rank}위</span>
  )
}

/** 리바 아래 「공 x · 수 y」 한 줄 */
export function RebSplit({ r }: { r: TotalLine }) {
  return <span className="block text-[12px] font-semibold tabular-nums whitespace-nowrap" style={{ color: 'var(--mm-muted)' }}>공 {r.oreb ?? 0} · 수 {r.dreb ?? 0}</span>
}

// 성공/시도 칸 아래 성공률 한 줄 — 표에서 「~율」 칸을 따로 두지 않으려고(2026-11-03)
export function PctUnder({ rr, k }: { rr: TotalLine; k: string }) {
  const pair = k === 'fgm_fga' ? [rr.fgm, rr.fga] : k === 'fg3m_fg3a' ? [rr.fg3m, rr.fg3a] : k === 'ftm_fta' ? [rr.ftm, rr.fta] : null
  if (!pair) return null
  const [m, a] = pair
  return <span className="block text-[12px] font-semibold tabular-nums" style={{ color: 'var(--mm-muted)' }}>{a > 0 ? `${Math.round((m / a) * 1000) / 10}%` : '—'}</span>
}

/** 슛 종류 넷 — 레이업·골밑·미들·3점 (2026-11-15 운영진 — 「야투」를 누르면 펼친다) */
export function shotTypesOf(r: TotalLine) {
  return [
    { label: '레이업', m: r.lay_m ?? 0, a: r.lay_a ?? 0 },
    { label: '골밑', m: r.post_m ?? 0, a: r.post_a ?? 0 },
    { label: '미들', m: r.mid_m ?? 0, a: r.mid_a ?? 0 },
    { label: '3점', m: r.fg3m, a: r.fg3a },
  ]
}
export const SHOT_COLORS = ['var(--mm-yellow-strong)', 'var(--mm-or)', 'var(--mm-dr)', 'var(--mm-ink-soft)']

/** 시도 비중 도넛 — 가운데 = 야투 시도 수 (2026-11-15 운영진: 막대 대신 원형) */
export function ShotDonut({ parts, total }: { parts: { v: number; color: string }[]; total: number }) {
  const R = 22, C = 2 * Math.PI * R
  const offs = parts.reduce<number[]>((acc, p, i) => { acc.push(i === 0 ? 0 : acc[i - 1] + Math.max(0, parts[i - 1].v) / total * C); return acc }, [])
  return (
    <svg width={56} height={56} viewBox="0 0 56 56" className="shrink-0" role="img" aria-label={`야투 시도 ${total}개 비중`}>
      <circle cx={28} cy={28} r={R} fill="none" stroke="var(--mm-panel-alt)" strokeWidth={9} />
      {parts.map((p, i) => {
        if (p.v <= 0) return null
        const len = p.v / total * C
        return <circle key={i} cx={28} cy={28} r={R} fill="none" stroke={p.color} strokeWidth={9}
          strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offs[i]} transform="rotate(-90 28 28)" />
      })}
      <text x={28} y={31} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--mm-ink)">{total}</text>
    </svg>
  )
}

/** 슛 종류별 성공/시도·성공률·시도 비중 — 위 막대 = 시도 비중, 아래 칸 넷 */
export function ShotBreakdown({ r }: { r: TotalLine }) {
  const types = shotTypesOf(r)
  const total = types.reduce((n, t) => n + t.a, 0)
  if (total === 0) return <p className="text-xs py-1" style={{ color: 'var(--mm-muted)' }}>야투 시도가 없어요</p>
  return (
    <div className="flex items-center gap-2">
      <ShotDonut parts={types.map((t, i) => ({ v: t.a, color: SHOT_COLORS[i] }))} total={total} />
      <div className="grid grid-cols-4 gap-1 flex-1 min-w-0">
        {types.map((t, i) => (
          <div key={t.label} className="text-center py-1" style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-chip)' }}>
            <div className="flex items-center justify-center gap-1 text-[12px] font-semibold break-keep" style={{ color: 'var(--mm-muted)' }}>
              <span className="w-2 h-2 shrink-0" style={{ background: SHOT_COLORS[i], borderRadius: 999 }} aria-hidden />{t.label}
            </div>
            <div className="t-num text-sm font-bold leading-tight" style={{ color: 'var(--mm-ink)' }}>{t.m}/{t.a}</div>
            <div className="t-num text-[12px] font-semibold" style={{ color: 'var(--mm-ink-soft)' }}>
              {t.a > 0 ? `${Math.round(t.m / t.a * 100)}%` : '—'}
            </div>
            <div className="t-num text-[12px] font-semibold whitespace-nowrap" style={{ color: 'var(--mm-muted)' }}>비중 {Math.round(t.a / total * 100)}%</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function StatTable({ rows, showGP = false, ddKinds, onPlayerPick, total, totalOpts }: { rows: (PlayerRow | DailyStat)[]; showGP?: boolean; ddKinds?: DdMap; onPlayerPick?: PlayerPick; total?: TotalLine; totalOpts?: TotalOpts }) {
  const myId = useContext(MyIdCtx)
  const [sortKey, setSortKey] = useState('pts')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  // 리바 값을 누르면 모든 줄에 공·수, 야투 값을 누르면 줄마다 슛 종류 펼침(2026-11-15 운영진)
  const [rebOpen, setRebOpen] = useState(false)
  const [shotOpen, setShotOpen] = useState(false)

  const COLS: ColDef[] = [
    ...(showGP ? [{ key: 'gp', label: '경기', sortKey: 'gp' }] : []),
    { key: 'pts',     label: '득점',  sortKey: 'pts'  },
    { key: 'reb',     label: '리바',  sortKey: 'reb'  },
    { key: 'ast',     label: '어시',  sortKey: 'ast'  },
    { key: 'stl',     label: '스틸',  sortKey: 'stl'  },
    { key: 'blk',     label: '블록',  sortKey: 'blk'  },
    { key: 'tov',     label: '턴오버',  sortKey: 'tov'  },
    // 성공/시도 아래 줄에 성공률 — 「야투율·3점률·자유투율」 칸을 따로 두면 PC 에서도 표가 넘쳤다(2026-11-03 가로 스크롤 금지)
    { key: 'fgm_fga', label: '야투',   sortKey: 'fgm'  },
    { key: 'fg3m_fg3a', label: '3점', sortKey: 'fg3m' },
    { key: 'ftm_fta', label: '자유투',   sortKey: 'ftm'  },
    // 파울(PF)은 기록하지 않아 뺐다(2026-11-04 운영진)
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

  // 성공/시도는 「/」 뒤에서만 줄을 넘길 수 있게(2026-11-08 — 표 칸이 값 한가운데서 꺾이지 않도록 바꾼 뒤, 합계 줄 「185/477」이 옆 칸으로 넘쳤다)
  const withSlashBreak = (v: string) => v.includes('/') ? <>{v.split('/')[0]}/<wbr />{v.split('/')[1]}</> : v
  function cellVal(rr: TotalLine & { gp?: number }, key: string): string {
    if (key === 'gp')       return String(rr.gp ?? 1)
    if (key === 'pts')      return String(rr.pts)
    if (key === 'fb_pts')   return String(rr.fb_pts ?? 0)
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
    <div>
      {/* 셀 크기·굵기는 globals.css 의 t-th / t-td / t-td-key 가 정본이다(가독성 업그레이드 2026-09-18).
          여기서 text-sm 같은 크기를 다시 주면 11벌 표가 또 갈라진다. 숫자는 본문체 tabular.
          mm-fit = 가로 스크롤 없이 칸 폭에 맞춘다(2026-11-03). */}
      <table className="mm-fit">
        <thead>
          <tr style={{ borderBottom: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}>
            <th
              scope="col"
              className="t-th text-left p-0 px-3 w-[7.5rem] xl:w-44"
            >
              {/* 다른 열과 같은 두 줄 틀 — 아래 아이콘 줄 자리만 비워 이름 줄 높이를 맞춘다 */}
              <span className="h-14 flex flex-col justify-end gap-0.5 py-2"><span className="whitespace-nowrap">선수 / 팀</span><span className="h-3.5 shrink-0" aria-hidden /></span>
            </th>
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
                      // 머리 칸 높이 통일(2026-11-09 운영진) — 1024 에서 「턴오버」「자유투」만 아이콘이 아랫줄로 밀려 높낮이가 달랐다.
                      //   모든 열을 「위: 이름 한 줄 · 아래: 정렬 아이콘」 같은 두 줄 틀로 그린다.
                      className="mm-press w-full h-14 flex flex-col items-center justify-end gap-0.5 px-0.5 py-2 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-inset"
                      style={{ font: 'inherit', color: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit', borderRadius: 'var(--mm-radius-ctl)' }}
                    >
                      <span className="whitespace-nowrap">{c.label}</span>
                      {isActive
                        ? (sortDir === 'desc' ? <ChevronDown size={14} aria-hidden /> : <ChevronUp size={14} aria-hidden />)
                        : <ChevronsUpDown size={14} className="opacity-30" aria-hidden />}
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
              <Fragment key={rr.player_id}>
              <tr
                className={`transition-colors duration-200 hover:bg-[color:var(--mm-yellow-soft)] ${i % 2 === 0 ? 'bg-[color:var(--mm-panel)]' : 'bg-[color:var(--mm-panel-alt)]'}`}
                style={{ borderBottom: '1px solid var(--mm-rule)', ...(isMe ? { outline: MINE_OUTLINE, outlineOffset: -2 } : null) }}
                data-me={isMe || undefined}
              >
                <th scope="row" className="py-2 px-3 text-left font-normal">
                  <div className="flex items-center gap-2">
                    {/* 팀 색 점 대신 얼굴(팀 색 테두리) — 점(8px)보다 16px 넓을 뿐이라 이름 칸 min-w 안에 든다 */}
                    <Avatar src={rr.photo_url} name={rr.name} size={24} ringColor={ringOf(rr.team_color)} decorative />
                    <div className="leading-tight min-w-0">
                      {/* 선수명은 본문체 600 — 유니폼체(좁음)와 900 굵기를 뺀 것이 이번 작업의 요지 */}
                      <span className="flex items-center gap-1.5 min-w-0">
                        <PlayerName row={rr} onPlayerPick={onPlayerPick} />
                        {isMe && <MeTag />}
                        <ClipLink row={rr} />
                      </span>
                      {/* 칩은 팀 이름 줄 오른쪽 — 따로 줄을 두면 행이 세로로 길어졌다(2026-11-11) */}
                      {(rr.team_name || ddKinds?.get(rr.player_id)) && (
                        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs leading-tight mt-0.5" style={{ color: 'var(--mm-muted)' }}>
                          {rr.team_name && <span className="whitespace-nowrap">{rr.team_name}</span>}
                          {ddKinds?.get(rr.player_id) && <DdChip kind={ddKinds.get(rr.player_id)!} />}
                        </p>
                      )}
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
                      {c.key === 'reb' || c.key === 'fgm_fga' ? (
                        <button type="button" onClick={() => (c.key === 'reb' ? setRebOpen(o => !o) : setShotOpen(o => !o))}
                          aria-expanded={c.key === 'reb' ? rebOpen : shotOpen}
                          title={c.key === 'reb' ? '공격·수비 리바운드 보기' : '슛 종류별 보기'}
                          className="w-full underline decoration-dotted underline-offset-4 cursor-pointer"
                          style={{ font: 'inherit', color: 'inherit', textDecorationColor: 'var(--mm-muted)' }}>
                          {withSlashBreak(cellVal(rr, c.key))}
                          <PctUnder rr={rr} k={c.key} />
                          {c.key === 'reb' && rebOpen && <RebSplit r={rr} />}
                        </button>
                      ) : (<>
                        {withSlashBreak(cellVal(rr, c.key))}
                        <PctUnder rr={rr} k={c.key} />
                      </>)}
                    </td>
                  )
                })}
              </tr>
              {shotOpen && (
                <tr style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                  <td colSpan={COLS.length + 1} className="px-3 py-2" style={{ background: 'var(--mm-panel)' }}>
                    <ShotBreakdown r={rr} />
                  </td>
                </tr>
              )}
              </Fragment>
            )
          })}
        </tbody>
        {total && (
          <tfoot>
            <tr style={{ borderTop: '2px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}>
              <th scope="row" className="t-th text-left px-3" style={{ color: 'var(--mm-ink)' }}>{totalOpts?.label ?? '팀 합계'}</th>
              {COLS.map(c => (
                <td key={c.key} className="t-td-key" style={{ color: 'var(--mm-ink)' }}>
                  {c.key === 'gp' ? (totalOpts?.gp != null ? String(totalOpts.gp) : '') : withSlashBreak(cellVal(total, c.key))}
                  {c.key !== 'gp' && <PctUnder rr={total} k={c.key} />}
                  {c.key === 'reb' && rebOpen && <RebSplit r={total} />}
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
// 모바일 선수 기록 한 칸 묶음 (2026-11-04 운영진)
//   기본 = 득점·리바·어시·스틸·블록·턴오버 6칸. 기록 칸을 누르면 슈팅(야투·3점·자유투 성공/시도 + %)으로 바뀐다 —
//   한 카드를 누르면 모든 카드가 같이 바뀐다(같은 줄끼리 비교하라고). 파울(PF)은 기록을 안 해 뺐고, 성공률 막대도 뺐다.
export type LineView = 'basic' | 'shoot'
export function LineGrid({ r, view }: { r: TotalLine; view: LineView }) {
  if (view === 'shoot') {
    const cells: [string, number, number][] = [['야투', r.fgm, r.fga], ['3점', r.fg3m, r.fg3a], ['자유투', r.ftm, r.fta]]
    return (
      <div className="space-y-1.5">
      <div className="grid grid-cols-3 gap-1.5">
        {cells.map(([label, m, a]) => (
          <div key={label} className="text-center py-1.5" style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-chip)' }}>
            <div className="text-[12px] font-semibold" style={{ color: 'var(--mm-muted)' }}>{label}</div>
            <div className="t-num text-base font-bold leading-tight" style={{ color: 'var(--mm-ink)' }}>{m}/{a}</div>
            <div className="t-num text-xs font-semibold" style={{ color: 'var(--mm-ink-soft)' }}>{a > 0 ? `${Math.round((m / a) * 1000) / 10}%` : '—'}</div>
          </div>
        ))}
        </div>
        <ShotBreakdown r={r} />
      </div>
    )
  }
  const cells: [string, number][] = [['득점', r.pts], ['리바', r.reb], ['어시', r.ast], ['스틸', r.stl], ['블록', r.blk], ['턴오버', r.tov]]
  return (
    <div className="grid grid-cols-6 gap-1">
      {cells.map(([label, v], i) => (
        <div key={label} className="text-center py-1.5" style={{ background: i === 0 ? 'var(--mm-yellow-soft)' : 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-chip)' }}>
          <div className="text-[12px] font-semibold" style={{ color: 'var(--mm-muted)' }}>{label}</div>
          <div className={`t-num leading-tight ${i === 0 ? 'text-lg font-bold' : 'text-base font-semibold'}`} style={{ color: 'var(--mm-ink)' }}>{v}</div>
          {label === '리바' && <div className="t-num text-[12px] font-semibold whitespace-nowrap" style={{ color: 'var(--mm-muted)' }}>공{r.oreb ?? 0}·수{r.dreb ?? 0}</div>}
        </div>
      ))}
    </div>
  )
}

export function MobileStatCards({ rows, showGP = false, ddKinds, onPlayerPick, hideSort = false, total, totalOpts }: { rows: (PlayerRow | DailyStat)[]; showGP?: boolean; ddKinds?: DdMap; onPlayerPick?: PlayerPick; hideSort?: boolean; total?: TotalLine; totalOpts?: TotalOpts }) {
  const myId = useContext(MyIdCtx)
  // 2026-10-31 운영진: 스틸·블록·3점도 정렬 — 같으면 득점 순
  type MobileSortKey = 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'fg3m'
  const [sortKey, setSortKey] = useState<MobileSortKey>('pts')
  const [view, setView] = useState<LineView>('basic')
  const flip = () => setView(v => (v === 'basic' ? 'shoot' : 'basic'))
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {!hideSort ? <SortSelect value={sortKey} options={sortBtns} onChange={setSortKey} /> : <span />}
        <button type="button" onClick={flip} aria-pressed={view === 'shoot'}
          className="mm-press inline-flex items-center gap-1 min-h-9 px-3 text-xs font-bold cursor-pointer"
          style={{ color: 'var(--mm-ink-soft)', background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-chip)' }}>
          {view === 'basic' ? '슈팅 기록 보기' : '기본 기록 보기'}
        </button>
      </div>
      {/* 기록 칸을 누르면 바뀐다는 사실이 화면에 안 보였다(2026-11-04 운영진) */}
      <p className="flex items-start gap-1.5 px-2.5 py-2 text-xs font-semibold leading-snug" role="note"
        style={{ color: 'var(--mm-ink-soft)', background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-chip)' }}>
        <Hand size={14} className="shrink-0 mt-px" aria-hidden />
        {view === 'basic'
          ? <span className="break-keep">기록 칸 클릭 시 <b style={{ color: 'var(--mm-ink)' }}>슈팅 기록</b>·슛 종류로 전환.</span>
          : <span className="break-keep"><b style={{ color: 'var(--mm-ink)' }}>슈팅 기록</b> 보기 중. 다시 클릭 시 기본 기록.</span>}
      </p>
      {/* 선수마다 카드 한 장(2026-11-04) — 얇은 구분선만 있던 줄이 서로 섞여 보였다. 태블릿은 두 줄씩 */}
      <div className="space-y-2 md:space-y-0 md:grid md:grid-cols-2 md:gap-2">
      {sorted.map(r => {
        const rr = r as PlayerRow & DailyStat
        const isMe = !!myId && rr.player_id === myId
        return (
          <div key={rr.player_id} className="p-3" data-me={isMe || undefined}
            style={{ background: 'var(--mm-panel)', border: isMe ? MINE_OUTLINE : '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' }}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <Avatar src={rr.photo_url} name={rr.name} size={56} ringColor={ringOf(rr.team_color)} decorative />
                {/* 팀명·경기 수는 이름 아래 줄로 — 한 줄에 다 두면 360px 에서 이름이 「이…」로 잘렸다 */}
                <span className="flex flex-col min-w-0">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <PlayerName row={rr} onPlayerPick={onPlayerPick} className="truncate min-w-0 leading-tight" />
                    {isMe && <MeTag />}
                    <ClipLink row={rr} />
                  </span>
                  {(rr.team_name || showGP) && (
                    <span className="flex items-center gap-1.5 min-w-0 text-xs leading-tight mt-0.5" style={{ color: 'var(--mm-muted)' }}>
                      {rr.team_name && <span className="truncate min-w-0">{rr.team_name}</span>}
                      {showGP && <span className="font-semibold shrink-0 tabular-nums">{rr.gp}경기</span>}
                    </span>
                  )}
                </span>
                {ddKinds?.get(rr.player_id) && <DdChip kind={ddKinds.get(rr.player_id)!} />}
              </div>
            </div>
            {/* 기록 칸 아무 데나 누르면 기본 ↔ 슈팅 */}
            <div role="button" tabIndex={0} onClick={flip} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip() } }}
              aria-label={view === 'basic' ? '눌러서 슈팅 기록 보기' : '눌러서 기본 기록 보기'} className="cursor-pointer">
              <LineGrid r={rr} view={view} />
            </div>
          </div>
        )
      })}
      {total && (
        <div className="p-3" style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-card)' }}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="flex items-baseline gap-2 min-w-0">
              <span className="text-base font-black truncate min-w-0" style={{ color: 'var(--mm-ink)' }}>{totalOpts?.label ?? '팀 합계'}</span>
              {showGP && totalOpts?.gp != null && <span className="text-xs font-semibold shrink-0 tabular-nums" style={{ color: 'var(--mm-muted)' }}>{totalOpts.gp}경기</span>}
            </span>
          </div>
          <div role="button" tabIndex={0} onClick={flip} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip() } }} className="cursor-pointer">
            <LineGrid r={total} view={view} />
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

