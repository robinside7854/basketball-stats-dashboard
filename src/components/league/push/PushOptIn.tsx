'use client'
// 회원용 푸시 알림 켜기/끄기 토글 (공지 헤더 등에 배치)
// - 서버 GET /push 로 설정 여부 + VAPID 공개키 확인 (미설정이면 렌더 안 함)
// - 권한/구독 상태에 따라 라벨·아이콘 전환
// - iOS 는 홈화면 추가(PWA) 상태에서만 푸시 지원 → 안내 메시지 분기
import { useState, useEffect, useCallback } from 'react'
import { Bell, BellRing, BellOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { pushSupported, getExistingSubscription, subscribeToPush, unsubscribeFromPush } from '@/lib/push/client'

interface Props {
  leagueId: string
  compact?: boolean   // 헤더용 아이콘 버튼 축약형
}

type State = 'loading' | 'unsupported' | 'not-configured' | 'off' | 'on' | 'denied'

// iOS 여부(홈화면 미설치 시 푸시 불가 안내용)
function isIosSafariNonStandalone(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const iOS = /iPad|iPhone|iPod/.test(ua)
  const standalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true
    || window.matchMedia('(display-mode: standalone)').matches
  return iOS && !standalone
}

export default function PushOptIn({ leagueId, compact = false }: Props) {
  const [state, setState] = useState<State>('loading')
  const [publicKey, setPublicKey] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      if (!pushSupported()) { if (alive) setState('unsupported'); return }
      try {
        const res = await fetch(`/api/leagues/${leagueId}/push`)
        const data = await res.json() as { configured?: boolean; publicKey?: string }
        if (!alive) return
        if (!data.configured || !data.publicKey) { setState('not-configured'); return }
        setPublicKey(data.publicKey)
        if (Notification.permission === 'denied') { setState('denied'); return }
        const sub = await getExistingSubscription()
        if (!alive) return
        setState(sub ? 'on' : 'off')
      } catch {
        if (alive) setState('not-configured')
      }
    })()
    return () => { alive = false }
  }, [leagueId])

  const enable = useCallback(async () => {
    if (busy) return
    if (isIosSafariNonStandalone()) {
      toast.info('iPhone은 먼저 홈 화면에 추가(공유 → 홈 화면에 추가) 후 알림을 켤 수 있어요.')
      return
    }
    setBusy(true)
    const r = await subscribeToPush(leagueId, publicKey)
    setBusy(false)
    if (r.ok) { setState('on'); toast.success('알림이 켜졌습니다. 공지·알럿을 받아요.') }
    else if (r.reason === 'denied') { setState('denied'); toast.error('브라우저에서 알림이 차단되어 있어요. 사이트 설정에서 허용해 주세요.') }
    else toast.error('알림 켜기에 실패했습니다.')
  }, [busy, leagueId, publicKey])

  const disable = useCallback(async () => {
    if (busy) return
    setBusy(true)
    const ok = await unsubscribeFromPush(leagueId)
    setBusy(false)
    if (ok) { setState('off'); toast.success('알림을 껐습니다.') }
    else toast.error('알림 끄기에 실패했습니다.')
  }, [busy, leagueId])

  // 미지원·미설정 → 숨김 (기능이 아예 없는 것처럼)
  if (state === 'loading' || state === 'unsupported' || state === 'not-configured') return null

  const label = state === 'on' ? '알림 켜짐' : state === 'denied' ? '알림 차단됨' : '알림 켜기'
  const Icon = state === 'on' ? BellRing : state === 'denied' ? BellOff : Bell
  const onClick = state === 'on' ? disable : state === 'denied'
    ? () => toast.error('브라우저 사이트 설정에서 알림을 허용으로 바꿔 주세요.')
    : enable

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={label}
      title={state === 'on' ? '공지·알럿 알림 끄기' : '공지·알럿 알림 받기'}
      className={`min-h-[36px] ${compact ? 'px-2.5' : 'px-3'} py-1.5 text-[11px] font-bold uppercase tracking-[0.10em] rounded-sm cursor-pointer transition-colors inline-flex items-center gap-1.5 disabled:opacity-60`}
      style={{
        background: state === 'on' ? 'var(--mm-yellow)' : 'transparent',
        color: state === 'on' ? 'var(--mm-black)' : 'var(--mm-ink)',
        border: `1px solid ${state === 'on' ? 'var(--mm-black)' : 'var(--mm-rule)'}`,
      }}
    >
      {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Icon size={13} aria-hidden />}
      {!compact && label}
    </button>
  )
}
