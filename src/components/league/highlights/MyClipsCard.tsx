'use client'
// 하이라이트 첫 화면의 「내 클립」 카드 (2026-10-26) — 로그인한 승인 회원에게만, 날짜 카드 격자의 첫 칸.
//   · 숫자는 서버가 그 선수 피드(loadPlayerHighlights — 「?player=」 화면과 같은 클립 정의)에서 센
//     「내 클립이 있는 가장 최근 경기일」과 그날 클립 수. 여기서 다시 세지 않는다.
//   · NEW = 그 날짜가 이 브라우저에서 마지막으로 본 내 클립 날짜보다 뒤일 때.
//     기억은 localStorage `hl:<leagueId>:lastSeenMine` (YYYY-MM-DD) — 카드를 누르거나 내 클립 화면을 열면 갱신.
//     저장소가 막혀 있으면 NEW 를 띄우지 않는다(매번 NEW 가 뜨면 신호가 아니다).
//   · NEW 판정은 마운트 뒤에 한다 — 서버 HTML 과 첫 화면이 어긋나지 않게.
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PlayCircle } from 'lucide-react'
import { formatFeedDate } from './feedFormat'

const seenKey = (leagueId: string) => `hl:${leagueId}:lastSeenMine`

function readSeen(leagueId: string): string | null | undefined {
  try { return localStorage.getItem(seenKey(leagueId)) } catch { return undefined }
}
function writeSeen(leagueId: string, date: string) {
  try {
    const prev = localStorage.getItem(seenKey(leagueId))
    if (!prev || prev < date) localStorage.setItem(seenKey(leagueId), date)
  } catch { /* 저장소 막힘 — NEW 를 기억하지 못할 뿐 */ }
}

export default function MyClipsCard({
  leagueId, href, date, count, thumbVideoId,
}: {
  leagueId: string
  href: string
  /** 내 클립이 있는 가장 최근 경기일 */
  date: string
  /** 그날 내 클립 수 */
  count: number
  thumbVideoId: string | null
}) {
  const [isNew, setIsNew] = useState(false)
  useEffect(() => {
    const seen = readSeen(leagueId)
    // undefined = 저장소 사용 불가 → 표시하지 않음 · null = 처음 → 새 소식으로 본다
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 브라우저 저장소는 마운트 뒤에만 읽을 수 있다
    setIsNew(seen !== undefined && (seen === null || seen < date))
  }, [leagueId, date])

  const label = formatFeedDate(date)
  return (
    <Link
      href={href}
      scroll
      onClick={() => writeSeen(leagueId, date)}
      className="group block overflow-hidden mm-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
      style={{ background: 'var(--mm-panel)', border: '2px solid var(--mm-yellow)', borderRadius: 'var(--mm-radius-card)' }}
      aria-label={`내 클립 보기 — 지난 경기일 ${label} ${count}개${isNew ? ', 새 클립' : ''}`}
    >
      <div className="relative aspect-video overflow-hidden" style={{ background: 'var(--mm-panel-alt)' }}>
        {thumbVideoId && (
          // eslint-disable-next-line @next/next/no-img-element -- YouTube 썸네일(외부 호스트)
          <img
            src={`https://i.ytimg.com/vi/${thumbVideoId}/mqdefault.jpg`}
            alt=""
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <span className="absolute inset-0 flex items-center justify-center" style={{ background: thumbVideoId ? 'rgba(0,0,0,0.25)' : undefined }} aria-hidden>
          <PlayCircle
            size={40}
            strokeWidth={1.75}
            style={{ color: 'var(--mm-yellow)' }}
            className="transition-transform group-hover:scale-110 drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)]"
          />
        </span>
        {isNew && (
          <span
            className="absolute top-2 left-2 text-xs font-black px-2 py-0.5"
            style={{ background: 'var(--mm-live-bg)', color: '#fff', borderRadius: 'var(--mm-radius-chip)' }}
            aria-hidden
          >
            NEW
          </span>
        )}
        <span
          className="absolute bottom-2 right-2 text-xs font-bold px-2 py-0.5 tabular-nums"
          style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: 'var(--mm-radius-chip)' }}
          aria-hidden
        >
          {count}클립
        </span>
      </div>
      <div className="p-3 space-y-1">
        <div className="font-black text-lg" style={{ color: 'var(--mm-ink)' }}>내 클립</div>
        <p className="text-xs font-semibold" style={{ color: 'var(--mm-muted)' }}>
          지난 경기일 <span style={{ color: 'var(--mm-ink)' }}>{label}</span> · <b className="tabular-nums" style={{ color: 'var(--mm-ink)' }}>{count}개</b>
        </p>
      </div>
    </Link>
  )
}

/** 내 클립 화면(?player=나)을 열었을 때 — 지금까지 본 것으로 기억해 둔다 */
export function MarkMyClipsSeen({ leagueId, date }: { leagueId: string; date: string }) {
  useEffect(() => { writeSeen(leagueId, date) }, [leagueId, date])
  return null
}
