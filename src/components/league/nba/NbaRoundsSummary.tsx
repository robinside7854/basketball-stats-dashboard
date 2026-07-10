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
          className="flex items-baseline justify-between px-8 md:px-10 py-5"
          style={{ borderBottom: '1px solid var(--mm-rule)' }}
        >
          <h3
            className="font-jersey font-black uppercase"
            style={{ color: 'var(--mm-ink)', fontSize: '28px', letterSpacing: '-0.005em' }}
          >
            최근 라운드
          </h3>
          <span className="text-[12px] tracking-[0.18em] uppercase font-bold" style={{ color: 'var(--mm-muted)' }}>
            최근 {rounds.length}주 · 하루 = 1라운드
          </span>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-8 md:p-10">
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
                  padding: '18px 20px 16px',
                }}
              >
                {/* 헤더 — 날짜 + 경기 수 */}
                <div className="flex items-baseline justify-between mb-4 pb-3" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                  <div>
                    <div className="font-jersey font-black uppercase" style={{ color: 'var(--mm-ink)', fontSize: '22px', letterSpacing: '-0.005em' }}>
                      {r.weekLabel}
                    </div>
                    <div className="text-[11px] tracking-[0.16em] uppercase font-bold mt-1" style={{ color: 'var(--mm-muted)' }}>
                      {r.gamesCount}경기 진행
                    </div>
                  </div>
                  {topTeam && (
                    <span
                      className="text-[11px] font-black tracking-widest uppercase shrink-0"
                      style={{
                        background: 'var(--mm-yellow)',
                        color: 'var(--mm-black)',
                        padding: '3px 8px',
                      }}
                    >
                      1위 {topTeam.name}
                    </span>
                  )}
                </div>

                {/* 팀 리스트 */}
                <ul className="space-y-2">
                  {r.teams.slice(0, 4).map((t, idx) => {
                    const d = diff(t)
                    const isTop = idx === 0
                    const shownCount = Math.min(4, r.teams.length)
                    return (
                      <li
                        key={t.key}
                        className="grid gap-2.5 items-center"
                        style={{
                          gridTemplateColumns: '8px 1fr auto auto',
                          padding: '5px 0',
                          borderBottom: idx < shownCount - 1 ? '1px dashed var(--mm-rule)' : 'none',
                        }}
                      >
                        <span
                          className="block h-5 rounded-sm"
                          style={{ background: t.color }}
                          aria-hidden
                        />
                        <span
                          className={`truncate ${isTop ? 'font-black' : 'font-bold'}`}
                          style={{ color: 'var(--mm-ink)', fontSize: '15px' }}
                        >
                          {t.name}
                        </span>
                        <span
                          className="font-jersey font-black tabular-nums"
                          style={{ color: isTop ? 'var(--mm-yellow-strong)' : 'var(--mm-ink)', fontSize: '16px' }}
                        >
                          {record(t)}
                        </span>
                        <span
                          className="font-black tabular-nums"
                          style={{
                            color: d > 0 ? '#059669' : d < 0 ? '#DC2626' : 'var(--mm-muted)',
                            fontSize: '13px',
                            minWidth: '44px',
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
                  className="mt-4 pt-2.5 text-[11px] tracking-[0.16em] uppercase font-bold text-right"
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
