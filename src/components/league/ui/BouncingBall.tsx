// 불러오는 중 — 튀는 농구공(2026-11-27 운영진 「우드톤」 농구 소품). 움직임 줄이기 설정이면 멈춘다(globals.css).
export default function BouncingBall({ label = '불러오는 중' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-1 py-2" role="status" aria-label={label}>
      <svg viewBox="0 0 24 24" className="mm-bounce-ball w-8 h-8" aria-hidden>
        <circle cx="12" cy="12" r="10.5" fill="#F08A24" stroke="#7A3B0C" strokeWidth="1.2" />
        <g fill="none" stroke="#7A3B0C" strokeWidth="1.2">
          <path d="M1.5 12h21M12 1.5v21" />
          <path d="M5 4.5c3 2.2 3 12.8 0 15M19 4.5c-3 2.2-3 12.8 0 15" />
        </g>
      </svg>
      <span className="mm-bounce-shadow block h-1 w-6 rounded-full" style={{ background: 'var(--mm-rule)' }} aria-hidden />
    </div>
  )
}
