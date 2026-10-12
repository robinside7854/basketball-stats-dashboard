'use client'
// 하루 공격 유형 — 날짜별 박스스코어의 「공격 유형」 탭 (2026-10-12).
//
// 데이터는 daily-boxscore 의 `shot_types` — (경기, 선수, 슛 유형) 한 줄 = 시도·성공.
//   팀별·선수별·「전체」 합산은 여기서 더한다(서버가 합산본을 따로 주면 두 벌이 된다).
//   유형별 합은 박스스코어의 FG 와 같다(같은 이벤트·같은 판정).
//
// 득점은 보여주지 않는다 — +1 가산 규칙(isPlusOneFor) 때문에 "성공 × 2/3" 이 실제 득점과 어긋난다.
// 색만으로 구분하지 않는다: 모든 막대 옆에 유형 이름·숫자를 글로 둔다.
import { useMemo, useState, type CSSProperties } from 'react'
import { Target } from 'lucide-react'

export interface ShotTypeRow {
  game_id: string
  player_id: string
  team_id: string | null
  type: string
  fga: number
  fgm: number
}

export interface ShotGame {
  id: string
  /** 「3경기」 처럼 카드에 쓰는 번호 라벨 */
  numLabel: string
  homeName: string
  awayName: string
}

export interface ShotTeam { id: string; name: string; color: string | null }
export interface ShotPlayer { name: string; team_id: string | null }

/** 화면 순서 = 바스켓에서 먼 쪽부터. 라벨은 lib/highlights/clip.ts 의 SHOT_TYPE_LABEL 과 같다. */
const TYPES = [
  { type: 'shot_3p',     label: '3점슛', short: '3점', color: 'var(--mm-dr)' },
  { type: 'shot_2p_mid', label: '미들슛', short: '미들', color: 'var(--mm-yellow)' },
  { type: 'shot_layup',  label: '레이업', short: '레이업', color: 'var(--mm-or)' },
  { type: 'shot_post',   label: '골밑슛', short: '골밑', color: 'var(--mm-positive)' },
] as const

type Counts = Record<string, { fga: number; fgm: number }>
const emptyCounts = (): Counts => Object.fromEntries(TYPES.map(t => [t.type, { fga: 0, fgm: 0 }]))
const totalOf = (c: Counts) => TYPES.reduce((a, t) => ({ fga: a.fga + c[t.type].fga, fgm: a.fgm + c[t.type].fgm }), { fga: 0, fgm: 0 })
const pctText = (m: number, a: number) => a > 0 ? `${Math.round(m / a * 1000) / 10}%` : '—'
const shareOf = (a: number, total: number) => total > 0 ? Math.round(a / total * 1000) / 10 : 0

const chipStyle = (on: boolean): CSSProperties => on
  ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }
  : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }
const chipClass = 'shrink-0 px-3 min-h-11 text-xs font-black tracking-wide whitespace-nowrap cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1'

/** 시도 비중을 한 줄 막대로 — 유형별 조각. 글 값은 옆 표가 맡으므로 그림은 aria-hidden. */
function StackBar({ counts, total }: { counts: Counts; total: number }) {
  return (
    <div aria-hidden className="flex h-2.5 w-full overflow-hidden" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}>
      {TYPES.map(t => {
        const w = shareOf(counts[t.type].fga, total)
        return w > 0 ? <div key={t.type} style={{ width: `${w}%`, background: t.color }} /> : null
      })}
    </div>
  )
}

function Legend() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1" aria-label="막대 색 범례">
      {TYPES.map(t => (
        <li key={t.type} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--mm-ink-soft)' }}>
          <span aria-hidden className="w-2.5 h-2.5 shrink-0" style={{ background: t.color }} />
          {t.label}
        </li>
      ))}
    </ul>
  )
}

