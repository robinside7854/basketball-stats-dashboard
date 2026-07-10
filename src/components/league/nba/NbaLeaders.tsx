'use client'
// NBA.com 오마주 — League Leaders (4 카테고리 top3)
// 각 카드: 카테고리 라벨 + Top3 행 (rk · 이니셜 원형 · 이름 · 값)
// 1위(top)는 rk · 이니셜 border · 값 모두 amber accent.
// 카드 hover: box-shadow lift.
// 클라이언트 컴포넌트 — 클릭 시 PlayerQuickView 열림.

import { useEffect, useState } from 'react'
import PlayerQuickViewModal from '@/components/league/PlayerQuickViewModal'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import type { PlayerStat } from '@/types/league'

interface Props {
  leagueId: string
  minGP?: number
}

interface CategoryDef {
  key: keyof PlayerStat
  term: string
  label: string
  format: (v: number) => string
}

const CATEGORIES: CategoryDef[] = [
  { key: 'ppg',  term: 'PPG', label: 'Scoring · PPG',    format: v => v.toFixed(1) },
  { key: 'rpg',  term: 'RPG', label: 'Rebounds · RPG',   format: v => v.toFixed(1) },
  { key: 'apg',  term: 'APG', label: 'Assists · APG',    format: v => v.toFixed(1) },
  { key: 'fg3m', term: '3PM', label: '3-Point · 3PM',    format: v => String(Math.round(v)) },
]

function initials(name: string): string {
  return name.slice(0, 2)
}

export default function NbaLeaders({ leagueId, minGP }: Props) {
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

  return (
    <>
      <section className="border-x border-b border-gray-800 bg-gray-950">
        <header className="flex items-baseline justify-between px-6 md:px-8 pt-5 pb-3">
          <h3 className="font-display text-[22px] uppercase tracking-wide text-white">League Leaders</h3>
          <span className="text-[11px] tracking-[0.16em] uppercase text-gray-500 font-bold">
            Min {effectiveMinGP} R
          </span>
        </header>

        {loading ? (
          <div className="flex justify-center py-8"><BasketballLoader size={26} /></div>
        ) : players.length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-sm">아직 기록된 스탯이 없습니다</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 px-6 md:px-8 pb-6">
            {CATEGORIES.map(cat => {
              const eligible = players.filter(p => p.gp >= effectiveMinGP)
              const sorted = [...eligible].sort((a, b) => (b[cat.key] as number) - (a[cat.key] as number))
              const top3 = sorted.slice(0, 3)
              if (top3.length === 0) return null
              return (
                <div
                  key={String(cat.key)}
                  className="bg-gray-900 border border-gray-800 px-3.5 pt-3 pb-2 transition-shadow duration-200 hover:shadow-[0_10px_36px_0_rgba(0,0,0,0.35)]"
                >
                  <h4 className="text-[11px] tracking-[0.16em] uppercase text-gray-500 font-bold pb-1.5 mb-2.5 border-b border-gray-800">
                    {cat.label}
                  </h4>
                  {top3.map((p, i) => {
                    const isTop = i === 0
                    return (
                      <button
                        key={p.player_id}
                        onClick={() => setQuickPlayer({ id: p.player_id, name: p.name })}
                        className="w-full grid grid-cols-[18px_28px_1fr_auto] gap-2 items-center py-1.5 -mx-2 px-2 rounded hover:bg-gray-800/50 transition-colors text-left cursor-pointer"
                      >
                        <span
                          className={`font-display text-[15px] text-right tabular-nums leading-none ${
                            isTop ? 'text-amber-400' : 'text-gray-500'
                          }`}
                        >
                          {i + 1}
                        </span>
                        <span
                          className={`w-[26px] h-[26px] rounded-full bg-gray-800 border-[1.5px] flex items-center justify-center font-display text-[11px] text-white shrink-0 ${
                            isTop ? 'border-amber-400' : 'border-gray-700'
                          }`}
                        >
                          {initials(p.name)}
                        </span>
                        <span className="text-[13px] text-white font-medium truncate">{p.name}</span>
                        <span
                          className={`font-display text-xl tabular-nums leading-none ${
                            isTop ? 'text-amber-400' : 'text-white'
                          }`}
                        >
                          {cat.format(p[cat.key] as number)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}
      </section>

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
