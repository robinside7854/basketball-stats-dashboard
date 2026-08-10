'use client'
// 위닝샷 배지 클릭 시 열리는 릴 팝업.
// 배지 API 에서 winning_shot 배지만 뽑아 meta.event_id 로 클립 hydrate → HighlightsClipModal 재사용.

import { useEffect, useState } from 'react'
import { Zap } from 'lucide-react'
import HighlightsClipModal from '@/components/highlights/HighlightsClipModal'
import { BasketballLoader } from './BasketballIcons'
import type { HighlightClip } from '@/lib/highlights/types'

interface Props {
  leagueId: string
  playerId: string
  onClose: () => void
}

type BadgeRow = {
  badge_type: string
  meta: Record<string, unknown> | null
  earned_at_date: string
}

export default function WinningShotReelModal({ leagueId, playerId, onClose }: Props) {
  const [clips, setClips] = useState<HighlightClip[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const badgesRes = await fetch(`/api/leagues/${leagueId}/players/${playerId}/badges`)
        if (!badgesRes.ok) throw new Error('failed to load badges')
        const badgesData = await badgesRes.json() as { badges?: BadgeRow[] }
        const wsBadges = (badgesData.badges ?? []).filter(b => b.badge_type === 'winning_shot')
        // 최신순 → 오래된 순 (릴 자연스러운 진행). 이미 desc 정렬이니 역순
        wsBadges.sort((a, b) => b.earned_at_date.localeCompare(a.earned_at_date))
        const eventIds = wsBadges
          .map(b => (b.meta && typeof b.meta === 'object' ? (b.meta as Record<string, unknown>).event_id : null))
          .filter((x): x is string => typeof x === 'string' && x.length > 0)

        if (eventIds.length === 0) {
          if (!cancelled) setClips([])
          return
        }

        const clipsRes = await fetch(`/api/leagues/${leagueId}/highlights/clips-by-events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ eventIds, forceClutch: true }),
        })
        if (!clipsRes.ok) throw new Error('failed to load clips')
        const clipsData = await clipsRes.json() as { clips?: HighlightClip[] }
        if (!cancelled) setClips(clipsData.clips ?? [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'failed')
      }
    }
    run()
    return () => { cancelled = true }
  }, [leagueId, playerId])

  // 로딩 · 에러 · 빈 상태는 미니 모달로 처리 (플레이어 팝업은 클립 있을 때만)
  if (clips === null || error || clips.length === 0) {
    return (
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4"
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
        role="dialog"
        aria-modal="true"
        aria-label="위닝샷 릴"
      >
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
        <div className="relative z-10 w-full max-w-sm bg-[color:var(--mm-panel)] border border-[color:var(--mm-yellow)] rounded-sm p-6 text-center mm-modal-in">
          <Zap size={20} className="mx-auto mb-2 text-[color:var(--mm-yellow-strong)]" aria-hidden />
          <p className="text-sm font-bold text-[color:var(--mm-ink)] mb-3">위닝샷 릴</p>
          {error ? (
            <p className="text-xs text-[color:var(--mm-muted)] mb-4">불러오지 못했습니다: {error}</p>
          ) : clips === null ? (
            <div className="py-2 flex justify-center"><BasketballLoader size={22} /></div>
          ) : (
            <p className="text-xs text-[color:var(--mm-muted)] mb-4">
              위닝샷 이벤트에 영상/타임스탬프가 아직 연결되지 않았습니다.
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 py-2 text-xs font-black uppercase tracking-widest bg-[color:var(--mm-panel-alt)] border border-[color:var(--mm-rule)] rounded cursor-pointer"
          >
            닫기
          </button>
        </div>
      </div>
    )
  }

  return (
    <HighlightsClipModal
      clips={clips}
      title="위닝샷 릴"
      icon={<Zap size={16} className="text-[color:var(--mm-yellow-strong)]" aria-hidden />}
      onClose={onClose}
      ariaLabel="위닝샷 하이라이트 재생"
    />
  )
}
