'use client'
// PlayerHighlightsPlaylist — 날짜별 sticky 헤더 플레이리스트
// - 같은 game_date 클립을 한 그룹으로 묶어 헤더 표시 (예: "2026-07-11 (토) · 3 클립")
// - 각 클립: 시각 · 상대팀 · 슛 유형 · 링크 복사
// - 현재 재생 중 강조 (mm-yellow)
import { useEffect, useMemo, useRef } from 'react'
import { Share2, Play } from 'lucide-react'
import { toast } from 'sonner'
import { formatTimestamp } from '@/lib/youtube/utils'
import { SHOT_TYPE_LABEL } from '@/lib/highlights/clip'
import type { HighlightClip } from '@/lib/highlights/types'

interface Props {
  clips: HighlightClip[]
  currentIdx: number
  onSelect: (idx: number) => void
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

function formatDateHeader(date: string): string {
  const d = new Date(date + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return date
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${DAYS[d.getDay()]})`
}

export default function PlayerHighlightsPlaylist({ clips, currentIdx, onSelect }: Props) {
  const listRef = useRef<HTMLDivElement>(null)

  // 현재 재생 항목 뷰포트 스크롤
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-clip-idx="${currentIdx}"]`)
    if (!el) return
    const prefersReduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ block: 'nearest', behavior: prefersReduced ? 'auto' : 'smooth' })
  }, [currentIdx])

  // 날짜별 그룹핑 (연속된 같은 date 를 한 섹션으로) — clips 는 이미 date desc 정렬됨
  const groups = useMemo(() => {
    const g: Array<{ date: string; startIdx: number; items: Array<{ clip: HighlightClip; idx: number }> }> = []
    for (let i = 0; i < clips.length; i++) {
      const c = clips[i]
      const key = c.game_date ?? '?'
      const last = g[g.length - 1]
      if (!last || last.date !== key) g.push({ date: key, startIdx: i, items: [{ clip: c, idx: i }] })
      else last.items.push({ clip: c, idx: i })
    }
    return g
  }, [clips])

  async function share(clip: HighlightClip) {
    const url = `https://youtu.be/${clip.video_id}?t=${Math.floor(clip.clip_start)}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('링크 복사됨')
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
      className="lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1"
      role="listbox"
      aria-label="선수 하이라이트 플레이리스트"
    >
      {groups.map((group) => (
        <div key={`${group.date}-${group.startIdx}`} className="mb-3 last:mb-0">
          <div
            className="sticky top-0 z-10 px-2 py-1.5 flex items-center justify-between gap-2 backdrop-blur-sm"
            style={{
              background: 'color-mix(in srgb, var(--mm-panel-alt) 92%, transparent)',
              borderBottom: '1px solid var(--mm-rule)',
            }}
          >
            <span
              className="font-jersey font-black uppercase text-xs tracking-[0.14em]"
              style={{ color: 'var(--mm-ink)' }}
            >
              {formatDateHeader(group.date)}
            </span>
            <span className="text-[10px] font-bold" style={{ color: 'var(--mm-muted)' }}>
              {group.items.length} 클립
            </span>
          </div>

          <div className="space-y-1.5 pt-1.5">
            {group.items.map(({ clip: c, idx }) => {
              const active = idx === currentIdx
              const thumb = `https://i.ytimg.com/vi/${c.video_id}/mqdefault.jpg`
              const opponent = c.opponent_name
                ?? (c.home_team_name && c.away_team_name
                  ? `${c.home_team_name} vs ${c.away_team_name}`
                  : '')
              return (
                <div
                  key={c.event_id}
                  data-clip-idx={idx}
                  role="option"
                  aria-selected={active}
                  className="flex items-stretch gap-2 p-1.5 cursor-pointer transition-colors"
                  style={{
                    background: active ? 'var(--mm-yellow-soft)' : 'var(--mm-panel)',
                    border: `1px solid ${active ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
                    borderRadius: '4px',
                  }}
                  onClick={() => onSelect(idx)}
                >
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
                    {active && (
                      <span
                        aria-hidden
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ background: 'rgba(0,0,0,0.35)', borderRadius: '4px' }}
                      >
                        <Play size={20} style={{ color: 'var(--mm-yellow)' }} fill="currentColor" />
                      </span>
                    )}
                    <span
                      aria-hidden
                      className="absolute bottom-1 left-1 inline-block w-1.5 h-1.5 rounded-full"
                      style={{ background: c.team_color, boxShadow: '0 0 0 1px rgba(0,0,0,0.4)' }}
                    />
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
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
                      <span className="text-[11px] font-mono" style={{ color: 'var(--mm-muted)' }}>
                        {formatTimestamp(c.video_timestamp)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="text-[11px] truncate" style={{ color: 'var(--mm-muted)' }}>
                        {opponent ? <>vs <span style={{ color: 'var(--mm-ink-soft)' }}>{opponent}</span></> : ''}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); share(c) }}
                        className="inline-flex items-center justify-center min-h-[36px] min-w-[36px] cursor-pointer transition-colors"
                        style={{ background: 'transparent', color: 'var(--mm-muted)', border: 'none' }}
                        aria-label="이 클립 링크 복사"
                        title="링크 복사"
                      >
                        <Share2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
