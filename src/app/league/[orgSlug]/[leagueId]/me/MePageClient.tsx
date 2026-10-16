'use client'
// "내 기록" 탭 본문(Task 4-A/4-B) — 상단 네비에서 라커룸이 빠지고 유저 칩·로그아웃·접속현황·
// 테마 토글이 이 페이지로 내려오면서 생긴 유일한 계정/개인 화면.
//   비로그인: LoginTeaser(홈 위젯과 달리 닫기 없이 항상 노출 — 여기가 목적지이므로)
//   로그인: PersonalDashboard 를 그대로 재사용(새로 만들지 않음)
//   바로가기: 드래프트(진행 중 · 어드민만) — 내 하이라이트는 대시보드 「내 베스트샷」 카드로(2026-10-12)
//     — 선수 명단·팀 순위는 스탯 탭으로, 설정은 상단 바 어드민 버튼으로 이동했다(둘 다 여기서 제거,
//       2026-08-08 stats-umbrella-move 기준 갱신).
//   계정: 라이트/다크 · 로그아웃 — 둘러보기 버튼은 기능 자체가 삭제되어 함께 제거했다(Task 4-A).
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { LogOut, ChevronRight, ClipboardList } from 'lucide-react'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'
import { useActiveDraft } from '@/lib/hooks/useActiveDraft'
import { deriveLeagueBase } from '../_components/LeagueLayoutClient'
import PersonalDashboard, { LoginTeaser } from '@/components/league/auth/PersonalDashboard'
import SectionCard from '@/components/league/ui/SectionCard'
import InstallAppButton from '@/components/InstallAppButton'
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
  const { user, loading: authLoading, logout } = useCurrentUser()

  // 드래프트 바로가기 — 드래프트는 주장·어드민 전용이 됐다(2026-10-12) → 편집 모드(어드민 ∥ CEO)에게만,
  //   그리고 현재 분기에 진행 중인 세션이 있을 때만. 레이아웃 드래프트 탭과 같은 훅(useActiveDraft)으로 판정한다.
  const showDraft = useActiveDraft(leagueId)

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-black text-[28px] lg:text-[40px] leading-none text-[color:var(--mm-ink)] tracking-tight">내 기록</h2>
      </div>

      {authLoading ? (
        <MePageSkeleton />
      ) : user ? (
        <PersonalDashboard leagueId={leagueId} orgSlug={orgSlug} base={base} />
      ) : (
        <LoginTeaser />
      )}

      {/* 바로가기 — 드래프트(진행 중 · 어드민만)만 남았다. 「내 하이라이트」는 2026-10-12 부터
          대시보드의 「내 베스트샷」 카드 머리(전체 하이라이트)로 옮겼다 — 같은 링크를 두 곳에 두지 않는다. */}
      {/* PC: 바로가기·계정 카드는 위 대시보드 왼쪽 칼럼(380px) 폭에 맞춘다 — 전폭이면 버튼 한두 개 옆이 텅 비었다 */}
      {showDraft && (
        <SectionCard variant="standalone" pad="none" className="lg:max-w-[380px]">
          <ShortcutRow href={`${base}/draft`} Icon={ClipboardList} label="드래프트" sub="진행 중인 드래프트 세션" last />
        </SectionCard>
      )}

      {/* 계정 — 앱 설치 · 로그아웃.
          라이트/다크 토글은 2026-08-15 에 헤더 우측 아이콘으로 옮겼다(`LeagueLayoutClient`).
          여기 있으면 테마를 바꾸려고 개인 화면까지 들어와야 했다. 같은 설정을 두 곳에 두면
          '설정 탭 vs 톱니바퀴'와 똑같은 중복이 되므로 이 자리에는 남기지 않는다. */}
      <SectionCard variant="standalone" pad="base" className="lg:max-w-[380px]">
        <div className="flex flex-wrap items-center gap-2">
          {/* 앱 설치 — 브라우저 메뉴를 뒤지지 않도록 앱 안에 입구를 둔다.
              설치 불가·이미 설치됨이면 스스로 아무것도 렌더하지 않는다. */}
          <InstallAppButton />
          {user && (
            <button
              type="button"
              onClick={() => logout()}
              className="mm-press inline-flex items-center gap-1.5 min-h-[44px] px-3.5 border text-sm font-bold cursor-pointer transition-colors hover:border-[color:var(--mm-ink-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
              style={{ borderColor: 'var(--mm-rule)', color: 'var(--mm-muted)', borderRadius: 'var(--mm-radius-ctl)' }}
            >
              <LogOut size={16} />
              로그아웃
            </button>
          )}
        </div>
      </SectionCard>
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
