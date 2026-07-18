'use client'
import { useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Flame, Zap, Crosshair, Trophy, Layers, CalendarCheck } from 'lucide-react'

// 카드 클릭 시에만 열리는 모달 — 초기 번들에서 분리 (recharts 4종 포함)
const PlayerQuickViewModal = dynamic(() => import('./PlayerQuickViewModal'), { ssr: false })

/**
 * 표시 대상 5개 카테고리.
 * - API는 `pts10/pts20/tp1/dd/wins/stlblk3` 를 반환하지만 UI는 그중 4개(`pts10/tp1/dd/stlblk3`)만 사용.
 * - `attendance` 는 별도 배열에서 current_streak >= 2 필터링.
 */
type FilterKey = 'pts10' | 'attendance' | 'tp1' | 'dd' | 'stlblk3'

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
  attendance?: AttendanceEntry[]
}

interface Props {
  leagueId: string
  /** 필터별 노출 개수 (기본 5) */
  maxEntries?: number
  /** SSR 프리페치 결과 — 있으면 초기 fetch skip */
  initialData?: StreakData
}

const FILTER_DEFS: Record<FilterKey, {
  label: string
  shortLabel: string
  Icon: typeof Flame
  suffix: string
}> = {
  pts10:      { label: '두자릿수 득점',     shortLabel: '두자릿수',    Icon: Trophy,         suffix: '경기 연속' },
  attendance: { label: '연속 출장 기록',    shortLabel: '연속 출장',   Icon: CalendarCheck,  suffix: '라운드 연속' },
  tp1:        { label: '3점 성공 경기',     shortLabel: '3점 성공',    Icon: Crosshair,      suffix: '경기 연속' },
  dd:         { label: '더블더블',           shortLabel: '더블더블',    Icon: Layers,         suffix: '경기 연속' },
  stlblk3:    { label: '스틸+블락 3개 이상', shortLabel: 'STL+BLK 3+', Icon: Zap,            suffix: '경기 연속' },
}

const FILTER_ORDER: FilterKey[] = ['pts10', 'attendance', 'tp1', 'dd', 'stlblk3']

/**
 * 선택된 필터의 Top N 리스트를 표준 shape 로 변환.
 * attendance 는 별도 배열에서 current_streak 기준, 나머지는 streaks 배열에서 category 필터.
 */
interface DisplayRow {
  player_id: string
  name: string
  number: number | null
  count: number
  // attendance 전용 · 진행 중이 끊긴 케이스는 'longest' (역대 최장) 로 표시
  attendanceMode?: 'current' | 'longest'
  // attendance 전용 · 진행 중 라운드 수 (mode='current' 일 때만) < 역대 최장이면 병기용
  attendanceHistoricalMax?: number
}

// 참여 스트릭 노출 임계값 (2026-07-19 완화)
//   · 이전엔 current >= 2 만 노출 → 한 라운드 결석하면 리스트에서 완전 탈락 문제 (유승원 케이스)
//   · 완화: current >= 2 OR longest >= 3 → 진행 끊긴 이력도 '역대 최장' 태그로 계속 노출
const ATTENDANCE_CURRENT_MIN = 2
const ATTENDANCE_LONGEST_MIN = 3

function pickRows(filter: FilterKey, streaks: StreakEntry[], attendance: AttendanceEntry[], max: number): DisplayRow[] {
  if (filter === 'attendance') {
    return attendance
      .filter(a => a.current_streak >= ATTENDANCE_CURRENT_MIN || a.longest_streak >= ATTENDANCE_LONGEST_MIN)
      .slice(0, max)
      .map(a => {
        const isCurrent = a.current_streak >= ATTENDANCE_CURRENT_MIN
        return {
          player_id: a.player_id,
          name: a.name,
          number: a.number,
          count: isCurrent ? a.current_streak : a.longest_streak,
          attendanceMode: (isCurrent ? 'current' : 'longest') as 'current' | 'longest',
          // 진행 중이지만 역대 최장이 더 크면 병기
          attendanceHistoricalMax: isCurrent && a.longest_streak > a.current_streak ? a.longest_streak : undefined,
        }
      })
  }
  return streaks
    .filter(s => s.category === filter)
    .sort((a, b) => b.count - a.count)
    .slice(0, max)
    .map(s => ({
      player_id: s.player_id,
      name: s.name,
      number: s.number,
      count: s.count,
    }))
}

