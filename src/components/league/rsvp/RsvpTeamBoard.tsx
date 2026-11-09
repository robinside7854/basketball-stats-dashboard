'use client'
// 팀별 참가 현황 (2026-11-09 운영진 — 매주 단톡방 공지 캡처처럼 「색 점 · 팀명 · 인원 · 이름 · 포지션」)
//   색 점 = 그 달 유니폼 색(league_team_month_uniforms, 안 고르면 노랑 기본). 어드민은 점을 눌러 노랑·흰색·검정을 바로 고른다
//   — 「명단 편집 → 달별 정규 멤버」 팀 칸 머리의 색 고르기와 같은 저장(PUT /month-uniforms, 이번 달이면 프로필 사진도 맞춰진다).
//   배치 안 된 「참」은 맨 끝 「팀 정하는 중」 카드에 모인다.
import { useState } from 'react'
import { toast } from 'sonner'
import { UNIFORM_FILL, UNIFORM_NAME, KIND_LABEL, type RsvpEntryView, type RsvpRes } from './rsvpTypes'

type Team = NonNullable<RsvpRes['teams']>[number]
type Uni = keyof typeof UNIFORM_FILL

function Dot({ uniform, size = 22 }: { uniform: Uni | null; size?: number }) {
  return (
    <span aria-hidden className="inline-block rounded-full shrink-0"
      style={{ width: size, height: size, background: UNIFORM_FILL[uniform ?? 'yellow'], boxShadow: 'inset 0 0 0 1.5px var(--mm-rule)' }} />
  )
}

export default function RsvpTeamBoard({
  leagueId, gameDate, teams, yes, admin, onChanged, compact = false,
}: {
  leagueId: string
  gameDate: string
  teams: Team[]
  yes: RsvpEntryView[]
  admin: boolean
  onChanged: () => void
  compact?: boolean
}) {
  const [picking, setPicking] = useState<string | null>(null)
  const unplaced = yes.filter(e => !e.placed_team_id)

  async function setUniform(teamId: string, uniform: Uni | null) {
    setPicking(null)
    const res = await fetch(`/api/leagues/${leagueId}/month-uniforms`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: `${gameDate.slice(0, 7)}-01`, team_id: teamId, uniform }),
    })
    const j = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(j.error ?? '유니폼 색을 저장하지 못했어요'); return }
    toast.success(uniform ? `${UNIFORM_NAME[uniform]} 유니폼으로 정했어요` : '유니폼 색 지정을 풀었어요(기본 노랑)')
    onChanged()
  }

  const card = 'p-4 lg:p-5 min-w-0'
  const cardStyle = { background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' }

  return (
    <div className={`grid gap-2 ${compact ? 'sm:grid-cols-3' : 'sm:grid-cols-2 lg:grid-cols-3'}`}>
      {teams.map(t => {
        const members = yes.filter(e => e.placed_team_id === t.id)
        return (
          <div key={t.id} className={card} style={cardStyle}>
            <div className="flex items-center justify-between gap-2">
              <span className="relative inline-flex items-center gap-2 min-w-0">
                {admin ? (
                  <button type="button" onClick={() => setPicking(p => p === t.id ? null : t.id)} aria-label={`${t.name} 유니폼 색 고르기`}
                    className="mm-press inline-flex items-center justify-center w-11 h-11 -m-2.5">
                    <Dot uniform={t.uniform} />
                  </button>
                ) : <Dot uniform={t.uniform} />}
                <b className="font-black text-lg break-keep" style={{ color: 'var(--mm-ink)' }}>{t.name}팀</b>
                {picking === t.id && (
                  <span className="absolute left-0 top-full mt-1 z-20 flex items-center gap-1.5 p-2"
                    style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', boxShadow: 'var(--mm-shadow-md)', borderRadius: 'var(--mm-radius-ctl)' }}>
                    {(['yellow', 'white', 'black'] as const).map(u => (
                      <button key={u} type="button" onClick={() => setUniform(t.id, u)} aria-label={`${UNIFORM_NAME[u]} 유니폼`}
                        className="mm-press inline-flex flex-col items-center gap-0.5 min-w-11 min-h-11 px-1 text-xs font-bold" style={{ color: 'var(--mm-ink)' }}>
                        <span className="rounded-full" style={{ width: 22, height: 22, background: UNIFORM_FILL[u], boxShadow: t.uniform === u ? '0 0 0 2px var(--mm-ink)' : 'inset 0 0 0 1.5px var(--mm-rule)' }} />
                        {UNIFORM_NAME[u]}
                      </button>
                    ))}
                    {t.uniform && (
                      <button type="button" onClick={() => setUniform(t.id, null)} className="mm-press min-h-11 px-1 text-xs font-bold underline" style={{ color: 'var(--mm-ink-soft)' }}>지정 풀기</button>
                    )}
                  </span>
                )}
              </span>
              <span className="text-sm tabular-nums shrink-0" style={{ color: 'var(--mm-muted)' }}>{members.length}명</span>
            </div>
            {members.length === 0 ? (
              <p className="text-sm mt-2" style={{ color: 'var(--mm-muted)' }}>아직 없어요</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {members.map(m => (
                  <li key={m.player_id} className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-base" style={{ color: 'var(--mm-ink)' }}>{m.name}</span>
                    {m.position && <span className="text-sm" style={{ color: 'var(--mm-muted)' }}>{m.position}</span>}
                    {m.kind !== 'regular' && <span className="text-xs font-bold" style={{ color: 'var(--mm-ink-soft)' }}>{KIND_LABEL[m.kind]}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
      {unplaced.length > 0 && (
        <div className={card} style={{ ...cardStyle, borderStyle: 'dashed' }}>
          <div className="flex items-center justify-between gap-2">
            <b className="font-black text-lg" style={{ color: 'var(--mm-ink)' }}>팀 정하는 중</b>
            <span className="text-sm tabular-nums" style={{ color: 'var(--mm-muted)' }}>{unplaced.length}명</span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {unplaced.map(m => (
              <li key={m.player_id} className="flex items-baseline gap-2 flex-wrap">
                <span className="text-base" style={{ color: 'var(--mm-ink)' }}>{m.name}</span>
                {m.position && <span className="text-sm" style={{ color: 'var(--mm-muted)' }}>{m.position}</span>}
                <span className="text-xs font-bold" style={{ color: 'var(--mm-ink-soft)' }}>{KIND_LABEL[m.kind]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
