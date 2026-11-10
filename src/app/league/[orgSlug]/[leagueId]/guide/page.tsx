import fs from 'node:fs'
import path from 'node:path'
import { isLeaguePrivateGated } from '@/lib/auth/guard'
import GuideContent from '@/components/league/guide/GuideContent'

// 회원용 이용 가이드 (2026-11-10 운영진) — 본문 정본은 lib/guide/memberGuide.ts, 그리기는 GuideContent.
//   그림은 public/guide/*.png 가 있을 때만 그린다(아직 안 찍은 장은 글만).
export const metadata = { title: '온볼 — 이용 가이드' }

function guideImages(): string[] {
  try {
    return fs.readdirSync(path.join(process.cwd(), 'public', 'guide')).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4))
  } catch { return [] }
}

export default async function GuidePage({ params }: { params: Promise<{ orgSlug: string; leagueId: string }> }) {
  const { leagueId } = await params
  if (await isLeaguePrivateGated(leagueId)) return null
  return <GuideContent images={guideImages()} />
}
