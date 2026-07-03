// 시즌 어워즈 API
//
// GET /api/leagues/[id]/awards
//   → { awards: AwardEntry[], attendance: { totalRounds, requiredRounds, threshold } }
//
// 자격 기준 (모든 부문 공통):
//   시즌 전체 경기일(round · 날짜 기준)의 60% 이상 참석
//   ex) 시즌 총 10일 경기 → 6일 이상 참석자만 후보
//
// 어워즈 카테고리 (9종):
//   MVP           — 종합 (PPG + RPG + APG + STL + BLK 가중합)
//   SCORING       — 득점왕 (PPG 최고)
//   REBOUND       — 리바운드왕 (RPG 최고)
//   ASSIST        — 어시스트왕 (APG 최고)
//   DPOY          — 수비왕 (SPG + BPG 최고)
//   THREE         — 3점왕 (3P%)
//   EFFICIENCY    — 효율왕 (eFG%)
//   CLUTCH        — 클러치왕 (마지막 2분 3점 이내 PPG · 클러치 3게임 이상 별도 요건)
//   MIP           — 기량 발전상 (분기별 성장률 · 2 분기 이상 필요)

import { NextResponse } from 'next/server'
import { computeClutchStats } from '@/lib/stats/clutchStats'
import { computePerDayStats } from '@/lib/stats/perDayStats'
import { createClient } from '@/lib/supabase/admin'
import type { PlayerStat } from '@/types/league'

export type AwardCategory = 'MVP' | 'SCORING' | 'REBOUND' | 'ASSIST' | 'DPOY' | 'THREE' | 'EFFICIENCY' | 'CLUTCH' | 'MIP'

export interface AwardCandidate {
  player_id: string
  name: string
  number: number | null
  position: string | null
  value: number         // 순위 결정 지표
  displayValue: string  // 화면 표시용
  gp: number
  supportingStats?: Record<string, string>
}

export interface AwardEntry {
  category: AwardCategory
  label: string
  description: string
  metric: string
  minRequirement?: string
  winner: AwardCandidate | null
  runners: AwardCandidate[]        // 2-3위 (카드 요약용)
  allCandidates: AwardCandidate[]  // 자격자 전체 (value 내림차순 · 모달 상세 뷰용)
}

export interface AttendanceInfo {
  totalRounds: number    // 시즌 전체 경기일 수
  requiredRounds: number // 자격 커트라인 (round 수)
  threshold: number      // 비율 (기본 0.60)
}

