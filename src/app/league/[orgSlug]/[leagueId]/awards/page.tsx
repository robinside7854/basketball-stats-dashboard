'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { Trophy, Crown, Flame, Shield, Zap, Target, TrendingUp, Sparkles, Award } from 'lucide-react'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import PlayerQuickViewModal from '@/components/league/PlayerQuickViewModal'

type AwardCategory = 'MVP' | 'SCORING' | 'REBOUND' | 'ASSIST' | 'DPOY' | 'THREE' | 'EFFICIENCY' | 'CLUTCH' | 'MIP'

interface AwardCandidate {
  player_id: string
  name: string
  number: number | null
  position: string | null
  value: number
  displayValue: string
  gp: number
  supportingStats?: Record<string, string>
}

interface AwardEntry {
  category: AwardCategory
  label: string
  description: string
  metric: string
  minRequirement?: string
  winner: AwardCandidate | null
  runners: AwardCandidate[]
}

const CATEGORY_STYLE: Record<AwardCategory, {
  Icon: typeof Trophy
  bg: string
  border: string
  text: string
  chipBg: string
  ribbon: string
}> = {
  MVP:        { Icon: Crown,     bg: 'from-yellow-900/40 via-amber-900/30 to-orange-900/30',  border: 'border-yellow-500/60', text: 'text-yellow-200',   chipBg: 'bg-yellow-500/20', ribbon: 'from-yellow-400 to-amber-500' },
  SCORING:    { Icon: Trophy,    bg: 'from-amber-950/40 to-orange-900/20',                    border: 'border-amber-500/50',  text: 'text-amber-200',    chipBg: 'bg-amber-500/20',  ribbon: 'from-amber-400 to-orange-500' },
  REBOUND:    { Icon: Shield,    bg: 'from-orange-950/40 to-red-900/20',                      border: 'border-orange-500/50', text: 'text-orange-200',   chipBg: 'bg-orange-500/20', ribbon: 'from-orange-400 to-red-500' },
  ASSIST:     { Icon: Sparkles,  bg: 'from-cyan-950/40 to-blue-900/20',                       border: 'border-cyan-500/50',   text: 'text-cyan-200',     chipBg: 'bg-cyan-500/20',   ribbon: 'from-cyan-400 to-blue-500' },
  DPOY:       { Icon: Zap,       bg: 'from-emerald-950/40 to-green-900/20',                   border: 'border-emerald-500/50',text: 'text-emerald-200',  chipBg: 'bg-emerald-500/20',ribbon: 'from-emerald-400 to-green-500' },
  THREE:      { Icon: Target,    bg: 'from-pink-950/40 to-purple-900/20',                     border: 'border-pink-500/50',   text: 'text-pink-200',     chipBg: 'bg-pink-500/20',   ribbon: 'from-pink-400 to-purple-500' },
  EFFICIENCY: { Icon: Award,     bg: 'from-teal-950/40 to-cyan-900/20',                       border: 'border-teal-500/50',   text: 'text-teal-200',     chipBg: 'bg-teal-500/20',   ribbon: 'from-teal-400 to-cyan-500' },
  CLUTCH:     { Icon: Flame,     bg: 'from-red-950/40 to-amber-900/20',                       border: 'border-red-500/50',    text: 'text-red-200',      chipBg: 'bg-red-500/20',    ribbon: 'from-red-400 to-amber-500' },
  MIP:        { Icon: TrendingUp,bg: 'from-purple-950/40 to-fuchsia-900/20',                  border: 'border-purple-500/50', text: 'text-purple-200',   chipBg: 'bg-purple-500/20', ribbon: 'from-purple-400 to-fuchsia-500' },
}

interface AttendanceInfo {
  totalRounds: number
  requiredRounds: number
  threshold: number
}

