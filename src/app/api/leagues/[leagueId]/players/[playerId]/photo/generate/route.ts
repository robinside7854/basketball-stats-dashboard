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
// 팀 컬러: 메인 옐로우/골드 + 블랙 트림 (참조 이미지 기준)
const CHARACTER_PROMPT = `Generate a photorealistic official basketball team profile headshot of the person in the uploaded photo.

STYLE (NON-NEGOTIABLE):
- Ultra-photorealistic, professional studio portrait photography
- NOT cartoon, NOT anime, NOT illustration, NOT stylized art
- Studio-quality lighting like an official NBA team profile photo
- 4:5 vertical portrait aspect ratio
- Framing: from top of the head down to just below the collarbone (head-and-shoulders headshot only, no arms, no chest below collarbone)

UNIFORM (IDENTICAL FOR ALL PLAYERS — MIRACLE MORNING BASKETBALL TEAM):
- Sleeveless basketball tank top jersey in VIBRANT MUSTARD YELLOW / GOLD as main color
- Black V-neck trim (thick black band forming a V-neck around the collar opening)
- Black armhole/shoulder trim (thick black side panels visible where jersey meets shoulder)
- Real fabric texture with subtle mesh weave (NOT flat colored, actual basketball jersey material)
- Jersey should look like authentic NBA-caliber team apparel
- Framing shows only the V-neck yellow collar area and top of shoulders (from collarbone down to just below)
- No jersey number visible (framing is too high to show numbers on chest)
- No text visible (framing above chest text placement)
- Every generated player should look like they wore the SAME uniform on the SAME day

BACKGROUND (IDENTICAL FOR ALL PLAYERS):
- Solid deep purple studio backdrop (#5B21B6 range)
- Subtle basketball team logo watermark faintly visible in background (blurred/soft)
- Soft even studio lighting from upper front, gentle rim light
- No gradient variations, no scenery, no basketball court

FACE PRESERVATION (ABSOLUTE HIGHEST PRIORITY — MATCH ORIGINAL 95%+):
- This is the SINGLE MOST IMPORTANT requirement — everything else is secondary
- Treat the uploaded photo as ground truth for the person's face
- Preserve the person's actual face from the uploaded reference photo with 95%+ pixel-level fidelity:
  - Eye shape, color, spacing, eyelids, and eye size — EXACT MATCH
  - Nose shape, width, length, nostrils, and bridge — EXACT MATCH
  - Mouth shape, lip fullness, philtrum, and natural resting expression — EXACT MATCH
  - Jawline, chin, and cheekbone structure — EXACT MATCH
  - Overall face shape (oval / round / square / heart / diamond) — EXACT MATCH
  - Skin tone, complexion, and any distinctive markings (moles, freckles, scars) — PRESERVE
  - Hairstyle, hair color, hair density, hairline, and part direction — EXACT MATCH
  - Facial hair (beard, mustache, sideburns) shape and density if present in reference — EXACT MATCH
  - Age and general facial character (youthful / mature / weathered) — PRESERVE
  - Ear shape and position — PRESERVE
  - Eyebrow shape, thickness, and arch — EXACT MATCH
- ONLY these adjustments are allowed:
  - Even studio lighting on the face
  - Minor skin evenness (no heavy retouching that changes texture)
  - Slight expression normalization to neutral confident (but same person's expression signature)
- FORBIDDEN:
  - Do NOT change identity in any way
  - Do NOT idealize or "improve" facial features
  - Do NOT apply beauty filters
  - Do NOT smooth skin so much it looks plastic
  - Do NOT make the person look younger or older than they are
  - Do NOT alter ethnic features
- The person must be immediately recognizable as the SAME individual by their close friends and family
- If in doubt between adding a stylistic touch and preserving the original, ALWAYS choose preservation

POSE & EXPRESSION:
- Head centered in frame, slight tilt no more than 5 degrees
- Direct eye contact with camera
- Neutral confident expression, slight closed-mouth smile
- Shoulders squared to camera

CONSISTENCY DIRECTIVE:
- Imagine this is one of 40+ team members photographed in the same 30-minute studio session
- Lighting, backdrop, framing, and yellow-and-black uniform must be pixel-identical to other team member portraits
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

  // 1) 원본/현재 사진 URL 조회
  //    original_photo_url 우선 (사용자가 업로드한 실제 원본)
  //    없으면 photo_url 폴백 (기존 데이터 호환)
  const { data: player, error: pErr } = await supabase
    .from('league_players')
    .select('photo_url, original_photo_url, name')
    .eq('id', playerId)
    .eq('league_id', leagueId)
    .single()

  if (pErr || !player) {
    return NextResponse.json({ error: '선수를 찾을 수 없습니다' }, { status: 404 })
  }

  const sourceForAI = player.original_photo_url ?? player.photo_url
  if (!sourceForAI) {
    return NextResponse.json({
      error: '원본 사진이 없습니다. 먼저 사진을 업로드해주세요.',
    }, { status: 400 })
  }

  // 2) 원본 이미지 다운로드 → base64
  //    재생성 시에도 항상 이 original 을 입력으로 사용해 이전 생성 결과의
  //    누적 왜곡 방지.
  let sourceBase64: string
  let sourceMime: string
  try {
    const sourceUrl = sourceForAI
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
