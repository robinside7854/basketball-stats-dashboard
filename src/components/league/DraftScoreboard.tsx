'use client'
// NBA 드래프트 방송 스타일의 LED 스코어보드 컴포넌트.
//
// 큰 타이틀(예: "MIRACLE DRAFT 2026.3Q") + 라운드별 픽 슬롯 그리드.
// 진행 중인 픽은 팀 색상으로 글로우 + 펄스, 완료 픽은 차분, 미래 픽은 흐릿.
//
// 모바일(375px): 2열, sm: 4열, lg: 6열, xl: 8열.

import type { CSSProperties } from 'react'
import { Trophy } from 'lucide-react'
import { seededShuffle } from '@/lib/draft/shuffle'
import { teamInk, teamAccentOnDark, blendHex } from '@/lib/util/contrastColor'

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
  /** pick_number → 그 픽에 걸린 초. 없으면 소요 시간 칩을 렌더하지 않는다. */
  pickDurations?: Record<number, number>
  /** 자동픽·마지막 자동 등록 — 소요 시간 대신 "자동" 으로 표시 */
  autoPickNumbers?: number[]
  /**
   * draft.started_at (ISO). 소요 시간은 pickDurations 에 이미 계산돼 들어오므로
   * 이 컴포넌트는 값을 쓰지 않는다. 호출부가 두 컴포넌트에 같은 props 를 넘길 수 있도록 받아만 둔다.
   */
  startedAt?: string | null
  /**
   * 발표 모드 — 픽 순서를 숨기고 "팀별 명단"만 보여준다.
   * 라운드 보드는 격자 자체가 픽 순서라 번호만 지워도 순서가 그대로 읽힌다. 그래서 통째로 바꾼다.
   */
  hideOrder?: boolean
}

/** 47 → "47초", 92 → "1분 32초" */
function formatSec(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return `${s}초`
  return `${Math.floor(s / 60)}분 ${s % 60}초`
}

