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
  photo_url: string | null
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
  const sp = new URL(req.url).searchParams
  // 분기별 어워즈 지원 — quarterId 없으면 시즌 전체
  const quarterId = sp.get('quarterId')
  const supabase = createClient()

  // 1) 시즌 전체 경기일(round · 날짜 기준) 산출 — 분기 지정 시 그 분기만
  let dateQuery = supabase
    .from('league_games')
    .select('date, quarter_id')
    .eq('league_id', leagueId)
    .eq('is_started', true)
    .eq('is_exhibition', false)
  if (quarterId) dateQuery = dateQuery.eq('quarter_id', quarterId)
  const { data: gameDates } = await dateQuery
  const uniqueDates = new Set<string>()
  for (const g of (gameDates ?? []) as { date: string; quarter_id: string | null }[]) uniqueDates.add(g.date)
  const totalRounds = uniqueDates.size
  const requiredRounds = Math.max(1, Math.ceil(totalRounds * ATTENDANCE_THRESHOLD))
  const attendance: AttendanceInfo = { totalRounds, requiredRounds, threshold: ATTENDANCE_THRESHOLD }

  // 2) 리그 스탯 조회 (unit=round → gp 가 참여 경기일 수) — 분기 필터 전파
  const origin = new URL(req.url).origin
  const statsUrl = quarterId
    ? `${origin}/api/leagues/${leagueId}/stats?unit=round&quarterId=${encodeURIComponent(quarterId)}`
    : `${origin}/api/leagues/${leagueId}/stats?unit=round`
  const statsRes = await fetch(statsUrl, {
    headers: { cookie: req.headers.get('cookie') ?? '' },
    cache: 'no-store',
  })
  const statsJson = await statsRes.json() as { players?: PlayerStat[] }
  const players = statsJson.players ?? []

  // 2-1) 게스트 선수 ID + 프로필 사진 조회 (한 번의 조회로 통합)
  //      게스트: 60% 출석 필터를 통과해도 게스트는 MVP·수상 대상이 아님
  //      photo_url: WINNER 카드 우측 프로필 노출용
  const { data: playerRows } = await supabase
    .from('league_players')
    .select('id, is_guest, photo_url')
    .eq('league_id', leagueId)
  const guestIds = new Set<string>()
  const photoMap = new Map<string, string | null>()
  for (const r of (playerRows ?? []) as { id: string; is_guest: boolean | null; photo_url: string | null }[]) {
    if (r.is_guest) guestIds.add(r.id)
    photoMap.set(r.id, r.photo_url ?? null)
  }

  // 자격자: gp (=참여 경기일) >= requiredRounds && 게스트 아님
  const eligible = players.filter(p => p.gp >= requiredRounds && !guestIds.has(p.player_id))

  // 3) 클러치 스탯 조회 (분기 필터 전파)
  const clutchSplits = await computeClutchStats(supabase, leagueId, quarterId ? { quarterId } : undefined)
  const clutchMap = new Map(clutchSplits.map(s => [s.player_id, s]))

  // 3-1) 팀 승률 (MVP 팀 승리 기여도 계산용) — 분기 필터 전파
  //      quarterId 지정 시 그 분기 게임의 W/L 만 반영
  const { dayWL } = await computePerDayStats(supabase, leagueId, quarterId ? { quarterId } : {})
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
    photo_url: photoMap.get(p.player_id) ?? null,
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

  // ── SCORING (누적 득점) ────────
  // 순위 기준: 총 득점 (PTS)
  // 부가: PPG (평균) + 유형별 슛 기록 (3점/미드/레이업/골밑/FT)
  {
    const cands = eligible.map(p => {
      // 유형별 표시 형식: 성공/시도 (성공률)
      const shotLine = (m: number, a: number) => a > 0 ? `${m}/${a} (${(m / a * 100).toFixed(0)}%)` : `${m}/0`
      const supporting: Record<string, string> = {
        PPG: p.ppg.toFixed(1),
        R: String(p.gp),
        '3점': shotLine(p.fg3m, p.fg3a),
        '미드': shotLine(p.md_m, p.md_a),
        '레이업': shotLine(p.lu_m, p.lu_a),
        '골밑': shotLine(p.ds_m, p.ds_a),
        'FT': shotLine(p.ftm, p.fta),
      }
      return toCandidate(p, p.pts, `${p.pts} PTS`, supporting)
    })
    const { winner, runners, allCandidates } = rankByValue(cands)
    awards.push({
      category: 'SCORING',
      label: '득점왕',
      description: '시즌 누적 득점 최고 · 유형별 슛 기록 포함',
      metric: '누적 PTS',
      minRequirement: attendanceReq,
      winner, runners, allCandidates,
    })
  }

  // ── REBOUND (누적 리바운드) ────────
  // 순위 기준: 총 리바운드 (REB)
  // 부가: RPG (평균) + 공격/수비 분해 (OR/DR) + 게임 수
  {
    const cands = eligible.map(p => toCandidate(p, p.reb, `${p.reb} REB`, {
      RPG: p.rpg.toFixed(1),
      R: String(p.gp),
      OREB: String(p.oreb),
      DREB: String(p.dreb),
    }))
    const { winner, runners, allCandidates } = rankByValue(cands)
    awards.push({
      category: 'REBOUND',
      label: '리바운드왕',
      description: '시즌 누적 리바운드 최고 · 공격/수비 분해 포함',
      metric: '누적 REB',
      minRequirement: attendanceReq,
      winner, runners, allCandidates,
    })
  }

  // ── ASSIST (누적 어시스트) ────────
  // 순위 기준: 총 어시스트 (AST)
  // 부가: APG (평균) + TOV + A/T ratio
  {
    const cands = eligible.map(p => {
      const atRatio = p.tov > 0 ? +(p.ast / p.tov).toFixed(2) : p.ast
      return toCandidate(p, p.ast, `${p.ast} AST`, {
        APG: p.apg.toFixed(1),
        R: String(p.gp),
        TOV: String(p.tov),
        'A/T': p.tov > 0 ? atRatio.toFixed(2) : '—',
      })
    })
    const { winner, runners, allCandidates } = rankByValue(cands)
    awards.push({
      category: 'ASSIST',
      label: '어시스트왕',
      description: '시즌 누적 어시스트 최고',
      metric: '누적 AST',
      minRequirement: attendanceReq,
      winner, runners, allCandidates,
    })
  }

  // ── DPOY ────────
  // 가중 공식: STL 35% + BLK 35% + DREB 30%
  // 각 스탯을 리그 max 로 정규화 후 가중합 → 0-100 점수
  // (raw 합산은 stat 별 스케일 차이 때문에 리바운드가 지배함)
  {
    const maxSpg  = Math.max(0.001, ...eligible.map(p => p.spg))
    const maxBpg  = Math.max(0.001, ...eligible.map(p => p.bpg))
    const maxDrp  = Math.max(0.001, ...eligible.map(p => p.drp))
    const cands = eligible.map(p => {
      const stlScore = (p.spg / maxSpg) * 35
      const blkScore = (p.bpg / maxBpg) * 35
      const drbScore = (p.drp / maxDrp) * 30
      const total = +(stlScore + blkScore + drbScore).toFixed(2)
      return toCandidate(p, total, `${total.toFixed(1)} DEF`, {
        SPG: p.spg.toFixed(1),
        BPG: p.bpg.toFixed(1),
        'DR/G': p.drp.toFixed(1),
        STL: String(p.stl),
        BLK: String(p.blk),
        DREB: String(p.dreb),
      })
    })
    const { winner, runners, allCandidates } = rankByValue(cands)
    awards.push({
      category: 'DPOY',
      label: 'DPOY',
      description: '최고의 수비수 · STL 35% + BLK 35% + DREB 30% 가중',
      metric: '가중 수비 점수 (0-100)',
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

    // 대상 분기 결정:
    //   quarterId 있으면 그 분기 (예: 3Q 뷰 → 3Q), 없으면 qList 중 최신
    // 비교: (대상 분기) vs (바로 이전 분기)
    // 3Q 뷰에서는 반드시 2Q vs 3Q 만 비교 — 3Q gp<3 라도 1Q·2Q 로 fallback 하지 않음
    const targetIdx = quarterId
      ? qList.findIndex(q => q.id === quarterId)
      : qList.length - 1
    const targetQ = targetIdx >= 0 ? qList[targetIdx] : null
    const prevQ = targetIdx >= 1 ? qList[targetIdx - 1] : null

    if (targetQ && prevQ) {
      const [targetStats, prevStats] = await Promise.all([
        fetch(`${origin}/api/leagues/${leagueId}/stats?unit=round&quarterId=${targetQ.id}`, {
          headers: { cookie: req.headers.get('cookie') ?? '' },
          cache: 'no-store',
        }).then(r => r.ok ? r.json() : { players: [] }),
        fetch(`${origin}/api/leagues/${leagueId}/stats?unit=round&quarterId=${prevQ.id}`, {
          headers: { cookie: req.headers.get('cookie') ?? '' },
          cache: 'no-store',
        }).then(r => r.ok ? r.json() : { players: [] }),
      ])

      const targetByPid = new Map<string, PlayerStat>()
      for (const p of (targetStats.players ?? []) as PlayerStat[]) targetByPid.set(p.player_id, p)
      const prevByPid = new Map<string, PlayerStat>()
      for (const p of (prevStats.players ?? []) as PlayerStat[]) prevByPid.set(p.player_id, p)

      // 각 분기 최소 참여 요건 — 분기가 짧을 수 있으므로 gp>=2 로 완화 (통계적 유의성 유지)
      const MIN_ROUNDS_PER_QUARTER = 2
      const cands: AwardCandidate[] = []
      for (const p of eligible) {
        const target = targetByPid.get(p.player_id)
        const prev = prevByPid.get(p.player_id)
        if (!target || !prev) continue
        if (target.gp < MIN_ROUNDS_PER_QUARTER || prev.gp < MIN_ROUNDS_PER_QUARTER) continue
        const growth = +(target.ppg - prev.ppg).toFixed(2)
        if (growth <= 0) continue
        cands.push(toCandidate(p, growth, `+${growth.toFixed(1)} PPG`, {
          [`${prevQ.quarter}Q`]: `${prev.ppg.toFixed(1)} PPG (${prev.gp}R)`,
          [`${targetQ.quarter}Q`]: `${target.ppg.toFixed(1)} PPG (${target.gp}R)`,
        }))
      }
      const { winner, runners, allCandidates } = rankByValue(cands)
      awards.push({
        category: 'MIP',
        label: '기량 발전상',
        description: `분기별 성장률 · ${prevQ.quarter}Q vs ${targetQ.quarter}Q PPG 상승`,
        metric: 'PPG 증가폭',
        minRequirement: `${attendanceReq} · ${prevQ.quarter}Q·${targetQ.quarter}Q 각 ${MIN_ROUNDS_PER_QUARTER}R 이상 참여`,
        winner, runners, allCandidates,
      })
    } else {
      awards.push({
        category: 'MIP',
        label: '기량 발전상',
        description: targetQ && !prevQ
          ? `${targetQ.quarter}Q — 이전 분기 데이터가 없어 비교 불가`
          : '분기별 성장률 (분기 2개 이상 필요)',
        metric: 'PPG 증가폭',
        minRequirement: attendanceReq,
        winner: null, runners: [], allCandidates: [],
      })
    }
  }

  return NextResponse.json({ awards, attendance })
}
