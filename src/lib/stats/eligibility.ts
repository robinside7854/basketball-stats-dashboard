/**
 * 스탯 탭 리더보드의 최소 출전 비율 — 그 기간에 열린 라운드(경기일)의 30% 이상 (2026-08-03 완화).
 *   용어 시트(glossary.ts READING_GUIDE)도 이 값을 읽는다.
 */
export const STATS_MIN_ROUND_RATIO = 0.3

// 리더보드 출전 자격 분리 — 자격(gp >= minRounds)과 미달(1 <= gp < minRounds)로 나눈다.
// gp 0 은 어느 쪽에도 넣지 않는다: 「전체 명단 보기」에서도 한 번도 안 뛴 선수는 표에 올릴 기록이 없다.
export function splitEligible<T extends { gp: number }>(players: T[], minRounds: number) {
  const eligible: T[] = []
  const ineligible: T[] = []
  for (const p of players) {
    if (p.gp >= minRounds) eligible.push(p)
    else if (p.gp >= 1) ineligible.push(p)
  }
  return { eligible, ineligible }
}

/**
 * 홈 「리그 리더」의 최소 출전(일) — 정본. 홈 리더(NbaLeaders)와 개인 대시보드(/me 순위)가 같이 쓴다.
 *   평소엔 3일 이상(하루 반짝한 선수가 1위에 앉지 않게), 최다 출전자의 절반 이상.
 *   분기 초에는 아무도 3일을 못 채워 카드가 통째로 비므로, 지금까지 최다 출전 일수까지 낮춘다.
 *   ⚠ 두 화면이 각자 식을 쓰면 「홈에선 2위인데 내 기록에선 순위 없음」이 된다.
 */
export function leaderMinRounds(players: ReadonlyArray<{ gp: number }>): number {
  const maxGP = players.reduce((m, p) => Math.max(m, p.gp), 0)
  return Math.max(1, Math.min(3, maxGP), Math.ceil(maxGP / 2))
}

// ─────────────────────────────────────────────
// 성공률 최소 시도 기준 (2026-10-14)
// 참고: kbl-stats `lib/metrics.ts` 의 attemptThresholds · meetsAttemptThreshold · qualifyLabel.
//   그쪽은 시즌 데이터(표본 충족 선수의 경기당 평균 시도)로 기준을 매번 계산하지만,
//   우리 리그는 선수가 30명 안팎이라 평균이 한두 명 때문에 출렁인다 → **고정 상수 하나**로 둔다.
//   단위는 「하루(라운드)」 — 스탯 화면의 평균 단위와 같다. 기준 = 하루 평균 N개 × 출전일 수.
//
// 왜 필요한가: 하루 한 번 3점을 던져 넣은 선수가 3점 성공률 100% 로 1위에 앉는다.
//   시도 부족 선수도 표에는 보이되 **순위는 매기지 않는다**(「시도 부족」 표시).
// ⚠ 기준을 바꾸면 여기 한 곳만 고친다 — 표·TOP 5·리그 리더 굵게·용어 시트가 전부 이 값을 읽는다.
// ─────────────────────────────────────────────

/** 성공률 순위에 드는 하루 평균 최소 시도 (우리 규칙 — 주 1회 동호회 리그 기준) */
export const MIN_ATTEMPTS_PER_DAY = {
  /** 야투(2점+3점) — 야투율 · 유효 야투율 · 진실 야투율 */
  fg: 5,
  /** 2점 야투 — 2점 성공률 */
  fg2: 3,
  /** 3점 야투 — 3점 성공률 */
  fg3: 2,
  /** 자유투 — 자유투 성공률 */
  ft: 1,
} as const

export type AttemptBucket = keyof typeof MIN_ATTEMPTS_PER_DAY

/** 성공률 지표 키 (PlayerStat 필드 이름과 같다. ts_pct 는 화면에서 계산하는 값) */
export type PctStatKey = 'fg_pct' | 'fg2_pct' | 'fg3_pct' | 'ft_pct' | 'efg_pct' | 'ts_pct'

/** 지표 → 어떤 시도를 세는가 · 화면 이름 */
export const PCT_ATTEMPT_RULE: Record<PctStatKey, { bucket: AttemptBucket; name: string; attemptName: string }> = {
  fg_pct:  { bucket: 'fg',  name: '야투율',       attemptName: '야투' },
  fg2_pct: { bucket: 'fg2', name: '2점 성공률',   attemptName: '2점슛' },
  fg3_pct: { bucket: 'fg3', name: '3점 성공률',   attemptName: '3점슛' },
  ft_pct:  { bucket: 'ft',  name: '자유투 성공률', attemptName: '자유투' },
  efg_pct: { bucket: 'fg',  name: '유효 야투율',  attemptName: '야투' },
  ts_pct:  { bucket: 'fg',  name: '진실 야투율',  attemptName: '야투' },
}

export const isPctStatKey = (k: string): k is PctStatKey => k in PCT_ATTEMPT_RULE

/** 시도 기준 판정에 필요한 최소 필드 (PlayerStat 이 그대로 맞는다) */
export interface AttemptInput {
  gp: number
  fga: number
  fg3a: number
  fta: number
  fg2a?: number
}

/** 이 지표에서 센 시도 수 */
export function attemptsFor(p: AttemptInput, key: PctStatKey): number {
  switch (PCT_ATTEMPT_RULE[key].bucket) {
    case 'fg3': return p.fg3a ?? 0
    case 'ft':  return p.fta ?? 0
    case 'fg2': return p.fg2a ?? Math.max(0, (p.fga ?? 0) - (p.fg3a ?? 0))
    default:    return p.fga ?? 0
  }
}

/** 출전일 gp 인 선수가 채워야 할 총 시도 수 (최소 1) */
export function minAttemptsFor(key: PctStatKey, gp: number): number {
  return Math.max(1, Math.ceil(MIN_ATTEMPTS_PER_DAY[PCT_ATTEMPT_RULE[key].bucket] * Math.max(1, gp)))
}

/** 성공률 순위 자격: 하루 평균 시도 ≥ 기준 (출전 0일이면 false) */
export function meetsAttemptMin(p: AttemptInput, key: PctStatKey): boolean {
  if (!(p.gp > 0)) return false
  return attemptsFor(p, key) >= minAttemptsFor(key, p.gp)
}

/** 화면 안내 한 줄, 예: 「야투율은 하루 평균 5개 이상 시도한 선수만 순위」 */
export function attemptRuleLabel(key: PctStatKey): string {
  const r = PCT_ATTEMPT_RULE[key]
  const n = MIN_ATTEMPTS_PER_DAY[r.bucket]
  return `${r.name}은 하루 평균 ${r.attemptName} ${n}개 이상 시도한 선수만 순위`
}