export default function AwardsPage() {
  const params = useParams<{ leagueId: string }>()
  const { leagueId } = params

  const [awards, setAwards] = useState<AwardEntry[]>([])
  const [attendance, setAttendance] = useState<AttendanceInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [quickPlayer, setQuickPlayer] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/leagues/${leagueId}/awards`)
      .then(r => r.json())
      .then(d => {
        setAwards(d.awards ?? [])
        setAttendance(d.attendance ?? null)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [leagueId])

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* 헤더 */}
      <div className="relative court-bg rounded-2xl px-5 py-5 lg:px-6 lg:py-6 -mx-2 sm:mx-0 border border-gray-800/40 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-20"
             style={{ background: 'radial-gradient(circle at 30% 20%, rgba(251,191,36,0.5), transparent 60%)' }} />
        <div className="relative flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Trophy size={28} className="text-amber-400 lg:w-9 lg:h-9" />
            <div>
              <h1 className="font-jersey text-2xl lg:text-4xl font-bold text-white tracking-wide uppercase">시즌 어워즈</h1>
              <p className="text-sm text-gray-500 mt-0.5">Season Awards · 9개 부문</p>
            </div>
          </div>
          {attendance && attendance.totalRounds > 0 && (
            <div className="rounded-lg bg-gray-900/60 border border-amber-500/30 px-3 py-2 lg:px-4 lg:py-2.5">
              <p className="text-xs text-amber-300 font-jersey uppercase tracking-widest font-bold">자격 요건</p>
              <p className="text-sm lg:text-base text-white font-bold mt-0.5">
                시즌 <span className="text-amber-300 tabular-nums">{attendance.totalRounds}</span>일 중
                <span className="text-amber-300 tabular-nums"> {attendance.requiredRounds}</span>일 이상 참석
                <span className="text-xs text-gray-500 ml-1.5">({Math.round(attendance.threshold * 100)}%)</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><BasketballLoader size={32} /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-5">
          {awards.map(a => {
            const style = CATEGORY_STYLE[a.category]
            return (
              <div key={a.category}
                   className={`relative rounded-2xl border overflow-hidden bg-gradient-to-br ${style.bg} ${style.border} shadow-lg`}>
                {/* 상단 리본 */}
                <div className={`h-1 bg-gradient-to-r ${style.ribbon}`} />

                {/* 카드 헤더 */}
                <div className="px-4 py-3.5 lg:px-5 lg:py-4 border-b border-gray-800/50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-9 h-9 lg:w-10 lg:h-10 rounded-full ${style.chipBg} border ${style.border} flex items-center justify-center shrink-0`}>
                      <style.Icon size={16} className={style.text} />
                    </div>
                    <div>
                      <h3 className={`font-jersey text-base lg:text-lg font-black uppercase tracking-widest ${style.text}`}>{a.label}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">{a.description}</p>
                    </div>
                  </div>
                </div>

                {/* Winner 스포트라이트 */}
                {a.winner ? (
                  <button
                    onClick={() => setQuickPlayer({ id: a.winner!.player_id, name: a.winner!.name })}
                    className="w-full px-4 py-4 lg:px-5 lg:py-5 border-b border-gray-800/40 hover:bg-gray-900/40 cursor-pointer text-left group transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-14 h-14 lg:w-16 lg:h-16 rounded-full ${style.chipBg} border-2 ${style.border} flex items-center justify-center shrink-0`}>
                        <Crown size={22} className={`${style.text} lg:w-7 lg:h-7`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-jersey font-bold uppercase tracking-widest ${style.text}`}>Winner</p>
                        <p className="text-xl lg:text-2xl font-black text-white group-hover:underline underline-offset-4 truncate">
                          {a.winner.name}
                          {a.winner.number != null && <span className="ml-2 text-sm text-gray-500 font-mono">#{a.winner.number}</span>}
                        </p>
                        <p className={`text-lg lg:text-xl font-black tabular-nums ${style.text}`}>{a.winner.displayValue}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{a.winner.gp}게임 · {a.metric}</p>
                      </div>
                    </div>
                    {a.winner.supportingStats && (
                      <div className="mt-3 pt-3 border-t border-gray-800/40 flex flex-wrap gap-x-3 gap-y-1.5">
                        {Object.entries(a.winner.supportingStats).map(([key, val]) => (
                          <div key={key} className="text-xs">
                            <span className="text-gray-500">{key}: </span>
                            <span className={`font-bold ${style.text} tabular-nums`}>{val}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                ) : (
                  <div className="px-4 py-6 text-center text-sm text-gray-600">
                    자격 요건 충족자 없음
                    {a.minRequirement && <div className="text-xs text-gray-700 mt-1">{a.minRequirement}</div>}
                  </div>
                )}

                {/* Runners (2-3위 후보) */}
                {a.runners.length > 0 && (
                  <div className="px-4 py-3 lg:px-5 lg:py-3.5">
                    <p className="text-xs font-jersey font-bold text-gray-500 uppercase tracking-widest mb-2">후보</p>
                    <div className="space-y-1.5">
                      {a.runners.map((r, idx) => (
                        <button key={r.player_id}
                          onClick={() => setQuickPlayer({ id: r.player_id, name: r.name })}
                          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-900/50 transition-colors cursor-pointer group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-black font-mono text-gray-500 w-4 shrink-0">
                              {idx + 2}
                            </span>
                            <span className="text-sm lg:text-base font-bold text-gray-200 group-hover:text-white truncate">
                              {r.name}
                              {r.number != null && <span className="ml-1 text-xs text-gray-600 font-mono">#{r.number}</span>}
                            </span>
                          </div>
                          <span className={`text-sm font-black tabular-nums ${style.text} shrink-0`}>
                            {r.displayValue}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {a.minRequirement && a.winner && (
                  <div className="px-4 py-2 bg-gray-900/40 border-t border-gray-800/40">
                    <p className="text-xs text-gray-600">📋 {a.minRequirement}</p>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {quickPlayer && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={quickPlayer.id}
          playerName={quickPlayer.name}
          onClose={() => setQuickPlayer(null)}
        />
      )}
    </div>
  )
}
