import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/admin'
import BoxscoreContent from '@/components/league/BoxscoreContent'
import ShareLinkButton from '@/components/league/ShareLinkButton'

type Params = { orgSlug: string; leagueId: string; date: string }

// YYYY-MM-DD 유효성 (부드럽게)
function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00`)
  return !Number.isNaN(d.getTime())
}

function formatKorean(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { orgSlug, leagueId, date } = await params
  if (!isValidDate(date)) return { title: '박스스코어' }
  const supabase = createClient()
  const { data } = await supabase
    .from('leagues')
    .select('name')
    .eq('id', leagueId)
    .eq('org_slug', orgSlug)
    .single()
  const leagueName = (data?.name as string | undefined) ?? '리그'
  const title = `${formatKorean(date)} 박스스코어 — ${leagueName}`
  return { title, description: `${leagueName} · ${formatKorean(date)} 경기 박스스코어 (팀별 · 개인 스탯 · 팀 비교)` }
}

export default async function BoxscorePage({ params }: { params: Promise<Params> }) {
  const { orgSlug, leagueId, date } = await params
  if (!isValidDate(date)) notFound()

  // 리그 유효성 확인 + 이름 조회 (공유 이미지 헤더에 사용)
  const supabase = createClient()
  const { data: league } = await supabase
    .from('leagues')
    .select('name')
    .eq('id', leagueId)
    .eq('org_slug', orgSlug)
    .single()
  if (!league) notFound()
  // 멀티테넌트 전환(온볼): DB에 리그명이 없을 때 다른 클럽명으로 폴백하지 않고 중립 라벨 사용
  const leagueName = (league.name as string) ?? '리그'

  const backHref = `/league/${orgSlug}/${leagueId}/schedule`

  return (
    <div className="mm-brand space-y-4">
      {/* 페이지 헤더 — 뒤로가기 · 날짜 · 공유 링크 */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 md:px-8 py-4 sm:py-5"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
        }}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <Link
            href={backHref}
            aria-label="경기 일정으로 돌아가기"
            className="inline-flex items-center justify-center min-h-11 min-w-11 cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1 shrink-0"
            style={{ color: 'var(--mm-ink-soft)' }}
          >
            <ChevronLeft size={22} aria-hidden />
          </Link>
          <div className="min-w-0">
            <h1
              className="font-jersey font-black uppercase break-keep"
              style={{ color: 'var(--mm-ink)', fontSize: 'clamp(20px, 5vw, 28px)', letterSpacing: '-0.005em', lineHeight: 1.15 }}
            >
              {formatKorean(date)} 박스스코어
            </h1>
            <p
              className="text-[11px] sm:text-[12px] tracking-[0.16em] uppercase font-bold mt-1"
              style={{ color: 'var(--mm-muted)' }}
            >
              {leagueName}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <ShareLinkButton label="링크 복사" />
        </div>
      </div>

      {/* 콘텐츠 */}
      <BoxscoreContent leagueId={leagueId} date={date} leagueName={leagueName} />
    </div>
  )
}
