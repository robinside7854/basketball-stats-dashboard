import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { getCachedLeagueStatsMany } from '@/lib/stats/cachedLeagueStats'
import { getGameExtras } from '@/lib/game/extras'
import { buildGameRoster } from '@/lib/game/ratings'
import { canViewStats } from '@/lib/auth/guard'
import { createClient } from '@/lib/supabase/admin'

// GET /api/leagues/[leagueId]/game/roster?t=<열쇠>  — 미라클 후프스(게임 저장소) 전용, 읽기만.
// 숫자는 스탯 탭과 같은 캐시(getCachedLeagueStats) 한 번 읽기 → 능력치 식(lib/game/ratings.ts).
// 접근: 승인 회원·편집 권한, 또는 시험 기간 열쇠(환경변수 GAME_ROSTER_TOKEN — 새 표 없이).
//   ponytail: 열쇠 하나·기한 없음. 기한이 필요하면 league_upload_tokens 방식의 표로 옮긴다(사용자 확인 후).
// 게임은 다른 주소(별도 Vercel 프로젝트)에서 부르므로 CORS 를 연다 — 열쇠 없이는 401 이라 이름이 새지 않는다.

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
    // 시즌 전체 + 최근 4주(요즘 흐름) 를 캐시 한 번에(getCachedLeagueStatsMany). 4주 경계는 날짜 단위라 하루 한 번 키가 바뀐다
    const from = new Date(Date.now() - 28 * 864e5).toISOString().slice(0, 10)
    const [[{ players }, { players: recent }], extras] = await Promise.all([
      getCachedLeagueStatsMany(leagueId, [{ unit: 'round' }, { unit: 'round', from }]),
      getGameExtras(leagueId),
    ])
    // 키는 집계에 없어 선수 표에서 한 번 더 읽는다(읽기만)
    const { data: hs } = await createClient().from('league_players').select('id, height_cm, appearance').in('id', players.map(p => p.player_id))
    const heights = Object.fromEntries((hs ?? []).map(h => [h.id, h.height_cm as number | null]))
    // 외모(픽셀 캐릭터용, 프로필 사진에서 뽑은 특징 — 마이그레이션 137). 없으면 null → 게임 기본 캐릭터
    const looks = Object.fromEntries((hs ?? []).map(h => [h.id, (h as { appearance?: unknown }).appearance ?? null]))
    const teams = await currentQuarterTeams(leagueId)
    return NextResponse.json(
      { players: buildGameRoster(players, heights, extras, recent).map(c => ({ ...c, look: looks[c.id] ?? null, team: teams[c.id] ?? null })) },
      { headers: { ...CORS, 'Cache-Control': 'private, no-store' } },
    )
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500, headers: CORS })
  }
}

/**
 * 지금 분기(is_current, 없으면 가장 최근) 정규팀 소속 — 운영진 기준(2026-11-14): 4분기 정규팀으로 팀을 나누고 나머지는 비정규.
 * 팀 이름·색은 분기 덮어쓰기(league_team_quarter_overrides)가 있으면 그것을 쓴다(팀 탭과 같은 규칙).
 */
async function currentQuarterTeams(leagueId: string): Promise<Record<string, { id: string; name: string; color: string }>> {
  const sb = createClient()
  const { data: qs } = await sb.from('league_quarters').select('id, is_current, year, quarter')
    .eq('league_id', leagueId).order('year', { ascending: false }).order('quarter', { ascending: false })
  const q = (qs ?? []).find(x => x.is_current) ?? qs?.[0]
  if (!q) return {}
  const [{ data: rows }, { data: ovs }] = await Promise.all([
    sb.from('league_player_quarters').select('league_player_id, team_id, is_regular').eq('quarter_id', q.id).eq('is_regular', true),
    sb.from('league_team_quarter_overrides').select('team_id, name, color').eq('quarter_id', q.id),
  ])
  const ids = [...new Set((rows ?? []).map(r => r.team_id).filter(Boolean))] as string[]
  const { data: ts } = ids.length ? await sb.from('league_teams').select('id, name, color').in('id', ids) : { data: [] }
  const ov = Object.fromEntries((ovs ?? []).map(o => [o.team_id, o]))
  const team = Object.fromEntries((ts ?? []).map(t => [t.id, { id: t.id as string, name: (ov[t.id]?.name ?? t.name) as string, color: (ov[t.id]?.color ?? t.color ?? '#888888') as string }]))
  return Object.fromEntries((rows ?? []).filter(r => r.team_id && team[r.team_id]).map(r => [r.league_player_id, team[r.team_id]]))
}
