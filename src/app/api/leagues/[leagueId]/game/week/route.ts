import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { createClient } from '@/lib/supabase/admin'
import { canViewStats } from '@/lib/auth/guard'
import { currentWindow, loadRsvpRules, loadRsvpBoard } from '@/lib/rsvp/weekly'
import { getCachedLeagueStats } from '@/lib/stats/cachedLeagueStats'

// GET /api/leagues/[leagueId]/game/week  — 미라클 매니저(게임 저장소) 전용, 읽기만. DB 쓰기·새 표 없음.
//   · 이번 주 참가신청(경기일 · 누가 참/불 · 정규/비정규/게스트)
//   · 지난 경기일 선수별 기록(판타지 점수 계산용 — 득점·리바·어시·스틸·블록·실책만)
//
// ⚠ game/roster 와 달리 미라클도 공개하지 않는다. 참가 명단은 「누가 언제 나오는지」라 회원 전용이다
//   (rsvp 라우트가 비로그인에게 명단을 안 주는 것과 같은 선). 그래서 열쇠(GAME_ROSTER_TOKEN) 또는 승인 회원만.
//   응답엔 사진·나이·키·티켓·포인트·게스트비가 없다 — 게임에 필요한 id·이름·구분·답·포지션뿐.
// 판정(정규/비정규/게스트, 이번 주 경기일)은 lib/rsvp/weekly.ts 정본을 그대로 쓴다 — 다시 쓰면 홈 카드와 사람 수가 갈린다.

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'x-game-token' }

function tokenOk(req: Request): boolean {
  const want = process.env.GAME_ROSTER_TOKEN
  const got = req.headers.get('x-game-token') ?? new URL(req.url).searchParams.get('t')
  if (!want || !got || want.length !== got.length) return false
  return timingSafeEqual(Buffer.from(want), Buffer.from(got))
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(req: Request, { params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params
  if (!tokenOk(req) && !(await canViewStats(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401, headers: CORS })
  }
  try {
    const sb = createClient()
    const rules = await loadRsvpRules(sb, leagueId)
    const win = rules ? currentWindow(rules) : null
    const board = win ? await loadRsvpBoard(sb, leagueId, win.gameDate) : null

    // 지난 경기일 — 마감된 정규전이 있는 가장 최근 날짜(친선전은 집계 제외 규칙과 같게 뺀다)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
    const { data: lastGame } = await sb.from('league_games').select('date')
      .eq('league_id', leagueId).eq('is_complete', true).eq('is_exhibition', false).lte('date', today)
      .order('date', { ascending: false }).limit(1).maybeSingle()
    const lastDate = (lastGame as { date?: string } | null)?.date ?? null
    const stats = lastDate ? await getCachedLeagueStats(leagueId, { unit: 'round', from: lastDate, to: lastDate }) : null

    return NextResponse.json({
      gameDate: win?.gameDate ?? null,
      phase: win?.phase ?? null,
      signups: (board?.entries ?? []).map(e => ({ id: e.player_id, name: e.name, kind: e.kind, answer: e.answer, pos: e.position })),
      last: stats && lastDate ? {
        date: lastDate,
        lines: [...stats.players, ...(stats.guests ?? [])].map(p => ({ id: p.player_id, pts: p.pts, reb: p.reb, ast: p.ast, stl: p.stl, blk: p.blk, tov: p.tov })),
      } : null,
    }, { headers: { ...CORS, 'Cache-Control': 'private, no-store' } })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500, headers: CORS })
  }
}
