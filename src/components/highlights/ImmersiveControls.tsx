'use client'
// 「전체화면 연속 재생」 조작부 (리그 하이라이트 피드 전용, 2026-10-13 · 2026-11-10 개편).
//
// 상태·재생 제어는 HighlightsPlayer 가 갖고, 여기는 그리기만 한다.
// 배경은 영상 위라 테마와 무관하게 검정/흰색 고정 — 토큰을 쓰지 않는다.
//
// ⚠ 2026-11-10 운영진: 조작부를 영상 **위에 겹치지 않는다** — YouTube 자체 버튼(가운데 재생·아래 막대)과 겹쳤다.
//   무대(stage)가 flex 라 이 띠는 영상 옆 빈 자리에 놓인다: 세로 화면 = 영상 아래, 가로 화면 = 영상 오른쪽.
//   늘 보이므로 「숨김·탭해서 보기」는 없앴다.
//   누를 때 손맛: 눌림(작아짐) + 퍼지는 고리 + 짧은 진동(되는 폰만) — `TapButton`.
import { useState, type ReactNode } from 'react'
import { X, SkipBack, SkipForward, Play, Pause, RotateCcw } from 'lucide-react'

interface Props {
  visible: boolean
  playing: boolean
  finished: boolean
  title: string
  subtitle?: string
  index: number
  total: number
  showRotateHint: boolean
  onReveal: () => void
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  onTogglePlay: () => void
  onRestart: () => void
  onDismissHint: () => void
  rate?: number
  onRate?: () => void
  onReplay?: () => void
  /** 가로 화면에서만 — 스코어보드 세로형(세로 화면은 영상 아래 띠로 따로 그린다) */
  scoreBug?: ReactNode
}

function buzz() {
  try { (navigator as Navigator & { vibrate?: (p: number) => boolean }).vibrate?.(12) } catch { /* ignore */ }
}

function TapButton({ onClick, disabled, label, className, style, children }: {
  onClick: () => void; disabled?: boolean; label: string; className: string; style?: React.CSSProperties; children: ReactNode
}) {
  const [pulse, setPulse] = useState(0)
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      onPointerDown={() => { if (!disabled) buzz() }}
      onClick={() => { setPulse(p => p + 1); onClick() }}
      className={`relative inline-flex items-center justify-center shrink-0 cursor-pointer select-none touch-manipulation
        transition-[transform,background-color] duration-100 ease-out active:scale-[0.86] active:brightness-125
        disabled:opacity-30 disabled:cursor-default disabled:active:scale-100
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fff] ${className}`}
      style={{ WebkitTapHighlightColor: 'transparent', ...style }}
    >
      {pulse > 0 && <span key={pulse} className="mm-tap-ring pointer-events-none absolute inset-0 rounded-full" aria-hidden />}
      {children}
    </button>
  )
}

const ROUND = 'rounded-full'

