'use client'
// 커리어 배지 — 누적(계속 나오면 받는다)과 첫 기록(누구나 한 번은 겪는다).
//
// 왜 기존 PlayerBadgeStrip 에 얹지 않았나: 그 컴포넌트는 배지를 누르면 **그 경기로 이동**하는
//   것이 핵심 동작이다. 커리어 배지는 특정 경기가 아니라 누적의 결과라 갈 경기가 없다.
//   같은 줄에 섞으면 어떤 건 눌리고 어떤 건 안 눌리는 화면이 된다.
//
// 표시 원칙:
//   · 못 받은 배지도 흐리게 보여준다 — "다음에 뭘 받을 수 있는지"가 참여 동기다.
//     받은 것만 보여주면 이제 막 시작한 회원 화면은 영원히 비어 있다.
//   · 달성일을 함께 적는다. 누적 배지는 "언제 넘었나"가 기록의 일부다.
import { useEffect, useState } from 'react'
import { CalendarCheck, Flame, Target, Layers } from 'lucide-react'

interface BadgeRow { badge_type: string; earned_at_date: string }

// 카탈로그 — careerBadges.ts 의 badge_type 과 1:1. 순서가 곧 화면 순서(쉬운 것 → 어려운 것).
const CAREER: Array<{ key: string; label: string; hint: string; Icon: typeof Flame }> = [
  { key: 'career_first_three', label: '첫 3점',        hint: '3점슛 첫 성공',       Icon: Target },
  { key: 'career_first_dd',    label: '첫 더블더블',    hint: '두 부문 두 자릿수',    Icon: Layers },
  { key: 'career_rounds_10',   label: '10라운드',      hint: '10일 출전',           Icon: CalendarCheck },
  { key: 'career_rounds_25',   label: '25라운드',      hint: '25일 출전',           Icon: CalendarCheck },
  { key: 'career_rounds_50',   label: '50라운드',      hint: '50일 출전',           Icon: CalendarCheck },
  { key: 'career_rounds_100',  label: '100라운드',     hint: '100일 출전',          Icon: CalendarCheck },
  { key: 'career_pts_100',     label: '100점',        hint: '누적 득점 100',        Icon: Flame },
  { key: 'career_pts_250',     label: '250점',        hint: '누적 득점 250',        Icon: Flame },
  { key: 'career_pts_500',     label: '500점',        hint: '누적 득점 500',        Icon: Flame },
  { key: 'career_pts_1000',    label: '1000점',       hint: '누적 득점 1000',       Icon: Flame },
]

export default function CareerBadgeStrip({ leagueId, playerId }: { leagueId: string; playerId: string }) {
  const [earned, setEarned] = useState<Map<string, string> | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/leagues/${leagueId}/players/${playerId}/badges`)
      .then(r => (r.ok ? r.json() : { badges: [] }))
      .then(d => {
        if (cancelled) return
        const m = new Map<string, string>()
        for (const b of (d.badges ?? []) as BadgeRow[]) {
          if (b.badge_type.startsWith('career_')) m.set(b.badge_type, b.earned_at_date)
        }
        setEarned(m)
      })
      .catch(() => { if (!cancelled) setEarned(new Map()) })
    return () => { cancelled = true }
  }, [leagueId, playerId])

  // 로딩 중에는 자리만 잡아 둔다 — 나중에 밀려 내려오면 다른 카드가 튄다.
  if (!earned) return <div className="h-[76px]" aria-hidden />

  const got = CAREER.filter(c => earned.has(c.key)).length

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>
          커리어
        </p>
        <span className="text-[11px] font-black tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>
          {got}/{CAREER.length}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {CAREER.map(c => {
          const date = earned.get(c.key)
          const has = !!date
          const Icon = c.Icon
          return (
            <span
              key={c.key}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5"
              style={{
                background: has ? 'var(--mm-yellow-soft)' : 'var(--mm-panel-alt)',
                border: `1px solid ${has ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
                borderRadius: 'var(--mm-radius-chip)',
                // 못 받은 것은 흐리게 — 아예 숨기면 목표가 안 보이고, 같은 밝기면 받은 것이 안 보인다
                opacity: has ? 1 : 0.55,
              }}
              title={has ? `${c.hint} · ${date} 달성` : `${c.hint} — 아직`}
            >
              <Icon size={13} aria-hidden style={{ color: has ? 'var(--mm-yellow-strong)' : 'var(--mm-muted)' }} />
              <span className="text-[12px] font-bold" style={{ color: has ? 'var(--mm-ink)' : 'var(--mm-muted)' }}>
                {c.label}
              </span>
            </span>
          )
        })}
      </div>
    </div>
  )
}
