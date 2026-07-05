// POST /api/leagues/[leagueId]/columns/generate
//
// 매거진 컬럼 자동 생성 — Claude API 로 서사 생성 후 DB 에 draft 저장.
//
// 요청 body:
//   { period_type: 'weekly' | 'monthly' | 'quarterly', period_start?: string, period_end?: string }
//   period_start / period_end 미지정 시 자동 계산:
//     weekly    → 최근 7일
//     monthly   → 이번 달 1일부터 오늘
//     quarterly → 현재 분기 시작부터 오늘

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/admin'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'
import { aggregatePeriodData } from '@/lib/stats/periodAggregator'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// 톤: NBA.com 정통 스포츠 기사체 + 팬 매거진 캐주얼 톤 혼합
const SYSTEM_PROMPT = `당신은 아마추어 농구 리그 '미라클모닝농구단' 의 주간 매거진 편집장입니다.

톤 (사용자 지정):
- NBA.com 정통 스포츠 기사체 (숫자 · 팩트 기반 · 프로페셔널)
- 팬 매거진 (슬램덩크 잡지) 캐주얼 · 위트 · 응원심 담긴 톤
- 두 톤을 자연스럽게 혼합해 팬이 몰입할 수 있는 리포트 작성

작성 규칙:
1. 반드시 한국어로 작성
2. 마크다운 형식 (## 헤더, - 리스트, **볼드**, > 인용)
3. 선수 이름은 반드시 {{p:이름}} 형식 (예: {{p:김로빈}})
4. 팀 이름은 {{t:팀명}} 형식 (예: {{t:락다운}}, {{t:굿모닝}})
5. 게임 날짜 참조는 {{g:YYYY-MM-DD}} 형식
6. 마커는 반드시 원본 데이터의 이름·날짜와 정확히 일치
7. 데이터에 없는 선수/팀은 절대 언급하지 말 것 (환각 금지)
8. 아래 7개 섹션 순서로 작성 (일부 데이터 없으면 그 섹션은 짧게)

섹션 구조:
## 📸 커버 스토리
이 주 가장 큰 서사 (2-3문단). 헤드라인 스타일. 하이라이트 선수/팀 부각.

## 🏆 이 주의 하이라이트
압도적 경기력. 30점 이상, 15리바 이상, 트리플더블 등. 3-4개 언급.

## 🎯 마일스톤 워치
시즌 누적 500점 돌파 · 100어시스트 최초 등. 없으면 "이번 주는 조용" 짧게.

## 🔍 재미있는 기록들
- 최고의 어시스트 듀오 (A→B 몇 번)
- 이 주 궂은 일 왕 (리바+스틸+블락 최다)
- 기타 흥미로운 데이터 조각

## 📊 팀 리포트
프랜차이즈 별 이 주 W/L, 순위 변동, 뜨거운 팀/식은 팀.

## 💡 숫자로 보는 이 주
3-5개 흥미로운 스탯 콜아웃. 각각 한 문장.

## 🔮 다음 주 전망
간단히 마무리. 팬 응원 문구.

응답 형식 (반드시 JSON):
{
  "title": "이번 주 매거진 헤드라인 (한 줄)",
  "subtitle": "부제 (한 줄)",
  "cover_player_name": "표지 주인공 선수 이름 (원본 데이터에 있는 이름)",
  "body_md": "본문 (마크다운, 위 7섹션 포함)"
}
`

interface ReqBody {
  period_type: 'weekly' | 'monthly' | 'quarterly'
  period_start?: string
  period_end?: string
}

function autoPeriodDates(type: ReqBody['period_type']): { start: string; end: string } {
  const now = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  if (type === 'weekly') {
    const from = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
    return { start: iso(from), end: iso(now) }
  }
  if (type === 'monthly') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1)
    return { start: iso(from), end: iso(now) }
  }
  // quarterly: 현재 분기 시작
  const m = now.getMonth()
  const qStartMonth = Math.floor(m / 3) * 3
  const from = new Date(now.getFullYear(), qStartMonth, 1)
  return { start: iso(from), end: iso(now) }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  if (!await verifyLeaguePin(req, leagueId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY 미설정' }, { status: 500 })

  const body = await req.json() as ReqBody
  const period_type = body.period_type ?? 'weekly'
  const auto = autoPeriodDates(period_type)
  const period_start = body.period_start ?? auto.start
  const period_end = body.period_end ?? auto.end

  const supabase = createClient()

  // 리그 이름
  const { data: league } = await supabase
    .from('leagues')
    .select('name')
    .eq('id', leagueId)
    .single()
  const leagueName = league?.name ?? '미라클모닝농구단'

  // 데이터 집계
  const periodData = await aggregatePeriodData(supabase, leagueId, period_type, period_start, period_end, leagueName)

  if (periodData.games.length === 0) {
    return NextResponse.json({ error: '해당 기간에 진행된 경기가 없습니다' }, { status: 400 })
  }

  // Claude API 호출 — 프롬프트에 원본 데이터 요약본만 전달 (토큰 절약)
  const dataDigest = {
    period_type: periodData.period_type,
    period_start: periodData.period_start,
    period_end: periodData.period_end,
    league_name: periodData.league_name,
    games_count: periodData.games.length,
    games_completed: periodData.games.filter(g => g.is_complete).length,
    games_summary: periodData.games.slice(0, 20).map(g => ({
      date: g.date,
      home: g.home?.name, away: g.away?.name,
      score: g.is_complete ? `${g.home?.score}:${g.away?.score}` : '진행 중',
    })),
    standings: periodData.standings,
    top_players: periodData.playerStats.slice(0, 15),
    hero_performances: periodData.heroPerformances,
    assist_duos: periodData.topAssistDuos,
    dirty_work: periodData.dirtyWorkPlayers,
    milestones: periodData.milestones,
  }

  const userPrompt = `다음 데이터를 바탕으로 매거진 컬럼을 작성해주세요:

\`\`\`json
${JSON.stringify(dataDigest, null, 2)}
\`\`\`

기간: ${period_start} ~ ${period_end} (${period_type})`

  let generated: { title: string; subtitle: string; cover_player_name: string; body_md: string }
  try {
    const resp = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const text = resp.content[0].type === 'text' ? resp.content[0].text : ''
    // JSON 파싱 (Claude 가 ```json ``` 감쌌을 수도 있음)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Claude 응답에서 JSON 을 찾을 수 없음')
    generated = JSON.parse(jsonMatch[0])
    if (!generated.body_md || !generated.title) throw new Error('필수 필드 누락')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Claude 생성 실패: ${msg}` }, { status: 502 })
  }

  // 표지 주인공 선수 매칭 (이름으로 id 조회)
  const cover_player_id = periodData.playerStats.find(p => p.name === generated.cover_player_name)?.player_id ?? null

  // draft 저장
  const { data: inserted, error: insertErr } = await supabase
    .from('league_columns')
    .insert({
      league_id: leagueId,
      period_type,
      period_start,
      period_end,
      title: generated.title,
      subtitle: generated.subtitle,
      cover_type: 'both',
      cover_player_id,
      body_md: generated.body_md,
      meta: {
        cover_player_name: generated.cover_player_name,
        stats_snapshot: dataDigest,  // 재렌더 대비
      },
      status: 'draft',
    })
    .select()
    .single()

  if (insertErr) return NextResponse.json({ error: `저장 실패: ${insertErr.message}` }, { status: 500 })
  return NextResponse.json({ column: inserted })
}
