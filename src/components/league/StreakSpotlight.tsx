'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Flame, Zap, Crosshair, Trophy, Shield, Layers, CalendarCheck, Medal } from 'lucide-react'

// 카드 클릭 시에만 열리는 모달 — 초기 번들에서 분리 (recharts 4종 포함)
const PlayerQuickViewModal = dynamic(() => import('./PlayerQuickViewModal'), { ssr: false })

type StreakCategory = 'pts10' | 'pts20' | 'tp1' | 'dd' | 'wins' | 'stlblk3'

interface StreakEntry {
  player_id: string
  name: string
  number: number | null
  category: StreakCategory
  count: number
}

interface AttendanceEntry {
  player_id: string
  name: string
  number: number | null
  current_streak: number
  longest_streak: number
}

interface StreakData {
  streaks: StreakEntry[]
  /** optional: 하위호환 — 예전 응답엔 없을 수 있음 */
  attendance?: AttendanceEntry[]
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
  const [attendance, setAttendance] = useState<AttendanceEntry[]>(initialData?.attendance ?? [])
  const [loading, setLoading] = useState(!hasInitial)
  const [quickPlayer, setQuickPlayer] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    // initial 데이터가 있으면 mount 시 fetch skip — 서버 렌더 결과 그대로 사용
    if (hasInitial) return
    setLoading(true)
    fetch(`/api/leagues/${leagueId}/streaks?minStreak=2`)
      .then(r => r.json())
      .then(d => {
        setStreaks(d.streaks ?? [])
        setAttendance(d.attendance ?? [])
        setLoading(false)
      })
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
  // 참여 스트릭: current_streak >= 2 상위 5명 · 최장 개근 1명 별도 배너
  const attendanceCurrent = attendance.filter(a => a.current_streak >= 2).slice(0, 5)
  const attendanceLongest = attendance.length > 0
    ? [...attendance].sort((a, b) => b.longest_streak - a.longest_streak)[0]
    : null
  const showAttendance = attendanceCurrent.length > 0 || (attendanceLongest?.longest_streak ?? 0) >= 2

