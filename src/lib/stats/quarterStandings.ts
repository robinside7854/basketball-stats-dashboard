// 그 날짜가 속한 분기의 누적 팀 순위 — 한 벌 (2026-11-11, daily-boxscore 에서 옮김)
//   · 그날까지 마감된 정규전(친선 제외). 분기는 기간(start~end)에 그날이 드는 행,
//     기간이 없으면 그날 경기의 quarter_id(currentQuarter.ts 와 같은 규칙).
//   · 집계·정렬은 「그날 팀 승패」 정본 tallyDayRecord 그대로(승률 → 득실) — 팀은 (team_id, quarter_id) 정체성.
//   · 쓰는 곳: 박스스코어 「누적 순위」 · 참가 명단 공유 카드(팀 이름 아래 「N승 N패 N무 · N위」).
//   ⚠ 화면·라우트에서 순위를 다시 세지 말 것 — 두 화면의 순위가 갈린다.
import type { SupabaseClient } from '@supabase/supabase-js'
import { tallyDayRecord } from '@/lib/stats/dayRecord'
import type { makeIdentityResolver } from '@/lib/stats/teamIdentity'

export interface QuarterStandingRow {
  key: string; team_id: string; name: string; color: string | null
  W: number; L: number; D: number; PF: number; PA: number
  /** 공동 순위(승률·득실이 같으면 같은 순위 — 1·2·2·4) */
  rank: number
}
export interface QuarterStandings { label: string; days: number; teams: QuarterStandingRow[] }

export async function computeQuarterStandings(
  supabase: SupabaseClient,
  leagueId: string,
  date: string,
  resolver: ReturnType<typeof makeIdentityResolver>,
): Promise<QuarterStandings | null> {
  type Q = { id: string; year: number; quarter: number; start_date: string | null; end_date: string | null; kind: string | null }
  const [{ data: qs }, { data: dayGames }] = await Promise.all([
    supabase.from('league_quarters').select('id, year, quarter, start_date, end_date, kind').eq('league_id', leagueId),
    supabase.from('league_games').select('quarter_id').eq('league_id', leagueId).eq('date', date).eq('is_exhibition', false),
  ])
  const rows = ((qs ?? []) as Q[]).filter(q => q.kind !== 'tournament')
  const dayQid = ((dayGames ?? []) as Array<{ quarter_id: string | null }>).find(g => g.quarter_id)?.quarter_id ?? null
  const q = rows.find(r => r.start_date && r.end_date && r.start_date <= date && date <= r.end_date)
    ?? rows.find(r => r.id === dayQid) ?? null
  if (!q) return null
  let query = supabase.from('league_games')
    .select('date, quarter_id, home_team_id, away_team_id, home_score, away_score')
    .eq('league_id', leagueId).eq('is_complete', true).eq('is_exhibition', false).lte('date', date)
  query = q.start_date && q.end_date ? query.gte('date', q.start_date) : query.eq('quarter_id', q.id)
  const { data: gs } = await query
  type G = { date: string; quarter_id: string | null; home_team_id: string | null; away_team_id: string | null; home_score: number | null; away_score: number | null }
  const side = (tid: string | null, qid: string | null) => {
    const r = resolver(tid, qid)
    return r ? { key: r.key, name: r.display_name, color: r.color } : null
  }
  const rec = tallyDayRecord(((gs ?? []) as G[]).map(g => ({
    home: side(g.home_team_id, g.quarter_id), away: side(g.away_team_id, g.quarter_id),
    home_score: g.home_score, away_score: g.away_score, is_complete: true, is_exhibition: false,
  })))
  if (rec.teams.length === 0) return null
  const pct = (t: { wins: number; losses: number; draws: number }) => { const n = t.wins + t.losses + t.draws; return n ? t.wins / n : 0 }
  const teams: QuarterStandingRow[] = []
  rec.teams.forEach((t, i) => {
    const prev = rec.teams[i - 1]
    const same = prev && pct(prev) === pct(t) && prev.ptsFor - prev.ptsAgainst === t.ptsFor - t.ptsAgainst
    teams.push({
      key: t.key, team_id: t.key.split('::')[0], name: t.name, color: t.color,
      W: t.wins, L: t.losses, D: t.draws, PF: t.ptsFor, PA: t.ptsAgainst,
      rank: same ? teams[i - 1].rank : i + 1,
    })
  })
  return {
    label: `${String(q.year).slice(2)}.${q.quarter}Q`,
    days: new Set(((gs ?? []) as G[]).map(g => g.date)).size,
    teams,
  }
}
