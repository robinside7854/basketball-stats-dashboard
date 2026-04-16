import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/client'
import { calculateBoxScore } from '@/lib/stats/calculator'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  if (!gameId) return NextResponse.json({ error: 'gameId required' }, { status: 400 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다' }, { status: 503 })
  }

  const supabase = createClient()

  const [eventsRes, minutesRes, playersRes, gameRes] = await Promise.all([
    supabase.from('game_events').select('*').eq('game_id', gameId).order('created_at'),
    supabase.from('player_minutes').select('*').eq('game_id', gameId),
    supabase.from('players').select('*').eq('is_active', true).order('number'),
    supabase.from('games').select('*, tournament:tournaments(name, year)').eq('id', gameId).single(),
  ])

  if (eventsRes.error || minutesRes.error || playersRes.error || gameRes.error) {
    return NextResponse.json({ error: '데이터 조회 실패' }, { status: 500 })
  }

  const boxScores = calculateBoxScore(eventsRes.data, minutesRes.data, playersRes.data)
  const game = gameRes.data

  // Only players who actually participated (have at least 1 recorded event)
  const activePlayerIds = new Set(
    (eventsRes.data ?? []).map((e: { player_id?: string }) => e.player_id).filter(Boolean)
  )
  const activePlayers = boxScores.filter(s => activePlayerIds.has(s.player_id) || s.pts > 0 || s.reb > 0 || s.ast > 0)

  if (activePlayers.length < 2) {
    return NextResponse.json({ error: '기록된 선수가 부족합니다 (최소 2명 필요)' }, { status: 400 })
  }

  // Build stats text for the prompt
  const statsLines = activePlayers.map(s => {
    const shotDisplay = s.fga > 0 ? `${s.fgm}/${s.fga} FG(${s.fg_pct.toFixed(0)}%)` : '0/0 FG'
    const threeDisplay = s.fg3a > 0 ? ` ${s.fg3m}/${s.fg3a} 3P` : ''
    const ftDisplay = s.fta > 0 ? ` ${s.ftm}/${s.fta} FT` : ''
    return (
      `#${s.player_number} ${s.player_name}: ` +
      `${s.pts}pts ${shotDisplay}${threeDisplay}${ftDisplay} | ` +
      `${s.reb}reb(OR${s.oreb}/DR${s.dreb}) ${s.ast}ast ${s.stl}stl ${s.blk}blk ${s.tov}tov ${s.pf}pf`
    )
  }).join('\n')

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tournamentInfo = (game.tournament as any)
    ? `${(game.tournament as any).name} ${(game.tournament as any).year}년`
    : '대회 미상'

  const prompt = `농구 경기 박스스코어를 분석해서 아래 두 가지를 선정해주세요.

경기 정보: ${tournamentInfo} vs ${game.opponent} (${game.date}) — 파란날개 ${game.our_score} : ${game.opponent_score} ${game.our_score > game.opponent_score ? '승' : '패'}

=== 선수별 박스스코어 ===
${statsLines}

---

[선정 규칙]
1. MVP
   - 이 경기에서 가장 임팩트 있는 활약을 한 선수 1명
   - 팀 사기를 위해 부진한 선수(득점 부족, FG% 낮음, 턴오버 과다 등)는 반드시 제외
   - 승패와 관계없이 객관적 스탯 기반으로 선정

2. 숨은 조력자
   - MVP와 반드시 다른 선수여야 함
   - 화려한 스탯보다 궂은 일(리바운드, 스틸, 어시스트, 블락 등)을 성실히 수행했거나
     특정 시간대에 단기 집중 임팩트를 낸 선수 1명
   - 점수 2~3위 선수보다는 다른 방면에서 기여한 선수를 선호

[응답 형식 — 반드시 JSON만 출력, 다른 텍스트 없음]
{
  "mvp": {
    "player_name": "이름",
    "reason": "선정 이유 (2~3문장, 한국어)"
  },
  "hidden_hero": {
    "player_name": "이름",
    "reason": "선정 이유 (2~3문장, 한국어)"
  }
}`

  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''

    // Strip markdown code fences if present
    const jsonText = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const result = JSON.parse(jsonText)

    if (!result.mvp?.player_name || !result.hidden_hero?.player_name) {
      throw new Error('Unexpected response shape')
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('AI MVP error:', err)
    return NextResponse.json({ error: 'AI 분석에 실패했습니다' }, { status: 500 })
  }
}