export default function ImmersiveControls({
  playing, finished, title, subtitle, index, total, showRotateHint,
  onClose, onPrev, onNext, onTogglePlay, onRestart, onDismissHint, rate = 1, onRate, onReplay, scoreBug,
}: Props) {
  return (
    <div
      className="relative z-30 w-full shrink-0 flex flex-col gap-3 px-4 pt-3
        landscape:w-[164px] landscape:h-full landscape:justify-center landscape:px-2 landscape:pt-0 landscape:gap-2"
      style={{
        color: '#fff',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
        paddingRight: 'max(8px, env(safe-area-inset-right, 0px))',
      }}
    >
      {scoreBug && <div className="hidden landscape:block landscape:order-first">{scoreBug}</div>}
      {/* 제목 · 순번 · 닫기 */}
      <div className="flex items-start gap-2 landscape:flex-col landscape:items-center landscape:text-center">
        <div className="min-w-0 flex-1 landscape:order-2">
          <div className="text-sm sm:text-base font-bold break-keep">{title}</div>
          {subtitle && <div className="text-xs break-keep landscape:hidden" style={{ color: 'rgba(255,255,255,0.7)' }}>{subtitle}</div>}
          <div className="mt-1 text-xs font-bold tabular-nums landscape:mt-0" style={{ color: 'rgba(255,255,255,0.7)' }} aria-label={`${total}개 중 ${index + 1}번째 클립`}>
            {index + 1} / {total}
          </div>
        </div>
        <TapButton onClick={onClose} label="전체화면 닫기" className={`${ROUND} w-11 h-11 landscape:w-9 landscape:h-9 landscape:order-1`} style={{ background: 'rgba(255,255,255,0.12)' }}>
          <X size={22} aria-hidden />
        </TapButton>
      </div>

      {/* 이전 · 재생/정지 · 다음 */}
      <div className="flex items-center justify-center gap-6 landscape:gap-1">
        <TapButton onClick={onPrev} disabled={index === 0} label="이전 클립" className={`${ROUND} w-14 h-14 landscape:w-10 landscape:h-10`} style={{ background: 'rgba(255,255,255,0.14)' }}>
          <SkipBack size={24} fill="currentColor" aria-hidden />
        </TapButton>
        {finished ? (
          <TapButton onClick={onRestart} label="처음 클립부터 다시 재생" className={`${ROUND} h-16 px-5 gap-2 text-sm font-bold`} style={{ background: '#fff', color: '#111' }}>
            <RotateCcw size={20} aria-hidden />
            처음부터
          </TapButton>
        ) : (
          <TapButton onClick={onTogglePlay} label={playing ? '일시정지' : '재생'} className={`${ROUND} w-16 h-16 landscape:w-12 landscape:h-12`} style={{ background: '#fff', color: '#111' }}>
            {playing ? <Pause size={28} fill="currentColor" aria-hidden /> : <Play size={28} fill="currentColor" className="ml-0.5" aria-hidden />}
          </TapButton>
        )}
        <TapButton onClick={onNext} disabled={index + 1 >= total} label="다음 클립" className={`${ROUND} w-14 h-14 landscape:w-10 landscape:h-10`} style={{ background: 'rgba(255,255,255,0.14)' }}>
          <SkipForward size={24} fill="currentColor" aria-hidden />
        </TapButton>
      </div>

      {(onRate || onReplay) && (
        <div className="flex justify-center gap-2">
          {onReplay && (
            <TapButton onClick={onReplay} label="이 장면 한 번 더" className={`${ROUND} h-10 landscape:h-9 px-3 gap-1 text-sm font-bold`} style={{ background: 'rgba(255,255,255,0.14)' }}>
              <RotateCcw size={15} aria-hidden />
              <span className="landscape:hidden">한 번 더</span>
            </TapButton>
          )}
          {onRate && <TapButton onClick={onRate} label={`재생 속도 ${rate}배 — 누르면 바뀌어요`} className={`${ROUND} h-10 landscape:h-9 px-4 text-sm font-black tabular-nums`}
            style={{ background: rate === 1 ? 'rgba(255,255,255,0.14)' : '#fff', color: rate === 1 ? '#fff' : '#111' }}>
            {rate}×
          </TapButton>}
        </div>
      )}

      {finished && (
        <p className="text-center text-xs font-bold break-keep" role="status" style={{ color: 'rgba(255,255,255,0.8)' }}>마지막 클립까지 봤어요</p>
      )}

      {/* iPhone 처럼 요소 전체화면이 안 되는 기기 — 세로일 때 한 번만 */}
      {showRotateHint && (
        <button
          type="button"
          onClick={onDismissHint}
          className="w-full px-4 py-3 text-sm font-bold text-center cursor-pointer break-keep landscape:hidden"
          style={{ background: 'rgba(255,255,255,0.94)', color: '#111', borderRadius: 12 }}
          role="status"
        >
          휴대폰을 가로로 돌리면 더 크게 볼 수 있어요
        </button>
      )}
    </div>
  )
}
