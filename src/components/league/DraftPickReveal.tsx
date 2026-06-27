'use client'
// 픽 이팩트 — 새 픽이 들어오면 전체화면으로 3초간 표시.
//
// 사용 패턴:
//   const [reveal, setReveal] = useState<PickRevealData | null>(null)
//   // picks 폴링 → 새 픽 감지 시 setReveal({...})
//   <DraftPickReveal data={reveal} onClose={() => setReveal(null)} />
//
// 표시:
//   - 검은 배경 풀스크린
//   - "PICK #N" 큰 숫자
//   - 팀 컬러 강조 + 팀명
//   - 선수 번호 + 이름 + 포지션
//   - 3초 후 자동 닫힘 (props.durationMs 로 조정 가능)

import { useEffect } from 'react'

export interface PickRevealData {
  pickNumber: number
  roundNumber: number
  teamName: string
  teamColor: string
  playerName: string
  playerNumber: number | null
  playerPosition: string | null
}

export default function DraftPickReveal({
  data,
  onClose,
  durationMs = 3000,
}: {
  data: PickRevealData | null
  onClose: () => void
  durationMs?: number
}) {
  useEffect(() => {
    if (!data) return
    const t = setTimeout(onClose, durationMs)
    return () => clearTimeout(t)
  }, [data, durationMs, onClose])

  if (!data) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md animate-fadeIn cursor-pointer"
      onClick={onClose}
      style={{ animation: 'fadeIn 0.25s ease-out' }}
    >
      <div
        className="relative w-[92vw] max-w-2xl rounded-3xl p-8 sm:p-12 shadow-2xl border-4 text-center overflow-hidden"
        style={{
          borderColor: data.teamColor,
          background: `linear-gradient(135deg, ${data.teamColor}26, ${data.teamColor}05, #0a0a0a)`,
          animation: 'pickPop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}
      >
        {/* 글로우 효과 */}
        <div
          className="absolute inset-0 opacity-30 blur-3xl -z-10"
          style={{ background: `radial-gradient(circle at center, ${data.teamColor}, transparent 70%)` }}
        />

        {/* 픽 번호 + 라운드 */}
        <div className="mb-4 flex items-center justify-center gap-3">
          <div className="text-xs font-bold tracking-[0.3em] uppercase text-gray-400">Round {data.roundNumber}</div>
          <div className="h-3 w-px bg-gray-700" />
          <div
            className="text-xs font-black tracking-[0.2em] uppercase px-3 py-1 rounded-full"
            style={{ background: data.teamColor, color: '#000' }}
          >
            Pick #{data.pickNumber}
          </div>
        </div>

        {/* 팀명 */}
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="w-3 h-3 rounded-full" style={{ background: data.teamColor }} />
          <p className="text-lg sm:text-xl font-bold text-white">{data.teamName}</p>
          <div className="w-3 h-3 rounded-full" style={{ background: data.teamColor }} />
        </div>

        {/* 선수 정보 — 메인 */}
        <div className="space-y-2">
          {data.playerNumber != null && (
            <p
              className="text-7xl sm:text-9xl font-black tracking-tighter leading-none"
              style={{ color: data.teamColor, fontFamily: 'var(--font-bebas, sans-serif)' }}
            >
              #{data.playerNumber}
            </p>
          )}
          <p className="text-3xl sm:text-5xl font-black text-white tracking-tight">{data.playerName}</p>
          {data.playerPosition && (
            <p className="text-base sm:text-lg font-bold text-gray-400 tracking-wider uppercase">
              {data.playerPosition.split(',').map(p => p.trim()).join(' · ')}
            </p>
          )}
        </div>

        <p className="mt-8 text-[10px] uppercase tracking-[0.3em] text-gray-600">탭하여 닫기</p>
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes pickPop {
          0% { transform: scale(0.7); opacity: 0; }
          60% { transform: scale(1.05); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
