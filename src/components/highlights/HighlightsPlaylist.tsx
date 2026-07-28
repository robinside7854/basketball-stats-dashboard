'use client'
// HighlightsPlaylist — 좌측(모바일 하단) 플레이리스트 UI
// 각 카드: 썸네일 · 선수 · 슛 유형 · 시각 · 공유 버튼 · 현재재생 강조
import { useEffect, useRef } from 'react'
import { Share2, Play, Link2, HeartCrack } from 'lucide-react'
import { toast } from 'sonner'
import { formatTimestamp } from '@/lib/youtube/utils'
import { SHOT_TYPE_LABEL } from '@/lib/highlights/clip'
import type { HighlightClip } from '@/lib/highlights/types'
import { shortenUrl } from '@/lib/shortUrl'

interface Props {
  clips: HighlightClip[]
  currentIdx: number
  onSelect: (idx: number) => void
}

export default function HighlightsPlaylist({ clips, currentIdx, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  // 현재 재생 항목을 뷰포트로 스크롤 (부드러움) — reduce-motion 시 즉시
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-clip-idx="${currentIdx}"]`)
    if (!el) return
    const prefersReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'nearest', behavior: prefersReduced ? 'auto' : 'smooth' })
  }, [currentIdx])

  async function share(clip: HighlightClip) {
    const url = `https://youtu.be/${clip.video_id}?t=${Math.floor(clip.clip_start)}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('YouTube 링크 복사됨')
    } catch {
      toast.error('링크 복사 실패')
    }
  }

  // 짧은 링크 — 이 클립부터 재생되도록 페이지 URL 에 clip=idx 를 세팅해 shortener 로 축약
  async function shareShort(idx: number) {
    if (typeof window === 'undefined') return
    const u = new URL(window.location.href)
    u.searchParams.set('clip', String(idx))
    const short = await shortenUrl(u.toString(), { source: 'highlights_round_clip', clip_idx: idx })
    try {
      await navigator.clipboard.writeText(short)
      const label = short.includes('/h/') ? `짧은 링크 복사됨: ${short.split('/h/')[1] ? '/h/' + short.split('/h/')[1] : short}` : '링크 복사됨'
      toast.success(label)
    } catch {
      toast.error('링크 복사 실패')
    }
  }

  if (clips.length === 0) {
    return (
      <div
        className="p-6 text-center text-sm rounded"
        style={{ background: 'var(--mm-panel)', border: '1px dashed var(--mm-rule)', color: 'var(--mm-muted)' }}
      >
        조건에 맞는 하이라이트가 없습니다
      </div>
    )
  }

  return (
    <div
      ref={listRef}
      className="space-y-1.5 max-h-[55vh] overflow-y-auto pr-1 lg:max-h-[70vh]"
      role="listbox"
      aria-label="하이라이트 플레이리스트"
    >
      {clips.map((c, idx) => {
        const active = idx === currentIdx
        const thumb = `https://i.ytimg.com/vi/${c.video_id}/mqdefault.jpg`
        return (
          <div
            key={c.event_id}
            data-clip-idx={idx}
            role="option"
            aria-selected={active}
            aria-label={c.is_clutch ? '클러치 슛' : undefined}
            className="group flex items-stretch gap-2 p-1.5 cursor-pointer transition-colors relative overflow-hidden"
            style={{
              background: active ? 'var(--mm-yellow-soft)' : 'var(--mm-panel)',
              border: `1px solid ${active ? 'var(--mm-yellow)' : (c.is_clutch ? '#ef4444' : 'var(--mm-rule)')}`,
              borderLeftWidth: c.is_clutch ? '3px' : '1px',
              borderLeftColor: c.is_clutch ? '#ef4444' : (active ? 'var(--mm-yellow)' : 'var(--mm-rule)'),
              borderRadius: '4px',
            }}
            onClick={() => onSelect(idx)}
          >
            {/* 썸네일 (16:9, 96px 폭) */}
            <div className="relative shrink-0" style={{ width: '96px' }}>
              <div className="w-full aspect-video overflow-hidden rounded" style={{ background: '#000' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumb}
                  alt=""
                  loading="lazy"
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                />
              </div>
              {active ? (
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center"
                  style={{ background: 'rgba(0,0,0,0.35)', borderRadius: '4px' }}
                >
                  <Play size={20} style={{ color: 'var(--mm-yellow)' }} fill="currentColor" />
                </span>
              ) : (
                // 비활성 클립: 호버 시 주황 재생 아이콘 노출 (재생 가능 신호)
                <span
                  aria-hidden
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  style={{ background: 'rgba(0,0,0,0.35)', borderRadius: '4px' }}
                >
                  <Play size={18} style={{ color: 'var(--color-hoop-orange-500)' }} fill="currentColor" />
                </span>
              )}
              {/* 팀 색상 표식 */}
              <span
                aria-hidden
                className="absolute bottom-1 left-1 inline-block w-1.5 h-1.5 rounded-full"
                style={{ background: c.team_color, boxShadow: '0 0 0 1px rgba(0,0,0,0.4)' }}
              />
            </div>

            {/* 정보 */}
            <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold" style={{ color: 'var(--mm-ink)' }}>
                  {c.player_number ? `#${c.player_number} ` : ''}{c.player_name}
                </span>
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.10em] px-1.5 py-0.5"
                  style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: '3px' }}
                >
                  {SHOT_TYPE_LABEL[c.shot_type] ?? c.shot_type}
                </span>
                {c.points >= 3 && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5"
                    style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '3px' }}
                  >
                    +{c.points}
                  </span>
                )}
                {c.is_clutch && (
                  <span
                    className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-[0.10em] px-1.5 py-0.5"
                    style={{ background: '#ef4444', color: '#fff', borderRadius: '3px' }}
                    aria-label="클러치 슛"
                    title="경기 마지막 2분 · 3점차 이내 접전 상황의 슛"
                  >
                    <HeartCrack size={10} aria-hidden />
                    클러치
                  </span>
                )}
              </div>
              {c.assist_player_name && (
                <div className="text-[11px] leading-tight" style={{ color: 'var(--mm-muted)' }}>
                  <span className="font-bold" aria-hidden>A.</span>{' '}
                  <span style={{ color: 'var(--mm-ink-soft)' }}>
                    {c.assist_player_number ? `#${c.assist_player_number} ` : ''}{c.assist_player_name}
                  </span>
                  <span className="sr-only"> 어시스트</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-[11px]" style={{ color: 'var(--mm-muted)' }}>
                  {formatTimestamp(c.video_timestamp)}
                  <span className="mx-1" aria-hidden>·</span>
                  <span className="opacity-75">{c.home_team_name} vs {c.away_team_name}</span>
                </span>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); shareShort(idx) }}
                    className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] cursor-pointer transition-colors"
                    style={{ background: 'transparent', color: 'var(--mm-muted)', border: 'none' }}
                    aria-label="짧은 링크 복사 (이 클립부터 재생)"
                    title="짧은 링크 복사"
                  >
                    <Link2 size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); share(c) }}
                    className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] cursor-pointer transition-colors"
                    style={{ background: 'transparent', color: 'var(--mm-muted)', border: 'none' }}
                    aria-label="YouTube 링크 복사"
                    title="YouTube 링크 복사"
                  >
                    <Share2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
