// GET /h/{code} — 짧은 코드 → 307 redirect to target
// 클릭 카운트 증가 (fire-and-forget, 실패해도 리다이렉트 정상 진행)

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'

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

  // 상대 경로면 origin 붙임
  const target = row.target as string
  const dest = target.startsWith('/')
    ? new URL(target, req.url).toString()
    : target

  return NextResponse.redirect(dest, { status: 307 })
}
