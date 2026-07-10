'use client'
import { useEffect, useState } from 'react'
import { Trophy, Crown } from 'lucide-react'
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
  accentSolid: string     // 왼쪽 accent bar / progress bar 등 순색 사용 (Tailwind gradient/bg 명시)
  cardBg: string          // 카드 배경
  glowRgb: string         // Top1 스포트라이트용 rgb 값 (radial gradient 사용)
}

const CATEGORIES: CategoryDef[] = [
  { key: 'ppg',     term: 'PPG',   label: '득점',    format: v => v.toFixed(1),
    accentClass: 'text-amber-300', accentSolid: 'bg-amber-400', cardBg: 'from-amber-950/40 to-amber-900/10',
    glowRgb: '251,191,36' },
  { key: 'rpg',     term: 'RPG',   label: '리바',    format: v => v.toFixed(1),
    accentClass: 'text-orange-300', accentSolid: 'bg-orange-400', cardBg: 'from-orange-950/40 to-orange-900/10',
    glowRgb: '251,146,60' },
  { key: 'apg',     term: 'APG',   label: '도움',    format: v => v.toFixed(1),
    accentClass: 'text-cyan-300', accentSolid: 'bg-cyan-400', cardBg: 'from-cyan-950/40 to-cyan-900/10',
    glowRgb: '34,211,238' },
  { key: 'spg',     term: 'SPG',   label: '스틸',    format: v => v.toFixed(1),
    accentClass: 'text-emerald-300', accentSolid: 'bg-emerald-400', cardBg: 'from-emerald-950/40 to-emerald-900/10',
    glowRgb: '52,211,153' },
  { key: 'bpg',     term: 'BPG',   label: '블락',    format: v => v.toFixed(1),
    accentClass: 'text-purple-300', accentSolid: 'bg-purple-400', cardBg: 'from-purple-950/40 to-purple-900/10',
    glowRgb: '192,132,252' },
  { key: 'fg3m',    term: '3PM',   label: '3점 성공', format: v => String(Math.round(v)),
    accentClass: 'text-pink-300', accentSolid: 'bg-pink-400', cardBg: 'from-pink-950/40 to-pink-900/10',
    glowRgb: '244,114,182' },
  { key: 'efg_pct', term: 'eFG%',  label: '유효야투', format: v => `${v.toFixed(1)}%`,
    minAttempts: p => p.fga >= 20,
    accentClass: 'text-teal-300', accentSolid: 'bg-teal-400', cardBg: 'from-teal-950/40 to-teal-900/10',
    glowRgb: '45,212,191' },
  { key: 'fg3_pct', term: '3P%',   label: '3점 %',   format: v => `${v.toFixed(1)}%`,
    minAttempts: p => p.fg3a >= 10,
    accentClass: 'text-blue-300', accentSolid: 'bg-blue-400', cardBg: 'from-blue-950/40 to-blue-900/10',
    glowRgb: '96,165,250' },
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
          <span className="text-xs lg:text-xs text-gray-500 font-mono">최소 {effectiveMinGP} R</span>
        </div>

        {/* 카드 그리드 */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 lg:gap-3 p-3 lg:p-4">
          {CATEGORIES.map((cat, idx) => {
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
              <div
                key={String(cat.key)}
                className={`
                  group/card relative bg-gradient-to-br ${cat.cardBg}
                  border border-gray-800/60 rounded-xl p-3 lg:p-3.5
                  hover:border-gray-700 hover:-translate-y-0.5
                  transition-all duration-300
                  shadow-[0_1px_0_rgba(255,255,255,0.03)_inset,0_2px_8px_-2px_rgba(0,0,0,0.35)]
                  hover:shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_10px_28px_-8px_rgba(0,0,0,0.55)]
                  animate-in fade-in slide-in-from-bottom-2
                `}
                style={{ animationDelay: `${idx * 60}ms`, animationDuration: '480ms', animationFillMode: 'backwards' }}
              >
                {/* 상단 accent gradient bar — 카테고리 색상 힌트 */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 top-0 h-px opacity-70"
                  style={{ background: `linear-gradient(90deg, transparent 0%, rgba(${cat.glowRgb},0.6) 50%, transparent 100%)` }}
                />
                {/* Top1 뒷배경 스포트라이트 glow */}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 rounded-xl"
                  style={{ background: `radial-gradient(circle at 15% 30%, rgba(${cat.glowRgb},0.10), transparent 55%)` }}
                />

                {/* 카테고리 라벨 */}
                <div className="relative flex items-center justify-between mb-2">
                  <Tooltip content={
                    <div className="space-y-1">
                      <div className="font-bold text-white">{statDef(cat.term)?.long ?? cat.label}</div>
                      {statDef(cat.term)?.formula && (
                        <div className="font-mono text-xs text-amber-300">{statDef(cat.term)!.formula}</div>
                      )}
                      <div className="text-gray-300 leading-relaxed">{statDef(cat.term)?.description}</div>
                    </div>
                  }>
                    <span className={`text-xs lg:text-xs font-jersey font-black tracking-widest uppercase cursor-help underline decoration-dotted decoration-gray-700 underline-offset-2 ${cat.accentClass}`}>
                      {cat.label}
                    </span>
                  </Tooltip>
                  <span className="text-xs font-mono text-gray-600 uppercase tracking-widest">{cat.term}</span>
                </div>

                {/* Top 1 스포트라이트 — 왼쪽 accent bar + 왕관 + 큰 숫자 */}
                <button
                  onClick={() => setQuickPlayer({ id: top1.player_id, name: top1.name })}
                  className="relative w-full text-left group/top1 pl-2.5"
                >
                  {/* 왼쪽 accent bar */}
                  <span
                    aria-hidden
                    className={`absolute left-0 top-0.5 bottom-0.5 w-0.5 rounded-full ${cat.accentSolid} opacity-80 group-hover/top1:opacity-100 transition-opacity`}
                  />
                  <div className="flex items-center gap-1 mb-0.5">
                    <Crown size={11} className={`${cat.accentClass} shrink-0`} strokeWidth={2.5} />
                    <p className="text-sm lg:text-base font-black text-white group-hover/top1:text-amber-100 transition-colors truncate">
                      {top1.name}
                      {top1.number != null && <span className="ml-1 text-[10px] lg:text-[10px] text-gray-500 font-mono">#{top1.number}</span>}
                    </p>
                  </div>
                  <p className={`
                    text-[2rem] lg:text-4xl font-black tabular-nums leading-none tracking-tighter
                    ${cat.accentClass}
                    drop-shadow-[0_2px_10px_rgba(0,0,0,0.4)]
                  `}>
                    {cat.format(top1Val)}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1 font-mono uppercase tracking-widest">{top1.gp}R</p>
                </button>

                {/* Rest (2-5위) — 각 행에 미니 프로그레스 바 (Top1 대비 상대비율) */}
                {rest.length > 0 && (
                  <div className="relative mt-2.5 pt-2 border-t border-gray-800/50 space-y-0.5">
                    {rest.map((p, i) => {
                      const val = p[cat.key] as number
                      const ratio = top1Val > 0 ? Math.max(6, Math.round((val / top1Val) * 100)) : 0
                      return (
                        <button key={p.player_id}
                          onClick={() => setQuickPlayer({ id: p.player_id, name: p.name })}
                          className="relative w-full flex items-center justify-between gap-1.5 text-xs hover:bg-white/[0.03] rounded px-1.5 py-1 transition-colors group/row overflow-hidden"
                        >
                          {/* 미니 프로그레스 바 — 배경 */}
                          <span
                            aria-hidden
                            className={`absolute left-0 top-1/2 -translate-y-1/2 h-4 rounded ${cat.accentSolid} opacity-[0.06] group-hover/row:opacity-[0.11] transition-opacity`}
                            style={{ width: `${ratio}%` }}
                          />
                          <span className="relative flex items-center gap-1.5 min-w-0">
                            <span className="text-[10px] text-gray-600 font-mono w-3 shrink-0 text-right tabular-nums">{i + 2}</span>
                            <span className="text-gray-400 group-hover/row:text-gray-100 truncate">{p.name}</span>
                          </span>
                          <span className="relative text-gray-300 font-bold tabular-nums shrink-0">{cat.format(val)}</span>
                        </button>
                      )
                    })}
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
