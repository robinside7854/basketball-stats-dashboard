import { createServerClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const playerId = formData.get('playerId') as string

  if (!file || !playerId) return NextResponse.json({ error: 'Missing file or playerId' }, { status: 400 })

  const supabase = createServerClient()
  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${playerId}.${ext}`

  const arrayBuffer = await file.arrayBuffer()
  const { error } = await supabase.storage.from('player-photos').upload(path, arrayBuffer, {
    contentType: file.type,
    upsert: true,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: { publicUrl } } = supabase.storage.from('player-photos').getPublicUrl(path)
  const urlWithBust = `${publicUrl}?t=${Date.now()}`

  // players 테이블 photo_url 업데이트
  await supabase.from('players').update({ photo_url: urlWithBust }).eq('id', playerId)

  return NextResponse.json({ url: urlWithBust })
}
