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
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'

type Metric = 'pts' | 'reb' | 'ast' | 'stl' | 'blk'

export interface HomeDashboard {
  quarter?: {
    label: string | null
    attended_rounds: number
    total_rounds: number
    min_rounds: number
    eligible: boolean
    per_day: Record<Metric, number>
    ranks: Partial<Record<Metric, { rank: number; total: number }>>
  }
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
