import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default function LandingPage() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col items-center justify-center px-4 py-12">
      <div className="text-center mb-10">
        <div className="text-5xl mb-4">🏀</div>
        <h1 className="text-3xl font-black text-white tracking-tight mb-2">파란날개 게임로그</h1>
        <p className="text-gray-400 text-sm">팀을 선택하세요</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl">
        {/* 청년부 */}
        <Link
          href="/youth"
          className="group relative overflow-hidden bg-gray-900 border-2 border-blue-500/40 rounded-2xl p-8 flex flex-col items-center gap-4 hover:border-blue-500 hover:bg-blue-950/30 transition-all duration-300 cursor-pointer"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-transparent pointer-events-none" />
          <div className="text-5xl">⚡</div>
          <div className="text-center">
            <div className="text-2xl font-black text-white mb-1">청년부</div>
            <div className="text-sm text-blue-400 font-medium">Youth Team</div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 group-hover:text-blue-400 transition-colors">
            입장하기 <ArrowRight size={12} />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 to-blue-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>

        {/* 장년부 */}
        <Link
          href="/senior"
          className="group relative overflow-hidden bg-gray-900 border-2 border-orange-500/40 rounded-2xl p-8 flex flex-col items-center gap-4 hover:border-orange-500 hover:bg-orange-950/20 transition-all duration-300 cursor-pointer"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-orange-600/10 to-transparent pointer-events-none" />
          <div className="text-5xl">🔥</div>
          <div className="text-center">
            <div className="text-2xl font-black text-white mb-1">장년부</div>
            <div className="text-sm text-orange-400 font-medium">Senior Team</div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 group-hover:text-orange-400 transition-colors">
            입장하기 <ArrowRight size={12} />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-600 to-orange-400 opacity-0 group-hover:opacity-100 transition-opacity" />
        </Link>
      </div>
    </div>
  )
}
