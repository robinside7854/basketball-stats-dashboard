import { ImageResponse } from 'next/og'
import { createClient } from '@/lib/supabase/admin'
import { isLeaguePublic } from '@/lib/auth/guard'
import { glyphSet, loadKoreanFont } from '@/lib/og/font'
import RootOnballCard from '@/app/opengraph-image'

// 리그 링크 공유 카드 — "온볼 × {팀이름}" (2026-08-10)
//
// ⚠ 프라이버시 규칙 (가장 중요):
//   루트 카드(app/opengraph-image.tsx)의 원칙은 "OG 카드에 클럽 개별화 요소를 넣지 않는다" 였다.
//   사용자 판단으로 리그 링크에 한해 팀 이름을 넣되, **공개 리그일 때만** 넣는다.
//   - teams.is_public = true  → 팀 이름이 들어간 카드
//   - 비공개 / 리그를 못 찾음 / 조회 오류 / 팀 이름 없음 → 루트 온볼 공용 카드로 폴백
//   판정이 애매하면 항상 닫는 쪽(폴백). isLeaguePublic 은 조회 실패 시 throw 하므로 try/catch 로
//   감싸 false 로 떨어뜨린다.
//
// 폴백은 루트 카드 컴포넌트를 그대로 호출한다 — 레이아웃을 복제하면 한쪽만 고쳐져 갈라진다.
//
// 경로 주의: params.leagueId 는 URL 에 보이는 slug 가 아니라 **UUID** 다.
//   미들웨어(src/middleware.ts)가 /league/:org/:slug/* → /league/:org/:uuid/* 로 internal
//   rewrite 하므로 이 파일에는 UUID 가 들어온다. 그래서 leagues.id 로 바로 조회하면 된다.
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
// alt 는 정적이어야 한다 — 여기에 팀 이름을 넣으면 비공개 리그에서도 og:image:alt 로 새어나간다.
export const alt = '온볼 — 공이 온 순간은, 사라지지 않는다'

// 크롤러는 짧은 타임아웃 안에 이미지를 받아가야 한다. 매 요청마다 DB+폰트를 다시 타지 않도록
// 캐시하되, 이 캐시 창이 곧 "공개 → 비공개로 바꿨는데 아직 팀 이름이 새는" 시간이다.
// 위 프라이버시 규칙을 캐시가 무르게 만들면 안 되므로 1분으로 짧게 잡는다.
// (0 으로 두면 크롤 때마다 DB+폰트를 새로 타서 카드가 늦게 뜰 위험이 있다)
export const revalidate = 60

// satori 는 앱 스타일시트를 못 읽고 인라인 style 만 본다 → globals.css .dark 의 웜톤 값을 하드코딩.
const COLOR = {
  ground: '#191714',
  ink: '#F2EEE6',
  muted: '#A9A294',
  yellow: '#EAB308',
}

const BRAND = 'ONBALL'
const PREFIX = '온볼 ×'
const TAGLINE = '공이 온 순간은, 사라지지 않는다'

// ── 헤드라인 줄바꿈/크기 계산 ────────────────────────────────────────────────
// satori 로는 렌더 전에 실제 글자 폭을 잴 수 없다. 팀 이름은 가변(한글 10자 넘는 경우가 흔함)
// 이므로 문자 종류별 em 폭 근사로 넘침을 막는다. 근사값은 실제보다 넉넉하게 잡아 안전한 쪽으로.
const CONTENT_W = 1024 // 카드 1200 - 좌우 패딩 88*2
const INLINE_GAP = 22  // 한 줄 배치에서 '×' 좌우 여백(px) — 폭 계산과 style 이 같은 값을 써야 한다

