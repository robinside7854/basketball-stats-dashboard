'use client'
// 개인특성 배지 패널 — 그 선수가 어떤 유형인지 보여준다.
//
// 자동 배지(퍼펙트게임·더블더블 등)가 "잘한 순간"을 세는 것과 달리, 이쪽은 **누적 성향**이다.
// 득점이 적어도 자기 색깔(공격리바·킥아웃·안전운반 등)로 받을 수 있어야 한다는 게 설계 의도다.
//
// 판정은 서버에서 리그 전원을 한 번에 계산한다 — 상위 백분율이라 한 명만 떼서 계산할 수 없다.

import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'
import {
  TRAIT_BY_CODE, TRAIT_CATEGORY_LABELS, formatTraitValue,
  type EarnedTrait, type TraitTier,
} from '@/lib/badges/traitBadges'

interface Props {
  leagueId: string
  playerId: string
}

const TIER_STYLE: Record<TraitTier, { label: string; fg: string; bg: string; bd: string }> = {
  gold:   { label: '골드',   fg: '#8A6410', bg: 'rgba(223,180,63,0.16)',  bd: 'rgba(223,180,63,0.55)' },
  silver: { label: '실버',   fg: '#5E656E', bg: 'rgba(140,150,160,0.16)', bd: 'rgba(140,150,160,0.55)' },
  bronze: { label: '브론즈', fg: '#8A4A20', bg: 'rgba(203,122,68,0.16)',  bd: 'rgba(203,122,68,0.55)' },
}

export default function TraitBadgePanel({ leagueId, playerId }: Props) {
  // 결과에 "어느 선수 것인가"를 함께 담는다. 이펙트 안에서 동기적으로 초기화하면
  // 렌더가 연쇄로 다시 도는데(react-hooks/set-state-in-effect), 선수를 바꿨을 때
  // 이전 선수 배지가 잠깐 보이는 것도 막아야 해서 이 방식을 쓴다.
  const [state, setState] = useState<{ pid: string; badges: EarnedTrait[] | null; failed: boolean }>(
    { pid: '', badges: null, failed: false },
  )

  useEffect(() => {
    let alive = true
    fetch(`/api/leagues/${leagueId}/trait-badges`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(String(r.status))))
      .then((d: { badges: Record<string, EarnedTrait[]> }) => {
        if (alive) setState({ pid: playerId, badges: d.badges?.[playerId] ?? [], failed: false })
      })
      // 조용히 빈 목록으로 넘기면 "배지 없음"과 구분이 안 된다 — 실패를 상태로 남긴다
      .catch(() => { if (alive) setState({ pid: playerId, badges: null, failed: true }) })
    return () => { alive = false }
  }, [leagueId, playerId])

  const settled = state.pid === playerId
  const failed = settled && state.failed
  const badges = settled ? state.badges : null

  if (failed) {
    return (
      <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>
        특성 배지를 불러오지 못했습니다.
      </p>
    )
  }
  if (badges === null) {
    return (
      <div className="flex gap-1.5" aria-label="특성 배지 불러오는 중">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-[52px] flex-1 animate-pulse"
            style={{ background: 'var(--mm-panel-alt)', borderRadius: '4px' }} />
        ))}
      </div>
    )
  }
  if (badges.length === 0) {
    return (
      <p className="text-xs leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
        아직 특성 배지가 없습니다. 3라운드 이상 출전하면 판정이 시작됩니다.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {badges.map(b => {
          const def = TRAIT_BY_CODE[b.code]
          if (!def) return null
          const st = TIER_STYLE[b.tier]
          return (
            <div
              key={b.code}
              title={`${def.name} · ${st.label} — ${def.criteria}`}
              className="flex items-center gap-2 px-2.5 py-1.5 min-h-11"
              style={{ background: st.bg, border: `1px solid ${st.bd}`, borderRadius: '4px' }}
            >
              <span aria-hidden className="text-base leading-none">{def.icon}</span>
              <span className="min-w-0">
                <span className="block text-xs font-bold leading-tight" style={{ color: 'var(--mm-ink)' }}>
                  {def.name}
                </span>
                <span className="block text-[10px] font-mono leading-tight tabular-nums" style={{ color: st.fg }}>
                  {st.label} · {formatTraitValue(b.code, b.value)}
                  {b.rank != null && ` · ${b.rank}/${b.poolSize}위`}
                </span>
              </span>
            </div>
          )
        })}
      </div>
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
        <Info size={11} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
        <span>
          <b>/R 은 라운드(하루)당</b> 값입니다 — 하루에 여러 경기를 뛰므로 경기당보다 큽니다.
          순위 배지는 대상자 중 상위 10%가 골드, 20% 실버, 30% 브론즈입니다.
        </span>
      </p>
    </div>
  )
}

export { TRAIT_CATEGORY_LABELS }
