// 시즌 어워즈 API
//
// GET /api/leagues/[id]/awards?minGP=5
//   → { awards: AwardEntry[] }
//
// 어워즈 카테고리 (9종):
//   MVP           — 종합 (PPG + RPG + APG + STL + BLK 가중합)
//   SCORING       — 득점왕 (PPG 최고)
//   REBOUND       — 리바운드왕 (RPG 최고)
//   ASSIST        — 어시스트왕 (APG 최고)
//   DPOY          — 수비왕 (SPG + BPG 최고)
//   THREE         — 3점왕 (3P%, 시도 ≥20 최소 요건)
//   EFFICIENCY    — 효율왕 (eFG% 최고, FGA ≥30 최소)
//   CLUTCH        — 클러치왕 (마지막 2분·3점 이내 PPG 최고)
//   MIP           — 기량 발전상 (분기별 성장률 최고, 향후 확장)
//
// 각 어워즈:
//   winner: 1위 선수 상세
//   runners: 2~3위 후보
//   metric: 어떤 지표로 순위 결정
//   value: 우승자의 지표 값

import { NextResponse } from 'next/server'
import { computeClutchStats } from '@/lib/stats/clutchStats'
import { createClient } from '@/lib/supabase/admin'
import type { PlayerStat } from '@/types/league'

export type AwardCategory = 'MVP' | 'SCORING' | 'REBOUND' | 'ASSIST' | 'DPOY' | 'THREE' | 'EFFICIENCY' | 'CLUTCH' | 'MIP'

export interface AwardCandidate {
  player_id: string
  name: string
  number: number | null
  position: string | null
  value: number         // 순위 결정 지표
  displayValue: string  // 화면 표시용 (예: "22.4 PPG", "45.2%")
  gp: number
  supportingStats?: Record<string, string>
}

export interface AwardEntry {
  category: AwardCategory
  label: string
  description: string
  metric: string        // 순위 결정 지표 이름 (PPG · 3P% 등)
  minRequirement?: string
  winner: AwardCandidate | null
  runners: AwardCandidate[]  // 2위 · 3위
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const sp = new URL(req.url).searchParams
  const minGP = Math.max(1, Number(sp.get('minGP') ?? 5))

  const supabase = createClient()

  // 1) 리그 스탯 조회 (내부 API 재사용)
  const origin = new URL(req.url).origin
  const statsRes = await fetch(`${origin}/api/leagues/${leagueId}/stats?unit=game`, {
    headers: { cookie: req.headers.get('cookie') ?? '' },
    cache: 'no-store',
  })
  const statsJson = await statsRes.json() as { players?: PlayerStat[] }
  const players = statsJson.players ?? []

  // 자격자: gp >= minGP
  const eligible = players.filter(p => p.gp >= minGP)

  // 2) 클러치 스탯 조회 (내부 유틸)
  const clutchSplits = await computeClutchStats(supabase, leagueId)
  const clutchMap = new Map(clutchSplits.map(s => [s.player_id, s]))

  // 3) 후보 생성 헬퍼
  const toCandidate = (p: PlayerStat, value: number, displayValue: string, extra?: Record<string, string>): AwardCandidate => ({
    player_id: p.player_id,
    name: p.name,
    number: p.number,
    position: p.position,
    value,
    displayValue,
    gp: p.gp,
    supportingStats: extra,
  })

  const rankByValue = (pool: (AwardCandidate | null)[]): { winner: AwardCandidate | null; runners: AwardCandidate[] } => {
    const filtered = pool.filter((c): c is AwardCandidate => c !== null && Number.isFinite(c.value))
    filtered.sort((a, b) => b.value - a.value)
    return { winner: filtered[0] ?? null, runners: filtered.slice(1, 3) }
  }

  const awards: AwardEntry[] = []

