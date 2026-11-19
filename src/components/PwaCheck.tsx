'use client'
// 앱 설치 점검 칸 — 주소 끝에 `?pwa-check` 를 붙이면 화면 위에 뜬다(2026-11-19).
//
// 왜: 안드로이드 크롬이 「이 앱을 설치할 수 없습니다」를 띄웠는데, 서버·시험 브라우저에서는
//   설치 조건이 전부 정상이었다. 크롬은 이유를 화면에 알려 주지 않으므로, 그 폰 안에서
//   매니페스트·아이콘·서비스워커·설치 이벤트를 직접 재어 캡처 한 장으로 받는다.
//   주소에 표시가 없으면 아무것도 그리지 않는다(회원 화면에는 영향 없음).
import { useEffect, useState } from 'react'

type Row = { label: string; value: string; ok: boolean | null }

async function checkImage(src: string): Promise<string> {
  try {
    const res = await fetch(src, { cache: 'no-store' })
    const type = res.headers.get('content-type') ?? '?'
    if (!res.ok) return `실패 ${res.status} (${type})`
    const blob = await res.blob()
    const bmp = await createImageBitmap(blob).catch(() => null)
    return `${res.status} · ${type} · ${bmp ? `${bmp.width}x${bmp.height}` : '그림 읽기 실패'} · ${blob.size}B`
  } catch (e) {
    return `오류 ${(e as Error).message}`
  }
}

export default function PwaCheck() {
  const [rows, setRows] = useState<Row[] | null>(null)

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('pwa-check')) return
    let alive = true
    const run = async () => {
      const out: Row[] = []
      const push = (label: string, value: string, ok: boolean | null = null) => out.push({ label, value, ok })
      const ua = navigator.userAgent
      push('브라우저', (ua.match(/(Chrome|SamsungBrowser|Version)\/[\d.]+/g) ?? []).join(' ') || ua.slice(0, 80))
      push('보안 연결(https)', String(window.isSecureContext), window.isSecureContext)
      const standalone = window.matchMedia('(display-mode: standalone)').matches
      push('지금 앱으로 실행 중', String(standalone))

      // 설치 이벤트 — 크롬이 「설치할 수 있다」고 판단하면 이 이벤트를 보낸다. 가장 중요한 줄.
      push('크롬의 설치 가능 신호', window.__onballInstallPrompt ? '왔음 (설치 가능)' : '아직 없음', !!window.__onballInstallPrompt)

      // 서비스워커
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations()
        push('서비스워커 등록', regs.length ? regs.map(r => `${r.scope} [${r.active ? 'active' : r.installing ? 'installing' : r.waiting ? 'waiting' : '없음'}]`).join(', ') : '없음', regs.some(r => !!r.active))
        push('이 화면을 서비스워커가 관리', String(!!navigator.serviceWorker.controller), !!navigator.serviceWorker.controller)
      } else {
        push('서비스워커', '이 브라우저에 없음', false)
      }

      // 매니페스트
      const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
      push('매니페스트 링크', link?.getAttribute('href') ?? '없음', !!link)
      if (link) {
        try {
          const res = await fetch(link.href, { cache: 'no-store', credentials: 'omit' })
          const type = res.headers.get('content-type') ?? '?'
          const text = await res.text()
          push('매니페스트 응답', `${res.status} · ${type}`, res.ok)
          try {
            const m = JSON.parse(text) as { icons?: { src: string; sizes?: string; purpose?: string }[]; id?: string; start_url?: string; scope?: string; display?: string; name?: string }
            push('매니페스트 내용', `name=${m.name} · id=${m.id ?? '(없음)'} · start=${m.start_url} · scope=${m.scope ?? '(없음)'} · display=${m.display}`, true)
            for (const ic of m.icons ?? []) {
              const r = await checkImage(new URL(ic.src, link.href).href)
              push(`아이콘 ${ic.purpose ?? 'any'} ${ic.sizes ?? ''}`, `${ic.src} → ${r}`, !r.startsWith('실패') && !r.startsWith('오류') && !r.includes('읽기 실패'))
            }
          } catch {
            push('매니페스트 해석', `JSON 아님: ${text.slice(0, 60)}`, false)
          }
        } catch (e) {
          push('매니페스트 응답', `오류 ${(e as Error).message}`, false)
        }
      }

      // 이미 설치된 관련 앱(크롬이 지원할 때만)
      const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<{ platform: string; id?: string; url?: string }[]> }
      if (nav.getInstalledRelatedApps) {
        const apps = await nav.getInstalledRelatedApps().catch(() => [])
        push('이미 설치된 관련 앱', apps.length ? apps.map(a => `${a.platform} ${a.id ?? a.url ?? ''}`).join(', ') : '없음')
      }
      push('점검 시각', new Date().toLocaleString('ko-KR'))
      if (alive) setRows(out)
    }
    // 크롬이 설치 판단을 끝낼 시간을 준다(페이지 로드 후 수 초).
    const t = window.setTimeout(run, 6000)
    const again = () => { void run() }
    window.addEventListener('onball:installable', again)
    return () => { alive = false; window.clearTimeout(t); window.removeEventListener('onball:installable', again) }
  }, [])

  if (!rows) return null
  return (
    <div
      data-no-press
      style={{ position: 'fixed', inset: '8px 8px auto 8px', zIndex: 99999, maxHeight: '85vh', overflow: 'auto', background: '#fff', color: '#111', border: '2px solid #111', borderRadius: 10, padding: 10, fontSize: 12, lineHeight: 1.45, wordBreak: 'break-all' }}
    >
      <b style={{ fontSize: 14 }}>앱 설치 점검 — 이 화면을 캡처해 보내 주세요</b>
      {rows.map((r, i) => (
        <div key={i} style={{ marginTop: 4 }}>
          <span>{r.ok === true ? '🟢 ' : r.ok === false ? '🔴 ' : '⚪ '}</span>
          <b>{r.label}</b>: {r.value}
        </div>
      ))}
    </div>
  )
}
