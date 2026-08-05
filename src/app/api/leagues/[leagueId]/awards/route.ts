// 시즌 어워즈 API
//
// GET /api/leagues/[id]/awards
//   → { awards: AwardEntry[], attendance: { totalRounds, requiredRounds, threshold } }
//
// 자격 기준 (모든 부문 공통 · IRON_MAN 제외):
//   시즌 전체 경기일(round · 날짜 기준)의 60% 이상 참석
//   ex) 시즌 총 10일 경기 → 6일 이상 참석자만 후보
//
// 어워즈 카테고리 (11종 · 2026-07-16 개편):
//   ── 코어 9 ────────
//   SCORING       — 득점왕 (누적 PTS)
//   REBOUND       — 리바운드왕 (누적 REB)
//   ASSIST        — 어시스트왕 (누적 AST)
//   DPOY          — 수비왕 (STL 35% + BLK 35% + DREB 30%)
//   THREE         — 3점왕 (3P%)
//   EFFICIENCY    — 야투효율왕 (eFG%)
//   CLUTCH        — 클러치왕 (결정타 슛 누적 · 3게임 이상)
//   IRON_MAN      — 철강왕 (참여 라운드 최다)
//   DOUBLE_DOUBLE — 더블더블 킹 (PTS/REB/AST/STL/BLK 중 2개 이상 10+ 게임 최다 · 트리플더블 포함)
//   ── 특수 3 ────────
//   OREB_KING     — 공격 리바운드왕 (누적 OREB)
//   MID_RANGE     — 미드레인지 마스터 (미드 성공 · 5시도 이상)
//   BEST_DUO      — 최고의 듀오 (상호 어시스트 합작 득점 최다)
//
// 폐지 (2026-07-16): MVP · MIP

import { NextResponse } from 'next/server'
import { computeClutchStats } from '@/lib/stats/clutchStats'
import { computeLeagueStats } from '@/lib/stats/leagueStats'
import { scorePoints, fetchScoringRules } from '@/lib/stats/scoring'
import { createClient } from '@/lib/supabase/admin'
import type { PlayerStat } from '@/types/league'
import { canViewStats } from '@/lib/auth/guard'

export type AwardCategory =
  | 'SCORING' | 'REBOUND' | 'ASSIST' | 'DPOY'
  | 'THREE' | 'EFFICIENCY' | 'CLUTCH' | 'IRON_MAN' | 'DOUBLE_DOUBLE'
  | 'OREB_KING' | 'MID_RANGE' | 'BEST_DUO'

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
  // BEST_DUO 전용 — 파트너 선수 메타 (파트너 없이 단일 선수 후보면 undefined)
  partner?: {
    player_id: string
    name: string
    number: number | null
    photo_url: string | null
  }
}

