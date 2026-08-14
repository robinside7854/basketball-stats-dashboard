'use client'
// 홈 최상단 — 처리 대기 중인 가입 신청 알림 (어드민 전용).
//
// 왜 필요한가: 가입 신청은 지금까지 **설정 탭 안에서만** 보였다. 어드민이 설정에 들어갈 일은
//   드물어서, 신청한 사람은 승인될 때까지 아무것도 못 보고 기다린다. 온보딩 중인 팀에서
//   이 지연은 그대로 이탈이 된다 — 가입률이 관문인 상황에서 가장 아까운 종류의 손실이다.
//
// 왜 홈인가: 어드민도 앱을 열면 홈부터 본다. "찾아가야 보이는 것"을 "열면 보이는 것"으로 옮긴다.
//
// 왜 폴링하지 않는가: 어드민이 홈을 띄워 놓고 기다리는 상황은 없다. 실제로 필요한 건
//   **앱을 다시 열었을 때 최신인 것**이라, 마운트 + 창 포커스 복귀 시점에만 다시 읽는다.
//   초 단위 폴링은 배터리만 쓰고 얻는 게 없다.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserPlus, ChevronRight } from 'lucide-react'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'

interface PendingAccount {
  id: string
  requested_at: string | null
  player: { name: string } | null
}

/** 신청한 지 얼마나 됐는지. 오래 묵은 신청일수록 눈에 띄어야 한다. */
function waitedLabel(iso: string | null): string | null {
  if (!iso) return null
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return '오늘'
  if (days === 1) return '어제'
  return `${days}일째`
}

export default function PendingSignupsAlert({ leagueId }: { leagueId: string }) {
  const { isEditMode, isInitialized, leagueHeaders } = useLeagueEditMode()
  const pathname = usePathname()
  const [pending, setPending] = useState<PendingAccount[] | null>(null)

  const load = useCallback(async () => {
    if (!isEditMode) return
    try {
      const r = await fetch(`/api/leagues/${leagueId}/auth/admin/accounts?status=pending`, {
        headers: leagueHeaders,
        cache: 'no-store',
      })
      if (!r.ok) return
      const d = await r.json() as { accounts?: PendingAccount[] }
      setPending(d.accounts ?? [])
    } catch {
      // 조용히 넘긴다 — 이건 부가 알림이라, 실패했다고 홈에 에러를 띄우면 손해가 더 크다.
    }
  }, [leagueId, isEditMode, leagueHeaders])

  useEffect(() => { if (isInitialized) load() }, [isInitialized, load])

  // 앱을 다시 열거나 다른 탭에서 돌아왔을 때 갱신 — 승인 처리 후 돌아오면 카드가 사라진다.
  useEffect(() => {
    if (!isEditMode) return
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [isEditMode, load])

  // 어드민이 아니거나 대기 건이 없으면 자리 자체를 만들지 않는다 —
  // "0건입니다" 카드는 매일 보는 사람에게 소음이다.
  if (!isEditMode || !pending || pending.length === 0) return null

  const names = pending.map(p => p.player?.name).filter(Boolean).slice(0, 3) as string[]
  const rest = pending.length - names.length
  // 가장 오래 기다린 사람 = 목록 마지막(요청 시각 내림차순으로 온다).
  const oldest = waitedLabel(pending[pending.length - 1]?.requested_at ?? null)

  return (
    <Link
      href={`${pathname.replace(/\/$/, '')}/settings`}
      className="flex items-center gap-3 px-4 py-3 md:px-5 cursor-pointer transition-colors hover:brightness-[0.98]"
      style={{
        background: 'var(--mm-yellow-soft)',
        border: '1px solid var(--mm-yellow)',
        borderRadius: 'var(--mm-radius-card)',
      }}
      aria-label={`가입 신청 ${pending.length}건 처리하기`}
    >
      <span
        className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full"
        style={{ background: 'var(--mm-yellow)' }}
        aria-hidden
      >
        <UserPlus size={18} style={{ color: 'var(--mm-black)' }} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-black" style={{ color: 'var(--mm-ink)' }}>
          가입 신청 {pending.length}건
          {oldest && oldest !== '오늘' && (
            <span className="ml-1.5 font-bold" style={{ color: 'var(--mm-negative)' }}>· {oldest} 대기</span>
          )}
        </span>
        <span className="block text-[12px] truncate" style={{ color: 'var(--mm-ink-soft)' }}>
          {names.length > 0
            ? `${names.join(' · ')}${rest > 0 ? ` 외 ${rest}명` : ''}`
            : '승인 대기 중입니다'}
        </span>
      </span>

      <ChevronRight size={18} className="shrink-0" style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden />
    </Link>
  )
}
