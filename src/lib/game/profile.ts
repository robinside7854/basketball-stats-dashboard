// 미라클 후프스 — 운영진이 정하는 선수별 게임 설정(2026-11-16). league_players.appearance(jsonb, 마이그레이션 137) 한 칸에 담는다.
//   외모(사진에서 뽑은 것 + 운영진 수정) · 체형 · 스피드 · 운동능력.
//   스피드·운동능력은 「정한 값이 우선」(운영진 결정) — 정하지 않으면(auto/없음) 기록으로 계산한 값을 쓴다.
// 화면(settings/hoops)·저장 API(players/bulk PATCH)·게임 API(game/roster)가 이 표 하나를 같이 본다.

export const PROFILE_OPTIONS = {
  skin: { light: '밝음', medium: '보통', tan: '구릿빛' },
  hair: { short: '짧은 머리', medium: '중간 길이', wavy: '웨이브', curly: '곱슬', buzz: '아주 짧음', bald: '민머리' },
  hairColor: { black: '검정', gray: '회색', none: '없음' },
  facial: { none: '없음', mustache: '콧수염' },
  eyewear: { none: '없음', glasses: '안경', goggles: '스포츠 고글' },
  build: { normal: '보통', slim: '마름', sturdy: '건장' },
  speed: { auto: '기록대로', fast: '빠름', normal: '보통', slow: '느림' },
  athletic: { auto: '기록대로', high: '높음', normal: '보통', low: '낮음' },
} as const

export type ProfileKey = keyof typeof PROFILE_OPTIONS
export type GameProfile = { [K in ProfileKey]?: keyof (typeof PROFILE_OPTIONS)[K] }

/** 단계 → 능력치 (빠름·높음 90 / 보통 73 / 느림·낮음 56) */
export const TIER_RATING: Record<string, number> = { fast: 90, high: 90, normal: 73, slow: 56, low: 56 }

/** 저장 전 검사 — 표에 없는 값은 버린다. 하나도 없으면 null */
export function cleanProfile(raw: unknown): GameProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Record<string, string> = {}
  for (const k of Object.keys(PROFILE_OPTIONS) as ProfileKey[]) {
    const v = (raw as Record<string, unknown>)[k]
    if (typeof v === 'string' && v in PROFILE_OPTIONS[k]) out[k] = v
  }
  return Object.keys(out).length ? (out as GameProfile) : null
}

/** 게임으로 보낼 때: 외모 칸(체형 포함)과 능력치 덮어쓰기를 나눈다 */
export function splitProfile(p: GameProfile | null): { look: Omit<GameProfile, 'speed' | 'athletic'> | null; speed?: number; athletic?: number } {
  if (!p) return { look: null }
  const { speed, athletic, ...look } = p
  return {
    look: Object.keys(look).length ? look : null,
    speed: speed && speed !== 'auto' ? TIER_RATING[speed] : undefined,
    athletic: athletic && athletic !== 'auto' ? TIER_RATING[athletic] : undefined,
  }
}
