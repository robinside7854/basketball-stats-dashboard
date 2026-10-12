'use client'
// 팀 탭 「시즌 어시스트 · 공격 유형」 (2026-10-12 리뉴얼 3단계) — 날짜별 박스스코어의 「어시스트」·
//   「공격 유형」 탭을 분기·시즌 단위로 쌓아 보여 준다.
//   데이터: GET /api/leagues/[leagueId]/team-insights?quarterId=  (마감된 정규전 · 팀 정체성 단위)
//   그림: AssistNetwork · ShotTypeBreakdown — 날짜별 화면과 같은 컴포넌트(경기 범위 칩 없이 쓴다).
//
// 휴대폰에서는 팀 하나씩(그림 5장이 이어지면 너무 길다), PC 에서는 팀 하나를 고르면 두 그림을 나란히 둔다.
import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import AssistNetwork, { type AssistLink, type AssistPlayer } from '@/components/league/boxscore/AssistNetwork'
import ShotTypeBreakdown, { type ShotTypeRow, type ShotPlayer } from '@/components/league/boxscore/ShotTypeBreakdown'
import { BasketballLoader } from '@/components/league/BasketballIcons'

type InsightTeam = { key: string; team_id: string; name: string; color: string }
type InsightPlayer = { id: string; name: string; photo_url: string | null }
type InsightLink = { team_key: string; from: string; to: string; count: number }
type InsightShot = { team_key: string; player_id: string; type: string; fga: number; fgm: number }
type Insights = { teams: InsightTeam[]; players: InsightPlayer[]; assist_links: InsightLink[]; shot_types: InsightShot[] }

const ALL = 'all'
/** 경기 범위가 없는 시즌 집계 — 컴포넌트의 game_id 자리에 넣는 고정값(경기 칩은 games=[] 라 안 보인다) */
const SEASON = 'season'

const chipStyle = (on: boolean): CSSProperties => on
  ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }
  : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }

