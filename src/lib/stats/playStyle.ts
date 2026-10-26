// 선수 카드 「플레이스타일」 (2026-10-26 운영진) — 공격·수비·리바운드를 한데 묶은 성향. 순수 함수.
//
// 재료
//   · 하루 평균(블록·스틸·공격/수비 리바운드)과 그 백분위 — 모집단은 레이더와 같은 자격 집단(detail 라우트의 eligibleForRank).
//   · 막아낸 슛 위치 — 블록 이벤트에는 위치가 없어서, 같은 경기·같은 쿼터에서 **상대 팀이 놓친 슛 중 영상 시각이 가장 가까운 것**
//     (6초 안)을 그 블록의 대상으로 본다(pairBlockedShots). 미라클 블록 358건 중 88%가 짝지어졌다(2026-10-26 실측).
//   · 공격은 야투 시도 비중(레이업·골밑·미드·3점)과 어시스트 백분위.
// 문턱은 아래 상수 하나씩 — 화면에서 다시 정하지 말 것.

export type BlockZone = 'rim' | 'mid' | 'three'
export type StyleTag = { key: string; label: string; side: 'offense' | 'defense' | 'rebound' }

/** 블록 ↔ 상대 놓친 슛 짝짓기 최대 간격(초) */
export const BLOCK_PAIR_WINDOW = 6
/** 성향을 말하려면 필요한 최소 표본 */
export const MIN_REB_FOR_LEAN = 10
export const MIN_FGA_FOR_LEAN = 20
/** 림 프로텍터 — 블록 백분위와, 막은 슛 중 림(레이업·골밑) 비중 */
export const RIM_PROTECT_PCT = 80
export const RIM_SHARE_MIN = 60
/** 수비 성향 — 블록·스틸 백분위 차이 */
export const DEF_LEAN_GAP = 20
/** 리바운드 성향 — 「내 리바운드 중 공격 리바 비중」을 리바운드 10개 이상 선수끼리 줄 세워
 *  아래 1/3 = 수비 리바 위주, 위 1/3 = 공격 리바 적극. (2026-10-26 운영진: 리그 평균 ±10%p 기준은 폭이 좁아
 *  수비 지향이 뚜렷한 김로빈(공격 비중 24%, 리그 31%)이 「고루」로 나왔다 — 비중 분포가 13~58% 로 촘촘하다) */
export const REB_LEAN_LOW = 33
export const REB_LEAN_HIGH = 67

export type StyleInput = {
  pid: string; gp: number
  oreb: number; dreb: number; stl: number; blk: number; ast: number
  fga: number; lu_a: number; ds_a: number; md_a: number; fg3a: number
}

type ShotEv = { game: string; quarter: number | null; t: number; team: string | null; type: string }
type BlockEv = { game: string; quarter: number | null; t: number; team: string | null }

const ZONE_OF: Record<string, BlockZone> = { shot_layup: 'rim', shot_post: 'rim', shot_2p_mid: 'mid', shot_3p: 'three' }

/** 블록마다 가장 가까운 상대 놓친 슛의 위치. 짝이 없으면 그 블록은 센다(total)만 하고 위치는 모른다 */
export function pairBlockedShots(blocks: readonly BlockEv[], missed: readonly ShotEv[]): { total: number; zones: Record<BlockZone, number>; unknown: number } {
  const zones: Record<BlockZone, number> = { rim: 0, mid: 0, three: 0 }
  let unknown = 0
  for (const b of blocks) {
    let best: ShotEv | null = null
    for (const s of missed) {
      if (s.game !== b.game || (s.quarter ?? 0) !== (b.quarter ?? 0)) continue
      if (b.team && s.team === b.team) continue
      const d = Math.abs(s.t - b.t)
      if (d > BLOCK_PAIR_WINDOW) continue
      if (!best || d < Math.abs(best.t - b.t)) best = s
    }
    const z = best ? ZONE_OF[best.type] : undefined
    if (z) zones[z]++
    else unknown++
  }
  return { total: blocks.length, zones, unknown }
}

/** 모집단 안 백분위(0~100, 같은 값은 절반) */
function pctOf(values: readonly number[], v: number): number {
  if (values.length === 0) return 50
  let below = 0, equal = 0
  for (const x of values) { if (x < v) below++; else if (x === v) equal++ }
  return Math.round(((below + equal / 2) / values.length) * 100)
}

export type PlayStyle = {
  tags: StyleTag[]
  /** 순위 모집단 인원(순위 자격 선수) · 이 선수가 그 안에 있나(출전일 부족이면 순위 대신 「자격 미달」) */
  pool_size: number
  ranked: boolean
  defense: {
    blk_per_day: number; blk_pct: number; blk_rank: number
    stl_per_day: number; stl_pct: number; stl_rank: number
    lean: 'rim' | 'perimeter' | 'balanced' | 'quiet'
    blocked: { total: number; zones: Record<BlockZone, number>; unknown: number }
    rim_share: number | null   // 위치를 아는 블록 중 림 비중(%)
  }
  rebound: {
    oreb_per_day: number; oreb_pct: number
    dreb_per_day: number; dreb_pct: number
    oreb_rank: number; dreb_rank: number
    oreb_share: number | null       // 내 리바운드 중 공격 리바(%)
    league_oreb_share: number | null
    lean: 'offense' | 'defense' | 'balanced' | null
  }
  offense: { lean: 'three' | 'rim' | 'mid' | 'mixed' | null; playmaker: boolean }
}

const per = (n: number, gp: number) => (gp > 0 ? +(n / gp).toFixed(1) : 0)

