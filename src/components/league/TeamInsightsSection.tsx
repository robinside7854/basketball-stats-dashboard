'use client'
// 팀 탭 「팀별 선수」 안의 「어시스트」·「공격 유형」 보기 (2026-10-12 신설 · 2026-10-18 팀별 선수에 합침).
//   날짜별 박스스코어의 두 탭을 분기·시즌 단위로 쌓아 보여 준다.
//   데이터: GET /api/leagues/[leagueId]/team-insights?quarterId=  (마감된 정규전 · 팀 정체성 단위)
//   그림: AssistNetwork · ShotTypeBreakdown — 날짜별 화면과 같은 컴포넌트(경기 범위 칩 없이 쓴다).
//
// ⚠ 팀 고르기는 「팀별 선수」의 팀 탭 하나가 맡는다 — 종전엔 이 섹션이 따로 팀 칩을 가져
//   같은 화면에 팀 필터가 두 벌이었다(운영진: "표가 너무 많고 필터가 따로 논다").
import { useEffect, useMemo, useState } from 'react'
import AssistNetwork, { type AssistLink, type AssistPlayer } from '@/components/league/boxscore/AssistNetwork'
import ShotTypeBreakdown, { type ShotTypeRow, type ShotPlayer } from '@/components/league/boxscore/ShotTypeBreakdown'
import { BasketballLoader } from '@/components/league/BasketballIcons'

type InsightTeam = { key: string; team_id: string; name: string; color: string }
type InsightPlayer = { id: string; name: string; photo_url: string | null }
type InsightLink = { team_key: string; from: string; to: string; count: number }
type InsightShot = { team_key: string; player_id: string; type: string; fga: number; fgm: number }
export type TeamInsights = { teams: InsightTeam[]; players: InsightPlayer[]; assist_links: InsightLink[]; shot_types: InsightShot[] }

/** 경기 범위가 없는 시즌 집계 — 컴포넌트의 game_id 자리에 넣는 고정값(경기 칩은 games=[] 라 안 보인다) */
const SEASON = 'season'
const EMPTY: TeamInsights = { teams: [], players: [], assist_links: [], shot_types: [] }

/** 분기가 바뀔 때마다 한 번 받는다. enabled=false 면 받지 않는다(선수 기록 보기만 쓰는 동안). */
export function useTeamInsights(leagueId: string, quarterId: string, enabled: boolean): TeamInsights | null {
  const [data, setData] = useState<{ q: string; d: TeamInsights } | null>(null)
  const want = enabled ? quarterId || 'all' : null
  useEffect(() => {
    if (!want || data?.q === want) return
    let cancelled = false
    fetch(`/api/leagues/${leagueId}/team-insights?quarterId=${encodeURIComponent(want)}`)
      .then(r => (r.ok ? r.json() : null))
      .then((d: TeamInsights | null) => { if (!cancelled) setData({ q: want, d: d ?? EMPTY }) })
      .catch(() => { if (!cancelled) setData({ q: want, d: EMPTY }) })
    return () => { cancelled = true }
  }, [leagueId, want, data?.q])
  return data && data.q === want ? data.d : null
}

export default function TeamInsightView({ data, teamKey, view, scopeText }: {
  data: TeamInsights | null
  /** 「팀별 선수」 팀 탭에서 고른 팀 정체성 key */
  teamKey: string | null
  view: 'assist' | 'shots'
  scopeText: string
}) {
  const team = useMemo(() => data?.teams.find(t => t.key === teamKey) ?? null, [data, teamKey])

  const assistLinks: AssistLink[] = useMemo(() => (data?.assist_links ?? [])
    .filter(l => l.team_key === teamKey)
    .map(l => ({ game_id: SEASON, from: l.from, to: l.to, team_id: l.team_key, team_name: team?.name ?? null, team_color: team?.color ?? null, count: l.count })),
  [data, teamKey, team])

  const shotRows: ShotTypeRow[] = useMemo(() => (data?.shot_types ?? [])
    .filter(r => r.team_key === teamKey)
    .map(r => ({ game_id: SEASON, player_id: r.player_id, team_id: r.team_key, type: r.type, fga: r.fga, fgm: r.fgm })), [data, teamKey])

  const shotTeams = useMemo(() => team ? [{ id: team.key, name: team.name, color: team.color }] : [], [team])
  const assistPlayers = useMemo(() => new Map<string, AssistPlayer>((data?.players ?? []).map(p => [p.id, { name: p.name, photo_url: p.photo_url }])), [data])
  const shotPlayers = useMemo(() => new Map<string, ShotPlayer>((data?.players ?? []).map(p => [p.id, { name: p.name, team_id: null }])), [data])

  if (data === null) return <div className="flex justify-center py-8"><BasketballLoader size={24} /></div>

  return (
    <div className="space-y-2">
      <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>
        {scopeText} 누적 · 마감된 정규전 기준 (친선전 제외) · 날짜별 박스스코어와 같은 판정
      </p>
      {view === 'assist' ? (
        <AssistNetwork links={assistLinks} games={[]} players={assistPlayers} emptyTitle="이 기간에 기록된 어시스트가 없어요." />
      ) : (
        <ShotTypeBreakdown rows={shotRows} games={[]} teams={shotTeams} players={shotPlayers} emptyTitle="이 기간에 기록된 야투가 없어요." overallTitle={null} />
      )}
    </div>
  )
}
