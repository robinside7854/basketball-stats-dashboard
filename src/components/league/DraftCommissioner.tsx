'use client'
// 미라클 총무 — 픽셀 캐릭터 + 말풍선으로 드래프트 이벤트 중계.
//
// - 외부에서 setEvent({ key, text, durationMs }) 호출 → 캐릭터가 4~6초 말풍선 표시
// - 타입라이터 효과 (30ms/char); prefers-reduced-motion 일 때는 즉시 표시
// - 플로팅 위치: 모바일 bottom-left, 데스크탑 bottom-left (채팅 FAB 우측, 충돌 없음)
// - 캐릭터: 인라인 SVG 16x20 픽셀 그리드 — 정장 + 단순 도트 얼굴
//
// 부모가 1) 추첨 시작 / 결과 2) 픽 진행 / 반응 3) 드래프트 시작 / 종료 시 이벤트 푸시.

import { useEffect, useRef, useState } from 'react'

export interface CommissionerEvent {
  key: string                // 중복 발화 방지용 (예: "pick:7" / "lottery:start")
  text: string               // 표시할 멘트
  durationMs?: number        // 기본 5000
}

interface Props {
  event: CommissionerEvent | null
}

const DEFAULT_DURATION = 5000
const TYPE_SPEED_MS = 30

export default function DraftCommissioner({ event }: Props) {
  const [visible, setVisible] = useState(false)
  const [typed, setTyped] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const handledKeyRef = useRef<string | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const typeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // prefers-reduced-motion 체크
  const reducedMotion = useRef<boolean>(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedMotion.current = mq.matches
    const onChange = (e: MediaQueryListEvent) => { reducedMotion.current = e.matches }
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])

  useEffect(() => {
    if (!event || !event.text) return
    if (handledKeyRef.current === event.key) return
    handledKeyRef.current = event.key
    setVisible(true)
    setSpeaking(true)
    const duration = event.durationMs ?? DEFAULT_DURATION

    // 타입라이터 효과
    if (typeTimerRef.current) clearInterval(typeTimerRef.current)
    if (reducedMotion.current) {
      setTyped(event.text)
    } else {
      setTyped('')
      let i = 0
      const txt = event.text
      typeTimerRef.current = setInterval(() => {
        i++
        setTyped(txt.slice(0, i))
        if (i >= txt.length) {
          if (typeTimerRef.current) { clearInterval(typeTimerRef.current); typeTimerRef.current = null }
          setSpeaking(false)
        }
      }, TYPE_SPEED_MS)
    }

    // 자동 숨김
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(() => {
      setVisible(false)
      setSpeaking(false)
    }, duration)

    return () => {
      // 마운트 유지 — cleanup 은 다음 이벤트가 덮어쓸 때만
    }
  }, [event])

  useEffect(() => {
    // 언마운트 시 타이머 정리
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
      if (typeTimerRef.current) clearInterval(typeTimerRef.current)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      className="fixed bottom-4 left-4 z-30 flex items-end gap-2 pointer-events-none"
      style={{
        bottom: 'max(1rem, env(safe-area-inset-bottom))',
        maxWidth: 'calc(100vw - 5rem)',
      }}
      aria-live="polite"
      aria-atomic="true"
      aria-label="미라클 총무 안내"
    >
      <PixelCommissioner speaking={speaking} />
      <div
        className="relative rounded-lg bg-white text-gray-900 px-3 py-2 shadow-2xl border-2 border-gray-900 max-w-[240px] sm:max-w-[340px] min-w-0"
        style={{
          boxShadow: '4px 4px 0 0 rgba(0,0,0,0.6)',
        }}
        role="status"
      >
        {/* 말풍선 꼬리 */}
        <div className="absolute -left-2 bottom-3 w-0 h-0"
          style={{
            borderTop: '6px solid transparent',
            borderBottom: '6px solid transparent',
            borderRight: '10px solid #111827',
          }}
        />
        <div className="absolute -left-[6px] bottom-[14px] w-0 h-0"
          style={{
            borderTop: '4px solid transparent',
            borderBottom: '4px solid transparent',
            borderRight: '8px solid #ffffff',
          }}
        />
        <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-0.5">미라클 총무</p>
        <p className="text-sm sm:text-base font-bold leading-snug break-keep">
          {typed}
          {speaking && <span className="inline-block w-1.5 h-3 bg-gray-900 ml-0.5 animate-pulse align-middle" />}
        </p>
      </div>
    </div>
  )
}

