import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { resolveTeamId } from '@/lib/league/teamScope'

// POST /api/leagues/[leagueId]/players/[playerId]/photo
// 리그 선수 프로필 사진 업로드 (Supabase Storage player-photos 버킷 사용)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; playerId: string }> }
) {
  const { leagueId, playerId } = await params
  if (!await canEditLeague(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file is required' }, { status: 400 })

  const supabase = createClient()
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `league_${leagueId}_${playerId}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const { error: uploadErr } = await supabase.storage
    .from('player-photos')
    .upload(path, arrayBuffer, { contentType: file.type, upsert: true })

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('player-photos').getPublicUrl(path)
  const urlWithBust = `${publicUrl}?t=${Date.now()}`

  // 업로드된 원본은 photo_url + original_photo_url 양쪽에 동일 저장.
  // 이후 AI 생성 시 original_photo_url 만 입력으로 사용해 재생성 반복 시 품질 저하 방지.
  // 사진은 사람 단위 속성이라 팀 전체에서 공유된다 — team_id 로 소속을 확인한다.
  const teamId = await resolveTeamId(leagueId)
  const { error: updateErr } = await supabase
    .from('league_players')
    .update({ photo_url: urlWithBust, original_photo_url: urlWithBust })
    .eq('id', playerId)
    .eq('team_id', teamId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  return NextResponse.json({ url: urlWithBust })
}