// 한글/한자/가나/전각 = 1.0 · 라틴 대문자 = 0.75 · 숫자 = 0.62 · 그 외 = 0.58 · 공백 = 0.3
// ⚠ 대문자를 소문자와 같이 0.58 로 잡았다가 'WOWMOMMAX MORNING' 같은 이름에서 "한 줄에 들어간다"
//   판정이 나고 실제로는 넘쳐서 '온볼' 이 세로로 쪼개졌다(실측 확인) — 대문자는 따로 계산할 것.
const WIDE_RE = /[\u1100-\u11FF\u3040-\u30FF\u3130-\u318F\u4E00-\u9FFF\uAC00-\uD7A3\uFF00-\uFF60]/
function widthEm(s: string): number {
  let w = 0
  for (const ch of s) {
    if (ch === ' ') w += 0.3
    else if (WIDE_RE.test(ch)) w += 1
    else if (ch >= 'A' && ch <= 'Z') w += 0.75
    else if (ch >= '0' && ch <= '9') w += 0.62
    else w += 0.58
  }
  return w
}

// 한 줄 최대 폭(em) 기준으로 줄을 나눈다. 공백이 있으면 단어 단위, 없으면 글자 단위
// (한글 팀명은 공백 없이 긴 경우가 대부분). maxLines 를 넘으면 마지막 줄을 말줄임.
function wrapText(text: string, maxEm: number, maxLines: number): string[] {
  const lines: string[] = []
  let cur = ''
  const flushByChar = (chunk: string) => {
    let piece = ''
    for (const ch of chunk) {
      if (piece && widthEm(piece + ch) > maxEm) { lines.push(piece); piece = ch }
      else piece += ch
    }
    if (piece) cur = piece
  }
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = cur ? `${cur} ${word}` : word
    if (widthEm(candidate) <= maxEm) { cur = candidate; continue }
    if (cur) { lines.push(cur); cur = '' }
    if (widthEm(word) <= maxEm) cur = word
    else flushByChar(word)
  }
  if (cur) lines.push(cur)
  if (lines.length === 0) return [text]
  if (lines.length <= maxLines) return lines

  const kept = lines.slice(0, maxLines)
  let last = kept[maxLines - 1]
  while (last.length > 1 && widthEm(last + '…') > maxEm) last = last.slice(0, -1)
  kept[maxLines - 1] = last + '…'
  return kept
}

type Headline = { inline: boolean; size: number; lines: string[] }

// 짧은 이름은 "온볼 × 팀이름" 한 줄(가장 보기 좋음), 길어지면 접두어를 윗줄로 올리고
// 팀 이름을 축소 → 그래도 길면 두 줄로 접는다.
function layoutHeadline(teamName: string): Headline {
  const INLINE_SIZE = 76
  const BUDGET = CONTENT_W * 0.96 // 근사 오차 여유 — 넘치는 것보다 한 단계 줄이는 쪽이 안전
  // 한 줄 배치는 '온볼' + '×' + 이름 세 덩어리 + × 좌우 여백(22px*2)로 이뤄진다.
  // 여백을 빼먹으면 실제 폭을 44px 과소평가한다.
  const inlineW = (widthEm('온볼') + widthEm('×') + widthEm(teamName)) * INLINE_SIZE + INLINE_GAP * 2
  if (inlineW <= BUDGET) return { inline: true, size: INLINE_SIZE, lines: [teamName] }

  const oneLineSize = Math.floor(BUDGET / widthEm(teamName))
  if (oneLineSize >= 52) return { inline: false, size: Math.min(72, oneLineSize), lines: [teamName] }

  const lines = wrapText(teamName, BUDGET / 52, 2)
  const widest = Math.max(...lines.map(widthEm))
  const size = Math.max(40, Math.min(60, Math.floor(BUDGET / widest)))
  return { inline: false, size, lines }
}

