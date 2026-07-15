// POTW AI 헤드라인 생성 API
// 매 라운드 POTW 의 우세 카테고리에 맞춰 임팩트 있는 뉴스 매거진 톤 헤드라인 1문장 생성.
// Claude Sonnet 호출 실패 시 규칙 기반 fallback (기존 makeHeadline 과 동일 로직).

import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type TopCategory = 'volume' | 'efficiency' | 'reb' | 'stl' | 'blk' | 'ast' | 'clutch'

type Breakdown = {
  pts: number
  ts_pct: number
  reb: number
  stl: number
  blk: number
  ast: number
  clutchPts: number
  clutchGp: number
  topCategory: TopCategory
  compositeScore: number
}

// ── Fallback (Claude 실패 시) ─────────────────────────────────────
// makeHeadline 과 동일 로직 · 라운드 페이지에서 넘어온 초기 헤드라인과 톤 맞춤
function fallbackHeadline(name: string, b: Breakdown): string {
  switch (b.topCategory) {
    case 'volume':
      return `${name}, ${b.pts}점 폭발로 라운드 지배`
    case 'efficiency':
      return `${name}, TS ${b.ts_pct.toFixed(0)}% 초효율 · ${b.pts}점 정조준`
    case 'reb':
      return `${name}, 리바운드 ${b.reb}개로 페인트존 장악`
    case 'stl':
      return `${name}, 스틸 ${b.stl}개 · 상대 공격 완전 잠금`
    case 'blk':
      return `${name}, 블락 ${b.blk}개로 림 프로텍터 등극`
    case 'ast':
      return `${name}, 어시스트 ${b.ast}개 · 팀 공격 리드`
    case 'clutch':
      return `${name}, 결정타 ${b.clutchPts}점 · 마지막 2분 접전을 뒤집었다`
    default:
      return `${name}, 이번 라운드 최고 임팩트`
  }
}

// ── 우세 지표 요약 (프롬프트 삽입용) ──────────────────────────────
function dominantMetricLine(b: Breakdown): string {
  switch (b.topCategory) {
    case 'volume':     return `우세 지표: 득점 폭발 (${b.pts}점)`
    case 'efficiency': return `우세 지표: 슈팅 효율 (TS ${b.ts_pct.toFixed(1)}%, ${b.pts}점)`
    case 'reb':        return `우세 지표: 리바운드 (${b.reb}개, ${b.pts}점)`
    case 'stl':        return `우세 지표: 스틸 (${b.stl}개, 수비 임팩트)`
    case 'blk':        return `우세 지표: 블락 (${b.blk}개, 림 프로텍션)`
    case 'ast':        return `우세 지표: 어시스트 (${b.ast}개, 플레이메이킹)`
    case 'clutch':     return `우세 지표: 결정타 슛 득점 (${b.clutchGp}경기 중 ${b.clutchPts}점 · 마지막 2분 · 2포제션 접전에서 1포제션으로 좁힘)`
    default:           return `우세 지표: 종합 임팩트`
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const date: string = body.date ?? ''
    const playerName: string = body.playerName ?? ''
    const teamName: string | undefined = body.teamName || undefined
    const breakdown: Breakdown | undefined = body.breakdown

    if (!playerName || !breakdown) {
      return NextResponse.json({ error: 'playerName, breakdown required' }, { status: 400 })
    }

    // API 키 없으면 fallback 반환 (503 대신 200 fallback — 클라이언트가 매끄럽게 표시)
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ headline: fallbackHeadline(playerName, breakdown) })
    }

    const systemPrompt =
      '당신은 미라클모닝 농구 리그의 매거진 헤드라인 작성자입니다. ' +
      '임팩트 있는 뉴스 기사 헤드라인 톤으로 20자 이내 짧고 강렬한 한국어 헤드라인을 작성합니다. ' +
      '우세 지표의 수치를 자연스럽게 문장에 담고, 진부한 관용구 대신 생동감 있는 표현을 사용하세요. ' +
      '반드시 헤드라인 한 줄만 출력하고 앞뒤 인용부호·이모지·설명·라벨을 넣지 마세요.'

    const userPrompt = [
      `라운드 날짜: ${date}`,
      `POTW 선수: ${playerName}${teamName ? ` (${teamName})` : ''}`,
      dominantMetricLine(breakdown),
      '',
      '이번 라운드 종합 스탯:',
      `- 득점: ${breakdown.pts}`,
      `- TS%: ${breakdown.ts_pct > 0 ? breakdown.ts_pct.toFixed(1) : '—'}`,
      `- 리바운드: ${breakdown.reb}`,
      `- 어시스트: ${breakdown.ast}`,
      `- 스틸: ${breakdown.stl}`,
      `- 블락: ${breakdown.blk}`,
      `- 클러치 득점: ${breakdown.clutchPts} (${breakdown.clutchGp}경기 경험)`,
      `- 종합 점수: ${breakdown.compositeScore}`,
      '',
      '위 데이터를 바탕으로 이 선수의 라운드 임팩트를 요약하는 헤드라인 하나만 생성하세요. 20자 이내, 짧고 강렬하게. 우세 지표를 자연스럽게 담아주세요.',
    ].join('\n')

    try {
      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 100,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      })
      const rawText = message.content[0]?.type === 'text' ? message.content[0].text : ''
      // 인용부호 · 코드 fence · 라벨 벗기기
      let headline = rawText
        .trim()
        .replace(/^```(?:json|text)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .replace(/^["'「『]/, '')
        .replace(/["'」』]$/, '')
        .replace(/^헤드라인\s*[:：]\s*/i, '')
        .split('\n')[0]
        .trim()

      if (!headline || headline.length === 0) {
        headline = fallbackHeadline(playerName, breakdown)
      }
      return NextResponse.json({ headline })
    } catch (err) {
      console.warn('POTW headline AI failed, using fallback:', err)
      return NextResponse.json({ headline: fallbackHeadline(playerName, breakdown) })
    }
  } catch (err) {
    console.error('POTW headline route error:', err)
    return NextResponse.json({ error: 'internal error' }, { status: 500 })
  }
}
