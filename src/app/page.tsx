import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="fixed inset-0 flex flex-col sm:flex-row overflow-hidden z-10">

      {/* ── 청년부 (좌) ── */}
      <Link
        href="/youth"
        className="group relative flex-1 flex flex-col items-center justify-center gap-6 cursor-pointer overflow-hidden bg-gray-950"
      >
        {/* 배경 그라디언트 */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-900/60 via-blue-950/30 to-gray-950 transition-all duration-500 group-hover:from-blue-800/70 group-hover:via-blue-900/40" />

        {/* 좌측 엣지 라인 */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-500/0 via-blue-500/80 to-blue-500/0 opacity-60 group-hover:opacity-100 transition-opacity" />

        {/* 배경 큰 텍스트 워터마크 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          <span className="text-[20vw] sm:text-[12vw] font-black text-blue-500/5 group-hover:text-blue-500/8 transition-all duration-500 leading-none">
            YOUTH
          </span>
        </div>

        {/* 콘텐츠 */}
        <div className="relative z-10 flex flex-col items-center gap-5 text-center px-8">
          <div className="text-7xl sm:text-8xl drop-shadow-2xl transition-transform duration-300 group-hover:scale-110">
            ⚡
          </div>
          <div>
            <div className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-2">
              청년부
            </div>
            <div className="text-blue-400 font-semibold text-lg tracking-widest uppercase">
              Youth Team
            </div>
          </div>
          <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-blue-500/20 border border-blue-500/40 text-blue-300 text-sm font-semibold group-hover:bg-blue-500/30 group-hover:border-blue-400/60 transition-all">
            입장하기 <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* 하단 바 */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </Link>

      {/* ── 중앙 구분선 ── */}
      <div className="relative hidden sm:flex flex-col items-center justify-center w-px bg-gray-800 shrink-0 z-10">
        <div className="absolute inset-y-0 w-px bg-gradient-to-b from-transparent via-gray-600 to-transparent" />
        <div className="relative bg-gray-900 border border-gray-700 rounded-full w-10 h-10 flex items-center justify-center shadow-lg z-20">
          <span className="text-lg">🏀</span>
        </div>
      </div>

      {/* 모바일 구분선 */}
      <div className="flex sm:hidden items-center gap-3 px-8 py-1 bg-gray-900 z-10 border-y border-gray-800">
        <div className="flex-1 h-px bg-gray-700" />
        <span className="text-gray-500 text-xs font-semibold tracking-widest">VS</span>
        <div className="flex-1 h-px bg-gray-700" />
      </div>

      {/* ── 장년부 (우) ── */}
      <Link
        href="/senior"
        className="group relative flex-1 flex flex-col items-center justify-center gap-6 cursor-pointer overflow-hidden bg-gray-950"
      >
        {/* 배경 그라디언트 */}
        <div className="absolute inset-0 bg-gradient-to-bl from-orange-900/60 via-orange-950/30 to-gray-950 transition-all duration-500 group-hover:from-orange-800/70 group-hover:via-orange-900/40" />

        {/* 우측 엣지 라인 */}
        <div className="absolute right-0 top-0 bottom-0 w-1 bg-gradient-to-b from-orange-500/0 via-orange-500/80 to-orange-500/0 opacity-60 group-hover:opacity-100 transition-opacity" />

        {/* 배경 큰 텍스트 워터마크 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          <span className="text-[20vw] sm:text-[12vw] font-black text-orange-500/5 group-hover:text-orange-500/8 transition-all duration-500 leading-none">
            SENIOR
          </span>
        </div>

        {/* 콘텐츠 */}
        <div className="relative z-10 flex flex-col items-center gap-5 text-center px-8">
          <div className="text-7xl sm:text-8xl drop-shadow-2xl transition-transform duration-300 group-hover:scale-110">
            🔥
          </div>
          <div>
            <div className="text-4xl sm:text-5xl font-black text-white tracking-tight mb-2">
              장년부
            </div>
            <div className="text-orange-400 font-semibold text-lg tracking-widest uppercase">
              Senior Team
            </div>
          </div>
          <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-orange-500/20 border border-orange-500/40 text-orange-300 text-sm font-semibold group-hover:bg-orange-500/30 group-hover:border-orange-400/60 transition-all">
            입장하기 <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* 하단 바 */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-orange-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </Link>
    </div>
  )
}