  if (displayed.length === 0 && !showAttendance) return null

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
            {displayed.length > 0
              ? `${streaks.length}건 · TOP ${displayed.length}`
              : '진행 중 스트릭 없음'}
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
                    className="font-jersey font-black uppercase break-keep"
                    style={{
                      color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)',
                      fontSize: isTop ? 'clamp(17px, 4.6vw, 20px)' : 'clamp(15px, 4vw, 18px)',
                      letterSpacing: '-0.005em',
                      lineHeight: 1.15,
                      wordBreak: 'break-word',
                      overflowWrap: 'anywhere',
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
                    className="font-bold uppercase mt-1.5 break-keep"
                    style={{
                      color: isTop ? 'rgba(0,0,0,0.65)' : 'var(--mm-muted)',
                      fontSize: '11px',
                      letterSpacing: '0.14em',
                      lineHeight: 1.3,
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

        {/* 참여 스트릭 — 연속 참여(진행 중) + 최장 개근(별도 배너) */}
        {showAttendance && (
          <div
            className="px-5 lg:px-6 py-4 lg:py-5"
            style={{ borderTop: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}
          >
            <div className="flex items-baseline justify-between mb-3">
              <div className="flex items-center gap-2">
                <CalendarCheck size={16} style={{ color: 'var(--mm-ink)' }} aria-hidden />
                <h4
                  className="font-jersey font-black uppercase"
                  style={{ color: 'var(--mm-ink)', fontSize: '15px', letterSpacing: '0.02em' }}
                >
                  참여 스트릭
                </h4>
              </div>
              <span
                className="text-[10px] uppercase font-bold tabular-nums"
                style={{ color: 'var(--mm-muted)', letterSpacing: '0.16em' }}
              >
                연속 · 최장 개근
              </span>
            </div>

            {/* 최장 개근 배너 (전 시즌 통틀어 1위) */}
            {attendanceLongest && attendanceLongest.longest_streak >= 2 && (
              <button
                onClick={() => setQuickPlayer({ id: attendanceLongest.player_id, name: attendanceLongest.name })}
                className="w-full flex items-center gap-3 mb-3 cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                style={{
                  padding: '10px 12px',
                  background: 'var(--mm-black)',
                  border: '1px solid var(--mm-black)',
                  minHeight: 44,
                }}
                aria-label={`최장 개근 ${attendanceLongest.name} ${attendanceLongest.longest_streak}라운드`}
              >
                <span
                  className="flex items-center justify-center shrink-0"
                  style={{ width: 32, height: 32, background: 'var(--mm-yellow)' }}
                >
                  <Medal size={16} style={{ color: 'var(--mm-black)' }} aria-hidden />
                </span>
                <div className="flex-1 min-w-0 text-left">
                  <p
                    className="font-bold uppercase"
                    style={{ color: 'var(--mm-yellow)', fontSize: '9px', letterSpacing: '0.20em' }}
                  >
                    최장 개근
                  </p>
                  <p
                    className="font-jersey font-black uppercase break-keep"
                    style={{
                      color: '#ffffff',
                      fontSize: 'clamp(15px, 4vw, 17px)',
                      letterSpacing: '-0.005em',
                      lineHeight: 1.2,
                    }}
                  >
                    {attendanceLongest.name}
                    {attendanceLongest.number != null && (
                      <span
                        className="ml-2 font-bold tabular-nums"
                        style={{ color: 'rgba(255,255,255,0.55)', fontSize: '12px' }}
                      >
                        #{attendanceLongest.number}
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right shrink-0 flex items-baseline gap-1.5">
                  <span
                    className="font-jersey font-black tabular-nums leading-none"
                    style={{ color: 'var(--mm-yellow)', fontSize: '28px', letterSpacing: '-0.015em' }}
                  >
                    {attendanceLongest.longest_streak}
                  </span>
                  <span
                    className="font-bold uppercase"
                    style={{ color: 'rgba(255,255,255,0.75)', fontSize: '10px', letterSpacing: '0.16em' }}
                  >
                    라운드
                  </span>
                </div>
              </button>
            )}

            {/* 현재 진행 중 스트릭 리스트 */}
            {attendanceCurrent.length > 0 ? (
              <ul className="space-y-1">
                {attendanceCurrent.map((a, i) => (
                  <li key={a.player_id}>
                    <button
                      onClick={() => setQuickPlayer({ id: a.player_id, name: a.name })}
                      className="w-full flex items-center gap-3 text-left cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                      style={{
                        padding: '8px 10px',
                        background: 'var(--mm-panel)',
                        border: '1px solid var(--mm-rule)',
                        minHeight: 44,
                      }}
                      aria-label={`${a.name} 연속 참여 ${a.current_streak}라운드`}
                    >
                      <span
                        className="font-jersey font-black tabular-nums leading-none shrink-0"
                        style={{ color: 'var(--mm-muted)', width: 20, textAlign: 'right', fontSize: '16px' }}
                      >
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p
                          className="font-jersey font-black uppercase break-keep"
                          style={{
                            color: 'var(--mm-ink)',
                            fontSize: 'clamp(13px, 3.6vw, 15px)',
                            letterSpacing: '-0.005em',
                            lineHeight: 1.2,
                          }}
                        >
                          {a.name}
                          {a.number != null && (
                            <span
                              className="ml-2 font-bold tabular-nums"
                              style={{ color: 'var(--mm-muted)', fontSize: '11px' }}
                            >
                              #{a.number}
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="text-right shrink-0 flex items-baseline gap-1">
                        <span
                          className="font-jersey font-black tabular-nums leading-none"
                          style={{ color: 'var(--mm-yellow-strong)', fontSize: '22px', letterSpacing: '-0.015em' }}
                        >
                          {a.current_streak}
                        </span>
                        <span
                          className="font-bold uppercase"
                          style={{ color: 'var(--mm-muted)', fontSize: '10px', letterSpacing: '0.16em' }}
                        >
                          R
                        </span>
                        {a.longest_streak > a.current_streak && (
                          <span
                            className="ml-1.5 font-bold tabular-nums"
                            style={{ color: 'var(--mm-muted)', fontSize: '10px', letterSpacing: '0.08em' }}
                            aria-label={`역대 최장 ${a.longest_streak}라운드`}
                            title={`역대 최장 ${a.longest_streak}R`}
                          >
                            (최장 {a.longest_streak})
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p
                className="text-xs text-center py-2 font-bold uppercase"
                style={{ color: 'var(--mm-muted)', letterSpacing: '0.14em' }}
              >
                진행 중 2R+ 연속 참여 없음
              </p>
            )}
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
