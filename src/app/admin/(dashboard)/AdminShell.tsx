'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { LayoutDashboard, LogOut, Medal, Menu, UserCog, X } from 'lucide-react'
import { Basketball } from '@/components/league/BasketballIcons'

interface Props {
  /** 대기 중인 접근 요청 개수 — 사이드바/상단바 배지 */
  pending: number
  /** 레이아웃(서버)에서 만든 로그아웃 서버 액션 */
  signOutAction: () => Promise<void>
  children: React.ReactNode
}

// 사이드바는 375px 에서 조건 없이 w-56(238px) 을 차지해 본문에 69px 만 남겼다 —
// 본문 글자가 한 줄에 한 글자씩 세로로 흘렀다. 데스크톱에서는 고정 사이드바를 그대로 두고,
// 모바일에서는 햄버거 → 드로어로 옮긴다. 목록·표는 페이지 쪽에서 각자 접히게 한다.
export default function AdminShell({ pending, signOutAction, children }: Props) {
  const [open, setOpen] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    // 포커스 트랩까지는 아니어도 키보드만으로 빠져나올 수는 있어야 한다.
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    // 드로어가 열린 동안 뒤 본문이 스크롤되면 닫았을 때 읽던 위치를 잃는다.
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open])

  function closeDrawer() {
    setOpen(false)
    // 닫은 뒤 포커스가 사라지면 키보드 사용자는 문서 처음으로 튕긴다 — 연 버튼으로 되돌린다.
    menuButtonRef.current?.focus()
  }

  // 메뉴 링크를 누르면 곧바로 닫는다. 라우트 변경을 effect 로 감시하면 렌더가 한 번 더 돌고,
  // 드로어가 남아 있는 프레임 동안 이동한 화면이 가려져 "안 눌렸다"고 오해한다.
  // (여기서는 포커스를 햄버거로 되돌리지 않는다 — 이동한 화면 쪽에 포커스가 있어야 맞다.)
  function closeOnNavigate() { setOpen(false) }

  const linkClass = 'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[var(--mm-muted)] hover:text-[var(--mm-ink)] hover:bg-[var(--mm-panel-alt)] transition-colors text-sm cursor-pointer min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)]'

  // 데스크톱 사이드바와 모바일 드로어가 같은 항목을 보여줘야 하므로 한 곳에서 만든다 —
  // 두 벌로 나누면 메뉴가 늘 때 한쪽만 빠진다.
  const nav = (
    <>
      <div className="px-5 py-5 border-b border-[var(--mm-rule)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-[var(--mm-ink)] rounded-lg flex items-center justify-center text-sm shrink-0">
            <Basketball size={18} className="text-[var(--mm-yellow-strong)]" />
          </div>
          {/* 이 콘솔은 온볼 자체를 운영하는 자리다(CEO). 각 동호회를 운영하는 사람은
              '어드민'이라 부르는데, 그들은 여기가 아니라 자기 팀 화면의 편집 모드로 들어간다.
              둘 다 'Admin' 이라고 쓰면 어느 쪽 권한인지 화면만 보고 알 수 없다. */}
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--mm-ink)]">온볼 운영</p>
            <p className="text-xs text-[var(--mm-muted)]">플랫폼 콘솔 · CEO</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-3 overflow-y-auto">
        <Link href="/admin" onClick={closeOnNavigate} className={linkClass}>
          <LayoutDashboard size={16} />
          대시보드
        </Link>

        {/* 조직(org)과 팀은 더 이상 구분되지 않는다 — 팀이 최상위 단위이고 그 아래
            리그·대회가 있을 뿐이다 (2026-08-06). 예전엔 "조직" 섹션(Org 관리)과
            "운영" 섹션(팀 관리)이 나뉘어 있었지만, 이제 실제로 가리키는 대상이
            하나(팀)라 섹션을 나눌 근거가 없다 — 링크 하나로 합친다. */}
        <div className="mt-4 mb-1 px-3">
          <p className="text-xs font-semibold text-[var(--mm-muted)] uppercase tracking-wider">관리</p>
        </div>
        <Link href="/admin/leagues" onClick={closeOnNavigate} className={linkClass}>
          <Medal size={16} />
          팀 관리
        </Link>
        <Link href="/admin/admins" onClick={closeOnNavigate} className={linkClass}>
          <UserCog size={16} />
          <span className="flex-1">공동관리자</span>
          {pending > 0 && (
            <span
              className="text-xs px-1.5 min-w-5 text-center rounded-full bg-[var(--mm-yellow-soft)] text-[var(--mm-yellow-strong)] font-semibold"
              aria-label={`대기 중 접근 요청 ${pending}건`}
            >
              {pending}
            </span>
          )}
        </Link>
      </nav>

      <div className="p-3 border-t border-[var(--mm-rule)]">
        <form action={signOutAction}>
          <button type="submit" className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[var(--mm-muted)] hover:text-[var(--mm-negative)] hover:bg-[var(--mm-panel-alt)] transition-colors text-sm w-full cursor-pointer min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-negative)]">
            <LogOut size={16} />
            로그아웃
          </button>
        </form>
      </div>
    </>
  )

  return (
    <div className="min-h-screen bg-[var(--mm-ground)] flex flex-col md:flex-row">
      {/* 모바일 상단바 — 사이드바를 대신하는 유일한 진입점이라 항상 보이게 sticky */}
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-2 px-3 py-2 bg-[var(--mm-panel)] border-b border-[var(--mm-rule)]">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-label="운영 메뉴 열기"
          aria-expanded={open}
          aria-controls="admin-drawer"
          className="w-11 h-11 shrink-0 flex items-center justify-center rounded-lg text-[var(--mm-ink)] hover:bg-[var(--mm-panel-alt)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)]"
        >
          <Menu size={20} />
        </button>
        <div className="w-7 h-7 bg-[var(--mm-ink)] rounded-lg flex items-center justify-center shrink-0">
          <Basketball size={16} className="text-[var(--mm-yellow-strong)]" />
        </div>
        <p className="text-sm font-bold text-[var(--mm-ink)] truncate">온볼 운영</p>
        {pending > 0 && (
          <span
            className="ml-auto text-xs px-1.5 min-w-5 text-center rounded-full bg-[var(--mm-yellow-soft)] text-[var(--mm-yellow-strong)] font-semibold shrink-0"
            aria-label={`대기 중 접근 요청 ${pending}건`}
          >
            {pending}
          </span>
        )}
      </header>

      {/* 데스크톱 고정 사이드바 — shrink-0 이 없으면 본문이 넓어질 때 폭이 밀려 글자가 깨진다 */}
      <aside className="hidden md:flex w-56 shrink-0 bg-[var(--mm-panel)] border-r border-[var(--mm-rule)] flex-col">
        {nav}
      </aside>

      {/* 모바일 드로어 */}
      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* 바깥 클릭으로 닫기. button 이라 키보드 탭으로도 닿고 Enter 로 닫힌다. */}
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={closeDrawer}
            className="absolute inset-0 bg-[var(--mm-black)]/60 cursor-pointer mm-fade-in"
          />
          <aside
            id="admin-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="운영 콘솔 메뉴"
            className="relative w-64 max-w-[82vw] h-full flex flex-col bg-[var(--mm-panel)] border-r border-[var(--mm-rule)] mm-sheet-in"
          >
            <button
              ref={closeButtonRef}
              type="button"
              onClick={closeDrawer}
              aria-label="메뉴 닫기"
              className="absolute top-2 right-2 w-11 h-11 flex items-center justify-center rounded-lg text-[var(--mm-muted)] hover:text-[var(--mm-ink)] hover:bg-[var(--mm-panel-alt)] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)]"
            >
              <X size={20} />
            </button>
            {nav}
          </aside>
        </div>
      )}

      {/* 본문 — 이전에는 overflow-y-auto 가 붙어 있었는데, 한 축이 visible 이 아니면
          반대 축도 auto 로 계산돼(CSS overflow 규칙) main 자체가 가로 스크롤을 가졌다.
          그래서 넘친 내용이 페이지 어디에도 표시되지 않고 그냥 숨었다 — 제거한다.
          min-w-0 은 flex 자식이 내용 최소폭 아래로 줄어들 수 있게 해 준다. */}
      <main className="flex-1 min-w-0 p-4 md:p-8">
        {children}
      </main>
    </div>
  )
}