const ATTENDANCE_THRESHOLD = 0.60

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const supabase = createClient()

  // 1) 시즌 전체 경기일(round · 날짜 기준) 산출
  //    is_started=true 게임의 distinct date, 친선전 제외
  const { data: gameDates } = await supabase
    .from('league_games')
    .select('date')
    .eq('league_id', leagueId)
    .eq('is_started', true)
    .eq('is_exhibition', false)
  const uniqueDates = new Set<string>()
  for (const g of (gameDates ?? []) as { date: string }[]) uniqueDates.add(g.date)
  const totalRounds = uniqueDates.size
  const requiredRounds = Math.max(1, Math.ceil(totalRounds * ATTENDANCE_THRESHOLD))
  const attendance: AttendanceInfo = { totalRounds, requiredRounds, threshold: ATTENDANCE_THRESHOLD }

  // 2) 리그 스탯 조회 (unit=round → gp 가 참여 경기일 수)
  const origin = new URL(req.url).origin
  const statsRes = await fetch(`${origin}/api/leagues/${leagueId}/stats?unit=round`, {
    headers: { cookie: req.headers.get('cookie') ?? '' },
    cache: 'no-store',
  })
  const statsJson = await statsRes.json() as { players?: PlayerStat[] }
  const players = statsJson.players ?? []

  // 자격자: gp (=참여 경기일) >= requiredRounds
  const eligible = players.filter(p => p.gp >= requiredRounds)

  // 3) 클러치 스탯 조회
  const clutchSplits = await computeClutchStats(supabase, leagueId)
  const clutchMap = new Map(clutchSplits.map(s => [s.player_id, s]))

  // 3-1) 팀 승률 (MVP 팀 승리 기여도 계산용)
  //      perDayStats.dayWL 는 선수별 (날짜 → {wins, losses}) 맵.
  //      친선전 제외, 팀 다수결로 판정된 소속팀 기준.
  const { dayWL } = await computePerDayStats(supabase, leagueId)
  const teamWinRateByPlayer = new Map<string, { wins: number; losses: number; rate: number }>()
  for (const [pid, byDate] of dayWL) {
    let wins = 0, losses = 0
    for (const [, wl] of byDate) { wins += wl.wins; losses += wl.losses }
    const rate = (wins + losses) > 0 ? wins / (wins + losses) : 0
    teamWinRateByPlayer.set(pid, { wins, losses, rate })
  }

  // 4) 후보 헬퍼
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

  const rankByValue = (pool: (AwardCandidate | null)[]): { winner: AwardCandidate | null; runners: AwardCandidate[]; allCandidates: AwardCandidate[] } => {
    const filtered = pool.filter((c): c is AwardCandidate => c !== null && Number.isFinite(c.value))
    filtered.sort((a, b) => b.value - a.value)
    return { winner: filtered[0] ?? null, runners: filtered.slice(1, 3), allCandidates: filtered }
  }

  const attendanceReq = `시즌 ${totalRounds}일 중 ${requiredRounds}일(60%) 이상 참석`

  const awards: AwardEntry[] = []

  // ── MVP ────────
  // 종합 공식 = (기본 스탯 + 효율성 + 클러치 + 팀승률 보너스) × 참여도 배수
  //
  // 1) 기본 (5스탯):
  //      PPG × 1.1 + RPG + APG + (SPG + BPG) × 1.5 − TOPG × 0.5
  // 2) 효율성 보너스: (eFG% − 40) × 0.3
  //      · 45% eFG → +1.5 · 55% → +4.5 · 35% → −1.5
  // 3) 클러치 보너스: clutchPts × 0.1
  //      · 클러치 20점 → +2 · 40점 → +4
  // 4) 팀 승률 보너스: (winRate − 0.5) × 15
  //      · 0.500 → 0 · 0.700 → +3 · 0.400 → −1.5
  // 5) 참여도 배수: 0.75 + 0.25 × (gp / totalRounds)
  //      · 60% 참석 → ×0.90 · 100% 참석 → ×1.00
  {
    const cands = eligible.map(p => {
      const base = p.ppg * 1.1
                 + p.rpg
                 + p.apg
                 + (p.spg + p.bpg) * 1.5
                 - p.topg * 0.5
      const efficiencyBonus = (p.efg_pct - 40) * 0.3
      const clutchPts = clutchMap.get(p.player_id)?.clutch.pts ?? 0
      const clutchBonus = clutchPts * 0.1
      const teamRec = teamWinRateByPlayer.get(p.player_id)
      const winRate = teamRec?.rate ?? 0
      const winBonus = winRate > 0 ? (winRate - 0.5) * 15 : 0
      const participationRate = totalRounds > 0 ? Math.min(1, p.gp / totalRounds) : 1
      const attendanceMult = 0.75 + 0.25 * participationRate

      const raw = base + efficiencyBonus + clutchBonus + winBonus
      const mvp = raw * attendanceMult

      const supporting: Record<string, string> = {
        PPG: p.ppg.toFixed(1),
        RPG: p.rpg.toFixed(1),
        APG: p.apg.toFixed(1),
        SPG: p.spg.toFixed(1),
        BPG: p.bpg.toFixed(1),
        'eFG%': `${p.efg_pct.toFixed(1)}%`,
      }
      if (teamRec) supporting['팀 승률'] = `${(winRate * 100).toFixed(1)}% (${teamRec.wins}W-${teamRec.losses}L)`
      if (clutchPts > 0) supporting['클러치'] = `${clutchPts} PTS`
      supporting['참석률'] = `${(participationRate * 100).toFixed(0)}% (${p.gp}/${totalRounds}R)`

      return toCandidate(p, +mvp.toFixed(2), `${mvp.toFixed(1)} MVP`, supporting)
    })
    const { winner, runners, allCandidates } = rankByValue(cands)
    awards.push({
      category: 'MVP',
      label: 'MVP',
      description: '종합 임팩트 · 5 스탯 + 효율 + 클러치 + 팀 승률 × 참여도',
      metric: '가중 종합 점수',
      minRequirement: attendanceReq,
      winner, runners, allCandidates,
    })
  }

  // ── SCORING ────────
  {
    const cands = eligible.map(p => toCandidate(p, p.ppg, `${p.ppg.toFixed(1)} PPG`, { R: String(p.gp), PTS: String(p.pts) }))
    const { winner, runners, allCandidates } = rankByValue(cands)
    awards.push({
      category: 'SCORING',
      label: '득점왕',
      description: '경기일당 평균 득점 최고',
      metric: 'PPG',
      minRequirement: attendanceReq,
      winner, runners, allCandidates,
    })
  }

  // ── REBOUND ────────
  {
    const cands = eligible.map(p => toCandidate(p, p.rpg, `${p.rpg.toFixed(1)} RPG`, { OR: String(p.oreb), DR: String(p.dreb) }))
    const { winner, runners, allCandidates } = rankByValue(cands)
    awards.push({
      category: 'REBOUND',
      label: '리바운드왕',
      description: '경기일당 리바운드 최고',
      metric: 'RPG',
      minRequirement: attendanceReq,
      winner, runners, allCandidates,
    })
  }

  // ── ASSIST ────────
  {
    const cands = eligible.map(p => toCandidate(p, p.apg, `${p.apg.toFixed(1)} APG`, { AST: String(p.ast), TOV: String(p.tov) }))
    const { winner, runners, allCandidates } = rankByValue(cands)
    awards.push({
      category: 'ASSIST',
      label: '어시스트왕',
      description: '경기일당 어시스트 최고',
      metric: 'APG',
      minRequirement: attendanceReq,
      winner, runners, allCandidates,
    })
  }

  // ── DPOY ────────
  {
    const cands = eligible.map(p => toCandidate(p, +(p.spg + p.bpg).toFixed(2), `${(p.spg + p.bpg).toFixed(1)} STL+BLK`, {
      SPG: p.spg.toFixed(1), BPG: p.bpg.toFixed(1),
    }))
    const { winner, runners, allCandidates } = rankByValue(cands)
    awards.push({
      category: 'DPOY',
      label: 'DPOY',
      description: '최고의 수비수 · 스틸 + 블락',
      metric: 'STL + BLK per game',
      minRequirement: attendanceReq,
      winner, runners, allCandidates,
    })
  }

  // ── THREE (3P%) — 시도 없는 선수는 값 0 이 됨. 시도가 있는 경우만 후보 ────────
  {
    const cands = eligible.filter(p => p.fg3a > 0).map(p =>
      toCandidate(p, p.fg3_pct, `${p.fg3_pct.toFixed(1)}%`, {
        '3PM/3PA': `${p.fg3m}/${p.fg3a}`,
      })
    )
    const { winner, runners, allCandidates } = rankByValue(cands)
    awards.push({
      category: 'THREE',
      label: '3점왕',
      description: '3점 야투 성공률 최고',
      metric: '3P%',
      minRequirement: attendanceReq,
      winner, runners, allCandidates,
    })
  }

  // ── EFFICIENCY (eFG%) — 야투 시도 있는 경우만 ────────
  {
    const cands = eligible.filter(p => p.fga > 0).map(p =>
      toCandidate(p, p.efg_pct, `${p.efg_pct.toFixed(1)}%`, {
        'FGM/FGA': `${p.fgm}/${p.fga}`,
        '3PM': String(p.fg3m),
      })
    )
    const { winner, runners, allCandidates } = rankByValue(cands)
    awards.push({
      category: 'EFFICIENCY',
      label: '효율왕',
      description: '유효 야투율 최고 (3점 가중)',
      metric: 'eFG%',
      minRequirement: attendanceReq,
      winner, runners, allCandidates,
    })
  }

  // ── CLUTCH ────────
  // 누적 득점 기준 (평균은 표본이 작아서 숫자가 왜곡됨)
  // 야투 시도·성공 + 공격유형(골밑/레이업/미들/3점) 상세 표시
  {
    const cands: AwardCandidate[] = []
    for (const p of eligible) {
      const cs = clutchMap.get(p.player_id)
      if (!cs || !cs.qualified) continue
      const c = cs.clutch
      const fgPct = c.fga > 0 ? +(c.fgm / c.fga * 100).toFixed(1) : 0
      // 야투 유형별 made/attempted
      const shotTypeParts: string[] = []
      if (c.ds_a > 0) shotTypeParts.push(`골밑 ${c.ds_m}/${c.ds_a}`)
      if (c.lu_a > 0) shotTypeParts.push(`레이업 ${c.lu_m}/${c.lu_a}`)
      if (c.md_a > 0) shotTypeParts.push(`미들 ${c.md_m}/${c.md_a}`)
      if (c.fg3a > 0) shotTypeParts.push(`3점 ${c.fg3m}/${c.fg3a}`)
      const supporting: Record<string, string> = {
        '클러치 게임': String(c.gp),
        'FG': `${c.fgm}/${c.fga} (${fgPct}%)`,
      }
      if (shotTypeParts.length > 0) supporting['공격 유형'] = shotTypeParts.join(' · ')
      if (c.ftm > 0 || c.fta > 0) supporting['자유투'] = `${c.ftm}/${c.fta}`
      cands.push(toCandidate(p, c.pts, `${c.pts} PTS`, supporting))
    }
    const { winner, runners, allCandidates } = rankByValue(cands)
    awards.push({
      category: 'CLUTCH',
      label: 'Clutch POY',
      description: '결정적 순간 · 마지막 2분 3점차 이내 · 누적 득점 최고',
      metric: '클러치 누적 득점',
      minRequirement: `${attendanceReq} · 클러치 3게임 이상`,
      winner, runners, allCandidates,
    })
  }

  // ── MIP: 분기별 성장률 ────────
  {
    const { data: quarters } = await supabase
      .from('league_quarters')
      .select('id, year, quarter')
      .eq('league_id', leagueId)
      .order('year', { ascending: true })
      .order('quarter', { ascending: true })
    const qList = (quarters ?? []) as Array<{ id: string; year: number; quarter: number }>

    if (qList.length >= 2) {
      const qStats = await Promise.all(qList.map(q =>
        fetch(`${origin}/api/leagues/${leagueId}/stats?unit=round&quarterId=${q.id}`, {
          headers: { cookie: req.headers.get('cookie') ?? '' },
          cache: 'no-store',
        }).then(r => r.ok ? r.json() : { players: [] })
      ))

      const perPlayerQuarters = new Map<string, Array<{ q: number; ppg: number; gp: number }>>()
      qList.forEach((q, idx) => {
        const qPlayers = (qStats[idx].players ?? []) as PlayerStat[]
        for (const p of qPlayers) {
          if (p.gp < 3) continue
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
        if (growth <= 0) continue
        cands.push(toCandidate(p, growth, `+${growth.toFixed(1)} PPG`, {
          '이전 분기': `${first.ppg.toFixed(1)} PPG (${first.gp}R)`,
          '최근 분기': `${last.ppg.toFixed(1)} PPG (${last.gp}R)`,
        }))
      }
      const { winner, runners, allCandidates } = rankByValue(cands)
      awards.push({
        category: 'MIP',
        label: '기량 발전상',
        description: '분기별 성장률 · 첫 분기 vs 최근 분기 PPG 상승',
        metric: 'PPG 증가폭',
        minRequirement: `${attendanceReq} · 최소 2개 분기 참여 (분기당 ≥3R)`,
        winner, runners, allCandidates,
      })
    } else {
      awards.push({
        category: 'MIP',
        label: '기량 발전상',
        description: '분기별 성장률 (분기 2개 이상 필요)',
        metric: 'PPG 증가폭',
        minRequirement: attendanceReq,
        winner: null, runners: [], allCandidates: [],
      })
    }
  }

  return NextResponse.json({ awards, attendance })
}
