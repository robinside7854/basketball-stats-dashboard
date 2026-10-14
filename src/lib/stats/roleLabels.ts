// 역할 라벨(플레이 스타일) — 선수 카드 머리에 붙는 작은 칩 최대 2개 (2026-10-14 사용자 승인).
//
// ⚠ 배지가 아니다. 배지 제도는 2026-10-11 폐지됐다(CLAUDE.md 「폐지된 기능」). 모으는 것·도감·트로피 아이콘이
//   없고, 화면 문구도 「플레이 스타일」이다. 기간(카드에서 고른 분기/전체)이 바뀌면 라벨도 바뀐다.
//
// 모집단 = 선수 카드 순위와 같은 집단 — computeLeagueStats 결과의 `players`(게스트 제외) 중
//   순위 자격(rankMinRounds: 열린 날의 30%)을 채운 선수. 이 파일은 그 배열을 받기만 한다(DB 를 모른다).
//
// 규칙 (「상위 10%」 = 자리 ≤ ceil(N × 0.10), **올림** — N=25 면 3등까지, N=5 면 1등)
//   1 스코어러          하루 평균 득점 상위 10%
//   2 3점 슈터          야투 중 3점 시도 비중 상위 10% · 3점 성공률 ≥ 리그 평균(모집단 합계 기준) · 3점 최소 시도 충족
//   3 골밑 해결사       야투 중 골밑슛+레이업 시도 비중 상위 10%
//   4 미드레인지 장인   야투 중 미드레인지 시도 비중 상위 10%
//   5 플레이메이커      하루 평균 어시 상위 10% · 어시/실책 ≥ 리그 평균(모집단 합계 기준)
//   6 리바운더          하루 평균 리바 상위 10%
//   7 공격 리바운드 사냥꾼 하루 평균 공격 리바 상위 10%
//   8 스틸러            하루 평균 스틸 상위 10%
//   9 림 프로텍터       하루 평균 블락 상위 10%
//  10 올라운더          하루 평균 득점·리바·어시 모두 상위 20%
//  11 팀플레이어        위 어느 것도 아닐 때
//
//   · 같은 값은 같은 자리(1, 2, 2, 4) — 경계에서 동률이면 둘 다 든다.
//   · 값이 0 이면 라벨을 주지 않는다(블락 0개 선수가 「상위」에 드는 작은 모집단 방지).
//   · 슛 비중 라벨(2·3·4)은 야투 최소 시도(eligibility.ts 의 야투 기준 = 하루 평균 5개 × 출전일)를 채운 선수끼리
//     순위를 매긴다(N 도 그 인원). 3점 슈터의 3점 최소 시도도 eligibility.ts 그대로다 — 스탯 탭 성공률 순위와 한 벌.
//   · 최대 2개: 여럿이면 자리 백분율(rank / N)이 작은 순 2개. 올라운더는 들면 항상 그 2개 중 하나다.
//     백분율이 같으면 위 번호 순.

import { meetsAttemptMin } from './eligibility'

export type RoleLabelKey =
  | 'scorer' | 'shooter3' | 'finisher' | 'midrange' | 'playmaker'
  | 'rebounder' | 'oreb' | 'stealer' | 'rim' | 'allround' | 'teamplayer'

/** 라벨 정의 — 순서가 동률 때의 우선순위다. 설명은 탭/툴팁에 그대로 나간다. */
export const ROLE_LABEL_DEFS: Record<RoleLabelKey, { label: string; explanation: string; order: number }> = {
  scorer:     { order: 1,  label: '스코어러',            explanation: '이번 기간 하루 평균 득점이 리그 상위 10%' },
  shooter3:   { order: 2,  label: '3점 슈터',            explanation: '이번 기간 야투 중 3점슛 비중이 리그 상위 10%이고, 3점 성공률도 리그 평균 이상' },
  finisher:   { order: 3,  label: '골밑 해결사',         explanation: '이번 기간 야투 중 골밑슛·레이업 비중이 리그 상위 10%' },
  midrange:   { order: 4,  label: '미드레인지 장인',     explanation: '이번 기간 야투 중 미드레인지 비중이 리그 상위 10%' },
  playmaker:  { order: 5,  label: '플레이메이커',        explanation: '이번 기간 하루 평균 어시스트가 리그 상위 10%이고, 어시스트/실책 비율도 리그 평균 이상' },
  rebounder:  { order: 6,  label: '리바운더',            explanation: '이번 기간 하루 평균 리바운드가 리그 상위 10%' },
  oreb:       { order: 7,  label: '공격 리바운드 사냥꾼', explanation: '이번 기간 하루 평균 공격 리바운드가 리그 상위 10%' },
  stealer:    { order: 8,  label: '스틸러',              explanation: '이번 기간 하루 평균 스틸이 리그 상위 10%' },
  rim:        { order: 9,  label: '림 프로텍터',         explanation: '이번 기간 하루 평균 블락이 리그 상위 10%' },
  allround:   { order: 10, label: '올라운더',            explanation: '이번 기간 하루 평균 득점·리바운드·어시스트가 모두 리그 상위 20%' },
  teamplayer: { order: 11, label: '팀플레이어',          explanation: '한 부문이 튀기보다 여러 부문에서 고르게 제 몫을 하는 플레이 스타일' },
}

