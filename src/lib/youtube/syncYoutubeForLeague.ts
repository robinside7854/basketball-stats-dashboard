// YouTube 자동 매핑 로직 — 리그의 채널 핸들 + 날짜 → 그날 경기에 영상 붙이기
//
// 사용처
//   1. POST /api/leagues/[leagueId]/youtube-sync (수동, 편집 권한)
//   2. GET  /api/cron/youtube-sync                (매주 토 22:00 KST 자동)
//   3. PATCH /api/leagues/[leagueId]/games       (게임 저장 시 백그라운드 시도)
//
// 제목 규칙이 두 가지다 (2026-09-07)
//   ┌ 쿼터형 `260905 지피티vs빅현욱 1Q` → **대진 + 쿼터**. 경기 1행 + league_game_videos 로 붙는다.
//   └ 옛 번호형 `260801 경기 3`         → 그날 3번 슬롯의 대표 영상 한 칸.
//   그날 영상에 쿼터형이 하나라도 있으면 쿼터형으로만 처리한다. 두 규칙을 섞으면 같은 영상이
//   대표와 쿼터에 이중으로 붙어 화면마다 다른 것이 재생된다.
//
// ⚠ 이 함수는 **슬롯(경기 행)을 새로 만들지 않는다.** 영상 때문에 슬롯을 만들면 is_exhibition
//   기본값 false 로 들어가 친선 날짜에 정규전 슬롯이 끼고, 거기 기록한 게 순위·개인 스탯에
//   섞인다(2026-08-22 실제 사고). 빈 슬롯이 이미 있으면 그 칸을 **쓰기만** 한다.
//
// 주의: YOUTUBE_API_KEY 쿼터 절약을 위해 caller 가 스킵 조건(youtube_channel 유무·오늘 게임 유무)을 미리 필터링해야 한다.

import type { SupabaseClient } from '@supabase/supabase-js'
import { parseQuarterTitle, parseLegacyGameNumber, type QuarterTitle } from './videoTitle'
import { loadTeamNameIndex, type TeamNameIndex } from './teamNameIndex'
import { pickRepresentative } from './gameVideo'

const YT_API = 'https://www.googleapis.com/youtube/v3'

export type SyncOutcome =
  | { ok: true; mapped: number; totalVideos: number; channelId: string; details: SyncDetail[]; mode: 'quarter' | 'legacy'; dryRun?: boolean }
  | { ok: false; reason: string; channelId?: string; searchedVideos?: number; foundTitles?: string[] }

export interface SyncDetail {
  title: string
  url: string
  /** 'updated' | 'created' | 'assigned-teams' | 'skipped:이유' | 'err:메시지' (dry-run 이면 'dry:' 접두) */
  action: string
  /** 옛 번호형에서 읽은 경기 번호 */
  gameNum?: number
  slotNum?: number | null
  quarter?: number | null
}

interface VideoItem {
  videoId: string
  title: string
  url: string
  publishedAt: string
}

interface GameRow {
  id: string
  slot_num: number | null
  home_team_id: string | null
  away_team_id: string | null
  is_started: boolean | null
  quarter_id: string | null
}

