// GET /h/{code} — 짧은 코드 → 307 redirect to target
// 클릭 카운트 증가 (fire-and-forget, 실패해도 리다이렉트 정상 진행)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { siteUrl } from '@/lib/siteUrl'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params
  if (!code || !/^[a-z0-9]{4,12}$/.test(code)) {
    return new NextResponse('Not Found', { status: 404 })
  }

  const supabase = createClient()
  const { data: row } = await supabase
    .from('short_urls')
    .select('target, clicks')
    .eq('code', code)
    .maybeSingle()

  if (!row?.target) {
    return new NextResponse('Not Found', { status: 404 })
  }

  // 클릭 카운트 증가 (fire-and-forget · 리다이렉트 딜레이 최소화)
  //   ※ Postgres 원자적 증가는 RPC 로 처리 가능하나 v1 은 read-then-write
  //   경합 시 소수 유실 허용 (통계 지표라 정확성보다 응답성 우선)
  void supabase
    .from('short_urls')
    .update({ clicks: (row.clicks ?? 0) + 1 })
    .eq('code', code)

  // 이 사이트 밖으로는 절대 보내지 않는다 (2026-08-08).
  //   생성 쪽(POST /api/short-url)에서 이미 동일 출처만 받지만, 여기서 한 번 더 본다:
  //   ① 그 검사가 생기기 전에 저장된 행 ② DB 를 직접 건드린 경우 ③ 앞으로 생길 우회
  //   어느 쪽이든 리다이렉트가 최종 관문이므로 여기서 막으면 피싱으로 이어지지 않는다.
  const target = row.target as string
  let dest: URL
  try {
    dest = new URL(target, req.url)
  } catch {
    return new NextResponse('Not Found', { status: 404 })
  }
  if (dest.protocol !== 'https:' && dest.protocol !== 'http:') {
    return new NextResponse('Not Found', { status: 404 })
  }
  const allowed = new Set([new URL(req.url).origin])
  try {
    allowed.add(new URL(siteUrl()).origin)
  } catch { /* siteUrl 이 깨져 있어도 요청 origin 은 남는다 */ }
  if (!allowed.has(dest.origin)) {
    // 외부 타깃은 저장돼 있어도 따라가지 않는다. 조사할 수 있게 로그만 남긴다.
    console.warn('[/h] 외부 타깃 리다이렉트 차단', { code, origin: dest.origin })
    return new NextResponse('Not Found', { status: 404 })
  }

  return NextResponse.redirect(dest.toString(), { status: 307 })
}
