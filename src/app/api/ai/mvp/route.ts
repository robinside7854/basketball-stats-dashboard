import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/client'
import { createClient as createAdmin } from '@/lib/supabase/admin'
import { calculateBoxScore } from '@/lib/stats/calculator'
import type { PlayerBoxScore } from '@/types/database'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface AwardEntry {
  player_id: string
  player_name: string
  reason: string
}

export interface MvpResult {
  mvp: AwardEntry
  x_factor: AwardEntry | null
}

// ── Opus 설계 기준 적용: MVP Score ──────────────────────────────
function calcMvpScore(s: PlayerBoxScore): number {
  const efgPct = s.efg_pct / 100
  const tsPct = s.ts_pct / 100

  const chuckerPenalty =
    s.fga >= 10 && s.fg_pct < 30 ? (s.fga - s.fgm) * 0.3 : 0

  return (
    s.pts * 1.0 +
    efgPct * 20 +
    tsPct * 15 +
    s.ast * 1.5 +
    s.reb * 0.8 +
    s.oreb * 0.5 +
    s.stl * 1.5 +
    s.blk * 1.2 +
    s.fg3m * 0.5 +
    (s.double_double ? 3.0 : 0) +
    (s.triple_double ? 5.0 : 0) +
    s.plus_minus * 0.3 -
    s.tov * 1.5 -
    s.pf * 0.3 -
    chuckerPenalty
  )
}

// ── Opus 설계 기준 적용: X-FACTOR Score ─────────────────────────
function calcXfactorScore(s: PlayerBoxScore, teamHighPts: number): number {
  const highScorerPenalty = s.pts >= teamHighPts * 0.8 ? s.pts * 0.5 : 0
  const burstBonus =
    s.pts >= 6 && s.pts <= 12 && (s.stl >= 2 || s.oreb >= 2 || s.ast >= 3)
      ? 2.0
      : 0

  return (
    s.ast * 2.5 +
    s.oreb * 3.0 +
    s.dreb * 1.0 +
    s.stl * 2.5 +
    s.blk * 2.5 +
    s.pts * 0.3 +
    s.fg3m * 0.3 +
    s.plus_minus * 0.4 +
    s.ftm * 0.2 -
    s.tov * 1.0 -
    highScorerPenalty +
    burstBonus
  )
}

// ── 스탯 텍스트 (AI 코멘트용) ────────────────────────────────────
function statsLine(s: PlayerBoxScore): string {
  const fg = s.fga > 0 ? `${s.fgm}/${s.fga} FG(${s.fg_pct.toFixed(0)}%)` : '0/0 FG'
  const tp = s.fg3a > 0 ? ` ${s.fg3m}/${s.fg3a} 3P` : ''
  const ft = s.fta > 0 ? ` ${s.ftm}/${s.fta} FT` : ''
  return (
    `#${s.player_number} ${s.player_name}: ` +
    `${s.pts}pts ${fg}${tp}${ft} | ` +
    `${s.reb}reb(OR${s.oreb}/DR${s.dreb}) ${s.ast}ast ` +
    `${s.stl}stl ${s.blk}blk ${s.tov}tov ${s.pf}pf ` +
    `+/-:${s.plus_minus >= 0 ? '+' : ''}${s.plus_minus}`
  )
}

// GET: 캐시된 결과만 반환 (AI 실행 없음)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })

  const supabase = createClient()
  const { data: gameRow } = await supabase
    .from('games')
    .select('ai_mvp')
    .eq('id', gameId)
    .single()

  if (!gameRow) return NextResponse.json({ error: '경기를 찾을 수 없습니다' }, { status: 404 })
  if (!gameRow.ai_mvp) return new Response(null, { status: 204 })

  return NextResponse.json(gameRow.ai_mvp as MvpResult)
}

