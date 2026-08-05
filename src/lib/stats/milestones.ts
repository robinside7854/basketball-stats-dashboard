/**
 * 커리어 마일스톤 (임박 + 최근 달성) 계산 유틸.
 * `/api/leagues/[id]/milestones` route 와 홈 SSR 프리페치가 공유.
 *
 * v3: PTS (득점) 만 트래킹.
 *   사용자 판단 · 나머지 카테고리(REB/AST/STL/BLK/3PM/GP)는 마일스톤으로 삼을 가치 낮음.
 *   슛 이벤트로 crossing 발생 · 하이라이트 재생 가능 (video_url · timestamp 매핑 시).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/admin'
import { fetchPlayerMeta } from './perDayStats'
import { getClipBounds, isHighlightShot } from '@/lib/highlights/clip'
import { extractYouTubeId } from '@/lib/youtube/utils'
import { scorePoints, fetchScoringRules, type ScoringRules } from './scoring'
import { fetchExternalTeamIds } from '@/lib/league/externalPlayers'
import { resolveTeamId } from '@/lib/league/teamScope'

// 커리어 마일스톤 — 득점 (PTS) 만 유지
// 사용자 판단: 나머지 카테고리(REB/AST/STL/BLK/3PM/GP)는 마일스톤으로 삼을 정도는 아님
export type MilestoneCategory = 'PTS'

const THRESHOLDS: Record<MilestoneCategory, number[]> = {
  PTS: [100, 250, 500, 1000, 2000],
}

export interface UpcomingEntry {
  player_id: string
  name: string
  number: number | null
  category: MilestoneCategory
  current: number
  target: number
  distance: number
  percent: number
}

export interface RecentEntry {
  player_id: string
  name: string
  number: number | null
  category: MilestoneCategory
  target: number
  achieved_at: string           // YYYY-MM-DD (경기일)
  // === 이벤트 · 재생 컨텍스트 (옵셔널) ===
  event_id?: string
  game_id?: string
  game_date?: string
  video_url?: string | null     // 게임의 youtube_url
  video_id?: string | null      // 추출된 11자
  video_timestamp?: number | null
  clip_start?: number | null
  clip_end?: number | null
  shot_type?: string | null     // 재생 컨텍스트/필터용
}

export interface MilestonesResult {
  upcoming: UpcomingEntry[]
  recent: RecentEntry[]
}

export async function computeMilestones(
  supabase: SupabaseClient | null,
  leagueId: string,
  opts: { horizonDays?: number; maxUpcoming?: number; maxRecent?: number } = {},
): Promise<MilestonesResult> {
  const sb = supabase ?? createClient()
  const horizonDays = Math.max(1, opts.horizonDays ?? 30)
  const maxUpcoming = Math.max(1, opts.maxUpcoming ?? 8)
  const maxRecent = Math.max(1, opts.maxRecent ?? 8)

  // 1) 게임 목록 (is_started=true) — 날짜/youtube 매핑 + 게임별 플러스원 지정 확보
  const { data: games, error: gErr } = await sb
    .from('league_games')
    .select('id, date, youtube_url, plus_one_player_id')
    .eq('league_id', leagueId)
    .eq('is_started', true)
  // 쿼리 실패를 빈 배열로 넘기면 "경기 없음"과 구분이 안 돼 마일스톤 트래커가 조용히 텅 빈다.
  if (gErr) throw new Error(`computeMilestones: leagueId=${leagueId} league_games 조회 실패 — ${gErr.message}`)
  const gameRows = (games ?? []) as Array<{ id: string; date: string; youtube_url: string | null; plus_one_player_id: string | null }>
  if (gameRows.length === 0) {
    return { upcoming: [], recent: [] }
  }
  const gameById = new Map(gameRows.map(g => [g.id, g]))
  const gameIds = gameRows.map(g => g.id)

  // 2) 선수 메타 (병렬) + 채점 룰 + 리그 전체 플러스원 플래그
  //    저장된 points 컬럼이 틀린 경우가 있어(구범준 플러스원 2건 · 변원식 ft_3pt_1 4건) 더 이상 신뢰하지 않는다 —
  //    scorePoints 로 매번 재계산하려면 플러스원 판정이 필요하다. leagueStats.ts 와 동일 규칙(게임 지정 우선, 없으면 선수 플래그).
  const playerMetaPromise = fetchPlayerMeta(sb, leagueId)
  const rulesPromise = fetchScoringRules(sb, leagueId)
  // 선수는 팀에 매달려 있다(087) — league_id 로 찾으면 대회 묶음에서 0명이 나와
  //   plus_one 맵이 비고, 가산점이 에러 없이 조용히 빠진다.
  const plusOnePromise = sb.from('league_players').select('id, plus_one').eq('team_id', await resolveTeamId(leagueId))
  // 외부(상대) 팀 이벤트는 마일스톤 대상이 아니다 — leagueStats.ts 와 동일하게 이벤트 단위로 거른다.
  const externalTeamIdsPromise = fetchExternalTeamIds(sb, leagueId)

  // 3) 이벤트 페이지네이션 조회 (Supabase 1000행 캡 대비 · 수천 이벤트 필수)
  type EvRow = {
    id: string
    league_game_id: string
    league_player_id: string | null
    related_player_id: string | null
    team_id: string | null
    type: string
    result: string | null
    points: number | null
    video_timestamp: number | null
    created_at: string | null
  }
  const events: EvRow[] = []
  const PAGE = 1000
  for (let p = 0; ; p++) {
    const { data: chunk, error: evErr } = await sb
      .from('league_game_events')
      .select('id, league_game_id, league_player_id, related_player_id, team_id, type, result, points, video_timestamp, created_at')
      .in('league_game_id', gameIds)
      .order('id', { ascending: true })
      .range(p * PAGE, (p + 1) * PAGE - 1)
    // 페이지 중간 실패를 "더 이상 없음"과 같은 걸로 취급하면 뒷부분 이벤트가 빠져 임계값 crossing 을 놓친다.
    if (evErr) throw new Error(`computeMilestones: leagueId=${leagueId} league_game_events 페이지네이션(p=${p}) 실패 — ${evErr.message}`)
    if (!chunk || chunk.length === 0) break
    events.push(...(chunk as EvRow[]))
    if (chunk.length < PAGE) break
  }

  const playerMeta = await playerMetaPromise
  const rules: ScoringRules = await rulesPromise
  const { data: plusOneRows, error: plErr } = await plusOnePromise
  // 조용히 넘기면 plusOneSet 이 비어 모든 플러스원 선수가 일반 선수로 채점된다 (scoring.ts 와 동일 이유로 throw).
  if (plErr) throw new Error(`computeMilestones: leagueId=${leagueId} league_players(plus_one) 조회 실패 — ${plErr.message}`)
  const plusOneSet = new Set((plusOneRows ?? []).filter(p => p.plus_one).map(p => p.id as string))
  const externalTeamIds = await externalTeamIdsPromise
  const internalEvents = events.filter(e => !(e.team_id && externalTeamIds.has(e.team_id)))

  // 4) 이벤트 정렬: (경기일 asc → created_at asc → id asc)
  //    각 이벤트에 game.date/plus_one_player_id 를 attach 하고 정렬. crossing 감지에 시간 순서가 결정적.
  type EnrichedEv = EvRow & { date: string; youtube_url: string | null; plus_one_player_id: string | null }
  const enriched: EnrichedEv[] = []
  for (const e of internalEvents) {
    const g = gameById.get(e.league_game_id)
    if (!g) continue
    enriched.push({ ...e, date: g.date, youtube_url: g.youtube_url, plus_one_player_id: g.plus_one_player_id })
  }
  enriched.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    const ta = a.created_at ?? ''
    const tb = b.created_at ?? ''
    if (ta !== tb) return ta.localeCompare(tb)
    return a.id.localeCompare(b.id)
  })

  // 5) walk (player × PTS) 누적, threshold crossing 캡처
  const cumul = new Map<string, number>()     // key = `${pid}|PTS` → 누적값
  const nextIdx = new Map<string, number>()   // key = `${pid}|PTS` → 다음 임계값 index

  const today = new Date()
  const horizonStart = new Date(today.getTime() - horizonDays * 24 * 60 * 60 * 1000)
  const horizonStartIso = horizonStart.toISOString().slice(0, 10)

  const recent: RecentEntry[] = []

  const captureRecent = (
    pid: string,
    cat: MilestoneCategory,
    target: number,
    ev: EnrichedEv,
  ) => {
    if (ev.date < horizonStartIso) return
    const meta = playerMeta[pid]
    let vTs: number | null = null
    let vUrl: string | null = null
    let vId: string | null = null
    let cs: number | null = null
    let ce: number | null = null
    let shotType: string | null = null
    // 하이라이트 재생 가능 조건: (1) 그 이벤트가 하이라이트 슛 유형 · made · timestamp 有
    //                             (2) 게임에 youtube_url 매핑
    if (
      isHighlightShot(ev.type)
      && ev.result === 'made'
      && ev.video_timestamp != null
      && ev.youtube_url
    ) {
      const vid = extractYouTubeId(ev.youtube_url)
      if (vid) {
        vTs = ev.video_timestamp
        vUrl = ev.youtube_url
        vId = vid
        const b = getClipBounds(ev.type, vTs)
        cs = b.start
        ce = b.end
        shotType = ev.type
      }
    }
    recent.push({
      player_id: pid,
      name: meta?.name ?? '알 수 없음',
      number: meta?.number ?? null,
      category: cat,
      target,
      achieved_at: ev.date,
      event_id: ev.id,
      game_id: ev.league_game_id,
      game_date: ev.date,
      video_url: vUrl,
      video_id: vId,
      video_timestamp: vTs,
      clip_start: cs,
      clip_end: ce,
      shot_type: shotType,
    })
  }

  const bump = (pid: string, cat: MilestoneCategory, delta: number, ev: EnrichedEv) => {
    if (delta <= 0) return
    const key = `${pid}|${cat}`
    const before = cumul.get(key) ?? 0
    const after = before + delta
    cumul.set(key, after)
    let idx = nextIdx.get(key) ?? 0
    const thr = THRESHOLDS[cat]
    while (idx < thr.length && after >= thr[idx]) {
      const t = thr[idx]
      if (before < t) captureRecent(pid, cat, t, ev)
      idx++
    }
    nextIdx.set(key, idx)
  }

  for (const ev of enriched) {
    const pid = ev.league_player_id
    if (!pid) continue
    // PTS crossing 만 트래킹 — 플러스원 판정은 게임 지정 우선, 없으면 선수 플래그 (leagueStats.ts 와 동일 규칙)
    const isP1 = ev.plus_one_player_id !== null ? pid === ev.plus_one_player_id : plusOneSet.has(pid)
    const pts = scorePoints(ev.type, ev.result, isP1, rules)
    if (pts > 0) bump(pid, 'PTS', pts, ev)
  }

  // 6) 임박 (upcoming) 계산 — 각 (player, category) 의 다음 threshold 기준 percent 정렬
  const upcoming: UpcomingEntry[] = []
  for (const [key, cur] of cumul) {
    if (cur <= 0) continue
    const [pid, catStr] = key.split('|') as [string, MilestoneCategory]
    const idx = nextIdx.get(key) ?? 0
    const thr = THRESHOLDS[catStr]
    if (idx >= thr.length) continue
    const target = thr[idx]
    const distance = target - cur
    const percent = +((cur / target) * 100).toFixed(1)
    const meta = playerMeta[pid]
    upcoming.push({
      player_id: pid,
      name: meta?.name ?? '알 수 없음',
      number: meta?.number ?? null,
      category: catStr,
      current: cur,
      target,
      distance,
      percent,
    })
  }

  upcoming.sort((a, b) => b.percent - a.percent)
  recent.sort((a, b) => b.achieved_at.localeCompare(a.achieved_at))

  return {
    upcoming: upcoming.slice(0, maxUpcoming),
    recent: recent.slice(0, maxRecent),
  }
}
