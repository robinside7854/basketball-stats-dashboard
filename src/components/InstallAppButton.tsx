'use client'
// 앱 설치 버튼 — 브라우저 메뉴를 뒤지지 않고 앱 안에서 바로 설치하게 한다.
//
// 왜 만들었나: 설치 조건(매니페스트·아이콘·서비스워커·HTTPS)은 전부 충족돼 있는데
//   앱 안에 입구가 없어서 사용자가 "다운로드를 못 찾겠다" 고 했다(2026-08-10).
//
// ⚠ 이벤트를 여기서 직접 기다리면 안 된다.
//   beforeinstallprompt 는 문서 로드 직후 한 번만 발생한다. 이 컴포넌트는 '내 기록' 탭에만
//   있어서, 홈으로 들어와 탭을 이동하면 마운트 시점엔 이벤트가 이미 지나간 뒤다.
//   그래서 layout.tsx 의 <head> 인라인 스크립트가 하이드레이션보다 먼저 이벤트를 붙잡아
//   window.__onballInstallPrompt 에 보관한다. 여기서는 그 보관분을 읽어간다.
//
// 플랫폼별 사정:
//   · 안드로이드 크롬 — 보관된 프롬프트가 있으면 클릭 시 바로 설치 창.
//   · iOS 사파리 — 이벤트를 아예 안 던진다. 공유 시트로만 설치되므로 안내로 분기.
//   · 프롬프트가 없는 경우(이미 한 번 거절해 크롬이 억제 중 등) — 버튼을 감추지 않고
//     수동 설치 경로를 안내한다. 감추면 사용자는 또 못 찾는다. 그게 이 작업의 발단이었다.
//   · 이미 설치돼 실행 중(standalone) — 아무것도 보여주지 않는다.
import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'

// beforeinstallprompt 는 아직 표준이 아니라 TS 기본 타입에 없다.
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
declare global {
  interface Window { __onballInstallPrompt?: InstallPromptEvent | null }
}

export default function InstallAppButton() {
  // mounted: 서버와 클라이언트의 첫 렌더를 맞추기 위한 게이트. 설치 가능 여부는
  //   window 를 봐야 알 수 있어서 SSR 단계에서는 판정 자체가 불가능하다.
  const [mounted, setMounted] = useState(false)
  const [promptReady, setPromptReady] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    setMounted(true)

    // 이미 앱으로 실행 중이면 설치 안내가 필요 없다.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) { setInstalled(true); return }

    setIsIOS(/iP(hone|ad|od)/.test(window.navigator.userAgent))

    // head 스크립트가 이미 붙잡아 둔 프롬프트가 있는지 먼저 확인 — 대부분 여기서 잡힌다.
    if (window.__onballInstallPrompt) setPromptReady(true)

    const onReady = () => setPromptReady(true)
    const onInstalled = () => { setInstalled(true); setPromptReady(false) }
    window.addEventListener('onball:installable', onReady)
    window.addEventListener('onball:installed', onInstalled)
    return () => {
      window.removeEventListener('onball:installable', onReady)
      window.removeEventListener('onball:installed', onInstalled)
    }
  }, [])

  if (!mounted || installed) return null

  const handleClick = async () => {
    const evt = window.__onballInstallPrompt
    if (!evt) { setShowGuide(true); return }
    await evt.prompt()
    const { outcome } = await evt.userChoice
    // 한 번 쓴 프롬프트는 재사용할 수 없다.
    window.__onballInstallPrompt = null
    setPromptReady(false)
    if (outcome === 'accepted') setInstalled(true)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-md border text-sm font-bold cursor-pointer transition-colors"
        style={
          promptReady
            ? { borderColor: 'var(--mm-yellow)', background: 'var(--mm-yellow)', color: 'var(--mm-black)' }
            : { borderColor: 'var(--mm-rule)', color: 'var(--mm-ink-soft)' }
        }
      >
        <Download size={16} />
        {promptReady ? '앱으로 설치' : '앱으로 설치하는 법'}
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg border p-5"
            style={{ background: 'var(--mm-panel)', borderColor: 'var(--mm-rule)' }}
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-label="앱 설치 방법"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <h3 className="font-bold text-base" style={{ color: 'var(--mm-ink)' }}>홈 화면에 앱으로 추가</h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="닫기"
                className="shrink-0 inline-flex items-center justify-center w-11 h-11 -m-2 rounded-md cursor-pointer"
                style={{ color: 'var(--mm-muted)' }}
              >
                <X size={18} />
              </button>
            </div>
            <ol className="space-y-2 text-sm leading-relaxed" style={{ color: 'var(--mm-ink-soft)' }}>
              {isIOS ? (
                <>
                  <li>1. 사파리 아래쪽 <b>공유</b> 버튼을 누르세요.</li>
                  <li>2. 목록에서 <b>홈 화면에 추가</b> 를 고르세요.</li>
                  <li>3. 오른쪽 위 <b>추가</b> 를 누르면 끝입니다.</li>
                </>
              ) : (
                <>
                  <li>1. 크롬 오른쪽 위 <b>점 3개</b> 를 누르세요.</li>
                  <li>2. <b>앱 설치</b> 또는 <b>홈 화면에 추가</b> 를 고르세요.</li>
                  <li>3. <b>설치</b> 를 누르면 끝입니다.</li>
                </>
              )}
            </ol>
            <p className="mt-3 text-[12px]" style={{ color: 'var(--mm-muted)' }}>
              설치하면 홈 화면 아이콘으로 바로 열리고, 주소창 없이 앱처럼 보입니다.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
