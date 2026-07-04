'use client'
// 서브탭 간 좌우 스와이프 네비게이션 래퍼 (+ 전환 애니메이션)
//
// 사용:
//   <SubTabSwipeArea group="squad" current="roster">
//     {페이지 컨텐츠}
//   </SubTabSwipeArea>
//
// 동작:
//   - 가로 드래그 시 컨텐츠가 손가락을 따라 이동 + 이동할 탭 이름 힌트 배지 표시
//   - 스와이프 확정 → 슬라이드 아웃 후 router.push → 새 페이지는 반대편에서 슬라이드 인
//   - 이동할 탭이 없는 방향은 고무줄 저항(0.25배)만 주고 원위치
//   - 축 잠금: 첫 이동이 세로면 그 제스처 동안 가로 추종·전환 완전 비활성 (세로 스크롤 보호)
//   - 가로 스크롤 컨테이너(테이블·칩 목록) 내부에서 시작한 터치는 무시 (guardHorizontalScroll)
//   - 화면 좌우 엣지 24px 는 브라우저 back 제스처와 충돌 회피 (useSwipe edgeGuard)
//
// 그룹 정의는 LeagueSubTabs 와 동기 유지 필요

import { useRouter, useParams } from 'next/navigation'
import { useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useSwipe } from '@/hooks/useSwipe'

const GROUPS: Record<string, { seg: string; label: string }[]> = {
  squad: [
    { seg: 'roster', label: '선수 명단' },
    { seg: 'teams', label: '팀 구성' },
  ],
  games: [
    { seg: 'schedule', label: '일정' },
    { seg: 'record', label: '경기 기록' },
  ],
}

// 스와이프로 떠나는 페이지가 목적지 페이지에 진입 방향을 전달 (클라이언트 라우팅 한정)
let pendingEnterDir: 'left' | 'right' | null = null

// 슬라이드 아웃 시간 — 이 시간 뒤 router.push
const EXIT_MS = 160

interface Props {
  group: 'squad' | 'games'
  /** 현재 활성 서브탭 세그먼트 (예: 'roster') */
  current: string
  children: React.ReactNode
}

export default function SubTabSwipeArea({ group, current, children }: Props) {
  const router = useRouter()
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const items = GROUPS[group]
  const idx = items.findIndex(t => t.seg === current)

  const next = idx >= 0 && idx < items.length - 1 ? items[idx + 1] : null
  const prev = idx > 0 ? items[idx - 1] : null

  const [dragX, setDragX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [exiting, setExiting] = useState(false)
  const exitingRef = useRef(false)
  // 첫 이동 방향으로 축 고정 — 세로 스크롤 중 컨텐츠가 좌우로 흔들리는 것 방지
  const axisRef = useRef<'x' | 'y' | null>(null)
  // 직전 페이지에서 스와이프로 진입했으면 반대편에서 슬라이드 인
  const [enterDir] = useState(() => {
    const d = pendingEnterDir
    pendingEnterDir = null
    return d
  })

  const confirmSwipe = (dir: 'left' | 'right') => {
    const target = dir === 'left' ? next : prev
    if (!target || axisRef.current !== 'x' || exitingRef.current) return
    exitingRef.current = true
    setExiting(true)
    setDragX(dir === 'left' ? -window.innerWidth : window.innerWidth)
    setTimeout(() => {
      pendingEnterDir = dir
      router.push(`/league/${params.orgSlug}/${params.leagueId}/${target.seg}`)
    }, EXIT_MS)
  }

  const swipe = useSwipe({
    threshold: 60,
    edgeGuardPx: 24,  // iOS 뒤로가기 스와이프 회피 (좌 엣지)
    guardHorizontalScroll: true,  // 가로 스크롤 테이블 위 제스처와 충돌 방지
    onSwipeLeft: () => confirmSwipe('left'),
    onSwipeRight: () => confirmSwipe('right'),
    onDrag: (dx, dy) => {
      if (!axisRef.current && Math.max(Math.abs(dx), Math.abs(dy)) > 12) {
        axisRef.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
      }
      if (axisRef.current !== 'x' || exitingRef.current) return
      setDragging(true)
      const target = dx < 0 ? next : prev
      setDragX(target ? dx : dx * 0.25)  // 이동할 탭 없으면 고무줄 저항
    },
    onDragEnd: () => {
      axisRef.current = null
      setDragging(false)
      if (!exitingRef.current) setDragX(0)  // 임계값 미달 → 원위치 스냅백
    },
  })

  // 드래그 중 이동할 탭 이름 힌트 (드래그가 깊어질수록 선명)
  const hintTarget = dragX < 0 ? next : prev
  const showHint = dragging && !!hintTarget && Math.abs(dragX) > 24

  return (
    // touch-pan-y — 세로 스크롤은 브라우저에 위임, 가로만 우리가 감지
    <div className="touch-pan-y" {...swipe}>
      {showHint && hintTarget && (
        <div
          className={`fixed top-1/2 -translate-y-1/2 z-40 pointer-events-none flex items-center gap-1 px-3.5 py-2 rounded-full bg-gray-900/95 border border-gray-700 shadow-2xl text-sm font-bold text-white ${dragX < 0 ? 'right-2' : 'left-2'}`}
          style={{ opacity: Math.min(1, (Math.abs(dragX) - 24) / 50) }}
        >
          {dragX > 0 && <ChevronLeft size={15} className="text-blue-400" />}
          {hintTarget.label}
          {dragX < 0 && <ChevronRight size={15} className="text-blue-400" />}
        </div>
      )}
      <div
        className={
          enterDir === 'left' ? 'subtab-enter-from-right'
            : enterDir === 'right' ? 'subtab-enter-from-left'
            : undefined
        }
        style={{
          // dragX=0 일 땐 transform 제거 — 남겨두면 하위 position:fixed 모달의 기준이 뷰포트가 아니게 됨
          transform: dragX !== 0 ? `translateX(${dragX}px)` : undefined,
          opacity: exiting ? 0 : undefined,
          transition: dragging ? 'none' : `transform ${EXIT_MS}ms ease-out, opacity ${EXIT_MS}ms ease-out`,
        }}
      >
        {children}
      </div>
    </div>
  )
}