// 채널 핸들(@xxx), 채널 URL(youtube.com/@xxx), 채널 ID(UCxxx) 모두 처리
export async function getChannelId(
  input: string,
  apiKey: string
): Promise<{ id: string | null; debug: string[] }> {
  const debug: string[] = []

  if (/^UC[\w-]{22}$/.test(input.trim())) {
    debug.push(`direct channelId: ${input.trim()}`)
    return { id: input.trim(), debug }
  }

  let handle = input.trim()
  const urlMatch = input.match(/youtube\.com\/(?:channel\/(UC[\w-]{22})|(?:@|c\/)?([\w가-힣.-]+))/)
  if (urlMatch) {
    if (urlMatch[1]) {
      debug.push(`extracted channelId from URL: ${urlMatch[1]}`)
      return { id: urlMatch[1], debug }
    }
    handle = '@' + urlMatch[2].replace(/^@/, '')
  }

  const clean = handle.replace(/^@/, '')

  let res = await fetch(`${YT_API}/channels?part=id&forHandle=${encodeURIComponent('@' + clean)}&key=${apiKey}`)
  let json = await res.json()
  debug.push(`forHandle(@${clean}): ${res.status}, items:${json.items?.length ?? 0}${json.error ? ` err:${json.error.message}` : ''}`)
  if (json.items?.length) return { id: json.items[0].id, debug }

  res = await fetch(`${YT_API}/channels?part=id&forUsername=${encodeURIComponent(clean)}&key=${apiKey}`)
  json = await res.json()
  debug.push(`forUsername(${clean}): ${res.status}, items:${json.items?.length ?? 0}`)
  if (json.items?.length) return { id: json.items[0].id, debug }

  res = await fetch(`${YT_API}/search?part=snippet&type=channel&q=${encodeURIComponent(handle)}&maxResults=5&key=${apiKey}`)
  json = await res.json()
  debug.push(`search(${handle}): ${res.status}, items:${json.items?.length ?? 0}`)
  if (json.items?.length) return { id: json.items[0].snippet.channelId, debug }

  return { id: null, debug }
}

/**
 * 그 날짜(yymmdd)로 채널 영상을 찾는다.
 *
 * ⚠ 검색어에 `경기` 같은 단어를 덧붙이지 말 것. 제목 규칙이 바뀌면 그 단어가 없는 날 영상이
 *   통째로 빠진다 — 9/5 영상 10개가 하나도 안 걸린 이유 중 하나다. 목록 라우트
 *   (`youtube-videos`)는 이미 날짜만으로 검색한다. 두 경로가 같은 영상을 봐야 한다.
 */
async function searchVideos(channelId: string, dateStr: string, apiKey: string): Promise<VideoItem[]> {
  const parts = dateStr.split('-')
  const yymmdd = parts[0].slice(2) + parts[1] + parts[2] // e.g. 260905

  const after = new Date(dateStr)
  after.setDate(after.getDate() - 7)
  const before = new Date(dateStr)
  before.setDate(before.getDate() + 30)

  const url = `${YT_API}/search?part=snippet&channelId=${channelId}&q=${encodeURIComponent(yymmdd)}`
    + `&type=video&maxResults=50&order=date`
    + `&publishedAfter=${after.toISOString()}&publishedBefore=${before.toISOString()}&key=${apiKey}`
  const res = await fetch(url)
  const json = await res.json()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((json.items ?? []) as any[])
    .map(it => ({
      videoId: (it.id?.videoId ?? '') as string,
      // ⚠ NFC 정규화 필수 — YouTube API 는 한글 제목을 **NFD(자모 분리형)** 으로 돌려준다.
      //   화면에는 똑같이 '쿼터' 로 보이지만 문자열로는 U+110F U+116F U+1110 U+1165 라
      //   소스에 적은 완성형 '쿼터'(U+CFFC U+D130) 와 절대 일치하지 않는다.
      //   2026-08-22 에 쿼터 가드를 넣고도 그대로 뚫린 원인이 이것이었다 — 정규식은 맞았고
      //   비교 대상이 다른 표현이었을 뿐이라 로그만 봐서는 원인이 드러나지 않는다.
      title: ((it.snippet?.title ?? '') as string).normalize('NFC'),
      publishedAt: (it.snippet?.publishedAt ?? '') as string,
      url: `https://www.youtube.com/watch?v=${it.id?.videoId}`,
    }))
    .filter(v => !!v.videoId)
}

/**
 * 지정 리그의 channelHandle + date 조합으로 영상 매핑.
 *
 * @param opts.dryRun true 면 **아무것도 저장하지 않고** 무엇을 하려 했는지만 details 로 돌려준다.
 *                    제목 규칙이 바뀔 때마다 운영 데이터로 먼저 확인하기 위한 통로다.
 */