export default function DraftScoreboard({ title, teams, picks, draftOrder, method, totalPicks, currentPickIndex, status, pickDurations, autoPickNumbers, hideOrder = false }: Props) {
  const autoSet = new Set(autoPickNumbers ?? [])
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
      <div className="px-4 py-4 sm:px-6 sm:py-5 border-b border-amber-700/40 flex items-center justify-between gap-3 flex-wrap"
        style={{
          background: 'linear-gradient(90deg, rgba(180,83,9,0.6) 0%, rgba(245,158,11,0.4) 50%, rgba(180,83,9,0.6) 100%)',
        }}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span aria-hidden className="inline-flex items-center shrink-0 text-amber-100">
            {/* 아이콘 4단계(14/16/20/24) 예외 — 옆 제목이 lg 에서 text-5xl(48px)까지 커지는
                전광판 락업이다. 제목 크기를 따라가야 해서 아이콘 스케일 대상이 아니다. */}
            <Trophy className="w-8 h-8 sm:w-10 sm:h-10 lg:w-12 lg:h-12" />
          </span>
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black tracking-tight text-white leading-none truncate break-keep"
            style={{ textShadow: '0 2px 4px rgba(0,0,0,0.6), 0 0 12px rgba(245,158,11,0.5)' }}>
            {title}
          </h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm sm:text-base uppercase tracking-widest font-black text-amber-100 bg-black/50 px-3 py-1.5 rounded">LIVE</span>
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse shrink-0" />
        </div>
      </div>

      {/* 발표 모드 — 팀별 명단만. 번호·라운드 없이, 팀마다 고정 시드로 섞은 순서. */}
      {hideOrder ? (
        <div className="p-3 sm:p-4 lg:p-5">
          <div className="grid gap-3 sm:gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
            {seededShuffle(teams, `teams:${teams.map(t => t.id).join(',')}`).map(team => {
              const roster = seededShuffle(picks.filter(p => p.team_id === team.id), team.id)
              return (
                <div
                  key={team.id}
                  className="rounded-lg border-2 p-3 sm:p-4 min-w-0"
                  style={{ background: 'rgba(15,15,15,0.85)', borderColor: `${team.color}66` }}
                >
                  <div className="flex items-center gap-2 mb-2 min-w-0">
                    <span className="w-4 h-4 rounded-full shrink-0 border" style={{ background: teamInk(team.color).bg, borderColor: teamInk(team.color).border }} />
                    <span className="text-base sm:text-lg font-black text-white truncate min-w-0 break-keep">{team.name}</span>
                    <span className="ml-auto text-sm font-mono tabular-nums text-gray-400 shrink-0">{roster.length}명</span>
                  </div>
                  {roster.length === 0 ? (
                    <p className="text-sm text-gray-500 py-2">—</p>
                  ) : (
                    <div className="space-y-1">
                      {roster.map(p => (
                        <p key={p.player_id} className="text-base sm:text-lg font-bold text-gray-100 truncate min-w-0 break-keep">
                          {p.player_name}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
      /* 본문 — 라운드별 그리드. auto-fit + minmax 로 가용 폭을 모두 채워 픽 셀이 좌측에만 몰리는 현상 방지. */
      <div className="p-3 sm:p-4 lg:p-5 space-y-6 sm:space-y-8">
        {Array.from({ length: rounds }).map((_, idx) => {
          const round = idx + 1
          const orderForRound = method === 'snake' && round % 2 === 0 ? [...draftOrder].reverse() : draftOrder
          return (
            <div key={round}>
              <p className="text-base sm:text-lg lg:text-xl font-black uppercase tracking-widest text-amber-300/90 mb-2 sm:mb-3"
                style={{ fontFamily: 'var(--font-bebas, system-ui, sans-serif)' }}>
                Round {round}
              </p>
              <div
                className="grid gap-3 sm:gap-4"
                style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
              >
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
                  // 현재 칸은 배경이 팀 컬러 40% 틴트다 — 검정 기준으로 잰 액센트는 여기서 미달한다
                  const numberColor = teamAccentOnDark(color, isCurrent ? blendHex(color, '#0a0a0f', 0.4) : '#0a0a0f')
                  const durationSec = autoSet.has(pickNumber) ? undefined : pickDurations?.[pickNumber]
                  const isAutoPick = autoSet.has(pickNumber)
                  return (
                    <div
                      key={pickNumber}
                      className={`relative rounded-lg border-2 p-4 sm:p-5 lg:p-6 min-h-[80px] sm:min-h-[100px] lg:min-h-[120px] flex flex-col gap-1.5 sm:gap-2 min-w-0 transition-all duration-200 ${
                        isCurrent ? 'draft-current-cell animate-pulse' : ''
                      } ${isCompleted ? '' : 'opacity-80'}`}
                      style={cellStyle}
                    >
                      {/* 러닝 보더 — 현재 픽 칸 테두리를 팀 컬러 조각이 시계방향으로 2초에 한 바퀴.
                          svg 를 기존 border-2 밴드 중앙선 위에 겹쳐 깔아서 셀 크기·레이아웃은 그대로다(아래 CSS).
                          pathLength=100 으로 둘레를 정규화해서 390px 작은 칸과 1920px 넓은 칸에서
                          조각 길이 비율이 같게 보인다(실제 둘레를 재지 않아도 됨). */}
                      {isCurrent && (
                        <svg
                          aria-hidden
                          className="draft-run-border"
                          width="100%"
                          height="100%"
                          preserveAspectRatio="none"
                        >
                          <rect
                            className="draft-run-rect"
                            x="0"
                            y="0"
                            width="100%"
                            height="100%"
                            rx="7"
                            ry="7"
                            fill="none"
                            stroke={color}
                            strokeWidth="2"
                            strokeLinecap="round"
                            pathLength={100}
                            strokeDasharray="22 78"
                          />
                        </svg>
                      )}
                      <div className="flex items-center gap-2 min-w-0 relative">
                        <span className="text-base sm:text-lg font-black tabular-nums shrink-0"
                          style={{ color: numberColor, fontFamily: 'var(--font-bebas, system-ui, sans-serif)' }}>
                          #{pickNumber}
                        </span>
                        <span className="w-4 h-4 sm:w-5 sm:h-5 rounded-full shrink-0 border" style={{ background: teamInk(color).bg, borderColor: teamInk(color).border }} />
                        <span className="text-sm sm:text-base font-bold text-gray-100 truncate min-w-0 break-keep">
                          {team?.name ?? '?'}
                        </span>
                      </div>
                      {pick ? (
                        <>
                          <p className="text-xl sm:text-2xl lg:text-3xl font-black text-white truncate leading-tight break-keep relative">
                            {pick.player_number != null && (
                              <span className="text-amber-300 mr-1 tabular-nums">#{pick.player_number}</span>
                            )}
                            {pick.player_name}
                          </p>
                          {/* 소요 시간 칩 — gap-1.5(6px) + leading-none(14px) - 2px = +18px 로 행 높이 증가를 묶는다. */}
                          {typeof durationSec === 'number' && (
                            <p className="text-sm font-mono tabular-nums leading-none -mt-0.5 text-gray-400 truncate relative">
                              {formatSec(durationSec)}
                            </p>
                          )}
                          {isAutoPick && (
                            <p className="text-sm leading-none -mt-0.5 text-gray-400 truncate relative">자동</p>
                          )}
                        </>
                      ) : isCurrent ? (
                        <p className="text-xl sm:text-2xl lg:text-3xl font-black text-amber-200 tracking-wide relative">선택 중...</p>
                      ) : (
                        <p className="text-base sm:text-lg text-gray-500 font-mono">—</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      )}

      <style jsx>{`
        .draft-run-border {
          position: absolute;
          /* absolute 의 포함 블록은 셀의 padding box(=border 안쪽)다.
             border-2 밴드 중앙선까지 나가려면 각 변으로 1px 확장해야 한다.
             그래야 stroke-width:2 가 기존 테두리에 정확히 겹쳐 셀 크기가 안 변한다. */
          top: -1px;
          left: -1px;
          width: calc(100% + 2px);
          height: calc(100% + 2px);
          pointer-events: none;
          overflow: visible;
        }
        .draft-run-rect {
          stroke-dashoffset: 0;
          animation: draftRunBorder 2s linear infinite;
        }
        @keyframes draftRunBorder {
          /* 음수 방향 = SVG rect 패스 진행 방향 = 시계방향 */
          to { stroke-dashoffset: -100; }
        }
        @media (prefers-reduced-motion: reduce) {
          /* 움직이는 조각을 아예 빼고, 이미 깔린 팀 컬러 2px 정적 테두리만 남긴다. */
          .draft-run-border { display: none; }
          /* Tailwind animate-pulse(투명도 펄스) 끄기 */
          .draft-current-cell { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
