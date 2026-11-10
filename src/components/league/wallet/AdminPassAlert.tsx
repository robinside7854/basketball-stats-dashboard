'use client'
// 어드민 홈 — 정규권 안 산 사람 알림 (2026-11-09 운영진 「정규권 알림은 어드민에게 홈화면에서」)
//   정규권이 없으면 정규도 참가신청에서 비정규로 잡혀 대기명단에 쌓인다 → 달이 바뀌기 전에 어드민이 챙기게.
//   이번 달은 빠진 사람이 있을 때만, 다음 달은 매달 20일부터(passStatus.ts). 다 샀으면 그리지 않는다.
//   「단톡방 안내 복사」로 이름이 든 안내문을 바로 붙여 넣을 수 있다. 회원에게는 아무것도 그리지 않는다.
//   2026-11-10 운영진: 같은 자리에 ① 정규권 판매 현황(판매 중 x/18 · 예정 · 20일부터 다음 달 판매를 아직 안 열었으면 알림)
//   ② 「입금 매칭 불가 N건」 ③ 입금 알림 끊김(충전 요청이 2시간 넘게 기다리는데 알림이 안 옴 — 통장 폰 확인)을 함께 — GET ?home=1 한 번.
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Crown, Copy, ChevronRight, Landmark, BellOff } from 'lucide-react'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import type { PassMonth } from '@/lib/wallet/passStatus'
import type { PassSale } from '@/lib/wallet/passSales'

type Home = { months: PassMonth[]; sales: PassSale[]; unmatched: number; stale: { hours: number } | null }
const pad = (n: number) => String(n).padStart(2, '0')
function when(iso: string): string {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}(${'일월화수목금토'[d.getDay()]}) ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 알림 한 줄(아이콘 · 제목 · 설명 · 버튼) */
function Bar({ tone, icon, title, sub, href, action }: {
  tone: 'red' | 'yellow'; icon: React.ReactNode; title: string; sub?: string; href: string; action: string
}) {
  const red = tone === 'red'
  return (
    <Link href={href} className="mm-press flex items-center gap-3 px-4 py-3 md:px-5 break-keep"
      style={{ background: red ? 'color-mix(in srgb, var(--mm-live-bg) 8%, var(--mm-panel))' : 'var(--mm-yellow-soft)', border: `1px solid ${red ? 'var(--mm-live-bg)' : 'var(--mm-yellow)'}`, borderRadius: 'var(--mm-radius-card)' }}>
      <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full" style={{ background: red ? 'var(--mm-live-bg)' : '#111', color: red ? '#fff' : '#E8B931' }} aria-hidden>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-black" style={{ color: 'var(--mm-ink)' }}>{title}</span>
        {sub && <span className="block text-xs" style={{ color: 'var(--mm-ink-soft)' }}>{sub}</span>}
      </span>
      <span className="shrink-0 inline-flex items-center text-xs font-bold" style={{ color: 'var(--mm-ink)' }}>{action}<ChevronRight size={14} aria-hidden /></span>
    </Link>
  )
}

export default function AdminPassAlert({ leagueId, base }: { leagueId: string; base: string }) {
  const { isEditMode } = useLeagueEditMode()
  const [home, setHome] = useState<Home | null>(null)

  useEffect(() => {
    if (!isEditMode) return
    let alive = true
    fetch(`/api/leagues/${leagueId}/wallet/admin?home=1`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (alive && j?.months) setHome(j as Home) })
      .catch(() => {})
    return () => { alive = false }
  }, [isEditMode, leagueId])

  if (!isEditMode || !home) return null
  // 다음 달은 판매(134)가 맡는다 — 「안 산 사람」 목록은 이번 달만
  const show = home.months.slice(0, 1).filter(m => m.regulars > 0 && m.missing.length > 0)
  const next = home.months[1]   // 20일부터만 온다
  const nextSale = next ? home.sales.find(x => x.month === next.month) : undefined
  const walletAdmin = `${base}/wallet?tab=admin`
  const bars: React.ReactNode[] = []
  if (home.stale) bars.push(<Bar key="stale" tone="red" icon={<BellOff size={18} />} href={`${walletAdmin}#bank`} action="확인"
    title={`입금 알림이 ${home.stale.hours}시간째 안 와요`} sub="충전 요청이 기다리고 있어요. 통장 폰과 자동화 앱을 확인해 주세요." />)
  if (home.unmatched > 0) bars.push(<Bar key="unmatched" tone="red" icon={<Landmark size={18} />} href={`${walletAdmin}#bank`} action="처리"
    title={`입금 매칭 불가 ${home.unmatched}건`} sub="누구 돈인지 골라 충전해 주세요." />)
  for (const x of home.sales.filter(x => x.state !== 'closed')) {
    const label = `${Number(x.month.slice(5, 7))}월`
    bars.push(<Bar key={x.id} tone="yellow" icon={<Crown size={18} />} href={walletAdmin} action="보기"
      title={x.state === 'open' ? (x.sold >= x.capacity ? `${label} 정규권 정원 마감 ${x.sold}/${x.capacity}명` : `${label} 정규권 판매 중 ${x.sold}/${x.capacity}명`) : `${label} 정규권 판매 예정`}
      sub={x.state === 'open' ? `${when(x.closes_at)} 마감` : `${when(x.opens_at)} 판매 시작`} />)
  }
  if (next && !nextSale) bars.push(<Bar key="open-next" tone="yellow" icon={<Crown size={18} />} href={walletAdmin} action="열기"
    title={`${next.label} 정규권 판매를 아직 안 열었어요`} sub="월렛 어드민 「정규권 판매」에서 기간과 정원을 정해요." />)
  if (show.length === 0 && bars.length === 0) return null

  async function copy(m: PassMonth) {
    const text = `[${m.label} 정규권 안내]\n${m.label} 정규권을 아직 안 사신 분: ${m.missing.map(x => x.name).join(', ')}\n앱 「내 월렛 → 티켓 사기」에서 사 주세요. 정규권이 없으면 참가신청 때 비정규로 잡혀요.`
    try { await navigator.clipboard.writeText(text); toast.success('단톡방 안내문을 복사했어요') }
    catch { toast.error('복사하지 못했어요') }
  }

  return (
    <div className="space-y-2">
      {bars}
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