export async function syncYoutubeForLeague(
  supabase: SupabaseClient,
  leagueId: string,
  channelHandle: string,
  date: string,
  apiKey: string,
  opts: { dryRun?: boolean } = {},
): Promise<SyncOutcome> {
  const dryRun = opts.dryRun === true

  // 0. 대회 묶음에서는 돌지 않는다.
  //
  //   대회는 슬롯 번호에 의미가 없고(같은 날 1·2경기가 그냥 등록 순서다), 상대가 외부 팀이라
  //   제목의 팀명을 우리 팀 표에서 찾을 수도 없다. 대회의 연동 경로는 기록 화면의
  //   "목록에서 고르기"(쿼터별 칸) 하나로 못 박는다.
  //   여기서 막는 이유: 수동 버튼·주간 cron·경기 시작 훅 세 경로가 전부 이 함수를 지난다.
  //   호출부마다 조건을 달면 하나를 빠뜨렸을 때 그 경로로만 오배정이 되살아난다.
  const { data: lg, error: lgErr } = await supabase
    .from('leagues')
    .select('mode')
    .eq('id', leagueId)
    .maybeSingle()
  if (lgErr) return { ok: false, reason: `리그 확인 실패: ${lgErr.message}` }
  if (lg?.mode === 'tournament') {
    return {
      ok: false,
      reason: '대회는 영상 자동 매핑을 쓰지 않습니다. 기록 화면에서 경기를 고른 뒤 쿼터별로 "목록에서 고르기"로 연결하세요.',
    }
  }

  // 1. 채널 ID
  const { id: channelId } = await getChannelId(channelHandle, apiKey)
  if (!channelId) return { ok: false, reason: `채널을 찾을 수 없습니다: ${channelHandle}` }

  // 2. 영상 목록 검색
  const videos = await searchVideos(channelId, date, apiKey)
  if (videos.length === 0) {
    return { ok: false, reason: `이 날짜(${date})에 올라온 영상을 찾지 못했습니다`, channelId, searchedVideos: 0 }
  }

  // 3. 제목 해석 — 쿼터형이 하나라도 있으면 쿼터형으로 간다
  const quarterItems: Array<{ video: VideoItem; parsed: QuarterTitle }> = []
  for (const v of videos) {
    const parsed = parseQuarterTitle(v.title)
    if (parsed) quarterItems.push({ video: v, parsed })
  }

  if (quarterItems.length > 0) {
    return mapQuarterVideos(supabase, leagueId, date, channelId, videos, quarterItems, dryRun)
  }
  return mapLegacyVideos(supabase, leagueId, date, channelId, videos, dryRun)
}

// ────────────────────────────────────────────────────────────────────────────
// 쿼터형 — `260905 지피티vs빅현욱 1Q`
// ────────────────────────────────────────────────────────────────────────────

const pairKey = (a: string, b: string) => [a, b].sort().join('|')

