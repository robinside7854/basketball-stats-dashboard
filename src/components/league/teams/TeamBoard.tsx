'use client'
// 팀 탭(2026-11-12 운영진 3차) — 두 칸.
//   ① 팀 성적: 순위 줄(승률·순 레이팅 · 최다 연승/연패 한 줄) + 상대 우위(대진마다 한 줄 막대)
//   ② 팀 지표 대시보드: 공격 · 슛 유형 · 수비 · 턴오버(볼 보호) — 지표마다 세 팀 막대 + 그 지표 순위
// 순위 번호는 팀 색과 섞이지 않게 무채색(1위만 진한 칸). 팀 색은 막대·점에만.
// 숫자는 teams/_lib/teamBoard.ts 한 벌, 연승·연패는 lib/stats/teamStreaks.ts.
import { useMemo, type ReactNode } from 'react'
import { swatchEdge } from '@/lib/util/contrastColor'
import { teamMarks, summarizeStreaks } from '@/lib/stats/teamStreaks'
import {
  METRIC, teamMetrics, rankTeams, type BoardTeam, type MetricKey, type MetricDef,
} from '@/app/league/[orgSlug]/[leagueId]/teams/_lib/teamBoard'

const card = { background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' } as const

function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <span aria-hidden className="inline-block rounded-full shrink-0" style={{ width: size, height: size, background: color, boxShadow: swatchEdge(color) }} />
}
/** 순위 번호 — 팀 색과 겹치지 않게 무채색. 1위만 진한 칸 */
function RankNum({ rank }: { rank: number | null }) {
  const first = rank === 1
  return (
    <span className="w-5 h-5 shrink-0 grid place-items-center text-[11px] font-black tabular-nums rounded"
      style={first ? { background: 'var(--mm-ink)', color: 'var(--mm-panel)' } : { border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)' }}>
      {rank ?? '—'}
    </span>
  )
}

export type BoardGame = { date: string; slot: number; home: string | null; away: string | null; hs: number; as: number }
export type ShotMix = Record<string, { type: string; fga: number; fgm: number }[]>

const SHOTS = [
  { type: 'shot_layup', label: '레이업', color: 'var(--mm-or)' },
  { type: 'shot_post', label: '골밑', color: 'var(--mm-positive)' },
  { type: 'shot_2p_mid', label: '미들', color: 'var(--mm-yellow)' },
  { type: 'shot_3p', label: '3점', color: 'var(--mm-dr)' },
]

export default function TeamBoard({ teams, games, shots }: { teams: BoardTeam[]; games: BoardGame[]; shots: ShotMix | null }) {
  const metrics = useMemo(() => new Map(teams.map(t => [t.key, teamMetrics(t)])), [teams])
  if (teams.length === 0) return <p className="text-sm text-center py-10" style={{ color: 'var(--mm-muted)' }}>이 기간에 팀 기록이 아직 없어요.</p>

  return (
    <div className="space-y-6">
      <Block title="팀 성적">
        <Standings teams={teams} metrics={metrics} games={games} />
        <Matchups teams={teams} games={games} />
      </Block>

      <Block title="팀 지표" sub="지표마다 팀 순위 · 이 분기 팀끼리">
        <div className="grid gap-3 lg:grid-cols-2">
          <Group title="공격" keys={['ortg', 'ppg', 'efg', 'astRatio', 'fbpg']} teams={teams} metrics={metrics} />
          <ShotGroup teams={teams} shots={shots} />
          <Group title="수비" keys={['drtg', 'oppg', 'spg', 'bpg', 'drpg']} teams={teams} metrics={metrics} />
          <Group title="턴오버 · 볼 보호" keys={['tovPct', 'topg', 'orpg']} teams={teams} metrics={metrics} />
        </div>
      </Block>
    </div>
  )
}

function Block({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex flex-wrap items-baseline gap-x-2 break-keep">
        <h3 className="font-black text-xl" style={{ color: 'var(--mm-ink)' }}>{title}</h3>
        {sub && <span className="text-xs font-semibold" style={{ color: 'var(--mm-muted)' }}>{sub}</span>}
      </div>
      {children}
    </section>
  )
}

function Standings({ teams, metrics, games }: { teams: BoardTeam[]; metrics: Map<string, Partial<Record<MetricKey, number>>>; games: BoardGame[] }) {
  const streaks = useMemo(() => {
    const list = games.map(g => ({ date: g.date, slot: g.slot, home: g.home, away: g.away, home_score: g.hs, away_score: g.as }))
    return new Map(teams.map(t => [t.key, summarizeStreaks(teamMarks(list, t.key))]))
  }, [teams, games])
  return (
    <ol className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
      {teams.map((t, i) => {
        const played = t.w + t.d + t.l
        const net = metrics.get(t.key)?.net
        const s = streaks.get(t.key)
        return (
          <li key={t.key} className="px-3 py-2.5 break-keep" style={card}>
            <div className="flex items-center gap-2.5">
              <span className="font-jersey font-black text-2xl w-6 tabular-nums" style={{ color: i === 0 ? 'var(--mm-ink)' : 'var(--mm-muted)' }}>{i + 1}</span>
              <Dot color={t.color} />
              <span className="flex-1 min-w-0">
                <span className="block font-black whitespace-nowrap" style={{ color: 'var(--mm-ink)' }}>{t.name}</span>
                <span className="block text-xs font-bold tabular-nums" style={{ color: 'var(--mm-muted)' }}>{t.w}승 {t.l}패{t.d ? ` ${t.d}무` : ''}</span>
              </span>
              <span className="text-right">
                <span className="block font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>{played ? `${(t.w / played * 100).toFixed(0)}%` : '—'}</span>
                {net != null && <span className="block text-xs font-bold tabular-nums" style={{ color: net >= 0 ? 'var(--mm-positive)' : 'var(--mm-negative)' }}>순 {net >= 0 ? '+' : ''}{net.toFixed(1)}</span>}
              </span>
            </div>
            {s && s.marks.length > 0 && (
              <p className="mt-1.5 text-[11px] font-semibold tabular-nums" style={{ color: 'var(--mm-muted)' }}>
                최다 {s.longestWin}연승 · 최다 {s.longestLoss}연패
              </p>
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** 상대 우위 — 대진마다 한 줄: 양 끝 팀 이름, 가운데 막대(승 비율만큼 그 팀 색), 우위 팀 굵게 */
function Matchups({ teams, games }: { teams: BoardTeam[]; games: BoardGame[] }) {
  const rows = useMemo(() => {
    const out: { a: BoardTeam; b: BoardTeam; aw: number; bw: number; d: number }[] = []
    for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) {
      const a = teams[i], b = teams[j]
      let aw = 0, bw = 0, d = 0
      for (const g of games) {
        const ah = g.home === a.key && g.away === b.key, bh = g.home === b.key && g.away === a.key
        if (!ah && !bh) continue
        const af = ah ? g.hs : g.as, bf = ah ? g.as : g.hs
        if (af > bf) aw++; else if (bf > af) bw++; else d++
      }
      if (aw + bw + d > 0) out.push({ a, b, aw, bw, d })
    }
    return out
  }, [teams, games])
  if (rows.length === 0) return null
  return (
    <div className="p-3 space-y-3" style={card}>
      <p className="text-sm font-black" style={{ color: 'var(--mm-ink)' }}>상대 전적</p>
      {rows.map(({ a, b, aw, bw, d }) => {
        const n = aw + bw + d
        const lead = aw > bw ? a : bw > aw ? b : null
        return (
          <div key={`${a.key}|${b.key}`} className="break-keep">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="inline-flex items-center gap-1.5 font-black" style={{ color: lead === a ? 'var(--mm-ink)' : 'var(--mm-muted)' }}><Dot color={a.color} />{a.name} {aw}승</span>
              <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>{lead ? `${lead.name} 우위` : '팽팽'}{d ? ` · ${d}무` : ''}</span>
              <span className="inline-flex items-center gap-1.5 font-black" style={{ color: lead === b ? 'var(--mm-ink)' : 'var(--mm-muted)' }}>{bw}승 {b.name}<Dot color={b.color} /></span>
            </div>
            <div className="mt-1.5 flex h-3 rounded-full overflow-hidden" style={{ background: 'var(--mm-panel-alt)' }}>
              <span style={{ width: `${aw / n * 100}%`, background: a.color, boxShadow: swatchEdge(a.color), opacity: lead === b ? 0.45 : 1 }} />
              <span style={{ width: `${d / n * 100}%` }} />
              <span style={{ width: `${bw / n * 100}%`, background: b.color, boxShadow: swatchEdge(b.color), opacity: lead === a ? 0.45 : 1 }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function Group({ title, keys, teams, metrics }: { title: string; keys: MetricKey[]; teams: BoardTeam[]; metrics: Map<string, Partial<Record<MetricKey, number>>> }) {
  return (
    <div className="p-3 space-y-3" style={card}>
      <p className="text-base font-black" style={{ color: 'var(--mm-ink)' }}>{title}</p>
      {keys.map(k => <MetricBars key={k} m={METRIC[k]} teams={teams} metrics={metrics} />)}
    </div>
  )
}

function MetricBars({ m, teams, metrics }: { m: MetricDef; teams: BoardTeam[]; metrics: Map<string, Partial<Record<MetricKey, number>>> }) {
  const ranked = rankTeams(teams, metrics, m)
  const max = Math.max(...ranked.map(r => r.v ?? 0), 0) || 1
  return (
    <div className="break-keep">
      <p className="text-xs font-bold" style={{ color: 'var(--mm-ink-soft)' }}>
        {m.label} <span className="font-semibold" style={{ color: 'var(--mm-muted)' }}>· {m.hint}</span>
      </p>
      <ol className="mt-1 space-y-1">
        {ranked.map(r => (
          <li key={r.team.key} className="flex items-center gap-2">
            <RankNum rank={r.rank} />
            <span className="w-16 sm:w-20 shrink-0 text-xs font-bold whitespace-nowrap" style={{ color: 'var(--mm-ink-soft)' }}>{r.team.name}</span>
            <span className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--mm-panel-alt)' }}>
              <span className="block h-full rounded-full" style={{ width: `${(r.v ?? 0) / max * 100}%`, background: r.team.color, boxShadow: swatchEdge(r.team.color) }} />
            </span>
            <span className="w-14 text-right text-sm font-black tabular-nums whitespace-nowrap" style={{ color: r.rank === 1 ? 'var(--mm-ink)' : 'var(--mm-ink-soft)' }}>{r.v == null ? '—' : m.fmt(r.v)}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** 슛 유형 — 팀마다 시도 비중 쌓은 막대 + 유형별 성공률 순위 */
function ShotGroup({ teams, shots }: { teams: BoardTeam[]; shots: ShotMix | null }) {
  const rows = teams.map(t => {
    const list = shots?.[t.key] ?? []
    const by = new Map(SHOTS.map(s => [s.type, { fga: 0, fgm: 0 }]))
    for (const r of list) { const c = by.get(r.type); if (c) { c.fga += r.fga; c.fgm += r.fgm } }
    const total = [...by.values()].reduce((s, c) => s + c.fga, 0)
    return { team: t, by, total }
  })
  return (
    <div className="p-3 space-y-3" style={card}>
      <p className="text-base font-black" style={{ color: 'var(--mm-ink)' }}>슛 유형</p>
      {shots === null ? <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>불러오는 중</p> : (<>
        <div className="space-y-2">
          <p className="text-xs font-bold" style={{ color: 'var(--mm-ink-soft)' }}>시도 비중</p>
          {rows.map(({ team, by, total }) => (
            <div key={team.key} className="flex items-center gap-2">
              <span className="w-[5.25rem] sm:w-24 shrink-0 inline-flex items-center gap-1.5 text-xs font-bold whitespace-nowrap" style={{ color: 'var(--mm-ink-soft)' }}><Dot color={team.color} size={8} />{team.name}</span>
              <span className="flex-1 flex h-4 rounded overflow-hidden" style={{ background: 'var(--mm-panel-alt)' }}>
                {total > 0 && SHOTS.map(s => {
                  const w = by.get(s.type)!.fga / total * 100
                  return w > 0 ? <span key={s.type} title={`${s.label} ${w.toFixed(0)}%`} className="grid place-items-center text-[10px] font-black" style={{ width: `${w}%`, background: s.color, color: 'var(--mm-black)' }}>{w >= 14 ? `${w.toFixed(0)}` : ''}</span> : null
                })}
              </span>
            </div>
          ))}
          <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-bold" style={{ color: 'var(--mm-muted)' }}>
            {SHOTS.map(s => <li key={s.type} className="inline-flex items-center gap-1"><span aria-hidden className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</li>)}
            <li>· 숫자 = 시도 중 %</li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold mb-1" style={{ color: 'var(--mm-ink-soft)' }}>유형별 성공률 1위</p>
          <ul className="grid grid-cols-2 gap-1.5">
            {SHOTS.map(s => {
              const best = rows
                .map(r => { const c = r.by.get(s.type)!; return { team: r.team, pct: c.fga >= 5 ? c.fgm / c.fga * 100 : null } })
                .filter(x => x.pct != null).sort((a, b) => b.pct! - a.pct!)[0]
              return (
                <li key={s.type} className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-bold" style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-ctl)' }}>
                  <span style={{ color: 'var(--mm-muted)' }}>{s.label}</span>
                  {best ? <><Dot color={best.team.color} size={8} /><span style={{ color: 'var(--mm-ink)' }}>{best.team.name}</span><span className="ml-auto tabular-nums" style={{ color: 'var(--mm-ink)' }}>{best.pct!.toFixed(0)}%</span></> : <span className="ml-auto">—</span>}
                </li>
              )
            })}
          </ul>
        </div>
      </>)}
    </div>
  )
}
