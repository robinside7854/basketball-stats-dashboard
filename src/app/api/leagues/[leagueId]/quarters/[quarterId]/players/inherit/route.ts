// POST /api/leagues/[leagueId]/quarters/[quarterId]/players/inherit
//
// 직전 분기의 팀 소속을 이 분기로 **비어 있는 칸만** 복사한다.
//
// 왜 있는가 (2026-09-18)
//   미라클은 분기마다 팀을 새로 짜는데, 새 분기가 열릴 때 이전 분기 소속을 이어받는 코드가
//   저장소 어디에도 없었다. 그래서 새 분기는 항상 소속 0명에서 시작하고, 드래프트를 돌리거나
//   명단 화면에서 한 명씩 찍기 전까지 기록 화면의 「선발 선수 선택」에 아무도 안 뜬다.
//   실제로 26.3Q 는 소속 4명(드래프트 셋업이 먼저 박은 팀장들)인 채로 분기 절반을 보냈고,
//   나머지 43명은 전부 '미배정 선수' 칩으로 떨어졌다. **에러는 한 번도 안 났다** — 빈 표는
//   그냥 "무소속"으로 조용히 읽히기 때문이다.
//
// 설계 원칙
//   · **사람이 정한 것이 이긴다.** 대상 분기에 행이 이미 있으면 team_id 가 null 이어도
//     건너뛴다. 명단 화면의 `비정규` 버튼이 team_id null 행을 만들기 때문에(roster/page.tsx),
//     그 행은 빈 칸이 아니라 "비정규로 정했다"는 뜻이다.
//   · **덮어쓰지 않는다.** upsert + ignoreDuplicates 로 DB 레벨에서 DO NOTHING 을 보장한다.
//     insert 로 하면 6번과 8번 사이 경쟁으로 한 행만 겹쳐도 배치 전체가 23505 로 죽는다.
//   · **부분 성공을 성공이라고 말하지 않는다.** filled 는 반환 행 수로 세고, 못 넣은 것이
//     있으면 failed 와 함께 돌려준다.
//   · 자동 실행은 하지 않는다. 분기 생성 시 몰래 승계하면 드래프트 결과와 섞여 무엇이
//     사람의 결정인지 알 수 없게 된다.

import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/admin'
import { canEditLeague } from '@/lib/auth/leagueAdmin'
import { logAudit } from '@/lib/audit'
import { fetchExternalPlayerIds } from '@/lib/league/externalPlayers'
import { resolveTeamId } from '@/lib/league/teamScope'

type Ctx = { params: Promise<{ leagueId: string; quarterId: string }> }

interface QuarterRow {
  id: string
  year: number
  quarter: number
  name: string | null
  kind: string | null
  start_date: string | null
}

/** 분기를 시간순으로 세울 키. start_date 가 비어 있어도 달력 분기로 항상 비교 가능한 값이 나온다. */
function sortKey(q: QuarterRow): string {
  if (q.start_date) return q.start_date
  const month = String((q.quarter - 1) * 3 + 1).padStart(2, '0')
  return `${q.year}-${month}-01`
}

const label = (q: QuarterRow) => q.name ?? `${String(q.year).slice(2)}.${q.quarter}Q`

