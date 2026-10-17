'use client'
// 하루 어시스트 네트워크 — 날짜별 박스스코어의 「어시스트」 탭.
//
// 데이터는 daily-boxscore 의 `assist_links` (경기별 · 패스한 선수 → 득점한 선수 · 횟수).
//   판정은 박스스코어 AST 와 같은 `isAssistEvent` 라 그림의 합과 표의 AST 가 일치한다.
//   「전체」는 경기별 연결을 화면에서 더한다 — 서버가 합산본을 따로 주면 두 벌이 된다.
//
// 휴대폰(360px) 기준으로 그린다: SVG 는 viewBox 로 폭에 맞춰 줄고, 팀당 노드는 최대 8명.
// 그림이 못 읽히는 경우(스크린리더·작은 화면)를 위해 같은 내용을 글 목록으로도 둔다.
import { useId, useMemo, useState, type CSSProperties } from 'react'
import { Handshake } from 'lucide-react'
import { accentOrInk } from '@/lib/util/contrastColor'
import EmptyState from '@/components/league/ui/EmptyState'
import Avatar from '@/components/league/ui/Avatar'
import PlayerName from '@/components/league/ui/PlayerName'
import { useOpenPlayerCard } from '@/contexts/PlayerCardContext'

export interface AssistLink {
  game_id: string
  from: string
  to: string
  team_id: string | null
  team_name: string | null
  team_color: string | null
  count: number
}

export interface AssistGame {
  id: string
  /** 「3경기」 처럼 카드에 쓰는 번호 라벨 */
  numLabel: string
  homeName: string
  awayName: string
}

export interface AssistPlayer {
  name: string
  photo_url?: string | null
}

const MAX_NODES = 8

// SVG <image> 는 next/image 를 못 쓴다 — 원본(수백 KB)을 노드 수만큼 받지 않도록, Avatar 와 같은 기준
//   (옵티마이저 허용 호스트 = Supabase)일 때만 옵티마이저 URL 로 줄여 받는다. 96 은 next.config imageSizes 안의 값
//   (노드 지름 36 · 최대 확대 ~1.3배 · 2~3배 밀도). 허용 밖 호스트는 원본 그대로.
const OPTIMIZABLE = /^https:\/\/[^/]+\.supabase\.(co|in)\//
const nodePhotoHref = (src: string) => OPTIMIZABLE.test(src) ? `/_next/image?url=${encodeURIComponent(src)}&w=96&q=75` : src

const chipStyle = (on: boolean): CSSProperties => on
  ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', borderRadius: 'var(--mm-radius-chip)' }
  : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)' }

type Edge = { from: string; to: string; count: number }
type TeamNet = { key: string; name: string; color: string | null; edges: Edge[]; total: number }

