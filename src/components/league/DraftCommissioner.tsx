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
import { X } from 'lucide-react'

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
  // 사용자가 X 로 직접 닫음. 같은 event 동안은 다시 안 뜸; 새 event 가 오면 자동 false 로 리셋.
  const [dismissed, setDismissed] = useState(false)
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
    // 새 이벤트 — 이전 dismiss 상태 해제하고 자동 재등장
    setDismissed(false)
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

  if (!visible || dismissed) return null

  return (
    <div
      className="fixed bottom-4 left-3 sm:left-4 z-[110] flex items-end gap-2 pointer-events-none"
      style={{
        // 모바일에서 채팅 FAB(우측 56px) + safe area 고려하여 commissioner 가 차지할 수 있는 폭 제한.
        // z-[110]: DraftPickReveal(z-[100]) · DraftLotteryReveal(z-58) 위에 떠
        // 픽 발표·추첨 진행 중에도 NBA 중계처럼 캐릭터 멘트가 항상 보이도록 한다.
        // 채팅 패널(z-40)·sonner(z-99999) 와는 충돌하지 않음(좌하단 코너 + pointer-events-none).
        // 외부 래퍼는 pointer-events-none — X 버튼만 pointer-events-auto 로 켜 본문 클릭을 막지 않음.
        bottom: 'max(1rem, env(safe-area-inset-bottom))',
        left: 'max(0.75rem, env(safe-area-inset-left))',
        maxWidth: 'min(calc(100vw - 6rem), 380px)',
      }}
      aria-live="polite"
      aria-atomic="true"
      aria-label="미라클 총무 안내"
    >
      <PixelCommissioner speaking={speaking} />
      <div
        className="relative rounded-lg bg-white text-gray-900 px-2.5 py-1.5 sm:px-3 sm:py-2 pr-7 sm:pr-8 shadow-2xl border-2 border-gray-900 max-w-[220px] sm:max-w-[320px] min-w-0"
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
        {/* X 닫기 버튼 — 사용자가 직접 끄려는 의도일 때만 활성화.
            새 event 가 들어오면 자동으로 다시 표시되므로 영구 차단이 아닌 "현재 멘트만 끄기". */}
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="총무 말풍선 닫기"
          className="pointer-events-auto absolute top-1 right-1 w-5 h-5 sm:w-6 sm:h-6 inline-flex items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700 hover:text-gray-900 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <X size={12} />
        </button>
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
