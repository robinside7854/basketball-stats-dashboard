// GET /api/leagues/[leagueId]/stathead
//
// Amateur Stathead — 커스텀 스탯 쿼리 API.
// Basketball-reference 의 Stathead 를 아마추어 리그 규모로 축소.
//
// 쿼리 파라미터:
//   quarterId       — 특정 분기 (없으면 시즌 전체)
//   teamId          — 특정 팀
//   position        — 포지션 필터 (콤마 구분: PG,SG)
//   minGp           — 최소 경기 수
//   includeGuests   — '1' 로 명시 시 게스트 포함 (기본 false)
//   filters         — 콤마 구분 stat 조건: "ppg_gte_15,fg3_pct_gte_30"
//                     지원 연산: gte, gt, lte, lt, eq
//                     지원 stat: gp, ppg, rpg, apg, spg, bpg, topg,
//                                fg_pct, fg3_pct, ft_pct, efg_pct,
//                                pts, reb, ast, stl, blk, tov,
//                                fgm, fga, fg3m, fg3a, ftm, fta
//   sort            — stat_dir 형식 (예: "ppg_desc" 또는 "efg_pct_asc")
//   limit           — 결과 개수 제한 (기본 50, 최대 200)
//
// 응답:
//   {
//     players: PlayerStat[],
//     total: number,
//     filters_applied: string[],
//     sort: { key: string, dir: 'asc' | 'desc' },
//     available_stats: string[],
//   }

import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

const SUPPORTED_STATS = new Set([
  'gp', 'ppg', 'rpg', 'apg', 'spg', 'bpg', 'topg',
  'fg_pct', 'fg3_pct', 'ft_pct', 'efg_pct',
  'pts', 'reb', 'ast', 'stl', 'blk', 'tov',
  'fgm', 'fga', 'fg3m', 'fg3a', 'ftm', 'fta',
])
const SUPPORTED_OPS = new Set(['gte', 'gt', 'lte', 'lt', 'eq'])

type FilterCond = { stat: string; op: string; value: number }

function parseFilters(raw: string | null): { valid: FilterCond[]; invalid: string[] } {
  if (!raw) return { valid: [], invalid: [] }
  const valid: FilterCond[] = []
  const invalid: string[] = []
  for (const tok of raw.split(',').filter(Boolean)) {
    // stat_op_value → 처음 두 '_' 만 split (stat 이름에 '_' 포함될 수 있어서)
    // ex: "fg_pct_gte_30" → stat="fg_pct", op="gte", value=30
    // 뒤에서부터 파싱: 마지막 조각 = value, 그 앞 = op, 나머지 = stat
    const parts = tok.split('_')
    if (parts.length < 3) { invalid.push(tok); continue }
    const value = Number(parts[parts.length - 1])
    const op = parts[parts.length - 2]
    const stat = parts.slice(0, -2).join('_')
    if (!SUPPORTED_STATS.has(stat) || !SUPPORTED_OPS.has(op) || Number.isNaN(value)) {
      invalid.push(tok); continue
    }
    valid.push({ stat, op, value })
  }
  return { valid, invalid }
}

function applyOp(v: number, op: string, target: number): boolean {
  switch (op) {
    case 'gte': return v >= target
    case 'gt':  return v >  target
    case 'lte': return v <= target
    case 'lt':  return v <  target
    case 'eq':  return v === target
    default: return true
  }
}

function parseSort(raw: string | null): { key: string; dir: 'asc' | 'desc' } {
  if (!raw) return { key: 'ppg', dir: 'desc' }
  const parts = raw.split('_')
  if (parts.length < 2) return { key: 'ppg', dir: 'desc' }
  const dir = parts[parts.length - 1]
  const key = parts.slice(0, -1).join('_')
  if (!SUPPORTED_STATS.has(key)) return { key: 'ppg', dir: 'desc' }
  return { key, dir: dir === 'asc' ? 'asc' : 'desc' }
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const sp = new URL(req.url).searchParams
  const quarterId     = sp.get('quarterId')
  const teamId        = sp.get('teamId')
  const positionRaw   = sp.get('position')
  const minGp         = Math.max(0, Number(sp.get('minGp') ?? 0))
  const includeGuests = sp.get('includeGuests') === '1'
  const filtersRaw    = sp.get('filters')
  const sortRaw       = sp.get('sort')
  const limit         = Math.min(Math.max(1, Number(sp.get('limit') ?? 50)), 200)

  const { valid: filters, invalid } = parseFilters(filtersRaw)
  const sort = parseSort(sortRaw)

  // 내부 /stats 재사용 — quarterId·teamId 는 상위 API 에 위임
  const origin = new URL(req.url).origin
  const inner = new URL(`${origin}/api/leagues/${leagueId}/stats`)
  if (quarterId) inner.searchParams.set('quarterId', quarterId)
  if (teamId)    inner.searchParams.set('teamId', teamId)
  inner.searchParams.set('unit', 'round')
  const statsRes = await fetch(inner.toString(), {
    headers: { cookie: req.headers.get('cookie') ?? '' },
    cache: 'no-store',
  })
  const statsJson = await statsRes.json() as { players?: Array<Record<string, unknown>> }
  let players = statsJson.players ?? []

  // 게스트 제외
  if (!includeGuests) {
    const { data: guestRows } = await createClient()
      .from('league_players')
      .select('id')
      .eq('league_id', leagueId)
      .eq('is_guest', true)
    const guestIds = new Set((guestRows ?? []).map(r => r.id as string))
    players = players.filter(p => !guestIds.has(p.player_id as string))
  }

  // 포지션 필터 (콤마 구분 OR 조건: 하나라도 매치)
  if (positionRaw) {
    const wanted = positionRaw.split(',').map(s => s.trim()).filter(Boolean)
    players = players.filter(p => {
      const pos = String(p.position ?? '')
      const positions = pos.split(',').map(s => s.trim()).filter(Boolean)
      return wanted.some(w => positions.includes(w))
    })
  }

  // 최소 경기 수
  if (minGp > 0) {
    players = players.filter(p => Number(p.gp ?? 0) >= minGp)
  }

  // 커스텀 filter 조건
  for (const f of filters) {
    players = players.filter(p => {
      const v = Number(p[f.stat] ?? 0)
      return applyOp(v, f.op, f.value)
    })
  }

  // 정렬
  players.sort((a, b) => {
    const va = Number(a[sort.key] ?? 0)
    const vb = Number(b[sort.key] ?? 0)
    return sort.dir === 'desc' ? vb - va : va - vb
  })

  const total = players.length
  const trimmed = players.slice(0, limit)

  return NextResponse.json({
    players: trimmed,
    total,
    filters_applied: filters.map(f => `${f.stat}_${f.op}_${f.value}`),
    filters_invalid: invalid,
    sort,
    available_stats: [...SUPPORTED_STATS],
  })
}
