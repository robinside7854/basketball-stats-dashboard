// 달마다 팀 유니폼 색 → 선수 프로필 사진 (마이그레이션 121, 2026-11-08 운영진 요청)
//
// 선수마다 사진 네 벌(league_players.uniform_photos: yellow·white·black·gray)을 두고,
// 「그 달 그 선수의 정규 팀」의 유니폼 색(league_team_month_uniforms)에 맞는 것을 photo_url 로 옮겨 둔다.
//   · 정규가 아니면 gray(회색)
//   · 그 달 팀 색을 아직 정하지 않았으면 yellow(기본 유니폼)
//   · 네 벌이 없는 선수는 건드리지 않는다
// photo_url 을 바꿔 두므로 화면 코드는 그대로 — 모든 화면이 같은 사진을 본다.
// 부르는 곳: 유니폼 색 저장 · 달별 정규 멤버 저장/되돌리기 · 사진 네 벌 올리기 · 매일 밤 cron(달이 바뀌는 날).
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadCurrentQuarter } from '@/lib/league/currentQuarter'
import { loadMonthRoster, monthOf } from '@/lib/league/monthlyRoster'
import { resolveTeamId } from '@/lib/league/teamScope'

export const UNIFORMS = ['yellow', 'white', 'black'] as const
export type Uniform = (typeof UNIFORMS)[number]
export type PhotoColor = Uniform | 'gray'
export type UniformPhotos = Partial<Record<PhotoColor, string>>

export const UNIFORM_LABEL: Record<PhotoColor, string> = { yellow: '노랑', white: '흰색', black: '검정', gray: '회색' }

export function isUniform(v: unknown): v is Uniform {
  return typeof v === 'string' && (UNIFORMS as readonly string[]).includes(v)
}

export function todayKst(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
}

/** 그 달 팀 → 유니폼 색. 표가 없거나 실패하면 빈 Map */
export async function loadMonthUniforms(sb: SupabaseClient, leagueId: string, month: string): Promise<Map<string, Uniform>> {
  const out = new Map<string, Uniform>()
  const { data, error } = await sb.from('league_team_month_uniforms')
    .select('team_id, uniform').eq('league_id', leagueId).eq('month', month)
  if (error) return out
  for (const r of (data ?? []) as { team_id: string; uniform: string }[]) if (isUniform(r.uniform)) out.set(r.team_id, r.uniform)
  return out
}

/** 오늘 기준으로 선수 photo_url 을 그 달 유니폼 사진으로 맞춘다. 바꾼 선수 수를 돌려준다. */
export async function applyMonthlyPhotos(sb: SupabaseClient, leagueId: string): Promise<{ changed: number; checked: number }> {
  const today = todayKst()
  const month = monthOf(today)!
  const [q, teamId] = await Promise.all([loadCurrentQuarter(sb, leagueId), resolveTeamId(leagueId)])
  const inQuarter = !!q && !!q.start_date && !!q.end_date && today >= q.start_date && today <= q.end_date

  const [playersRes, memRes, monthMap, uniforms] = await Promise.all([
    sb.from('league_players').select('id, photo_url, uniform_photos').eq('team_id', teamId).not('uniform_photos', 'is', null),
    q ? sb.from('league_player_quarters').select('league_player_id, team_id, is_regular').eq('quarter_id', q.id)
      : Promise.resolve({ data: [] as { league_player_id: string; team_id: string | null; is_regular: boolean | null }[] }),
    loadMonthRoster(sb, leagueId, inQuarter ? month : null),
    loadMonthUniforms(sb, leagueId, month),
  ])
  if (playersRes.error) return { changed: 0, checked: 0 }

  const regular = new Map<string, string>()
  for (const m of memRes.data ?? []) if (m.team_id && m.is_regular !== false) regular.set(m.league_player_id, m.team_id)
  for (const [pid, m] of monthMap) {
    if (m.team_id && m.is_regular) regular.set(pid, m.team_id)
    else regular.delete(pid)
  }

  let changed = 0
  const rows = (playersRes.data ?? []) as { id: string; photo_url: string | null; uniform_photos: UniformPhotos | null }[]
  for (const p of rows) {
    const set = p.uniform_photos ?? {}
    const tid = regular.get(p.id)
    const color: PhotoColor = tid ? (uniforms.get(tid) ?? 'yellow') : 'gray'
    const url = set[color] ?? set.yellow
    if (!url || url === p.photo_url) continue
    const { error } = await sb.from('league_players').update({ photo_url: url }).eq('id', p.id)
    if (!error) changed++
  }
  return { changed, checked: rows.length }
}
