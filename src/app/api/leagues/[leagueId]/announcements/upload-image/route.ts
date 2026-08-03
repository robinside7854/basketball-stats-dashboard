// POST /api/leagues/[leagueId]/announcements/upload-image
// 공지 편집기에서 붙여넣기/드롭한 이미지를 Supabase Storage 에 업로드 → public URL 반환
// PIN 인증 필수 · multipart/form-data (file 필드)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { canEditLeague } from '@/lib/auth/leagueAdmin'

const BUCKET = 'announcement-images'
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
const MAX_BYTES = 5 * 1024 * 1024   // 5MB (버킷 제한과 동일)

function extFor(mime: string): string {
  switch (mime) {
    case 'image/png':  return 'png'
    case 'image/jpeg': return 'jpg'
    case 'image/webp': return 'webp'
    case 'image/gif':  return 'gif'
    default: return 'bin'
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!(await canEditLeague(req, leagueId))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'file field missing' }, { status: 400 })
  if (!ALLOWED.has(file.type)) return NextResponse.json({ error: `허용되지 않은 이미지 형식: ${file.type}` }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: '5MB 이하로 업로드해주세요' }, { status: 400 })

  const ext = extFor(file.type)
  const key = `${leagueId}/${Date.now()}-${crypto.randomUUID()}.${ext}`
  const arrayBuffer = await file.arrayBuffer()

  const sb = createClient()
  const { error: upErr } = await sb.storage
    .from(BUCKET)
    .upload(key, new Uint8Array(arrayBuffer), {
      contentType: file.type,
      cacheControl: '31536000',
      upsert: false,
    })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(key)
  return NextResponse.json({ url: pub.publicUrl, key })
}
