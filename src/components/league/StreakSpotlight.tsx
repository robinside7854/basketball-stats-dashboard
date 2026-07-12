'use client'
import { useEffect, useState } from 'react'
import { Flame, Zap, Crosshair, Trophy, Shield, Layers } from 'lucide-react'
import PlayerQuickViewModal from './PlayerQuickViewModal'

type StreakCategory = 'pts10' | 'pts20' | 'tp1' | 'dd' | 'wins' | 'stlblk3'

interface StreakEntry {
  player_id: string
  name: string
  number: number | null
  category: StreakCategory
  count: number
}

interface StreakData {
  streaks: StreakEntry[]
}

interface Props {
  leagueId: string
  maxEntries?: number
  /** SSR 프리페치 결과 — 있으면 초기 fetch skip (홈 waterfall 제거용) */
  initialData?: StreakData
}

const CATEGORY_DEFS: Record<StreakCategory, {
  label: string
  Icon: typeof Flame
  suffix: string
}> = {
  pts10:   { label: '두 자릿수 득점',  Icon: Trophy,    suffix: '경기' },
  pts20:   { label: '20+ 득점',        Icon: Flame,     suffix: '경기' },
  tp1:     { label: '3점 성공',         Icon: Crosshair, suffix: '경기' },
  dd:      { label: '더블더블',         Icon: Layers,    suffix: '경기' },
  wins:    { label: '승리 연속',        Icon: Shield,    suffix: '경기' },
  stlblk3: { label: 'STL+BLK 3+',      Icon: Zap,       suffix: '경기' },
}

function heat(count: number): { flames: number; intensity: string } {
  if (count >= 7) return { flames: 3, intensity: '초열' }
  if (count >= 5) return { flames: 2, intensity: '핫' }
  if (count >= 3) return { flames: 1, intensity: '진행' }
  return { flames: 0, intensity: '시작' }
}

