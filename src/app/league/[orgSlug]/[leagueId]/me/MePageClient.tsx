'use client'
// "내 기록" 탭 본문(Task 4-A/4-B) — 상단 네비에서 라커룸이 빠지고 유저 칩·로그아웃·접속현황·
// 테마 토글이 이 페이지로 내려오면서 생긴 유일한 계정/개인 화면.
//   비로그인: LoginTeaser(홈 위젯과 달리 닫기 없이 항상 노출 — 여기가 목적지이므로)
//   로그인: PersonalDashboard 를 그대로 재사용(새로 만들지 않음)
//   바로가기: 드래프트(진행 중 · 어드민만) — 내 하이라이트는 대시보드 「내 베스트샷」 카드로(2026-10-12)
//     — 선수 명단·팀 순위는 스탯 탭으로, 설정은 상단 바 어드민 버튼으로 이동했다(둘 다 여기서 제거,
//       2026-08-08 stats-umbrella-move 기준 갱신).
//   계정: 아이디 · 비밀번호 변경 · 앱 설치 · 로그아웃을 AccountCard 한 장으로(2026-10-17 — 종전엔 프로필 카드
//     아래와 페이지 맨 아래로 갈라져 있었다). 둘러보기 버튼은 기능 자체가 삭제되어 함께 제거했다(Task 4-A).
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { ChevronRight, ClipboardList, Wallet } from 'lucide-react'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'
import { useActiveDraft } from '@/lib/hooks/useActiveDraft'
import { deriveLeagueBase } from '../_components/LeagueLayoutClient'
import PersonalDashboard, { LoginTeaser, AccountCard } from '@/components/league/auth/PersonalDashboard'
import SectionCard from '@/components/league/ui/SectionCard'
import MePageSkeleton from '@/components/league/auth/MePageSkeleton'

interface Props {
  orgSlug: string
  leagueId: string
}

export default function MePageClient({ orgSlug, leagueId }: Props) {
  const pathname = usePathname()
  // 미들웨어 slug→UUID rewrite 때문에 leagueId prop 은 UUID → 링크는 브라우저 경로(slug) 기준으로
  // 만든다(settings/page.tsx 의 socialHref 와 동일 패턴). base 유도는 정규식 치환이 아니라
  // LeagueLayoutClient 와 공유하는 세그먼트 분해 함수로 — orgSlug/리그 slug 가 'me' 로 시작하면
  // /\/me.*$/ 가 앞쪽에서 먼저 매치돼 base 가 '/league' 로 잘리는 함정이 있었다 (Minor 3).
  const base = deriveLeagueBase(pathname, orgSlug, leagueId)
  const { user, loading: authLoading } = useCurrentUser()

  // 드래프트 바로가기 — 드래프트는 주장·어드민 전용이 됐다(2026-10-12) → 편집 모드(어드민 ∥ CEO)에게만,
  //   그리고 현재 분기에 진행 중인 세션이 있을 때만. 레이아웃 드래프트 탭과 같은 훅(useActiveDraft)으로 판정한다.
  const showDraft = useActiveDraft(leagueId)

  // 미라클 월렛(2026-11-09) — 월렛을 켠 팀에서 로그인한 회원에게 잔액과 함께 바로가기를 보인다.
  const [wallet, setWallet] = useState<{ name: string; balance: number | null } | null>(null)
  useEffect(() => {
    if (!user) return
    let alive = true
    fetch(`/api/leagues/${leagueId}/wallet`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then((j: { enabled: boolean; name?: string; me?: { balance: number } | null } | null) => {
        if (alive) setWallet(j?.enabled ? { name: j.name ?? '월렛', balance: j.me?.balance ?? null } : null)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [leagueId, user])

  // 월렛 · 드래프트 바로가기 · 계정 — PC 는 왼쪽 칸 프로필 바로 아래(스크롤 없이 보이게, 2026-11-09 운영진),
  //   폰은 종전처럼 맨 아래. 같은 묶음을 두 자리에 그리고 화면 폭으로 하나만 보인다.
  const shortcuts = (wallet && user) || showDraft ? (
    <SectionCard variant="standalone" pad="none">
      {user && wallet && (
        <ShortcutRow
          href={`${base}/wallet`} Icon={Wallet} label={wallet.name}
          sub={wallet.balance == null ? '포인트 충전 · 내역' : `잔액 ${wallet.balance.toLocaleString()}P · 충전 · 내역`}
          last={!showDraft}
        />
      )}
      {showDraft && <ShortcutRow href={`${base}/draft`} Icon={ClipboardList} label="드래프트" sub="진행 중인 드래프트 세션" last />}
    </SectionCard>
  ) : null
  const side = (
    <>
      {shortcuts}
      <AccountCard leagueId={leagueId} />
    </>
  )

  return (
    <div className="space-y-3 lg:space-y-4">
      <h2 className="font-black text-[28px] lg:text-[32px] leading-none text-[color:var(--mm-ink)] tracking-tight">내 기록</h2>

      {authLoading ? (
        <MePageSkeleton />
      ) : user ? (
        <>
          <PersonalDashboard leagueId={leagueId} orgSlug={orgSlug} base={base} side={side} />
          {/* 폰·태블릿: 맨 아래 */}
          <div className="lg:hidden space-y-3">{side}</div>
        </>
      ) : (
        <>
          <LoginTeaser />
          {/* 비로그인: 앱 설치만 남는 계정 카드 */}
          <div className="lg:max-w-[360px]"><AccountCard leagueId={leagueId} /></div>
        </>
      )}
    </div>
  )
}

function ShortcutRow({
  href, Icon, label, sub, last = false,
}: { href: string; Icon: LucideIcon; label: string; sub: string; last?: boolean }) {
  return (
    <Link
      href={href}
      className="mm-press flex items-center gap-3 px-4 md:px-5 py-3.5 min-h-[44px] hover:bg-[color:var(--mm-panel-alt)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--mm-yellow-strong)]"
      style={last ? undefined : { borderBottom: '1px solid var(--mm-rule)' }}
    >
      <span
        className="shrink-0 inline-flex items-center justify-center w-10 h-10"
        style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', borderRadius: 'var(--mm-radius-ctl)' }}
      >
        <Icon size={20} aria-hidden />
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm md:text-base" style={{ color: 'var(--mm-ink)' }}>{label}</div>
        <div className="text-xs" style={{ color: 'var(--mm-muted)' }}>{sub}</div>
      </div>
      <ChevronRight size={20} className="shrink-0" style={{ color: 'var(--mm-muted)' }} aria-hidden />
    </Link>
  )
}
