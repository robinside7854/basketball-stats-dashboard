'use client'
import { CountUp } from '@/components/league/StatCell'
import { LEAGUE_BASELINE, tierAgainst, type ShootingBaseline } from '@/lib/stats/shootingBaseline'
import { type DuoEntry } from '@/components/league/player/DynamicDuoPanel'
import { type LastPlayedData } from '@/lib/format/lastPlayed'
import { type CurrentTeam, type TeamHistoryEntry } from '@/components/league/player/PlayerTeamLine'
import type { PercentileBarsResult } from '@/lib/stats/percentileBars'
import type { HexRadarResult } from '@/lib/stats/hexRadar'
import type { QuarterTableRow } from '@/lib/stats/quarterTable'
import { type MonthRow } from '@/components/league/player/MonthTable'
import type { PlayStyle } from '@/lib/stats/playStyle'
import type { PlayerForm } from '@/lib/stats/playerForm'
import type { QuarterTotal } from '@/components/league/player/QuarterTable'
import type { Quarter } from '@/types/league'

// 선수 카드 공용 타입·조각 — PlayerQuickViewModal.tsx 에서 나눔(2026-11-15). 화면 모양은 그대로.

export type PlayerInfo = {
  id: string; name: string; number: number | null; position: string | null
  birth_date: string | null; plus_one: boolean
  height_cm?: number | null
  photo_url?: string | null
  has_account?: boolean  // 로그인 계정 등록·승인(인증) 회원 여부
}

export type RankTotal = { rank: number; total: number }
export type Rankings = {
  ppg: number; rpg: number; apg: number; spg: number; bpg: number
  total: number; win_rate_rank?: number
  // { rank, total } — 출전일은 전원(gp>=1), 성공률은 순위 자격 + 스탯 탭과 같은 최소 시도(2026-10-15)
  gp?: RankTotal; fg_pct?: RankTotal; fg3_pct?: RankTotal; ft_pct?: RankTotal
  /** 턴오버율 순위 — 낮은 쪽이 1위(2026-11-08) */
  tov_pct?: RankTotal
  /** 순위 자격 최소 출전일(leagueMinRounds) */
  min_rounds?: number
}
/** 일별 기록 한 줄 — 하루(같은 날 여러 경기 합산), 오래된 → 최근. record = 그날 내 팀 전적(하루 합산) */
export type DayLog = {
  date: string; games?: number; record?: { wins: number; losses: number; draws: number }
  pts: number; reb: number; ast: number; stl: number; blk: number; fgm: number; fga: number; fg3m: number; fg3a: number
}
export type Detail = {
  rankings: Rankings
  /** (2026-10-17) 같은 포지션(가드·포워드·센터) 안 순위 — 자격·기간·공동 순위 규칙은 rankings 와 같다. 포지션 없으면 null */
  position_ranks?: { group: 'G' | 'F' | 'C'; label: string; rankings: Rankings; percentile_bars: PercentileBarsResult } | null
  /** 진행 중 연속 기록 — /me 와 같은 판정(lib/stats/dashboardBase.ts). 첫 요청(profile=1)·전체 기간 응답에만 실린다. 단위는 「일」 */
  active_streaks?: Array<{ key: string; label: string; count: number; unit: string }>
  dynamic_duo?: DuoEntry[]
  pinned_event_ids?: string[]
  /** (2026-10-14) 마지막 출전(친선일 포함) — 첫 요청·전체 기간 응답에만 실린다 */
  last_played?: LastPlayedData | null
  /** (2026-10-14) 세부 능력치 백분위 막대 — 레이더와 같은 자격 집단·하루 평균 */
  percentile_bars?: PercentileBarsResult
  /** (2026-10-14) 6축 레이더 — 막대와 같은 모집단·하루 평균. 정의 lib/stats/hexRadar.ts */
  hex_radar?: HexRadarResult
  play_style?: PlayStyle | null
  /** (2026-10-16) 현 소속팀 — 지금 분기(pickCurrentQuarter) 기준. 그 분기 소속이 없으면 null */
  current_team?: CurrentTeam | null
  /** (2026-10-16) 분기별 소속(리그 분기만, 오래된 순) */
  team_history?: TeamHistoryEntry[]
  /** (2026-10-26) 카드 머리용 선수 기본 정보 — 첫 요청(profile=1)에만. 종전엔 이 한 명 때문에 `/players` 전원을 받았다 */
  player?: PlayerInfo | null
  career_high: Record<string, { value: number; extra?: string; date?: string }>
  shot_breakdown: { layup: { m: number; a: number; dist: number; fg_pct: number }; mid: { m: number; a: number; dist: number; fg_pct: number }; post: { m: number; a: number; dist: number; fg_pct: number }; three: { m: number; a: number; dist: number; fg_pct: number }; ft: { m: number; a: number; ft_pct: number }; total_fga: number }
  /** 요즘 흐름(2026-10-24) — lib/stats/playerForm.ts */
  form?: PlayerForm | null
  /** 일별 기록 — 추세 차트·일별 표·지난 경기일 카드가 같이 쓴다(2026-10-26 recent_games 와 합침) */
  game_log?: DayLog[]
  win_loss?: {
    // draws — 짧은 쿼터 경기라 동점이 실제로 난다. 예전엔 무를 패로 세서
    //   전적과 승률이 둘 다 틀렸다(2026-08-09). 승률 분모에서는 제외한다.
    wins: number; losses: number; draws?: number; win_rate: number
    pts_share: number
  }
  player_stats: {
    gp: number; ppg: number; rpg: number; apg: number; spg: number; bpg: number; topg: number
    fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
    pts: number; reb: number; ast: number; stl: number; blk: number; tov: number
    fg_pct: number; fg3_pct: number; ft_pct: number
    /** 턴오버율(2026-11-08) — 공격 기회 20 미만이면 null. 옛 응답엔 없다 */
    tov_pct?: number | null
    /** 속공 득점(2026-11) — 옛 응답엔 없을 수 있다 */
    fb_pts?: number; fbpg?: number
    /** 더블더블·트리플더블 날 수(하루 합계 기준) */
    dd2?: number; td3?: number
  } | null
  /** 월별 — 하루 평균. 성공률은 최소 시도 미달이면 null. best = 「최고의 달」(하루 평균 득점) */
  monthly_stats?: MonthRow[]
}

