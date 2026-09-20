// 토너먼트 라운드 정본. **새 라운드는 여기에만 추가한다.**
//
//   2026-09-19 이전에는 이 표가 9벌로 흩어져 있었고 값 체계도 서로 달랐다(깊이 맵 3벌 · 역순
//   우선순위 2벌 · 드롭다운 2벌 · 서버 화이트리스트 1벌 · 점수 키워드 2벌). `32강` 하나를 넣으려면
//   9곳을 고쳐야 했고, 실제로 한 곳씩 빠져 있었다 — GameForm 에는 `준결승` 이 없었고
//   boxscore 의 역순 맵에도 `준결승` 이 없었다. `isPlusOneFor()` / `resolveGameVideo()` 와 같은 병이라
//   같은 방식으로 정본 하나를 둔다.
//
// depth: 클수록 결승에 가깝다. **절대값이 아니라 상대 순서만 의미가 있다**(전부 비교에만 쓰인다).
//        1 부터 시작하는 것은 의도적이다 — 호출부가 미등록 라운드를 `?? 0` 으로 떨어뜨려
//        "조별예선보다도 얕다" 로 취급하기 때문에, 0 을 비워 둬야 그 폴백이 성립한다.
// points: 대회 성적 가중치(선수 스탯·대시보드 정렬에서 쓰던 값).
// `4강` 과 `준결승` 은 표기만 다른 같은 단계다(대회마다 부르는 이름이 다르다) → depth·points 동일.
export const ROUND_TABLE = [
  { label: '조별예선', depth: 1, points: 20 },
  { label: '32강', depth: 2, points: 50 },
  { label: '16강', depth: 3, points: 60 },
  { label: '8강', depth: 4, points: 70 },
  { label: '4강', depth: 5, points: 80 },
  { label: '준결승', depth: 5, points: 80 },
  { label: '결승', depth: 6, points: 100 },
] as const

export type RoundLabel = (typeof ROUND_TABLE)[number]['label']

/** 드롭다운 옵션 · 서버 화이트리스트. 표 순서 그대로(얕은 라운드 → 깊은 라운드). */
export const ROUND_LABELS: readonly RoundLabel[] = ROUND_TABLE.map(r => r.label)

/** 진행 깊이 — 클수록 깊다. 미등록 라운드는 호출부에서 `?? 0`. */
export const ROUND_DEPTH: Record<string, number> = Object.fromEntries(
  ROUND_TABLE.map(r => [r.label, r.depth]),
)

const MAX_DEPTH = Math.max(...ROUND_TABLE.map(r => r.depth))

/** 정렬용 역순 — 결승 0 … 조별예선이 가장 큼. depth 의 역수라 둘이 어긋날 수 없다. */
export const ROUND_PRIORITY: Record<string, number> = Object.fromEntries(
  ROUND_TABLE.map(r => [r.label, MAX_DEPTH - r.depth]),
)

/**
 * `ROUND_PRIORITY` 에 없는 값(친선 · 미표기 · 오타)의 폴백.
 * 어떤 등록 라운드보다도 크다 = 목록 맨 뒤. 라운드가 늘어나도 이 관계가 유지된다.
 */
export const UNKNOWN_ROUND_PRIORITY = MAX_DEPTH

/** 대회 성적 가중치. 별칭(준준결승·group 등)은 각 호출부가 이 표 **위에** 얹는다. */
export const ROUND_POINTS: Record<string, number> = Object.fromEntries(
  ROUND_TABLE.map(r => [r.label, r.points]),
)

/** 토너먼트(승자 진출) 라운드 = 조별예선(depth 1)을 뺀 나머지. */
export const KNOCKOUT_ROUNDS: readonly RoundLabel[] = ROUND_TABLE
  .filter(r => r.depth > 1)
  .map(r => r.label)

export function isRoundLabel(value: unknown): value is RoundLabel {
  return typeof value === 'string' && (ROUND_LABELS as readonly string[]).includes(value)
}

/**
 * **같은 날짜 안에서의 진행 순서** — 얕은 라운드(조별예선) → 깊은 라운드(결승).
 * 대회는 하루에 여러 라운드를 치르는데(8강 오전 · 준결승 오후) `games` 테이블에는 날짜만 있어
 * 날짜로만 정렬하면 같은 날 경기들의 순서가 **DB 가 주는 대로** 정해진다 — 준결승이 8강 위에
 * 뜨는 일이 실제로 있었다(2026-09-20 바다배).
 * 미표기·미등록 라운드는 맨 뒤. 라운드가 늘어나도 이 관계가 유지된다.
 */
export function roundSequence(round?: string | null): number {
  if (!round) return MAX_DEPTH + 1
  return ROUND_DEPTH[round.trim()] ?? MAX_DEPTH + 1
}

// ── 자유 입력 라운드명의 점수 환산 ─────────────────────────────────────────
//   레거시 `games.round` 는 자유 텍스트라 `준준결승` · `3-4위` · `Final` 같은 표기가 섞여 있다.
//   정본 표에 없는 그 별칭들만 여기 둔다.
//   정본 표의 라벨도 함께 넣는다 — `8강전` · `결승전` 처럼 꼬리가 붙은 표기가 실제로 들어온다.
const ROUND_POINT_ALIASES: readonly (readonly [string, number])[] = [
  ...ROUND_TABLE.map(r => [r.label, r.points] as const),
  ['3위', 90], ['3-4위', 90],
  ['final', 100],
  ['준준결승', 70], ['quarter', 70],
  ['semi', 80],
  ['조별', 20], ['예선', 10], ['group', 10],
]

// ⚠ **긴 키부터 본다.** 부분 일치라 `준준결승`.includes(`준결승`) 도 `준결승`.includes(`결승`) 도
//   참이다. 짧은 키가 앞에 있으면 준결승이 결승(100)으로 읽힌다 — 목록이 80 을 의도했는데도.
//   (2026-09-19 이전 코드가 정확히 그 상태였다: `결승` 이 목록 맨 앞이라 준결승·준준결승이 100)
const SORTED_ALIASES = [...ROUND_POINT_ALIASES].sort((a, b) => b[0].length - a[0].length)

/**
 * 라운드를 알 수 없을 때(미표기 · 친선 · 미등록 표기). 조별예선(20)보다 높고 16강(60)보다 낮다.
 * ⚠ **어떤 라운드의 `points` 와도 같아서는 안 된다.** 선수 상세의 라운드 스플릿이 점수 구간으로
 *   버킷을 가르므로, 겹치면 그 라운드 칸에 라운드 미표기 경기가 섞여 든다.
 *   (32강을 넣을 때 실제로 겹쳤다 — 32강도 50 이었다)
 */
export const UNKNOWN_ROUND_POINTS = 45

/** 대회 성적 가중치. 정본 표를 정확 일치로 먼저 보고, 없으면 별칭을 부분 일치로 본다. */
export function roundPoints(round?: string | null): number {
  if (!round) return UNKNOWN_ROUND_POINTS
  const exact = ROUND_POINTS[round.trim()]
  if (exact !== undefined) return exact
  const lower = round.toLowerCase()
  for (const [key, value] of SORTED_ALIASES) {
    if (lower.includes(key.toLowerCase())) return value
  }
  return UNKNOWN_ROUND_POINTS
}
