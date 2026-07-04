import { ImageResponse } from 'next/og'
import { createClient } from '@/lib/supabase/admin'

// 팀별 링크 공유 카드 (1200x630) — /[org]/[team] 세그먼트 전용.
// app/opengraph-image.png(전역 정적)을 이 경로에서만 덮어씀.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = '농구 통계 대시보드'

// Tailwind 색상명(마이그레이션 기본값) → hex(500). accent_color 가 '#...' 이면 그대로 사용.
const COLOR_MAP: Record<string, string> = {
  blue: '#3b82f6',
  orange: '#f97316',
  red: '#ef4444',
  green: '#22c55e',
  amber: '#f59e0b',
  purple: '#a855f7',
  pink: '#ec4899',
  cyan: '#06b6d4',
  teal: '#14b8a6',
  indigo: '#6366f1',
  emerald: '#10b981',
  rose: '#f43f5e',
  yellow: '#eab308',
  sky: '#0ea5e9',
}

function resolveAccent(raw: string | null | undefined): string {
  if (!raw) return '#3b82f6'
  const v = raw.trim()
  if (v.startsWith('#')) return v
  return COLOR_MAP[v.toLowerCase()] ?? '#3b82f6'
}

// Google Fonts 에서 text 에 포함된 글자만 서브셋으로 받아온다(한글 렌더링용).
// 구형 User-Agent 로 요청해 woff2 대신 truetype 을 받는다(satori 는 woff2 미지원).
async function loadKoreanFont(text: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const url = `https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@${weight}&text=${encodeURIComponent(text)}`
    const cssRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; rv:1.9)' },
    })
    if (!cssRes.ok) return null
    const css = await cssRes.text()
    const src = css.match(/src:\s*url\((.+?)\)\s*format\(['"](?:opentype|truetype)['"]\)/)
    if (!src) return null
    const fontRes = await fetch(src[1])
    if (!fontRes.ok) return null
    return await fontRes.arrayBuffer()
  } catch {
    return null
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ org: string; team: string }>
}) {
  const { org, team } = await params

  // 팀 정보 조회 (실패해도 폴백값으로 진행 — 절대 throw 하지 않음)
  let name = '농구 통계 대시보드'
  let accent = '#3b82f6'
  try {
    const supabase = createClient()
    const { data } = await supabase
      .from('teams')
      .select('name, accent_color')
      .eq('org_slug', org)
      .eq('sub_slug', team)
      .maybeSingle()
    if (data?.name) name = data.name
    accent = resolveAccent(data?.accent_color)
  } catch {
    // 폴백값 유지
  }

  const path = `/${org}/${team}`
  // 이름 길이에 따라 폰트 크기 조정 (긴 이름 오버플로 방지)
  const nameSize = name.length > 14 ? 76 : name.length > 9 ? 92 : 108

  // 카드에 쓰이는 모든 글자를 모아 한 번에 서브셋 요청
  const glyphs = Array.from(new Set((name + path + '농구 통계 대시보드 BASKETBALL STATS').split(''))).join('')
  const fontData = await loadKoreanFont(glyphs, 700)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#0a0e17',
          padding: '72px 80px',
          position: 'relative',
        }}
      >
        {/* 팀 색상 글로우 */}
        <div
          style={{
            position: 'absolute',
            top: -180,
            right: -120,
            width: 640,
            height: 640,
            borderRadius: '50%',
            background: accent,
            opacity: 0.28,
            filter: 'blur(40px)',
          }}
        />

        {/* 상단 라벨 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 20, height: 20, borderRadius: '50%', background: accent }} />
          <div
            style={{
              fontSize: 30,
              letterSpacing: 6,
              color: '#94a3b8',
              fontWeight: 700,
            }}
          >
            BASKETBALL STATS
          </div>
        </div>

        {/* 팀 이름 */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: nameSize,
              fontWeight: 700,
              color: '#ffffff',
              lineHeight: 1.1,
              letterSpacing: -1,
            }}
          >
            {name}
          </div>
          <div style={{ fontSize: 32, color: accent, marginTop: 20, fontWeight: 700 }}>
            {path}
          </div>
        </div>

        {/* 하단 강조 바 */}
        <div style={{ display: 'flex', width: '100%', height: 12, background: accent, borderRadius: 6 }} />
      </div>
    ),
    {
      ...size,
      fonts: fontData
        ? [{ name: 'Noto Sans KR', data: fontData, weight: 700, style: 'normal' }]
        : undefined,
    }
  )
}
