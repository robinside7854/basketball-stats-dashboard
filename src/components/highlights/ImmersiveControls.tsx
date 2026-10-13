'use client'
// 「전체화면 연속 재생」 오버레이의 조작부 (리그 하이라이트 피드 전용, 2026-10-13).
//
// 상태·재생 제어는 HighlightsPlayer 가 갖고, 여기는 그리기만 한다.
// 배경은 영상 위라 테마와 무관하게 검정/흰색 고정 — 토큰을 쓰지 않는다.
//
// 탭 동작
//   · 숨김 상태: 화면 전체를 덮는 투명 버튼이 탭을 받아 조작부를 띄운다 (iframe 이 탭을 삼키므로)
//   · 보임 상태: 덮개를 걷는다 → 가운데·아래 영역 탭은 YouTube 자체 컨트롤(전체화면 버튼 포함)로 간다
//     우리 조작부는 위(닫기·제목·순번)와 가운데(이전·재생·다음)에만 둔다 — YouTube 하단 막대를 가리지 않게.
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
}

const BTN =
  'inline-flex items-center justify-center min-h-[44px] min-w-[44px] cursor-pointer transition-transform duration-150 ' +
  'active:scale-[0.94] disabled:opacity-35 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fff]'

export default function ImmersiveControls({
  visible, playing, finished, title, subtitle, index, total, showRotateHint,
  onReveal, onClose, onPrev, onNext, onTogglePlay, onRestart, onDismissHint,
}: Props) {
  const show = visible || finished
  return (
    <>
      {/* 숨김 상태의 탭 받이 */}
      {!show && (
        <button
          type="button"
          onClick={onReveal}
          className="absolute inset-0 z-20 cursor-default"
          style={{ background: 'transparent' }}
          aria-label="재생 조작 보기"
        />
      )}

      {/* 위 — 닫기 · 제목 · 순번 */}
      <div
        className="absolute top-0 inset-x-0 z-30 flex items-center gap-2 transition-opacity duration-200"
        style={{
          opacity: show ? 1 : 0,
          pointerEvents: show ? 'auto' : 'none',
          color: '#fff',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.78) 0%, rgba(0,0,0,0.45) 65%, rgba(0,0,0,0) 100%)',
          paddingTop: 'max(6px, env(safe-area-inset-top, 0px))',
          paddingLeft: 'max(6px, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(10px, env(safe-area-inset-right, 0px))',
          paddingBottom: 18,
        }}
        aria-hidden={!show}
      >
        <button type="button" onClick={onClose} className={`${BTN} rounded-full`} aria-label="전체화면 닫기" tabIndex={show ? 0 : -1}>
          <X size={26} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-sm sm:text-base font-bold truncate">{title}</div>
          {subtitle && <div className="text-xs truncate" style={{ color: 'rgba(255,255,255,0.75)' }}>{subtitle}</div>}
        </div>
        <span
          className="shrink-0 text-sm font-bold tabular-nums px-2 py-0.5"
          style={{ background: 'rgba(255,255,255,0.16)', borderRadius: 999 }}
          aria-label={`${total}개 중 ${index + 1}번째 클립`}
        >
          {index + 1} / {total}
        </span>
      </div>

      {/* 가운데 — 이전 · 재생/정지 · 다음 */}
      <div
        className="absolute inset-x-0 top-1/2 -translate-y-1/2 z-30 flex items-center justify-center gap-6 sm:gap-10 transition-opacity duration-200 pointer-events-none"
        style={{ opacity: show ? 1 : 0, color: '#fff' }}
        aria-hidden={!show}
      >
        <button
          type="button"
          onClick={onPrev}
          disabled={index === 0}
          className={`${BTN} rounded-full w-14 h-14`}
          style={{ background: 'rgba(0,0,0,0.5)', pointerEvents: show ? 'auto' : 'none' }}
          aria-label="이전 클립"
          tabIndex={show ? 0 : -1}
        >
          <SkipBack size={26} fill="currentColor" aria-hidden />
        </button>
        {finished ? (
          <button
            type="button"
            onClick={onRestart}
            className={`${BTN} rounded-full h-16 px-5 gap-2 text-sm font-bold`}
            style={{ background: 'rgba(0,0,0,0.6)', border: '1.5px solid rgba(255,255,255,0.7)', pointerEvents: show ? 'auto' : 'none' }}
            aria-label="처음 클립부터 다시 재생"
            tabIndex={show ? 0 : -1}
          >
            <RotateCcw size={22} aria-hidden />
            처음부터
          </button>
        ) : (
          <button
            type="button"
            onClick={onTogglePlay}
            className={`${BTN} rounded-full w-16 h-16`}
            style={{ background: 'rgba(0,0,0,0.6)', border: '1.5px solid rgba(255,255,255,0.7)', pointerEvents: show ? 'auto' : 'none' }}
            aria-label={playing ? '일시정지' : '재생'}
            tabIndex={show ? 0 : -1}
          >
            {playing ? <Pause size={30} fill="currentColor" aria-hidden /> : <Play size={30} fill="currentColor" aria-hidden />}
          </button>
        )}
        <button
          type="button"
          onClick={onNext}
          disabled={index + 1 >= total}
          className={`${BTN} rounded-full w-14 h-14`}
          style={{ background: 'rgba(0,0,0,0.5)', pointerEvents: show ? 'auto' : 'none' }}
          aria-label="다음 클립"
          tabIndex={show ? 0 : -1}
        >
          <SkipForward size={26} fill="currentColor" aria-hidden />
        </button>
      </div>

      {finished && (
        <div
          className="absolute inset-x-0 z-30 flex justify-center pointer-events-none"
          style={{ top: 'calc(50% + 52px)', color: '#fff' }}
          role="status"
        >
          <span className="text-sm font-bold px-3 py-1" style={{ background: 'rgba(0,0,0,0.6)', borderRadius: 999 }}>
            마지막 클립까지 봤어요
          </span>
        </div>
      )}

      {/* iPhone 처럼 요소 전체화면이 안 되는 기기 — 세로일 때 한 번만 */}
      {showRotateHint && (
        <button
          type="button"
          onClick={onDismissHint}
          className="absolute inset-x-0 z-40 mx-auto w-fit max-w-[calc(100%-32px)] px-4 py-3 text-sm font-bold text-center cursor-pointer"
          style={{
            bottom: 'max(24px, calc(env(safe-area-inset-bottom, 0px) + 16px))',
            background: 'rgba(255,255,255,0.94)',
            color: '#111',
            borderRadius: 12,
            boxShadow: '0 6px 24px rgba(0,0,0,0.45)',
          }}
          role="status"
        >
          휴대폰을 가로로 돌리면 더 크게 볼 수 있어요
          <span className="block text-xs font-semibold mt-0.5" style={{ color: '#555' }}>
            영상 오른쪽 아래 YouTube 전체화면 버튼도 쓸 수 있어요
          </span>
        </button>
      )}
    </>
  )
}
