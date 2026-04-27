import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

// POST /api/leagues/[leagueId]/players/[playerId]/photo
// 리그 선수 프로필 사진 업로드 (Supabase Storage player-photos 버킷 사용)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; playerId: string }> }
) {
  const { leagueId, playerId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

  const { error: updateErr } = await supabase
    .from('league_players')
    .update({ photo_url: urlWithBust })
    .eq('id', playerId)
    .eq('league_id', leagueId)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })
  return NextResponse.json({ url: urlWithBust })
}