async function mapQuarterVideos(
  supabase: SupabaseClient,
  leagueId: string,
  date: string,
  channelId: string,
  allVideos: VideoItem[],
  items: Array<{ video: VideoItem; parsed: QuarterTitle }>,
  dryRun: boolean,
): Promise<SyncOutcome> {
  const details: SyncDetail[] = []

  // 3-1. 그날 슬롯
  const { data: gamesRaw, error: gErr } = await supabase
    .from('league_games')
    .select('id, slot_num, home_team_id, away_team_id, is_started, quarter_id')
    .eq('league_id', leagueId)
    .eq('date', date)
    .order('slot_num', { ascending: true })
  if (gErr) return { ok: false, reason: `DB error: ${gErr.message}`, channelId }

  const games = (gamesRaw ?? []) as GameRow[]
  if (games.length === 0) {
    return {
      ok: false,
      reason: `${date} 에 경기 슬롯이 없습니다. 기록 화면에서 날짜를 먼저 여세요 — 영상 연동은 슬롯을 새로 만들지 않습니다.`,
      channelId,
      searchedVideos: allVideos.length,
    }
  }

  // 3-2. 팀 이름 색인 (분기 팀명 + 별칭 포함)
  const quarterId = games.find(g => g.quarter_id)?.quarter_id ?? (await lookupQuarterId(supabase, leagueId, date))
  const onGameTeamIds = games.flatMap(g => [g.home_team_id, g.away_team_id]).filter((x): x is string => !!x)
  const index = await loadTeamNameIndex(supabase, leagueId, date, quarterId, onGameTeamIds)

  // 3-3. 제목의 팀명 → 팀 id. 못 풀면 그 영상은 버리고 이유를 남긴다.
  type Resolved = { video: VideoItem; quarter: number; teamA: string; teamB: string }
  const resolved: Resolved[] = []
  for (const { video, parsed } of items) {
    const a = index.resolve(parsed.teamA)
    const b = index.resolve(parsed.teamB)
    const bad = [
      a.kind !== 'ok' ? { raw: parsed.teamA, r: a } : null,
      b.kind !== 'ok' ? { raw: parsed.teamB, r: b } : null,
    ].filter(Boolean) as Array<{ raw: string; r: ReturnType<TeamNameIndex['resolve']> }>

    if (bad.length > 0) {
      const msgs = bad.map(({ raw, r }) => {
        if (r.kind === 'ambiguous') return `'${raw}' 는 팀 여러 개와 맞습니다`
        const s = index.suggest(raw)
        return s
          ? `'${raw}' 를 아는 팀이 없습니다 (혹시 ${s.name}? 설정 → 팀 별칭에 등록하세요)`
          : `'${raw}' 를 아는 팀이 없습니다 (설정 → 팀 별칭에 등록하세요)`
      })
      details.push({ title: video.title, url: video.url, quarter: parsed.quarter, action: `skipped:${msgs.join(' / ')}` })
      continue
    }
    resolved.push({
      video, quarter: parsed.quarter,
      teamA: (a as { kind: 'ok'; teamId: string }).teamId,
      teamB: (b as { kind: 'ok'; teamId: string }).teamId,
    })
  }

  // 쿼터형 날짜에 섞여 있는 옛 번호형 제목은 처리하지 않는다 — 이중 배정을 막는다.
  for (const v of allVideos) {
    if (items.some(i => i.video.videoId === v.videoId)) continue
    details.push({ title: v.title, url: v.url, action: 'skipped:쿼터 표기가 없는 제목 (이 날짜는 쿼터형으로 처리했습니다)' })
  }

  // 3-4. 대진별로 묶는다. 업로드가 이른 대진부터 처리해야 빈 슬롯을 경기 순서대로 채운다.
  const groups = new Map<string, { teamA: string; teamB: string; videos: Resolved[]; firstUpload: string }>()
  for (const r of resolved) {
    const key = pairKey(r.teamA, r.teamB)
    const g = groups.get(key)
    if (g) {
      g.videos.push(r)
      if (r.video.publishedAt && r.video.publishedAt < g.firstUpload) g.firstUpload = r.video.publishedAt
    } else {
      groups.set(key, { teamA: r.teamA, teamB: r.teamB, videos: [r], firstUpload: r.video.publishedAt || '9999' })
    }
  }
  const ordered = [...groups.values()].sort((x, y) => x.firstUpload.localeCompare(y.firstUpload))

  // 3-5. 대진 → 슬롯
  const claimed = new Set<string>()
  const touchedGames = new Set<string>()
  let mapped = 0

  for (const group of ordered) {
    const key = pairKey(group.teamA, group.teamB)
    const matches = games.filter(
      g => g.home_team_id && g.away_team_id && pairKey(g.home_team_id, g.away_team_id) === key,
    )

    let target: GameRow | null = null

    if (matches.length === 1) {
      target = matches[0]
    } else if (matches.length > 1) {
      // ⚠ 같은 대진이 하루에 두 번 이상이면 어느 쪽인지 알 수 없다. 승자 잔류 로테이션 시절에는
      //   흔한 일이었다. 추측해서 붙이면 조용히 틀리므로 손으로 고르게 넘긴다.
      const slots = matches.map(m => m.slot_num).join('·')
      for (const r of group.videos) {
        details.push({
          title: r.video.title, url: r.video.url, quarter: r.quarter,
          action: `skipped:같은 대진이 ${matches.length}칸(슬롯 ${slots})에 있어 어디인지 알 수 없습니다 — 목록에서 고르기로 연결하세요`,
        })
      }
      continue
    } else {
      // 팀이 아직 안 정해진 빈 슬롯을 하나 가져다 쓴다 — 이것이 "자동 팀 매핑"이다.
      //   ⚠ 기록이 시작된 경기의 팀은 절대 건드리지 않는다. 팀만 바꾸면
      //     league_game_events.team_id 가 무관한 팀을 가리켜 그 선수들이 박스스코어에서 사라진다
      //     (그 이관은 POST /games/[gameId]/reassign-teams 가 한다).
      const empty = games.find(
        g => !g.home_team_id && !g.away_team_id && !g.is_started && !claimed.has(g.id),
      )
      if (!empty) {
        for (const r of group.videos) {
          details.push({
            title: r.video.title, url: r.video.url, quarter: r.quarter,
            action: `skipped:${index.displayName(group.teamA)} vs ${index.displayName(group.teamB)} 대진의 슬롯이 없고 비어 있는 슬롯도 없습니다`,
          })
        }
        continue
      }
      claimed.add(empty.id)
      if (!dryRun) {
        const { error } = await supabase
          .from('league_games')
          .update({ home_team_id: group.teamA, away_team_id: group.teamB })
          .eq('id', empty.id)
          .eq('league_id', leagueId)
        if (error) {
          details.push({ title: `(팀 배정) 슬롯 ${empty.slot_num}`, url: '', slotNum: empty.slot_num, action: `err:${error.message}` })
          continue
        }
      }
      empty.home_team_id = group.teamA
      empty.away_team_id = group.teamB
      target = empty
      details.push({
        title: `${index.displayName(group.teamA)} vs ${index.displayName(group.teamB)}`,
        url: '',
        slotNum: empty.slot_num,
        action: dryRun ? 'dry:assigned-teams' : 'assigned-teams',
      })
    }

    // 3-6. 쿼터 영상 저장
    const usedQuarters = new Set<number>()
    for (const r of group.videos.sort((a, b) => a.quarter - b.quarter)) {
      if (usedQuarters.has(r.quarter)) {
        details.push({
          title: r.video.title, url: r.video.url, quarter: r.quarter, slotNum: target.slot_num,
          action: `skipped:같은 대진에 ${r.quarter}쿼터 영상이 둘 이상입니다`,
        })
        continue
      }
      usedQuarters.add(r.quarter)

      if (dryRun) {
        details.push({ title: r.video.title, url: r.video.url, quarter: r.quarter, slotNum: target.slot_num, action: 'dry:updated' })
        mapped++
        continue
      }

      const { error } = await supabase
        .from('league_game_videos')
        .upsert({
          league_game_id: target.id,
          quarter: r.quarter,
          youtube_url: r.video.url,
          start_offset: 0,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'league_game_id,quarter' })

      details.push({
        title: r.video.title, url: r.video.url, quarter: r.quarter, slotNum: target.slot_num,
        action: error ? `err:${error.message}` : 'updated',
      })
      if (!error) { mapped++; touchedGames.add(target.id) }
    }
  }

  // 3-7. 대표 영상 재동기화
  //   ⚠ league_games.youtube_url 을 비워 두면 안 된다. 하이라이트 로더 여러 곳이
  //     `.not('youtube_url','is',null)` 로 "영상 있는 경기"를 고르므로, 쿼터 영상만 넣고
  //     이 컬럼을 안 채우면 그 경기가 화면에서 통째로 사라진다.
  if (!dryRun) {
    for (const gameId of touchedGames) {
      const { data: rows, error } = await supabase
        .from('league_game_videos')
        .select('quarter, youtube_url, start_offset')
        .eq('league_game_id', gameId)
      if (error) {
        details.push({ title: '(대표 영상 재설정)', url: '', action: `err:${error.message}` })
        continue
      }
      const rep = pickRepresentative((rows ?? []) as Array<{ quarter: number; youtube_url: string; start_offset: number | null }>)
      if (rep) {
        await supabase
          .from('league_games')
          .update({ youtube_url: rep.url, youtube_start_offset: rep.startOffset })
          .eq('id', gameId)
          .eq('league_id', leagueId)
      }
    }
  }

  if (mapped === 0) {
    return {
      ok: false,
      reason: `영상 ${allVideos.length}개를 찾았지만 붙일 수 있는 것이 없었습니다. `
        + details.filter(d => d.action.startsWith('skipped')).slice(0, 3).map(d => d.action.replace(/^skipped:/, '')).join(' / '),
      channelId,
      searchedVideos: allVideos.length,
      foundTitles: allVideos.slice(0, 10).map(v => v.title),
    }
  }

  return { ok: true, mapped, totalVideos: allVideos.length, channelId, details, mode: 'quarter', dryRun }
}

