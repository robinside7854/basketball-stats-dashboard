'use client'
// 「숏폼에 담기」 (2026-11-24 운영진) — 하이라이트에서 지금 클립을 숏폼 후보로 켜고 끈다. 운영진에게만 보인다.
// 기록 화면의 ★ 버튼(되돌릴 수 없었다)을 대신한다 — 다시 누르면 빠진다.
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Star } from 'lucide-react'
import { toast } from 'sonner'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { youtubeWatchUrl } from './YouTubeOpenLink'
import type { HighlightClip } from '@/lib/highlights/types'

export default function ShortformMarkButton({ clip }: { clip: HighlightClip | null | undefined }) {
  const { leagueId } = useParams<{ leagueId: string }>()
  const { isEditMode } = useLeagueEditMode()
  // 담긴 장면 → 경기 날짜. 개수는 지금 클립 날짜 것만 센다(날짜가 바뀌면 처음부터, 2026-11-28 운영진)
  const [saved, setSaved] = useState<Map<string, string | null> | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!isEditMode || !leagueId) return
    let alive = true
    fetch(`/api/leagues/${leagueId}/shortform-marks`).then(r => r.ok ? r.json() : null).then(d => {
      if (alive && d) setSaved(new Map(((d.marks ?? []) as Array<{ event_id: string; date: string | null }>).map(m => [m.event_id, m.date])))
    }).catch(() => {})
    return () => { alive = false }
  }, [isEditMode, leagueId])

  if (!isEditMode || !clip || !saved) return null
  const on = saved.has(clip.event_id)
  const day = clip.game_date ?? null
  const dayCount = [...saved.values()].filter(d => d === day).length

  async function toggle() {
    if (!clip || busy) return
    setBusy(true)
    const id = clip.event_id
    const r = on
      ? await fetch(`/api/leagues/${leagueId}/shortform-marks?eventId=${id}`, { method: 'DELETE' }).catch(() => null)
      : await fetch(`/api/leagues/${leagueId}/shortform-marks`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event_id: id, youtube_url: clip.video_id ? youtubeWatchUrl(clip) : null }),
        }).catch(() => null)
    setBusy(false)
    if (!r?.ok) { toast.error('숏폼 저장 실패'); return }
    setSaved(prev => { const n = new Map(prev); if (on) n.delete(id); else n.set(id, clip.game_date ?? null); return n })
  }

  return (
    <button type="button" onClick={toggle} disabled={busy} aria-pressed={on}
      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 text-sm font-bold whitespace-nowrap cursor-pointer disabled:opacity-60"
      style={{
        background: on ? 'var(--mm-yellow)' : 'var(--mm-panel)', color: on ? 'var(--mm-black)' : 'var(--mm-ink)',
        border: `1px solid ${on ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`, borderRadius: 'var(--mm-radius-chip)',
      }}>
      <Star size={16} aria-hidden fill={on ? 'currentColor' : 'none'} />
      {on ? `숏폼 담김 · ${dayCount}` : '숏폼에 담기'}
    </button>
  )
}
