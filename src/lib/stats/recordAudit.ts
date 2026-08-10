// 기록 누락 자동 점검 — "이 경기에서 다시 볼 지점" 을 뽑아내는 순수 로직
//
// 왜 필요한가: 기록은 유튜브 영상을 보며 사람이 손으로 친다(경기당 평균 68개). 놓친 곳이
// 있어도 지금은 영상을 처음부터 다시 보는 것 말고는 찾을 방법이 없다. 그래서 "누락일
// 가능성이 높은 시점"만 뽑아 영상 그 지점으로 바로 점프시킨다.
//
// 임계값은 감이 아니라 운영 DB 17,869건 실측에서 뽑았다(2026-08-10 측정):
//   · 실패 슛 5,924건 중 86.5% 가 8초 안에 리바운드를 동반 → 8초를 창으로 잡으면
//     남는 13.5%(799건, 경기당 평균 2.9건)가 "확인할 지점"이 된다
//   · 스틸 1,189건 중 25.8%(307건) 에 턴오버 짝이 없다
//   · 이벤트 간격은 중앙값 4.8초·p95 28.5초 → 60초 초과는 전체 261경기에서 59곳뿐이라
//     희소하다. 희소하다는 건 곧 신호라는 뜻이다
//   · 같은 선수·같은 유형이 2초 안에 두 번 찍힌 건 26건뿐 → 더블탭 오입력일 확률이 높다
//
// ⚠ 이건 "오류 목록"이 아니라 "확인 후보"다. 아웃바운드로 나간 공(리바운드 없음),
// 짝을 모르는 스틸, 촬영이 끊긴 구간은 전부 정상이다. 문구도 그렇게 읽히게 쓴다.

export type AuditKind = 'missing_rebound' | 'missing_tov_pair' | 'gap' | 'duplicate'

export interface AuditEvent {
  id: string
  type: string
  result: 'made' | 'missed' | null
  video_timestamp: number | null
  league_player_id: string | null
  related_player_id: string | null
}

export interface AuditFinding {
  kind: AuditKind
  /** 영상에서 확인할 시각(초). 이 값으로 seekTo 한다 */
  timestamp: number
  /** 화면에 그대로 보여줄 한 줄 문구 */
  label: string
  /** 근거가 된 이벤트 — 목록에서 되짚을 때 쓴다 */
  eventId?: string
}

/** 실패 슛 뒤 이 시간 안에 리바운드가 없으면 확인 후보 (실측 근거는 파일 상단) */
export const REBOUND_WINDOW = 8
/** 이 시간 넘게 이벤트가 없으면 기록이 끊긴 구간으로 본다 */
export const GAP_THRESHOLD = 60
/** 같은 선수·같은 유형이 이 시간 안에 두 번이면 더블탭 의심 */
export const DUPLICATE_WINDOW = 2

/** 리바운드가 뒤따라야 하는 슛 유형 — 마지막 자유투와 필드골 */
const REBOUNDABLE_MISS = new Set([
  'shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post',
  'ft_2pt', 'ft_3pt_2', 'free_throw',
])
const REBOUND_TYPES = new Set(['oreb', 'dreb'])
/** 교체는 플레이가 아니라 기록 공백 판정에서 제외한다(경기 중단 중에 찍히므로) */
const NON_PLAY = new Set(['sub_in', 'sub_out'])

function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/**
 * 한 경기의 이벤트를 훑어 "확인할 지점" 목록을 시각순으로 돌려준다.
 * 선수 이름은 화면에서만 필요하므로 id→이름 맵을 선택 인자로 받는다(없으면 생략).
 */
export function auditGameEvents(
  events: AuditEvent[],
  playerNames?: Map<string, string>,
): AuditFinding[] {
  const named = (id: string | null) => (id && playerNames?.get(id)) || '선수'

  // 타임스탬프가 있는 것만, 영상 시각순으로. created_at 순서는 보정 입력 때문에
  // 영상 시각과 어긋날 수 있어 여기서는 반드시 video_timestamp 로 다시 정렬한다.
  const timed = events
    .filter(e => typeof e.video_timestamp === 'number' && e.video_timestamp > 0)
    .sort((a, b) => (a.video_timestamp as number) - (b.video_timestamp as number))
  if (timed.length === 0) return []

  const lastTs = timed[timed.length - 1].video_timestamp as number
  const findings: AuditFinding[] = []

  // ── ① 실패 슛인데 뒤따르는 리바운드가 없다 ──────────────────────
  // 영상 끝자락(마지막 이벤트 기준 REBOUND_WINDOW 이내)의 실패 슛은 제외한다.
  // 경기가 그대로 끝난 것이지 누락이 아니다.
  for (const e of timed) {
    if (e.result !== 'missed' || !REBOUNDABLE_MISS.has(e.type)) continue
    const ts = e.video_timestamp as number
    if (ts > lastTs - REBOUND_WINDOW) continue
    const hasReb = timed.some(r =>
      REBOUND_TYPES.has(r.type) &&
      (r.video_timestamp as number) >= ts &&
      (r.video_timestamp as number) <= ts + REBOUND_WINDOW
    )
    if (!hasReb) {
      findings.push({
        kind: 'missing_rebound',
        timestamp: Math.max(0, ts - 3),
        label: `${mmss(ts)} — ${named(e.league_player_id)} 슛 실패 후 리바운드가 없습니다`,
        eventId: e.id,
      })
    }
  }

  // ── ② 스틸에 턴오버 짝이 없다 ───────────────────────────────────
  for (const e of timed) {
    if (e.type !== 'steal' || e.related_player_id) continue
    const ts = e.video_timestamp as number
    findings.push({
      kind: 'missing_tov_pair',
      timestamp: Math.max(0, ts - 3),
      label: `${mmss(ts)} — ${named(e.league_player_id)} 스틸에 턴오버 선수가 없습니다`,
      eventId: e.id,
    })
  }

  // ── ③ 이벤트가 오래 끊긴 구간 ───────────────────────────────────
  const play = timed.filter(e => !NON_PLAY.has(e.type))
  for (let i = 1; i < play.length; i++) {
    const prev = play[i - 1].video_timestamp as number
    const cur = play[i].video_timestamp as number
    if (cur - prev > GAP_THRESHOLD) {
      findings.push({
        kind: 'gap',
        timestamp: prev,
        label: `${mmss(prev)}~${mmss(cur)} — ${Math.round(cur - prev)}초 동안 기록이 없습니다`,
      })
    }
  }

  // ── ④ 같은 선수·같은 유형이 순식간에 두 번 (더블탭 의심) ────────
  for (let i = 1; i < timed.length; i++) {
    const a = timed[i - 1]
    const b = timed[i]
    if (!b.league_player_id || a.league_player_id !== b.league_player_id) continue
    if (a.type !== b.type || a.result !== b.result) continue
    const dt = (b.video_timestamp as number) - (a.video_timestamp as number)
    if (dt >= 0 && dt <= DUPLICATE_WINDOW) {
      findings.push({
        kind: 'duplicate',
        timestamp: Math.max(0, (a.video_timestamp as number) - 3),
        label: `${mmss(b.video_timestamp as number)} — ${named(b.league_player_id)} 같은 기록이 ${dt.toFixed(1)}초 간격으로 두 번입니다`,
        eventId: b.id,
      })
    }
  }

  return findings.sort((a, b) => a.timestamp - b.timestamp)
}

export const AUDIT_KIND_LABEL: Record<AuditKind, string> = {
  missing_rebound: '리바운드',
  missing_tov_pair: '턴오버 짝',
  gap: '기록 공백',
  duplicate: '중복 의심',
}
