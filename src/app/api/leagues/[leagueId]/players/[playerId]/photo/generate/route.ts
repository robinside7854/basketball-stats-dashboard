// POST /api/leagues/[leagueId]/players/[playerId]/photo/generate
//
// 업로드된 원본 사진을 Google Gemini 2.5 Flash Image 로 캐릭터 스타일로 변환.
// 결과를 Supabase Storage 에 저장하고 photo_url 을 갱신.
//
// 사용 흐름:
//   1) 클라이언트가 원본 사진 업로드 (기존 /photo 엔드포인트)
//   2) 클라이언트가 이 엔드포인트 호출 → 캐릭터 이미지로 대체
//
// 요구 환경:
//   GEMINI_API_KEY — Google AI Studio 에서 발급 (aistudio.google.com/apikey)
//
// 비용: 이미지 1장당 ~$0.039 (Gemini 2.5 Flash Image preview)

import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { createClient } from '@/lib/supabase/admin'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

const CHARACTER_PROMPT = `이 사진의 인물을 스포츠 만화 스타일 캐릭터로 변환해주세요.
요구사항:
- 얼굴 특징(눈매·얼굴형·헤어스타일)을 최대한 보존
- 농구 유니폼을 입은 상반신 포트레이트
- 밝고 역동적인 컬러 팔레트, 반짝이는 하이라이트
- NBA 2K 캐릭터 아트 또는 슬램덩크 애니메이션 스타일
- 배경은 스타디움 조명이 있는 그러데이션
- 3:4 세로 비율 증명사진 구도
- 만화 셀 셰이딩 (cel-shading), 굵은 아웃라인
- 사실적 사진이 아닌 일러스트/카툰
`

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string; playerId: string }> }
) {
  const { leagueId, playerId } = await params
  if (!await verifyLeaguePin(req, leagueId)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      error: 'GEMINI_API_KEY 가 환경변수에 설정되어 있지 않습니다. .env.local 및 Vercel Project Settings 에 추가하세요.',
    }, { status: 500 })
  }

  const supabase = createClient()

  // 1) 현재 photo_url 조회 — 원본 이미지 다운로드용
  const { data: player, error: pErr } = await supabase
    .from('league_players')
    .select('photo_url, name')
    .eq('id', playerId)
    .eq('league_id', leagueId)
    .single()

  if (pErr || !player) {
    return NextResponse.json({ error: '선수를 찾을 수 없습니다' }, { status: 404 })
  }

  if (!player.photo_url) {
    return NextResponse.json({
      error: '원본 사진이 없습니다. 먼저 사진을 업로드해주세요.',
    }, { status: 400 })
  }

  // 2) 원본 이미지 다운로드 → base64
  let sourceBase64: string
  let sourceMime: string
  try {
    // 캐시버스터 쿼리 제거 · signed URL 형태 그대로 유지
    const sourceUrl = player.photo_url
    const imgRes = await fetch(sourceUrl)
    if (!imgRes.ok) throw new Error(`이미지 다운로드 실패 (${imgRes.status})`)
    sourceMime = imgRes.headers.get('content-type') ?? 'image/jpeg'
    const buf = Buffer.from(await imgRes.arrayBuffer())
    sourceBase64 = buf.toString('base64')
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `원본 이미지 로드 실패: ${msg}` }, { status: 500 })
  }

  // 3) Gemini 2.5 Flash Image 호출 (Nano Banana)
  let generatedBase64: string | null = null
  let generatedMime = 'image/png'
  try {
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{
        role: 'user',
        parts: [
          { text: CHARACTER_PROMPT },
          { inlineData: { mimeType: sourceMime, data: sourceBase64 } },
        ],
      }],
    })

    // 응답에서 이미지 파트 추출
    const candidates = response.candidates ?? []
    for (const cand of candidates) {
      const parts = cand.content?.parts ?? []
      for (const part of parts) {
        if (part.inlineData?.data) {
          generatedBase64 = part.inlineData.data
          generatedMime = part.inlineData.mimeType ?? 'image/png'
          break
        }
      }
      if (generatedBase64) break
    }

    if (!generatedBase64) {
      // 텍스트 응답이 온 경우 (거절/에러) — 파악 위해 로그
      const textParts = candidates.flatMap(c => c.content?.parts ?? []).filter(p => p.text).map(p => p.text)
      return NextResponse.json({
        error: `Gemini 가 이미지를 생성하지 못했습니다.${textParts.length ? ' 응답: ' + textParts.join(' | ') : ''}`,
      }, { status: 502 })
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `Gemini API 호출 실패: ${msg}` }, { status: 502 })
  }

  // 4) 생성된 이미지 Storage 에 저장 · photo_url 갱신
  try {
    const ext = generatedMime.includes('png') ? 'png' : 'jpg'
    const path = `league_${leagueId}_${playerId}_ai.${ext}`
    const bin = Buffer.from(generatedBase64, 'base64')

    const { error: uploadErr } = await supabase.storage
      .from('player-photos')
      .upload(path, bin, { contentType: generatedMime, upsert: true })
    if (uploadErr) throw uploadErr

    const { data: { publicUrl } } = supabase.storage.from('player-photos').getPublicUrl(path)
    const urlWithBust = `${publicUrl}?t=${Date.now()}`

    const { error: updateErr } = await supabase
      .from('league_players')
      .update({ photo_url: urlWithBust })
      .eq('id', playerId)
      .eq('league_id', leagueId)
    if (updateErr) throw updateErr

    return NextResponse.json({ url: urlWithBust, cost_estimate_usd: 0.039 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: `이미지 저장 실패: ${msg}` }, { status: 500 })
  }
}
