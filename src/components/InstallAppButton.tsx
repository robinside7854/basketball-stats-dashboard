'use client'
// 앱 설치 버튼 — 브라우저 메뉴를 뒤지지 않고 앱 안에서 바로 설치하게 한다.
//
// 왜 만들었나: 설치 조건(매니페스트·아이콘·서비스워커·HTTPS)은 전부 충족돼 있는데
//   앱 안에 입구가 없어서 사용자가 "다운로드를 못 찾겠다" 고 했다(2026-08-10).
//   크롬은 조건이 맞으면 beforeinstallprompt 를 던지는데, 그걸 잡아두지 않으면
//   사용자가 브라우저 메뉴에서 직접 찾아야 한다.
//
// 플랫폼별 사정:
//   · 안드로이드 크롬 — beforeinstallprompt 를 던진다. 잡아뒀다가 클릭 시 prompt() 호출.
//   · iOS 사파리 — 이 이벤트를 아예 안 던진다. 공유 시트로만 설치되므로 안내 문구를 띄운다.
//   · 이미 설치돼 실행 중(standalone) — 아무것도 보여주지 않는다.
import { useEffect, useState } from 'react'
import { Download, Share } from 'lucide-react'

// beforeinstallprompt 는 아직 표준이 아니라 TS 기본 타입에 없다.
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function InstallAppButton() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [iosHint, setIosHint] = useState(false)

  useEffect(() => {
    // 이미 앱으로 실행 중이면 설치 안내가 필요 없다.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) { setInstalled(true); return }

    const onPrompt = (e: Event) => {
      // 크롬 기본 미니 인포바를 막고 우리가 원하는 자리에서 띄운다.
      e.preventDefault()
      setDeferred(e as InstallPromptEvent)
    }
    const onInstalled = () => { setInstalled(true); setDeferred(null) }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)

    // iOS 사파리 판별 — 이벤트가 없으므로 안내로 대체한다.
    const ua = window.navigator.userAgent
    const isIOS = /iPad|iPhone|iPod/.test(ua)
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
    if (isIOS && isSafari) setIosHint(true)

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed) return null

  if (deferred) {
    return (
      <button
        type="button"
        onClick={async () => {
          await deferred.prompt()
          const { outcome } = await deferred.userChoice
          // 한 번 쓴 프롬프트는 재사용할 수 없다 — 거절해도 버튼을 지워
          //   같은 버튼을 눌러도 아무 일 없는 상태를 만들지 않는다.
          if (outcome === 'accepted') setInstalled(true)
          setDeferred(null)
        }}
        className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-md border text-sm font-bold cursor-pointer transition-colors"
        style={{
          borderColor: 'var(--mm-yellow)',
          background: 'var(--mm-yellow)',
          color: 'var(--mm-black)',
        }}
      >
        <Download size={16} />
        앱으로 설치
      </button>
    )
  }

  if (iosHint) {
    return (
      <span
        className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-md border text-xs font-medium"
        style={{ borderColor: 'var(--mm-rule)', color: 'var(--mm-muted)' }}
      >
        <Share size={14} />
        공유 → “홈 화면에 추가” 로 앱처럼 쓸 수 있어요
      </span>
    )
  }

  // 조건 미충족이거나 이미 한 번 설치를 거절한 브라우저 — 조용히 아무것도 안 보여준다.
  return null
}