export default function AssistNetwork({ links, games, players, emptyTitle = '이날 기록된 어시스트가 없어요.' }: {
  links: AssistLink[]
  games: AssistGame[]
  players: Map<string, AssistPlayer>
  /** 연결이 하나도 없을 때 문구 — 팀 탭(시즌)은 「이날」이 아니다 */
  emptyTitle?: string
}) {
  const [scope, setScope] = useState<string>('all')
  const gamesWithAssists = useMemo(() => new Set(links.map(l => l.game_id)), [links])

  // 고른 범위의 연결을 팀별로 모은다. 「전체」면 같은 (팀, 패스, 득점) 을 경기 넘어 더한다.
  const teams: TeamNet[] = useMemo(() => {
    const scoped = scope === 'all' ? links : links.filter(l => l.game_id === scope)
    const byTeam = new Map<string, TeamNet & { edgeMap: Map<string, Edge> }>()
    for (const l of scoped) {
      const key = l.team_id ?? `none:${l.team_name ?? ''}`
      let t = byTeam.get(key)
      if (!t) {
        t = { key, name: l.team_name ?? '팀 미정', color: l.team_color, edges: [], total: 0, edgeMap: new Map() }
        byTeam.set(key, t)
      }
      const ek = `${l.from}>${l.to}`
      const e = t.edgeMap.get(ek)
      if (e) e.count += l.count
      else t.edgeMap.set(ek, { from: l.from, to: l.to, count: l.count })
      t.total += l.count
    }
    return [...byTeam.values()]
      .map(t => ({ key: t.key, name: t.name, color: t.color, total: t.total, edges: [...t.edgeMap.values()].sort((a, b) => b.count - a.count) }))
      .sort((a, b) => b.total - a.total)
  }, [links, scope])

  const best = useMemo(() => teams
    .flatMap(t => t.edges.map(e => ({ ...e, team: t })))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5), [teams])

  const nameOf = (id: string) => players.get(id)?.name ?? '?'

  if (links.length === 0) {
    return (
      <EmptyState icon={Handshake} title={emptyTitle} />
    )
  }

  return (
    <div className="space-y-5">
      <p className="text-xs max-w-prose text-pretty" style={{ color: 'var(--mm-muted)' }}>
        누가 누구의 득점을 도왔는지 보여 줘요. 화살표는 패스한 선수에서 득점한 선수로 가고, 선이 굵을수록 자주 이어졌어요.
      </p>

      {/* 범위 — 전체 / 경기별 */}
      {games.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap pb-1" role="group" aria-label="어시스트를 볼 경기">
          <button
            type="button"
            onClick={() => setScope('all')}
            aria-pressed={scope === 'all'}
            className="mm-press shrink-0 px-3 min-h-11 text-xs font-bold cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
            style={chipStyle(scope === 'all')}
          >전체</button>
          {games.map(g => {
            const on = scope === g.id
            const has = gamesWithAssists.has(g.id)
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => setScope(g.id)}
                aria-pressed={on}
                className="mm-press shrink-0 px-3 min-h-11 text-xs font-bold whitespace-nowrap cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
                style={{ ...chipStyle(on), opacity: has || on ? 1 : 0.6 }}
              >
                {g.numLabel} <span className="font-semibold">{g.homeName} vs {g.awayName}</span>
              </button>
            )
          })}
        </div>
      )}

      {teams.length === 0 ? (
        <EmptyState variant="compact" framed title="이 경기에는 기록된 어시스트가 없어요." />
      ) : (
        <>
          {/* 베스트 콤비 */}
          <section aria-labelledby="assist-best-title">
            <p id="assist-best-title" className="text-sm font-black mb-2" style={{ color: 'var(--mm-ink)' }}>베스트 어시스트 콤비</p>
            {/* sm+: 두 칸 — 전폭 한 줄이면 이름과 「×N」이 카드 양 끝으로 벌어졌다 */}
            <ol className="space-y-1.5 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-1.5">
              {best.map((e, i) => (
                <li
                  key={`${e.team.key}-${e.from}-${e.to}`}
                  className="flex items-center gap-2 px-3 py-2 min-w-0"
                  style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}
                >
                  <span className="t-num text-sm font-black w-5 shrink-0" style={{ color: 'var(--mm-muted)' }}>{i + 1}</span>
                  {/* 두 얼굴이 겹쳐 「패스 → 득점」 한 쌍으로 읽힌다. 팀 색은 테두리로(점 대신). */}
                  <span aria-hidden className="flex shrink-0">
                    <Avatar src={players.get(e.from)?.photo_url} name={nameOf(e.from)} size={32} ringColor={e.team.color ? accentOrInk(e.team.color) : null} decorative />
                    <Avatar src={players.get(e.to)?.photo_url} name={nameOf(e.to)} size={32} ringColor={e.team.color ? accentOrInk(e.team.color) : null} decorative className="-ml-2" />
                  </span>
                  <span className="text-base font-semibold truncate min-w-0" title={`${nameOf(e.from)} → ${nameOf(e.to)}`} style={{ color: 'var(--mm-ink)' }}>
                    <PlayerName id={e.from} name={nameOf(e.from)} hitArea={false} /> <span aria-label="에서" style={{ color: 'var(--mm-muted)' }}>→</span> <PlayerName id={e.to} name={nameOf(e.to)} hitArea={false} />
                  </span>
                  <span className="ml-auto t-num text-base font-black shrink-0" style={{ color: 'var(--mm-yellow-strong)' }}>×{e.count}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* 팀별 네트워크 */}
          {/* 한 팀만 있으면(팀 탭에서 팀을 고른 경우) 반폭으로 남지 않게 한 칸으로 */}
          <div className={`grid grid-cols-1 gap-4 ${teams.length > 1 ? 'lg:grid-cols-2' : ''}`}>
            {teams.map(t => (
              <TeamNetwork key={t.key} team={t} players={players} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function TeamNetwork({ team, players }: { team: TeamNet; players: Map<string, AssistPlayer> }) {
  const uid = useId().replace(/:/g, '')
  const stroke = accentOrInk(team.color)
  const nameOf = (id: string) => players.get(id)?.name ?? '?'
  const openPlayerCard = useOpenPlayerCard()

  // 노드 — 연결에 한 번이라도 나온 선수. 많으면 관여 횟수 상위 MAX_NODES 명만 그린다.
  const involvement = new Map<string, number>()
  for (const e of team.edges) {
    involvement.set(e.from, (involvement.get(e.from) ?? 0) + e.count)
    involvement.set(e.to, (involvement.get(e.to) ?? 0) + e.count)
  }
  const allNodes = [...involvement.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  const nodes = allNodes.slice(0, MAX_NODES)
  const hidden = allNodes.length - nodes.length
  const nodeSet = new Set(nodes)
  const edges = team.edges.filter(e => nodeSet.has(e.from) && nodeSet.has(e.to))
  const maxCount = Math.max(1, ...edges.map(e => e.count))

  const W = 320, H = 300, CX = 160, CY = 150, R = 95, NR = 18
  const pos = new Map(nodes.map((id, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / nodes.length
    return [id, { x: CX + R * Math.cos(a), y: CY + R * Math.sin(a), a }]
  }))

  const summary = `${team.name} 어시스트 ${team.total}개. ` +
    team.edges.slice(0, 6).map(e => `${nameOf(e.from)}에서 ${nameOf(e.to)} ${e.count}번`).join(', ')

  return (
    <section
      className="p-3"
      style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}
      aria-label={`${team.name} 어시스트 네트워크`}
    >
      <div className="flex items-center gap-2 mb-1 min-w-0">
        <span aria-hidden className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: team.color ?? 'var(--mm-muted)' }} />
        <span className="font-jersey font-bold text-sm truncate min-w-0" title={team.name ?? undefined} style={{ color: 'var(--mm-ink)' }}>{team.name}</span>
        <span className="ml-1 text-xs font-bold tabular-nums shrink-0" style={{ color: 'var(--mm-muted)' }}>어시스트 {team.total}개</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block mx-auto" style={{ maxWidth: 420 }} role="img" aria-label={summary}>
        <defs>
          <marker id={`arrow-${uid}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" style={{ fill: stroke }} />
          </marker>
          {nodes.map(id => {
            const p = pos.get(id)!
            return (
              <clipPath key={id} id={`clip-${uid}-${id}`}>
                <circle cx={p.x} cy={p.y} r={NR} />
              </clipPath>
            )
          })}
        </defs>

        {/* 연결선 — 살짝 휜 곡선이라 A→B 와 B→A 가 겹치지 않는다 */}
        {edges.map(e => {
          const s = pos.get(e.from)!, t = pos.get(e.to)!
          const dx = t.x - s.x, dy = t.y - s.y
          const len = Math.hypot(dx, dy) || 1
          const bend = Math.min(26, len * 0.18)
          const cxp = (s.x + t.x) / 2 + (-dy / len) * bend
          const cyp = (s.y + t.y) / 2 + (dx / len) * bend
          const unit = (fx: number, fy: number, tx: number, ty: number) => {
            const l = Math.hypot(tx - fx, ty - fy) || 1
            return [(tx - fx) / l, (ty - fy) / l]
          }
          const [ux1, uy1] = unit(s.x, s.y, cxp, cyp)
          const [ux2, uy2] = unit(cxp, cyp, t.x, t.y)
          const x1 = s.x + ux1 * (NR + 2), y1 = s.y + uy1 * (NR + 2)
          const x2 = t.x - ux2 * (NR + 3), y2 = t.y - uy2 * (NR + 3)
          const width = 1.5 + 4.5 * (e.count / maxCount)
          const mx = 0.25 * x1 + 0.5 * cxp + 0.25 * x2
          const my = 0.25 * y1 + 0.5 * cyp + 0.25 * y2
          return (
            <g key={`${e.from}>${e.to}`}>
              <path
                d={`M${x1},${y1} Q${cxp},${cyp} ${x2},${y2}`}
                fill="none"
                markerEnd={`url(#arrow-${uid})`}
                style={{ stroke, strokeWidth: width, strokeLinecap: 'round', opacity: 0.35 + 0.55 * (e.count / maxCount) }}
              />
              {e.count > 1 && (
                <g>
                  <circle cx={mx} cy={my} r={9} style={{ fill: 'var(--mm-panel)', stroke: 'var(--mm-rule)' }} />
                  <text x={mx} y={my} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={900} style={{ fill: 'var(--mm-ink)' }}>{e.count}</text>
                </g>
              )}
            </g>
          )
        })}

        {/* 선수 노드 */}
        {nodes.map(id => {
          const p = pos.get(id)!
          const pl = players.get(id)
          const name = pl?.name ?? '?'
          // 사진이 없으면 첫 글자 — 공용 Avatar 와 같은 대체 규칙(화면마다 갈리지 않게)
          const initial = name.trim().charAt(0) || '?'
          const cos = Math.cos(p.a), sin = Math.sin(p.a)
          const lx = CX + (R + NR + 6) * cos
          const ly = CY + (R + NR + 6) * sin
          const anchor = Math.abs(cos) < 0.3 ? 'middle' : cos > 0 ? 'start' : 'end'
          const baseline = Math.abs(cos) < 0.3 ? (sin < 0 ? 'auto' : 'hanging') : 'central'
          return (
            // 얼굴·이름을 누르면 선수 카드 — 그림은 role="img" 라 키보드·낭독기는 아래 「연결 목록」의 이름 버튼으로 연다
            <g
              key={id}
              onClick={openPlayerCard && pl ? () => openPlayerCard({ playerId: id, playerName: name }) : undefined}
              style={openPlayerCard && pl ? { cursor: 'pointer' } : undefined}
            >
              <circle cx={p.x} cy={p.y} r={NR} style={{ fill: 'var(--mm-panel)', stroke, strokeWidth: 2 }} />
              {pl?.photo_url ? (
                <image
                  href={nodePhotoHref(pl.photo_url)}
                  x={p.x - NR} y={p.y - NR} width={NR * 2} height={NR * 2}
                  preserveAspectRatio="xMidYMin slice"
                  clipPath={`url(#clip-${uid}-${id})`}
                />
              ) : (
                <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight={900} style={{ fill: 'var(--mm-ink-soft)' }}>{initial}</text>
              )}
              <text x={lx} y={ly} textAnchor={anchor} dominantBaseline={baseline} fontSize={13} fontWeight={700} style={{ fill: 'var(--mm-ink)' }}>{name}</text>
            </g>
          )
        })}
      </svg>

      {hidden > 0 && (
        <p className="text-xs mt-1" style={{ color: 'var(--mm-muted)' }}>그림에는 많이 관여한 {MAX_NODES}명만 그렸어요. 나머지 {hidden}명은 아래 목록에 있어요.</p>
      )}

      {/* 글 목록 — 그림과 같은 내용. 그림이 읽히지 않을 때의 대안이기도 하다. */}
      <details className="mt-2">
        <summary className="text-xs font-bold cursor-pointer min-h-11 flex items-center" style={{ color: 'var(--mm-ink-soft)' }}>
          연결 목록 보기 ({team.edges.length})
        </summary>
        <ul className="mt-1 space-y-1">
          {team.edges.map(e => (
            <li key={`${e.from}>${e.to}`} className="flex items-center gap-2 text-sm" style={{ color: 'var(--mm-ink)' }}>
              <span className="truncate min-w-0" title={`${nameOf(e.from)} → ${nameOf(e.to)}`}><PlayerName id={e.from} name={nameOf(e.from)} hitArea={false} /> <span style={{ color: 'var(--mm-muted)' }}>→</span> <PlayerName id={e.to} name={nameOf(e.to)} hitArea={false} /></span>
              <span className="ml-auto t-num font-black shrink-0" style={{ color: 'var(--mm-ink-soft)' }}>×{e.count}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  )
}