  // ── MVP: PPG*1.2 + RPG + APG + (SPG+BPG)*1.5 - TOPG*0.5 종합점수 ────────
  {
    const cands = eligible.map(p => {
      const mvp = p.ppg * 1.2 + p.rpg + p.apg + (p.spg + p.bpg) * 1.5 - p.topg * 0.5
      return toCandidate(p, +mvp.toFixed(2), `${mvp.toFixed(1)} MVP`, {
        PPG: p.ppg.toFixed(1), RPG: p.rpg.toFixed(1), APG: p.apg.toFixed(1), SPG: p.spg.toFixed(1), BPG: p.bpg.toFixed(1),
      })
    })
    const { winner, runners } = rankByValue(cands)
    awards.push({
      category: 'MVP',
      label: 'MVP',
      description: '리그 최우수 선수 · 종합 임팩트',
      metric: '가중 종합 점수',
      minRequirement: `${minGP}게임 이상`,
      winner, runners,
    })
  }

  // ── SCORING: PPG ────────
  {
    const cands = eligible.map(p => toCandidate(p, p.ppg, `${p.ppg.toFixed(1)} PPG`, { GP: String(p.gp), PTS: String(p.pts) }))
    const { winner, runners } = rankByValue(cands)
    awards.push({
      category: 'SCORING',
      label: '득점왕',
      description: '평균 득점 최고',
      metric: 'PPG',
      minRequirement: `${minGP}게임 이상`,
      winner, runners,
    })
  }

  // ── REBOUND: RPG ────────
  {
    const cands = eligible.map(p => toCandidate(p, p.rpg, `${p.rpg.toFixed(1)} RPG`, { OR: String(p.oreb), DR: String(p.dreb) }))
    const { winner, runners } = rankByValue(cands)
    awards.push({
      category: 'REBOUND',
      label: '리바운드왕',
      description: '경기당 리바운드 최고',
      metric: 'RPG',
      minRequirement: `${minGP}게임 이상`,
      winner, runners,
    })
  }

  // ── ASSIST: APG ────────
  {
    const cands = eligible.map(p => toCandidate(p, p.apg, `${p.apg.toFixed(1)} APG`, { AST: String(p.ast), TOV: String(p.tov) }))
    const { winner, runners } = rankByValue(cands)
    awards.push({
      category: 'ASSIST',
      label: '어시스트왕',
      description: '경기당 어시스트 최고',
      metric: 'APG',
      minRequirement: `${minGP}게임 이상`,
      winner, runners,
    })
  }

  // ── DPOY: SPG + BPG ────────
  {
    const cands = eligible.map(p => toCandidate(p, +(p.spg + p.bpg).toFixed(2), `${(p.spg + p.bpg).toFixed(1)} STL+BLK`, {
      SPG: p.spg.toFixed(1), BPG: p.bpg.toFixed(1),
    }))
    const { winner, runners } = rankByValue(cands)
    awards.push({
      category: 'DPOY',
      label: 'DPOY',
      description: '최고의 수비수 · 스틸 + 블락',
      metric: 'STL + BLK per game',
      minRequirement: `${minGP}게임 이상`,
      winner, runners,
    })
  }

  // ── THREE: 3P% (최소 시도 20회) ────────
  {
    const MIN_3PA = 20
    const cands = eligible.filter(p => p.fg3a >= MIN_3PA).map(p =>
      toCandidate(p, p.fg3_pct, `${p.fg3_pct.toFixed(1)}%`, {
        '3PM/3PA': `${p.fg3m}/${p.fg3a}`,
      })
    )
    const { winner, runners } = rankByValue(cands)
    awards.push({
      category: 'THREE',
      label: '3점왕',
      description: '3점 야투 성공률 최고',
      metric: '3P%',
      minRequirement: `3점 시도 ≥ ${MIN_3PA}회`,
      winner, runners,
    })
  }

  // ── EFFICIENCY: eFG% (최소 시도 30회) ────────
  {
    const MIN_FGA = 30
    const cands = eligible.filter(p => p.fga >= MIN_FGA).map(p =>
      toCandidate(p, p.efg_pct, `${p.efg_pct.toFixed(1)}%`, {
        'FGM/FGA': `${p.fgm}/${p.fga}`,
        '3PM': String(p.fg3m),
      })
    )
    const { winner, runners } = rankByValue(cands)
    awards.push({
      category: 'EFFICIENCY',
      label: '효율왕',
      description: '유효 야투율 최고 (3점 가중)',
      metric: 'eFG%',
      minRequirement: `야투 시도 ≥ ${MIN_FGA}회`,
      winner, runners,
    })
  }

