import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (pathname === '/youth' || pathname.startsWith('/youth/')) {
    const rest = pathname.slice('/youth'.length)
    return NextResponse.redirect(new URL(`/paranalgae/youth${rest}`, request.url), { status: 301 })
  }

  if (pathname === '/senior' || pathname.startsWith('/senior/')) {
    const rest = pathname.slice('/senior'.length)
    return NextResponse.redirect(new URL(`/paranalgae/senior${rest}`, request.url), { status: 301 })
  }
}

export const config = {
  matcher: ['/youth', '/youth/:path*', '/senior', '/senior/:path*'],
}
