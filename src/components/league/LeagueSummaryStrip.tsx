// 홈 랜딩용 "한눈 요약 스트립" — 처음 방문한 사용자에게 3초 안에 상황을 알려줌.
// 3개 카드:
//   1) 다음 경기 (예정) 또는 최근 경기 결과
//   2) 시즌 지표 (경기 수 / 선수 수 / 팀 수)
//   3) 첫 방문자 가이드 (탐색·편집·검색)
// 서버 컴포넌트 — 계산은 홈 페이지에서 넘겨받음.

import { CalendarClock, BarChart3, Compass, Trophy, Users, Lock, Search, ChevronRight } from 'lucide-react'
import Link from 'next/link'

export type SummaryData = {
  nextGame: {
    date: string  // YYYY-MM-DD
    homeName: string; homeColor: string
    awayName: string; awayColor: string
    homeScore?: number | null
    awayScore?: number | null
    isComplete: boolean
    isStarted: boolean
  } | null
  seasonStats: {
    gamesPlayed: number
    gamesTotal: number
    playerCount: number
    teamCount: number
  }
}

type Props = {
  data: SummaryData
  orgSlug: string
  leagueId: string
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`
}

export default function LeagueSummaryStrip({ data, orgSlug, leagueId }: Props) {
  const { nextGame, seasonStats } = data
  const base = `/league/${orgSlug}/${leagueId}`
  const progressPct = seasonStats.gamesTotal > 0
    ? Math.round((seasonStats.gamesPlayed / seasonStats.gamesTotal) * 100)
    : 0

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 lg:gap-4">
      {/* 카드 1 — 다음 경기 / 최근 결과 */}
      <Link
        href={`${base}/schedule`}
        className="group relative rounded-2xl border border-gray-800 bg-gray-900/60 hover:bg-gray-900 hover:border-gray-700 p-4 lg:p-5 transition-all cursor-pointer btn-press overflow-hidden"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 flex items-center gap-1.5">
            <CalendarClock size={12} />
            {nextGame && !nextGame.isComplete ? '다음 경기' : nextGame?.isComplete ? '최근 경기' : '경기 일정'}
          </span>
          <ChevronRight size={14} className="text-gray-600 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all" />
        </div>
        {nextGame ? (
          <div>
            <p className="text-xs text-gray-500 mb-2">{fmtDate(nextGame.date)}</p>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: nextGame.homeColor }} />
                <span className="text-sm font-bold text-white truncate">{nextGame.homeName}</span>
              </div>
              {nextGame.isComplete && nextGame.homeScore != null && (
                <span className="text-sm font-bold text-white">{nextGame.homeScore}</span>
              )}
            </div>
            <p className="text-[10px] text-gray-600 my-1 text-center">VS</p>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: nextGame.awayColor }} />
                <span className="text-sm font-bold text-white truncate">{nextGame.awayName}</span>
              </div>
              {nextGame.isComplete && nextGame.awayScore != null && (
                <span className="text-sm font-bold text-white">{nextGame.awayScore}</span>
              )}
            </div>
          </div>
        ) : (
          <div className="py-4">
            <p className="text-sm text-gray-400">예정된 경기 없음</p>
            <p className="text-xs text-gray-600 mt-1">일정 탭에서 확인해 보세요</p>
          </div>
        )}
      </Link>

      {/* 카드 2 — 시즌 지표 */}
      <Link
        href={`${base}/stats`}
        className="group relative rounded-2xl border border-gray-800 bg-gray-900/60 hover:bg-gray-900 hover:border-gray-700 p-4 lg:p-5 transition-all cursor-pointer btn-press"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-1.5">
            <BarChart3 size={12} />
            시즌 지표
          </span>
          <ChevronRight size={14} className="text-gray-600 group-hover:text-gray-300 group-hover:translate-x-0.5 transition-all" />
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div>
            <div className="text-lg lg:text-xl font-black text-white leading-none">{seasonStats.gamesPlayed}<span className="text-xs text-gray-500 font-medium">/{seasonStats.gamesTotal}</span></div>
            <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-0.5"><Trophy size={9} />경기</div>
          </div>
          <div>
            <div className="text-lg lg:text-xl font-black text-white leading-none">{seasonStats.playerCount}</div>
            <div className="text-[10px] text-gray-500 mt-1 flex items-center gap-0.5"><Users size={9} />선수</div>
          </div>
          <div>
            <div className="text-lg lg:text-xl font-black text-white leading-none">{seasonStats.teamCount}</div>
            <div className="text-[10px] text-gray-500 mt-1">팀</div>
          </div>
        </div>
        {/* 진행률 바 */}
        {seasonStats.gamesTotal > 0 && (
          <div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-600 mt-1.5">시즌 진행률 {progressPct}%</p>
          </div>
        )}
      </Link>

      {/* 카드 3 — 첫 방문자 가이드 */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-4 lg:p-5">
        <div className="mb-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
            <Compass size={12} />
            둘러보기
          </span>
        </div>
        <ul className="space-y-2 text-xs">
          <li className="flex items-start gap-2 text-gray-400">
            <Search size={12} className="mt-0.5 text-gray-500 shrink-0" />
            <span>상단 <kbd className="text-[10px] text-gray-500 bg-gray-800 border border-gray-700 rounded px-1">⌘K</kbd> 로 선수 이름 검색</span>
          </li>
          <li className="flex items-start gap-2 text-gray-400">
            <BarChart3 size={12} className="mt-0.5 text-gray-500 shrink-0" />
            <Link href={`${base}/stats`} className="hover:text-white underline-offset-2 hover:underline">
              스탯 탭에서 리더보드·순위 확인
            </Link>
          </li>
          <li className="flex items-start gap-2 text-gray-400">
            <Lock size={12} className="mt-0.5 text-gray-500 shrink-0" />
            <span>편집자는 우측 상단 <span className="text-gray-300">편집</span> 버튼으로 로그인</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
