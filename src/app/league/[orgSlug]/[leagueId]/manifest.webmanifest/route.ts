// 리그별 PWA 매니페스트 — GET /league/[orgSlug]/[leagueId]/manifest.webmanifest
//
// 루트 매니페스트(`src/app/manifest.ts`)와 **start_url·name·short_name 만** 다르다.
// 아이콘·색·display 는 `@/lib/pwa/appShell` 한 곳에서 공유한다(갈라지면 설치 경로에 따라
// 아이콘이 달라지는 사고가 난다).
//
// 이 라우트가 존재하는 이유는 `@/lib/pwa/leagueApp` 상단 주석 참조
// (요약: iOS 설치형 웹앱은 사파리와 저장소가 분리돼 localStorage 기반 복귀가 원리적으로 불가능 →
//  설치 시점의 start_url 로 해결해야 한다).

import { NextResponse } from 'next/server'
import type { MetadataRoute } from 'next'
import { PWA_GROUND_COLOR, PWA_ICONS } from '@/lib/pwa/appShell'
import { resolveLeagueAppIdentity } from '@/lib/pwa/leagueApp'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgSlug: string; leagueId: string }> },
) {
  const { leagueId } = await params
  const identity = await resolveLeagueAppIdentity(leagueId)
  if (!identity) {
    return NextResponse.json({ error: 'league not found' }, { status: 404 })
  }

  const manifest: MetadataRoute.Manifest = {
    // id 를 start_url 과 같은 경로로 고정 → 동호회마다 별개의 설치본으로 인식된다.
    // (생략해도 기본값이 start_url 이지만, 나중에 start_url 을 손대도 설치본 정체성이
    //  유지되도록 명시한다 — 바뀌면 사용자 기기에서 '다른 앱'이 되어 재설치를 요구한다.)
    id: identity.base,
    name: identity.name,
    short_name: identity.shortName,
    description: '동호회 농구 스탯 · 경기 기록 플랫폼',
    start_url: identity.base,
    // ⚠ scope 는 루트로 둔다. 기본값은 start_url 의 디렉터리(= 그 리그 하위)라서, 그대로 두면
    //   리그 밖 링크(대문·레거시 대회 트리 등)를 눌렀을 때 설치본을 벗어나 브라우저로 튕긴다.
    //   루트 매니페스트도 scope 미지정 = '/' 이므로 기존 동작과 동일하게 맞춘 것.
    scope: '/',
    display: 'standalone',
    background_color: PWA_GROUND_COLOR,
    theme_color: PWA_GROUND_COLOR,
    orientation: 'portrait',
    icons: PWA_ICONS,
  }

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      // 비공개 리그는 세션 유무로 이름이 달라진다 → 공용 CDN 캐시 금지(private).
      'Cache-Control': 'private, max-age=0, must-revalidate',
    },
  })
}
