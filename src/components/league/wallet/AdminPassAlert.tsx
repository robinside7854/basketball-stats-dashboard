'use client'
// 어드민 홈 — 정규권 안 산 사람 알림 (2026-11-09 운영진 「정규권 알림은 어드민에게 홈화면에서」)
//   정규권이 없으면 정규도 참가신청에서 비정규로 잡혀 대기명단에 쌓인다 → 달이 바뀌기 전에 어드민이 챙기게.
//   이번 달은 빠진 사람이 있을 때만, 다음 달은 매달 20일부터(passStatus.ts). 다 샀으면 그리지 않는다.
//   「단톡방 안내 복사」로 이름이 든 안내문을 바로 붙여 넣을 수 있다. 회원에게는 아무것도 그리지 않는다.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Crown, Copy, ChevronRight } from 'lucide-react'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import type { PassMonth } from '@/lib/wallet/passStatus'

export default function AdminPassAlert({ leagueId, base }: { leagueId: string; base: string }) {
  const { isEditMode } = useLeagueEditMode()
  const [months, setMonths] = useState<PassMonth[] | null>(null)

  useEffect(() => {
    if (!isEditMode) return
    let alive = true
    fetch(`/api/leagues/${leagueId}/wallet/admin?passes=1`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive && j?.months) setMonths(j.months as PassMonth[]) })
      .catch(() => {})
    return () => { alive = false }
  }, [isEditMode, leagueId])

  if (!isEditMode || !months) return null
  const show = months.filter(m => m.regulars > 0 && m.missing.length > 0)
  if (show.length === 0) return null

  async function copy(m: PassMonth) {
    const text = `[${m.label} 정규권 안내]\n${m.label} 정규권을 아직 안 사신 분: ${m.missing.map(x => x.name).join(', ')}\n앱 「내 월렛 → 티켓 사기」에서 사 주세요. 정규권이 없으면 참가신청 때 비정규로 잡혀요.`
    try { await navigator.clipboard.writeText(text); toast.success('단톡방 안내문을 복사했어요') }
    catch { toast.error('복사하지 못했어요') }
  }

  return (
    <div className="space-y-2">
      {show.map(m => (
        <div key={m.month} className="px-4 py-3 md:px-5"
          style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow)', borderRadius: 'var(--mm-radius-card)' }}>
          <div className="flex items-center gap-3">
            <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full" style={{ background: '#111' }} aria-hidden>
              <Crown size={18} style={{ color: '#E8B931' }} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-black" style={{ color: 'var(--mm-ink)' }}>
                {m.label} 정규권 {m.bought}/{m.regulars}명 샀어요
                <span className="ml-1.5 font-bold" style={{ color: 'var(--mm-negative)' }}>· {m.missing.length}명 아직</span>
              </span>
              <span className="block text-xs" style={{ color: 'var(--mm-ink-soft)' }}>
                {m.estimated ? `${m.label} 정규 명단이 아직 없어 이번 달 정규로 셌어요 · ` : ''}어드민에게만 보여요
              </span>
            </span>
          </div>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--mm-ink)' }}>
            {m.missing.map(x => x.name).join(' · ')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => copy(m)}
              className="mm-press inline-flex items-center gap-1 min-h-9 px-3 text-xs font-bold"
              style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)', borderRadius: 'var(--mm-radius-ctl)' }}>
              <Copy size={14} aria-hidden />단톡방 안내 복사
            </button>
            <Link href={`${base}/wallet?tab=admin`}
              className="mm-press inline-flex items-center gap-0.5 min-h-9 px-3 text-xs font-bold border"
              style={{ borderColor: 'var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: 'var(--mm-radius-ctl)' }}>
              월렛 어드민<ChevronRight size={14} aria-hidden />
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