/** 팀(또는 하루 전체) 한 장 — 유형 4줄: 이름 · 시도 비중 막대 · 성공/시도 · 야투율 */
function TeamCard({ title, color, counts }: { title: string; color: string | null; counts: Counts }) {
  const tot = totalOf(counts)
  return (
    <section
      aria-label={`${title} 공격 유형`}
      className="p-3 sm:p-4"
      style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
    >
      <div className="flex items-center gap-2 mb-2.5 pb-1.5 min-w-0" style={{ borderBottom: `3px solid ${color ?? 'var(--mm-rule)'}` }}>
        {color && <span aria-hidden className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />}
        <span className="font-jersey font-bold text-base truncate min-w-0" style={{ color: 'var(--mm-ink)' }}>{title}</span>
        <span className="ml-auto t-num text-sm font-black shrink-0" style={{ color: 'var(--mm-ink-soft)' }}>
          야투 {tot.fgm}/{tot.fga} <span style={{ color: 'var(--mm-muted)' }}>({pctText(tot.fgm, tot.fga)})</span>
        </span>
      </div>
      <table className="w-full">
        <caption className="sr-only">{title} 유형별 시도 비중 · 성공/시도 · 야투율</caption>
        <thead>
          <tr>
            <th scope="col" className="t-label text-left font-normal pb-1 w-[4.5rem]">유형</th>
            <th scope="col" className="t-label text-left font-normal pb-1">시도 비중</th>
            <th scope="col" className="t-label text-right font-normal pb-1 w-[4rem] whitespace-nowrap">성공/시도</th>
            <th scope="col" className="t-label text-right font-normal pb-1 w-[3.5rem] whitespace-nowrap">야투율</th>
          </tr>
        </thead>
        <tbody>
          {TYPES.map(t => {
            const c = counts[t.type]
            const share = shareOf(c.fga, tot.fga)
            return (
              <tr key={t.type} style={{ borderTop: '1px solid var(--mm-rule)' }}>
                <th scope="row" className="py-2 pr-2 text-left text-sm font-semibold whitespace-nowrap" style={{ color: 'var(--mm-ink)' }}>
                  <span aria-hidden className="inline-block w-2 h-2 mr-1.5 align-middle" style={{ background: t.color }} />
                  {t.label}
                </th>
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div aria-hidden className="flex-1 h-2 min-w-[2rem]" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}>
                      <div className="h-full" style={{ width: `${share}%`, background: t.color }} />
                    </div>
                    <span className="t-num text-xs font-bold w-[2.5rem] text-right shrink-0" style={{ color: 'var(--mm-ink-soft)' }}>{Math.round(share)}%</span>
                  </div>
                </td>
                <td className="py-2 text-right t-num text-sm" style={{ color: 'var(--mm-ink-soft)' }}>{c.fgm}/{c.fga}</td>
                <td className="py-2 text-right t-num text-sm font-black" style={{ color: c.fga > 0 ? 'var(--mm-ink)' : 'var(--mm-muted)' }}>{pctText(c.fgm, c.fga)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

export default function ShotTypeBreakdown({ rows, games, teams, players }: {
  rows: ShotTypeRow[]
  games: ShotGame[]
  /** 그날 출전한 팀(이름·색) — 팀 id 로 이름을 찾는다 */
  teams: ShotTeam[]
  players: Map<string, ShotPlayer>
}) {
  const [scope, setScope] = useState<string>('all')
  const [view, setView] = useState<'team' | 'player'>('team')
  const [teamFilter, setTeamFilter] = useState<string>('all')

  const teamMeta = useMemo(() => new Map(teams.map(t => [t.id, t])), [teams])
  const gamesWithShots = useMemo(() => new Set(rows.map(r => r.game_id)), [rows])
  const scoped = useMemo(() => scope === 'all' ? rows : rows.filter(r => r.game_id === scope), [rows, scope])

  // 팀별 합 — 팀 판정이 안 된 줄(옛 기록)은 「팀 미정」으로 모은다(버리면 하루 합과 어긋난다)
  const byTeam = useMemo(() => {
    const m = new Map<string, { key: string; name: string; color: string | null; counts: Counts }>()
    for (const r of scoped) {
      const key = r.team_id ?? 'none'
      let t = m.get(key)
      if (!t) {
        const meta = r.team_id ? teamMeta.get(r.team_id) : undefined
        t = { key, name: meta?.name ?? '팀 미정', color: meta?.color ?? null, counts: emptyCounts() }
        m.set(key, t)
      }
      const c = t.counts[r.type]
      if (!c) continue
      c.fga += r.fga; c.fgm += r.fgm
    }
    // 그날 팀 순서(경기 카드에 처음 나온 순)를 따른다
    const order = new Map(teams.map((t, i) => [t.id, i]))
    return [...m.values()].sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99))
  }, [scoped, teamMeta, teams])

  const dayCounts = useMemo(() => {
    const c = emptyCounts()
    for (const r of scoped) { if (c[r.type]) { c[r.type].fga += r.fga; c[r.type].fgm += r.fgm } }
    return c
  }, [scoped])

  // 선수별 합 — 한 선수가 하루에 두 팀을 오가면(임시 출전) 팀별로 따로 센다
  const byPlayer = useMemo(() => {
    const m = new Map<string, { key: string; player_id: string; team_id: string | null; counts: Counts }>()
    for (const r of scoped) {
      const key = `${r.player_id}|${r.team_id ?? ''}`
      let p = m.get(key)
      if (!p) { p = { key, player_id: r.player_id, team_id: r.team_id, counts: emptyCounts() }; m.set(key, p) }
      const c = p.counts[r.type]
      if (!c) continue
      c.fga += r.fga; c.fgm += r.fgm
    }
    return [...m.values()]
      .map(p => ({ ...p, tot: totalOf(p.counts) }))
      .filter(p => p.tot.fga > 0)
      .sort((a, b) => b.tot.fga - a.tot.fga || b.tot.fgm - a.tot.fgm)
  }, [scoped])

  const dayTot = totalOf(dayCounts)

  if (rows.length === 0) {
    return (
      <div className="text-center py-12" style={{ color: 'var(--mm-muted)' }}>
        <Target size={24} className="mx-auto mb-2" aria-hidden />
        <p className="text-sm">이날 기록된 야투가 없습니다.</p>
      </div>
    )
  }

  const playerTeams = byTeam.filter(t => t.key !== 'none')
  const activeTeamFilter = teamFilter === 'all' || playerTeams.some(t => t.key === teamFilter) ? teamFilter : 'all'
  const shownPlayers = activeTeamFilter === 'all' ? byPlayer : byPlayer.filter(p => p.team_id === activeTeamFilter)

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>
        야투를 3점슛 · 미들슛 · 레이업 · 골밑슛으로 나눠, 어떤 슛을 얼마나 던졌고(시도 비중) 얼마나 넣었는지(야투율) 보여줍니다. 자유투는 빠집니다.
      </p>

      {/* 범위 — 전체 / 경기별 */}
      {games.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap pb-1" role="group" aria-label="공격 유형을 볼 경기">
          <button type="button" onClick={() => setScope('all')} aria-pressed={scope === 'all'} className={chipClass} style={chipStyle(scope === 'all')}>전체</button>
          {games.map(g => {
            const on = scope === g.id
            const has = gamesWithShots.has(g.id)
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setScope(g.id)}
                aria-pressed={on}
                className={chipClass}
                style={{ ...chipStyle(on), opacity: has || on ? 1 : 0.6 }}
              >
                {g.numLabel} <span className="font-bold">{g.homeName} vs {g.awayName}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* 보기 — 팀별 / 선수별 */}
      <div className="flex items-center gap-1.5" role="group" aria-label="보기 방식">
        <button type="button" onClick={() => setView('team')} aria-pressed={view === 'team'} className={chipClass} style={chipStyle(view === 'team')}>팀별</button>
        <button type="button" onClick={() => setView('player')} aria-pressed={view === 'player'} className={chipClass} style={chipStyle(view === 'player')}>선수별</button>
      </div>

      <Legend />

      {dayTot.fga === 0 ? (
        <p className="text-sm text-center py-10" style={{ color: 'var(--mm-muted)', border: '1px dashed var(--mm-rule)' }}>
          이 경기에는 기록된 야투가 없습니다.
        </p>
      ) : view === 'team' ? (
        <div className="space-y-3">
          <TeamCard title={scope === 'all' ? '이날 전체' : '이 경기 전체'} color={null} counts={dayCounts} />
          <div className="grid gap-3 lg:grid-cols-2">
            {byTeam.map(t => <TeamCard key={t.key} title={t.name} color={t.color} counts={t.counts} />)}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {playerTeams.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="팀으로 거르기">
              <button type="button" onClick={() => setTeamFilter('all')} aria-pressed={activeTeamFilter === 'all'} className={chipClass} style={chipStyle(activeTeamFilter === 'all')}>전체</button>
              {playerTeams.map(t => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTeamFilter(t.key)}
                  aria-pressed={activeTeamFilter === t.key}
                  className={`${chipClass} inline-flex items-center gap-1.5`}
                  style={chipStyle(activeTeamFilter === t.key)}
                >
                  {t.color && <span aria-hidden className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />}
                  {t.name}
                </button>
              ))}
            </div>
          )}
          <ul className="space-y-2">
            {shownPlayers.map(p => {
              const meta = p.team_id ? teamMeta.get(p.team_id) : undefined
              const name = players.get(p.player_id)?.name ?? '?'
              return (
                <li key={p.key} className="p-3" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}>
                  <div className="flex items-center gap-2 mb-2 min-w-0">
                    <span aria-hidden className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: meta?.color ?? 'var(--mm-muted)' }} />
                    <span className="text-base font-semibold truncate min-w-0" style={{ color: 'var(--mm-ink)' }}>{name}</span>
                    {meta && <span className="text-xs shrink-0" style={{ color: 'var(--mm-muted)' }}>{meta.name}</span>}
                    <span className="ml-auto t-num text-sm font-black shrink-0" style={{ color: 'var(--mm-ink)' }}>
                      {p.tot.fgm}/{p.tot.fga} <span className="font-semibold" style={{ color: 'var(--mm-muted)' }}>({pctText(p.tot.fgm, p.tot.fga)})</span>
                    </span>
                  </div>
                  <StackBar counts={p.counts} total={p.tot.fga} />
                  {/* 유형별 성공/시도 — 시도가 없는 유형은 흐리게. 360px 에서 2열 */}
                  <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-1">
                    {TYPES.map(t => {
                      const c = p.counts[t.type]
                      const on = c.fga > 0
                      return (
                        <div key={t.type} className="flex items-start gap-1.5 min-w-0" style={{ opacity: on ? 1 : 0.55 }}>
                          <dt className="flex items-center gap-1 text-xs shrink-0" style={{ color: 'var(--mm-muted)' }}>
                            <span aria-hidden className="w-2 h-2 shrink-0" style={{ background: t.color }} />
                            {t.short}
                          </dt>
                          <dd className="t-num text-sm font-semibold min-w-0" style={{ color: 'var(--mm-ink)' }}>
                            {c.fgm}/{c.fga}
                            {on && <span className="text-xs font-normal" style={{ color: 'var(--mm-muted)' }}> {pctText(c.fgm, c.fga)}</span>}
                            {on && <span className="block text-xs font-normal leading-tight" style={{ color: 'var(--mm-muted)' }}>비중 {Math.round(shareOf(c.fga, p.tot.fga))}%</span>}
                          </dd>
                        </div>
                      )
                    })}
                  </dl>
                </li>
              )
            })}
          </ul>
          {shownPlayers.length === 0 && (
            <p className="text-sm text-center py-8" style={{ color: 'var(--mm-muted)' }}>이 팀은 이 범위에서 기록된 야투가 없습니다.</p>
          )}
        </div>
      )}
    </div>
  )
}
