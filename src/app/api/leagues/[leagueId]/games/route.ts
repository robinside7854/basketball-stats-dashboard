import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { syncBadgesForGame } from '@/lib/badges/computeBadges'
import { syncYoutubeForLeague } from '@/lib/youtube/syncYoutubeForLeague'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  const { searchParams } = new URL(req.url)
  const date       = searchParams.get('date')
  const quarterId  = searchParams.get('quarterId')
  const complete   = searchParams.get('complete')
  const supabase = createClient()

  let q = supabase
    .from('league_games')
    .select(`
      *,
      home_team:league_teams!league_games_home_team_id_fkey(id, name, color),
      away_team:league_teams!league_games_away_team_id_fkey(id, name, color)
    `)
    .eq('league_id', leagueId)

  if (date)      q = q.eq('date', date).order('slot_num', { ascending: true })
  if (quarterId) q = q.eq('quarter_id', quarterId)
  if (complete === 'true') q = q.eq('is_complete', true)
  if (!date)     q = q.order('date', { ascending: true }).order('slot_num', { ascending: true })

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const games = data ?? []

  // 분기별 팀명/색상 override 자동 적용 — home_team / away_team 의 name/color 를 그 게임의 quarter_id 기반 override 로 치환
  type TeamLite = { id: string; name: string | null; color: string | null } | null
  type GameRow = { quarter_id: string | null; home_team: TeamLite; away_team: TeamLite }
  const rows = games as unknown as GameRow[]
  const qids = Array.from(new Set(rows.map(g => g.quarter_id).filter(Boolean) as string[]))
  const tids = Array.from(new Set(rows.flatMap(g => [g.home_team?.id, g.away_team?.id]).filter(Boolean) as string[]))
  if (qids.length > 0 && tids.length > 0) {
    const { data: overrides } = await supabase
      .from('league_team_quarter_overrides')
      .select('quarter_id, team_id, name, color')
      .in('quarter_id', qids)
      .in('team_id', tids)
    const ovMap: Record<string, Record<string, { name: string | null; color: string | null }>> = {}
    for (const o of (overrides ?? []) as { quarter_id: string; team_id: string; name: string | null; color: string | null }[]) {
      (ovMap[o.quarter_id] ||= {})[o.team_id] = { name: o.name, color: o.color }
    }
    for (const g of rows) {
      const ov = g.quarter_id ? ovMap[g.quarter_id] : null
      if (g.home_team && ov?.[g.home_team.id]) {
        if (ov[g.home_team.id].name) g.home_team.name = ov[g.home_team.id].name
        if (ov[g.home_team.id].color) g.home_team.color = ov[g.home_team.id].color
      }
      if (g.away_team && ov?.[g.away_team.id]) {
        if (ov[g.away_team.id].name) g.away_team.name = ov[g.away_team.id].name
        if (ov[g.away_team.id].color) g.away_team.color = ov[g.away_team.id].color
      }
    }
  }

  return NextResponse.json(games)
}

