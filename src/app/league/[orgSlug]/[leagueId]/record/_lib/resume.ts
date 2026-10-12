import type { ResumeEntry } from './types'

// ── 이어서 기록하기 (2026-10-12) ─────────────────────────────────────
//   기록 중에 다른 탭으로 나갔다가 돌아오면 **그 장면부터** 다시 잡는다 — 날짜·경기·쿼터·영상 위치.
//   기록 자체는 누를 때마다 서버에 저장되므로, 여기 담는 건 "어디를 보고 있었나" 뿐이다.
//   그래서 서버가 아니라 기기 localStorage 에 둔다(다른 기기의 기록원과 섞일 일이 없다).
//   ⚠ 경기를 마감하면 지운다. 돌아왔을 때 그 경기가 이미 마감됐으면(다른 사람이 마감) 무시하고 지운다.
const RESUME_MAX_AGE_MS = 12 * 60 * 60 * 1000
export const resumeKey = (leagueId: string) => `record:${leagueId}:resume`
export function readResume(leagueId: string): ResumeEntry | null {
  try {
    const raw = window.localStorage.getItem(resumeKey(leagueId))
    if (!raw) return null
    const v = JSON.parse(raw) as ResumeEntry
    if (!v || typeof v.gameId !== 'string' || typeof v.date !== 'string') return null
    if (typeof v.savedAt !== 'number' || Date.now() - v.savedAt > RESUME_MAX_AGE_MS) return null
    return v
  } catch { return null }
}
export function writeResume(leagueId: string, v: ResumeEntry) {
  try { window.localStorage.setItem(resumeKey(leagueId), JSON.stringify(v)) } catch { /* 사생활 보호 모드 등 */ }
}
export function clearResume(leagueId: string, gameId?: string) {
  try {
    if (gameId) {
      const raw = window.localStorage.getItem(resumeKey(leagueId))
      if (raw && (JSON.parse(raw) as ResumeEntry | null)?.gameId !== gameId) return
    }
    window.localStorage.removeItem(resumeKey(leagueId))
  } catch { /* ignore */ }
}
export function fmtClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