export interface AwardEntry {
  category: AwardCategory
  section: 'core' | 'special'
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

// BEST_DUO 계산에 쓰이는 야투 유형 (어시스트가 붙을 수 있는 이벤트)
//   · 자유투 · and_one 은 어시스트 대상 아님
const DUO_SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post']

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  // 스탯 게이팅 — 승인 회원 또는 편집 PIN 전용 (2026-07-28)
  if (!(await canViewStats(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const sp = new URL(req.url).searchParams
  // 분기별 어워즈 지원 — quarterId 없으면 시즌 전체
  const quarterId = sp.get('quarterId')
  const supabase = createClient()

  // 1-4) 초기 병렬 실행 — 서로 독립적.
  //      · gameRows: 시즌 라운드 일수 산출 (attendance) + BEST_DUO 이벤트 스코프 game id
  //      · statsResult (computeLeagueStats): 선수 season stats
  //      · playerRows: 게스트 필터 + 사진 맵
  //      · clutchSplits: 클러치 스탯 (CLUTCH 카테고리)
  let gamesQuery = supabase
    .from('league_games')
    .select('id, date, quarter_id, plus_one_player_id')
    .eq('league_id', leagueId)
    .eq('is_started', true)
    .eq('is_exhibition', false)
  if (quarterId) gamesQuery = gamesQuery.eq('quarter_id', quarterId)

  const [
    { data: gameRows, error: gameRowsErr },
    statsResult,
    { data: playerRows, error: playerRowsErr },
    clutchSplits,
    scoringRules,
  ] = await Promise.all([
    gamesQuery,
    computeLeagueStats(supabase, leagueId, { quarterId: quarterId ?? null, unit: 'round' }),
    supabase.from('league_players').select('id, is_guest, photo_url, plus_one').eq('league_id', leagueId),
    computeClutchStats(supabase, leagueId, quarterId ? { quarterId } : undefined),
    fetchScoringRules(supabase, leagueId),
  ])
  // gameRows 는 출석 자격(라운드 수) 산출 기준이고 playerRows 는 게스트 제외/plus_one 판정 기준이다 —
  // 둘 다 실패를 조용히 넘기면 "자격자 없음"으로 보여 어워즈 전체가 빈 화면이 된다.
  if (gameRowsErr) return NextResponse.json({ error: `league_games 조회 실패 — ${gameRowsErr.message}` }, { status: 500 })
  if (playerRowsErr) return NextResponse.json({ error: `league_players 조회 실패 — ${playerRowsErr.message}` }, { status: 500 })

  const uniqueDates = new Set<string>()
  const gameIds: string[] = []
  const gameToDate = new Map<string, string>()  // gid → 'YYYY-MM-DD' · DD 라운드 단위 집계용
  // 게임별 플러스원 지명 — 더블더블 득점 계산의 plus_one 판정에 쓴다
  const gamePlusOne = new Map<string, string | null>()
  for (const g of (gameRows ?? []) as { id: string; date: string; quarter_id: string | null; plus_one_player_id: string | null }[]) {
    uniqueDates.add(g.date)
    gameIds.push(g.id)
    gameToDate.set(g.id, g.date)
    gamePlusOne.set(g.id, g.plus_one_player_id ?? null)
  }
  const totalRounds = uniqueDates.size
  const requiredRounds = Math.max(1, Math.ceil(totalRounds * ATTENDANCE_THRESHOLD))
  const attendance: AttendanceInfo = { totalRounds, requiredRounds, threshold: ATTENDANCE_THRESHOLD }

  const players = statsResult.players

  const guestIds = new Set<string>()
  const photoMap = new Map<string, string | null>()
  const plusOneSet = new Set<string>()
  for (const r of (playerRows ?? []) as { id: string; is_guest: boolean | null; photo_url: string | null; plus_one: boolean | null }[]) {
    if (r.plus_one) plusOneSet.add(r.id)
    if (r.is_guest) guestIds.add(r.id)
    photoMap.set(r.id, r.photo_url ?? null)
  }

  // 자격자: gp (=참여 경기일) >= requiredRounds && 게스트 아님
  const eligible = players.filter(p => p.gp >= requiredRounds && !guestIds.has(p.player_id))

  const clutchMap = new Map(clutchSplits.map(s => [s.player_id, s]))

  // 5) 후보 헬퍼
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

  // ═══════════════════════════════════════════════════════
  // 코어 8부문
  // ═══════════════════════════════════════════════════════

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
      section: 'core',
      label: '득점왕',
      description: '시즌 누적 득점 최고 · 유형별 슛 기록 포함',
      metric: '누적 PTS',
      minRequirement: attendanceReq,
      winner, runners, allCandidates,
    })
  }