// 날짜에 대한 게임 슬랏 초기화 (games_per_round 개수만큼 생성)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { date } = await req.json()
  if (!date) return NextResponse.json({ error: 'date is required' }, { status: 400 })

  const supabase = createClient()

  // 리그 설정에서 games_per_round 가져오기
  const { data: league } = await supabase.from('leagues').select('games_per_round').eq('id', leagueId).single()
  const slotCount = league?.games_per_round ?? 9

  // 이미 있는 슬랏 확인
  const { data: existing } = await supabase
    .from('league_games')
    .select('slot_num, is_exhibition')
    .eq('league_id', leagueId)
    .eq('date', date)

  // 친선전 슬롯이 하나라도 있으면 추가 생성하지 않음
  // (exhibition/init API가 8개 슬롯을 일괄 생성하므로 정규전 슬롯 채우기 금지)
  const hasExhibition = (existing ?? []).some(g => g.is_exhibition)

  if (!hasExhibition) {
    const existingSlots = new Set((existing ?? []).map(g => g.slot_num))
    const toInsert = []
    for (let i = 1; i <= slotCount; i++) {
      if (!existingSlots.has(i)) {
        toInsert.push({
          league_id: leagueId,
          date,
          slot_num: i,
          round_num: i,
          home_score: 0,
          away_score: 0,
          is_complete: false,
          is_started: false,
        })
      }
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from('league_games').insert(toInsert)
      // 23505 = unique_violation — 동시 요청 race condition으로 다른 인스턴스가 먼저 insert한 경우.
      // UNIQUE INDEX league_games_slot_unique 가 적용되어 있으면 중복은 방지되므로 안전하게 무시.
      if (error && error.code !== '23505') {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }
  }

  // 생성 후 전체 슬랏 반환
  const { data: slots, error: fetchErr } = await supabase
    .from('league_games')
    .select(`
      *,
      home_team:league_teams!league_games_home_team_id_fkey(id, name, color),
      away_team:league_teams!league_games_away_team_id_fkey(id, name, color)
    `)
    .eq('league_id', leagueId)
    .eq('date', date)
    .order('slot_num', { ascending: true })

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  return NextResponse.json(slots ?? [])
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId is required' }, { status: 400 })
  const body = await req.json()
  const supabase = createClient()
  const { data, error } = await supabase
    .from('league_games')
    .update(body)
    .eq('id', gameId)
    .eq('league_id', leagueId)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // F6: 홈 페이지 unstable_cache 무효화 (Sprint 2 B2 태그)
  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  // 자동 배지 재계산 훅 —
  //   경기 마감(is_complete=true) 순간 즉시 배지 재계산.
  //   실패해도 경기 마감 자체는 성공하도록 try/catch 로 격리 (fire-and-forget 계열).
  //   sync 함수는 idempotent 이므로 중복 호출/실패 재시도에 안전.
  if (body?.is_complete === true) {
    try {
      const r = await syncBadgesForGame(supabase, gameId)
      console.log(`[badges/auto-sync] gameId=${gameId} created=${r.created} removed=${r.removed}`)
    } catch (err) {
      console.error(`[badges/auto-sync] gameId=${gameId} failed:`, err)
    }
  }

  // YouTube 자동 연동 훅 (Option A) —
  //   is_started=true 로 전이할 때 backgroud sync 시도. 실패하면 조용히 스킵.
  //   대부분의 경우 게임 시작 시점엔 영상이 아직 업로드되지 않음 → 실패 정상.
  //   진짜 안전망은 매주 토 22:00 KST cron (/api/cron/youtube-sync).
  //   조건: league 에 youtube_channel 설정 + 게임 날짜 <= 오늘(KST) + youtube_url 아직 없음.
  if (body?.is_started === true && data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const game = data as any
    const apiKey = process.env.YOUTUBE_API_KEY
    if (apiKey && game.date && !game.youtube_url) {
      // KST 오늘
      const kstToday = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]
      if (game.date <= kstToday) {
        supabase
          .from('leagues')
          .select('youtube_channel')
          .eq('id', leagueId)
          .single()
          .then(({ data: lg }) => {
            const handle = (lg as { youtube_channel: string | null } | null)?.youtube_channel
            if (!handle) return
            syncYoutubeForLeague(supabase, leagueId, handle, game.date, apiKey)
              .then((r) => {
                if (r.ok) console.log(`[youtube/auto-sync] gameId=${gameId} mapped=${r.mapped}`)
                else console.log(`[youtube/auto-sync] gameId=${gameId} skip: ${r.reason}`)
              })
              .catch((err) => {
                const msg = err instanceof Error ? err.message : String(err)
                console.error(`[youtube/auto-sync] gameId=${gameId} failed:`, msg)
              })
          })
      }
    }
  }

  return NextResponse.json(data)
}
