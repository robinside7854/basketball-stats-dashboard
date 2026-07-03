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

// 미라클모닝 농구단 공식 프로필 실사 프롬프트
// 목표: NBA 공식 팀 프로필 촬영 세션 스타일의 일관된 실사 초상화
// 참조: NBA 공식 팀 프로필 사진 (예: LeBron James 프로필)
const CHARACTER_PROMPT = `Generate a photorealistic official basketball team profile headshot of the person in the uploaded photo.

STYLE (NON-NEGOTIABLE):
- Ultra-photorealistic, professional studio portrait photography
- NOT cartoon, NOT anime, NOT illustration, NOT stylized art
- Studio-quality lighting like an official NBA team profile photo
- 4:5 vertical portrait aspect ratio
- Framing: from top of the head down to just below the collarbone (head-and-shoulders headshot only, no arms, no chest below collarbone)

UNIFORM (IDENTICAL FOR ALL PLAYERS):
- Wearing a "MIRACLE MORNING" basketball team jersey (sleeveless basketball tank top)
- Jersey color: navy blue with white accents
- Jersey neckline and shoulders barely visible at bottom edge of frame (small portion only)
- No individual jersey number visible
- Every generated player should look like they wore the SAME uniform on the SAME day

BACKGROUND (IDENTICAL FOR ALL PLAYERS):
- Solid deep purple studio backdrop (#5B21B6 range)
- Subtle basketball team logo watermark faintly visible in background (blurred/soft)
- Soft even studio lighting from upper front, gentle rim light
- No gradient variations, no scenery, no basketball court

FACE PRESERVATION (CRITICAL - MUST MATCH ORIGINAL 90%+):
- Preserve the person's actual face from the uploaded reference photo with 90%+ fidelity:
  - Eye shape, color, spacing, and eyelids
  - Nose shape, width, and length
  - Mouth shape, lip fullness, and natural expression
  - Jawline, chin, and cheekbone structure
  - Overall face shape (oval / round / square / heart)
  - Skin tone and complexion
  - Hairstyle, hair color, hairline, and part
  - Facial hair (beard, mustache) if present in reference
  - Age and general facial character
- Only apply: natural studio lighting, even skin retouching, minor blemish smoothing
- Do NOT change identity, do NOT idealize, do NOT beautify to unrecognizable
- The person must be immediately recognizable as the same individual

POSE & EXPRESSION:
- Head centered in frame, slight tilt no more than 5 degrees
- Direct eye contact with camera
- Neutral confident expression, slight closed-mouth smile
- Shoulders squared to camera

CONSISTENCY DIRECTIVE:
- Imagine this is one of 40+ team members photographed in the same 30-minute studio session
- Lighting, backdrop, framing, and uniform must be pixel-identical to other team member portraits
- No creative variations. This is a team roster deliverable, not an art piece.
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
      // 4:5 세로 비율 (NBA 프로필 스타일)
      config: {
        imageConfig: { aspectRatio: '4:5' },
      },
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
