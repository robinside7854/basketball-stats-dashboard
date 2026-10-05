import type { Metadata } from 'next'
import { Suspense } from 'react'
import BoxScoreClient from './BoxScoreClient'
import { loadShareInfo, shareTitle, shareDescription } from '@/lib/og/teamBoxscoreShare'

// 박스스코어 공유 링크 (2026-10-05)
//   ?t=<대회id>&g=<경기id>     → 그 경기를 펼친 채로 연다
//   ?t=<대회id>&view=season    → 그 대회의 「대회 전체」 보기로 연다
// 화면은 종전 그대로 클라이언트 컴포넌트(BoxScoreClient)이고, 이 파일은 링크 미리보기
// (og 제목·설명·카드 이미지)만 맡는다. 공개 팀이 아니면 루트의 온볼 기본값을 그대로 상속한다.

type Params = { org: string; team: string }
type SP = Record<string, string | string[] | undefined>

const one = (v: string | string[] | undefined) => (typeof v === 'string' && v ? v : undefined)

export async function generateMetadata({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<SP> }): Promise<Metadata> {
  const { org, team } = await params
  const sp = await searchParams
  const t = one(sp.t)
  const g = one(sp.g)
  const info = await loadShareInfo(org, team, t, g)
  if (!info || !t) return {}

  const title = shareTitle(info)
  const description = shareDescription(info)
  const q = new URLSearchParams({ org, team, t })
  if (info.kind === 'game' && g) q.set('g', g)
  const image = { url: `/api/og/team-boxscore?${q}`, width: 1200, height: 630, alt: title }
  return {
    title,
    description,
    openGraph: { title, description, images: [image] },
    twitter: { card: 'summary_large_image', title, description, images: [image.url] },
  }
}

export default function BoxScorePage() {
  // useSearchParams 를 쓰는 클라이언트 컴포넌트는 Suspense 경계가 있어야 빌드가 통과한다
  return (
    <Suspense fallback={null}>
      <BoxScoreClient />
    </Suspense>
  )
}
