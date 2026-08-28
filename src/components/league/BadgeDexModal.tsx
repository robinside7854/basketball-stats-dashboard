'use client'
// 배지 도감 — 이 리그에 있는 배지 **전부**와 내 보유 여부를 한 화면에서 본다.
//
// ## 왜 필요했나
// 배지는 두 갈래(자동 4 · 특성 14)로 나뉘어 각각 다른 컴포넌트가 보여준다.
// (커리어 배지 10종은 2026-08-13 삭제 — 스크롤만 길어지고 지금 단계엔 불필요하다는 판단)
// 그래서 "내가 못 받은 건 뭐가 있고 그건 어떻게 받나"를 알 방법이 없었다. 특성 배지는 칩을
// 눌러야 기준이 뜨는데, 애초에 **못 받은 배지는 칩이 없어서 누를 수가 없다.**
// 도감은 그 반대다 — 미보유도 전부 나열해서 다음 목표가 보이게 한다.
//
// ## 설명 문구의 출처 (짐작해서 쓴 것이 하나도 없다)
//   · 특성 14종 → `TRAIT_DEFINITIONS` (traitBadges.ts) 를 **직접** 읽는다. 복제하지 않았다.
//   · 자동 4종 → `badgeCatalog.ts`. 정본이 서버 전용 코드를 import 해서
//     클라이언트에서 못 읽는다 — 그 파일 헤더의 경고를 참고할 것.
//
// ## 미보유 표현
// 회색 처리하되 **텍스트에 opacity 를 걸지 않는다.** muted 색은 이미 대비 4.5:1 언저리라
// 반투명을 얹으면 읽을 수 없어진다. 색만으로 구분하지도 않는다 — "보유/미보유" 글자와
// 자물쇠/체크 아이콘을 함께 둔다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  X, ChevronDown, Check, Lock, Trophy, Swords, Crosshair, Shield, Users,
  type LucideIcon,
} from 'lucide-react'
import {
  TRAIT_DEFINITIONS, TRAIT_CATEGORY_LABELS, TIER_CUTS, MIN_ROUNDS, formatTraitValue,
  type EarnedTrait, type TraitTier, type TraitCategory,
} from '@/lib/badges/traitBadges'
import { AUTO_BADGES, type BadgeCatalogEntry } from '@/lib/badges/badgeCatalog'

interface Props {
  leagueId: string
  playerId: string
  onClose: () => void
}

interface BadgeRow { badge_type: string; earned_at_date: string }

/** 특성 배지 계열 아이콘 — 정본의 `icon` 은 이모지라 UI 아이콘으로 쓰지 않는다 (DESIGN.md) */
const CATEGORY_ICON: Record<TraitCategory, LucideIcon> = {
  attack: Swords,
  shooting: Crosshair,
  defense: Shield,
  playmaking: Users,
}

/**
 * 티어 색 — DESIGN.md 의 순위 티어 토큰을 그대로 쓴다.
 * 금/은/동은 1/2/3위와 같은 의미라 rank-1/2/3 쌍이 정확히 맞고, 무엇보다 **다크 모드에서
 * 함께 뒤집힌다**. 하드코딩한 hex 를 쓰면 다크에서 글자가 사라진다.
 */
const TIER_TOKEN: Record<TraitTier, { label: string; bg: string; fg: string }> = {
  gold:   { label: '골드',   bg: 'var(--rank-1-bg)', fg: 'var(--rank-1-fg)' },
  silver: { label: '실버',   bg: 'var(--rank-2-bg)', fg: 'var(--rank-2-fg)' },
  bronze: { label: '브론즈', bg: 'var(--rank-3-bg)', fg: 'var(--rank-3-fg)' },
}

const PCT = (q: number) => `${Math.round(q * 100)}%`

function formatKoreanDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}.${mm}.${dd}`
}

/** 도감 한 줄 — 보유/미보유 표현이 세 계열에서 완전히 같아야 해서 하나로 묶었다 */
function DexRow({
  Icon, name, criteria, scope, owned, meta,
}: {
  Icon: LucideIcon
  name: string
  criteria: string
  scope: string
  owned: boolean
  /** 보유했을 때만 보여줄 한 줄 (달성일 · 횟수 · 티어와 값) */
  meta?: React.ReactNode
}) {
  return (
    <li
      className="flex items-start gap-2.5 px-3 py-3"
      style={{
        background: owned ? 'var(--mm-yellow-soft)' : 'var(--mm-panel-alt)',
        border: `1px solid ${owned ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
        borderRadius: 'var(--mm-radius-ctl)',
      }}
    >
      <span
        aria-hidden
        className="shrink-0 inline-flex items-center justify-center w-9 h-9"
        style={{
          background: owned ? 'var(--mm-panel)' : 'transparent',
          border: `1px solid ${owned ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
          borderRadius: 'var(--mm-radius-ctl)',
          color: owned ? 'var(--mm-yellow-strong)' : 'var(--mm-muted)',
        }}
      >
        <Icon size={20} strokeWidth={2} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className="text-sm font-bold leading-snug"
            style={{ color: owned ? 'var(--mm-ink)' : 'var(--mm-ink-soft)' }}
          >
            {name}
          </p>
          {/* 색만으로 구분하지 않는다 — 아이콘 + 글자를 함께 둔다 */}
          <span
            className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-bold"
            style={{
              background: owned ? 'var(--mm-yellow)' : 'transparent',
              color: owned ? 'var(--mm-black)' : 'var(--mm-muted)',
              border: `1px solid ${owned ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
              borderRadius: 'var(--mm-radius-chip)',
            }}
          >
            {owned ? <Check size={14} strokeWidth={3} aria-hidden /> : <Lock size={14} strokeWidth={2.5} aria-hidden />}
            {owned ? '보유' : '미보유'}
          </span>
        </div>

        <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
          <span className="font-bold" style={{ color: 'var(--mm-ink-soft)' }}>{scope}</span>
          {' · '}
          {criteria}
        </p>

        {meta && (
          <p className="mt-1.5 text-[11px] font-mono tabular-nums leading-relaxed" style={{ color: 'var(--mm-ink)' }}>
            {meta}
          </p>
        )}
      </div>
    </li>
  )
}

/** 계열 섹션 — 스크롤이 길어 접을 수 있게 하되 **기본은 펼침**(전체를 한 번에 보려고 여는 화면이다) */
function DexSection({
  title, owned, total, note, open, onToggle, id, children,
}: {
  title: string
  owned: number
  total: number
  note?: React.ReactNode
  open: boolean
  onToggle: () => void
  id: string
  children: React.ReactNode
}) {
  return (
    <section>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        className="w-full flex items-center gap-2 min-h-11 px-1 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] rounded-[var(--mm-radius-ctl)]"
      >
        <ChevronDown
          size={16}
          aria-hidden
          className="shrink-0"
          style={{
            color: 'var(--mm-muted)',
            transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
            transition: 'transform var(--mm-motion-fast) var(--mm-ease-out)',
          }}
        />
        <span className="text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>{title}</span>
        <span className="text-[12px] font-mono tabular-nums" style={{ color: 'var(--mm-muted)' }}>
          {owned}/{total}
        </span>
      </button>

      {open && (
        <div id={id}>
          {note && (
            <p className="px-1 pb-2 text-[11px] leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
              {note}
            </p>
          )}
          <ul className="space-y-1.5">{children}</ul>
        </div>
      )}
    </section>
  )
}