// 공개 리그일 때만 팀 이름을 돌려준다. 그 외에는 전부 null → 루트 카드 폴백.
async function loadPublicTeamName(leagueId: string): Promise<string | null> {
  try {
    if (!(await isLeaguePublic(leagueId))) return null
    const sb = createClient() // service role — anon 키로 조회하지 않는다
    const { data, error } = await sb
      .from('leagues')
      .select('teams(name)')
      .eq('id', leagueId)
      .maybeSingle()
    if (error) return null
    const name = (data as { teams?: { name?: string | null } | null } | null)?.teams?.name
    const trimmed = typeof name === 'string' ? name.trim() : ''
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}

export default async function Image({
  params,
}: {
  params: Promise<{ orgSlug: string; leagueId: string }>
}) {
  const { leagueId } = await params
  const teamName = await loadPublicTeamName(leagueId)
  if (!teamName) return RootOnballCard()

  const head = layoutHeadline(teamName)
  // 팀 이름은 가변이므로 서브셋 요청 글리프에 반드시 포함시켜야 한다(빠지면 두부 현상).
  const fontData = await loadKoreanFont(glyphSet(BRAND, PREFIX, TAGLINE, teamName, '…'), 700)

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: COLOR.ground,
          padding: '80px 88px',
          position: 'relative',
        }}
      >
        {/* 브랜드 옐로 글로우 — 루트 카드와 동일 */}
        <div
          style={{
            position: 'absolute',
            top: -200,
            right: -160,
            width: 680,
            height: 680,
            borderRadius: '50%',
            background: COLOR.yellow,
            opacity: 0.16,
            filter: 'blur(60px)',
          }}
        />

        {/* 상단 락업 — 브랜드 가이드의 onball-symbol.svg 패스 + 워드마크 + 밑줄.
            스플래시(globals.css .splash-*)·로고 파일과 같은 형태를 쓴다. */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
          <svg width={70} height={61} viewBox="0 0 152 132" fill="none" stroke={COLOR.yellow} strokeWidth={8} strokeLinecap="round">
            <circle cx="76" cy="66" r="52" />
            <path d="M25 66 H127" />
            <path d="M76 14 V118" />
            <path d="M41 25 C 60 45, 60 87, 41 107" />
            <path d="M111 25 C 92 45, 92 87, 111 107" />
          </svg>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 44, fontWeight: 700, color: COLOR.ink, letterSpacing: 1, lineHeight: 1 }}>{BRAND}</div>
            <div style={{ display: 'flex', height: 4, marginTop: 5, background: COLOR.yellow, borderRadius: 2 }} />
          </div>
        </div>

        {/* 중앙 — 온볼 × 팀이름 */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {head.inline ? (
            <div style={{ display: 'flex', alignItems: 'baseline', fontSize: head.size, fontWeight: 700, color: COLOR.ink, lineHeight: 1.24, letterSpacing: -1 }}>
              {/* flexShrink: 0 — 폭 계산이 어긋나도 '온볼'/'×' 가 세로로 쪼개지지 않게 */}
              <div style={{ display: 'flex', flexShrink: 0 }}>온볼</div>
              <div style={{ display: 'flex', flexShrink: 0, color: COLOR.yellow, margin: `0 ${INLINE_GAP}px` }}>×</div>
              <div style={{ display: 'flex' }}>{head.lines[0]}</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', fontSize: 40, fontWeight: 700, color: COLOR.muted, lineHeight: 1.2, marginBottom: 10 }}>
                <div style={{ display: 'flex' }}>온볼</div>
                <div style={{ display: 'flex', color: COLOR.yellow, margin: '0 14px' }}>×</div>
              </div>
              {head.lines.map((line, i) => (
                <div key={i} style={{ display: 'flex', fontSize: head.size, fontWeight: 700, color: COLOR.ink, lineHeight: 1.24, letterSpacing: -1 }}>
                  {line}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: COLOR.muted, marginTop: 26 }}>
            {TAGLINE}
          </div>
        </div>

        {/* 하단 강조 바 — 루트 카드와 동일 */}
        <div style={{ display: 'flex', width: '100%', height: 12, background: COLOR.yellow, borderRadius: 6 }} />
      </div>
    ),
    {
      ...size,
      fonts: fontData
        ? [{ name: 'Noto Sans KR', data: fontData, weight: 700, style: 'normal' as const }]
        : undefined,
    }
  )
}
