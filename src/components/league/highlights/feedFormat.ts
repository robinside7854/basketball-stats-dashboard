// 하이라이트 피드 날짜 표기 — 서버(피드 페이지)·클라이언트(칩) 공용이라 'use client' 모듈 밖에 둔다.
const DAYS = ['일', '월', '화', '수', '목', '금', '토']

/** '2026-10-10' → '10.10 (토)' · withYear 면 '2026. 10.10 (토)' */
export function formatFeedDate(iso: string, withYear = false): string {
  const d = new Date(iso + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return iso
  const base = `${d.getMonth() + 1}.${d.getDate()} (${DAYS[d.getDay()]})`
  return withYear ? `${d.getFullYear()}. ${base}` : base
}
