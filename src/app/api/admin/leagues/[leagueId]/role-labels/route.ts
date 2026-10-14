// GET   /api/admin/leagues/[leagueId]/role-labels?period=all|<quarterId>
//   CEO 미리보기 — 자격을 채운 선수 전원의 역할 라벨(플레이 스타일)과 그 근거(자리·값), 라벨별 인원.
// PATCH /api/admin/leagues/[leagueId]/role-labels  { public: boolean }
//   회원 화면(선수 카드) 공개 스위치. leagues.rules JSON 의 `role_labels_public` 키에 둔다 —
//   새 컬럼(마이그레이션) 대신 기존 JSON 을 쓴다. 채점 룰(event_points·plus_one_bonus)은 건드리지 않고 키 하나만 병합한다.
//
// 인가: CEO 세션만 (/api/admin/** 공통 패턴). 숫자는 선수 카드와 같은 loadPeriodStats·순위 자격·computeRoleLabels.
import { NextResponse } from 'next/server'
import { requireCeoSession } from '@/lib/auth/ceo'
import { createClient } from '@/lib/supabase/admin'
import { logAudit } from '@/lib/audit'
import { loadPeriodStats, quarterPeriod, rankMinRounds, type StatsPeriod } from '@/lib/stats/playerTotals'
import { computeRoleLabels, roleLabelsPublic, ROLE_LABEL_DEFS, ROLE_LABELS_PUBLIC_KEY, type RoleLabelKey } from '@/lib/stats/roleLabels'

type QuarterRow = { id: string; year: number; quarter: number; name: string | null; kind: string | null; start_date: string | null; end_date: string | null }

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  if (!(await requireCeoSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { leagueId } = await params
  const sb = createClient()

  const [{ data: league, error: lErr }, { data: qData, error: qErr }] = await Promise.all([
    sb.from('leagues').select('id, name, rules').eq('id', leagueId).maybeSingle(),
    sb.from('league_quarters').select('id, year, quarter, name, kind, start_date, end_date').eq('league_id', leagueId),
  ])
  if (lErr || qErr) return NextResponse.json({ error: '리그 조회 실패' }, { status: 500 })
  if (!league) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  const quarters = ((qData ?? []) as QuarterRow[])
    .filter(q => q.kind !== 'tournament')
    .sort((a, b) => a.year - b.year || a.quarter - b.quarter)

  const periodParam = new URL(req.url).searchParams.get('period') ?? 'all'
  const q = periodParam === 'all' ? null : quarters.find(x => x.id === periodParam) ?? null
  if (periodParam !== 'all' && !q) return NextResponse.json({ error: '분기를 찾을 수 없습니다' }, { status: 400 })
  const period: StatsPeriod = q ? quarterPeriod(q) : 'all'

  const stats = await loadPeriodStats(leagueId, period)
  const minGp = rankMinRounds(stats.total_rounds ?? 0, stats.players)
  const eligible = stats.players.filter(p => p.gp >= minGp)
  const calc = computeRoleLabels(eligible)

  const counts = Object.fromEntries(
    (Object.keys(ROLE_LABEL_DEFS) as RoleLabelKey[]).map(k => [k, 0]),
  ) as Record<RoleLabelKey, number>
  const rows = eligible.map(p => {
    const r = calc.byPlayer.get(p.player_id)!
    for (const l of r.labels) counts[l.key]++
    return {
      player_id: p.player_id,
      name: p.name,
      photo_url: p.photo_url ?? null,
      team_name: p.team_name ?? null,
      team_color: p.team_color ?? null,
      gp: p.gp,
      fga: p.fga,
      labels: r.labels.map(l => l.key),
      qualified: r.qualified,
      metrics: r.metrics,
      fg3_pct: r.fg3Pct,
      ast_to: r.astTo,
    }
  }).sort((a, b) => a.name.localeCompare(b.name, 'ko'))

  return NextResponse.json({
    league: { id: league.id, name: league.name },
    public: roleLabelsPublic(league.rules),
    quarters: quarters.map(x => ({ id: x.id, label: x.name || `${x.year} ${x.quarter}분기` })),
    period: q ? q.id : 'all',
    total_rounds: stats.total_rounds ?? 0,
    min_gp: minGp,
    pool_size: calc.poolSize,
    shot_pool_size: calc.shotPoolSize,
    league_fg3_pct: calc.leagueFg3Pct,
    league_ast_to: calc.leagueAstTo,
    excluded: stats.players.length - eligible.length,
    counts,
    rows,
  })
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  if (!(await requireCeoSession())) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { leagueId } = await params
  const body = await req.json().catch(() => null) as { public?: unknown } | null
  if (typeof body?.public !== 'boolean') return NextResponse.json({ error: 'public(boolean) 이 필요합니다' }, { status: 400 })

  const sb = createClient()
  const { data: league, error } = await sb.from('leagues').select('rules').eq('id', leagueId).maybeSingle()
  if (error) return NextResponse.json({ error: '리그 조회 실패' }, { status: 500 })
  if (!league) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  // 키 하나만 병합한다 — 채점 룰(event_points·plus_one_bonus)을 덮어쓰면 득점 계산이 통째로 바뀐다.
  const prev = league.rules && typeof league.rules === 'object' ? league.rules as Record<string, unknown> : {}
  const next = { ...prev, [ROLE_LABELS_PUBLIC_KEY]: body.public }
  const { error: uErr } = await sb.from('leagues').update({ rules: next }).eq('id', leagueId)
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })

  await logAudit({
    req, action: 'league.role_labels.update', targetTable: 'leagues', targetId: leagueId,
    leagueId, detail: { public: body.public },
  })
  return NextResponse.json({ public: body.public })
}
