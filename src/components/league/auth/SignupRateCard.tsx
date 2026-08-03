'use client'
// 라커룸 · 회원 가입율 카드
//   · 모수 = 게스트 제외 등록 회원 (게스트는 단발성 참가자라 가입 대상이 아님)
//   · 가입율 = 승인 완료(인증회원) / 모수 · 승인 대기는 별도 세그먼트로 표시
//   · 미가입/대기 명단은 편집(PIN) 권한자에게만 내려옴 (API 에서 gating) → 독려용
import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, RefreshCw, ChevronDown } from 'lucide-react'

interface SignupRate {
  eligible: number
  guestCount: number
  approved: number
  pending: number
  rejected: number
  disabled: number
  notSignedUp: number
  rate: number
  requestedRate: number
  names: {
    pending: string[]
    notSignedUp: string[]
    rejected: string[]
    disabled: string[]
  } | null
}

interface Props {
  leagueId: string
  leagueHeaders: Record<string, string>
  /** 편집 모드일 때만 명단 요청 (PIN 헤더 유효) */
  isEditMode: boolean
}

export default function SignupRateCard({ leagueId, leagueHeaders, isEditMode }: Props) {
  const [data, setData] = useState<SignupRate | null>(null)
  const [loading, setLoading] = useState(true)
  const [showNames, setShowNames] = useState(false)

  // leagueHeaders 는 컨텍스트에서 매 렌더 새 객체로 만들어짐 → PIN 문자열만 의존성으로 뽑아
  // 불필요한 재요청(PIN 모달 입력 등 부모 리렌더)을 막는다.
  const pin = leagueHeaders['X-League-Pin'] ?? ''

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/auth/signup-rate`, {
        headers: isEditMode && pin ? { 'X-League-Pin': pin } : undefined,
        cache: 'no-store',
      })
      if (!r.ok) { setData(null); return }
      setData(await r.json())
    } catch {
      setData(null)   // 집계 실패는 조용히 카드만 숨김 — 로스터 본체는 영향 없음
    } finally { setLoading(false) }
  }, [leagueId, pin, isEditMode])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div
        className="mm-brand h-[92px] animate-pulse"
        style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '6px' }}
        aria-hidden
      />
    )
  }
  // 집계 실패 · 가입 대상 회원이 없으면 카드 자체를 감춤
  if (!data || data.eligible === 0) return null

  const approvedPct = (data.approved / data.eligible) * 100
  const pendingPct = (data.pending / data.eligible) * 100
  const hasNames = Boolean(data.names && (data.names.notSignedUp.length > 0 || data.names.pending.length > 0))

  return (
    <section
      className="mm-brand"
      aria-label="회원 가입율"
      style={{
        background: 'var(--mm-panel)',
        border: '1px solid var(--mm-rule)',
        borderTop: '3px solid var(--mm-yellow-soft)',
        borderRadius: '6px',
        overflow: 'hidden',
      }}
    >
      <div className="p-3.5 lg:p-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck size={16} aria-hidden className="shrink-0" style={{ color: 'var(--mm-yellow-strong)' }} />
            <h3
              className="font-jersey font-black uppercase text-[17px] lg:text-[19px] truncate"
              style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
            >
              회원 가입율
            </h3>
            <span className="text-[10px] lg:text-[11px] font-bold uppercase tracking-[0.12em] shrink-0" style={{ color: 'var(--mm-muted)' }}>
              게스트 제외
            </span>
          </div>
          <button
            onClick={load}
            aria-label="가입율 새로고침"
            className="p-1 -m-1 shrink-0 cursor-pointer"
            style={{ color: 'var(--mm-muted)' }}
          >
            <RefreshCw size={13} aria-hidden />
          </button>
        </div>

        {/* 큰 수치 + 분자/분모 */}
        <div className="flex items-baseline gap-2.5 flex-wrap mb-2.5">
          <span
            className="font-jersey font-black tabular-nums leading-none text-[36px] lg:text-[44px]"
            style={{ color: 'var(--mm-ink)', letterSpacing: '-0.02em' }}
          >
            {data.rate}%
          </span>
          <span className="text-[13px] lg:text-sm font-bold tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>
            {data.approved} / {data.eligible}명 가입 완료
          </span>
          {data.guestCount > 0 && (
            <span className="text-[11px] font-bold uppercase tracking-[0.1em] tabular-nums" style={{ color: 'var(--mm-muted)' }}>
              (게스트 {data.guestCount}명 제외)
            </span>
          )}
        </div>

        {/* 스택 바 — 승인(진한 옐로) + 대기(연한 옐로) + 미가입(빈칸) */}
        <div
          className="flex h-2.5 w-full overflow-hidden"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: '3px' }}
          role="img"
          aria-label={`가입 완료 ${data.approved}명, 승인 대기 ${data.pending}명, 미가입 ${data.notSignedUp}명 · 총 ${data.eligible}명`}
        >
          <span style={{ width: `${approvedPct}%`, background: 'var(--mm-yellow)' }} />
          <span style={{ width: `${pendingPct}%`, background: 'var(--mm-yellow-strong)', opacity: 0.45 }} />
        </div>

        {/* 세부 카운트 */}
        <div className="flex items-center gap-x-4 gap-y-1 flex-wrap mt-2.5">
          <Legend swatch="var(--mm-yellow)" label="가입 완료" value={data.approved} />
          <Legend swatch="var(--mm-yellow-strong)" swatchOpacity={0.45} label="승인 대기" value={data.pending} />
          <Legend swatch="var(--mm-rule)" label="미가입" value={data.notSignedUp} />
          {data.pending > 0 && (
            <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--mm-muted)' }}>
              신청률 {data.requestedRate}%
            </span>
          )}
          {(data.rejected > 0 || data.disabled > 0) && (
            <span className="text-[11px] font-bold tabular-nums" style={{ color: 'var(--mm-muted)' }}>
              반려 {data.rejected} · 비활성 {data.disabled}
            </span>
          )}
        </div>

        {/* 미가입 명단 — 편집 모드(PIN)에서만 API 가 내려줌 */}
        {hasNames && data.names && (
          <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--mm-rule)' }}>
            <button
              onClick={() => setShowNames(v => !v)}
              aria-expanded={showNames}
              className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] cursor-pointer"
              style={{ color: 'var(--mm-ink-soft)' }}
            >
              <ChevronDown
                size={13}
                aria-hidden
                style={{ transform: showNames ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
              />
              미가입 · 대기 명단 보기
            </button>
            {showNames && (
              <div className="mt-2.5 space-y-2">
                {data.names.notSignedUp.length > 0 && (
                  <NameList title="미가입" names={data.names.notSignedUp} />
                )}
                {data.names.pending.length > 0 && (
                  <NameList title="승인 대기" names={data.names.pending} />
                )}
                {data.names.rejected.length > 0 && (
                  <NameList title="반려" names={data.names.rejected} />
                )}
                {data.names.disabled.length > 0 && (
                  <NameList title="비활성" names={data.names.disabled} />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function Legend({ swatch, swatchOpacity, label, value }: {
  swatch: string
  swatchOpacity?: number
  label: string
  value: number
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] lg:text-xs font-bold tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>
      <span
        aria-hidden
        className="inline-block w-2.5 h-2.5 shrink-0"
        style={{ background: swatch, opacity: swatchOpacity ?? 1, borderRadius: '2px' }}
      />
      <span className="uppercase tracking-[0.1em]" style={{ color: 'var(--mm-muted)' }}>{label}</span>
      <b style={{ color: 'var(--mm-ink)' }}>{value}</b>
    </span>
  )
}

function NameList({ title, names }: { title: string; names: string[] }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-[0.14em] mb-1" style={{ color: 'var(--mm-muted)' }}>
        {title} ({names.length})
      </p>
      <div className="flex flex-wrap gap-1">
        {names.map(n => (
          <span
            key={n}
            className="px-1.5 py-0.5 text-[11px] font-bold"
            style={{
              background: 'var(--mm-panel-alt)',
              border: '1px solid var(--mm-rule)',
              color: 'var(--mm-ink-soft)',
              borderRadius: '3px',
            }}
          >
            {n}
          </span>
        ))}
      </div>
    </div>
  )
}
