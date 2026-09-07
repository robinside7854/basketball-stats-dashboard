// 영상 제목에 적힌 팀 표기 → 팀 id.
//
// 왜 별칭 표가 필요한가
//   업로더는 팀명을 줄여 쓴다. 실제 팀명은 `챗지피지기` 인데 제목은 `지피티` 다.
//   부분일치도 아니고 초성도 같지 않아 어떤 규칙으로도 안전하게 이어붙일 수 없다.
//
// ⚠ **유사도로 추측해서 붙이지 않는다.** 이 프로젝트가 반복해서 당한 사고는
//   "안 붙는 것"이 아니라 "그럴듯하게 틀린 자리에 조용히 붙는 것"이었다(2026-08-22).
//   유사도는 오직 **운영자에게 보여줄 제안 문구**에만 쓴다 — 판정에는 쓰지 않는다.
//
// 이름의 출처 세 가지를 모두 받는다.
//   1. league_teams.name            — 기본 팀명
//   2. league_team_quarter_overrides — **그 분기의 팀명**. 미라클은 분기마다 팀명이 바뀐다
//                                      (1·2분기 락다운/런앤건 → 3분기 굿모닝/챗지피지기).
//                                      이걸 빼면 옛 날짜를 다시 연동할 때 아무것도 안 붙는다.
//   3. league_team_aliases           — 업로더가 쓰는 줄임말

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeName } from './videoTitle'

export type NameResolution =
  | { kind: 'ok'; teamId: string }
  | { kind: 'ambiguous'; teamIds: string[] }
  | { kind: 'unknown' }

export interface TeamNameIndex {
  resolve(rawName: string): NameResolution
  /** 못 찾았을 때 안내 문구에 넣을 후보. 판정에는 쓰지 않는다. */
  suggest(rawName: string): { teamId: string; name: string } | null
  displayName(teamId: string): string
  /** 이 날짜에 후보가 된 팀들 — 안내 문구용. */
  candidateNames(): string[]
}

interface TeamRow { id: string; name: string }

export function makeTeamNameIndex(
  teams: TeamRow[],
  overrides: Array<{ team_id: string; name: string | null }>,
  aliases: Array<{ team_id: string; alias: string }>,
): TeamNameIndex {
  // 표시용 이름: 분기 override 가 있으면 그것이 "지금 그 팀의 이름"이다.
  const display = new Map<string, string>(teams.map(t => [t.id, t.name]))
  for (const o of overrides) {
    if (o.name && display.has(o.team_id)) display.set(o.team_id, o.name)
  }

  const byName = new Map<string, Set<string>>()
  const add = (name: string | null | undefined, teamId: string) => {
    if (!name) return
    const key = normalizeName(name)
    if (!key) return
    let set = byName.get(key)
    if (!set) { set = new Set(); byName.set(key, set) }
    set.add(teamId)
  }

  for (const t of teams) add(t.name, t.id)
  for (const o of overrides) if (display.has(o.team_id)) add(o.name, o.team_id)
  for (const a of aliases) if (display.has(a.team_id)) add(a.alias, a.team_id)

  return {
    resolve(rawName: string): NameResolution {
      const set = byName.get(normalizeName(rawName))
      if (!set || set.size === 0) return { kind: 'unknown' }
      if (set.size > 1) return { kind: 'ambiguous', teamIds: [...set] }
      return { kind: 'ok', teamId: [...set][0] }
    },

    suggest(rawName: string) {
      const key = normalizeName(rawName)
      if (!key) return null
      const chars = new Set(key.split(''))
      let best: { teamId: string; name: string; score: number } | null = null
      for (const [teamId, name] of display) {
        const other = new Set(normalizeName(name).split(''))
        let hit = 0
        for (const c of chars) if (other.has(c)) hit++
        const score = hit / Math.max(chars.size, other.size)
        if (!best || score > best.score) best = { teamId, name, score }
      }
      // 절반도 안 겹치면 제안하지 않는다 — 엉뚱한 이름을 권하면 그걸 그대로 등록해 버린다.
      return best && best.score >= 0.4 ? { teamId: best.teamId, name: best.name } : null
    },

    displayName(teamId: string) {
      return display.get(teamId) ?? '(알 수 없는 팀)'
    },

    candidateNames() {
      return [...display.values()]
    },
  }
}

/**
 * 그 날짜에 나올 수 있는 팀만 담아 색인을 만든다.
 *
 * 왜 전체 팀을 담지 않는가: 친선전 임시팀(`exhibition_date`)까지 전부 넣으면 이름이 겹칠 때
 * 판정이 모호해져 아무것도 못 붙인다. 그 날짜의 상시팀 + 그 날짜 임시팀 + 이미 그날 경기에
 * 배정된 팀이면 충분하다.
 */
export async function loadTeamNameIndex(
  supabase: SupabaseClient,
  leagueId: string,
  date: string,
  quarterId: string | null,
  extraTeamIds: string[] = [],
): Promise<TeamNameIndex> {
  const [{ data: regular }, { data: temp }, { data: extra }, { data: overrides }, { data: aliases }] = await Promise.all([
    supabase.from('league_teams').select('id, name').eq('league_id', leagueId).is('exhibition_date', null),
    supabase.from('league_teams').select('id, name').eq('league_id', leagueId).eq('exhibition_date', date),
    extraTeamIds.length > 0
      ? supabase.from('league_teams').select('id, name').in('id', extraTeamIds)
      : Promise.resolve({ data: [] as TeamRow[] }),
    quarterId
      ? supabase.from('league_team_quarter_overrides').select('team_id, name').eq('league_id', leagueId).eq('quarter_id', quarterId)
      : Promise.resolve({ data: [] as Array<{ team_id: string; name: string | null }> }),
    supabase.from('league_team_aliases').select('team_id, alias').eq('league_id', leagueId),
  ])

  const merged = new Map<string, TeamRow>()
  for (const t of [...(regular ?? []), ...(temp ?? []), ...(extra ?? [])] as TeamRow[]) merged.set(t.id, t)

  return makeTeamNameIndex(
    [...merged.values()],
    (overrides ?? []) as Array<{ team_id: string; name: string | null }>,
    // 별칭 표가 아직 없는 환경(마이그레이션 114 미실행)에서는 에러 대신 빈 배열로 떨어진다.
    //   그 경우 기본 팀명·분기명만으로 판정한다 — 못 붙이긴 해도 틀리게 붙지는 않는다.
    (aliases ?? []) as Array<{ team_id: string; alias: string }>,
  )
}