  // ── REBOUND (누적 리바운드) ────────
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
      section: 'core',
      label: '리바운드왕',
      description: '시즌 누적 리바운드 최고 · 공격/수비 분해 포함',
      metric: '누적 REB',
      minRequirement: attendanceReq,
      winner, runners, allCandidates,
    })
  }

  // ── ASSIST (누적 어시스트) ────────
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
      section: 'core',
      label: '어시스트왕',
      description: '시즌 누적 어시스트 최고',
      metric: '누적 AST',
      minRequirement: attendanceReq,
      winner, runners, allCandidates,
    })
  }

  // ── DPOY ────────
  // STL 35% + BLK 35% + DREB 30% 정규화 가중합 (0-100)
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
      section: 'core',
      label: 'DPOY',
      description: '최고의 수비수 · STL 35% + BLK 35% + DREB 30% 가중',
      metric: '가중 수비 점수 (0-100)',
      minRequirement: attendanceReq,
      winner, runners, allCandidates,
    })
  }

  // ── THREE (3P%) — 시도 있는 경우만 후보 ────────
  {
    const cands = eligible.filter(p => p.fg3a > 0).map(p =>
      toCandidate(p, p.fg3_pct, `${p.fg3_pct.toFixed(1)}%`, {
        '3PM/3PA': `${p.fg3m}/${p.fg3a}`,
      })
    )
    const { winner, runners, allCandidates } = rankByValue(cands)
    awards.push({
      category: 'THREE',
      section: 'core',
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
      section: 'core',
      label: '효율왕',
      description: '유효 야투율 최고 (3점 가중)',
      metric: 'eFG%',
      minRequirement: attendanceReq,
      winner, runners, allCandidates,
    })
  }

  // ── CLUTCH ────────
  {
    const cands: AwardCandidate[] = []
    for (const p of eligible) {
      const cs = clutchMap.get(p.player_id)
      if (!cs || !cs.qualified) continue
      const c = cs.clutch
      const fgPct = c.fga > 0 ? +(c.fgm / c.fga * 100).toFixed(1) : 0
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
      section: 'core',
      label: 'Clutch POY',
      description: '결정타 슛 누적 득점 최고 · 마지막 2분 · 2포제션(6점) 접전에서 이 슛으로 1포제션(3점)으로 좁혀진 결정타',
      metric: '결정타 슛 누적 득점',
      minRequirement: `${attendanceReq} · 클러치 3게임 이상`,
      winner, runners, allCandidates,
    })
  }

  // ── IRON_MAN (개근왕) ────────
  //   자격 요건 완화: gp>=1 인 모두 (게스트 제외) — 특성상 attendanceReq 대신 참여 최다
  {
    const ironCands = players
      .filter(p => p.gp >= 1 && !guestIds.has(p.player_id))
      .map(p => {
        const rate = totalRounds > 0 ? (p.gp / totalRounds) * 100 : 0
        return toCandidate(p, p.gp, `${p.gp}R`, {
          '참석률': totalRounds > 0 ? `${rate.toFixed(0)}% (${p.gp}/${totalRounds}R)` : `${p.gp}R`,
        })
      })
    const { winner, runners, allCandidates } = rankByValue(ironCands)
    awards.push({
      category: 'IRON_MAN',
      section: 'core',
      label: '철강왕',
      description: '참여 라운드 최다 · 모든 등록 선수 대상',
      metric: '참여 R',
      minRequirement: '누구나 · 게스트 제외',
      winner, runners, allCandidates,
    })
  }

  // ── DOUBLE_DOUBLE (더블더블 킹) ────────
  //   정의: (선수, 라운드=date) 단위로 PTS/REB/AST/STL/BLK 중 10+ 개수를 세어 2개 이상이면 더블더블
  //         트리플더블(3개+)도 자동 포함
  //   범위: attendance 자격 통과 선수 (게스트 제외)
  //   계산: 이벤트 스캔 → per (player, date) 5개 카운트 → 라운드 판정
  //         · 이 리그는 하루=라운드=여러 미니게임(8~15분) 이라 게임 단위 10+ 는 사실상 불가능
  //           → gp/leagueStats 와 동일하게 date(라운드) 단위 집계로 통일
  //         · pts = shot make points (event.points 컬럼 · missed→made 편집 후 백필됨)
  //         · ast = 슛 이벤트의 related_player_id 참조 (자유투/and_one 제외)
  {
    interface RdStat { pts: number; reb: number; ast: number; stl: number; blk: number }
    const perRound = new Map<string, Map<string, RdStat>>()  // pid → date → stats
    const ensurePR = (pid: string, date: string): RdStat => {
      if (!perRound.has(pid)) perRound.set(pid, new Map())
      const rm = perRound.get(pid)!
      let s = rm.get(date)
      if (!s) { s = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0 }; rm.set(date, s) }
      return s
    }

    if (gameIds.length > 0) {
      const DD_SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post']
      const DD_TYPES = [
        ...DD_SHOT_TYPES,
        'and_one', 'ft_2pt', 'ft_3pt_1', 'ft_3pt_2', 'free_throw',
        'oreb', 'dreb', 'steal', 'block',
      ]
      const PAGE = 1000
      for (let p = 0; ; p++) {
        const { data: chunk, error: chunkErr } = await supabase
          .from('league_game_events')
          .select('league_player_id, related_player_id, league_game_id, type, result, points')
          .in('league_game_id', gameIds)
          .in('type', DD_TYPES)
          .order('id', { ascending: true })
          .range(p * PAGE, (p + 1) * PAGE - 1)
        // 페이지 중간 실패를 "더 이상 없음"과 같은 걸로 취급하면 더블더블 킹이 일부 라운드만으로 집계된다.
        if (chunkErr) throw new Error(`awards(DOUBLE_DOUBLE): leagueId=${leagueId} 페이지네이션(p=${p}) 실패 — ${chunkErr.message}`)
        if (!chunk || chunk.length === 0) break
        for (const e of chunk as Array<{
          league_player_id: string | null; related_player_id: string | null
          league_game_id: string; type: string; result: string | null; points: number | null
        }>) {
          const pid = e.league_player_id
          const date = gameToDate.get(e.league_game_id)
          if (!date) continue  // scope 밖 게임 (실질적으로 안 걸림 · gameIds 로 이미 필터)
          const made = e.result === 'made'
          if (pid) {
            const s = ensurePR(pid, date)
            // 득점은 시즌 rules 로 계산한다.
            // 예전엔 야투는 저장된 points 를, 자유투·앤드원은 미라클 배점(ft_2pt=2 등)을
            // 코드에 박아 계산했다 — 자유투 배점이 다른 동호회에서 더블더블이 조작되는 결함이었다.
            const gp1 = gamePlusOne.get(e.league_game_id) ?? null
            const isPlusOne = gp1 !== null ? pid === gp1 : plusOneSet.has(pid)
            s.pts += scorePoints(e.type, e.result, isPlusOne, scoringRules)
            if (e.type === 'oreb' || e.type === 'dreb') s.reb++
            else if (e.type === 'steal') s.stl++
            else if (e.type === 'block') s.blk++
          }
          // 어시스트는 shot made 의 related_player_id 로만
          if (made && DD_SHOT_TYPES.includes(e.type) && e.related_player_id) {
            ensurePR(e.related_player_id, date).ast++
          }
        }
        if (chunk.length < PAGE) break
      }
    }

    interface DDAcc { dd: number; td: number }
    const ddCount = new Map<string, DDAcc>()
    for (const [pid, rm] of perRound) {
      let dd = 0, td = 0
      for (const s of rm.values()) {
        const hits = [s.pts, s.reb, s.ast, s.stl, s.blk].filter(v => v >= 10).length
        if (hits >= 3) { td++; dd++ }  // TD 는 DD 를 포함해서 카운트
        else if (hits >= 2) dd++
      }
      if (dd > 0) ddCount.set(pid, { dd, td })
    }

    const ddCands = eligible
      .map(p => {
        const acc = ddCount.get(p.player_id)
        if (!acc) return null
        const supporting: Record<string, string> = {
          '더블더블': `${acc.dd}회`,
          R: String(p.gp),
        }
        if (acc.td > 0) supporting['트리플더블'] = `${acc.td}회`
        return toCandidate(p, acc.dd, `${acc.dd}회`, supporting)
      })
      .filter((c): c is AwardCandidate => c !== null)

    const { winner, runners, allCandidates } = rankByValue(ddCands)
    awards.push({
      category: 'DOUBLE_DOUBLE',
      section: 'core',
      label: '더블더블 킹',
      description: '하루(라운드) 합계 기준 PTS / REB / AST / STL / BLK 중 2개 이상 10+ 을 기록한 라운드 최다 · 트리플더블 포함',
      metric: '더블더블 라운드 수',
      minRequirement: `${attendanceReq} · DD 1회 이상`,
      winner, runners, allCandidates,
    })
  }

  // ═══════════════════════════════════════════════════════
  // 특수 3부문
  // ═══════════════════════════════════════════════════════

  // ── OREB_KING (공격 리바운드왕) ────────
  {
    const cands = eligible.map(p => toCandidate(p, p.oreb, `${p.oreb}개`, {
      '경기당': `${p.orp.toFixed(1)}개`,
      R: String(p.gp),
      OREB: String(p.oreb),
      DREB: String(p.dreb),
    }))
    const { winner, runners, allCandidates } = rankByValue(cands)
    awards.push({
      category: 'OREB_KING',
      section: 'special',
      label: '공격 리바운드왕',
      description: '공격 리바운드 최다',
      metric: 'OREB (누적)',
      minRequirement: attendanceReq,
      winner, runners, allCandidates,
    })
  }

  // ── MID_RANGE (미드레인지 마스터) ────────
  {
    const cands = eligible.filter(p => p.md_a >= 5).map(p => {
      const pct = p.md_a > 0 ? +(p.md_m / p.md_a * 100).toFixed(1) : 0
      return toCandidate(p, p.md_m, `${p.md_m}개`, {
        '시도': `${p.md_a}회`,
        '야투율': `${pct.toFixed(1)}%`,
        R: String(p.gp),
      })
    })
    const { winner, runners, allCandidates } = rankByValue(cands)
    awards.push({
      category: 'MID_RANGE',
      section: 'special',
      label: '미드레인지 마스터',
      description: '미드레인지 슛 성공 최다 · 정확도 병기',
      metric: '미드 성공 (야투율)',
      minRequirement: `${attendanceReq} · 미드 5시도 이상`,
      winner, runners, allCandidates,
    })
  }

  // ── BEST_DUO (최고의 듀오) ────────
  //   정의: 두 선수 (A, B) 의 상호 어시스트로 만든 합작 득점
  //         duo_pts = SUM(points)  WHERE (scorer, assister) ∈ {(A,B), (B,A)}
  //         pair 는 순서 무관 — LEAST/GREATEST 로 정규화
  //   요건: 두 선수 모두 attendance 자격 충족 (게스트 제외)
  //   범위: 시즌·해당 분기의 real 게임 (친선 제외) · FIELD SHOT 만 (자유투/and_one 제외)
  {
    // 페어별 합작 득점 · 이벤트 수 · scorer 별 분배
    interface PairAcc {
      pts: number
      count: number
      byScorer: Map<string, number>  // scorerPid → 그 선수가 넣은 점수 (파트너 어시스트 받음)
    }
    const pairMap = new Map<string, PairAcc>()

    if (gameIds.length > 0) {
      // 이벤트 페이지네이션 (클러치 스탯 방식과 동일)
      const PAGE = 1000
      for (let p = 0; ; p++) {
        const { data: chunk, error: chunkErr } = await supabase
          .from('league_game_events')
          .select('league_player_id, related_player_id, points')
          .in('league_game_id', gameIds)
          .in('type', DUO_SHOT_TYPES)
          .eq('result', 'made')
          .not('league_player_id', 'is', null)
          .not('related_player_id', 'is', null)
          .gt('points', 0)
          .order('id', { ascending: true })
          .range(p * PAGE, (p + 1) * PAGE - 1)
        // 페이지 중간 실패를 "더 이상 없음"과 같은 걸로 취급하면 BEST_DUO 후보가 일부만 집계된다.
        if (chunkErr) throw new Error(`awards(BEST_DUO): leagueId=${leagueId} 페이지네이션(p=${p}) 실패 — ${chunkErr.message}`)
        if (!chunk || chunk.length === 0) break
        for (const e of chunk as Array<{ league_player_id: string; related_player_id: string; points: number }>) {
          const scorer = e.league_player_id
          const assister = e.related_player_id
          if (!scorer || !assister || scorer === assister) continue
          const key = scorer < assister ? `${scorer}|${assister}` : `${assister}|${scorer}`
          let acc = pairMap.get(key)
          if (!acc) {
            acc = { pts: 0, count: 0, byScorer: new Map() }
            pairMap.set(key, acc)
          }
          acc.pts += e.points
          acc.count += 1
          acc.byScorer.set(scorer, (acc.byScorer.get(scorer) ?? 0) + e.points)
        }
        if (chunk.length < PAGE) break
      }
    }

    // 자격자 조합만 필터 (양쪽 모두 eligible)
    const eligibleMap = new Map<string, PlayerStat>()
    for (const p of eligible) eligibleMap.set(p.player_id, p)

    const duoCands: AwardCandidate[] = []
    for (const [key, acc] of pairMap) {
      const [pidA, pidB] = key.split('|')
      const a = eligibleMap.get(pidA)
      const b = eligibleMap.get(pidB)
      if (!a || !b) continue

      // 이름 알파벳순 대신 duo_pts 기여도 큰 쪽을 primary 로 (winner 카드에 anchor)
      const ptsA = acc.byScorer.get(pidA) ?? 0
      const ptsB = acc.byScorer.get(pidB) ?? 0
      const primary = ptsA >= ptsB ? a : b
      const partner = ptsA >= ptsB ? b : a
      const primaryPts = ptsA >= ptsB ? ptsA : ptsB
      const partnerPts = ptsA >= ptsB ? ptsB : ptsA

      duoCands.push({
        player_id: primary.player_id,
        name: primary.name,
        number: primary.number,
        position: primary.position,
        photo_url: photoMap.get(primary.player_id) ?? null,
        value: acc.pts,
        displayValue: `${acc.pts}점 합작`,
        gp: primary.gp,
        supportingStats: {
          '이벤트': `${acc.count}회`,
          '득점 분포': `${primary.name} ${primaryPts}점 · ${partner.name} ${partnerPts}점`,
        },
        partner: {
          player_id: partner.player_id,
          name: partner.name,
          number: partner.number,
          photo_url: photoMap.get(partner.player_id) ?? null,
        },
      })
    }

    const { winner, runners, allCandidates } = rankByValue(duoCands)
    awards.push({
      category: 'BEST_DUO',
      section: 'special',
      label: '최고의 듀오',
      description: '두 선수의 상호 어시스트로 만든 합작 득점 최고',
      metric: '합작 득점 (양방향 어시스트)',
      minRequirement: `${attendanceReq} · 두 선수 모두 충족`,
      winner, runners, allCandidates,
    })
  }

  return NextResponse.json({ awards, attendance })
}
