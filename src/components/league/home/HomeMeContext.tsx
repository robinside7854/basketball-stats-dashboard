'use client'
// 홈 「내 카드」·「지난 토요일」이 함께 쓰는 개인 데이터 (리뉴얼 2단계, 2026-10-12).
//
// 왜 컨텍스트인가
//   · 두 섹션이 같은 「그날 박스스코어」를 본다 — 내 카드는 내 줄을, 타임라인은 내가 뛴 경기를.
//     각자 받으면 같은 요청이 두 번 나간다.
//   · 개인 데이터는 **반드시 브라우저에서** 받는다. 홈의 나머지는 unstable_cache(사용자 공용)를
//     타므로, 여기 값이 서버 캐시에 들어가면 다른 사람에게 내 기록이 보인다.
//
// 요청은 승인 회원일 때만 2개:
//   · GET /auth/dashboard            — 이번 분기 하루 평균·순위·마일스톤 (/me 와 같은 응답)
//   · GET /daily-boxscore?date=      — 홈이 이미 아는 최근 경기일 하루
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'

type Metric = 'pts' | 'reb' | 'ast' | 'stl' | 'blk'

/** 기간 블록 — 「이번 분기」(quarter) · 「전체」(career) 가 같은 모양이다 */
export interface MePeriodBlock {
  label: string | null
  attended_rounds: number
  /** 이 기간에 리그가 연 날 전체 */
  total_rounds: number
  /** 그중 내 첫 기록일 이후 — 출석 분모 (2026-10-12 추가 · 옛 응답엔 없다) */
  my_total_rounds?: number
  /** 내 첫 기록일(리그 전체 기준) — 이날 이전은 「결장」이 아니다 */
  joined_on?: string | null
  min_rounds: number
  eligible: boolean
  per_day: Record<Metric, number>
  ranks: Partial<Record<Metric, { rank: number; total: number }>>
  /** 야투·3점 성공/시도/성공률(%) — 2026-10-13 추가(옛 응답엔 없다). 순위 없음 */
  shooting?: MeShooting
}

export interface MeShooting {
  fgm: number; fga: number; fg_pct: number
  fg3m: number; fg3a: number; fg3_pct: number
}

export interface HomeDashboard {
  quarter?: MePeriodBlock
  /** 「전체」 — 이 리그 시즌 첫 경기일부터 */
  career?: MePeriodBlock
  milestoneChasers?: Array<{
    metric: Metric
    current: number
    nextThreshold: number
    remaining: number
    progressPct: number
  }>
}

export interface MyDayLine {
  pts: number; reb: number; ast: number; stl: number; blk: number
  fgm: number; fga: number; fg3m: number
  gp: number
  team_name: string | null
  team_color: string | null
}