export function buildPlayStyle(
  pool: readonly StyleInput[],
  me: StyleInput,
  blocked: { total: number; zones: Record<BlockZone, number>; unknown: number },
): PlayStyle {
  const daily = (p: StyleInput, k: 'oreb' | 'dreb' | 'stl' | 'blk' | 'ast') => (p.gp > 0 ? p[k] / p.gp : 0)
  const pp = pool.length > 0 ? pool : [me]
  const pctFor = (k: 'oreb' | 'dreb' | 'stl' | 'blk' | 'ast') => pctOf(pp.map(p => daily(p, k)), daily(me, k))
  // 순위 = 하루 평균 큰 순, 공동 순위(1, 2, 2, 4)
  const rankFor = (k: 'oreb' | 'dreb' | 'stl' | 'blk') => { const v = daily(me, k); return 1 + pp.filter(p => daily(p, k) > v + 1e-9).length }
  const blk_pct = pctFor('blk'), stl_pct = pctFor('stl'), oreb_pct = pctFor('oreb'), dreb_pct = pctFor('dreb'), ast_pct = pctFor('ast')

  // ── 수비 ──
  const known = blocked.zones.rim + blocked.zones.mid + blocked.zones.three
  const rim_share = known > 0 ? Math.round((blocked.zones.rim / known) * 100) : null
  const defLean: PlayStyle['defense']['lean'] =
    blk_pct < 40 && stl_pct < 40 ? 'quiet'
      : blk_pct - stl_pct >= DEF_LEAN_GAP ? 'rim'
      : stl_pct - blk_pct >= DEF_LEAN_GAP ? 'perimeter'
      : 'balanced'

  // ── 리바운드 ──
  const myReb = me.oreb + me.dreb
  const lgO = pool.reduce((s, p) => s + p.oreb, 0), lgR = pool.reduce((s, p) => s + p.oreb + p.dreb, 0)
  const league_oreb_share = lgR > 0 ? Math.round((lgO / lgR) * 100) : null
  const oreb_share = myReb > 0 ? Math.round((me.oreb / myReb) * 100) : null
  const shares = pool.filter(p => p.oreb + p.dreb >= MIN_REB_FOR_LEAN).map(p => p.oreb / (p.oreb + p.dreb))
  const sharePct = myReb > 0 ? pctOf(shares, me.oreb / myReb) : null
  const rebLean: PlayStyle['rebound']['lean'] =
    myReb < MIN_REB_FOR_LEAN || sharePct == null || shares.length < 3 ? null
      : sharePct >= REB_LEAN_HIGH ? 'offense'
      : sharePct <= REB_LEAN_LOW ? 'defense'
      : 'balanced'

  // ── 공격 ──
  const fga = me.lu_a + me.ds_a + me.md_a + me.fg3a
  const share = (n: number) => (fga > 0 ? (n / fga) * 100 : 0)
  const offLean: PlayStyle['offense']['lean'] =
    fga < MIN_FGA_FOR_LEAN ? null
      : share(me.fg3a) >= 45 ? 'three'
      : share(me.lu_a + me.ds_a) >= 55 ? 'rim'
      : share(me.md_a) >= 40 ? 'mid'
      : 'mixed'
  const playmaker = ast_pct >= 80

  // ── 한 줄 태그 (공격 → 수비 → 리바운드 순) ──
  const tags: StyleTag[] = []
  const OFF_LABEL = { three: '3점 슈터', rim: '골밑 공략형', mid: '미드레인지 장인', mixed: '다양한 공격' } as const
  if (offLean) tags.push({ key: `off-${offLean}`, label: OFF_LABEL[offLean], side: 'offense' })
  if (playmaker) tags.push({ key: 'playmaker', label: '플레이메이커', side: 'offense' })
  if (blk_pct >= RIM_PROTECT_PCT && (rim_share == null || rim_share >= RIM_SHARE_MIN)) tags.push({ key: 'rim-protector', label: '림 프로텍터', side: 'defense' })
  else if (defLean === 'rim') tags.push({ key: 'def-rim', label: '골밑 수비형', side: 'defense' })
  if (defLean === 'perimeter' || (stl_pct >= 80 && defLean !== 'rim')) tags.push({ key: 'def-perimeter', label: '외곽 압박형', side: 'defense' })
  if (rebLean === 'offense') tags.push({ key: 'reb-off', label: '공격 리바운드 가담', side: 'rebound' })
  else if (rebLean === 'defense' && dreb_pct >= 50) tags.push({ key: 'reb-def', label: '수비 리바운드 마무리', side: 'rebound' })
  else if (oreb_pct >= 80 && dreb_pct >= 80) tags.push({ key: 'reb-all', label: '리바운드 장악', side: 'rebound' })

  return {
    tags,
    pool_size: pp.length,
    ranked: pool.some(p => p.pid === me.pid),
    defense: {
      blk_per_day: per(me.blk, me.gp), blk_pct, blk_rank: rankFor('blk'), stl_per_day: per(me.stl, me.gp), stl_pct, stl_rank: rankFor('stl'),
      lean: defLean, blocked, rim_share,
    },
    rebound: {
      oreb_per_day: per(me.oreb, me.gp), oreb_pct, oreb_rank: rankFor('oreb'), dreb_per_day: per(me.dreb, me.gp), dreb_pct, dreb_rank: rankFor('dreb'),
      oreb_share, league_oreb_share, lean: rebLean,
    },
    offense: { lean: offLean, playmaker },
  }
}
