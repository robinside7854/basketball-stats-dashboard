'use client'
// 팀 탭 「승패 흐름」 (2026-10-25 운영진 — 표 대신 작은 점) — 팀마다 경기 단위 승·무·패 점을 날짜순으로 잇고,
//   최장 연승·연패를 붙인다(「지금 N연승」은 2026-10-25 운영진 요청으로 뺐다). 규칙은 lib/stats/teamStreaks.ts(친선 제외 · 무승부에서 연속 끊김).
//   날짜가 바뀌는 곳은 점 사이를 조금 띄워 「하루」 단위가 보이게 한다.
import { useMemo } from 'react'
import { teamMarks, summarizeStreaks, type StreakGame, type Outcome } from '@/lib/stats/teamStreaks'

export type GridGame = {
  date?: string | null
  slot_num?: number | null
  quarter_id?: string | null
  home_team_id: string | null
  away_team_id: string | null
  home_score: number | null
  away_score: number | null
  is_complete?: boolean | null
  is_exhibition?: boolean | null
}
export type GridTeam = { key: string; team_id: string; name: string; color: string; quarter_ids: string[] }

const DOT: Record<Outcome, { bg: string; border: string; word: string }> = {
  W: { bg: 'var(--mm-yellow-strong)', border: 'var(--mm-yellow-strong)', word: '승' },
  D: { bg: 'transparent', border: 'var(--mm-muted)', word: '무' },
  L: { bg: 'color-mix(in srgb, var(--mm-muted) 45%, transparent)', border: 'transparent', word: '패' },
}

const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`

export default function TeamDailyRecordGrid({ games, teams }: { games: GridGame[]; teams: GridTeam[] }) {
  const rows = useMemo(() => {
    const keyOf = (tid: string | null, qid: string | null | undefined): string | null => {
      if (!tid) return null
      const t = teams.find(x => x.team_id === tid && (!qid || x.quarter_ids.includes(qid))) ?? teams.find(x => x.team_id === tid)
      return t?.key ?? null
    }
    const list: StreakGame[] = games
      .filter(g => g.date && g.is_complete !== false && !g.is_exhibition && g.home_score != null && g.away_score != null)
      .map(g => ({
        date: g.date!, slot: g.slot_num ?? 0,
        home: keyOf(g.home_team_id, g.quarter_id), away: keyOf(g.away_team_id, g.quarter_id),
        home_score: g.home_score!, away_score: g.away_score!,
      }))
    const nameOf = new Map(teams.map(t => [t.key, t.name]))
    return teams
      .map(t => ({ team: t, s: summarizeStreaks(teamMarks(list, t.key)), nameOf }))
      .filter(r => r.s.marks.length > 0)
  }, [games, teams])

  if (rows.length === 0) {
    return <p className="text-sm py-6 text-center" style={{ color: 'var(--mm-muted)' }}>이 기간에 마감된 정규전이 아직 없어요.</p>
  }

  return (
    <div className="space-y-4">
      {rows.map(({ team, s, nameOf }) => (
        <div key={team.key}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 mb-1.5">
            <span className="inline-flex items-center gap-1.5 text-sm font-black" style={{ color: 'var(--mm-ink)' }}>
              <span aria-hidden className="w-2.5 h-2.5 rounded-full" style={{ background: team.color, boxShadow: 'inset 0 0 0 1px var(--mm-rule)' }} />
              {team.name}
              <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--mm-muted)' }}>
                {s.wins}승{s.draws ? ` ${s.draws}무` : ''} {s.losses}패
              </span>
            </span>
            <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>
              최장 <b style={{ color: 'var(--mm-ink)' }}>{s.longestWin}연승</b> · <b style={{ color: 'var(--mm-ink)' }}>{s.longestLoss}연패</b>
            </span>
          </div>
          {/* 점 — 날짜가 바뀌면 간격을 넓힌다 */}
          <ol className="flex flex-wrap items-center gap-y-1.5" aria-label={`${team.name} 경기별 승패, 오래된 순`}>
            {s.marks.map((m, i) => {
              const newDay = i > 0 && s.marks[i - 1].date !== m.date
              const d = DOT[m.result]
              const opp = m.opp ? nameOf.get(m.opp) ?? '상대' : '상대'
              const label = `${md(m.date)} ${opp}전 ${m.for}:${m.against} ${d.word}`
              return (
                <li key={`${m.date}-${m.slot}-${i}`} className="flex items-center" style={{ marginLeft: i === 0 ? 0 : newDay ? 8 : 3 }}>
                  <span className="block w-2.5 h-2.5 rounded-full" title={label} aria-label={label}
                    style={{ background: d.bg, border: `1.5px solid ${d.border}` }} />
                </li>
              )
            })}
          </ol>
          <div className="mt-1 flex justify-between text-xs tabular-nums" style={{ color: 'var(--mm-muted)' }}>
            <span>{md(s.marks[0].date)}</span>
            <span>{md(s.marks[s.marks.length - 1].date)}</span>
          </div>
        </div>
      ))}
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--mm-muted)' }}>
        {(['W', 'D', 'L'] as const).map(k => (
          <span key={k} className="inline-flex items-center gap-1">
            <span aria-hidden className="w-2.5 h-2.5 rounded-full" style={{ background: DOT[k].bg, border: `1.5px solid ${DOT[k].border}` }} />{DOT[k].word}
          </span>
        ))}
        <span>· 점 하나 = 한 경기 · 날짜가 바뀌면 띄움 · 친선전 제외 · 무승부에서 연속이 끊겨요</span>
      </p>
    </div>
  )
}
