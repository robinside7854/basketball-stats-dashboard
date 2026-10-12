import { ChevronLeft, Loader2, RefreshCw } from 'lucide-react'

// 날짜 헤더 + YouTube 연동 (1행)
export default function DateHeader({
  orgSlug, leagueId, dateLabel, isTournament, leagueYtChannel, ytSyncing, syncYoutube,
}: {
  orgSlug: string
  leagueId: string
  dateLabel: string
  isTournament: boolean
  leagueYtChannel: string | null
  ytSyncing: boolean
  syncYoutube: () => void
}) {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <a
        href={`/league/${orgSlug}/${leagueId}/schedule`}
        className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] transition-colors cursor-pointer shrink-0"
        style={{ color: 'var(--mm-muted)' }}
        aria-label="일정으로 돌아가기"
      >
        <ChevronLeft size={20} />
      </a>
      <h2
        className="font-black text-xl"
        style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
      >
        {dateLabel} 경기 기록
      </h2>
      {/* YouTube 자동 연동 — 제목의 `경기 N` 을 그날 슬롯 N 에 꽂는 **리그 전용** 기능이다.
          대회에서는 감춘다: 슬롯 번호에 의미가 없고 촬영본이 쿼터로 쪼개져 있어, 돌리면
          엉뚱한 자리에 조용히 붙는다(2026-08-22 사고). 서버(syncYoutubeForLeague)도 같이 막혀 있다 —
          여기서만 감추면 cron·경기시작 훅으로 되살아난다. */}
      {!isTournament && (
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {leagueYtChannel && (
            <span className="text-xs font-mono hidden sm:inline" style={{ color: 'var(--mm-muted)' }}>{leagueYtChannel}</span>
          )}
          <button
            onClick={() => syncYoutube()}
            disabled={ytSyncing}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] min-w-[44px] rounded-lg text-xs font-medium bg-red-700 hover:bg-red-600 text-[#fff] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            aria-label="YouTube 연동"
          >
            {ytSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            <span className="hidden sm:inline">YouTube 연동</span>
          </button>
        </div>
      )}
    </div>
  )
}