export const ROLE_TOP_SHARE = 0.10
export const ALLROUND_TOP_SHARE = 0.20
export const ROLE_LABEL_MAX = 2

/** 선수 한 줄에서 쓰는 최소 필드 (PlayerStat 이 그대로 맞는다) */
export interface RoleInput {
  player_id: string
  gp: number
  pts: number; reb: number; oreb: number; ast: number; tov: number; stl: number; blk: number
  fga: number; fg3a: number; fg3m: number; fta: number
  /** 골밑슛(shot_post) · 레이업(shot_layup) · 미드레인지(shot_2p_mid) 시도 */
  ds_a: number; lu_a: number; md_a: number
}

/** 상위 몇 자리까지인가 — **올림**(ceil). N=0 이면 0 */
export function topCut(n: number, share: number): number {
  return n > 0 ? Math.ceil(n * share) : 0
}

/** 경쟁 순위(1, 2, 2, 4): 나보다 엄격히 큰 값의 수 + 1 */
export function competitionRank(values: readonly number[], mine: number): number {
  let greater = 0
  for (const v of values) if (v > mine) greater++
  return greater + 1
}

export interface RoleMetric {
  /** 지표 값(하루 평균 또는 비중 0~1). 모집단 밖이면 null */
  value: number | null
  rank: number | null
  /** 순위를 매긴 인원 */
  n: number
}

export interface RoleLabel { key: RoleLabelKey; label: string; explanation: string }

export interface RoleLabelResult {
  labels: RoleLabel[]
  /** 자격을 채운 모든 라벨(최대 2개로 줄이기 전) — CEO 미리보기용 */
  qualified: RoleLabelKey[]
  metrics: Record<'ppg' | 'share3' | 'shareRim' | 'shareMid' | 'apg' | 'rpg' | 'orp' | 'spg' | 'bpg', RoleMetric>
  /** 3점 성공률(%) · 어시/실책 — 조건 비교용 */
  fg3Pct: number | null
  astTo: number | null
}

export interface RoleLabelsComputed {
  byPlayer: Map<string, RoleLabelResult>
  /** 리그 평균(모집단 합계 기준) */
  leagueFg3Pct: number | null
  leagueAstTo: number | null
  /** 슛 비중 라벨의 모집단(야투 최소 시도 충족) 인원 */
  shotPoolSize: number
  poolSize: number
}

const toLabel = (key: RoleLabelKey): RoleLabel => ({ key, label: ROLE_LABEL_DEFS[key].label, explanation: ROLE_LABEL_DEFS[key].explanation })

/**
 * 모집단 전원의 역할 라벨. `pool` = 순위 자격을 채운 선수(게스트 제외) — 호출부가 거른다.
 */
