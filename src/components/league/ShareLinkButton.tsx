'use client'
// 현재 페이지 URL 을 클립보드에 복사 → toast 알림
// 팀 카톡방/DM 공유용

import { useState } from 'react'
import { toast } from 'sonner'
import { Link2, Check } from 'lucide-react'

interface Props {
  label?: string
  /** 복사할 URL 을 명시적으로 지정 · 없으면 현재 window.location.href */
  url?: string
}

export default function ShareLinkButton({ label = '링크 복사', url }: Props) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    const href = url ?? (typeof window !== 'undefined' ? window.location.href : '')
    if (!href) {
      toast.error('복사할 링크가 없습니다')
      return
    }
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(href)
      } else {
        // fallback — 구형 브라우저 대응
        const ta = document.createElement('textarea')
        ta.value = href
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.focus()
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopied(true)
      toast.success('링크가 복사되었습니다')
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(`복사 실패: ${msg}`)
    }
  }

  return (
    <button
      onClick={copy}
      aria-label="현재 페이지 링크 복사"
      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-black uppercase tracking-widest cursor-pointer transition-colors duration-200 min-h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
      style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
    >
      {copied ? <Check size={14} aria-hidden /> : <Link2 size={14} aria-hidden />}
      <span>{copied ? '복사됨' : label}</span>
    </button>
  )
}
