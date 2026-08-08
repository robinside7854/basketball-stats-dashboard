// POST /api/short-url — 원본 URL 을 짧은 코드로 축약
// Body:  { target: string, meta?: object }
// 응답:  { code: string, url: string }
//
// 규칙:
//   1) target 은 **이 사이트 안의 주소만** 허용한다 (2026-08-08 오픈 리다이렉트 차단).
//      상대 경로로 정규화해 저장하므로 도메인이 바뀌어도 링크가 따라온다.
//   2) 이미 같은 target 이 있으면 기존 code 재사용 (dedup)
//   3) 새 code = 6자 [a-z0-9] · 충돌 시 최대 5회 재시도
//
// ⚠ 왜 외부 주소를 막는가: 이 엔드포인트는 무인증이라, 외부 URL 을 허용하면 누구나
//    "온볼 주소로 보이지만 남의 사이트로 보내는" 링크를 찍어낼 수 있다(오픈 리다이렉트).
//    피싱에 그대로 쓰인다. 실제 호출자 4곳은 전부 window.location.href 만 넘기므로
//    동일 출처 제한으로 잃는 기능이 없다.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { siteUrl } from '@/lib/siteUrl'

// URL-safe alphabet · 혼동 문자(0/O, 1/l) 배제
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'
const CODE_LEN = 6

function generateCode(): string {
  let s = ''
  const bytes = new Uint8Array(CODE_LEN)
  crypto.getRandomValues(bytes)
  for (let i = 0; i < CODE_LEN; i++) {
    s += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return s
}

// 이 사이트 안의 주소인지 확인하고, 상대 경로로 정규화해서 돌려준다. 아니면 null.
//
// 문자열 접두사 검사(startsWith('/'))로는 못 막는 우회가 여럿이라 URL 파서로 해석한 뒤
// **최종 origin** 을 대조한다. 이렇게 하면 아래가 전부 걸린다:
//   '//evil.com/x'      → https://evil.com/x   (프로토콜 상대 URL)
//   '/\\evil.com/x'     → https://evil.com/x   (WHATWG 는 특수 스킴에서 '\' 를 '/' 로 취급)
//   'https://evil.com'  → 외부 절대 URL
//   'javascript:...'    → 프로토콜 검사에서 탈락
export function resolveInternalTarget(raw: unknown, requestUrl: string): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.trim()
  if (t.length === 0 || t.length > 2048) return null

  let reqOrigin: string
  try {
    reqOrigin = new URL(requestUrl).origin
  } catch {
    return null
  }

  let resolved: URL
  try {
    resolved = new URL(t, reqOrigin)
  } catch {
    return null
  }
  if (resolved.protocol !== 'https:' && resolved.protocol !== 'http:') return null

  // 요청이 들어온 origin 과 공개 주소(siteUrl) 둘 다 허용 — 도메인 이전 중이라
  // 두 주소가 동시에 살아 있는 기간이 있다 (src/lib/siteUrl.ts 주석 참조).
  const allowed = new Set([reqOrigin])
  try {
    allowed.add(new URL(siteUrl()).origin)
  } catch { /* siteUrl 이 깨져 있어도 요청 origin 은 남는다 */ }
  if (!allowed.has(resolved.origin)) return null

  // 상대 경로로 저장 — 리다이렉트가 항상 현재 origin 기준으로 풀리므로
  // 도메인이 바뀌어도 기존 짧은 링크가 그대로 살아 있다.
  return `${resolved.pathname}${resolved.search}${resolved.hash}`
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const b = body as { target?: unknown; meta?: unknown }
  const target = resolveInternalTarget(b.target, req.url)
  if (!target) {
    // 외부 주소인지 형식 오류인지 구분해서 알려주지 않는다 — 공격자에게 탐색 힌트가 된다.
    return NextResponse.json({ error: '유효하지 않은 target' }, { status: 400 })
  }
  const meta = (b.meta && typeof b.meta === 'object') ? b.meta : null

  const supabase = createClient()

  // 1) dedup — 같은 target 존재하면 기존 code 재사용
  const { data: existing } = await supabase
    .from('short_urls')
    .select('code')
    .eq('target', target)
    .limit(1)
    .maybeSingle()

  const origin = new URL(req.url).origin
  if (existing?.code) {
    return NextResponse.json({
      code: existing.code,
      url: `${origin}/h/${existing.code}`,
    })
  }

  // 2) 새 code 생성 — 충돌 대비 최대 5회 재시도
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode()
    const { error } = await supabase
      .from('short_urls')
      .insert({ code, target, meta })
    if (!error) {
      return NextResponse.json({
        code,
        url: `${origin}/h/${code}`,
      })
    }
    // PK 충돌(23505) 이면 재시도, 다른 에러면 즉시 종료
    const msg = error.message ?? ''
    if (!/duplicate|unique|23505/i.test(msg)) {
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }
  return NextResponse.json({ error: '코드 생성 실패 (충돌)' }, { status: 500 })
}
