'use client'
// NBA 드래프트 방송 스타일의 LED 스코어보드 컴포넌트.
//
// 큰 타이틀(예: "MIRACLE DRAFT 2026.3Q") + 라운드별 픽 슬롯 그리드.
// 진행 중인 픽은 팀 색상으로 글로우 + 펄스, 완료 픽은 차분, 미래 픽은 흐릿.
//
// 모바일(375px): 2열, sm: 4열, lg: 6열, xl: 8열.

import type { CSSProperties } from 'react'

interface Team { id: string; name: string; color: string }
interface Pick {
  pick_number: number
  round_number: number
  team_id: string
  player_id: string
  player_name: string
  player_number: number | null
  player_position: string | null
  picked_at: string
}

interface Props {
  title: string                       // "MIRACLE DRAFT 2026.3Q"
  teams: Team[]
  picks: Pick[]
  draftOrder: string[]
  method: 'snake' | 'linear'
  totalPicks: number
  currentPickIndex: number              // 0-based; 다음 픽 = currentPickIndex + 1
  status: string
}

export default function DraftScoreboard({ title, teams, picks, draftOrder, method, totalPicks, currentPickIndex, status }: Props) {
  if (draftOrder.length === 0) return null
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const rounds = Math.max(1, Math.ceil(totalPicks / draftOrder.length))
  const picksByNumber = new Map<number, Pick>()
  for (const p of picks) picksByNumber.set(p.pick_number, p)
  const currentPickNumber = status === 'in_progress' ? currentPickIndex + 1 : -1

  return (
    <div className="rounded-2xl border-2 border-amber-700/60 overflow-hidden mb-3 sm:mb-4 shadow-[0_0_32px_rgba(245,158,11,0.18)]"
      style={{
        background: 'linear-gradient(180deg, #0a0a0f 0%, #0f0a05 100%)',
      }}>
      {/* 헤더 — 경기장 LED 띠 스타일 */}
      <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-amber-700/40 flex items-center justify-between gap-3 flex-wrap"
        style={{
          background: 'linear-gradient(90deg, rgba(180,83,9,0.6) 0%, rgba(245,158,11,0.4) 50%, rgba(180,83,9,0.6) 100%)',
        }}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span aria-hidden className="text-2xl sm:text-3xl">🏀</span>
          <h2 className="text-xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white leading-none truncate break-keep"
            style={{ textShadow: '0 2px 4px rgba(0,0,0,0.6), 0 0 12px rgba(245,158,11,0.5)' }}>
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] sm:text-xs uppercase tracking-widest font-black text-amber-100 bg-black/40 px-2 py-1 rounded">LIVE</span>
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0" />
        </div>
      </div>

      {/* 본문 — 라운드별 그리드 */}
      <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
        {Array.from({ length: rounds }).map((_, idx) => {
          const round = idx + 1
          const orderForRound = method === 'snake' && round % 2 === 0 ? [...draftOrder].reverse() : draftOrder
          return (
            <div key={round}>
              <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-amber-300/90 mb-1.5"
                style={{ fontFamily: 'var(--font-bebas, system-ui, sans-serif)' }}>
                Round {round}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-1.5 sm:gap-2">
                {orderForRound.map((teamId, i) => {
                  const pickNumber = (round - 1) * draftOrder.length + i + 1
                  if (pickNumber > totalPicks) return null
                  const team = teamMap[teamId]
                  const pick = picksByNumber.get(pickNumber)
                  const isCurrent = pickNumber === currentPickNumber
                  const isCompleted = !!pick
                  const color = team?.color ?? '#6b7280'
                  const cellStyle: CSSProperties = isCurrent
                    ? {
                        background: `linear-gradient(180deg, ${color}66 0%, ${color}33 100%)`,
                        borderColor: color,
                        boxShadow: `0 0 0 1px ${color}aa, 0 0 18px ${color}99`,
                      }
                    : isCompleted
                      ? { background: 'rgba(15,15,15,0.85)', borderColor: `${color}55` }
                      : { background: 'rgba(20,20,20,0.5)', borderColor: 'rgba(75,85,99,0.3)' }
                  return (
                    <div
                      key={pickNumber}
                      className={`relative rounded-md border-2 p-1.5 sm:p-2 min-h-[60px] sm:min-h-[68px] flex flex-col gap-0.5 min-w-0 transition-all duration-200 ${
                        isCurrent ? 'animate-pulse' : ''
                      } ${isCompleted ? '' : 'opacity-80'}`}
                      style={cellStyle}
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        <span className="text-[10px] sm:text-xs font-black tabular-nums shrink-0"
                          style={{ color, fontFamily: 'var(--font-bebas, system-ui, sans-serif)' }}>
                          #{pickNumber}
                        </span>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-[10px] sm:text-[11px] font-bold text-gray-200 truncate min-w-0 break-keep">
                          {team?.name ?? '?'}
                        </span>
                      </div>
                      {pick ? (
                        <p className="text-xs sm:text-sm font-black text-white truncate leading-tight break-keep">
                          {pick.player_number != null && (
                            <span className="text-amber-300 mr-0.5 tabular-nums">#{pick.player_number}</span>
                          )}
                          {pick.player_name}
                        </p>
                      ) : isCurrent ? (
                        <p className="text-xs sm:text-sm font-black text-amber-200 tracking-wide">선택 중...</p>
                      ) : (
                        <p className="text-xs text-gray-600 font-mono">—</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
