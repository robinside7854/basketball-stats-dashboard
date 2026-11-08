'use client'
// 홈 「이번 달 우리 팀」 (2026-11-08 운영진 — 홈 리그 리더 자리).
//   미라클은 달마다 팀과 유니폼 색이 바뀐다 → 홈에서 「이번 달 내 팀·유니폼·팀원」을 바로 보이게.
//   데이터: GET /month-teams (명단 탭과 같은 소속 규칙 — 이번 달 정규 → 없으면 지금 분기 정규).
//   로그인한 회원은 내 팀이 맨 앞 + 노란 테두리(내 줄 강조와 같은 모양). 얼굴을 누르면 선수 카드.
import { useEffect, useState } from 'react'
import { Crown, Shirt } from 'lucide-react'
import Avatar from '@/components/league/ui/Avatar'
import { useOptionalCurrentUser } from '@/contexts/LeagueAuthContext'
import { useOpenPlayerCard } from '@/contexts/PlayerCardContext'
import { swatchEdge, accentOrInk } from '@/lib/util/contrastColor'
import { UNIFORM_LABEL } from '@/lib/league/uniformPhoto'
import type { MonthTeamsResponse } from '@/app/api/leagues/[leagueId]/month-teams/route'

const UNIFORM_FILL = { yellow: '#F2B705', white: '#ffffff', black: '#1a1a1a' } as const

export default function HomeMonthTeams({ leagueId }: { leagueId: string }) {
  const me = useOptionalCurrentUser()?.user ?? null
  const openCard = useOpenPlayerCard()
  const [data, setData] = useState<MonthTeamsResponse | null>(null)
  const [state, setState] = useState<'loading' | 'ok' | 'gated' | 'error'>('loading')

  useEffect(() => {
    let alive = true
    fetch(`/api/leagues/${leagueId}/month-teams`)
      .then(async r => {
        if (!alive) return
        if (r.status === 401) { setState('gated'); return }
        if (!r.ok) { setState('error'); return }
        setData(await r.json()); setState('ok')
      })
      .catch(() => { if (alive) setState('error') })
    return () => { alive = false }
  }, [leagueId])

  // 비회원(비공개 리그)·실패·팀 없음은 칸을 그리지 않는다 — 빈 카드를 보이지 않게
  if (state === 'gated' || state === 'error') return null
  if (state === 'ok' && (!data || data.teams.length === 0)) return null

  const myTeamId = me?.player_id && data ? data.teams.find(t => t.members.some(m => m.id === me.player_id))?.id ?? null : null
  const teams = data ? [...data.teams].sort((a, b) => Number(b.id === myTeamId) - Number(a.id === myTeamId)) : []

  return (
    <section aria-labelledby="home-month-teams-title" className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
        <h2 id="home-month-teams-title" className="font-black break-keep pl-2.5"
          style={{ color: 'var(--mm-ink)', fontSize: 'clamp(22px, 6vw, 26px)', lineHeight: 1.15 }}>
          {data ? `${data.monthLabel} 우리 팀` : '이번 달 우리 팀'}
        </h2>
        <span className="text-xs font-bold break-keep" style={{ color: 'var(--mm-ink-soft)' }}>팀 · 유니폼 · 팀원</span>
      </div>

      {state === 'loading' ? (
        <div className="grid gap-3 lg:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map(i => <div key={i} className="mm-shimmer h-40" style={{ borderRadius: 'var(--mm-radius-card)' }} />)}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {teams.map(t => {
            const mine = t.id === myTeamId
            return (
              <article key={t.id} aria-label={`${t.name}${mine ? ' (내 팀)' : ''}`}
                className="px-4 py-3.5"
                style={{
                  background: 'var(--mm-panel)', borderRadius: 'var(--mm-radius-card)',
                  border: mine ? '2px solid var(--mm-yellow-strong)' : '1px solid var(--mm-rule)',
                  boxShadow: 'var(--mm-shadow-sm)',
                }}>
                <header className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span aria-hidden className="w-3 h-3 rounded-full shrink-0" style={{ background: t.color, boxShadow: swatchEdge(t.color) }} />
                  <h3 className="font-black text-base break-keep" style={{ color: 'var(--mm-ink)' }}>{t.name}</h3>
                  {mine && <span className="text-xs font-black px-1.5 py-0.5" style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: 'var(--mm-radius-chip)' }}>내 팀</span>}
                  <span className="ml-auto inline-flex items-center gap-1 text-xs font-bold whitespace-nowrap" style={{ color: 'var(--mm-ink-soft)' }}>
                    <Shirt size={14} aria-hidden />
                    {/* 색을 안 고른 팀은 프로필 사진과 같게 노랑(기본) — uniformPhoto.ts applyMonthlyPhotos 와 같은 규칙 */}
                    <span aria-hidden className="w-3 h-3 rounded-full" style={{ background: UNIFORM_FILL[t.uniform ?? 'yellow'], boxShadow: 'inset 0 0 0 1.5px var(--mm-ink-soft)' }} />
                    {UNIFORM_LABEL[t.uniform ?? 'yellow']} 유니폼{t.uniform ? '' : '(기본)'}
                  </span>
                </header>
                <ul className="mt-3 grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-4 gap-x-1.5 gap-y-2.5">
                  {t.members.map(m => {
                    const isMe = m.id === me?.player_id
                    const face = (
                      <>
                        <span className="relative">
                          <Avatar src={m.photo_url} name={m.name} size={56} ringColor={isMe ? 'var(--mm-yellow-strong)' : accentOrInk(t.color)} decorative />
                          {m.leader && (
                            <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-5 h-5 rounded-full"
                              style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', boxShadow: 'var(--mm-shadow-sm)' }} title="팀장">
                              <Crown size={12} strokeWidth={2.5} aria-label="팀장" />
                            </span>
                          )}
                        </span>
                        <span className="text-xs font-bold text-center leading-tight" style={{ color: isMe ? 'var(--mm-ink)' : 'var(--mm-ink-soft)', wordBreak: 'keep-all' }}>{m.name}</span>
                      </>
                    )
                    return (
                      <li key={m.id} className="min-w-0">
                        {openCard ? (
                          <button type="button" onClick={() => openCard({ playerId: m.id, playerName: m.name })}
                            className="mm-press w-full flex flex-col items-center gap-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                            aria-label={`${m.name}${m.leader ? ' 팀장' : ''} 선수 카드 열기`}>
                            {face}
                          </button>
                        ) : (
                          <div className="flex flex-col items-center gap-1">{face}</div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
