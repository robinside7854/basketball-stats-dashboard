'use client'
// 미라클모닝 브랜드 — 최근 4주 라운드 요약
// 각 카드 = 1 라운드(=하루). 그 날 참여 팀별 W-L-득실차 요약.
// 카드 클릭 → DailyBoxscoreModal (해당 date 박스스코어)
// 팔레트: 노랑/검정/화이트 (mm-* 변수)

import { useState } from 'react'
import DailyBoxscoreModal from '@/components/league/DailyBoxscoreModal'

export type RoundTeamSummary = {
  key: string
  name: string
  color: string
  wins: number
  losses: number
  draws: number
  ptsFor: number
  ptsAgainst: number
}
export type RoundSummary = {
  date: string
  weekLabel: string
  gamesCount: number
  teams: RoundTeamSummary[]
}

type Props = {
  rounds: RoundSummary[]
  leagueId: string
}

function diff(t: { ptsFor: number; ptsAgainst: number }): number {
  return t.ptsFor - t.ptsAgainst
}
function record(t: { wins: number; losses: number; draws: number }): string {
  return t.draws > 0 ? `${t.wins}-${t.losses}-${t.draws}` : `${t.wins}-${t.losses}`
}

export default function NbaRoundsSummary({ rounds, leagueId }: Props) {
  const [openDate, setOpenDate] = useState<string | null>(null)
  if (rounds.length === 0) return null

  return (
    <>
      <section
        className="mm-brand"
        style={{
          background: 'var(--mm-panel-alt)',
          border: '1px solid var(--mm-rule)',
          borderTop: 0,
        }}
      >
        <header
          className="flex items-baseline justify-between px-6 md:px-8 py-4"
          style={{ borderBottom: '1px solid var(--mm-rule)' }}
        >
          <h3 className="font-jersey text-[22px] font-black uppercase tracking-wide" style={{ color: 'var(--mm-ink)' }}>
            최근 라운드
          </h3>
          <span className="text-[11px] tracking-[0.16em] uppercase font-bold" style={{ color: 'var(--mm-muted)' }}>
            최근 {rounds.length}주 · 하루=라운드
          </span>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-6 md:p-8">
          {rounds.map(r => {
            const topTeam = r.teams[0]
            return (
              <button
                key={r.date}
                onClick={() => setOpenDate(r.date)}
                className="text-left cursor-pointer transition-shadow duration-200 hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.25)]"
                style={{
                  background: 'var(--mm-panel)',
                  border: '1px solid var(--mm-rule)',
                  padding: '14px 16px 12px',
                }}
              >
                {/* 헤더 — 날짜 + 경기 수 */}
                <div className="flex items-baseline justify-between mb-3 pb-2" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                  <div>
                    <div className="font-jersey text-[18px] font-black uppercase" style={{ color: 'var(--mm-ink)' }}>
                      {r.weekLabel}
                    </div>
                    <div className="text-[10px] tracking-[0.16em] uppercase font-bold mt-0.5" style={{ color: 'var(--mm-muted)' }}>
                      {r.gamesCount} 경기 진행
                    </div>
                  </div>
                  {topTeam && (
                    <span
                      className="text-[10px] font-black tracking-widest uppercase"
                      style={{
                        background: 'var(--mm-yellow)',
                        color: 'var(--mm-black)',
                        padding: '2px 7px',
                      }}
                    >
                      1등 {topTeam.name}
                    </span>
                  )}
                </div>

                {/* 팀 리스트 */}
                <ul className="space-y-1.5">
                  {r.teams.slice(0, 4).map((t, idx) => {
                    const d = diff(t)
                    const isTop = idx === 0
                    return (
                      <li
                        key={t.key}
                        className="grid grid-cols-[6px_1fr_auto_auto] gap-2 items-center"
                        style={{
                          padding: '3px 0',
                          borderBottom: idx < r.teams.length - 1 && idx < 3 ? '1px dashed var(--mm-rule)' : 'none',
                        }}
                      >
                        <span
                          className="block h-4 rounded-sm"
                          style={{ background: t.color }}
                          aria-hidden
                        />
                        <span
                          className={`text-[13px] truncate ${isTop ? 'font-black' : 'font-semibold'}`}
                          style={{ color: 'var(--mm-ink)' }}
                        >
                          {t.name}
                        </span>
                        <span
                          className="font-jersey text-[14px] font-black tabular-nums"
                          style={{ color: isTop ? 'var(--mm-yellow-strong)' : 'var(--mm-ink)' }}
                        >
                          {record(t)}
                        </span>
                        <span
                          className="text-[11px] font-bold tabular-nums"
                          style={{
                            color: d > 0 ? '#059669' : d < 0 ? '#DC2626' : 'var(--mm-muted)',
                            minWidth: '38px',
                            textAlign: 'right',
                          }}
                        >
                          {d > 0 ? `+${d}` : d}
                        </span>
                      </li>
                    )
                  })}
                </ul>

                {/* 하단 액션 힌트 */}
                <div
                  className="mt-3 pt-2 text-[10px] tracking-[0.14em] uppercase font-bold text-right"
                  style={{ borderTop: '1px dashed var(--mm-rule)', color: 'var(--mm-muted)' }}
                >
                  박스스코어 →
                </div>
              </button>
            )
          })}
        </div>
      </section>

      {openDate && (
        <DailyBoxscoreModal
          leagueId={leagueId}
          date={openDate}
          onClose={() => setOpenDate(null)}
        />
      )}
    </>
  )
}