/** 그날 경기에 quarter_id 가 없을 때 날짜로 분기를 찾는다 (분기 팀명 override 를 쓰기 위해). */
async function lookupQuarterId(supabase: SupabaseClient, leagueId: string, date: string): Promise<string | null> {
  const { data } = await supabase
    .from('league_quarters')
    .select('id')
    .eq('league_id', leagueId)
    .eq('kind', 'quarter')
    .lte('start_date', date)
    .gte('end_date', date)
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

// ────────────────────────────────────────────────────────────────────────────
// 옛 번호형 — `260801 경기 3` (과거 날짜 재연동용으로 남긴다)
// ────────────────────────────────────────────────────────────────────────────

async function mapLegacyVideos(
  supabase: SupabaseClient,
  leagueId: string,
  date: string,
  channelId: string,
  videos: VideoItem[],
  dryRun: boolean,
): Promise<SyncOutcome> {
  const matched: Array<{ video: VideoItem; gameNum: number }> = []
  const seen = new Set<number>()

  for (const v of videos) {
    const gameNum = parseLegacyGameNumber(v.title)
    if (gameNum == null) continue
    if (seen.has(gameNum)) continue
    seen.add(gameNum)
    matched.push({ video: v, gameNum })
  }

  if (matched.length === 0) {
    return {
      ok: false,
      reason: `제목에서 경기 번호나 대진을 읽을 수 있는 영상이 없습니다 (${videos.length}개 검색됨). `
        + `기록 화면에서 슬롯을 고른 뒤 "목록에서 고르기"로 직접 연결하세요.`,
      channelId,
      searchedVideos: videos.length,
      foundTitles: videos.slice(0, 10).map(v => v.title),
    }
  }

  const { data: existingGames, error: gErr } = await supabase
    .from('league_games')
    .select('id, slot_num')
    .eq('league_id', leagueId)
    .eq('date', date)
    .order('id', { ascending: true })
  if (gErr) return { ok: false, reason: `DB error: ${gErr.message}`, channelId }

  const slotToId = new Map<number, string>()
  for (const g of (existingGames ?? []) as { id: string; slot_num: number }[]) {
    if (!slotToId.has(g.slot_num)) slotToId.set(g.slot_num, g.id)
  }

  const details: SyncDetail[] = []
  for (const { video, gameNum } of matched) {
    if (!slotToId.has(gameNum)) {
      // 슬롯을 새로 만들지 않는다 (2026-08-22 사고). 없는 번호면 그냥 건너뛴다.
      details.push({ title: video.title, url: video.url, gameNum, action: `skipped:슬롯 ${gameNum} 없음(영상 때문에 슬롯을 만들지 않습니다)` })
      continue
    }
    if (dryRun) {
      details.push({ title: video.title, url: video.url, gameNum, slotNum: gameNum, action: 'dry:updated' })
      continue
    }
    const { error } = await supabase
      .from('league_games')
      .update({ youtube_url: video.url })
      .eq('league_id', leagueId)
      .eq('date', date)
      .eq('slot_num', gameNum)
    details.push({ title: video.title, url: video.url, gameNum, slotNum: gameNum, action: error ? `err:${error.message}` : 'updated' })
  }

  const mapped = details.filter(d => !d.action.startsWith('err') && !d.action.startsWith('skipped')).length
  return { ok: true, mapped, totalVideos: matched.length, channelId, details, mode: 'legacy', dryRun }
}
