// GET  /api/leagues/[leagueId]/announcements/[announcementId]/comments — 댓글 목록
// POST /api/leagues/[leagueId]/announcements/[announcementId]/comments — 댓글 작성 (nickname/body/password)
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { hashPassword, isValidPassword } from '@/lib/announcements/commentAuth'
import { canViewLeague } from '@/lib/auth/guard'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; announcementId: string }> },
) {
  const { leagueId, announcementId } = await params
  // 팀 비공개 전환 시 화면만 막으면 API 로 뚫린다 — 데이터 계층에서 재확인
  if (!(await canViewLeague(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const sb = createClient()

  // 공지가 이 리그 소속인지 검증
  const { data: ann } = await sb
    .from('league_announcements')
    .select('id')
    .eq('id', announcementId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!ann) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data, error } = await sb
    .from('league_announcement_comments')
    .select('id, nickname, body, created_at, updated_at, deleted_at, deleted_by_admin')
    .eq('announcement_id', announcementId)
    .order('created_at', { ascending: true })
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // soft-deleted 댓글은 nickname/body 마스킹
  const comments = (data ?? []).map(c => {
    if (c.deleted_at) {
      return {
        ...c,
        nickname: c.deleted_by_admin ? '(관리자에 의해 삭제)' : '(삭제됨)',
        body: c.deleted_by_admin ? '이 댓글은 관리자에 의해 삭제되었습니다.' : '삭제된 댓글입니다.',
      }
    }
    return c
  })
  return NextResponse.json({ comments })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; announcementId: string }> },
) {
  const { leagueId, announcementId } = await params
  let body: { nickname?: unknown; body?: unknown; password?: unknown }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'invalid json' }, { status: 400 }) }

  const nickname = typeof body.nickname === 'string' ? body.nickname.trim().slice(0, 20) : ''
  const bodyText = typeof body.body === 'string' ? body.body.trim().slice(0, 500) : ''

  if (!nickname) return NextResponse.json({ error: '닉네임을 입력하세요' }, { status: 400 })
  if (!bodyText) return NextResponse.json({ error: '댓글 내용을 입력하세요' }, { status: 400 })
  if (!isValidPassword(body.password)) {
    return NextResponse.json({ error: '비밀번호는 숫자 4자리로 입력하세요' }, { status: 400 })
  }

  const sb = createClient()
  const { data: ann } = await sb
    .from('league_announcements')
    .select('id')
    .eq('id', announcementId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (!ann) return NextResponse.json({ error: 'announcement not found' }, { status: 404 })

  const { salt, hash } = hashPassword(body.password as string)
  const { data, error } = await sb
    .from('league_announcement_comments')
    .insert({
      announcement_id: announcementId,
      nickname, body: bodyText,
      password_salt: salt, password_hash: hash,
    })
    .select('id, nickname, body, created_at, updated_at, deleted_at, deleted_by_admin')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ comment: data })
}