export default function StreakSpotlight({ leagueId, maxEntries = 5, initialData }: Props) {
  const hasInitial = !!initialData
  const [streaks, setStreaks] = useState<StreakEntry[]>(initialData?.streaks ?? [])
  const [attendance, setAttendance] = useState<AttendanceEntry[]>(initialData?.attendance ?? [])
  const [loading, setLoading] = useState(!hasInitial)
  const [quickPlayer, setQuickPlayer] = useState<{ id: string; name: string } | null>(null)
  const [activeFilter, setActiveFilter] = useState<FilterKey>('pts10')

  useEffect(() => {
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

  // 필터별 총 건수 미리 계산 (chip 옆 개수 배지용)
  const counts = useMemo<Record<FilterKey, number>>(() => {
    const streakByCat = new Map<StreakCategory, number>()
    for (const s of streaks) {
      streakByCat.set(s.category, (streakByCat.get(s.category) ?? 0) + 1)
    }
    return {
      pts10: streakByCat.get('pts10') ?? 0,
      tp1: streakByCat.get('tp1') ?? 0,
      dd: streakByCat.get('dd') ?? 0,
      stlblk3: streakByCat.get('stlblk3') ?? 0,
      attendance: attendance.filter(
        a => a.current_streak >= ATTENDANCE_CURRENT_MIN || a.longest_streak >= ATTENDANCE_LONGEST_MIN,
      ).length,
    }
  }, [streaks, attendance])

  const rows = useMemo(
    () => pickRows(activeFilter, streaks, attendance, maxEntries),
    [activeFilter, streaks, attendance, maxEntries],
  )

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

  const totalAll = FILTER_ORDER.reduce((sum, k) => sum + counts[k], 0)
  const activeDef = FILTER_DEFS[activeFilter]

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
            {totalAll > 0 ? `${totalAll}건` : '기록 없음'}
          </span>
        </header>

        {/* 필터 chip 5개 — 가로 스크롤 (모바일) / 자연 wrap (데스크톱) */}
        <div
          className="px-3 lg:px-4 py-3 flex gap-2 overflow-x-auto lg:flex-wrap"
          style={{ borderBottom: '1px solid var(--mm-rule)', scrollbarWidth: 'thin' }}
          role="tablist"
          aria-label="스트릭 지표 필터"
        >
          {FILTER_ORDER.map(key => {
            const def = FILTER_DEFS[key]
            const isActive = activeFilter === key
            const count = counts[key]
            return (
              <button
                key={key}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveFilter(key)}
                className="shrink-0 inline-flex items-center gap-1.5 cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1 font-bold uppercase"
                style={{
                  minHeight: 44,
                  padding: '8px 12px',
                  background: isActive ? 'var(--mm-black)' : 'var(--mm-panel-alt)',
                  color: isActive ? 'var(--mm-yellow)' : 'var(--mm-ink)',
                  border: `1px solid ${isActive ? 'var(--mm-black)' : 'var(--mm-rule)'}`,
                  fontSize: '11px',
                  letterSpacing: '0.14em',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = 'var(--mm-yellow)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.borderColor = 'var(--mm-rule)'
                  }
                }}
              >
                <def.Icon size={14} aria-hidden />
                <span>{def.shortLabel}</span>
                <span
                  className="tabular-nums"
                  style={{
                    marginLeft: 2,
                    padding: '1px 6px',
                    fontSize: '10px',
                    background: isActive ? 'var(--mm-yellow)' : 'var(--mm-panel)',
                    color: isActive ? 'var(--mm-black)' : 'var(--mm-muted)',
                    border: `1px solid ${isActive ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
                    letterSpacing: '0',
                  }}
                  aria-label={`${def.label} ${count}건`}
                >
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        {/* 선택된 필터의 Top N */}
        <div className="p-2">
          {rows.length === 0 ? (
            <div
              className="py-10 px-6 text-center"
              style={{ color: 'var(--mm-muted)' }}
            >
              <activeDef.Icon size={28} className="mx-auto mb-3" style={{ color: 'var(--mm-muted)', opacity: 0.6 }} aria-hidden />
              <p
                className="font-jersey font-black uppercase"
                style={{ fontSize: '15px', letterSpacing: '0.02em', color: 'var(--mm-ink)' }}
              >
                {activeDef.label}
              </p>
              <p
                className="mt-1.5 font-bold uppercase"
                style={{ fontSize: '11px', letterSpacing: '0.14em' }}
              >
                아직 스트릭이 없어요
              </p>
            </div>
          ) : (
            rows.map((r, i) => {
              const isTop = i === 0
              return (
                <button
                  key={`${activeFilter}-${r.player_id}`}
                  onClick={() => setQuickPlayer({ id: r.player_id, name: r.name })}
                  className="w-full flex items-center gap-3 lg:gap-4 text-left cursor-pointer group transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                  style={{
                    padding: isTop ? '14px 16px' : '12px 16px',
                    background: isTop ? 'var(--mm-yellow)' : 'transparent',
                    color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)',
                    borderLeft: `4px solid ${isTop ? 'var(--mm-black)' : 'transparent'}`,
                    minHeight: 44,
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
                  aria-label={
                    r.attendanceMode === 'longest'
                      ? `${r.name} 역대 최장 ${r.count}${activeDef.suffix} (현재 진행 중단)`
                      : `${r.name} ${r.count}${activeDef.suffix}${r.attendanceHistoricalMax ? ` · 역대 최장 ${r.attendanceHistoricalMax}R` : ''}`
                  }
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
                    <activeDef.Icon
                      size={isTop ? 18 : 16}
                      style={{ color: isTop ? 'var(--mm-yellow)' : 'var(--mm-ink)' }}
                      aria-hidden
                    />
                  </span>

                  {/* Player + Suffix */}
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
                      {r.name}
                      {r.number != null && (
                        <span
                          className="ml-2 font-bold tabular-nums"
                          style={{
                            color: isTop ? 'rgba(0,0,0,0.55)' : 'var(--mm-muted)',
                            fontSize: '12px',
                          }}
                        >
                          #{r.number}
                        </span>
                      )}
                    </p>
                    <p
                      className="font-bold uppercase mt-1.5 break-keep flex items-baseline flex-wrap gap-x-1.5 gap-y-0.5"
                      style={{
                        color: isTop ? 'rgba(0,0,0,0.65)' : 'var(--mm-muted)',
                        fontSize: '11px',
                        letterSpacing: '0.14em',
                        lineHeight: 1.3,
                      }}
                    >
                      {/* attendance · 진행 끊긴 케이스는 '역대 최장' 프리픽스 · 진행 중이면 기본 suffix */}
                      {r.attendanceMode === 'longest' ? (
                        <span>역대 최장 {r.count}{activeDef.suffix}</span>
                      ) : (
                        <span>{r.count}{activeDef.suffix}</span>
                      )}
                      {/* 진행 중이지만 역대 최장이 더 크면 소소하게 병기 */}
                      {r.attendanceHistoricalMax && (
                        <span
                          className="normal-case font-bold"
                          style={{
                            fontSize: '10px',
                            letterSpacing: '0.02em',
                            padding: '1px 5px',
                            background: isTop ? 'rgba(0,0,0,0.15)' : 'var(--mm-panel-alt)',
                            color: isTop ? 'rgba(0,0,0,0.7)' : 'var(--mm-ink-soft)',
                            border: `1px solid ${isTop ? 'rgba(0,0,0,0.15)' : 'var(--mm-rule)'}`,
                            borderRadius: '3px',
                          }}
                        >
                          역대 {r.attendanceHistoricalMax}R
                        </span>
                      )}
                    </p>
                  </div>

                  {/* Count */}
                  <div className="text-right shrink-0 flex items-baseline gap-2">
                    <span
                      className="font-jersey font-black tabular-nums leading-none"
                      style={{
                        color: isTop ? 'var(--mm-black)' : 'var(--mm-yellow-strong)',
                        fontSize: isTop ? '36px' : '30px',
                        letterSpacing: '-0.015em',
                      }}
                    >
                      {r.count}
                    </span>
                  </div>
                </button>
              )
            })
          )}
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
