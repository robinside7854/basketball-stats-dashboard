// 영상이 곧 일정이다 (2026-10-12 운영진 결정).
//
//   「영상이 올라오면 자동으로 등록되게 · 영상 연동이 안 된 날은 경기가 없는 날이니 슬롯째 삭제」
//
// 종전에는 「정기 일정 등록」이 첫 일정일부터 8주 뒤까지 매주 토요일을 미리 깔고, 안 모인 주는
// '미실시'로 접었다. 일정표에 「예정」 카드가 줄줄이 남고, 기록 화면을 한 번 열었던 빈 날짜에는
// 빈 슬롯 9칸이 남았다. 이제 순서를 뒤집는다 — **채널에 영상이 올라온 날짜만** 일정이 된다.
//
// 두 일을 한다
//   1) registerDatesFromVideos — 채널 업로드 목록에서 제목의 날짜(`261010`·`20261010`)를 읽어
//      그 날짜를 일정에 넣고, 빈 슬롯을 깔고, 영상을 붙인다(syncYoutubeForLeague · 번호형/쿼터형 공통).
//   2) pruneDatesWithoutGames — 「아무 흔적도 없는 날짜」를 슬롯째 지운다.
//      흔적 = 기록 시작/마감 · 이벤트 1건 이상 · 대표 영상 · 쿼터 영상. 하나라도 있으면 절대 안 지운다.
//      ⚠ 오늘·어제는 지우지 않는다(GRACE_DAYS) — 경기 직후 영상이 아직 안 올라온 날을 지웠다가
//        다시 만드는 일을 막는다. 앞날(예정)은 흔적이 없으면 바로 지운다.
//
// 대회 묶음에서는 돌지 않는다 — 대회 날짜는 경기를 등록할 때 들어간다(CLAUDE.md 대회 모드).
// 호출부: 매일 밤 cron(`/api/cron/video-schedule`) · 일정 탭 「영상으로 일정 맞추기」(dryRun 미리보기 → 실행).

import type { SupabaseClient } from '@supabase/supabase-js'
import { getChannelId, syncYoutubeForLeague } from '@/lib/youtube/syncYoutubeForLeague'

const YT_API = 'https://www.googleapis.com/youtube/v3'

/** 오늘·어제는 흔적이 없어도 남겨 둔다. */
const GRACE_DAYS = 1
/** 업로드 목록을 몇 장(50개씩)까지 훑을지 — playlistItems 는 장당 1유닛이라 싸다. */
const MAX_PAGES = 4

const DATE_TOKEN = /(?<!\d)(\d{8}|\d{6})(?!\d)/g

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}
function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** 제목의 날짜 토큰 → `YYYY-MM-DD`. 달력에 없는 날짜(예: 경기 번호 붙은 숫자)는 버린다. */
export function extractTitleDate(rawTitle: string): string | null {
  const tokens = rawTitle.normalize('NFC').match(DATE_TOKEN) ?? []
  for (const t of tokens) {
    const yyyy = t.length === 8 ? t.slice(0, 4) : `20${t.slice(0, 2)}`
    const mm = t.slice(-4, -2)
    const dd = t.slice(-2)
    const ymd = `${yyyy}-${mm}-${dd}`
    const d = new Date(`${ymd}T00:00:00Z`)
    if (!Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === ymd && +yyyy >= 2024) return ymd
  }
  return null
}

/** 채널 업로드 목록에서 제목에 날짜가 적힌 영상의 날짜 집합. 최근 것부터 MAX_PAGES 장. */
async function uploadedVideoDates(channelId: string, apiKey: string, sinceYmd: string): Promise<{ dates: Map<string, number>; error: string | null }> {
  const dates = new Map<string, number>()
  const chRes = await fetch(`${YT_API}/channels?part=contentDetails&id=${channelId}&key=${apiKey}`)
  const chJson = await chRes.json().catch(() => ({}))
  const uploads = chJson?.items?.[0]?.contentDetails?.relatedPlaylists?.uploads as string | undefined
  if (!uploads) return { dates, error: chJson?.error?.message ?? '채널 업로드 목록을 찾지 못했습니다' }

  let pageToken = ''
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = `${YT_API}/playlistItems?part=snippet&maxResults=50&playlistId=${uploads}&key=${apiKey}${pageToken ? `&pageToken=${pageToken}` : ''}`
    const res = await fetch(url)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { dates, error: json?.error?.message ?? `업로드 목록 조회 실패 (${res.status})` }
    let reachedOld = false
    for (const it of (json.items ?? []) as Array<{ snippet?: { title?: string; publishedAt?: string } }>) {
      const title = it.snippet?.title ?? ''
      const date = extractTitleDate(title)
      if (!date) continue
      if (date < sinceYmd) { reachedOld = true; continue }
      dates.set(date, (dates.get(date) ?? 0) + 1)
    }
    pageToken = json.nextPageToken ?? ''
    if (!pageToken || reachedOld) break
  }
  return { dates, error: null }
}

