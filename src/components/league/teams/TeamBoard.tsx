'use client'
// 팀 탭 개편(2026-11-12 운영진 「데이터가 너무 많아 뭘 봐야 할지 모르겠다」) — 세 층.
//   1층 순위판: 팀 순위 한 줄씩 + 지표 8칸(박스마다 세 팀 1·2·3위) + 상대 전적표
//   2층 레이더: 육각형 하나에 팀을 겹쳐서(고른 분기의 팀끼리 — 가장 좋은 팀 = 바깥 끝)
//   3층 라커룸: 팀을 골라 선수 사물함(기여도 몫) — 표·공격 유형은 페이지가 children 으로 넣는다
// 숫자는 전부 teams/_lib/teamBoard.ts 한 벌.
import { useMemo, useState, type ReactNode } from 'react'
import Image from 'next/image'
import { Crown } from 'lucide-react'
import type { PlayerStat } from '@/types/league'
import { swatchEdge, textOnBg } from '@/lib/util/contrastColor'
import {
  BOARD_METRICS, RADAR_METRICS, RADAR_LABEL, teamMetrics, rankTeams, radarScore, contributions,
  type BoardTeam, type MetricKey, type H2HCell,
} from '@/app/league/[orgSlug]/[leagueId]/teams/_lib/teamBoard'
import PlayerName from '@/components/league/ui/PlayerName'

const card = { background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' } as const
const MEDAL = ['#D4A017', '#A8A9AD', '#B87333']

function Dot({ color, size = 10 }: { color: string; size?: number }) {
  return <span aria-hidden className="inline-block rounded-full shrink-0" style={{ width: size, height: size, background: color, boxShadow: swatchEdge(color) }} />
}

function Floor({ n, title, sub, children }: { n: number; title: string; sub: string; children: ReactNode }) {
  return (
    <section className="space-y-3" aria-label={title}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 break-keep">
        <span className="text-xs font-black tabular-nums px-1.5 py-0.5" style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)', borderRadius: 4 }}>{n}층</span>
        <h3 className="font-black text-xl" style={{ color: 'var(--mm-ink)' }}>{title}</h3>
        <span className="text-xs font-semibold" style={{ color: 'var(--mm-muted)' }}>{sub}</span>
      </div>
      {children}
    </section>
  )
}

export type BoardGame = { home: string | null; away: string | null; hs: number; as: number }

