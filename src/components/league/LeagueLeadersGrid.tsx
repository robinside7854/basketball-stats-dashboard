'use client'
import { useEffect, useState } from 'react'
import { Trophy, ChevronRight } from 'lucide-react'
import PlayerQuickViewModal from './PlayerQuickViewModal'
import { statDef } from '@/lib/stats/glossary'
import { Tooltip } from '@/components/ui/tooltip'
import type { PlayerStat } from '@/types/league'

interface Props {
  leagueId: string
  minGP?: number  // 리더 계산 최소 GP (기본: 자동 = maxGP × 1/2)
}

interface CategoryDef {
  key: keyof PlayerStat
  term: string            // 툴팁 term
  label: string           // 화면 라벨
  format: (v: number) => string
  minAttempts?: (p: PlayerStat) => boolean  // 성공률 카테고리의 최소 시도 필터
  accentClass: string     // 상단 라벨 색상
  cardBg: string          // 카드 배경
}

const CATEGORIES: CategoryDef[] = [
  { key: 'ppg',     term: 'PPG',   label: '득점',    format: v => v.toFixed(1),
    accentClass: 'text-amber-300', cardBg: 'from-amber-950/40 to-amber-900/10' },
  { key: 'rpg',     term: 'RPG',   label: '리바',    format: v => v.toFixed(1),
    accentClass: 'text-orange-300', cardBg: 'from-orange-950/40 to-orange-900/10' },
  { key: 'apg',     term: 'APG',   label: '도움',    format: v => v.toFixed(1),
    accentClass: 'text-cyan-300', cardBg: 'from-cyan-950/40 to-cyan-900/10' },
  { key: 'spg',     term: 'SPG',   label: '스틸',    format: v => v.toFixed(1),
    accentClass: 'text-emerald-300', cardBg: 'from-emerald-950/40 to-emerald-900/10' },
  { key: 'bpg',     term: 'BPG',   label: '블락',    format: v => v.toFixed(1),
    accentClass: 'text-purple-300', cardBg: 'from-purple-950/40 to-purple-900/10' },
  { key: 'fg3m',    term: '3PM',   label: '3점 성공', format: v => String(Math.round(v)),
    accentClass: 'text-pink-300', cardBg: 'from-pink-950/40 to-pink-900/10' },
  { key: 'efg_pct', term: 'eFG%',  label: '유효야투', format: v => `${v.toFixed(1)}%`,
    minAttempts: p => p.fga >= 20,
    accentClass: 'text-teal-300', cardBg: 'from-teal-950/40 to-teal-900/10' },
  { key: 'fg3_pct', term: '3P%',   label: '3점 %',   format: v => `${v.toFixed(1)}%`,
    minAttempts: p => p.fg3a >= 10,
    accentClass: 'text-blue-300', cardBg: 'from-blue-950/40 to-blue-900/10' },
]

export default function LeagueLeadersGrid({ leagueId, minGP }: Props) {
  const [players, setPlayers] = useState<PlayerStat[]>([])
  const [loading, setLoading] = useState(true)
  const [quickPlayer, setQuickPlayer] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/leagues/${leagueId}/stats?unit=round`)
      .then(r => r.json())
      .then(d => { setPlayers(d.players ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [leagueId])

  const maxGP = players.reduce((m, p) => Math.max(m, p.gp), 0)
  const effectiveMinGP = minGP ?? Math.max(3, Math.ceil(maxGP / 2))

  if (loading) {
    return <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 text-center text-xs text-gray-600">리더 계산 중...</div>
  }
  if (players.length === 0) {
    return null
  }

  return (
    <>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        {/* 헤더 */}
        <div className="px-4 py-3 lg:px-5 lg:py-4 border-b border-gray-800/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy size={16} className="text-amber-400 lg:w-5 lg:h-5" />
            <h3 className="font-jersey text-sm lg:text-base font-bold text-amber-300 uppercase tracking-widest">리그 리더</h3>
          </div>
          <span className="text-[10px] lg:text-xs text-gray-500 font-mono">최소 {effectiveMinGP} R</span>
        </div>

        {/* 카드 그리드 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 p-3 lg:p-4">
          {CATEGORIES.map(cat => {
            const eligible = players.filter(p => {
              if (p.gp < effectiveMinGP) return false
              if (cat.minAttempts && !cat.minAttempts(p)) return false
              return true
            })
            if (eligible.length === 0) return null
            const sorted = [...eligible].sort((a, b) => (b[cat.key] as number) - (a[cat.key] as number))
            const top1 = sorted[0]
            const top1Val = top1[cat.key] as number
            const rest = sorted.slice(1, 5)

            return (
              <div key={String(cat.key)} className={`bg-gradient-to-br ${cat.cardBg} border border-gray-800/60 rounded-xl p-3 lg:p-3.5 hover:border-gray-700 transition-colors`}>
                {/* 카테고리 라벨 */}
                <div className="flex items-center justify-between mb-2">
                  <Tooltip content={
                    <div className="space-y-1">
                      <div className="font-bold text-white">{statDef(cat.term)?.long ?? cat.label}</div>
                      {statDef(cat.term)?.formula && (
                        <div className="font-mono text-[10px] text-amber-300">{statDef(cat.term)!.formula}</div>
                      )}
                      <div className="text-gray-300 leading-relaxed">{statDef(cat.term)?.description}</div>
                    </div>
                  }>
                    <span className={`text-[10px] lg:text-xs font-jersey font-black tracking-widest uppercase cursor-help underline decoration-dotted decoration-gray-700 underline-offset-2 ${cat.accentClass}`}>
                      {cat.label}
                    </span>
                  </Tooltip>
                  <span className="text-[10px] font-mono text-gray-600 uppercase tracking-widest">{cat.term}</span>
                </div>

                {/* Top 1 스포트라이트 */}
                <button
                  onClick={() => setQuickPlayer({ id: top1.player_id, name: top1.name })}
                  className="w-full text-left group"
                >
                  <p className="text-base lg:text-lg font-black text-white group-hover:text-amber-200 transition-colors truncate">
                    {top1.name}
                    {top1.number != null && <span className="ml-1 text-[10px] lg:text-xs text-gray-500 font-mono">#{top1.number}</span>}
                  </p>
                  <p className={`text-2xl lg:text-3xl font-black tabular-nums ${cat.accentClass} leading-none mt-1`}>
                    {cat.format(top1Val)}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1">{top1.gp}R · #1</p>
                </button>

                {/* Rest (2-5위) */}
                {rest.length > 0 && (
                  <div className="mt-2 pt-2 border-t border-gray-800/50 space-y-0.5">
                    {rest.map((p, idx) => (
                      <button key={p.player_id}
                        onClick={() => setQuickPlayer({ id: p.player_id, name: p.name })}
                        className="w-full flex items-center justify-between gap-1.5 text-[11px] hover:bg-gray-800/50 rounded px-1.5 py-0.5 transition-colors group"
                      >
                        <span className="flex items-center gap-1 min-w-0">
                          <span className="text-gray-600 font-mono w-3 shrink-0 text-right">{idx + 2}</span>
                          <span className="text-gray-400 group-hover:text-gray-200 truncate">{p.name}</span>
                        </span>
                        <span className="text-gray-300 font-bold tabular-nums shrink-0">{cat.format(p[cat.key] as number)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {quickPlayer && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={quickPlayer.id}
          playerName={quickPlayer.name}
          onClose={() => setQuickPlayer(null)}
        />
      )}
    </>
  )
}