/** 그 날짜에 games_per_round 만큼 빈 슬롯을 깐다(빠진 번호만). 친선 슬롯이 있으면 손대지 않는다. */
async function ensureDateSlots(supabase: SupabaseClient, leagueId: string, date: string, slotCount: number) {
  const { data: existing } = await supabase
    .from('league_games').select('slot_num, is_exhibition').eq('league_id', leagueId).eq('date', date)
  if ((existing ?? []).some(g => g.is_exhibition)) return
  const have = new Set((existing ?? []).map(g => g.slot_num))
  const rows = []
  for (let i = 1; i <= slotCount; i++) {
    if (!have.has(i)) rows.push({ league_id: leagueId, date, slot_num: i, round_num: i, home_score: 0, away_score: 0, is_complete: false, is_started: false, is_exhibition: false })
  }
  if (rows.length === 0) return
  const { error } = await supabase.from('league_games').insert(rows)
  if (error && error.code !== '23505') throw new Error(error.message)
}

export interface VideoScheduleResult {
  /** 새로 일정에 넣은 날짜 */
  added: string[]
  /** 영상 연동을 돌린 날짜와 새로 붙은 영상 수 */
  synced: Array<{ date: string; mapped: number; note?: string }>
  /** 지운(지울) 날짜와 그날 지운 빈 슬롯 수 */
  pruned: Array<{ date: string; slots: number; future: boolean }>
  error?: string
}

/**
 * 리그 하나에 대해 「영상 → 일정」 맞추기.
 * @param opts.dryRun true 면 아무것도 쓰지 않고 할 일만 돌려준다(화면의 확인 단계).
 * @param opts.lookbackDays 업로드 목록에서 볼 날짜 범위(기본 45일).
 */
