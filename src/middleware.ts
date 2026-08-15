import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
// NOTE: `@/lib/auth` (next-auth v5) 는 Edge runtime 호환성 이슈로 top-level import 금지.
// 필요 시 admin 경로 블록 내에서 dynamic import 로 로드.

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
  //   requireCeoSession() 은 next-auth v5 를 감싼 fail-closed 가드 · dynamic import 로
  //   Edge runtime top-level 크래시 회피(기존 auth() 때와 동일한 제약).
  //   이 계층은 UX 용 리다이렉트일 뿐 — 진짜 보안 경계는 layout.tsx(getRequireCeoSession)와
  //   각 API 라우트다. 여기서 판정이 흔들려도(예: Edge 에서 env 인식이 실패해 항상 거부되는
  //   방향으로 어긋나는 경우) 그 아래 계층이 fail-closed 이므로 뚫리지 않는다.
  //   초대 수락·접근 요청 화면은 아직 계정이 없는 사람이 여는 곳이라 로그인 검사에서 뺀다
  //   (토큰 자체가 인증이거나, 아예 인증이 필요 없는 창구다).
  //   비밀번호 재설정도 같은 부류다 — 비밀번호를 잊어 로그인을 못 하는 사람이 여는 화면이라
  //   로그인 검사를 통과할 수가 없다(인증은 URL 의 토큰이 한다).
  const ADMIN_PUBLIC = ['/admin/login', '/admin/invite', '/admin/request-access', '/admin/reset-password']
  const isAdminPublic = ADMIN_PUBLIC.some((p) => pathname.startsWith(p))
  if (pathname.startsWith('/admin') && !isAdminPublic) {
    //   여기서는 DB 왕복이 없는 shallow 판정을 쓴다 — 미들웨어는 모든 /admin 요청마다 돌기
    //   때문. 계정이 실제로 살아있는지는 layout.tsx 와 각 API 라우트의 requireCeoSession()이
    //   DB 로 확인한다(그쪽이 진짜 경계다).
    const { requireCeoSessionShallow } = await import('@/lib/auth/ceo')
    const session = await requireCeoSessionShallow()
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
  // Node.js 런타임 (Next 16). 기본 Edge 런타임에서는 next-auth 체인이 node:crypto 를
  // 끌고 들어와 런타임에 죽는다 — 빌드는 warning 으로 통과하기 때문에 더 위험하다.
  //   실측(2026-08-14): 공동관리자 체계를 붙이며 ceo.ts 가 platformAdmin.ts(pbkdf2·sha256)를
  //   참조하게 되자 /admin 콘솔 전체가 500. "Failed to load external module node:crypto".
  // 이 미들웨어는 어차피 slug→UUID 매핑을 위해 Supabase REST 를 호출하므로 Edge 여야 할
  // 이유가 없다. 런타임을 Node 로 고정해 이 부류의 문제를 통째로 없앤다.
  runtime: 'nodejs',
  matcher: [
    '/youth',
    '/youth/:path*',
    '/senior',
    '/senior/:path*',
    '/admin/:path*',
    '/league/:path*',
  ],
}
