'use client'
// 매거진 본문 내 참조 (선수/팀/게임) 링크 컴포넌트
//
// 저장 형식:
//   본문 마크다운에 {{p:김로빈}} · {{t:락다운}} · {{g:2026-07-04}} 형태로 마커 저장
//   렌더 시 이 컴포넌트들로 변환
//
// 클릭 동작:
//   PlayerRef → PlayerQuickViewModal (팝업)
//   TeamRef   → 팀 프랜차이즈 관련 이동 (팀 구성 페이지)
//   GameRef   → DailyBoxscoreModal (팝업)

import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import PlayerQuickViewModal from '@/components/league/PlayerQuickViewModal'
import DailyBoxscoreModal from '@/components/league/DailyBoxscoreModal'
import Link from 'next/link'
import { useParams } from 'next/navigation'

interface PlayerLike {
  id: string
  name: string
  photo_url?: string | null
}

interface Props {
  leagueId: string
  /** name → { id, name, photo_url } — 이름으로 조회 */
  playerMap: Record<string, PlayerLike>
}

/** 선수명을 클릭 가능한 배지로 · 클릭 시 PlayerQuickViewModal */
export function PlayerRef({ name, leagueId, playerMap }: { name: string; leagueId: string; playerMap: Record<string, PlayerLike> }) {
  const [open, setOpen] = useState(false)
  const player = playerMap[name]
  if (!player) {
    // DB 에 없는 이름 → 그냥 텍스트 (마커 인식은 됐지만 매칭 실패)
    return <span className="text-blue-300 font-bold">{name}</span>
  }
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-blue-300 hover:text-blue-200 font-bold hover:bg-blue-500/10 transition-colors cursor-pointer align-baseline"
        title={`${name} 프로필 보기`}
      >
        {player.photo_url && (
          <img
            src={player.photo_url}
            alt={player.name}
            className="w-4 h-5 rounded object-cover object-top inline-block"
            style={{ verticalAlign: 'middle' }}
          />
        )}
        <span>{player.name}</span>
      </button>
      {open && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={player.id}
          playerName={player.name}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

/** 팀명을 클릭 가능한 컬러 배지로 · 팀 구성 페이지로 이동 */
export function TeamRef({ name, color }: { name: string; color?: string | null }) {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const teamColor = color ?? '#3b82f6'
  return (
    <Link
      href={`/league/${params.orgSlug}/${params.leagueId}/teams`}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md font-bold hover:opacity-90 transition-opacity"
      style={{ backgroundColor: `${teamColor}22`, color: teamColor }}
      title={`${name} 팀 페이지`}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: teamColor }} />
      {name}
    </Link>
  )
}

/** 게임 날짜 참조 · 클릭 시 DailyBoxscoreModal */
export function GameRef({ date, leagueId }: { date: string; leagueId: string }) {
  const [open, setOpen] = useState(false)
  const label = (() => {
    try {
      const d = new Date(date + 'T00:00:00')
      const days = ['일', '월', '화', '수', '목', '금', '토']
      return `${d.getMonth() + 1}/${d.getDate()}(${days[d.getDay()]})`
    } catch { return date }
  })()
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-amber-300 hover:text-amber-200 font-bold hover:bg-amber-500/10 transition-colors cursor-pointer align-baseline"
        title={`${date} 박스스코어 보기`}
      >
        <CalendarDays size={12} strokeWidth={2} aria-hidden /> {label}
      </button>
      {open && (
        <DailyBoxscoreModal
          leagueId={leagueId}
          date={date}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

export type { Props as MagazineRefsProps }