export default function StreakSpotlight({ leagueId, maxEntries = 8, initialData }: Props) {
  const hasInitial = !!initialData
  const [streaks, setStreaks] = useState<StreakEntry[]>(initialData?.streaks ?? [])
  const [loading, setLoading] = useState(!hasInitial)
  const [quickPlayer, setQuickPlayer] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    // initial 데이터가 있으면 mount 시 fetch skip — 서버 렌더 결과 그대로 사용
    if (hasInitial) return
    setLoading(true)
    fetch(`/api/leagues/${leagueId}/streaks?minStreak=2`)
      .then(r => r.json())
      .then(d => { setStreaks(d.streaks ?? []); setLoading(false) })
      .catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId])

  if (loading) {
    return (
      <div
        className="mm-brand p-6 text-center text-xs uppercase tracking-[0.18em] font-bold"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
          color: 'var(--mm-muted)',
        }}
      >
        연속 기록 계산 중...
      </div>
    )
  }

  const displayed = streaks.slice(0, maxEntries)
  if (displayed.length === 0) return null

  return (
    <>
      <section
        className="mm-brand transition-shadow duration-200 hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] dark:hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.55)]"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
        }}
      >
        {/* 헤더 */}
        <header
          className="flex items-baseline justify-between px-5 lg:px-6 py-4 lg:py-5"
          style={{ borderBottom: '1px solid var(--mm-rule)' }}
        >
          <div className="flex items-center gap-2.5">
            <Flame size={18} style={{ color: 'var(--mm-yellow-strong)' }} />
            <h3
              className="font-jersey font-black uppercase"
              style={{ color: 'var(--mm-ink)', fontSize: '22px', letterSpacing: '-0.005em' }}
            >
              핫 연속
            </h3>
          </div>
          <span
            className="text-[12px] uppercase font-bold tabular-nums"
            style={{ color: 'var(--mm-muted)', letterSpacing: '0.18em' }}
          >
            {streaks.length}건 · TOP {displayed.length}
          </span>
        </header>

        {/* 스트릭 리스트 */}
        <div className="p-2">
          {displayed.map((s, i) => {
            const def = CATEGORY_DEFS[s.category]
            const h = heat(s.count)
            const isTop = i === 0
            return (
              <button
                key={`${s.player_id}-${s.category}`}
                onClick={() => setQuickPlayer({ id: s.player_id, name: s.name })}
                className="w-full flex items-center gap-3 lg:gap-4 text-left cursor-pointer group transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                style={{
                  padding: isTop ? '14px 16px' : '12px 16px',
                  background: isTop ? 'var(--mm-yellow)' : 'transparent',
                  color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)',
                  borderLeft: `4px solid ${isTop ? 'var(--mm-black)' : 'transparent'}`,
                }}
                onMouseEnter={(e) => {
                  if (!isTop) {
                    e.currentTarget.style.background = 'var(--mm-panel-alt)'
                    e.currentTarget.style.borderLeftColor = 'var(--mm-yellow)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isTop) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.borderLeftColor = 'transparent'
                  }
                }}
              >
                {/* Rank */}
                <span
                  className="font-jersey font-black tabular-nums leading-none shrink-0"
                  style={{
                    color: isTop ? 'var(--mm-black)' : 'var(--mm-muted)',
                    width: isTop ? '28px' : '24px',
                    textAlign: 'right',
                    fontSize: isTop ? '28px' : '22px',
                  }}
                >
                  {i + 1}
                </span>

                {/* Icon */}
                <span
                  className="flex items-center justify-center shrink-0"
                  style={{
                    width: isTop ? '40px' : '36px',
                    height: isTop ? '40px' : '36px',
                    background: isTop ? 'var(--mm-black)' : 'var(--mm-panel)',
                    border: `1px solid ${isTop ? 'var(--mm-black)' : 'var(--mm-rule)'}`,
                  }}
                >
                  <def.Icon
                    size={isTop ? 18 : 16}
                    style={{ color: isTop ? 'var(--mm-yellow)' : 'var(--mm-ink)' }}
                  />
                </span>

                {/* Player + Category */}
                <div className="flex-1 min-w-0">
                  <p
                    className="font-jersey font-black uppercase truncate leading-none"
                    style={{
                      color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)',
                      fontSize: isTop ? '20px' : '18px',
                      letterSpacing: '-0.005em',
                    }}
                  >
                    {s.name}
                    {s.number != null && (
                      <span
                        className="ml-2 font-bold tabular-nums"
                        style={{
                          color: isTop ? 'rgba(0,0,0,0.55)' : 'var(--mm-muted)',
                          fontSize: '12px',
                        }}
                      >
                        #{s.number}
                      </span>
                    )}
                  </p>
                  <p
                    className="font-bold uppercase mt-1.5 truncate"
                    style={{
                      color: isTop ? 'rgba(0,0,0,0.65)' : 'var(--mm-muted)',
                      fontSize: '11px',
                      letterSpacing: '0.16em',
                    }}
                  >
                    {def.label}
                  </p>
                </div>

                {/* Count */}
                <div className="text-right shrink-0 flex items-baseline gap-2">
                  <span
                    className="font-jersey font-black tabular-nums leading-none"
                    style={{
                      color: isTop
                        ? 'var(--mm-black)'
                        : 'var(--mm-yellow-strong)',
                      fontSize: isTop ? '36px' : '30px',
                      letterSpacing: '-0.015em',
                    }}
                  >
                    {s.count}
                  </span>
                  <span
                    className="font-bold uppercase"
                    style={{
                      color: isTop ? 'rgba(0,0,0,0.6)' : 'var(--mm-muted)',
                      fontSize: '11px',
                      letterSpacing: '0.16em',
                    }}
                  >
                    {def.suffix}
                  </span>
                  {h.flames > 0 && (
                    <span
                      className="inline-flex items-center ml-1"
                      aria-hidden
                      style={{
                        color: isTop ? 'var(--mm-black)' : 'var(--mm-yellow-strong)',
                      }}
                    >
                      {Array.from({ length: h.flames }).map((_, idx) => (
                        <Flame key={idx} size={12} strokeWidth={2} />
                      ))}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
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
