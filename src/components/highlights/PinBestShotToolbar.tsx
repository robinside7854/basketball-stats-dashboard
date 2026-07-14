'use client'
// 선수 하이라이트 페이지 재생기 하단 · 현재 클립을 "내 베스트샷"에 핀/해제
// 최대 3개 · 편집은 오픈 (로그인 없음, 자기 프로필 꾸미기 전제)
// 낙관적 업데이트 + 실패 시 롤백 · toast 알림

import { useState } from 'react'
import { toast } from 'sonner'
import { NumberedBasketball } from '@/components/league/BasketballIcons'
import type { HighlightClip } from '@/lib/highlights/types'

const MAX_PINS = 3

interface Props {
  leagueId: string
  playerId: string
  playerName: string
  currentClip: HighlightClip
  pinnedEventIds: string[]
  onChange: (next: string[]) => void
}

export default function PinBestShotToolbar({
  leagueId, playerId, playerName, currentClip, pinnedEventIds, onChange,
}: Props) {
  const [busy, setBusy] = useState(false)
  const eventId = currentClip.event_id
  const isPinned = pinnedEventIds.includes(eventId)
  const atCap = !isPinned && pinnedEventIds.length >= MAX_PINS

  const toggle = async () => {
    if (busy) return
    setBusy(true)
    const action = isPinned ? 'remove' : 'add'
    const prev = pinnedEventIds
    const optimistic = isPinned
      ? prev.filter(id => id !== eventId)
      : [...prev, eventId]
    onChange(optimistic)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/players/${playerId}/pins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, eventId }),
      })
      const data = await res.json() as { pinned_event_ids?: string[]; error?: string }
      if (!res.ok || !Array.isArray(data.pinned_event_ids)) {
        throw new Error(data.error ?? 'failed')
      }
      onChange(data.pinned_event_ids)
      toast.success(isPinned ? '베스트샷에서 해제됨' : '내 베스트샷에 핀됨')
    } catch (e) {
      onChange(prev)   // 롤백
      toast.error(e instanceof Error ? e.message : '핀 저장 실패')
    } finally {
      setBusy(false)
    }
  }

  // 현재 클립이 핀된 위치 (1-indexed) · 안 됐으면 null
  const currentSlot = isPinned ? (pinnedEventIds.indexOf(eventId) + 1) as 1 | 2 | 3 : null

  return (
    <div
      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-sm"
      style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}
    >
      <div className="flex items-center gap-2 min-w-0">
        {/* 슬롯 3개 · 채워진 자리는 노란 농구공, 빈 자리는 회색 */}
        <span className="inline-flex items-center gap-1" aria-hidden>
          {([1, 2, 3] as const).map(n => (
            <NumberedBasketball
              key={n}
              size={18}
              number={n}
              filled={n <= pinnedEventIds.length}
              className={n <= pinnedEventIds.length ? '' : 'text-[color:var(--mm-muted)]'}
            />
          ))}
        </span>
        <span className="text-xs font-black uppercase tracking-[0.14em] shrink-0" style={{ color: 'var(--mm-ink)' }}>
          {playerName} 베스트샷
        </span>
        <span className="text-[11px] shrink-0" style={{ color: 'var(--mm-muted)' }}>
          {pinnedEventIds.length}/{MAX_PINS}
          {currentSlot && ` · 현재 클립: ${currentSlot}번`}
        </span>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={busy || (atCap && !isPinned)}
        className="min-h-[36px] px-3 py-1.5 text-xs font-black uppercase tracking-[0.10em] cursor-pointer transition-colors inline-flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: isPinned ? 'var(--mm-yellow)' : 'var(--mm-panel-alt)',
          color: isPinned ? 'var(--mm-black)' : 'var(--mm-ink)',
          border: `1px solid ${isPinned ? 'var(--mm-yellow-strong)' : 'var(--mm-rule)'}`,
          borderRadius: '4px',
        }}
        aria-pressed={isPinned}
        aria-label={
          isPinned
            ? `이 클립(${currentSlot}번)을 내 베스트샷에서 해제`
            : atCap
              ? `핀 최대 ${MAX_PINS}개 · 다른 핀을 먼저 해제하세요`
              : '이 클립을 내 베스트샷에 핀'
        }
        title={
          atCap && !isPinned
            ? `최대 ${MAX_PINS}개 · 기존 핀을 먼저 해제`
            : (isPinned ? `${currentSlot}번 핀 해제` : '이 클립을 내 프로필카드에 핀')
        }
      >
        {isPinned && currentSlot ? (
          <NumberedBasketball size={12} number={currentSlot} filled={false} className="text-[color:var(--mm-black)]" />
        ) : (
          <NumberedBasketball size={12} number={Math.min(pinnedEventIds.length + 1, 3) as 1 | 2 | 3} filled={false} />
        )}
        {isPinned ? '핀 해제' : atCap ? '핀 가득' : '이 클립 핀'}
      </button>
    </div>
  )
}
