// 자동 기록 불러오기 — hoops-autostat 가 만든 `.onball.jsonl` 을 기록 화면의 검토 행으로 바꾼다.
//
// 순수 모듈이다(React·fetch 없음). 화면은 components/record/AutoImportPanel.tsx,
// 회귀 확인은 `node scripts/verify-auto-import.mjs`.
// ⚠ 값 import 를 `@/` 경로로 하지 말 것 — 검증 스크립트가 node 로 이 파일을 직접 읽는다(타입 import 만 지워진다).
import type { EventType, Player } from '@/types/database'

export type ImportKind = 'shot_3p' | 'shot_2p' | 'free_throw' | 'foul'
export const TWO_PT_TYPES = ['shot_2p_mid', 'shot_layup', 'shot_post'] as const
export type TwoPtType = (typeof TWO_PT_TYPES)[number]

/** 파일 한 줄 → 검토 행. 사용자가 바꾸는 값(type·playerId·quarter·approved)도 여기 함께 둔다. */
export interface ImportRow {
  key: string
  kind: ImportKind
  ts: number
  quarter: number
  /** 2점은 세부 종류가 확실할 때만 채운다 — 추정(type_guess)이면 null 로 두고 사람이 고른다 */
  type: EventType | null
  playerId: string | null
  fileName: string | null
  fileNumber: string | null
  confidence: number | null
  source: string | null
  reviewUrl: string | null
  videoId: string | null
  duplicate: boolean
  approved: boolean
  saved?: boolean
  error?: string
}

type Raw = Record<string, unknown>

function parseExtra(v: unknown): Raw {
  if (v && typeof v === 'object') return v as Raw
  if (typeof v !== 'string') return {}
  try { const o = JSON.parse(v); return o && typeof o === 'object' ? o : {} } catch { return {} }
}

/** 팀 명단에서 선수 찾기 — id → 등번호 → 이름 순. 파일의 id 는 다른 팀 명단일 수 있어 명단 안에서만 인정한다. */
export function matchPlayer(
  roster: Pick<Player, 'id' | 'number' | 'name'>[],
  id: string | null, number: string | null, name: string | null,
): string | null {
  if (id) { const p = roster.find(r => r.id === id); if (p) return p.id }
  if (number) { const p = roster.find(r => String(r.number).trim() === number.trim()); if (p) return p.id }
  if (name) { const p = roster.find(r => r.name.trim() === name.trim()); if (p) return p.id }
  return null
}

/**
 * jsonl 텍스트 → 검토 행(시각 순). 상대 득점(opp_score)·미성공 슛·모르는 종류는 버린다.
 * `skipped` 는 읽지 못했거나 범위 밖인 줄 수 — 0 이 아니면 화면이 알린다(조용히 사라지지 않게).
 */
export function parseAutoImport(
  text: string,
  roster: Pick<Player, 'id' | 'number' | 'name'>[],
): { rows: ImportRow[]; skipped: number; oppRows: number } {
  const rows: ImportRow[] = []
  let skipped = 0
  let oppRows = 0
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return
    let r: Raw
    try { r = JSON.parse(line) } catch { skipped++; return }
    const t = r.type
    if (t === 'opp_score') { oppRows++; return }
    let kind: ImportKind
    if (t === 'foul') kind = 'foul'
    else if (r.result !== 'made') { skipped++; return }
    else if (t === 'shot_3p') kind = 'shot_3p'
    else if (t === 'free_throw') kind = 'free_throw'
    else if (typeof t === 'string' && (TWO_PT_TYPES as readonly string[]).includes(t)) kind = 'shot_2p'
    else { skipped++; return }

    const ts = Number(r.video_timestamp)
    const quarter = Number(r.quarter)
    if (!Number.isFinite(ts) || !Number.isInteger(quarter) || quarter < 1 || quarter > 6) { skipped++; return }

    const auto = parseExtra(parseExtra(r.extra).auto)
    const str = (v: unknown) => (typeof v === 'string' && v ? v : null)
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
    const typeGuess = auto.type_guess === true
    const type: EventType | null =
      kind === 'shot_2p' ? (typeGuess ? null : (t as EventType)) : (kind as EventType)
    const fileNumber = r.player_number == null ? null : String(r.player_number)

    rows.push({
      key: `${i}:${ts}:${t}`,
      kind, ts, quarter, type,
      playerId: matchPlayer(roster, str(r.player_id), fileNumber, str(r.player_name)),
      fileName: str(r.player_name),
      fileNumber,
      confidence: num(auto.confidence),
      source: str(auto.source),
      reviewUrl: str(auto.review_url),
      videoId: str(r.video_id),
      duplicate: false,
      approved: true,
    })
  })
  rows.sort((a, b) => a.ts - b.ts)
  return { rows, skipped, oppRows }
}

const SCORE_TYPES = new Set<string>(['shot_3p', ...TWO_PT_TYPES, 'free_throw'])
export const DUP_WINDOW_SEC = 3

/**
 * 이미 기록된 이벤트와 겹치는 행 표시 — 같은 계열(성공한 득점 / 파울)이 ±3초 안에 있으면 중복 의심.
 * 중복 의심 행은 기본값을 버림으로 둔다(두 번 저장되면 득점이 부풀고, 지우는 쪽이 더 번거롭다).
 */
export function markDuplicates(
  rows: ImportRow[],
  existing: { type: string; result?: string | null; video_timestamp?: number | null }[],
): ImportRow[] {
  return rows.map(row => {
    const isFoul = row.kind === 'foul'
    const dup = existing.some(e =>
      e.video_timestamp != null &&
      Math.abs(e.video_timestamp - row.ts) <= DUP_WINDOW_SEC &&
      (isFoul ? e.type === 'foul' : SCORE_TYPES.has(e.type) && e.result === 'made'),
    )
    return { ...row, duplicate: dup, approved: dup ? false : row.approved }
  })
}

/** 사람이 골라야 저장할 수 있는 행 — 2점 세부 종류 미정. */
export function blocksSave(row: ImportRow): boolean {
  return row.type === null
}

/** 확인 필요 — 저장을 막는 것 + 파울인데 선수 미정(선수 없이도 저장은 되지만 개인 파울로 안 잡힌다). */
export function needsAttention(row: ImportRow): boolean {
  return blocksSave(row) || (row.kind === 'foul' && !row.playerId)
}

/** POST /api/events 본문 — EventInputPad 와 같은 모양. points 는 서버가 type·result 로 정한다. */
export function toEventBody(row: ImportRow, gameId: string) {
  return {
    game_id: gameId,
    quarter: row.quarter,
    video_timestamp: row.ts,
    type: row.type,
    player_id: row.playerId,
    result: row.kind === 'foul' ? null : 'made',
    related_player_id: null,
  }
}

/** mm:ss — 한 시간이 넘는 영상도 분을 이어 센다(기록 화면 다른 곳의 시:분:초와 섞이지 않게 단순하게). */
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
