import Link from 'next/link'
import { ArrowRight, Zap, Flame } from 'lucide-react'
import { Basketball } from '@/components/league/BasketballIcons'

export default function LandingPage() {
  return (
    <div className="fixed inset-0 flex flex-col sm:flex-row overflow-hidden z-10">

      {/* ── 청년부 (좌) ── */}
      <Link
        href="/paranalgae/youth"
        className="group relative flex-1 flex flex-col items-center justify-center gap-6 cursor-pointer overflow-hidden bg-[var(--mm-ground)]"
      >
        {/* 배경 그라디언트 */}
        <div className="absolute inset-0 bg-gradient-to-br from-[color:var(--mm-ink)]/60 via-[color:var(--mm-ink)]/30 to-[color:var(--mm-ground)] transition-all duration-500 group-hover:from-[color:var(--mm-ink)]/70 group-hover:via-[color:var(--mm-ink)]/40" />

        {/* 좌측 엣지 라인 */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-[color:var(--mm-yellow)]/0 via-[color:var(--mm-yellow)]/80 to-[color:var(--mm-yellow)]/0 opacity-60 group-hover:opacity-100 transition-opacity" />

        {/* 배경 큰 텍스트 워터마크 */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
          <span className="text-[20vw] sm:text-[12vw] font-black text-[color:var(--mm-yellow-strong)]/5 group-hover:text-[color:var(--mm-yellow-strong)]/8 transition-all duration-500 leading-none">
            YOUTH
          </span>
        </div>

        {/* 콘텐츠 */}
        <div className="relative z-10 flex flex-col items-center gap-5 text-center px-8">
          <Zap
            aria-hidden
            className="h-16 w-16 sm:h-20 sm:w-20 drop-shadow-2xl transition-transform duration-300 group-hover:scale-110 text-[var(--mm-yellow-strong)]"
          />
          <div>
            <div className="text-4xl sm:text-5xl font-black text-[var(--mm-ink)] tracking-tight mb-2">
              청년부
            </div>
            <div className="text-[var(--mm-yellow-strong)] font-semibold text-lg tracking-widest uppercase">
              Youth Team
            </div>
          </div>
          <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[color:var(--mm-yellow)]/20 border border-[color:var(--mm-yellow)]/40 text-[var(--mm-yellow-strong)] text-sm font-semibold group-hover:bg-[color:var(--mm-yellow)]/30 group-hover:border-[color:var(--mm-yellow-strong)]/60 transition-all">
            입장하기 <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </div>
        </div>

        {/* 하단 바 */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[color:var(--mm-yellow)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      </Link>

      {/* ── 중앙 구분선 ── */}
      <div className="relative hidden sm:flex flex-col items-center justify-center w-px bg-[var(--mm-rule)] shrink-0 z-10">
        <div className="absolute inset-y-0 w-px bg-gradient-to-b from-transparent via-[color:var(--mm-rule)] to-transparent" />
        <div className="relative bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-full w-10 h-10 flex items-center justify-center shadow-lg z-20">
          <Basketball size={20} className="text-[var(--mm-ink)]" />
        </div>
      </div>

      {/* 모바일 구분선 */}
      <div className="flex sm:hidden items-center gap-3 px-8 py-1 bg-[var(--mm-panel)] z-10 border-y border-[var(--mm-rule)]">
        <div className="flex-1 h-px bg-[var(--mm-rule)]" />
        <span className="text-[var(--mm-muted)] text-xs font-semibold tracking-widest">VS</span>
        <div className="flex-1 h-px bg-[var(--mm-rule)]" />
      </div>

      {/* ── 장년부 (우) ── */}
      <Link
        href="/paranalgae/senior"
        className="group relative flex-1 flex flex-col items-center justify-center gap-6 cursor-pointer overflow-hidden bg-[var(--mm-ground)]"
      >
        {/* 배경 그라디언트 */}
        <div className="absolute inset-0 bg-gradient-to-bl from-orange-900/60 via-orange-950/30 to-[color:var(--mm-ground)] transition-all duration-500 group-hover:from-orange-800/70 group-hover:via-orange-900/40" />

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
          <Flame
            aria-hidden
            className="h-16 w-16 sm:h-20 sm:w-20 drop-shadow-2xl transition-transform duration-300 group-hover:scale-110 text-orange-400"
          />
          <div>
            <div className="text-4xl sm:text-5xl font-black text-[var(--mm-ink)] tracking-tight mb-2">
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
