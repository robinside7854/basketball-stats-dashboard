'use client'
// 개인특성 배지 패널 — 그 선수가 어떤 유형인지 보여준다.
//
// 자동 배지(퍼펙트게임·더블더블 등)가 "잘한 순간"을 세는 것과 달리, 이쪽은 **누적 성향**이다.
// 득점이 적어도 자기 색깔(공격리바·킥아웃·안전운반 등)로 받을 수 있어야 한다는 게 설계 의도다.
//
// 판정은 서버에서 리그 전원을 한 번에 계산한다 — 상위 백분율이라 한 명만 떼서 계산할 수 없다.
//
// ## 배지를 누르면 기준이 뜬다 (2026-08-11)
// 회원은 "골밑파괴자"가 무슨 조건인지 알 수 없다. 그래서 칩 자체를 버튼으로 만들고
// PC 는 호버, 모바일은 탭으로 기준·내 값·순위를 띄운다. `title` 속성만으로는 모바일에서
// 아무 일도 일어나지 않아 설명이 사실상 없는 것과 같았다.
// 팝오버는 portal 로 body 에 붙인다 — 부모(선수 상세 모달)의 overflow 에 잘리지 않게.

import { useEffect, useState, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Info } from 'lucide-react'
import {
  TRAIT_BY_CODE, TRAIT_CATEGORY_LABELS, formatTraitValue,
  type EarnedTrait, type TraitTier, type TraitCategory,
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

// 표시 순서 (2026-08-11 사용자 확정): 금 → 은 → 동, 같은 티어 안에서는 공격 → 수비 → 플레이메이킹.
// 슈팅은 사용자가 든 세 갈래에 없어서 공격 계열로 보고 바로 뒤에 둔다.
const TIER_ORDER: Record<TraitTier, number> = { gold: 0, silver: 1, bronze: 2 }
const CATEGORY_ORDER: Record<TraitCategory, number> = { attack: 0, shooting: 1, defense: 2, playmaking: 3 }

const POPOVER_WIDTH = 268
const EDGE = 12

export default function TraitBadgePanel({ leagueId, playerId }: Props) {
  // 결과에 "어느 선수 것인가"를 함께 담는다. 이펙트 안에서 동기적으로 초기화하면
  // 렌더가 연쇄로 다시 도는데(react-hooks/set-state-in-effect), 선수를 바꿨을 때
  // 이전 선수 배지가 잠깐 보이는 것도 막아야 해서 이 방식을 쓴다.
  const [state, setState] = useState<{ pid: string; badges: EarnedTrait[] | null; failed: boolean }>(
    { pid: '', badges: null, failed: false },
  )
  const [openCode, setOpenCode] = useState<string | null>(null)
  const [coords, setCoords] = useState<{ top: number; left: number; place: 'top' | 'bottom' } | null>(null)
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const popRef = useRef<HTMLDivElement | null>(null)

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

  const place = useCallback((code: string) => {
    const el = chipRefs.current[code]
    if (!el) return
    const r = el.getBoundingClientRect()
    const below = r.bottom + 8 + 190 <= window.innerHeight - EDGE
    const half = POPOVER_WIDTH / 2
    const cx = Math.max(EDGE + half, Math.min(window.innerWidth - EDGE - half, r.left + r.width / 2))
    setCoords({ top: below ? r.bottom + 8 : r.top - 8, left: cx, place: below ? 'bottom' : 'top' })
  }, [])

  // 열려 있는 동안 스크롤·리사이즈를 따라간다 (모달 안에서도 위치가 어긋나지 않게)
  useEffect(() => {
    if (!openCode) return
    const sync = () => place(openCode)
    window.addEventListener('scroll', sync, true)
    window.addEventListener('resize', sync)
    return () => {
      window.removeEventListener('scroll', sync, true)
      window.removeEventListener('resize', sync)
    }
  }, [openCode, place])

  // 바깥 클릭·ESC 로 닫기 (모바일 탭 사용성)
  useEffect(() => {
    if (!openCode) return
    const outside = (e: Event) => {
      const t = e.target as Node | null
      if (!t) return
      if (popRef.current?.contains(t)) return
      if (chipRefs.current[openCode]?.contains(t)) return
      setOpenCode(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpenCode(null) }
    document.addEventListener('mousedown', outside)
    document.addEventListener('touchstart', outside, { passive: true })
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('touchstart', outside)
      window.removeEventListener('keydown', onKey)
    }
  }, [openCode])

  const settled = state.pid === playerId
  const failed = settled && state.failed
  const badges = settled ? state.badges : null
  // PC 만 호버로 연다. 렌더가 아니라 **이벤트 시점**에 재는 이유: 렌더 중에 window 를 보면
  // SSR 결과와 어긋나고, 상태로 들고 있으면 이펙트에서 setState 를 해야 한다(연쇄 렌더).
  // 이벤트 핸들러는 클라이언트에서만 도니 여기서 직접 물어보는 게 가장 단순하다.
  const hoverable = () => window.matchMedia('(hover: hover)').matches

  if (failed) {
    return <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>특성 배지를 불러오지 못했습니다.</p>
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

  const ordered = [...badges].sort((a, b) => {
    const t = TIER_ORDER[a.tier] - TIER_ORDER[b.tier]
    if (t !== 0) return t
    const ca = TRAIT_BY_CODE[a.code]?.category
    const cb = TRAIT_BY_CODE[b.code]?.category
    return (ca ? CATEGORY_ORDER[ca] : 9) - (cb ? CATEGORY_ORDER[cb] : 9)
  })

  const open = openCode ? ordered.find(b => b.code === openCode) : null
  const openDef = open ? TRAIT_BY_CODE[open.code] : null

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {ordered.map(b => {
          const def = TRAIT_BY_CODE[b.code]
          if (!def) return null
          const st = TIER_STYLE[b.tier]
          const isOpen = openCode === b.code
          return (
            <button
              key={b.code}
              ref={el => { chipRefs.current[b.code] = el }}
              type="button"
              aria-expanded={isOpen}
              aria-label={`${def.name} ${st.label} — 기준 보기`}
              onClick={e => {
                e.stopPropagation()
                if (isOpen) { setOpenCode(null); return }
                place(b.code)
                setOpenCode(b.code)
              }}
              onMouseEnter={() => { if (hoverable()) { place(b.code); setOpenCode(b.code) } }}
              onMouseLeave={() => { if (hoverable()) setOpenCode(null) }}
              onFocus={() => { place(b.code); setOpenCode(b.code) }}
              onBlur={() => setOpenCode(null)}
              className="flex items-center gap-2 px-2.5 py-1.5 min-h-11 cursor-pointer transition-shadow text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              style={{
                background: st.bg,
                border: `1px solid ${st.bd}`,
                borderRadius: '4px',
                boxShadow: isOpen ? `0 0 0 2px ${st.bd}` : 'none',
              }}
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
            </button>
          )
        })}
      </div>

      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
        <Info size={11} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
        <span>배지를 누르면 획득 기준이 나옵니다. <b>/R 은 라운드(하루)당</b> 값입니다.</span>
      </p>

      {open && openDef && coords && typeof document !== 'undefined' && createPortal(
        <div
          ref={popRef}
          role="tooltip"
          style={{
            position: 'fixed',
            top: coords.top,
            left: coords.left,
            transform: coords.place === 'bottom' ? 'translateX(-50%)' : 'translate(-50%, -100%)',
            zIndex: 200,
            width: POPOVER_WIDTH,
            maxWidth: `calc(100vw - ${EDGE * 2}px)`,
            background: 'var(--mm-panel)',
            border: '1px solid var(--mm-rule)',
            borderRadius: 8,
            boxShadow: '0 2px 3px -1px rgba(0,0,0,0.1), 0 0 0 1px rgba(25,28,33,0.08)',
            padding: '11px 13px',
            fontSize: 12,
            lineHeight: 1.55,
          }}
        >
          <div className="flex items-baseline gap-1.5" style={{ marginBottom: 6 }}>
            <span aria-hidden>{openDef.icon}</span>
            <b style={{ color: 'var(--mm-ink)' }}>{openDef.name}</b>
            <span style={{ fontSize: 10, fontWeight: 700, color: TIER_STYLE[open.tier].fg }}>
              {TIER_STYLE[open.tier].label}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--mm-muted)' }}>
              {TRAIT_CATEGORY_LABELS[openDef.category]}
            </span>
          </div>

          <p style={{ margin: 0, color: 'var(--mm-ink-soft)' }}>{openDef.description}</p>

          <div style={{
            marginTop: 8, padding: '6px 8px', borderRadius: 4,
            background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)',
            fontSize: 11, color: 'var(--mm-ink-soft)',
          }}>
            <span style={{ fontWeight: 700, color: 'var(--mm-ink)' }}>획득 기준</span><br />
            {openDef.criteria}
          </div>

          <div style={{
            marginTop: 7, fontSize: 11, fontFamily: 'ui-monospace, Menlo, monospace',
            color: 'var(--mm-ink)', fontVariantNumeric: 'tabular-nums',
          }}>
            내 기록 {formatTraitValue(open.code, open.value)}
            {open.rank != null && (
              <span style={{ color: 'var(--mm-muted)' }}>
                {' '}· 대상 {open.poolSize}명 중 {open.rank}위
              </span>
            )}
          </div>

          {open.rank != null && (
            <p style={{ margin: '6px 0 0', fontSize: 10.5, color: 'var(--mm-muted)' }}>
              대상자 중 상위 10%가 골드, 20% 실버, 30% 브론즈입니다.
            </p>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}

export { TRAIT_CATEGORY_LABELS }
