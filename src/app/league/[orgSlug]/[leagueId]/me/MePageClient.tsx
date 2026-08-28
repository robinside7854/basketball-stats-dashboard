'use client'
// "내 기록" 탭 본문(Task 4-A/4-B) — 상단 네비에서 라커룸이 빠지고 유저 칩·로그아웃·접속현황·
// 테마 토글이 이 페이지로 내려오면서 생긴 유일한 계정/개인 화면.
//   비로그인: LoginTeaser(홈 위젯과 달리 닫기 없이 항상 노출 — 여기가 목적지이므로)
//   로그인: PersonalDashboard 를 그대로 재사용(새로 만들지 않음)
//   바로가기: 내 하이라이트(로그인 시만, D5→D3 해소 지점) · 드래프트(진행 중)
//     — 선수 명단·팀 순위는 스탯 탭으로, 설정은 상단 바 어드민 버튼으로 이동했다(둘 다 여기서 제거,
//       2026-08-08 stats-umbrella-move 기준 갱신).
//   계정: 라이트/다크 · 로그아웃 — 둘러보기 버튼은 기능 자체가 삭제되어 함께 제거했다(Task 4-A).
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { LogOut, ChevronRight, ClipboardList, Film, HelpCircle } from 'lucide-react'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'
import { deriveLeagueBase } from '../_components/LeagueLayoutClient'
import PersonalDashboard, { LoginTeaser } from '@/components/league/auth/PersonalDashboard'
import TraitBadgePanel from '@/components/league/TraitBadgePanel'
import BadgeDexModal from '@/components/league/BadgeDexModal'
import SectionCard from '@/components/league/ui/SectionCard'
import InstallAppButton from '@/components/InstallAppButton'
import { BasketballLoader } from '@/components/league/BasketballIcons'

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

  // 드래프트 바로가기 노출 조건 — LeagueLayoutClient 의 showDraft 판정과 동일한 기존 API 를
  // 다시 호출한다(신규 쿼리 아님 · 새 페이지가 기존 것을 그대로 쓰는 Global Constraint 1 의 예외).
  const [showDraft, setShowDraft] = useState(false)
  // 배지 도감 — 자동·특성 두 계열 전체 목록과 내 보유 여부를 한 번에 본다.
  const [dexOpen, setDexOpen] = useState(false)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const qs = await fetch(`/api/leagues/${leagueId}/quarters`).then(r => r.json())
        const cur = (qs ?? []).find((q: { is_current?: boolean }) => q.is_current) ?? (qs ?? [])[qs.length - 1]
        if (!cur) return
        const d = await fetch(`/api/leagues/${leagueId}/drafts/current?quarterId=${cur.id}`).then(r => r.json())
        if (!cancelled) setShowDraft(!!d.draft && d.draft.status !== 'completed')
      } catch { /* ignore */ }
    })()
    return () => { cancelled = true }
  }, [leagueId])

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-bold text-[28px] lg:text-[40px] leading-none text-[color:var(--mm-ink)] tracking-tight">내 기록</h2>
      </div>

      {authLoading ? (
        <div className="flex justify-center py-12"><BasketballLoader size={24} /></div>
      ) : user ? (
        <>
          <PersonalDashboard leagueId={leagueId} orgSlug={orgSlug} />
          {/* 내 특성 배지 — "내 기록이 게임처럼 남는" 자리. 선수 상세 모달까지 들어가지 않아도
              자기 유형을 바로 보게 한다. */}
          {user.player_id && (
            <SectionCard variant="standalone">
              <div className="space-y-2">
                {/* 도움말 버튼은 라벨 줄에 둔다 — 배지가 없는 회원에게도 "받을 수 있는 게 뭔지"로
                    가는 입구가 항상 보여야 한다(패널 안에 넣으면 빈 상태에서 같이 사라진다). */}
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>
                    내 특성
                  </p>
                  <button
                    type="button"
                    onClick={() => setDexOpen(true)}
                    aria-label="배지 도감 열기 — 전체 배지와 달성 조건 보기"
                    className="inline-flex items-center gap-1.5 min-h-11 px-3 -mr-1 text-xs font-bold cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
                    style={{ color: 'var(--mm-ink-soft)', borderRadius: 'var(--mm-radius-ctl)' }}
                  >
                    <HelpCircle size={16} strokeWidth={2} aria-hidden />
                    배지 도감
                  </button>
                </div>
                <TraitBadgePanel leagueId={leagueId} playerId={user.player_id} />
              </div>
            </SectionCard>
          )}
          {dexOpen && user.player_id && (
            <BadgeDexModal
              leagueId={leagueId}
              playerId={user.player_id}
              onClose={() => setDexOpen(false)}
            />
          )}
        </>
      ) : (
        <LoginTeaser />
      )}

      {/* 바로가기 — 선수 명단·팀 순위는 스탯 탭으로, 설정은 상단 바 어드민 버튼으로 옮겨졌다
          (Task 4-B, 2026-08-08 갱신). 남는 항목이 하나도 없으면(비로그인 + 드래프트 없음) 빈 카드를 렌더하지 않는다. */}
      {(user || showDraft) && (
        <SectionCard variant="standalone">
          {user && (
            <ShortcutRow
              href={`${base}/highlights/player/${user.player_id}`}
              Icon={Film}
              label="내 하이라이트"
              sub="내가 참여한 경기 클립 모아보기"
              last={!showDraft}
            />
          )}
          {showDraft && (
            <ShortcutRow href={`${base}/draft`} Icon={ClipboardList} label="드래프트" sub="진행 중인 드래프트 세션" last />
          )}
        </SectionCard>
      )}

      {/* 계정 — 앱 설치 · 로그아웃.
          라이트/다크 토글은 2026-08-15 에 헤더 우측 아이콘으로 옮겼다(`LeagueLayoutClient`).
          여기 있으면 테마를 바꾸려고 개인 화면까지 들어와야 했다. 같은 설정을 두 곳에 두면
          '설정 탭 vs 톱니바퀴'와 똑같은 중복이 되므로 이 자리에는 남기지 않는다. */}
      <SectionCard variant="standalone">
        <div className="flex flex-wrap items-center gap-2 p-4">
          {/* 앱 설치 — 브라우저 메뉴를 뒤지지 않도록 앱 안에 입구를 둔다.
              설치 불가·이미 설치됨이면 스스로 아무것도 렌더하지 않는다. */}
          <InstallAppButton />
          {user && (
            <button
              type="button"
              onClick={() => logout()}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-md border text-sm font-bold cursor-pointer transition-colors hover:border-[color:var(--mm-ink-soft)]"
              style={{ borderColor: 'var(--mm-rule)', color: 'var(--mm-muted)' }}
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
      className="flex items-center gap-3 px-4 md:px-5 py-3.5 min-h-[44px] hover:bg-[color:var(--mm-panel-alt)] transition-colors cursor-pointer"
      style={last ? undefined : { borderBottom: '1px solid var(--mm-rule)' }}
    >
      <span
        className="shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-md"
        style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)' }}
      >
        <Icon size={20} aria-hidden />
      </span>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm md:text-base" style={{ color: 'var(--mm-ink)' }}>{label}</div>
        <div className="text-[12px]" style={{ color: 'var(--mm-muted)' }}>{sub}</div>
      </div>
      <ChevronRight size={20} className="shrink-0" style={{ color: 'var(--mm-muted)' }} aria-hidden />
    </Link>
  )
}
