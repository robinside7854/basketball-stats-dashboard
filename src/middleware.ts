import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'

// UUID v4 정규식 (URL 세그먼트가 UUID 인지 판정용)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 리그 slug ↔ UUID 매핑 in-memory 캐시 (10분 TTL)
// 미들웨어 인스턴스마다 별도 (콜드스타트 시 리셋) — 리그는 거의 안 바뀌므로 충분
type CacheEntry = { value: string; expiresAt: number }
const CACHE_TTL_MS = 10 * 60 * 1000
const uuidToSlugCache = new Map<string, CacheEntry>()  // key: `${orgSlug}:${uuid}` → slug
const slugToUuidCache = new Map<string, CacheEntry>()  // key: `${orgSlug}:${slug}` → uuid

function getCached(cache: Map<string, CacheEntry>, key: string): string | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { cache.delete(key); return null }
  return entry.value
}

function setCached(cache: Map<string, CacheEntry>, key: string, value: string): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
}

async function fetchLeagueBy(field: 'id' | 'slug', orgSlug: string, value: string): Promise<{ id: string; slug: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  try {
    const q = field === 'id'
      ? `id=eq.${encodeURIComponent(value)}`
      : `org_slug=eq.${encodeURIComponent(orgSlug)}&slug=eq.${encodeURIComponent(value)}`
    // Edge middleware — Next.js 데이터 캐시 옵션 (next.revalidate) 사용 불가.
    // 대신 in-memory 캐시로만 최적화.
    const resp = await fetch(`${url}/rest/v1/leagues?${q}&select=id,slug`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
    if (!resp.ok) return null
    const rows = await resp.json() as Array<{ id: string; slug: string }>
    return rows[0] ?? null
  } catch { return null }
}

// UUID → slug 조회 (redirect 대상 결정용)
async function lookupSlugForUuid(orgSlug: string, uuid: string): Promise<string | null> {
  const cacheKey = `${orgSlug}:${uuid}`
  const cached = getCached(uuidToSlugCache, cacheKey)
  if (cached) return cached
  const row = await fetchLeagueBy('id', orgSlug, uuid)
  if (row?.slug) { setCached(uuidToSlugCache, cacheKey, row.slug); return row.slug }
  return null
}

// slug → UUID 조회 (rewrite 대상 결정용)
async function lookupUuidForSlug(orgSlug: string, slug: string): Promise<string | null> {
  const cacheKey = `${orgSlug}:${slug}`
  const cached = getCached(slugToUuidCache, cacheKey)
  if (cached) return cached
  const row = await fetchLeagueBy('slug', orgSlug, slug)
  if (row?.id) { setCached(slugToUuidCache, cacheKey, row.id); return row.id }
  return null
}

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

  // /league/:orgSlug/:leagueIdOrSlug/* URL 처리
  // - UUID 세그먼트 → 301 redirect to slug URL (bookmarks 자동 clean-up)
  // - slug 세그먼트 → internal rewrite to UUID URL (downstream 코드 변경 없이)
  //
  // Debug 헤더:
  //   x-mw-league: 'uuid-redirect' | 'slug-rewrite' | 'uuid-no-slug' | 'slug-no-uuid' | 'not-league-url'
  //   (브라우저 DevTools > Network 탭에서 응답 헤더로 확인 가능)
  const leagueMatch = pathname.match(/^\/league\/([^/]+)\/([^/]+)(\/.*)?$/)
  if (leagueMatch) {
    const [, orgSlug, leagueIdOrSlug, rest = ''] = leagueMatch
    if (UUID_RE.test(leagueIdOrSlug)) {
      // UUID → 예쁜 slug URL 로 redirect
      const slug = await lookupSlugForUuid(orgSlug, leagueIdOrSlug)
      if (slug) {
        const redirectResp = NextResponse.redirect(
          new URL(`/league/${orgSlug}/${slug}${rest}${request.nextUrl.search}`, request.url),
          { status: 301 },
        )
        redirectResp.headers.set('x-mw-league', 'uuid-redirect')
        return redirectResp
      }
      // slug 없으면 그대로 진행 (기존 동작) — 왜 실패했는지 헤더로 노출
      const passResp = NextResponse.next()
      passResp.headers.set('x-mw-league', 'uuid-no-slug')
      return passResp
    } else {
      // slug → UUID 로 internal rewrite (URL 은 slug 유지)
      const uuid = await lookupUuidForSlug(orgSlug, leagueIdOrSlug)
      if (uuid) {
        const url = request.nextUrl.clone()
        url.pathname = `/league/${orgSlug}/${uuid}${rest}`
        const rewriteResp = NextResponse.rewrite(url)
        rewriteResp.headers.set('x-mw-league', 'slug-rewrite')
        return rewriteResp
      }
      // 매칭 실패 시 404 페이지 자연스럽게 노출 (rewrite 안 함)
      const passResp = NextResponse.next()
      passResp.headers.set('x-mw-league', 'slug-no-uuid')
      return passResp
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
    '/league/:path*',
  ],
}
