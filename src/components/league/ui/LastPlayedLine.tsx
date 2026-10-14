// 「마지막 출전 10.11 (토) · 3일 전」 + 「이후 경기일 N번 결장」 칩 (2026-10-14).
//   /me(PersonalDashboard) · 선수 카드(PlayerQuickViewModal) 공용 — 문구는 lib/format/lastPlayed.ts 하나.
//   연속 결장 3경기일↑ 이면 칩만 노랑(accent) — 빨강(negative)은 「잘못」처럼 읽혀 과하다.
import { CalendarClock } from 'lucide-react'
import Chip from './Chip'
import { formatLastPlayed, type LastPlayedData } from '@/lib/format/lastPlayed'

export default function LastPlayedLine({
  lastPlayed, className = '',
}: { lastPlayed: LastPlayedData | null | undefined; className?: string }) {
  const { text, missedText, warn } = formatLastPlayed(lastPlayed)
  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 ${className}`}>
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-[color:var(--mm-ink-soft)] tabular-nums">
        <CalendarClock size={12} aria-hidden className="shrink-0" />
        {text}
      </span>
      {missedText && <Chip tone={warn ? 'accent' : 'neutral'}>{missedText}</Chip>}
    </div>
  )
}
