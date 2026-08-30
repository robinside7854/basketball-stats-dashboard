// 경기의 쿼터별 영상 — 촬영본이 쿼터로 쪼개져 올라오는 경기(대회)용.
//
// ⚠ 이 라우트는 저장할 때마다 league_games.youtube_url 을 **가장 이른 쿼터 영상으로 함께 맞춘다.**
//   하이라이트 로더 여러 곳이 `.not('youtube_url','is',null)` 로 "영상 있는 경기"를 고르기
//   때문에, 쿼터 영상만 넣고 이 컬럼을 비워 두면 그 경기가 하이라이트·명경기 화면에서
//   통째로 사라진다 — 데이터가 지워진 것처럼 보이는데 실제로는 필터에 걸린 것이라 원인이 안 보인다.

import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { canViewLeague } from '@/lib/auth/guard'
import { extractYouTubeId } from '@/lib/youtube/utils'
import { pickRepresentative } from '@/lib/youtube/gameVideo'

type Ctx = { params: Promise<{ leagueId: string; gameId: string }> }

const MAX_QUARTER = 6 // 1~4쿼터 + 연장 2회. league_game_events.quarter 의 CHECK 와 같은 범위.

/** 이 경기가 이 리그의 것인지 확인. id 하나만 믿으면 남의 클럽 경기에 영상이 붙는다. */
async function assertGame(supabase: ReturnType<typeof createClient>, leagueId: string, gameId: string) {
  const { data, error } = await supabase
    .from('league_games')
    .select('id')
    .eq('id', gameId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (error) return { ok: false as const, res: NextResponse.json({ error: '경기를 확인하지 못했습니다' }, { status: 500 }) }
  if (!data) return { ok: false as const, res: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  return { ok: true as const }
}

/** 저장/삭제 후 대표 영상을 다시 맞춘다. 쿼터 영상이 하나도 없으면 손대지 않는다. */
async function syncRepresentative(
  supabase: ReturnType<typeof createClient>,
  leagueId: string,
  gameId: string,
) {
  const { data, error } = await supabase
    .from('league_game_videos')
    .select('quarter, youtube_url, start_offset')
    .eq('league_game_id', gameId)
  if (error) throw new Error(`league_game_videos: gameId=${gameId} 재조회 실패 — ${error.message}`)

  const rows = (data ?? []) as Array<{ quarter: number; youtube_url: string; start_offset: number | null }>
  const rep = pickRepresentative(rows)

  // 쿼터 영상을 전부 지운 경우 — 대표도 함께 비운다. 안 비우면 지운 영상이 계속 재생된다.
  await supabase
    .from('league_games')
    .update({
      youtube_url: rep?.url ?? null,
      youtube_start_offset: rep?.startOffset ?? 0,
    })
    .eq('id', gameId)
    .eq('league_id', leagueId)
}

// GET — 이 경기의 쿼터 영상 전부
export async function GET(req: Request, { params }: Ctx) {
  const { leagueId, gameId } = await params
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const supabase = createClient()
  const guard = await assertGame(supabase, leagueId, gameId)
  if (!guard.ok) return guard.res

  const { data, error } = await supabase
    .from('league_game_videos')
    .select('id, quarter, youtube_url, start_offset')
    .eq('league_game_id', gameId)
    .order('quarter', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// PUT — 한 쿼터의 영상을 저장(있으면 교체)
//   { quarter: 1~6, youtube_url: string, start_offset?: number }
export async function PUT(req: Request, { params }: Ctx) {
  const { leagueId, gameId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const quarter = Number(body?.quarter)
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > MAX_QUARTER) {
    return NextResponse.json({ error: `쿼터는 1~${MAX_QUARTER} 사이여야 합니다` }, { status: 400 })
  }

  // 붙여넣은 값에서 영상 ID 를 뽑아 **정규화된 URL 로만** 저장한다.
  //   재생목록·타임코드 같은 꼬리 파라미터가 남으면 플레이어가 다른 영상을 열거나
  //   시작 지점이 어긋난다. "이미 다른 쿼터에 붙은 영상인가" 판정도 ID 비교라야 정확하다.
  const raw = typeof body?.youtube_url === 'string' ? body.youtube_url.trim() : ''
  const videoId = extractYouTubeId(raw) ?? (/^[\w-]{11}$/.test(raw) ? raw : null)
  if (!videoId) {
    return NextResponse.json(
      { error: 'YouTube 링크를 알아볼 수 없습니다', description: 'youtube.com/watch?v=… · youtu.be/… 또는 영상 ID 11자리' },
      { status: 400 },
    )
  }

  const startOffset = Number.isFinite(Number(body?.start_offset)) ? Math.max(0, Math.trunc(Number(body.start_offset))) : 0

  const supabase = createClient()
  const guard = await assertGame(supabase, leagueId, gameId)
  if (!guard.ok) return guard.res

  const { data, error } = await supabase
    .from('league_game_videos')
    .upsert({
      league_game_id: gameId,
      quarter,
      youtube_url: `https://www.youtube.com/watch?v=${videoId}`,
      start_offset: startOffset,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'league_game_id,quarter' })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await syncRepresentative(supabase, leagueId, gameId)

  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  return NextResponse.json(data)
}

// DELETE ?quarter=N — 그 쿼터 영상만 뗀다
export async function DELETE(req: Request, { params }: Ctx) {
  const { leagueId, gameId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const quarter = Number(searchParams.get('quarter'))
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > MAX_QUARTER) {
    return NextResponse.json({ error: 'quarter 는 1~6 사이여야 합니다' }, { status: 400 })
  }

  const supabase = createClient()
  const guard = await assertGame(supabase, leagueId, gameId)
  if (!guard.ok) return guard.res

  // 성공 판정은 반환 행 수로 — PostgREST 는 RLS 에 막혀도 204 를 준다.
  const { data: removed, error } = await supabase
    .from('league_game_videos')
    .delete()
    .eq('league_game_id', gameId)
    .eq('quarter', quarter)
    .select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!removed || removed.length === 0) {
    return NextResponse.json({ error: '그 쿼터에 연결된 영상이 없습니다' }, { status: 404 })
  }

  await syncRepresentative(supabase, leagueId, gameId)

  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  return NextResponse.json({ success: true })
}
