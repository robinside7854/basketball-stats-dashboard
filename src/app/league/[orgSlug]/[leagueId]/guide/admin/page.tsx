import fs from 'node:fs'
import path from 'node:path'
import { isLeaguePrivateGated } from '@/lib/auth/guard'
import AdminGuideClient from './AdminGuideClient'

// 어드민(팀 운영진)용 가이드 (2026-11-10 운영진) — 본문 정본 lib/guide/adminGuide.ts, 그리기는 회원 가이드와 같은 GuideContent.
//   어드민에게만 본문을 보인다(화면 표시 판단 — 운영 방법 안내라 비밀은 없지만 회원에게는 쓸모가 없다).
export const metadata = { title: '온볼 — 어드민 가이드' }

function guideImages(): string[] {
  try {
    return fs.readdirSync(path.join(process.cwd(), 'public', 'guide')).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4))
  } catch { return [] }
}

export default async function AdminGuidePage({ params }: { params: Promise<{ orgSlug: string; leagueId: string }> }) {
  const { leagueId } = await params
  if (await isLeaguePrivateGated(leagueId)) return null
  return <AdminGuideClient images={guideImages()} />
}