/** 기간과 무관한 머리 정보 — 처음 받은 응답에서 모은다(분기를 바꿔도 다시 받지 않는다) */
export type CardMeta = Pick<Detail, 'current_team' | 'team_history' | 'pinned_event_ids' | 'last_played' | 'active_streaks'>
export function mergeMeta(prev: CardMeta, d: Detail): CardMeta {
  const next: CardMeta = { ...prev }
  if (d.current_team !== undefined && prev.current_team === undefined) next.current_team = d.current_team
  if (d.team_history !== undefined && prev.team_history === undefined) next.team_history = d.team_history
  if (d.pinned_event_ids !== undefined && prev.pinned_event_ids === undefined) next.pinned_event_ids = d.pinned_event_ids
  if (d.last_played !== undefined && prev.last_played === undefined) next.last_played = d.last_played
  if (d.active_streaks !== undefined && prev.active_streaks === undefined) next.active_streaks = d.active_streaks
  return next
}

// /career 라우트 응답 — 「선수 숫자는 한 벌」(2026-10-14).
//   묶음마다 숫자는 그 묶음 스탯 탭의 그 선수 행과 같다(playerPeriodLine). 리그 통산은 리그 시즌끼리만 더하고,
//   대회는 따로(통산 미포함). 리그 시즌이 하나뿐이면 통산 = 위쪽 누적이라 화면에 안 보인다.
export type CareerLine = {
  leagueId: string; slug: string; name: string; mode: 'league' | 'tournament'; seasonYear: number
  gp: number; pts: number; reb: number; ast: number; stl: number; blk: number
}
export type CareerSummary = {
  leagues: CareerLine[]
  league_career: { gp: number; pts: number; reb: number; ast: number; stl: number; blk: number }
  tournaments: CareerLine[]
}

// mm-brand: 포지션 뱃지도 통일 톤 (뮤트 배경 + 잉크 라벨)
export const MM_POSITION_STYLE: React.CSSProperties = {
  background: 'var(--mm-panel-alt)',
  color: 'var(--mm-ink)',
  border: '1px solid var(--mm-rule)',
}

// mm-brand: 선수별 개별 accent 대신 단일 노랑 accent 로 통일.
export type AccentPalette = { stroke: string; fillA: string; fillB: string }
export const ACCENT_DEFAULT: AccentPalette = {
  // 레이더 — 선은 yellow-strong(라이트에서 흰 패널 대비 확보), 채움은 yellow → yellow-strong 그라데이션
  stroke: 'var(--mm-yellow-strong)',
  fillA: 'var(--mm-yellow-strong)', fillB: 'var(--mm-yellow)',
}

// data emphasis (spec 5): 양수=emerald, 음수=red, muted 유지
// 성공률 색 — 50/30 절대선이 아니라 **그 항목의 리그 평균 대비**로 잰다. (2026-08-15 수정)
//   한 선으로 재면 골밑(평균 55%)·3점(평균 22%)·자유투(평균 44%)가 같은 잣대를 쓰게 돼,
//   평균 이상인 3점 슈터가 빨강, 평균 미만인 골밑 선수가 초록으로 나온다.
export type PctScope = keyof ShootingBaseline['zone'] | 'ft' | 'fg'

export function pctColor(pct: number, attempts: number, scope: PctScope): string {
  const avg = scope === 'ft' ? LEAGUE_BASELINE.ft
    : scope === 'fg' ? LEAGUE_BASELINE.fg
    : LEAGUE_BASELINE.zone[scope]
  const tier = tierAgainst(pct, attempts, avg)
  if (tier === 'high') return 'text-[color:var(--mm-positive)]'
  if (tier === 'low') return 'text-[color:var(--mm-negative)]'
  if (tier === 'none') return 'text-[color:var(--mm-muted)]'
  return 'text-[color:var(--mm-yellow-strong)]'
}