export async function reconcileScheduleWithVideos(
  supabase: SupabaseClient,
  leagueId: string,
  apiKey: string | undefined,
  opts: { dryRun?: boolean; lookbackDays?: number } = {},
): Promise<VideoScheduleResult> {
  const dryRun = opts.dryRun === true
  const today = kstToday()
  const result: VideoScheduleResult = { added: [], synced: [], pruned: [] }

  const { data: league } = await supabase
    .from('leagues').select('mode, youtube_channel, games_per_round').eq('id', leagueId).single()
  if (!league) return { ...result, error: '리그를 찾을 수 없습니다' }
  if (league.mode === 'tournament') return { ...result, error: '대회는 영상으로 일정을 만들지 않습니다' }

  // ── 1) 영상 → 일정 ─────────────────────────────────────────────
  const { data: sdRows } = await supabase.from('league_schedule_dates').select('date').eq('league_id', leagueId)
  const scheduled = new Set((sdRows ?? []).map((r: { date: string }) => r.date))

  let videoDates = new Map<string, number>()
  if (apiKey && league.youtube_channel) {
    const { id: channelId } = await getChannelId(league.youtube_channel, apiKey)
    if (channelId) {
      const since = addDays(today, -(opts.lookbackDays ?? 45))
      const got = await uploadedVideoDates(channelId, apiKey, since)
      videoDates = got.dates
      if (got.error) result.error = got.error
    } else {
      result.error = '유튜브 채널을 찾지 못했습니다(설정 확인)'
    }
  } else {
    result.error = apiKey ? '리그 설정에 유튜브 채널이 없습니다' : 'YOUTUBE_API_KEY 미설정'
  }

  // 그날 슬롯 중 영상이 비어 있는 칸이 있는 날만 연동을 돈다(search 200유닛/일).
  const videoDateList = [...videoDates.keys()].filter(d => d <= today).sort()
  let needSync: Set<string> = new Set()
  if (videoDateList.length > 0) {
    const { data: g } = await supabase
      .from('league_games').select('date, youtube_url, is_exhibition').eq('league_id', leagueId).in('date', videoDateList)
    const byDate = new Map<string, { total: number; linked: number }>()
    for (const r of (g ?? []) as Array<{ date: string; youtube_url: string | null }>) {
      const cur = byDate.get(r.date) ?? { total: 0, linked: 0 }
      cur.total++; if (r.youtube_url) cur.linked++
      byDate.set(r.date, cur)
    }
    needSync = new Set(videoDateList.filter(d => {
      const s = byDate.get(d)
      // 칸이 없거나, 붙은 영상 수가 올라온 영상 수보다 적은 날
      return !s || s.linked < Math.min(s.total, videoDates.get(d) ?? 0) || s.total === 0
    }))
  }

  for (const date of videoDateList) {
    if (!scheduled.has(date)) {
      result.added.push(date)
      if (!dryRun) {
        await supabase.from('league_schedule_dates')
          .upsert({ league_id: leagueId, date, is_skipped: false }, { onConflict: 'league_id,date' })
      }
    }
    if (!needSync.has(date)) continue
    if (dryRun) { result.synced.push({ date, mapped: 0, note: '연동 예정' }); continue }
    try {
      await ensureDateSlots(supabase, leagueId, date, league.games_per_round ?? 9)
      const out = await syncYoutubeForLeague(supabase, leagueId, league.youtube_channel as string, date, apiKey as string)
      result.synced.push(out.ok ? { date, mapped: out.mapped, note: out.skipped > 0 ? `${out.skipped}개 못 붙임` : undefined } : { date, mapped: 0, note: out.reason })
    } catch (e) {
      result.synced.push({ date, mapped: 0, note: e instanceof Error ? e.message : '연동 실패' })
    }
  }

  // ── 2) 흔적 없는 날짜 정리 ───────────────────────────────────────
  const graceFrom = addDays(today, -GRACE_DAYS) // 이 날짜~오늘은 남긴다
  const { data: sdAfter } = await supabase.from('league_schedule_dates').select('date').eq('league_id', leagueId)
  const candidates = ((sdAfter ?? []) as Array<{ date: string }>)
    .map(r => r.date)
    .filter(d => !videoDates.has(d))                 // 영상이 올라온 날은 대상 아님
    .filter(d => d > today || d < graceFrom)         // 앞날(예정) 또는 유예 지난 과거

  if (candidates.length > 0) {
    const { data: games } = await supabase
      .from('league_games')
      .select('id, date, is_started, is_complete, youtube_url')
      .eq('league_id', leagueId)
      .in('date', candidates)
    const gameRows = (games ?? []) as Array<{ id: string; date: string; is_started: boolean | null; is_complete: boolean | null; youtube_url: string | null }>
    const ids = gameRows.map(g => g.id)
    const busy = new Set<string>()
    // 쿼터 영상이 붙은 경기 — 이 경기가 있는 날짜는 지우지 않는다.
    for (let i = 0; i < ids.length; i += 200) {
      const { data: qv } = await supabase.from('league_game_videos').select('league_game_id').in('league_game_id', ids.slice(i, i + 200))
      for (const r of (qv ?? []) as Array<{ league_game_id: string }>) busy.add(r.league_game_id)
    }
    const byDate = new Map<string, typeof gameRows>()
    for (const g of gameRows) byDate.set(g.date, [...(byDate.get(g.date) ?? []), g])

    for (const date of candidates) {
      const rows = byDate.get(date) ?? []
      const hasTrace = rows.some(g => g.is_started || g.is_complete || g.youtube_url || busy.has(g.id))
      if (hasTrace) continue
      // 이벤트는 날짜마다 따로 확인한다 — 한 번에 묶어 limit 를 걸면 일부 경기의 이벤트를 못 보고
      //   지울 수 있다(삭제는 이벤트로 캐스케이드된다). 1건만 있어도 남긴다.
      if (rows.length > 0) {
        const { data: ev, error: evErr } = await supabase
          .from('league_game_events').select('id').in('league_game_id', rows.map(g => g.id)).limit(1)
        if (evErr || (ev ?? []).length > 0) continue
      }
      result.pruned.push({ date, slots: rows.length, future: date > today })
      if (dryRun) continue
      if (rows.length > 0) {
        // 이벤트 0건이 확인된 빈 슬롯만 지운다(삭제는 이벤트로 캐스케이드되므로 위 확인이 안전장치).
        await supabase.from('league_games').delete().in('id', rows.map(g => g.id)).eq('is_started', false)
      }
      await supabase.from('league_schedule_dates').delete().eq('league_id', leagueId).eq('date', date)
    }
  }

  return result
}