export async function POST(req: Request, { params }: Ctx) {
  const { leagueId, quarterId } = await params
  if (!(await canEditLeague(req, leagueId))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { dryRun?: boolean } = {}
  try { body = await req.json() } catch { /* 본문 없이 불러도 실행으로 본다 */ }
  const dryRun = body.dryRun === true

  const supabase = createClient()

  // 이 리그의 분기 전부. 대상 분기 확인과 직전 분기 찾기를 한 번에 해결한다.
  const { data: quartersRaw, error: qErr } = await supabase
    .from('league_quarters')
    .select('id, year, quarter, name, kind, start_date')
    .eq('league_id', leagueId)
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })

  const quarters = (quartersRaw ?? []) as QuarterRow[]
  const target = quarters.find(q => q.id === quarterId)
  // 리그 경계 재확인 — id 하나만 믿으면 남의 리그 분기에 43명을 부을 수 있다.
  if (!target) return NextResponse.json({ error: '이 리그의 분기가 아닙니다' }, { status: 404 })

  // ⚠ 대회는 막는다. 대회에서 league_player_quarters 는 소속이 아니라 **참가 등록**이다
  //   (quarters/[quarterId]/players/route.ts 주석). 전원을 부으면 전부 참가자가 되고,
  //   그 분기에 기록이 생긴 뒤에는 해제(DELETE)가 409 로 막혀 되돌릴 수도 없다.
  if (target.kind === 'tournament') {
    return NextResponse.json(
      { error: '대회에는 쓸 수 없습니다. 대회 참가 등록은 대회 명단 화면에서 직접 하세요.' },
      { status: 400 },
    )
  }

  const league = quarters.filter(q => q.kind !== 'tournament').sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  const idx = league.findIndex(q => q.id === quarterId)
  const source = idx > 0 ? league[idx - 1] : null
  if (!source) {
    return NextResponse.json({ error: `${label(target)} 앞에 이어받을 분기가 없습니다` }, { status: 409 })
  }

  const teamId = await resolveTeamId(leagueId)
  const [{ data: prevRows, error: pErr }, { data: curRows, error: cErr }, { data: players, error: plErr }] =
    await Promise.all([
      // 무소속 행은 복사하지 않는다 — 빈 행을 만들어 봐야 화면이 달라지지 않는다.
      supabase
        .from('league_player_quarters')
        .select('league_player_id, team_id, is_regular')
        .eq('quarter_id', source.id)
        .not('team_id', 'is', null),
      supabase
        .from('league_player_quarters')
        .select('league_player_id')
        .eq('quarter_id', quarterId),
      // 명단 풀은 팀 소유다(league_id 로 조회하면 비어 버린다 — players/route.ts GET 과 동일).
      supabase
        .from('league_players')
        .select('id, is_active')
        .eq('team_id', teamId),
    ])
  if (pErr || cErr || plErr) {
    return NextResponse.json({ error: (pErr ?? cErr ?? plErr)!.message }, { status: 500 })
  }

  const externalIds = await fetchExternalPlayerIds(supabase, leagueId)
  const activeIds = new Set((players ?? []).filter(p => p.is_active !== false).map(p => p.id))
  const existing = new Set((curRows ?? []).map(r => r.league_player_id))

  let skippedExisting = 0
  let skippedInactive = 0
  const rows: Array<{ league_id: string; quarter_id: string; league_player_id: string; team_id: string; is_regular: boolean }> = []

  for (const r of (prevRows ?? []) as Array<{ league_player_id: string; team_id: string; is_regular: boolean | null }>) {
    if (existing.has(r.league_player_id)) { skippedExisting++; continue }
    if (externalIds.has(r.league_player_id) || !activeIds.has(r.league_player_id)) { skippedInactive++; continue }
    rows.push({
      league_id: leagueId,
      quarter_id: quarterId,
      league_player_id: r.league_player_id,
      team_id: r.team_id,
      is_regular: r.is_regular ?? true,
    })
  }

  const summary = {
    source: { quarter_id: source.id, label: label(source) },
    target: { quarter_id: target.id, label: label(target) },
    candidates: rows.length,
    skipped_existing: skippedExisting,
    skipped_inactive: skippedInactive,
  }

  if (dryRun || rows.length === 0) {
    return NextResponse.json({ ...summary, dry_run: dryRun, filled: 0, failed: 0, errors: [] })
  }

  // ignoreDuplicates = ON CONFLICT DO NOTHING. "비어 있는 칸만 채운다"를 DB 가 보장한다.
  const { data: inserted, error: insErr } = await supabase
    .from('league_player_quarters')
    .upsert(rows, { onConflict: 'quarter_id,league_player_id', ignoreDuplicates: true })
    .select('league_player_id')
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  // 성공 판정은 반환 행 수로 — filled 만 담아 200 을 주면 부분 성공이 성공으로 둔갑한다.
  const filled = (inserted ?? []).length
  const failed = rows.length - filled

  await logAudit({
    req, action: 'quarter_player.inherit', targetTable: 'league_player_quarters',
    targetId: quarterId, leagueId, quarterId,
    detail: { from: source.id, candidates: rows.length, filled, failed },
  })

  revalidateTag(`league-${leagueId}`, 'max')

  return NextResponse.json({
    ...summary,
    dry_run: false,
    filled,
    failed,
    // 실패는 "그 사이 누가 같은 칸을 채웠다"가 거의 전부다. 사람이 할 조치는 다시 눌러 보는 것.
    errors: failed > 0 ? [`${failed}명이 저장되지 않았습니다 — 다른 사람이 같은 분기를 동시에 편집했을 수 있습니다. 다시 실행해 보세요.`] : [],
  })
}