  // ── CLUTCH: 클러치 PPG ────────
  {
    const cands: AwardCandidate[] = []
    for (const p of eligible) {
      const cs = clutchMap.get(p.player_id)
      if (!cs || !cs.qualified) continue
      const cPpg = cs.clutch.gp > 0 ? +(cs.clutch.pts / cs.clutch.gp).toFixed(1) : 0
      const cFg = cs.clutch.fga > 0 ? +(cs.clutch.fgm / cs.clutch.fga * 100).toFixed(1) : 0
      cands.push(toCandidate(p, cPpg, `${cPpg} PPG`, {
        '클러치 게임': String(cs.clutch.gp),
        '클러치 FG%': `${cFg}%`,
      }))
    }
    const { winner, runners } = rankByValue(cands)
    awards.push({
      category: 'CLUTCH',
      label: 'Clutch POY',
      description: '결정적 순간 · 마지막 2분 3점차 이내',
      metric: '클러치 PPG',
      minRequirement: '클러치 3게임 이상',
      winner, runners,
    })
  }

  // ── MIP: 분기별 성장률 (뒤 분기 PPG - 앞 분기 PPG, 참여 분기 최소 2개) ─
  {
    // 리그 분기 조회 후 각 선수의 (첫 분기 vs 최근 분기) PPG 차이 계산
    // 참여 분기 1개인 선수는 제외
    const { data: quarters } = await supabase
      .from('league_quarters')
      .select('id, year, quarter')
      .eq('league_id', leagueId)
      .order('year', { ascending: true })
      .order('quarter', { ascending: true })
    const qList = (quarters ?? []) as Array<{ id: string; year: number; quarter: number }>

    if (qList.length >= 2) {
      // 각 분기별 스탯 병렬 조회 (동일 origin 재사용)
      const qStats = await Promise.all(qList.map(q =>
        fetch(`${origin}/api/leagues/${leagueId}/stats?unit=game&quarterId=${q.id}`, {
          headers: { cookie: req.headers.get('cookie') ?? '' },
          cache: 'no-store',
        }).then(r => r.ok ? r.json() : { players: [] })
      ))

      // playerId → [{quarter, ppg}, ...]
      const perPlayerQuarters = new Map<string, Array<{ q: number; ppg: number; gp: number }>>()
      qList.forEach((q, idx) => {
        const qPlayers = (qStats[idx].players ?? []) as PlayerStat[]
        for (const p of qPlayers) {
          if (p.gp < 3) continue  // 분기 3게임 미만은 표본 부족
          if (!perPlayerQuarters.has(p.player_id)) perPlayerQuarters.set(p.player_id, [])
          perPlayerQuarters.get(p.player_id)!.push({ q: q.quarter, ppg: p.ppg, gp: p.gp })
        }
      })

      const cands: AwardCandidate[] = []
      for (const [pid, arr] of perPlayerQuarters) {
        if (arr.length < 2) continue
        const first = arr[0]
        const last = arr[arr.length - 1]
        const growth = +(last.ppg - first.ppg).toFixed(2)
        const p = eligible.find(x => x.player_id === pid)
        if (!p) continue
        if (growth <= 0) continue  // 성장 있는 선수만
        cands.push(toCandidate(p, growth, `+${growth.toFixed(1)} PPG`, {
          '이전 분기': `${first.ppg.toFixed(1)} PPG (${first.gp}G)`,
          '최근 분기': `${last.ppg.toFixed(1)} PPG (${last.gp}G)`,
        }))
      }
      const { winner, runners } = rankByValue(cands)
      awards.push({
        category: 'MIP',
        label: '기량 발전상',
        description: '분기별 성장률 · 첫 분기 vs 최근 분기 PPG 상승',
        metric: 'PPG 증가폭',
        minRequirement: '최소 2개 분기 참여 (분기당 ≥3게임)',
        winner, runners,
      })
    } else {
      awards.push({
        category: 'MIP',
        label: '기량 발전상',
        description: '분기별 성장률 (분기 2개 이상 필요)',
        metric: 'PPG 증가폭',
        winner: null, runners: [],
      })
    }
  }

  return NextResponse.json({ awards })
}
