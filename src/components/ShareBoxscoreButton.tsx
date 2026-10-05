'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Share2, Check } from 'lucide-react'

// 박스스코어 공유 버튼 (2026-10-05) — 휴대폰은 공유 시트(카톡 등)를 바로 띄우고,
// 공유 시트가 없는 PC 는 링크를 복사한다. 미리보기 카드는 boxscore/page.tsx 의 generateMetadata.
export default function ShareBoxscoreButton({ query, label, title }: { query: Record<string, string>; label: string; title?: string }) {
  const [copied, setCopied] = useState(false)

  async function share() {
    const url = `${window.location.origin}${window.location.pathname}?${new URLSearchParams(query)}`
    const coarse = window.matchMedia?.('(pointer: coarse)').matches
    if (coarse && typeof navigator.share === 'function') {
      try { await navigator.share({ url, title }); return } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return // 사용자가 닫음
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success('링크를 복사했습니다 — 카톡방에 붙여 넣으세요')
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('아래 링크를 복사하세요', url)
    }
  }

  return (
    <button
      onClick={e => { e.stopPropagation(); share() }}
      className="inline-flex items-center gap-1.5 min-h-9 px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--mm-yellow)] text-[var(--mm-black)] hover:brightness-95 cursor-pointer"
    >
      {copied ? <Check size={14} aria-hidden /> : <Share2 size={14} aria-hidden />}
      {copied ? '복사됨' : label}
    </button>
  )
}
