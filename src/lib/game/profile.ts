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
  // 선수 고유 스킬 1개(2026-11-17 사용자 지정). 동작은 게임 엔진이 id 로 붙인다
  skill: {
    ironScreen: '철벽스크린', trashTalk: '트래시토킹', rubberArm: '고무고무팔', ironMental: '강철멘탈',
    pickpocket: '소매치기', clutch: '클러치', putbackMachine: '풋백머신', backdoor: '백도어', rimProtector: '림 프로텍터',
    midHotHand: '미들핫핸드', fadeaway: '페이더웨이', threeHotHand: '3점핫핸드', catchShoot: '캐치앤슛', sliding: '슬라이딩',
    shadowDefense: '그림자수비', fastBreak: '번개 속공', leech: '찰거머리', entryPass: '엔트리 패스',
    plusOne: '플러스원', deepThree: '딥쓰리', isolation: '아이솔레이션', mounjaro: '마운자로', ballHawk: '볼호크',
    openShot: '오픈샷 확신', pickRoll: '픽앤롤 마스터', ankleBreaker: '앵클브레이커', euroStep: '유로스텝',
    hustleMachine: '허슬머신', stepBack: '스텝백', kickOut: '킥아웃패스', killPass: '킬패스', shotFake: '슛페이크',
    buzzerBeater: '버저비터', laneCut: '패스길 차단', grit: '투지',
  },
} as const

export type ProfileKey = keyof typeof PROFILE_OPTIONS
export type GameProfile = { [K in ProfileKey]?: keyof (typeof PROFILE_OPTIONS)[K] } & { tuneBy?: Tune; tuneTo?: Tune }

// 운영진 능력치 손보기(2026-11-17 사용자 지시) — 게임 카드 게이지 단위(1칸 = 10점).
//   tuneBy: 지금보다 몇 칸 올리고 내릴지(-4~4) · tuneTo: 몇 칸으로 맞출지(1~5). 게이지 하나가 능력치 둘이면 둘 다 바꾼다
export const TUNE_FIELDS = {
  inside: ['layup', 'post'], mid: ['mid'], three: ['three'], pass: ['pass'], handle: ['handle'],
  board: ['oreb', 'dreb'], defense: ['steal', 'block'], speed: ['speed'], stamina: ['stamina'],
} as const
export type Tune = Partial<Record<keyof typeof TUNE_FIELDS | 'screen', number>>  // screen = 능력치 칸이 아니라 게임이 계산하는 스크린 게이지(카드 screenTune 으로 보냄)
function cleanTune(raw: unknown, lo: number, hi: number): Tune | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const out: Tune = {}
  for (const k of [...Object.keys(TUNE_FIELDS), 'screen'] as (keyof Tune)[]) {
    const v = (raw as Record<string, unknown>)[k]
    if (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi && v !== 0) out[k] = v
  }
  return Object.keys(out).length ? out : undefined
}
/** 능력치에 손보기를 적용 — 칸 n = (50+10n-5)점, 1~99 안 */
export function applyTune<R extends Record<string, number>>(r: R, p: GameProfile | null): R {
  if (!p?.tuneBy && !p?.tuneTo) return r
  const out: Record<string, number> = { ...r }
  for (const [k, fs] of Object.entries(TUNE_FIELDS) as [keyof Tune, readonly string[]][]) {
    for (const f of fs) {
      if (p.tuneTo?.[k]) out[f] = 45 + 10 * p.tuneTo[k]!
      if (p.tuneBy?.[k]) out[f] = Math.min(99, Math.max(1, out[f] + 10 * p.tuneBy[k]!))
    }
  }
  return out as R
}

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
  const tuneBy = cleanTune((raw as Record<string, unknown>).tuneBy, -4, 4), tuneTo = cleanTune((raw as Record<string, unknown>).tuneTo, 1, 5)
  const res: GameProfile = { ...(out as GameProfile), ...(tuneBy ? { tuneBy } : {}), ...(tuneTo ? { tuneTo } : {}) }
  return Object.keys(res).length ? res : null
}

/** 게임으로 보낼 때: 외모 칸(체형 포함)과 능력치 덮어쓰기를 나눈다 */
export function splitProfile(p: GameProfile | null): { look: Omit<GameProfile, 'speed' | 'athletic' | 'skill'> | null; skill: string | null; speed?: number; athletic?: number } {
  if (!p) return { look: null, skill: null }
  const { speed, athletic, skill, tuneBy: _b, tuneTo: _t, ...look } = p
  return {
    look: Object.keys(look).length ? look : null,
    skill: skill ?? null,
    speed: speed && speed !== 'auto' ? TIER_RATING[speed] : undefined,
    athletic: athletic && athletic !== 'auto' ? TIER_RATING[athletic] : undefined,
  }
}
