import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 레거시 URL 리다이렉트 (/youth → /paranalgae/youth)
  if (pathname === '/youth' || pathname.startsWith('/youth/')) {
    const rest = pathname.slice('/youth'.length)
    return NextResponse.redirect(new URL(`/paranalgae/youth${rest}`, request.url), { status: 301 })
  }
  if (pathname === '/senior' || pathname.startsWith('/senior/')) {
    const rest = pathname.slice('/senior'.length)
    return NextResponse.redirect(new URL(`/paranalgae/senior${rest}`, request.url), { status: 301 })
  }

  // 서브도메인 라우팅: admin.xxx.com → /admin/ 경로로 rewrite
  const host = request.headers.get('host') ?? ''
  const isAdminSubdomain = host.startsWith('admin.')
  if (isAdminSubdomain) {
    const rewrittenUrl = new URL(`/admin${pathname === '/' ? '' : pathname}`, request.url)
    return NextResponse.rewrite(rewrittenUrl)
  }

  // /admin/* 경로 보호 — 로그인 필요
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const session = await auth()
    if (!session) {
      return NextResponse.redirect(new URL('/admin/login', request.url))
    }
  }
}

export const config = {
  matcher: [
    '/youth',
    '/youth/:path*',
    '/senior',
    '/senior/:path*',
    '/admin/:path*',
  ],
}