/** 16x20 픽셀 캐릭터 — 정장 입은 단순한 미라클 총무 (인라인 SVG). */
function PixelCommissioner({ speaking }: { speaking: boolean }) {
  // 색 정의
  const SKIN = '#fcd5b5'
  const HAIR = '#1f2937'
  const SUIT = '#0f172a'
  const SHIRT = '#ffffff'
  const TIE = '#dc2626'
  const EYES = '#0f172a'
  // 픽셀 그리드 16열 × 20행
  // null = 투명, 문자열 = 색
  const G: (string | null)[][] = [
    // y=0..3 머리
    Array(16).fill(null).map((_, x) => (x >= 5 && x <= 10) ? HAIR : null),
    Array(16).fill(null).map((_, x) => (x >= 4 && x <= 11) ? HAIR : null),
    Array(16).fill(null).map((_, x) => (x >= 4 && x <= 11) ? (x === 4 || x === 11 ? HAIR : SKIN) : null),
    Array(16).fill(null).map((_, x) => (x >= 4 && x <= 11) ? SKIN : null),
    // y=4 눈
    Array(16).fill(null).map((_, x) => (x === 6 || x === 9) ? EYES : (x >= 4 && x <= 11 ? SKIN : null)),
    // y=5 볼
    Array(16).fill(null).map((_, x) => (x >= 4 && x <= 11) ? SKIN : null),
    // y=6 입 (speaking 시 살짝 열림)
    Array(16).fill(null).map((_, x) => {
      if (x >= 4 && x <= 11) {
        if (speaking && (x === 7 || x === 8)) return EYES
        if (!speaking && x === 7) return EYES
        return SKIN
      }
      return null
    }),
    // y=7 턱
    Array(16).fill(null).map((_, x) => (x >= 4 && x <= 11) ? SKIN : null),
    // y=8 목
    Array(16).fill(null).map((_, x) => (x >= 6 && x <= 9) ? SKIN : null),
    // y=9 정장 옷깃 시작
    Array(16).fill(null).map((_, x) => {
      if (x >= 3 && x <= 12) return SUIT
      return null
    }),
    // y=10 옷깃 + 흰 셔츠
    Array(16).fill(null).map((_, x) => {
      if (x === 3 || x === 12) return SUIT
      if (x >= 4 && x <= 5) return SUIT
      if (x >= 10 && x <= 11) return SUIT
      if (x >= 6 && x <= 9) return SHIRT
      return null
    }),
    // y=11 넥타이 시작
    Array(16).fill(null).map((_, x) => {
      if (x === 2 || x === 13) return SUIT
      if (x >= 3 && x <= 5) return SUIT
      if (x >= 10 && x <= 12) return SUIT
      if (x === 7 || x === 8) return TIE
      if (x === 6 || x === 9) return SHIRT
      return null
    }),
    // y=12 넥타이 + 정장
    Array(16).fill(null).map((_, x) => {
      if (x === 2 || x === 13) return SUIT
      if (x >= 3 && x <= 6) return SUIT
      if (x >= 9 && x <= 12) return SUIT
      if (x === 7 || x === 8) return TIE
      return null
    }),
    // y=13 가슴 부분
    Array(16).fill(null).map((_, x) => {
      if (x === 2 || x === 13) return SUIT
      if (x >= 3 && x <= 12) return (x === 7 || x === 8) ? TIE : SUIT
      return null
    }),
    // y=14~18 몸통
    Array(16).fill(null).map((_, x) => (x >= 2 && x <= 13) ? SUIT : null),
    Array(16).fill(null).map((_, x) => (x >= 2 && x <= 13) ? SUIT : null),
    Array(16).fill(null).map((_, x) => (x >= 2 && x <= 13) ? SUIT : null),
    Array(16).fill(null).map((_, x) => (x >= 2 && x <= 13) ? SUIT : null),
    Array(16).fill(null).map((_, x) => (x >= 2 && x <= 13) ? SUIT : null),
    // y=19 베이스
    Array(16).fill(null).map((_, x) => (x >= 2 && x <= 13) ? SUIT : null),
  ]
  const PX = 4 // 픽셀당 SVG 유닛
  return (
    <div className="shrink-0 pointer-events-none" style={{ width: 16 * PX, height: 20 * PX, filter: 'drop-shadow(2px 2px 0 rgba(0,0,0,0.4))' }}>
      <svg width={16 * PX} height={20 * PX} viewBox={`0 0 ${16 * PX} ${20 * PX}`} shapeRendering="crispEdges">
        {G.map((row, y) => row.map((col, x) => col ? (
          <rect key={`${x}-${y}`} x={x * PX} y={y * PX} width={PX} height={PX} fill={col} />
        ) : null))}
      </svg>
    </div>
  )
}
