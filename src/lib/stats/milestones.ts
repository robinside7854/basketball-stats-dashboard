/**
 * 커리어 마일스톤 (임박 + 최근 달성) 계산 유틸.
 * `/api/leagues/[id]/milestones` route 와 홈 SSR 프리페치가 공유.
 *
 * v2: 이벤트 단위 트래킹.
 *   원본 `league_game_events` 를 (게임일자 asc → 이벤트 created_at asc) 로 순회하며
 *   임계값을 넘긴 "그 이벤트" 를 캡처. 하이라이트 재생을 위해 video_url · timestamp · clip 범위
 *   등 재생 컨텍스트도 함께 반환.
 *
 *   - PTS/3PM/2점/AST 처럼 슛 이벤트로 crossing 이 발생하는 카테고리는 video 정보가 매핑돼 있으면
 *     그대로 담김 (재생 가능).
 *   - REB/STL/BLK/GP 는 원천적으로 video_timestamp 가 없어 video 정보 없음(재생 불가) — 링크만 표시.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/admin'
import { fetchPlayerMeta } from './perDayStats'
import { getClipBounds, isHighlightShot } from '@/lib/highlights/clip'
import { extractYouTubeId } from '@/lib/youtube/utils'

export type MilestoneCategory = 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK' | '3PM' | 'GP'

const THRESHOLDS: Record<MilestoneCategory, number[]> = {
  PTS: [100, 250, 500, 1000, 2000],
  REB: [50, 100, 250, 500, 1000],
  AST: [25, 50, 100, 250, 500],
  STL: [10, 25, 50, 100, 250],
  BLK: [5, 10, 25, 50, 100],
  '3PM': [10, 25, 50, 100, 250],
  GP:  [10, 25, 50, 100, 200],
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

const FIELD_SHOTS = new Set(['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post', 'shot_2p_drive'])

/**
 * 슛 이벤트 → 득점 계산 (points 컬럼 우선, 없으면 type 기반 fallback).
 * perDayStats 와 동일 규칙.
 */
function pointsOfEvent(type: string, made: boolean, points: number | null): number {
  if (!made) return 0
  if (points != null) return points
  switch (type) {
    case 'shot_3p': return 3
    case 'shot_post':
    case 'shot_layup':
    case 'shot_2p_drive':
    case 'shot_2p_mid': return 2
    case 'and_one': return 1
    case 'ft_2pt':
    case 'ft_3pt_1': return 2  // 주의: perDayStats 와 동일 (실측 규칙)
    case 'free_throw':
    case 'ft_3pt_2': return 1
    default: return 0
  }
}

/**
 * 이벤트가 (player, category) 에 기여하는 amount 를 반환.
 * category 별로 여러 player 가 관련될 수 있음 (예: 야투 성공 → shooter 는 PTS/3PM, assister 는 AST).
 * → 이 함수는 primary player (league_player_id) 기여만 반환하고, AST 는 별도 처리.
 */
function contribFor(
  cat: MilestoneCategory,
  ev: { type: string; result: string | null; points: number | null },
): number {
  const made = ev.result === 'made'
  switch (cat) {
    case 'PTS': return pointsOfEvent(ev.type, made, ev.points)
    case '3PM': return ev.type === 'shot_3p' && made ? 1 : 0
    case 'REB': return ev.type === 'oreb' || ev.type === 'dreb' ? 1 : 0
    case 'STL': return ev.type === 'steal' ? 1 : 0
    case 'BLK': return ev.type === 'block' ? 1 : 0
    default: return 0 // AST/GP 는 별도 로직
  }
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

  // 1) 게임 목록 (is_started=true) — 날짜/youtube 매핑 확보
  const { data: games } = await sb
    .from('league_games')
    .select('id, date, youtube_url')
    .eq('league_id', leagueId)
    .eq('is_started', true)
  const gameRows = (games ?? []) as Array<{ id: string; date: string; youtube_url: string | null }>
  if (gameRows.length === 0) {
    return { upcoming: [], recent: [] }
  }
  const gameById = new Map(gameRows.map(g => [g.id, g]))
  const gameIds = gameRows.map(g => g.id)

  // 2) 선수 메타 (병렬)
  const playerMetaPromise = fetchPlayerMeta(sb, leagueId)

  // 3) 이벤트 페이지네이션 조회 (Supabase 1000행 캡 대비 · 수천 이벤트 필수)
  type EvRow = {
    id: string
    league_game_id: string
    league_player_id: string | null
    related_player_id: string | null
    type: string
    result: string | null
    points: number | null
    video_timestamp: number | null
    created_at: string | null
  }
  const events: EvRow[] = []
  const PAGE = 1000
  for (let p = 0; ; p++) {
    const { data: chunk } = await sb
      .from('league_game_events')
      .select('id, league_game_id, league_player_id, related_player_id, type, result, points, video_timestamp, created_at')
      .in('league_game_id', gameIds)
      .order('id', { ascending: true })
      .range(p * PAGE, (p + 1) * PAGE - 1)
    if (!chunk || chunk.length === 0) break
    events.push(...(chunk as EvRow[]))
    if (chunk.length < PAGE) break
  }

  const playerMeta = await playerMetaPromise

  // 4) 이벤트 정렬: (경기일 asc → created_at asc → id asc)
  //    각 이벤트에 game.date 를 attach 하고 정렬. crossing 감지에 시간 순서가 결정적.
  type EnrichedEv = EvRow & { date: string; youtube_url: string | null }
  const enriched: EnrichedEv[] = []
  for (const e of events) {
    const g = gameById.get(e.league_game_id)
    if (!g) continue
    enriched.push({ ...e, date: g.date, youtube_url: g.youtube_url })
  }
  enriched.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    const ta = a.created_at ?? ''
    const tb = b.created_at ?? ''
    if (ta !== tb) return ta.localeCompare(tb)
    return a.id.localeCompare(b.id)
  })

  // 5) walk (player × category) 누적, threshold crossing 캡처
  const cumul = new Map<string, number>()     // key = `${pid}|${cat}` → 누적값
  const nextIdx = new Map<string, number>()   // key = `${pid}|${cat}` → 다음 임계값 index
  const gpSeenDate = new Map<string, Set<string>>() // pid → dates seen (GP 카운팅용)

  const today = new Date()
  const horizonStart = new Date(today.getTime() - horizonDays * 24 * 60 * 60 * 1000)
  const horizonStartIso = horizonStart.toISOString().slice(0, 10)

  const recent: RecentEntry[] = []
  const CATEGORIES = Object.keys(THRESHOLDS) as MilestoneCategory[]

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
    // 5-a) shooter/원 선수 기여 (PTS/3PM/REB/STL/BLK)
    if (pid) {
      for (const cat of CATEGORIES) {
        if (cat === 'AST' || cat === 'GP') continue
        const amt = contribFor(cat, ev)
        if (amt > 0) bump(pid, cat, amt, ev)
      }
      // GP: 그 pid 의 새 날짜면 +1 (첫 이벤트 = crossing 이벤트)
      let dset = gpSeenDate.get(pid)
      if (!dset) { dset = new Set(); gpSeenDate.set(pid, dset) }
      if (!dset.has(ev.date)) {
        dset.add(ev.date)
        bump(pid, 'GP', 1, ev)
      }
    }
    // 5-b) 야투 성공 어시스트 (related_player_id → AST +1)
    if (
      ev.related_player_id
      && ev.result === 'made'
      && FIELD_SHOTS.has(ev.type)
    ) {
      bump(ev.related_player_id, 'AST', 1, ev)
    }
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