export function CareerBlock({ title, total, rows }: {
  title: string
  total: { gp: number; pts: number; reb: number; ast: number } | null
  rows: CareerLine[]
}) {
  return (
    <div
      className="rounded-sm p-3 mt-2"
      style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
    >
      <p className="text-xs uppercase tracking-[0.20em] font-black mb-2" style={{ color: 'var(--mm-yellow-strong)' }}>
        {title}
      </p>
      {total && (
        <div className="grid grid-cols-4 gap-1.5 mb-2.5">
          {([
            ['출전일', total.gp],
            ['PTS', total.pts],
            ['REB', total.reb],
            ['AST', total.ast],
          ] as const).map(([l, v]) => (
            <div
              key={l}
              className="rounded-sm p-2 text-center"
              style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}
            >
              <p className="text-xs mb-0.5 uppercase tracking-[0.16em] font-bold" style={{ color: 'var(--mm-muted)' }}>{l}</p>
              <p className="font-jersey text-base font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>
                <CountUp value={v} decimals={0} />
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-1">
        {rows.map(c => (
          <div
            key={c.leagueId}
            // 폰: 오른쪽 기록 한 줄(약 150px)이 묶음 이름을 「2026 미…」로 눌렀다 → 모자라면 기록이 아랫줄(오른쪽 정렬)로
            className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-2 gap-y-0.5 text-xs px-2 py-1.5 rounded-sm min-h-[36px]"
            style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <span
                className="shrink-0 px-1.5 py-0.5 rounded-sm text-xs font-black uppercase"
                style={c.mode === 'tournament'
                  ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)' }
                  : { background: 'var(--mm-panel-alt)', color: 'var(--mm-muted)', border: '1px solid var(--mm-rule)' }
                }
              >{c.mode === 'tournament' ? '대회' : '리그'}</span>
              <span className="truncate" style={{ color: 'var(--mm-ink-soft)' }}>{c.name}</span>
            </span>
            <span className="shrink-0 ml-auto tabular-nums font-bold" style={{ color: 'var(--mm-ink)' }}>
              {c.gp}일 · {c.pts}점 · 리바 {c.reb} · 어시 {c.ast}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 상세를 받는 동안의 자리 — 머리(이름·사진·팀)는 이미 보이고 본문 모양만 미리 잡는다 (2026-10-16) */
export function DetailSkeleton() {
  return (
    <div className="px-5 py-4 space-y-4" aria-busy="true" aria-label="선수 기록 불러오는 중">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-11 w-16 rounded-sm mm-shimmer" />)}
      </div>
      <div className="h-10 w-full rounded-sm mm-shimmer" />
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
        {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-24 rounded-sm mm-shimmer" />)}
      </div>
      <div className="h-40 w-full rounded-sm mm-shimmer" />
    </div>
  )
}

export function DetailRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="text-center py-8 space-y-3">
      <p className="text-sm font-bold" style={{ color: 'var(--mm-ink-soft)' }}>기록을 불러오지 못했어요</p>
      <button type="button" onClick={onRetry}
        className="mm-press inline-flex items-center justify-center min-h-11 px-4 text-sm font-bold cursor-pointer"
        style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}>
        다시 시도
      </button>
    </div>
  )
}

// 나의 강점 고르기(2026-11-15 운영진) — 내 기록 부문 가운데 가장 돋보이는 셋.
//   부문마다 단위가 달라(득점 vs 블록) 그대로 비교할 수 없어, 각 부문에서 내가 서 있는 자리로 줄 세워 위 셋만 고른다.
//   약점(낮은 쪽)은 보이지 않는다. 리그 5위 안이면 순위를 붙인다.
export const STRENGTH_KEYS: Record<string, keyof Rankings | null> = {
  ppg: 'ppg', rpg: 'rpg', apg: 'apg', spg: 'spg', bpg: 'bpg',
  fg_pct: 'fg_pct', fg3_pct: 'fg3_pct', ft_pct: 'ft_pct', fg3m: null,
}
export function pickStrengths(bars: PercentileBarsResult | undefined, rankings: Rankings | undefined) {
  if (!bars?.qualified) return []
  const rows = bars.groups.flatMap(g => g.rows).filter(r => r.key in STRENGTH_KEYS && r.pct != null)
  rows.sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0))
  return rows.slice(0, 3).map(r => {
    const rk = STRENGTH_KEYS[r.key]
    const raw = rk && rankings ? rankings[rk] : null
    const rank = typeof raw === 'number' ? raw : raw && typeof raw === 'object' ? (raw as RankTotal).rank : null
    return { key: r.key, label: r.label, value: r.valueText, rank: rank != null && rank >= 1 && rank <= 5 ? rank : null }
  })
}
