// POST /api/short-url — 원본 URL 을 짧은 코드로 축약
// Body:  { target: string, meta?: object }
// 응답:  { code: string, url: string }
//
// 규칙:
//   1) target 이 절대 URL(https?://) 이면 그대로 저장, 상대 경로(/...) 도 저장 허용
//      → 리다이렉트 시 상대 경로면 origin 붙여서 이동
//   2) 이미 같은 target 이 있으면 기존 code 재사용 (dedup)
//   3) 새 code = 6자 [a-z0-9] · 충돌 시 최대 5회 재시도

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'

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

function isValidTarget(t: unknown): t is string {
  if (typeof t !== 'string') return false
  if (t.length === 0 || t.length > 2048) return false
  // 상대 경로(/...) 또는 http(s) 절대 URL 만 허용
  if (t.startsWith('/')) return true
  return /^https?:\/\//i.test(t)
}

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const b = body as { target?: unknown; meta?: unknown }
  if (!isValidTarget(b.target)) {
    return NextResponse.json({ error: '유효하지 않은 target' }, { status: 400 })
  }
  const target = b.target
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
