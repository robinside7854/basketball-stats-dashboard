'use client'
// 선수 프로필카드 상단 (포지션 옆) · "내 베스트샷" 재생 chip
// - 핀된 클립 개수만큼 번호 매긴 농구공 아이콘 (1/2/3)
// - 클릭 → clips-by-events API hydrate → HighlightsClipModal
// - 상위에서 pinned_event_ids.length > 0 일 때만 렌더

import { useState } from 'react'
import { toast } from 'sonner'
import HighlightsClipModal from '@/components/highlights/HighlightsClipModal'
import { BasketballLoader, NumberedBasketball } from './BasketballIcons'
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
    if (loading) return
    if (clips) { setClips([...clips]); return }   // 이미 로드됨 → 재열기
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

  const shownCount = Math.min(pinnedEventIds.length, 3)

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={loading}
        className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 text-xs font-black uppercase tracking-[0.14em] rounded-sm cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] disabled:opacity-60"
        style={{
          background: 'var(--mm-yellow)',
          color: 'var(--mm-black)',
          border: '1px solid var(--mm-black)',
        }}
        aria-label={`${playerName} 베스트샷 ${pinnedEventIds.length}개 재생`}
        title="내 베스트샷 재생"
      >
        {loading ? (
          <BasketballLoader size={14} className="text-[color:var(--mm-black)]" />
        ) : (
          <span className="inline-flex items-center gap-0.5" aria-hidden>
            {Array.from({ length: shownCount }, (_, i) => (
              <NumberedBasketball
                key={i}
                size={14}
                number={(i + 1) as 1 | 2 | 3}
                filled={false}
                className="text-[color:var(--mm-black)]"
              />
            ))}
          </span>
        )}
        베스트샷
      </button>

      {clips && clips.length > 0 && (
        <HighlightsClipModal
          clips={clips}
          title={`${playerName} 베스트샷`}
          icon={<NumberedBasketball size={16} number={1} filled />}
          onClose={() => setClips(null)}
          ariaLabel={`${playerName} 베스트샷 재생`}
        />
      )}
    </>
  )
}