export default function TeamInsightsSection({ leagueId, quarterId, teamOrder = [] }: {
  leagueId: string
  quarterId: string
  /** 팀 칩 순서 — 순위표의 정체성 key 순. 없는 팀은 뒤로 */
  teamOrder?: string[]
}) {
  const [data, setData] = useState<Insights | null>(null)
  const [pick, setPick] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 분기가 바뀌면 이전 분기 그림을 지우고 로더를 보인다
    setData(null)
    fetch(`/api/leagues/${leagueId}/team-insights?quarterId=${encodeURIComponent(quarterId || 'all')}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: Insights | null) => {
        if (cancelled) return
        setData(d ?? { teams: [], players: [], assist_links: [], shot_types: [] })
      })
      .catch(() => { if (!cancelled) setData({ teams: [], players: [], assist_links: [], shot_types: [] }) })
    return () => { cancelled = true }
  }, [leagueId, quarterId])

  const orderKey = teamOrder.join(',')
  const teams = useMemo(() => {
    const order = new Map(orderKey ? orderKey.split(',').map((k, i) => [k, i] as const) : [])
    return [...(data?.teams ?? [])].sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99) || a.name.localeCompare(b.name, 'ko'))
  }, [data, orderKey])

  // 고른 팀이 이 기간에 없으면(분기 변경) 첫 팀으로 — 파생값이라 setState 루프가 없다
  const active = pick === ALL ? ALL : (pick && teams.some(t => t.key === pick) ? pick : teams[0]?.key ?? ALL)
  const teamMeta = useMemo(() => new Map(teams.map(t => [t.key, t])), [teams])

  const assistLinks: AssistLink[] = useMemo(() => (data?.assist_links ?? [])
    .filter(l => active === ALL || l.team_key === active)
    .map(l => {
      const t = teamMeta.get(l.team_key)
      return { game_id: SEASON, from: l.from, to: l.to, team_id: l.team_key, team_name: t?.name ?? null, team_color: t?.color ?? null, count: l.count }
    }), [data, active, teamMeta])

  const shotRows: ShotTypeRow[] = useMemo(() => (data?.shot_types ?? [])
    .filter(r => active === ALL || r.team_key === active)
    .map(r => ({ game_id: SEASON, player_id: r.player_id, team_id: r.team_key, type: r.type, fga: r.fga, fgm: r.fgm })), [data, active])

  const shotTeams = useMemo(() => teams
    .filter(t => active === ALL || t.key === active)
    .map(t => ({ id: t.key, name: t.name, color: t.color })), [teams, active])

  const assistPlayers = useMemo(() => new Map<string, AssistPlayer>((data?.players ?? []).map(p => [p.id, { name: p.name, photo_url: p.photo_url }])), [data])
  const shotPlayers = useMemo(() => new Map<string, ShotPlayer>((data?.players ?? []).map(p => [p.id, { name: p.name, team_id: null }])), [data])

  const scopeText = quarterId && quarterId !== 'all' ? '이 분기' : '시즌 전체'
  const single = active !== ALL

  return (
    <div className="space-y-3">
      <div>
        <h3 className="font-black" style={{ color: 'var(--mm-ink)', fontSize: '22px', letterSpacing: '-0.005em' }}>시즌 어시스트 · 공격 유형</h3>
        <p className="text-xs mt-1" style={{ color: 'var(--mm-muted)' }}>
          {scopeText} 누적 · 마감된 정규전 기준 (친선전 제외) · 날짜별 박스스코어와 같은 판정
        </p>
      </div>
      <div className="p-4 sm:p-5 space-y-4" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}>
        {data === null ? (
          <div className="flex justify-center py-8"><BasketballLoader size={24} /></div>
        ) : teams.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--mm-muted)' }}>이 기간에 마감된 정규전 기록이 아직 없습니다.</p>
        ) : (
          <>
            {/* 팀 고르기 — 휴대폰은 가로 스크롤, PC 는 줄바꿈 */}
            <div className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap pb-1" role="group" aria-label="볼 팀">
              {teams.map(t => {
                const on = active === t.key
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setPick(t.key)}
                    aria-pressed={on}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 min-h-11 text-xs font-black tracking-wide whitespace-nowrap cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                    style={chipStyle(on)}
                  >
                    <span aria-hidden className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                    {t.name}
                  </button>
                )
              })}
              {teams.length > 1 && (
                <button
                  type="button"
                  onClick={() => setPick(ALL)}
                  aria-pressed={active === ALL}
                  className="shrink-0 px-3 min-h-11 text-xs font-black tracking-wide whitespace-nowrap cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                  style={chipStyle(active === ALL)}
                >모든 팀</button>
              )}
            </div>

            {/* 팀 하나면 PC 에서 두 그림을 나란히, 모든 팀이면 각 그림이 자체 2열을 쓰도록 위아래로 */}
            <div className={`grid grid-cols-1 gap-6 ${single ? 'lg:grid-cols-2 lg:gap-5' : ''}`}>
              <section aria-labelledby="team-insight-assist" className="min-w-0 space-y-2">
                <p id="team-insight-assist" className="t-label" style={{ color: 'var(--mm-yellow-strong)' }}>시즌 어시스트</p>
                <AssistNetwork
                  links={assistLinks}
                  games={[]}
                  players={assistPlayers}
                  emptyTitle="이 기간에 기록된 어시스트가 없습니다."
                />
              </section>
              <section aria-labelledby="team-insight-shots" className="min-w-0 space-y-2">
                <p id="team-insight-shots" className="t-label" style={{ color: 'var(--mm-yellow-strong)' }}>공격 유형</p>
                <ShotTypeBreakdown
                  rows={shotRows}
                  games={[]}
                  teams={shotTeams}
                  players={shotPlayers}
                  emptyTitle="이 기간에 기록된 야투가 없습니다."
                  overallTitle={single ? null : `${scopeText} 합계`}
                />
              </section>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