export function computeRoleLabels(pool: readonly RoleInput[]): RoleLabelsComputed {
  const n = pool.length
  const per = (v: number, p: RoleInput) => (p.gp > 0 ? v / p.gp : 0)

  // 하루 평균 지표 — 모집단 전원
  const perDay = {
    ppg: (p: RoleInput) => per(p.pts, p),
    apg: (p: RoleInput) => per(p.ast, p),
    rpg: (p: RoleInput) => per(p.reb, p),
    orp: (p: RoleInput) => per(p.oreb, p),
    spg: (p: RoleInput) => per(p.stl, p),
    bpg: (p: RoleInput) => per(p.blk, p),
  }
  const perDayValues = Object.fromEntries(
    Object.entries(perDay).map(([k, f]) => [k, pool.map(f)]),
  ) as Record<keyof typeof perDay, number[]>

  // 슛 비중 지표 — 야투 최소 시도를 채운 선수끼리 (eligibility.ts 야투 기준 한 벌)
  const shotPool = pool.filter(p => p.fga > 0 && meetsAttemptMin(p, 'fg_pct'))
  const shotIds = new Set(shotPool.map(p => p.player_id))
  const share = {
    share3: (p: RoleInput) => p.fg3a / p.fga,
    shareRim: (p: RoleInput) => (p.ds_a + p.lu_a) / p.fga,
    shareMid: (p: RoleInput) => p.md_a / p.fga,
  }
  const shareValues = Object.fromEntries(
    Object.entries(share).map(([k, f]) => [k, shotPool.map(f)]),
  ) as Record<keyof typeof share, number[]>

  // 리그 평균 — 모집단 합계 기준(가중)
  const sum = (f: (p: RoleInput) => number) => pool.reduce((s, p) => s + f(p), 0)
  const fg3aSum = sum(p => p.fg3a)
  const leagueFg3Pct = fg3aSum > 0 ? (sum(p => p.fg3m) / fg3aSum) * 100 : null
  const tovSum = sum(p => p.tov)
  const astSum = sum(p => p.ast)
  const leagueAstTo = tovSum > 0 ? astSum / tovSum : (astSum > 0 ? Infinity : null)

  const cut10 = topCut(n, ROLE_TOP_SHARE)
  const cut20 = topCut(n, ALLROUND_TOP_SHARE)
  const shotCut10 = topCut(shotPool.length, ROLE_TOP_SHARE)

  const byPlayer = new Map<string, RoleLabelResult>()
  for (const p of pool) {
    const metric = (values: number[], v: number, size: number): RoleMetric => ({ value: v, rank: competitionRank(values, v), n: size })
    const m = {
      ppg: metric(perDayValues.ppg, perDay.ppg(p), n),
      apg: metric(perDayValues.apg, perDay.apg(p), n),
      rpg: metric(perDayValues.rpg, perDay.rpg(p), n),
      orp: metric(perDayValues.orp, perDay.orp(p), n),
      spg: metric(perDayValues.spg, perDay.spg(p), n),
      bpg: metric(perDayValues.bpg, perDay.bpg(p), n),
      share3: shotIds.has(p.player_id) ? metric(shareValues.share3, share.share3(p), shotPool.length) : { value: null, rank: null, n: shotPool.length },
      shareRim: shotIds.has(p.player_id) ? metric(shareValues.shareRim, share.shareRim(p), shotPool.length) : { value: null, rank: null, n: shotPool.length },
      shareMid: shotIds.has(p.player_id) ? metric(shareValues.shareMid, share.shareMid(p), shotPool.length) : { value: null, rank: null, n: shotPool.length },
    }
    const inTop = (x: RoleMetric, cut: number) => x.value !== null && x.value > 0 && x.rank !== null && x.rank <= cut

    const fg3Pct = p.fg3a > 0 ? (p.fg3m / p.fg3a) * 100 : null
    const astTo = p.tov > 0 ? p.ast / p.tov : (p.ast > 0 ? Infinity : null)

    // 후보: [키, 자리 백분율]
    const cands: Array<[RoleLabelKey, number]> = []
    const pct = (x: RoleMetric) => (x.rank ?? 0) / Math.max(1, x.n)
    if (inTop(m.ppg, cut10)) cands.push(['scorer', pct(m.ppg)])
    if (
      inTop(m.share3, shotCut10)
      && meetsAttemptMin(p, 'fg3_pct')
      && fg3Pct !== null && leagueFg3Pct !== null && fg3Pct >= leagueFg3Pct
    ) cands.push(['shooter3', pct(m.share3)])
    if (inTop(m.shareRim, shotCut10)) cands.push(['finisher', pct(m.shareRim)])
    if (inTop(m.shareMid, shotCut10)) cands.push(['midrange', pct(m.shareMid)])
    if (inTop(m.apg, cut10) && astTo !== null && leagueAstTo !== null && astTo >= leagueAstTo) cands.push(['playmaker', pct(m.apg)])
    if (inTop(m.rpg, cut10)) cands.push(['rebounder', pct(m.rpg)])
    if (inTop(m.orp, cut10)) cands.push(['oreb', pct(m.orp)])
    if (inTop(m.spg, cut10)) cands.push(['stealer', pct(m.spg)])
    if (inTop(m.bpg, cut10)) cands.push(['rim', pct(m.bpg)])
    const allround = inTop(m.ppg, cut20) && inTop(m.rpg, cut20) && inTop(m.apg, cut20)

    cands.sort((a, b) => a[1] - b[1] || ROLE_LABEL_DEFS[a[0]].order - ROLE_LABEL_DEFS[b[0]].order)
    const qualified: RoleLabelKey[] = [...(allround ? ['allround' as const] : []), ...cands.map(c => c[0])]
    const picked: RoleLabelKey[] = allround
      ? ['allround', ...cands.slice(0, ROLE_LABEL_MAX - 1).map(c => c[0])]
      : cands.slice(0, ROLE_LABEL_MAX).map(c => c[0])

    byPlayer.set(p.player_id, {
      labels: (picked.length > 0 ? picked : ['teamplayer' as const]).map(toLabel),
      qualified,
      metrics: m,
      fg3Pct,
      astTo: astTo === Infinity ? null : astTo,
    })
  }

  return {
    byPlayer,
    leagueFg3Pct,
    leagueAstTo: leagueAstTo === Infinity ? null : leagueAstTo,
    shotPoolSize: shotPool.length,
    poolSize: n,
  }
}

/** 리그 rules JSON 의 공개 스위치 키 — CEO 만 켠다(`/api/admin/leagues/[id]/role-labels`) */
export const ROLE_LABELS_PUBLIC_KEY = 'role_labels_public'

/** rules JSON → 공개 여부 (형식이 이상하면 false) */
export function roleLabelsPublic(rules: unknown): boolean {
  return !!rules && typeof rules === 'object' && (rules as Record<string, unknown>)[ROLE_LABELS_PUBLIC_KEY] === true
}