export default function BadgeDexModal({ leagueId, playerId, onClose }: Props) {
  // 두 API 를 각각 들고 온다. 특성은 `TraitBadgePanel` 이 쓰는 것과 **같은** 엔드포인트다
  // (새로 만들지 않았다 — 리그 전원을 계산해 캐시하는 라우트라 여기서도 그대로 쓴다).
  const [autoRows, setAutoRows] = useState<BadgeRow[] | null>(null)
  const [traits, setTraits] = useState<EarnedTrait[] | null>(null)
  const [gated, setGated] = useState(false)
  const [open, setOpen] = useState<Record<string, boolean>>({ auto: true, trait: true, career: true })
  // 로딩은 별도 상태로 두지 않는다 — 이펙트에서 setState 를 동기로 부르면 렌더가 연쇄로 돈다
  // (react-hooks/set-state-in-effect). 두 응답이 다 채워졌는지로 파생시킨다.
  const loading = autoRows === null || traits === null
  const closeRef = useRef<HTMLButtonElement | null>(null)

  const toggle = useCallback((k: string) => setOpen(s => ({ ...s, [k]: !s[k] })), [])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    // 뒤 페이지가 같이 스크롤되면 긴 목록에서 어디를 보고 있는지 놓친다
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', h)
      document.body.style.overflow = prev
    }
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`/api/leagues/${leagueId}/players/${playerId}/badges`)
        .then(r => (r.ok ? r.json() : { badges: [], __gated: r.status === 401 })),
      fetch(`/api/leagues/${leagueId}/trait-badges`)
        .then(r => (r.ok ? r.json() : { badges: {}, __gated: r.status === 401 })),
    ])
      .then(([a, t]) => {
        if (cancelled) return
        setAutoRows((a.badges ?? []) as BadgeRow[])
        setTraits(((t.badges ?? {})[playerId] ?? []) as EarnedTrait[])
        setGated(!!a.__gated || !!t.__gated)
      })
      .catch(() => {
        // 목록 자체는 보여준다 — 조건을 읽는 것이 이 화면의 절반이다
        if (!cancelled) { setAutoRows([]); setTraits([]); setGated(true) }
      })
    return () => { cancelled = true }
  }, [leagueId, playerId])

  // 자동 배지는 여러 번 받을 수 있다 → 횟수 + 가장 최근 달성일 (API 가 날짜 desc 정렬)
  const autoOwned = useMemo(() => {
    const m = new Map<string, { count: number; latest: string }>()
    for (const b of autoRows ?? []) {
      const cur = m.get(b.badge_type)
      if (cur) cur.count += 1
      else m.set(b.badge_type, { count: 1, latest: b.earned_at_date })
    }
    return m
  }, [autoRows])

  const traitOwned = useMemo(() => {
    const m = new Map<string, EarnedTrait>()
    for (const t of traits ?? []) m.set(t.code, t)
    return m
  }, [traits])

  const total = AUTO_BADGES.length + TRAIT_DEFINITIONS.length
  const ownedCount =
    AUTO_BADGES.filter(b => autoOwned.has(b.key)).length +
    traitOwned.size

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="badge-dex-title"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative z-10 w-full sm:max-w-lg max-h-[92vh] sm:max-h-[85vh] flex flex-col overflow-hidden mm-modal-in"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
          borderRadius: 'var(--mm-radius-card)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        }}
      >
        <div
          className="flex items-center justify-between gap-2 px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid var(--mm-rule)', background: 'var(--mm-yellow-soft)' }}
        >
          <div className="min-w-0">
            <p id="badge-dex-title" className="text-sm font-bold flex items-center gap-1.5" style={{ color: 'var(--mm-ink)' }}>
              <Trophy size={16} strokeWidth={2} aria-hidden style={{ color: 'var(--mm-yellow-strong)' }} />
              배지 도감
            </p>
            <p className="text-[11px] font-mono tabular-nums mt-0.5" style={{ color: 'var(--mm-ink-soft)' }}>
              보유 {ownedCount} / 전체 {total}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="배지 도감 닫기"
            className="shrink-0 inline-flex items-center justify-center w-11 h-11 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
            style={{ color: 'var(--mm-ink-soft)', borderRadius: 'var(--mm-radius-ctl)' }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain px-3 py-3 space-y-4">
          {gated && (
            <p
              className="px-3 py-2 text-[12px] leading-relaxed"
              style={{
                background: 'var(--mm-panel-alt)',
                border: '1px solid var(--mm-rule)',
                borderRadius: 'var(--mm-radius-ctl)',
                color: 'var(--mm-ink-soft)',
              }}
            >
              보유 여부를 불러오지 못했습니다. 승인된 회원으로 로그인하면 내 보유 배지가 함께 표시됩니다.
              아래 달성 조건은 그대로 보실 수 있습니다.
            </p>
          )}

          {loading ? (
            <ul className="space-y-1.5" aria-label="배지 도감 불러오는 중">
              {Array.from({ length: 6 }).map((_, i) => (
                <li
                  key={i}
                  className="h-[84px] animate-pulse"
                  style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-ctl)' }}
                />
              ))}
            </ul>
          ) : (
            <>
              {/* ── 자동 배지 ── */}
              <DexSection
                id="dex-auto"
                title="자동 배지"
                owned={AUTO_BADGES.filter(b => autoOwned.has(b.key)).length}
                total={AUTO_BADGES.length}
                note="경기 기록에서 자동으로 집계됩니다. 여러 번 받을 수 있습니다."
                open={open.auto}
                onToggle={() => toggle('auto')}
              >
                {AUTO_BADGES.map((b: BadgeCatalogEntry) => {
                  const got = autoOwned.get(b.key)
                  return (
                    <DexRow
                      key={b.key}
                      Icon={b.Icon}
                      name={b.label}
                      scope={b.scope}
                      criteria={b.criteria}
                      owned={!!got}
                      meta={got ? `${got.count}회 · 최근 ${formatKoreanDate(got.latest)}` : undefined}
                    />
                  )
                })}
              </DexSection>

              {/* ── 특성 배지 ── */}
              <DexSection
                id="dex-trait"
                title="특성 배지"
                owned={traitOwned.size}
                total={TRAIT_DEFINITIONS.length}
                note={
                  <>
                    대부분 <b>절대 기준이 아니라 리그 안 순위</b>로 정해집니다 — 대상자 중 상위{' '}
                    {PCT(TIER_CUTS.gold)}가 골드, {PCT(TIER_CUTS.silver)} 실버, {PCT(TIER_CUTS.bronze)} 브론즈입니다.
                    순위 배지의 대상은 <b>{MIN_ROUNDS}라운드 이상 출전자</b>이고, <b>/R 은 라운드(하루)당</b> 값입니다.
                  </>
                }
                open={open.trait}
                onToggle={() => toggle('trait')}
              >
                {TRAIT_DEFINITIONS.map(def => {
                  const got = traitOwned.get(def.code)
                  const tier = got ? TIER_TOKEN[got.tier] : null
                  return (
                    <DexRow
                      key={def.code}
                      Icon={CATEGORY_ICON[def.category]}
                      name={def.name}
                      scope={TRAIT_CATEGORY_LABELS[def.category]}
                      criteria={
                        def.basis === 'rank'
                          ? `${def.criteria} — 리그 상위 ${PCT(TIER_CUTS.gold)}/${PCT(TIER_CUTS.silver)}/${PCT(TIER_CUTS.bronze)} 안에 들면 금·은·동.`
                          : `${def.criteria} — 순서대로 동·은·금.`
                      }
                      owned={!!got}
                      meta={
                        got && tier ? (
                          <>
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 mr-1.5 font-bold"
                              style={{ background: tier.bg, color: tier.fg, borderRadius: 'var(--mm-radius-chip)' }}
                            >
                              {tier.label}
                            </span>
                            내 기록 {formatTraitValue(got.code, got.value)}
                            {got.rank != null && ` · ${got.poolSize}명 중 ${got.rank}위`}
                          </>
                        ) : undefined
                      }
                    />
                  )
                })}
              </DexSection>

            </>
          )}
        </div>
      </div>
    </div>
  )
}