// POST: AI 분석 실행 + DB 저장 (버튼 클릭 시 호출)
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })

  // ── 1. API 키 확인 ───────────────────────────────────────────
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다' }, { status: 503 })
  }

  const supabase = createClient()

  // ── 2. 기존 저장 결과 재확인 (중복 실행 방지) ─────────────────
  const { data: gameRow } = await supabase
    .from('games')
    .select('ai_mvp, date, opponent, our_score, opponent_score, tournament:tournaments(name, year)')
    .eq('id', gameId)
    .single()

  if (!gameRow) return NextResponse.json({ error: '경기를 찾을 수 없습니다' }, { status: 404 })

  if (gameRow.ai_mvp) {
    return NextResponse.json(gameRow.ai_mvp as MvpResult)
  }

  // ── 3. 스탯 수집 ────────────────────────────────────────────
  const [eventsRes, minutesRes, playersRes] = await Promise.all([
    supabase.from('game_events').select('*').eq('game_id', gameId).order('created_at'),
    supabase.from('player_minutes').select('*').eq('game_id', gameId),
    supabase.from('players').select('*').eq('is_active', true).order('number'),
  ])

  if (eventsRes.error || minutesRes.error || playersRes.error) {
    return NextResponse.json({ error: '데이터 조회 실패' }, { status: 500 })
  }

  const allBoxScores = calculateBoxScore(eventsRes.data, minutesRes.data, playersRes.data)

  // 참여 선수만 (이벤트가 있는 선수)
  const activePlayerIds = new Set(
    (eventsRes.data ?? []).map((e: { player_id?: string }) => e.player_id).filter(Boolean)
  )
  const participants = allBoxScores.filter(
    s => activePlayerIds.has(s.player_id) || s.pts > 0 || s.reb > 0 || s.ast > 0 || s.stl > 0 || s.blk > 0
  )

  if (participants.length < 2) {
    return NextResponse.json({ error: '기록된 선수가 부족합니다 (최소 2명 필요)' }, { status: 400 })
  }

  // ── 4. MVP 선정 (서버사이드 계산) ───────────────────────────
  const mvpCandidates = participants.filter(s => {
    // 부적격 조건: pts<4 AND fg_pct<25 AND (ast+reb+stl+blk)<3 → 제외
    const isStruggling = s.pts < 4 && s.fg_pct < 25 && (s.ast + s.reb + s.stl + s.blk) < 3
    if (isStruggling) return false
    // 최소 활동 조건
    return s.fga >= 2 || (s.ast + s.reb) >= 4
  })

  // 후보 0명이면 전체에서 선정
  const mvpPool = mvpCandidates.length > 0 ? mvpCandidates : participants
  const mvpSorted = [...mvpPool].sort((a, b) => {
    const sa = calcMvpScore(a), sb = calcMvpScore(b)
    if (sb !== sa) return sb - sa
    if (b.efg_pct !== a.efg_pct) return b.efg_pct - a.efg_pct
    return b.ast - a.ast
  })
  const mvpPlayer = mvpSorted[0]

  // ── 5. X-FACTOR 선정 ────────────────────────────────────────
  const teamHighPts = Math.max(...participants.map(s => s.pts))
  const topScorerIds = new Set(participants.filter(s => s.pts === teamHighPts).map(s => s.player_id))

  const xfCandidates = participants.filter(s => {
    if (s.player_id === mvpPlayer.player_id) return false
    if (topScorerIds.has(s.player_id)) return false
    return (s.ast + s.reb + s.stl + s.blk) >= 2
  })

  const xfSorted = [...xfCandidates].sort((a, b) => {
    const sa = calcXfactorScore(a, teamHighPts)
    const sb = calcXfactorScore(b, teamHighPts)
    if (sb !== sa) return sb - sa
    return (b.stl + b.blk) - (a.stl + a.blk)
  })
  const xfPlayer = xfSorted[0] ?? null

  // ── 6. AI 코멘트 생성 (Haiku — 빠르고 저렴) ─────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gameInfo = gameRow as unknown as {
    date: string; opponent: string; our_score: number; opponent_score: number;
    tournament?: { name: string; year: number } | null
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tournament = gameInfo.tournament as any
  const tournamentStr = tournament ? `${tournament.name} ${tournament.year}년` : '대회'
  const resultStr = gameInfo.our_score > gameInfo.opponent_score ? '승' : gameInfo.our_score < gameInfo.opponent_score ? '패' : '무'

  const xfLine = xfPlayer
    ? `\nX-FACTOR 선정 선수: ${xfPlayer.player_name}\n스탯: ${statsLine(xfPlayer)}`
    : '\nX-FACTOR: 해당 없음 (조건 충족 선수 없음)'

  const prompt = `당신은 농구팀 "파란날개"의 공식 경기 기록 AI입니다. 아래 데이터는 이미 수학적 공식으로 수상자가 결정된 결과입니다. 당신의 역할은 각 수상자에 대한 **최대 3문장의 한국어 선정 코멘트**를 작성하는 것입니다.

경기: ${tournamentStr} vs ${gameInfo.opponent} (${gameInfo.date}) — 파란날개 ${gameInfo.our_score}:${gameInfo.opponent_score} ${resultStr}

전체 박스스코어:
${participants.map(s => statsLine(s)).join('\n')}

MVP 선정 선수: ${mvpPlayer.player_name}
스탯: ${statsLine(mvpPlayer)}
${xfLine}

[코멘트 작성 규칙]
- 각 수상자에 대해 최대 3문장
- 구체적인 숫자(득점, 어시스트, 리바운드 등) 반드시 포함
- MVP: 효율성과 팀 기여도 강조. 부진 선수 언급 금지
- X-FACTOR: 눈에 잘 안 띄지만 팀에 기여한 허슬 플레이 강조. "득점보다 팀플레이로 빛났다" 톤
- 친근하고 진지한 톤 (공식 수상 기록으로 영구 보관됨)
- 공식 계산 방식 언급 금지

[출력 형식 — JSON만 출력, 다른 텍스트 없음]
${xfPlayer ? `{
  "mvp_reason": "MVP 코멘트 (최대 3문장)",
  "xf_reason": "X-FACTOR 코멘트 (최대 3문장)"
}` : `{
  "mvp_reason": "MVP 코멘트 (최대 3문장)",
  "xf_reason": null
}`}`

  let mvpReason = `${mvpPlayer.pts}pts ${mvpPlayer.fgm}/${mvpPlayer.fga} FG로 이번 경기 MVP에 선정되었습니다.`
  let xfReason = xfPlayer
    ? `${xfPlayer.ast}ast ${xfPlayer.reb}reb ${xfPlayer.stl}stl 의 궂은 일로 팀에 기여했습니다.`
    : null

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(json)
    if (parsed.mvp_reason) mvpReason = parsed.mvp_reason
    if (parsed.xf_reason !== undefined) xfReason = parsed.xf_reason
  } catch (err) {
    console.warn('AI comment generation failed, using fallback:', err)
  }

  // ── 7. 결과 조립 ────────────────────────────────────────────
  const result: MvpResult = {
    mvp: {
      player_id: mvpPlayer.player_id,
      player_name: mvpPlayer.player_name,
      reason: mvpReason,
    },
    x_factor: xfPlayer
      ? {
          player_id: xfPlayer.player_id,
          player_name: xfPlayer.player_name,
          reason: xfReason ?? '',
        }
      : null,
  }

  // ── 8. DB 저장 (admin client — RLS 우회) ────────────────────
  try {
    const admin = createAdmin()
    await admin.from('games').update({ ai_mvp: result }).eq('id', gameId)
  } catch (err) {
    console.error('Failed to save ai_mvp to DB:', err)
  }

  return NextResponse.json(result)
}

// ── 재선정: 기존 결과 삭제 후 재분석 ────────────────────────────
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })

  const admin = createAdmin()
  await admin.from('games').update({ ai_mvp: null }).eq('id', gameId)
  return NextResponse.json({ ok: true })
}
