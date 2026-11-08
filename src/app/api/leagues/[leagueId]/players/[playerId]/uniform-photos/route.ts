// POST /api/leagues/[leagueId]/players/[playerId]/uniform-photos — 유니폼 색별 프로필 사진 네 벌 올리기 (121)
//
// multipart: yellow · white · black · gray (이미지 파일, 하나 이상). ?apply=1 이면 올린 뒤 그 달 사진으로 바로 맞춘다.
// 인가: 운영진(canEditLeague) 또는 1회용 업로드 비밀번호(헤더 x-upload-token — league_upload_tokens 에 해시·기한).
//   비밀번호는 사진을 일괄로 만들어 올릴 때만 잠깐 만들고 지운다. service_role 같은 만능 열쇠를 넘기지 않으려는 통로다.
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/admin'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { resolveTeamId } from '@/lib/league/teamScope'
import { applyMonthlyPhotos, type PhotoColor, type UniformPhotos } from '@/lib/league/uniformPhoto'

const COLORS: PhotoColor[] = ['yellow', 'white', 'black', 'gray']
const MAX_BYTES = 3 * 1024 * 1024

async function tokenOk(leagueId: string, token: string | null): Promise<boolean> {
  if (!token || token.length < 32) return false
  const hash = createHash('sha256').update(token).digest('hex')
  const { data } = await createClient().from('league_upload_tokens')
    .select('league_id, expires_at').eq('token_hash', hash).maybeSingle()
  return !!data && data.league_id === leagueId && new Date(data.expires_at).getTime() > Date.now()
}

export async function POST(req: Request, { params }: { params: Promise<{ leagueId: string; playerId: string }> }) {
  const { leagueId, playerId } = await params
  if (!(await canEditLeague(req, leagueId)) && !(await tokenOk(leagueId, req.headers.get('x-upload-token')))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const sb = createClient()
  const teamId = await resolveTeamId(leagueId)
  const { data: player } = await sb.from('league_players').select('id, uniform_photos').eq('id', playerId).eq('team_id', teamId).maybeSingle()
  if (!player) return NextResponse.json({ error: '선수를 찾을 수 없습니다' }, { status: 404 })

  const form = await req.formData()
  const next: UniformPhotos = { ...((player.uniform_photos as UniformPhotos | null) ?? {}) }
  const v = Date.now()
  let saved = 0
  for (const c of COLORS) {
    const f = form.get(c)
    if (!(f instanceof File)) continue
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > MAX_BYTES) {
      return NextResponse.json({ error: `${c}: jpg·png·webp 3MB 이하만` }, { status: 400 })
    }
    const ext = f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `uniform/${leagueId}/${playerId}_${c}.${ext}`
    const { error } = await sb.storage.from('player-photos').upload(path, await f.arrayBuffer(), { contentType: f.type, upsert: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    next[c] = `${sb.storage.from('player-photos').getPublicUrl(path).data.publicUrl}?v=${v}`
    saved++
  }
  if (saved === 0) return NextResponse.json({ error: '사진이 없습니다' }, { status: 400 })

  const { error: upErr } = await sb.from('league_players').update({ uniform_photos: next }).eq('id', playerId)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  let applied: { changed: number; checked: number } | null = null
  if (new URL(req.url).searchParams.get('apply') === '1') {
    applied = await applyMonthlyPhotos(sb, leagueId)
    revalidateTag(`league-${leagueId}`, 'max')
  }
  return NextResponse.json({ ok: true, saved, uniform_photos: next, applied })
}
