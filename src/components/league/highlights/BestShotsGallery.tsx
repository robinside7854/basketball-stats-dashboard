'use client'
// 베스트샷 갤러리 (2026-07-19 재설계)
//   · 이전: HighlightsBrowser 로 곧바로 재생 UI
//   · 신규: 선수 카드 목록 → 카드 클릭 → 모달 재생 (그 선수의 핀 클립만 순차)
// 각 카드: 프로필 · 이름 · 등번호 · 핀 개수 · 미니 썸네일 3개 (있으면)

import { useMemo, useState } from 'react'
import { PlayCircle, Pin } from 'lucide-react'
import HighlightsClipModal from '@/components/highlights/HighlightsClipModal'
import { NumberedBasketball } from '@/components/league/BasketballIcons'
import type { HighlightClip, HighlightPlayerOption } from '@/lib/highlights/types'

type PlayerWithMeta = HighlightPlayerOption & { photo_url?: string | null }

interface Props {
  players: HighlightPlayerOption[]
  clips: HighlightClip[]
  photoMap?: Record<string, string | null>
}

function initialsOf(name: string): string {
  if (!name) return '?'
  return name.trim().charAt(0).toUpperCase()
}

export default function BestShotsGallery({ players, clips, photoMap = {} }: Props) {
  // 각 선수별 클립 슬라이스 (loader 가 등번호 순 pinner 로 나열 · count 로 절단)
  const clipsByPlayer = useMemo(() => {
    const map: Record<string, HighlightClip[]> = {}
    let cursor = 0
    for (const p of players) {
      map[p.id] = clips.slice(cursor, cursor + p.count)
      cursor += p.count
    }
    return map
  }, [players, clips])

  const [openPid, setOpenPid] = useState<string | null>(null)

  const openPlayerClips = openPid ? clipsByPlayer[openPid] ?? [] : []
  const openPlayer = openPid ? players.find(p => p.id === openPid) ?? null : null

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {players.map(p => {
          const playerClips = clipsByPlayer[p.id] ?? []
          const previews = playerClips.slice(0, 3)
          const photo = photoMap[p.id] ?? null
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setOpenPid(p.id)}
              className="group text-left flex flex-col cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-8px_rgba(0,0,0,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
              style={{
                background: 'var(--mm-panel)',
                border: '1px solid var(--mm-rule)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
              aria-label={`${p.name} 베스트샷 릴 ${playerClips.length}개 재생`}
            >
              {/* 상단 · 프리뷰 썸네일 3개 (있으면) */}
              <div className="relative aspect-video" style={{ background: '#000' }}>
                {previews.length > 0 ? (
                  <div className="grid grid-cols-3 h-full">
                    {previews.map((c, i) => {
                      const slot = ((i + 1) as 1 | 2 | 3)
                      return (
                        <div key={c.event_id} className="relative overflow-hidden" style={{ borderRight: i < previews.length - 1 ? '1px solid rgba(255,255,255,0.15)' : 'none' }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`https://i.ytimg.com/vi/${c.video_id}/mqdefault.jpg`}
                            alt=""
                            loading="lazy"
                            className="w-full h-full object-cover"
                            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                          />
                          <span
                            className="absolute top-1 left-1 inline-flex items-center gap-0.5"
                            aria-hidden
                          >
                            <NumberedBasketball size={14} number={slot} filled />
                          </span>
                        </div>
                      )
                    })}
                    {/* 3개 미만 · 빈 슬롯 */}
                    {previews.length < 3 && Array.from({ length: 3 - previews.length }).map((_, i) => {
                      const slot = ((previews.length + i + 1) as 1 | 2 | 3)
                      return (
                        <div key={`empty-${i}`} className="flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
                          <NumberedBasketball size={18} number={slot} />
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-[11px] uppercase font-bold" style={{ color: 'var(--mm-muted)', letterSpacing: '0.14em' }}>
                    영상 없음
                  </div>
                )}
                {/* 재생 오버레이 (호버 시) */}
                <span
                  className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                  style={{ background: 'rgba(0,0,0,0.55)' }}
                  aria-hidden
                >
                  {/* 아이콘 4단계(14/16/20/24) 예외 — 썸네일 전체를 덮는 재생 오버레이라
                      UI 아이콘이 아니라 그래픽이다. 24 로 줄이면 카드 한가운데 점처럼 보인다. */}
                  <PlayCircle size={44} style={{ color: 'var(--mm-yellow)' }} className="drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)]" fill="rgba(0,0,0,0.5)" />
                </span>
                {/* 핀 개수 뱃지 (우상단) */}
                <span
                  className="absolute top-2 right-2 inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-[0.10em] px-1.5 py-0.5"
                  style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '3px' }}
                >
                  <Pin size={14} aria-hidden />
                  {playerClips.length}
                </span>
              </div>
              {/* 하단 · 프로필 + 이름 */}
              <div className="flex items-center gap-2.5 p-3">
                <div
                  className="relative w-11 h-11 shrink-0 rounded-full overflow-hidden flex items-center justify-center"
                  style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
                  aria-hidden
                >
                  <span
                    className="absolute inset-0 flex items-center justify-center font-jersey font-black text-lg"
                    style={{ color: 'var(--mm-ink)' }}
                  >
                    {initialsOf(p.name)}
                  </span>
                  {photo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photo}
                      alt=""
                      loading="lazy"
                      className="relative w-full h-full object-cover"
                      onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black truncate" style={{ color: 'var(--mm-ink)' }}>
                    {p.number != null ? `#${p.number} ` : ''}{p.name}
                  </div>
                  <div className="text-[11px] font-bold uppercase mt-0.5" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>
                    베스트샷 {playerClips.length}개
                  </div>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* 재생 모달 · 선택한 선수의 클립만 */}
      {openPid && openPlayerClips.length > 0 && openPlayer && (
        <HighlightsClipModal
          clips={openPlayerClips}
          startIdx={0}
          title={`${openPlayer.name} · 베스트샷 릴`}
          icon={<Pin size={14} style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden />}
          onClose={() => setOpenPid(null)}
          ariaLabel={`${openPlayer.name} 베스트샷 재생`}
        />
      )}
    </>
  )
}
