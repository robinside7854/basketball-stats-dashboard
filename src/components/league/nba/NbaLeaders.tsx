'use client'
// 미라클모닝 브랜드 — 리그 리더 (4카테고리 top3)
// 팔레트: 노랑/검정/화이트 (mm-* 변수)
// 각 카드: 카테고리 라벨 + Top3 (프로필 사진 + 이름 + 값 모두 크게)
// 1위(top): 노랑 배경 + 검정 잉크 하이라이트
// 사진 없으면 이니셜 fallback. 클릭 시 PlayerQuickView.

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
  { key: 'ppg',  term: 'PPG', label: '득점 · PPG',    format: v => v.toFixed(1) },
  { key: 'rpg',  term: 'RPG', label: '리바운드 · RPG', format: v => v.toFixed(1) },
  { key: 'apg',  term: 'APG', label: '어시스트 · APG', format: v => v.toFixed(1) },
  { key: 'fg3m', term: '3PM', label: '3점 · 3PM',      format: v => String(Math.round(v)) },
]

type PlayerMeta = { id: string; name: string; photo_url: string | null }

function initials(name: string): string {
  return name.slice(0, 2)
}

export default function NbaLeaders({ leagueId, minGP }: Props) {
  const [players, setPlayers] = useState<PlayerStat[]>([])
  const [photoMap, setPhotoMap] = useState<Record<string, string | null>>({})
  const [loading, setLoading] = useState(true)
  const [quickPlayer, setQuickPlayer] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/leagues/${leagueId}/stats?unit=round`).then(r => r.json()).catch(() => ({ players: [] })),
      fetch(`/api/leagues/${leagueId}/players`).then(r => r.json()).catch(() => []),
    ]).then(([statsD, playersD]) => {
      setPlayers(statsD.players ?? [])
      const pm: Record<string, string | null> = {}
      for (const p of (playersD ?? []) as PlayerMeta[]) pm[p.id] = p.photo_url
      setPhotoMap(pm)
      setLoading(false)
    })
  }, [leagueId])

  const maxGP = players.reduce((m, p) => Math.max(m, p.gp), 0)
  const effectiveMinGP = minGP ?? Math.max(3, Math.ceil(maxGP / 2))

  return (
    <>
      <section
        className="mm-brand"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
          borderTop: 0,
        }}
      >
        <header
          className="flex items-baseline justify-between px-6 md:px-8 py-4"
          style={{ borderBottom: '1px solid var(--mm-rule)' }}
        >
          <h3 className="font-jersey text-[22px] font-black uppercase tracking-wide" style={{ color: 'var(--mm-ink)' }}>
            리그 리더
          </h3>
          <span className="text-[11px] tracking-[0.16em] uppercase font-bold" style={{ color: 'var(--mm-muted)' }}>
            최소 {effectiveMinGP} R
          </span>
        </header>

        {loading ? (
          <div className="flex justify-center py-10"><BasketballLoader size={28} /></div>
        ) : players.length === 0 ? (
          <div className="text-center py-10 text-sm" style={{ color: 'var(--mm-muted)' }}>아직 기록된 스탯이 없습니다</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-6 md:p-8">
            {CATEGORIES.map(cat => {
              const eligible = players.filter(p => p.gp >= effectiveMinGP)
              const sorted = [...eligible].sort((a, b) => (b[cat.key] as number) - (a[cat.key] as number))
              const top3 = sorted.slice(0, 3)
              if (top3.length === 0) return null
              return (
                <div
                  key={String(cat.key)}
                  className="transition-shadow duration-200 hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)]"
                  style={{
                    background: 'var(--mm-panel-alt)',
                    border: '1px solid var(--mm-rule)',
                  }}
                >
                  {/* 카테고리 헤더 */}
                  <div
                    className="px-4 pt-3 pb-2"
                    style={{ borderBottom: '1px solid var(--mm-rule)' }}
                  >
                    <h4 className="text-[12px] font-black uppercase tracking-[0.18em]" style={{ color: 'var(--mm-yellow-strong)' }}>
                      {cat.label}
                    </h4>
                  </div>

                  {/* Top3 */}
                  <div className="p-2">
                    {top3.map((p, i) => {
                      const isTop = i === 0
                      const photo = photoMap[p.player_id]
                      return (
                        <button
                          key={p.player_id}
                          onClick={() => setQuickPlayer({ id: p.player_id, name: p.name })}
                          className="w-full grid gap-3 items-center transition-colors cursor-pointer text-left"
                          style={{
                            gridTemplateColumns: 'auto 52px 1fr auto',
                            padding: '10px 12px',
                            background: isTop ? 'var(--mm-yellow)' : 'transparent',
                            color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)',
                          }}
                        >
                          {/* 순위 큰 숫자 */}
                          <span
                            className="font-jersey text-[26px] font-black tabular-nums leading-none"
                            style={{ color: isTop ? 'var(--mm-black)' : 'var(--mm-muted)', width: '22px', textAlign: 'right' }}
                          >
                            {i + 1}
                          </span>

                          {/* 프로필 사진 or 이니셜 (원형) */}
                          <span
                            className="rounded-full overflow-hidden flex items-center justify-center shrink-0"
                            style={{
                              width: '52px',
                              height: '52px',
                              background: 'var(--mm-panel)',
                              border: `2px solid ${isTop ? 'var(--mm-black)' : 'var(--mm-rule)'}`,
                            }}
                          >
                            {photo ? (
                              <img src={photo} alt={p.name} className="w-full h-full object-cover object-top" />
                            ) : (
                              <span className="font-jersey text-[16px] font-black" style={{ color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)' }}>
                                {initials(p.name)}
                              </span>
                            )}
                          </span>

                          {/* 이름 + GP */}
                          <span className="min-w-0">
                            <span
                              className={`block truncate font-jersey uppercase tracking-wide ${isTop ? 'text-[19px] font-black' : 'text-[17px] font-bold'}`}
                              style={{ color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)' }}
                            >
                              {p.name}
                            </span>
                            <span
                              className="block text-[10px] tracking-[0.14em] uppercase font-bold mt-0.5"
                              style={{ color: isTop ? 'rgba(0,0,0,0.6)' : 'var(--mm-muted)' }}
                            >
                              {p.gp}R
                            </span>
                          </span>

                          {/* 값 큰 숫자 */}
                          <span
                            className="font-jersey text-[32px] font-black tabular-nums leading-none"
                            style={{
                              color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)',
                              letterSpacing: '-0.01em',
                              minWidth: '54px',
                              textAlign: 'right',
                            }}
                          >
                            {cat.format(p[cat.key] as number)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
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