export interface MyDay {
  date: string
  /** 그날 내 하루 합계 — 출전하지 않았으면 null */
  line: MyDayLine | null
  /** 내가 뛴 경기의 슬롯 id 전부 (롤업된 경기도 슬롯 단위로 맞출 수 있게) */
  gameIds: Set<string>
  /** 마감된 내 경기 결과(슬롯 순서) */
  results: Array<'W' | 'L' | 'D'>
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

interface HomeMeState {
  /** 승인 회원으로 확인됐는가(서버 판정 + 클라이언트 로그인 상태) */
  isMember: boolean
  /** 서버가 쿠키로 판정한 승인 회원 여부 — 로그인 상태를 아직 확인 중일 때 자리(스켈레톤)를 잡는 데 쓴다 */
  serverMember: boolean
  status: Status
  dashboard: HomeDashboard | null
  day: MyDay | null
}

const Ctx = createContext<HomeMeState>({ isMember: false, serverMember: false, status: 'idle', dashboard: null, day: null })

export function useHomeMe() { return useContext(Ctx) }

// ── 내 기록 기간 선택 「이번 분기 | 전체」 — 홈 내 카드와 /me 가 같은 기억값을 쓴다 ──
export type MePeriod = 'quarter' | 'career'
const periodKey = (leagueId: string) => `league:${leagueId}:mePeriod`

/** 보는 사람별로 고른 기간을 기억한다(localStorage — 실패해도 「이번 분기」로 그린다) */
export function useMePeriod(leagueId: string): [MePeriod, (p: MePeriod) => void] {
  const [period, setPeriodState] = useState<MePeriod>('quarter')
  useEffect(() => {
    try {
      const v = localStorage.getItem(periodKey(leagueId))
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 는 클라이언트 전용, 마운트 1회
      if (v === 'career' || v === 'quarter') setPeriodState(v)
    } catch { /* 저장소가 막혀 있으면 기본값 */ }
  }, [leagueId])
  const setPeriod = useCallback((p: MePeriod) => {
    setPeriodState(p)
    try { localStorage.setItem(periodKey(leagueId), p) } catch { /* 무시 */ }
  }, [leagueId])
  return [period, setPeriod]
}

/** 기간 블록의 출석 분모 — 첫 기록일 이후 경기일(옛 응답이면 리그 전체 일수) */
export function myTotalRounds(b: Pick<MePeriodBlock, 'total_rounds' | 'my_total_rounds'>): number {
  return b.my_total_rounds ?? b.total_rounds
}

// daily-boxscore 응답에서 쓰는 부분만
interface BoxGame {
  id: string
  slot_ids?: string[]
  is_complete: boolean
  home_score: number | null
  away_score: number | null
  home_team: { id: string } | null
  away_team: { id: string } | null
  players: Array<{ player_id: string; team_id: string | null }>
}
interface BoxDaily extends MyDayLine { player_id: string }

function buildDay(date: string, pid: string, games: BoxGame[], daily: BoxDaily[]): MyDay {
  const gameIds = new Set<string>()
  const results: MyDay['results'] = []
  for (const g of games) {
    const row = g.players?.find(p => p.player_id === pid)
    if (!row) continue
    for (const id of g.slot_ids?.length ? g.slot_ids : [g.id]) gameIds.add(id)
    if (!g.is_complete || !row.team_id) continue
    const side = row.team_id === g.home_team?.id ? 'home' : row.team_id === g.away_team?.id ? 'away' : null
    if (!side) continue
    const mine = (side === 'home' ? g.home_score : g.away_score) ?? 0
    const theirs = (side === 'home' ? g.away_score : g.home_score) ?? 0
    results.push(mine > theirs ? 'W' : mine < theirs ? 'L' : 'D')
  }
  const d = daily.find(x => x.player_id === pid)
  return {
    date,
    line: d
      ? {
          pts: d.pts, reb: d.reb, ast: d.ast, stl: d.stl, blk: d.blk,
          fgm: d.fgm, fga: d.fga, fg3m: d.fg3m, gp: d.gp,
          team_name: d.team_name ?? null, team_color: d.team_color ?? null,
        }
      : null,
    gameIds,
    results,
  }
}

export function HomeMeProvider({
  leagueId, latestDate, serverMember, children,
}: {
  leagueId: string
  /** 기록이 있는 최근 경기일(홈 「최근 라운드」 첫 카드) — 없으면 그날 줄은 받지 않는다 */
  latestDate: string | null
  /** 서버가 쿠키로 판정한 승인 회원 여부 — 미승인 회원에게 401 요청을 보내지 않기 위한 문턱 */
  serverMember: boolean
  children: ReactNode
}) {
  const { user } = useCurrentUser()
  const pid = serverMember ? user?.player_id ?? null : null
  const [status, setStatus] = useState<Status>('idle')
  const [dashboard, setDashboard] = useState<HomeDashboard | null>(null)
  const [day, setDay] = useState<MyDay | null>(null)

  useEffect(() => {
    if (!pid) return
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 로그인 확인 직후 1회 조회 시작 표시
    setStatus('loading')
    const getJson = (url: string) => fetch(url, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null)
    Promise.all([
      getJson(`/api/leagues/${leagueId}/auth/dashboard`),
      latestDate ? getJson(`/api/leagues/${leagueId}/daily-boxscore?date=${latestDate}`) : Promise.resolve(null),
    ]).then(([dash, box]) => {
      if (!alive) return
      setDashboard((dash as HomeDashboard | null) ?? null)
      setDay(latestDate && box
        ? buildDay(latestDate, pid, (box.games ?? []) as BoxGame[], (box.daily_stats ?? []) as BoxDaily[])
        : null)
      setStatus(dash ? 'ready' : 'error')
    })
    return () => { alive = false }
  }, [leagueId, latestDate, pid])

  const value = useMemo<HomeMeState>(
    () => ({ isMember: !!pid, serverMember, status: pid ? status : 'idle', dashboard, day }),
    [pid, serverMember, status, dashboard, day],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
