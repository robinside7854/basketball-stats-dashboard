'use client'
// MilestoneClipModal — 마일스톤 달성 순간 클립을 모달에서 재생
// - 단일 클립만 재생 (playlist 없음)
// - HighlightsPlayer 재사용 (자동 연속재생 → 다음 클립 없으니 사실상 무영향)
// - ESC · 배경 클릭 · X 로 닫기
// - dynamic import 로 초기 번들 분리 (YT iframe API + HighlightsPlayer 지연 로드)
import { useEffect } from 'react'
import { X } from 'lucide-react'
import HighlightsPlayer from '@/components/highlights/HighlightsPlayer'
import { SHOT_TYPE_LABEL } from '@/lib/highlights/clip'
import type { HighlightClip } from '@/lib/highlights/types'

export interface MilestoneClipData {
  player_id: string
  player_name: string
  player_number: number | null
  category: string      // PTS/REB/3PM 등
  target: number
  achieved_at: string
  event_id: string
  game_id: string
  video_url: string
  video_id: string
  video_timestamp: number
  clip_start: number
  clip_end: number
  shot_type: string
}

interface Props {
  clip: MilestoneClipData
  onClose: () => void
}

function formatKoreanDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${days[d.getDay()]})`
}

export default function MilestoneClipModal({ clip, onClose }: Props) {
  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    // 배경 스크롤 잠금
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  // HighlightsPlayer 가 요구하는 최소 shape (플레이리스트 미사용 필드는 빈 값)
  const highlightClip: HighlightClip = {
    event_id: clip.event_id,
    video_url: clip.video_url,
    video_id: clip.video_id,
    video_timestamp: clip.video_timestamp,
    clip_start: clip.clip_start,
    clip_end: clip.clip_end,
    player_id: clip.player_id,
    player_name: clip.player_name,
    player_number: clip.player_number,
    player_photo: null,
    team_id: null,
    team_name: '',
    team_color: '',
    shot_type: clip.shot_type,
    points: 0,
    game_id: clip.game_id,
    home_team_name: '',
    away_team_name: '',
    assist_player_id: null,
    assist_player_name: null,
    assist_player_number: null,
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6"
      style={{ background: 'rgba(0,0,0,0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="milestone-clip-modal-title"
      onClick={onClose}
    >
      <div
        className="mm-brand w-full max-w-3xl max-h-[92vh] overflow-y-auto"
        style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div
          className="flex items-start justify-between gap-3 px-4 md:px-5 py-3 md:py-4"
          style={{ borderBottom: '1px solid var(--mm-rule)' }}
        >
          <div className="min-w-0 flex items-center gap-2 flex-wrap">
            <span
              className="font-black uppercase tabular-nums shrink-0"
              style={{
                background: 'var(--mm-ink)',
                color: 'var(--mm-panel)',
                fontSize: '10px',
                letterSpacing: '0.10em',
                padding: '3px 6px',
              }}
            >
              {clip.category}
            </span>
            <h3
              id="milestone-clip-modal-title"
              className="font-jersey font-black uppercase truncate"
              style={{
                color: 'var(--mm-ink)',
                fontSize: 'clamp(16px, 4.5vw, 22px)',
                letterSpacing: '-0.005em',
              }}
            >
              {clip.player_name}
              {clip.player_number != null && (
                <span className="ml-1.5 text-sm" style={{ color: 'var(--mm-muted)' }}>
                  #{clip.player_number}
                </span>
              )}
              <span className="ml-2 font-jersey" style={{ color: 'var(--mm-yellow-strong)' }}>
                {clip.target}
              </span>
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] cursor-pointer transition-colors shrink-0"
            style={{
              background: 'var(--mm-panel-alt)',
              border: '1px solid var(--mm-rule)',
              color: 'var(--mm-ink-soft)',
              borderRadius: '4px',
            }}
            aria-label="닫기"
          >
            <X size={18} />
          </button>
        </div>

        {/* 본문: 플레이어 */}
        <div className="p-3 md:p-5">
          <HighlightsPlayer
            clips={[highlightClip]}
            currentIdx={0}
            onIndexChange={() => { /* 단일 클립 · 무시 */ }}
            autoAdvance={false}
            onToggleAutoAdvance={() => { /* 단일 클립 · 무시 */ }}
          />
          <p
            className="mt-3 text-[11px] font-bold uppercase"
            style={{ color: 'var(--mm-muted)', letterSpacing: '0.14em' }}
          >
            {formatKoreanDate(clip.achieved_at)}
            {' · '}
            {SHOT_TYPE_LABEL[clip.shot_type] ?? clip.shot_type}
          </p>
        </div>
      </div>
    </div>
  )
}
