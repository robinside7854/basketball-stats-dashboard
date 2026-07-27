// GET  /api/leagues/[leagueId]/announcements — 공지 목록 (핀 우선 · 최신순)
// POST /api/leagues/[leagueId]/announcements — 공지 생성 (X-League-Pin 필요)
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/admin'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'
import { isPushConfigured } from '@/lib/push/config'
import { sendLeaguePush } from '@/lib/push/send'

// 마크다운/HTML 본문 → 알림용 짧은 요약 텍스트
function summarizeForPush(src: string, maxLen = 120): string {
  const t = src
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_`>]/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return t.length > maxLen ? t.slice(0, maxLen) + '…' : t
}

const MAX_TITLE = 200
const MAX_BODY = 20_000
const MAX_CREATED_BY = 40

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const sb = createClient()
  const { data, error } = await sb
    .from('league_announcements')
    .select('id, title, body_markdown, pinned, published_at, created_by, updated_at')
    .eq('league_id', leagueId)
    .order('pinned', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ announcements: data ?? [] })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!(await verifyLeaguePin(req, leagueId))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { title?: unknown; body_markdown?: unknown; pinned?: unknown; created_by?: unknown; notify?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const title = typeof body.title === 'string' ? body.title.trim().slice(0, MAX_TITLE) : ''
  const body_markdown = typeof body.body_markdown === 'string' ? body.body_markdown.slice(0, MAX_BODY) : ''
  const pinned = body.pinned === true
  const created_by = typeof body.created_by === 'string' ? body.created_by.trim().slice(0, MAX_CREATED_BY) || null : null
  const notify = body.notify === true

  if (!title) return NextResponse.json({ error: '제목은 필수입니다' }, { status: 400 })

  const sb = createClient()
  const { data, error } = await sb
    .from('league_announcements')
    .insert({ league_id: leagueId, title, body_markdown, pinned, created_by })
    .select('id, title, body_markdown, pinned, published_at, created_by, updated_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  revalidateTag(`league-${leagueId}-announcements`, 'max')

  // 발행 후 전체 푸시 알림 (요청 시 · best-effort — 실패해도 공지 발행은 성공)
  let push: { sent: number; total: number } | null = null
  if (notify && isPushConfigured()) {
    try {
      const { data: lg } = await sb
        .from('leagues')
        .select('org_slug, season_year')
        .eq('id', leagueId)
        .maybeSingle()
      const url = lg?.org_slug && lg?.season_year
        ? `/league/${lg.org_slug}/${lg.season_year}`
        : '/'
      const summary = summarizeForPush(body_markdown) || '새 공지가 등록되었습니다.'
      // 본문 첫 이미지를 히어로 배너로 자동 첨부 (HTML <img> 또는 마크다운 ![]())
      const imgMatch = body_markdown.match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i)
        ?? body_markdown.match(/!\[[^\]]*\]\(([^)\s]+)/)
      const image = imgMatch?.[1] && /^https?:\/\//.test(imgMatch[1]) ? imgMatch[1] : undefined
      const r = await sendLeaguePush(leagueId, { title: `📢 ${title}`, body: summary, url, tag: 'mm-announcement', image })
      push = { sent: r.sent, total: r.total }
    } catch {
      // 푸시 실패는 무시
    }
  }

  return NextResponse.json({ announcement: data, push })
}