export default function TeamBoard({ teams, games, activeKey, onSelect, locker }: {
  teams: BoardTeam[]
  /** 마감 정규전 — 정체성 key 로 풀어 둔 것 */
  games: BoardGame[]
  activeKey: string | null
  onSelect: (key: string) => void
  /** 3층 라커룸 아래(선수 표·공격 유형) — 페이지가 넣는다 */
  locker: ReactNode
}) {
  const metrics = useMemo(() => new Map(teams.map(t => [t.key, teamMetrics(t)])), [teams])
  const active = teams.find(t => t.key === activeKey) ?? teams[0] ?? null

  if (teams.length === 0) return <p className="text-sm text-center py-10" style={{ color: 'var(--mm-muted)' }}>이 기간에 팀 기록이 아직 없어요.</p>

  return (
    <div className="space-y-8">
      <Floor n={1} title="순위판" sub="지표마다 세 팀 순위 · 팀을 누르면 라커룸으로">
        <Standings teams={teams} metrics={metrics} activeKey={active?.key ?? null} onSelect={onSelect} />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {BOARD_METRICS.map(m => (
            <div key={m.key} className="p-3 break-keep" style={card}>
              <p className="text-sm font-black" style={{ color: 'var(--mm-ink)' }}>{m.label}</p>
              <p className="text-xs mb-2" style={{ color: 'var(--mm-muted)' }}>{m.hint}</p>
              <ol className="space-y-1.5">
                {rankTeams(teams, metrics, m).map(r => (
                  <li key={r.team.key}>
                    <button type="button" onClick={() => onSelect(r.team.key)} className="mm-press w-full flex items-center gap-1.5 text-left cursor-pointer">
                      <span className="w-5 h-5 shrink-0 grid place-items-center text-[11px] font-black rounded-full tabular-nums"
                        style={r.rank && r.rank <= 3 ? { background: MEDAL[r.rank - 1], color: '#fff' } : { background: 'var(--mm-panel-alt)', color: 'var(--mm-muted)' }}>{r.rank ?? '—'}</span>
                      <Dot color={r.team.color} size={8} />
                      <span className="text-xs font-bold min-w-0 flex-1 whitespace-nowrap" style={{ color: 'var(--mm-ink-soft)' }}>{r.team.name}</span>
                      <span className="text-sm font-black tabular-nums whitespace-nowrap" style={{ color: r.rank === 1 ? 'var(--mm-ink)' : 'var(--mm-ink-soft)' }}>{r.v == null ? '—' : m.fmt(r.v)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <H2HMatrix teams={teams} games={games} />
      </Floor>

      <Floor n={2} title="팀 레이더" sub="이 분기 팀끼리 비교 · 가장 잘한 팀이 바깥 끝">
        <TeamRadar teams={teams} metrics={metrics} />
      </Floor>

      <Floor n={3} title="라커룸" sub="팀을 골라 선수마다 팀에 보탠 몫을 봐요">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="라커룸 팀 고르기">
          {teams.map(t => {
            const on = t.key === active?.key
            return (
              <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => onSelect(t.key)}
                className="mm-press min-h-11 px-4 flex items-center gap-2 text-sm font-black cursor-pointer"
                style={on
                  ? { background: t.color, color: textOnBg(t.color), boxShadow: swatchEdge(t.color), borderRadius: 'var(--mm-radius-chip)' }
                  : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)' }}>
                {!on && <Dot color={t.color} />}{t.name}
              </button>
            )
          })}
        </div>
        {active && <LockerWall team={active} />}
        {locker}
      </Floor>
    </div>
  )
}

function Standings({ teams, metrics, activeKey, onSelect }: {
  teams: BoardTeam[]; metrics: Map<string, Partial<Record<MetricKey, number>>>; activeKey: string | null; onSelect: (k: string) => void
}) {
  return (
    <ol className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
      {teams.map((t, i) => {
        const played = t.w + t.d + t.l
        const net = metrics.get(t.key)?.net
        const on = t.key === activeKey
        return (
          <li key={t.key}>
            <button type="button" onClick={() => onSelect(t.key)} aria-current={on || undefined}
              className="mm-press w-full flex items-center gap-2.5 px-3 py-2.5 text-left cursor-pointer break-keep"
              style={{ ...card, border: on ? '2px solid var(--mm-ink)' : card.border }}>
              <span className="font-jersey font-black text-2xl w-6 tabular-nums" style={{ color: i === 0 ? MEDAL[0] : 'var(--mm-muted)' }}>{i + 1}</span>
              <Dot color={t.color} />
              <span className="flex-1 min-w-0">
                <span className="block font-black whitespace-nowrap" style={{ color: 'var(--mm-ink)' }}>{t.name}</span>
                <span className="block text-xs font-bold tabular-nums" style={{ color: 'var(--mm-muted)' }}>{t.w}승 {t.l}패{t.d ? ` ${t.d}무` : ''}</span>
              </span>
              <span className="text-right">
                <span className="block font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>{played ? `${(t.w / played * 100).toFixed(0)}%` : '—'}</span>
                {net != null && <span className="block text-xs font-bold tabular-nums" style={{ color: net >= 0 ? 'var(--mm-positive)' : 'var(--mm-negative)' }}>순 {net >= 0 ? '+' : ''}{net.toFixed(1)}</span>}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function H2HMatrix({ teams, games }: { teams: BoardTeam[]; games: BoardGame[] }) {
  const cell = useMemo(() => {
    const m = new Map<string, H2HCell>()
    const add = (a: string, b: string, r: 'w' | 'd' | 'l') => {
      const k = `${a}|${b}`; const c = m.get(k) ?? { w: 0, d: 0, l: 0 }; c[r]++; m.set(k, c)
    }
    for (const g of games) {
      if (!g.home || !g.away) continue
      const r = g.hs > g.as ? 'w' : g.hs < g.as ? 'l' : 'd'
      add(g.home, g.away, r); add(g.away, g.home, r === 'w' ? 'l' : r === 'l' ? 'w' : 'd')
    }
    return m
  }, [games])
  if (teams.length < 2) return null
  return (
    <div className="p-3" style={card}>
      <p className="text-sm font-black mb-2" style={{ color: 'var(--mm-ink)' }}>상대 전적 <span className="text-xs font-semibold" style={{ color: 'var(--mm-muted)' }}>· 줄의 팀 기준 승-패</span></p>
      <table className="mm-fit text-sm">
        <thead>
          <tr>
            <th className="t-th text-left w-24 sm:w-32" />
            {teams.map(t => <th key={t.key} className="t-th text-center"><span className="inline-flex items-center gap-1"><Dot color={t.color} size={8} />{t.name}</span></th>)}
          </tr>
        </thead>
        <tbody>
          {teams.map(a => (
            <tr key={a.key} style={{ borderTop: '1px solid var(--mm-rule)' }}>
              <th scope="row" className="t-td text-left font-black"><span className="inline-flex items-center gap-1"><Dot color={a.color} size={8} />{a.name}</span></th>
              {teams.map(b => {
                if (a.key === b.key) return <td key={b.key} className="t-td text-center" style={{ color: 'var(--mm-muted)' }}>·</td>
                const c = cell.get(`${a.key}|${b.key}`)
                const good = c && c.w > c.l, bad = c && c.l > c.w
                return (
                  <td key={b.key} className="t-td text-center font-black tabular-nums"
                    style={{ background: good ? 'var(--mm-yellow-soft)' : undefined, color: bad ? 'var(--mm-muted)' : 'var(--mm-ink)' }}>
                    {c ? `${c.w}-${c.l}${c.d ? `-${c.d}` : ''}` : '—'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TeamRadar({ teams, metrics }: { teams: BoardTeam[]; metrics: Map<string, Partial<Record<MetricKey, number>>> }) {
  const [focus, setFocus] = useState<string | null>(null)
  const better = Object.fromEntries(BOARD_METRICS.map(m => [m.key, m.better])) as Record<MetricKey, 'high' | 'low'>
  better.rpg = 'high'
  const best = useMemo(() => {
    const out: Partial<Record<MetricKey, number>> = {}
    for (const k of RADAR_METRICS) {
      const vals = teams.map(t => metrics.get(t.key)?.[k]).filter((v): v is number => v != null && v > 0)
      if (vals.length) out[k] = better[k] === 'low' ? Math.min(...vals) : Math.max(...vals)
    }
    return out
  }, [teams, metrics]) // eslint-disable-line react-hooks/exhaustive-deps
  const S = 300, C = S / 2, R = 108
  const pt = (i: number, r: number) => {
    const a = -Math.PI / 2 + i * (2 * Math.PI / RADAR_METRICS.length)
    return [C + r * Math.cos(a), C + r * Math.sin(a)] as const
  }
  const poly = (r: (i: number) => number) => RADAR_METRICS.map((_, i) => pt(i, r(i)).join(',')).join(' ')
  return (
    <div className="p-3 grid gap-3 md:grid-cols-[minmax(0,340px)_1fr] items-center" style={card}>
      <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-[340px] mx-auto" role="img" aria-label="팀 레이더">
        {[0.25, 0.5, 0.75, 1].map(f => <polygon key={f} points={poly(() => R * f)} fill="none" stroke="var(--mm-rule)" strokeWidth={1} />)}
        {RADAR_METRICS.map((_, i) => { const [x, y] = pt(i, R); return <line key={i} x1={C} y1={C} x2={x} y2={y} stroke="var(--mm-rule)" /> })}
        {teams.map(t => {
          const m = metrics.get(t.key) ?? {}
          const dim = focus && focus !== t.key
          return (
            <polygon key={t.key} points={poly(i => R * radarScore(m[RADAR_METRICS[i]], best[RADAR_METRICS[i]], better[RADAR_METRICS[i]]) / 100)}
              fill={t.color} fillOpacity={dim ? 0.03 : focus ? 0.35 : 0.14} stroke={t.color} strokeOpacity={dim ? 0.25 : 1} strokeWidth={focus === t.key ? 3 : 2}
              style={{ filter: 'drop-shadow(0 0 0.5px var(--mm-ink))' }} />
          )
        })}
        {RADAR_METRICS.map((k, i) => {
          const [x, y] = pt(i, R + 22)
          return <text key={k} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={13} fontWeight={800} fill="var(--mm-ink-soft)">{RADAR_LABEL[k]}</text>
        })}
      </svg>
      <div className="space-y-2">
        {teams.map(t => {
          const m = metrics.get(t.key) ?? {}
          const on = focus === t.key
          return (
            <button key={t.key} type="button" onClick={() => setFocus(on ? null : t.key)} aria-pressed={on}
              className="mm-press w-full flex items-center gap-2 px-3 py-2 cursor-pointer text-left break-keep"
              style={{ background: on ? 'var(--mm-panel-alt)' : 'transparent', border: `1px solid ${on ? 'var(--mm-ink)' : 'var(--mm-rule)'}`, borderRadius: 'var(--mm-radius-ctl)' }}>
              <Dot color={t.color} />
              <span className="font-black text-sm" style={{ color: 'var(--mm-ink)' }}>{t.name}</span>
              <span className="ml-auto text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>
                강점 {RADAR_METRICS.filter(k => radarScore(m[k], best[k], better[k]) >= 99.5).map(k => RADAR_LABEL[k]).join(' · ') || '—'}
              </span>
            </button>
          )
        })}
        <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>팀을 누르면 그 팀 모양만 진하게 보여요.</p>
      </div>
    </div>
  )
}

function Share({ label, v, top }: { label: string; v: number; top: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-bold">
      <span className="w-6 shrink-0" style={{ color: 'var(--mm-muted)' }}>{label}</span>
      <span className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--mm-panel-alt)' }}>
        <span className="block h-full rounded-full" style={{ width: `${Math.min(100, v)}%`, background: top ? MEDAL[0] : 'var(--mm-ink-soft)' }} />
      </span>
      <span className="w-8 text-right tabular-nums" style={{ color: top ? 'var(--mm-ink)' : 'var(--mm-ink-soft)' }}>{v.toFixed(0)}%</span>
    </div>
  )
}

function LockerWall({ team }: { team: BoardTeam & { leaderId?: string | null } }) {
  const shares = useMemo(() => contributions(team.players), [team.players])
  const list = [...team.players].filter(p => shares.has(p.player_id)).sort((a, b) => (shares.get(b.player_id)!.avg - shares.get(a.player_id)!.avg))
  const topOf = (k: 'pts' | 'reb' | 'ast' | 'def') => {
    let best: string | null = null, v = 0
    for (const p of list) { const s = shares.get(p.player_id)![k]; if (s > v) { v = s; best = p.player_id } }
    return best
  }
  const tops = { pts: topOf('pts'), reb: topOf('reb'), ast: topOf('ast'), def: topOf('def') }
  if (list.length === 0) return <p className="text-sm text-center py-6" style={{ color: 'var(--mm-muted)' }}>이 팀 선수 기록이 아직 없어요.</p>
  return (
    <div className="p-3 rounded-[var(--mm-radius-card)]" style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${team.color} 14%, var(--mm-panel)) 0, var(--mm-panel) 80px)`, border: '1px solid var(--mm-rule)' }}>
      <p className="text-xs font-bold mb-2.5 break-keep" style={{ color: 'var(--mm-muted)' }}>
        팀에 보탠 몫이에요. 금색이 팀 1위예요.<br />
        수비 = 수비 리바운드 + 스틸 + 블록
      </p>
      <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {list.map(p => {
          const s = shares.get(p.player_id)!
          return (
            <li key={p.player_id} className="overflow-hidden" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)', borderTop: `4px solid ${team.color}` }}>
              <div className="relative aspect-[4/3]" style={{ background: 'var(--mm-panel-alt)' }}>
                {p.photo_url
                  ? <Image src={p.photo_url} alt="" fill sizes="200px" className="object-cover object-top" />
                  : <span className="absolute inset-0 grid place-items-center font-black text-2xl" style={{ color: 'var(--mm-muted)' }}>{p.name.slice(-2)}</span>}
                {p.number != null && <span className="absolute top-1 left-1 px-1.5 text-xs font-black rounded tabular-nums" style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)' }}>#{p.number}</span>}
                {team.leaderId === p.player_id && <Crown size={16} className="absolute top-1 right-1" style={{ color: MEDAL[0] }} aria-label="팀장" />}
              </div>
              <div className="p-2 space-y-1">
                <div className="flex items-baseline justify-between gap-1">
                  <PlayerName id={p.player_id} name={p.name} hitArea={false} className="text-sm font-black whitespace-nowrap" style={{ color: 'var(--mm-ink)' }} />
                  <span className="text-xs font-bold tabular-nums whitespace-nowrap" style={{ color: 'var(--mm-muted)' }}>{p.gp}일</span>
                </div>
                <Share label="득점" v={s.pts} top={tops.pts === p.player_id} />
                <Share label="리바" v={s.reb} top={tops.reb === p.player_id} />
                <Share label="어시" v={s.ast} top={tops.ast === p.player_id} />
                <Share label="수비" v={s.def} top={tops.def === p.player_id} />
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export type { BoardTeam }
export type LockerPlayer = PlayerStat
