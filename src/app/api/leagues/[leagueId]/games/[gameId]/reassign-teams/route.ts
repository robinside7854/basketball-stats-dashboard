import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { logAudit } from '@/lib/audit'

/**
 * POST /api/leagues/[leagueId]/games/[gameId]/reassign-teams
 * body: { home_team_id, away_team_id }
 *
 * **기록이 시작·마감된 경기의 팀을 바꾼다.** 일반 팀 저장(`PATCH /games`)은 기록 전에만 쓴다.
 *
 * 왜 별도 라우트인가
 *   `league_game_events.team_id` 와 `league_game_players.team_id` 에 팀이 박혀 있다.
 *   경기의 home/away 만 바꾸면 그 이벤트들은 **더 이상 이 경기의 어느 팀도 아닌** 팀을 가리키고,
 *   박스스코어에서 그 선수들이 통째로 무소속이 된다(화면은 멀쩡해 보이고 점수만 사라진다).
 *   그래서 팀 교체는 반드시 기록 이관과 한 묶음이어야 한다.
 *
 * ⚠ 좌우가 통째로 뒤집히는 경우(홈↔어웨이 스왑)에는 저장된 스코어도 함께 뒤집는다.
 *   안 뒤집으면 팀만 바뀌고 점수는 그대로라 승패가 반대로 남는다.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; gameId: string }> },
) {
  const { leagueId, gameId } = await params
  if (!(await canEditLeague(req, leagueId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const nextHome: string | null = body?.home_team_id ?? null
  const nextAway: string | null = body?.away_team_id ?? null
  if (!nextHome || !nextAway) {
    return NextResponse.json({ error: '홈·어웨이 팀을 모두 지정하세요' }, { status: 400 })
  }
  if (nextHome === nextAway) {
    return NextResponse.json({ error: '같은 팀을 양쪽에 둘 수 없습니다' }, { status: 400 })
  }

  const supabase = createClient()

  const { data: game, error: gErr } = await supabase
    .from('league_games')
    .select('id, date, is_exhibition, home_team_id, away_team_id, home_score, away_score')
    .eq('id', gameId)
    .eq('league_id', leagueId)
    .maybeSingle()
  if (gErr) return NextResponse.json({ error: '경기를 확인하지 못했습니다' }, { status: 500 })
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const oldHome = game.home_team_id as string | null
  const oldAway = game.away_team_id as string | null
  if (oldHome === nextHome && oldAway === nextAway) {
    return NextResponse.json({ error: '지금과 같은 팀입니다' }, { status: 400 })
  }

  // 팀 검증 — 이 리그 소속인지 + 임시팀 불변식(친선 경기·자기 날짜에만). PATCH /games 와 같은 규칙이다.
  const { data: teamRows, error: tErr } = await supabase
    .from('league_teams')
    .select('id, name, exhibition_date')
    .eq('league_id', leagueId)
    .in('id', [nextHome, nextAway])
  if (tErr) return NextResponse.json({ error: '팀을 확인하지 못했습니다' }, { status: 500 })
  const known = new Set((teamRows ?? []).map(t => t.id))
  if (!known.has(nextHome) || !known.has(nextAway)) {
    return NextResponse.json({ error: '이 리그의 팀이 아닙니다' }, { status: 400 })
  }
  const adhoc = (teamRows ?? []).filter(t => t.exhibition_date)
  if (adhoc.length > 0) {
    if (game.is_exhibition !== true) {
      return NextResponse.json(
        { error: `임시팀(${adhoc.map(t => t.name).join(', ')})은 친선전에만 배정할 수 있습니다` },
        { status: 409 },
      )
    }
    const wrongDate = adhoc.filter(t => t.exhibition_date !== game.date)
    if (wrongDate.length > 0) {
      return NextResponse.json(
        { error: `임시팀 "${wrongDate[0].name}" 은 ${wrongDate[0].exhibition_date} 전용입니다 (이 경기는 ${game.date})` },
        { status: 400 },
      )
    }
  }

  // ── 이관 대상 수집 ────────────────────────────────────────────────
  //   ⚠ **바꾸기 전에 id 를 먼저 모은다.** 좌우 스왑(A↔B)이면 순차 UPDATE 가 서로를 덮어쓴다
  //   (A→B 로 바꾼 뒤 B→A 를 돌리면 방금 바꾼 것까지 되돌아온다). id 목록으로 고정해 두면
  //   어떤 조합이든 한 번씩만 옮겨진다.
  async function idsFor(table: 'league_game_events' | 'league_game_players', teamId: string | null) {
    if (!teamId) return [] as string[]
    const { data, error } = await supabase
      .from(table)
      .select('id')
      .eq('league_game_id', gameId)
      .eq('team_id', teamId)
    if (error) throw new Error(`${table} 조회 실패 — ${error.message}`)
    return (data ?? []).map(r => r.id as string)
  }

  type Move = { table: 'league_game_events' | 'league_game_players'; ids: string[]; to: string }
  let moves: Move[]
  try {
    moves = []
    for (const table of ['league_game_events', 'league_game_players'] as const) {
      if (oldHome && oldHome !== nextHome) moves.push({ table, ids: await idsFor(table, oldHome), to: nextHome })
      if (oldAway && oldAway !== nextAway) moves.push({ table, ids: await idsFor(table, oldAway), to: nextAway })
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '기록 조회 실패' }, { status: 500 })
  }

  // 순수 좌우 스왑이면 스코어도 함께 뒤집는다
  const isPureSwap = !!oldHome && !!oldAway && oldHome === nextAway && oldAway === nextHome

  const gamePatch: Record<string, unknown> = { home_team_id: nextHome, away_team_id: nextAway }
  if (isPureSwap) {
    gamePatch.home_score = game.away_score ?? 0
    gamePatch.away_score = game.home_score ?? 0
  }

  const { error: upErr } = await supabase
    .from('league_games')
    .update(gamePatch)
    .eq('id', gameId)
    .eq('league_id', leagueId)
  if (upErr) return NextResponse.json({ error: `경기 저장 실패 — ${upErr.message}` }, { status: 500 })

  // 기록 이관. 여기서 실패하면 경기 팀만 바뀌고 이벤트는 옛 팀에 남는 어긋난 상태가 되므로,
  //   무엇이 남았는지 그대로 알려 준다(조용히 성공으로 넘기지 않는다).
  let moved = 0
  const failures: string[] = []
  for (const m of moves) {
    if (m.ids.length === 0) continue
    // in() 는 URL 길이 제한이 있다. 200개씩 끊는다.
    for (let i = 0; i < m.ids.length; i += 200) {
      const chunk = m.ids.slice(i, i + 200)
      const { data: updated, error } = await supabase
        .from(m.table)
        .update({ team_id: m.to })
        .in('id', chunk)
        .select('id')
      // PostgREST 는 RLS 에 막혀도 204 를 준다 — 성공 판정은 반환 행 수로만 한다(감사 04 ②)
      if (error || !updated || updated.length !== chunk.length) {
        failures.push(`${m.table} ${chunk.length}건 중 ${updated?.length ?? 0}건만 이관`)
      }
      moved += updated?.length ?? 0
    }
  }

  await logAudit({
    req, action: 'game.reassign_teams', targetTable: 'league_games', targetId: gameId, leagueId,
    result: failures.length > 0 ? 'denied' : undefined,
    detail: { from: { home: oldHome, away: oldAway }, to: { home: nextHome, away: nextAway }, moved, isPureSwap, failures },
  })

  revalidateTag(`league-${leagueId}`, 'max')
  revalidateTag(`league-${leagueId}-games`, 'max')

  if (failures.length > 0) {
    return NextResponse.json(
      { error: `팀은 바뀌었지만 일부 기록이 옮겨지지 않았습니다: ${failures.join(' / ')}`, moved },
      { status: 500 },
    )
  }

  return NextResponse.json({ success: true, moved, swapped_scores: isPureSwap })
}
