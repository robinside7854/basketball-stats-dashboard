'use client'
import { useEffect, useState } from 'react'
import PlayerQuickViewModal from './PlayerQuickViewModal'

type MilestoneCategory = 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK' | '3PM' | 'GP'

interface UpcomingEntry {
  player_id: string
  name: string
  number: number | null
  category: MilestoneCategory
  current: number
  target: number
  distance: number
  percent: number
}

interface RecentEntry {
  player_id: string
  name: string
  number: number | null
  category: MilestoneCategory
  target: number
  achieved_at: string
}

interface Props {
  leagueId: string
}

const CATEGORY_LABEL: Record<MilestoneCategory, string> = {
  PTS: '득점',
  REB: '리바',
  AST: '도움',
  STL: '스틸',
  BLK: '블락',
  '3PM': '3점',
  GP:  '참석',
}

function formatKoreanDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`
}

export default function MilestoneFeed({ leagueId }: Props) {
  const [upcoming, setUpcoming] = useState<UpcomingEntry[]>([])
  const [recent, setRecent] = useState<RecentEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [quickPlayer, setQuickPlayer] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/leagues/${leagueId}/milestones?maxUpcoming=6&maxRecent=6&horizonDays=30`)
      .then(r => r.json())
      .then(d => {
        setUpcoming(d.upcoming ?? [])
        setRecent(d.recent ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [leagueId])

  if (loading) {
    return (
      <div
        className="mm-brand p-6 text-center text-xs font-bold uppercase tracking-[0.20em]"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
          color: 'var(--mm-muted)',
        }}
      >
        마일스톤 스캔 중...
      </div>
    )
  }

  if (upcoming.length === 0 && recent.length === 0) return null

  return (
    <>
      <section
        className="mm-brand"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
        }}
      >
        {/* 헤더 */}
        <header
          className="flex items-baseline justify-between px-5 md:px-8 py-4 md:py-5"
          style={{ borderBottom: '1px solid var(--mm-rule)' }}
        >
          <h3
            className="font-jersey font-black uppercase"
            style={{
              color: 'var(--mm-ink)',
              fontSize: '22px',
              letterSpacing: '-0.005em',
            }}
          >
            커리어 <span style={{ color: 'var(--mm-yellow-strong)' }}>마일스톤</span>
          </h3>
          <span
            className="text-[11px] md:text-[12px] font-bold uppercase tabular-nums"
            style={{ color: 'var(--mm-muted)', letterSpacing: '0.18em' }}
          >
            임박 {upcoming.length} · 최근 {recent.length}
          </span>
        </header>

        <div
          className="grid grid-cols-1 md:grid-cols-2"
          style={{ borderColor: 'var(--mm-rule)' }}
        >
          {/* 좌측: 임박 마일스톤 */}
          <div
            className="p-4 md:p-6 border-b md:border-b-0 border-[color:var(--mm-rule)]"
          >
            <div className="mb-3 md:mb-4">
              <p
                className="font-jersey font-black uppercase"
                style={{
                  color: 'var(--mm-yellow-strong)',
                  fontSize: '13px',
                  letterSpacing: '0.20em',
                }}
              >
                임박 (진행률 순)
              </p>
            </div>
            {upcoming.length === 0 ? (
              <p
                className="text-xs py-4 text-center uppercase tracking-[0.16em] font-bold"
                style={{ color: 'var(--mm-muted)' }}
              >
                임박한 마일스톤 없음
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {upcoming.map(u => (
                  <button
                    key={`${u.player_id}-${u.category}-${u.target}`}
                    onClick={() => setQuickPlayer({ id: u.player_id, name: u.name })}
                    className="w-full text-left group transition-colors cursor-pointer"
                    style={{
                      background: 'var(--mm-panel-alt)',
                      border: '1px solid var(--mm-rule)',
                      padding: '10px 12px',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="font-black uppercase tabular-nums shrink-0"
                          style={{
                            background: 'var(--mm-ink)',
                            color: 'var(--mm-panel)',
                            fontSize: '10px',
                            letterSpacing: '0.10em',
                            padding: '3px 6px',
                          }}
                        >
                          {u.category}
                        </span>
                        <span
                          className="font-jersey uppercase truncate transition-colors"
                          style={{
                            color: 'var(--mm-ink)',
                            fontSize: '18px',
                            fontWeight: 900,
                            letterSpacing: '-0.005em',
                            lineHeight: '1',
                          }}
                        >
                          {u.name}
                          {u.number != null && (
                            <span
                              className="ml-1.5 tabular-nums"
                              style={{
                                color: 'var(--mm-muted)',
                                fontSize: '12px',
                                fontWeight: 700,
                              }}
                            >
                              #{u.number}
                            </span>
                          )}
                        </span>
                      </div>
                      <span
                        className="font-jersey font-black tabular-nums shrink-0"
                        style={{
                          color: 'var(--mm-ink-soft)',
                          fontSize: '13px',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {u.target}까지{' '}
                        <span
                          className="font-jersey"
                          style={{
                            color: 'var(--mm-yellow-strong)',
                            fontSize: '18px',
                            fontWeight: 900,
                          }}
                        >
                          {u.distance}
                        </span>
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="flex items-center gap-2">
                      <div
                        className="flex-1 h-1.5 overflow-hidden"
                        style={{ background: 'var(--mm-rule)' }}
                      >
                        <div
                          className="h-full transition-all"
                          style={{
                            width: `${Math.min(100, u.percent)}%`,
                            background: 'var(--mm-yellow)',
                          }}
                        />
                      </div>
                      <span
                        className="tabular-nums shrink-0 w-10 text-right font-bold"
                        style={{
                          color: 'var(--mm-muted)',
                          fontSize: '11px',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {u.percent.toFixed(0)}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 우측: 최근 달성 */}
          <div
            className="p-4 md:p-6 md:border-l border-[color:var(--mm-rule)]"
          >
            <div className="mb-3 md:mb-4">
              <p
                className="font-jersey font-black uppercase"
                style={{
                  color: 'var(--mm-yellow-strong)',
                  fontSize: '13px',
                  letterSpacing: '0.20em',
                }}
              >
                최근 달성 (30일)
              </p>
            </div>
            {recent.length === 0 ? (
              <p
                className="text-xs py-4 text-center uppercase tracking-[0.16em] font-bold"
                style={{ color: 'var(--mm-muted)' }}
              >
                최근 달성 없음
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {recent.map(r => (
                  <button
                    key={`${r.player_id}-${r.category}-${r.target}-${r.achieved_at}`}
                    onClick={() => setQuickPlayer({ id: r.player_id, name: r.name })}
                    className="w-full flex items-center gap-3 transition-colors cursor-pointer group text-left"
                    style={{
                      background: 'var(--mm-panel-alt)',
                      border: '1px solid var(--mm-rule)',
                      padding: '10px 12px',
                    }}
                  >
                    <span
                      className="font-black uppercase tabular-nums shrink-0"
                      style={{
                        background: 'var(--mm-ink)',
                        color: 'var(--mm-panel)',
                        fontSize: '10px',
                        letterSpacing: '0.10em',
                        padding: '3px 6px',
                      }}
                    >
                      {r.category}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-jersey uppercase truncate"
                        style={{
                          color: 'var(--mm-ink)',
                          fontSize: '18px',
                          fontWeight: 900,
                          letterSpacing: '-0.005em',
                          lineHeight: '1',
                        }}
                      >
                        {r.name}
                        {r.number != null && (
                          <span
                            className="ml-1.5 tabular-nums"
                            style={{
                              color: 'var(--mm-muted)',
                              fontSize: '12px',
                              fontWeight: 700,
                            }}
                          >
                            #{r.number}
                          </span>
                        )}
                      </p>
                      <p
                        className="font-bold uppercase mt-1"
                        style={{
                          color: 'var(--mm-muted)',
                          fontSize: '10px',
                          letterSpacing: '0.16em',
                        }}
                      >
                        {formatKoreanDate(r.achieved_at)} · {CATEGORY_LABEL[r.category]}
                      </p>
                    </div>
                    <span
                      className="font-jersey font-black tabular-nums shrink-0"
                      style={{
                        color: 'var(--mm-yellow-strong)',
                        fontSize: '28px',
                        letterSpacing: '-0.015em',
                        lineHeight: '1',
                      }}
                    >
                      {r.target}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
