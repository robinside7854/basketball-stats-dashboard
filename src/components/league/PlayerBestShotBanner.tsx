'use client'
// 선수 프로필카드에 노출되는 "내 베스트샷" 배너.
// - 핀 개수 표시 + "재생" 버튼 → clips-by-events API 로 hydrate 후 HighlightsClipModal
// - 배너 자체는 항상 pinned_event_ids.length > 0 일 때만 렌더 (상위에서 가드)

import { useState } from 'react'
import { Star, Play } from 'lucide-react'
import { toast } from 'sonner'
import HighlightsClipModal from '@/components/highlights/HighlightsClipModal'
import { BasketballLoader } from './BasketballIcons'
import type { HighlightClip } from '@/lib/highlights/types'

interface Props {
  leagueId: string
  playerName: string
  pinnedEventIds: string[]
}

export default function PlayerBestShotBanner({ leagueId, playerName, pinnedEventIds }: Props) {
  const [clips, setClips] = useState<HighlightClip[] | null>(null)
  const [loading, setLoading] = useState(false)

  const open = async () => {
    if (loading || clips) {
      if (clips) setClips([...clips])   // 이미 로드됨 → 그대로 재열기 (지연 없이)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/highlights/clips-by-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventIds: pinnedEventIds }),
      })
      if (!res.ok) throw new Error('failed')
      const data = await res.json() as { clips?: HighlightClip[] }
      const list = data.clips ?? []
      if (list.length === 0) {
        toast.error('핀된 클립을 불러오지 못했습니다 (이벤트 삭제됨?)')
      } else {
        setClips(list)
      }
    } catch {
      toast.error('베스트샷 재생 실패')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div
        className="px-5 py-4 border-b border-[color:var(--mm-rule)] flex items-center justify-between gap-3 flex-wrap"
        style={{ background: 'var(--mm-panel-alt)' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Star
            size={16}
            className="text-[color:var(--mm-yellow-strong)] fill-[color:var(--mm-yellow-strong)] shrink-0"
            aria-hidden
          />
          <span className="text-xs font-black uppercase tracking-[0.14em]" style={{ color: 'var(--mm-ink)' }}>
            {playerName} 베스트샷
          </span>
          <span className="text-[11px]" style={{ color: 'var(--mm-muted)' }}>
            {pinnedEventIds.length}개 핀
          </span>
        </div>
        <button
          type="button"
          onClick={open}
          disabled={loading}
          className="min-h-[36px] px-3 py-1.5 text-xs font-black uppercase tracking-[0.10em] cursor-pointer transition-colors inline-flex items-center gap-1.5 disabled:opacity-60"
          style={{
            background: 'var(--mm-yellow)',
            color: 'var(--mm-black)',
            border: '1px solid var(--mm-yellow-strong)',
            borderRadius: '4px',
          }}
          aria-label={`${playerName} 베스트샷 릴 재생`}
        >
          {loading ? <BasketballLoader size={14} /> : <Play size={12} aria-hidden />}
          재생
        </button>
      </div>

      {clips && clips.length > 0 && (
        <HighlightsClipModal
          clips={clips}
          title={`${playerName} 베스트샷`}
          icon={<Star size={16} className="text-[color:var(--mm-yellow-strong)] fill-[color:var(--mm-yellow-strong)]" aria-hidden />}
          onClose={() => setClips(null)}
          ariaLabel={`${playerName} 베스트샷 재생`}
        />
      )}
    </>
  )
}
