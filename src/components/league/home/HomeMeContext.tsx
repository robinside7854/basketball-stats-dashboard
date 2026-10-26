'use client'
// 홈 맨 위 경기일 카드가 쓰는 개인 데이터 — 「그날 내가 뛴 경기」 (리뉴얼 2단계, 2026-10-12).
//   (2026-10-15) 쓰는 곳이 「내 경기」 노랑 표시와 「내 하이라이트 ▶」 링크뿐이라 gameIds 만 남겼다
//   (2026-10-26 점검 MVP 1) 홈 맨 위 「지난 토요일 나」 카드가 다시 생겨 그날 내 합계·승패·득점 순위를 같은 응답에서 만든다
//   (요청 추가 없음 — 같은 daily-boxscore 한 번)
//   (하루 합계 line · 승패 results 는 그리던 「내 카드」가 없어져 아무도 읽지 않았다).
//   useMePeriod · MePeriod · MeShooting 은 /me(PersonalDashboard)가 쓴다 — 지우지 말 것.
//
// 왜 컨텍스트인가
//   · 개인 데이터는 **반드시 브라우저에서** 받는다. 홈의 나머지는 unstable_cache(사용자 공용)를
//     타므로, 여기 값이 서버 캐시에 들어가면 다른 사람에게 내 기록이 보인다.
//
// 요청은 승인 회원일 때만 1개:
//   · GET /daily-boxscore?date=      — 홈이 이미 아는 최근 경기일 하루(내가 뛴 경기 표시용)
//   (2026-10-14) 홈 「내 카드」를 뺐다 — 그 카드가 쓰던 /auth/dashboard 는 이제 「내 기록」(/me)에서만 부른다.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'

/** 야투·3점 성공/시도/성공률(%) — /me 기간 블록. 순위 없음 */
export interface MeShooting {
  fgm: number; fga: number; fg_pct: number
  fg3m: number; fg3a: number; fg3_pct: number
}

export interface MyDay {
  date: string
  /** 내가 뛴 경기의 슬롯 id 전부 (롤업된 경기도 슬롯 단위로 맞출 수 있게) — 비어 있으면 그날 안 뛰었다 */
  gameIds: Set<string>
  /** 그날 내 합계 (daily_stats 내 줄 그대로) — 안 뛰었으면 null. 홈 「지난 토요일 나」 카드(2026-10-26) */
  line: { pts: number; reb: number; ast: number; stl: number; blk: number; gp: number; fgm: number; fga: number; fg3m: number } | null
  /** 내가 뛴 정규전의 승·패·무 (친선 제외 — dayRecord 와 같은 규칙) */
  record: { w: number; l: number; d: number }
  /** 그날 득점 순위(공동 순위)와 그날 뛴 인원 */
  ptsRank: number | null
  dayPlayers: number
}

type Status = 'idle' | 'loading' | 'ready' | 'error'

interface HomeMeState {
  /** 승인 회원으로 확인됐는가(서버 판정 + 클라이언트 로그인 상태) */
  isMember: boolean
  /** 서버가 쿠키로 판정한 승인 회원 여부 — 로그인 상태를 아직 확인 중일 때 자리(스켈레톤)를 잡는 데 쓴다 */
  serverMember: boolean
  status: Status
  day: MyDay | null
}

const Ctx = createContext<HomeMeState>({ isMember: false, serverMember: false, status: 'idle', day: null })

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

// daily-boxscore 응답에서 쓰는 부분만
interface BoxGame {
  id: string
  slot_ids?: string[]
  is_exhibition?: boolean
  is_complete?: boolean
  home_score: number | null
  away_score: number | null
  home_team: { id: string } | null
  away_team: { id: string } | null
  players: Array<{ player_id: string; team_id?: string | null }>
}
interface DailyRow { player_id: string; gp: number; pts: number; reb: number; ast: number; stl: number; blk: number; fgm: number; fga: number; fg3m: number }

function buildDay(date: string, pid: string, games: BoxGame[], daily: DailyRow[]): MyDay {
  const gameIds = new Set<string>()
  const record = { w: 0, l: 0, d: 0 }
  for (const g of games) {
    const me = g.players?.find(p => p.player_id === pid)
    if (!me) continue
    for (const id of g.slot_ids?.length ? g.slot_ids : [g.id]) gameIds.add(id)
    // 내가 뛴 팀이 이겼나 — 친선·미마감·점수 없음은 세지 않는다
    if (g.is_exhibition || g.is_complete === false || g.home_score == null || g.away_score == null || !me.team_id) continue
    const side = me.team_id === g.home_team?.id ? 'home' : me.team_id === g.away_team?.id ? 'away' : null
    if (!side) continue
    const mine = side === 'home' ? g.home_score : g.away_score
    const opp = side === 'home' ? g.away_score : g.home_score
    if (mine > opp) record.w++
    else if (mine < opp) record.l++
    else record.d++
  }
  const row = daily.find(r => r.player_id === pid) ?? null
  const ptsRank = row ? 1 + daily.filter(r => r.pts > row.pts).length : null
  return {
    date, gameIds, record, ptsRank, dayPlayers: daily.length,
    line: row ? { pts: row.pts, reb: row.reb, ast: row.ast, stl: row.stl, blk: row.blk, gp: row.gp, fgm: row.fgm, fga: row.fga, fg3m: row.fg3m } : null,
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
  const [day, setDay] = useState<MyDay | null>(null)

  useEffect(() => {
    if (!pid) return
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 로그인 확인 직후 1회 조회 시작 표시
    setStatus('loading')
    const getJson = (url: string) => fetch(url, { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).catch(() => null)
    if (!latestDate) {
      setStatus('ready')
      return
    }
    getJson(`/api/leagues/${leagueId}/daily-boxscore?date=${latestDate}`).then(box => {
      if (!alive) return
      setDay(box
        ? buildDay(latestDate, pid, (box.games ?? []) as BoxGame[], (box.daily_stats ?? []) as DailyRow[])
        : null)
      setStatus(box ? 'ready' : 'error')
    })
    return () => { alive = false }
  }, [leagueId, latestDate, pid])

  const value = useMemo<HomeMeState>(
    () => ({ isMember: !!pid, serverMember, status: pid ? status : 'idle', day }),
    [pid, serverMember, status, day],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
