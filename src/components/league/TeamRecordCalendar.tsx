'use client'
// 팀 탭 라커룸 「승패 달력」(2026-11-12 운영진 — 점 줄은 직관적이지 않았다).
//   고른 팀 하나의 경기일을 달별로 묶어 칸으로 보인다: 날짜 · 그날 승패 · 경기마다 작은 네모(승 노랑 · 패 회색 · 무 테두리).
//   규칙은 종전 TeamDailyRecordGrid 와 같다(lib/stats/teamStreaks.ts — 친선 제외 · 마감 경기만 · 무승부에서 연속 끊김).
import { useMemo } from 'react'
import { teamMarks, summarizeStreaks, type StreakGame, type Outcome, type TeamGameMark } from '@/lib/stats/teamStreaks'
import type { GridGame, GridTeam } from '@/components/league/TeamDailyRecordGrid'

const BOX: Record<Outcome, { bg: string; border: string; word: string }> = {
  W: { bg: 'var(--mm-yellow-strong)', border: 'var(--mm-yellow-strong)', word: '승' },
  D: { bg: 'transparent', border: 'var(--mm-muted)', word: '무' },
  L: { bg: 'color-mix(in srgb, var(--mm-muted) 45%, transparent)', border: 'transparent', word: '패' },
}
const DOW = ['일', '월', '화', '수', '목', '금', '토']
const md = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`
const dow = (d: string) => DOW[new Date(`${d}T00:00:00`).getDay()] ?? ''

export default function TeamRecordCalendar({ games, teams, focusKey }: { games: GridGame[]; teams: GridTeam[]; focusKey: string }) {
  const { s, months, nameOf } = useMemo(() => {
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
    const s = summarizeStreaks(teamMarks(list, focusKey))
    // 달 → 날짜 → 경기들 (최근 달이 위)
    const byMonth = new Map<string, Map<string, TeamGameMark[]>>()
    for (const m of s.marks) {
      const mon = m.date.slice(0, 7)
      if (!byMonth.has(mon)) byMonth.set(mon, new Map())
      const days = byMonth.get(mon)!
      if (!days.has(m.date)) days.set(m.date, [])
      days.get(m.date)!.push(m)
    }
    const months = [...byMonth.entries()].sort((a, b) => b[0].localeCompare(a[0]))
      .map(([mon, days]) => ({ mon, days: [...days.entries()].sort((a, b) => a[0].localeCompare(b[0])) }))
    return { s, months, nameOf: new Map(teams.map(t => [t.key, t.name])) }
  }, [games, teams, focusKey])

  if (s.marks.length === 0) {
    return <p className="text-sm py-6 text-center" style={{ color: 'var(--mm-muted)' }}>이 기간에 마감된 정규전이 아직 없어요.</p>
  }

  const cur = s.current
  return (
    <div className="space-y-4 break-keep">
      {/* 요약 한 줄 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: '전적', value: `${s.wins}승${s.draws ? ` ${s.draws}무` : ''} ${s.losses}패` },
          { label: '최장 연승', value: `${s.longestWin}연승` },
          { label: '지금 흐름', value: cur && cur.result !== 'D' ? `${cur.length}${cur.result === 'W' ? '연승' : '연패'}` : '—' },
        ].map(c => (
          <div key={c.label} className="px-2 py-2.5 text-center" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}>
            <div className="font-black tabular-nums text-sm sm:text-lg whitespace-nowrap" style={{ color: 'var(--mm-ink)' }}>{c.value}</div>
            <div className="text-xs font-bold mt-0.5" style={{ color: 'var(--mm-muted)' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {months.map(({ mon, days }) => (
        <div key={mon}>
          <p className="text-sm font-black mb-1.5" style={{ color: 'var(--mm-ink)' }}>{Number(mon.slice(5, 7))}월</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
            {days.map(([date, ms]) => {
              const w = ms.filter(m => m.result === 'W').length
              const l = ms.filter(m => m.result === 'L').length
              const d = ms.length - w - l
              const good = w > l, bad = l > w
              return (
                <div key={date} className="p-2.5"
                  style={{
                    background: good ? 'var(--mm-yellow-soft)' : 'var(--mm-panel-alt)',
                    border: `1px solid ${good ? 'var(--mm-yellow-strong)' : 'var(--mm-rule)'}`,
                    borderRadius: 'var(--mm-radius-ctl)',
                  }}>
                  <div className="text-xs font-bold tabular-nums whitespace-nowrap" style={{ color: 'var(--mm-muted)' }}>{md(date)} ({dow(date)})</div>
                  <div className="mt-0.5 text-sm font-black tabular-nums whitespace-nowrap" style={{ color: bad ? 'var(--mm-ink-soft)' : 'var(--mm-ink)' }}>
                    {w}승{d ? ` ${d}무` : ''} {l}패
                  </div>
                  <ol className="mt-2 flex flex-wrap gap-1" aria-label={`${md(date)} 경기별 결과`}>
                    {ms.map((m, i) => {
                      const b = BOX[m.result]
                      const label = `${m.opp ? nameOf.get(m.opp) ?? '상대' : '상대'}전 ${m.for}:${m.against} ${b.word}`
                      return (
                        <li key={`${m.slot}-${i}`} title={label} aria-label={label}
                          className="w-4 h-4 rounded-[3px]" style={{ background: b.bg, border: `1.5px solid ${b.border}` }} />
                      )
                    })}
                  </ol>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--mm-muted)' }}>
        {(['W', 'D', 'L'] as const).map(k => (
          <span key={k} className="inline-flex items-center gap-1">
            <span aria-hidden className="w-3 h-3 rounded-[3px]" style={{ background: BOX[k].bg, border: `1.5px solid ${BOX[k].border}` }} />{BOX[k].word}
          </span>
        ))}
        <span>· 네모 하나 = 한 경기 · 노란 칸 = 이긴 날</span>
      </p>
    </div>
  )
}
