'use client'
// 홈 최상단 — 처리 대기 중인 가입 신청 알림 (어드민 전용).
//
// 왜 필요한가: 가입 신청은 지금까지 **설정 탭 안에서만** 보였다. 어드민이 설정에 들어갈 일은
//   드물어서, 신청한 사람은 승인될 때까지 아무것도 못 보고 기다린다. 온보딩 중인 팀에서
//   이 지연은 그대로 이탈이 된다 — 가입률이 관문인 상황에서 가장 아까운 종류의 손실이다.
//
// 왜 홈인가: 어드민도 앱을 열면 홈부터 본다. "찾아가야 보이는 것"을 "열면 보이는 것"으로 옮긴다.
//
// 조회는 usePendingSignups 가 맡는다 — 상단 톱니바퀴 배지와 **같은 값**을 봐야 하기 때문이다.
//   따로 부르면 승인 직후 카드는 사라졌는데 점만 남는 식으로 어긋난다.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserPlus, ChevronRight } from 'lucide-react'
import { usePendingSignups } from '@/lib/hooks/usePendingSignups'

/** 신청한 지 얼마나 됐는지. 오래 묵은 신청일수록 눈에 띄어야 한다. */
function waitedLabel(iso: string | null): string | null {
  if (!iso) return null
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return '오늘'
  if (days === 1) return '어제'
  return `${days}일째`
}

export default function PendingSignupsAlert({ leagueId }: { leagueId: string }) {
  const pending = usePendingSignups(leagueId)
  const pathname = usePathname()

  // 어드민이 아니거나 대기 건이 없으면 자리 자체를 만들지 않는다 —
  // "0건입니다" 카드는 매일 보는 사람에게 소음이다.
  if (pending.length === 0) return null

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
        <UserPlus size={20} style={{ color: 'var(--mm-black)' }} />
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

      <ChevronRight size={20} className="shrink-0" style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden />
    </Link>
  )
}
