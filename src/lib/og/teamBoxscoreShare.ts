import { createClient } from '@/lib/supabase/admin'

// 파란날개(대회 전용 팀) 박스스코어 공유 링크의 미리보기 정보 (2026-10-05)
//
// 링크: /[org]/[team]/boxscore?t=<대회id>&g=<경기id>   → 경기 카드
//       /[org]/[team]/boxscore?t=<대회id>&view=season → 대회 전체 카드
//
// ⚠ 프라이버시 규칙은 리그 카드(app/league/.../opengraph-image.tsx)와 같다:
//   팀·대회·상대 이름은 **공개 팀(teams.is_public = true)일 때만** 바깥(카드·og 제목)에 낸다.
//   비공개 / 못 찾음 / 조회 오류 / URL 의 팀과 대회의 팀이 다름 → null → 호출부가 온볼 공용 카드로 폴백.
//   판정이 애매하면 항상 닫는 쪽.

export type ShareInfo =
  | {
      kind: 'game'
      teamName: string
      tournamentName: string
      date: string
      opponent: string
      round: string | null
      ourScore: number
      oppScore: number
      isComplete: boolean
    }
  | {
      kind: 'tournament'
      teamName: string
      tournamentName: string
      firstDate: string | null
      lastDate: string | null
      wins: number
      losses: number
      draws: number
      games: number
    }

export async function loadShareInfo(
  org: string,
  team: string,
  tournamentId: string | undefined,
  gameId: string | undefined,
): Promise<ShareInfo | null> {
  if (!tournamentId) return null
  try {
    const sb = createClient()
    const { data: t, error: tErr } = await sb
      .from('tournaments')
      .select('id, name, year, team_id, teams(name, is_public, org_slug, sub_slug)')
      .eq('id', tournamentId)
      .maybeSingle()
    if (tErr || !t) return null
    const tm = (t as unknown as { teams?: { name?: string | null; is_public?: boolean; org_slug?: string; sub_slug?: string } | null }).teams
    // URL 의 팀과 대회의 팀이 같아야 한다 — 남의 팀 대회 id 를 붙여 이름을 끌어내지 못하게
    if (!tm || tm.is_public !== true || tm.org_slug !== org || tm.sub_slug !== team) return null
    const teamName = (tm.name ?? '').trim()
    if (!teamName) return null
    const tournamentName = String(t.name ?? '').trim() || '대회'

    if (gameId) {
      const { data: g, error: gErr } = await sb
        .from('games')
        .select('id, tournament_id, date, opponent, round, our_score, opponent_score, is_complete')
        .eq('id', gameId)
        .maybeSingle()
      if (gErr || !g || g.tournament_id !== tournamentId) return null
      return {
        kind: 'game',
        teamName,
        tournamentName,
        date: String(g.date ?? ''),
        opponent: String(g.opponent ?? '').trim() || '상대팀',
        round: (g.round as string | null) ?? null,
        ourScore: Number(g.our_score ?? 0),
        oppScore: Number(g.opponent_score ?? 0),
        isComplete: !!g.is_complete,
      }
    }

    const { data: games, error: gsErr } = await sb
      .from('games')
      .select('date, our_score, opponent_score, is_complete')
      .eq('tournament_id', tournamentId)
      .order('date', { ascending: true })
    if (gsErr) return null
    const done = (games ?? []).filter(g => g.is_complete)
    return {
      kind: 'tournament',
      teamName,
      tournamentName,
      firstDate: games?.[0]?.date ?? null,
      lastDate: games?.[games.length - 1]?.date ?? null,
      wins: done.filter(g => g.our_score > g.opponent_score).length,
      losses: done.filter(g => g.our_score < g.opponent_score).length,
      draws: done.filter(g => g.our_score === g.opponent_score).length,
      games: done.length,
    }
  } catch {
    return null
  }
}

export function fmtDate(d: string | null): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}/.test(d)) return ''
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return `${y}.${m}.${day}`
}

export function dateRange(a: string | null, b: string | null): string {
  if (!a) return ''
  if (!b || a === b) return fmtDate(a)
  // 같은 해면 뒤쪽 연도를 줄인다: 2026.9.6 ~ 9.20
  const fa = fmtDate(a), fb = fmtDate(b)
  return a.slice(0, 4) === b.slice(0, 4) ? `${fa} ~ ${fb.slice(5)}` : `${fa} ~ ${fb}`
}

// 링크 미리보기 제목/설명 — 카드 이미지가 안 뜨는 메신저에서도 글자만으로 요약이 되게
export function shareTitle(info: ShareInfo): string {
  if (info.kind === 'game') {
    const res = !info.isComplete ? '' : info.ourScore > info.oppScore ? ' 승' : info.ourScore < info.oppScore ? ' 패' : ' 무'
    return `${info.teamName} ${info.ourScore}:${info.oppScore} ${info.opponent}${res} — 박스스코어`
  }
  // 카톡은 제목을 두 줄에서 자른다 — 대회명을 앞에 둬야 잘려도 무슨 대회인지 보인다
  return `${info.tournamentName} 전체 기록 · ${info.teamName}`
}

export function shareDescription(info: ShareInfo): string {
  if (info.kind === 'game') {
    return [info.tournamentName, info.round, fmtDate(info.date)].filter(Boolean).join(' · ') + ' · 선수별 기록'
  }
  const rec = info.games > 0 ? `${info.wins}승 ${info.losses}패${info.draws ? ` ${info.draws}무` : ''}` : ''
  return [dateRange(info.firstDate, info.lastDate), rec, '선수별 누적 기록'].filter(Boolean).join(' · ')
}
