'use client'
// HighlightsHome — 홈 '이번 주 클러치샷' 위젯 (Client Component · v2)
//
// 변경 (v2, 2026-07-15 사용자 요구):
//   - "이번 주 하이라이트" → "이번 주 클러치샷" 으로 전환
//   - 최근 라운드의 is_clutch=true 클립만 노출
//   - 클러치샷 없으면 안내 코멘트 + 정의 부연 설명
//   - 카드 클릭 → 팝업(HighlightsPlayer 재사용)으로 재생 (기존 라운드 페이지 이동 X)
//
// 데이터 소스는 상위 페이지 unstable_cache 프리페치 후 props 주입.

import { useState } from 'react'
import Link from 'next/link'
import { HeartCrack, PlayCircle, ChevronRight } from 'lucide-react'
import { formatTimestamp } from '@/lib/youtube/utils'
import { SHOT_TYPE_LABEL } from '@/lib/highlights/clip'
import type { HighlightClip } from '@/lib/highlights/types'
import HighlightsClipModal from '@/components/highlights/HighlightsClipModal'

export type HighlightsHomePayload = {
  date: string
  clips: HighlightClip[]         // 클러치샷만 · 없으면 빈 배열
  clipIndexes: number[]          // 원본 인덱스 (라운드 페이지 딥링크용)
  totalClips: number             // 이 라운드 전체 클립 수 (클러치 여부 무관)
  displayNames: string[]         // 팀 이름
}

interface Props {
  data: HighlightsHomePayload | null
  orgSlug: string
  leagueId: string
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

function formatDateShort(date: string): string {
  const d = new Date(date + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return date
  return `${d.getMonth() + 1}.${d.getDate()} (${DAYS[d.getDay()]})`
}

function initialsOf(name: string): string {
  if (!name) return '?'
  return name.trim().charAt(0).toUpperCase()
}

const CLUTCH_DEFINITION = '경기 마지막 2분 · 2포제션 접전(6점차 이내) 에서 이 슛으로 1포제션(3점차) 이내로 좁혀진 결정타'

export default function HighlightsHome({ data, orgSlug, leagueId }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  if (!data) return null  // 재생 가능 라운드조차 없으면 섹션 미노출

  const base = `/league/${orgSlug}/${leagueId}`
  const roundHref = `${base}/highlights/${data.date}`
  const dateLabel = formatDateShort(data.date)
  const hasClutch = data.clips.length > 0

  return (
    <>
      <section
        data-tour="highlights-home"
        className="mm-brand"
        style={{
          background: 'var(--mm-panel-alt)',
          border: '1px solid var(--mm-rule)',
          borderTop: 0,
        }}
      >
        {/* 헤더 */}
        <header
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 sm:px-6 md:px-10 py-4 md:py-5"
          style={{ borderBottom: '1px solid var(--mm-rule)' }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <HeartCrack
                size={24}
                style={{ color: '#ef4444' }}
                aria-hidden
                className="shrink-0"
              />
              <h3
                className="font-jersey font-black uppercase break-keep"
                style={{
                  color: 'var(--mm-ink)',
                  fontSize: 'clamp(22px, 6vw, 28px)',
                  letterSpacing: '-0.005em',
                  lineHeight: 1.1,
                }}
              >
                이번 주 클러치샷
              </h3>
              <span
                className="text-[11px] sm:text-[12px] tracking-[0.14em] uppercase font-bold ml-1"
                style={{ color: 'var(--mm-muted)' }}
              >
                {dateLabel}
              </span>
            </div>
            {/* 클러치샷 정의 부연 설명 (작은 카피) */}
            <p
              className="text-[11px] sm:text-xs mt-1.5 leading-relaxed"
              style={{ color: 'var(--mm-muted)' }}
            >
              {CLUTCH_DEFINITION}
            </p>
          </div>
          <Link
            href={roundHref}
            className="inline-flex items-center gap-1 text-[11px] sm:text-[12px] font-black tracking-[0.14em] uppercase min-h-[36px] px-2 -mx-2 cursor-pointer transition-colors"
            style={{ color: 'var(--mm-yellow-strong)' }}
            aria-label="이번 라운드 하이라이트 전체 보기"
          >
            전체 보기
            <ChevronRight size={14} />
          </Link>
        </header>

        {/* 컨텐츠 */}
        {hasClutch ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 p-4 sm:p-6 md:p-8 lg:p-10">
            {data.clips.map((c, i) => {
              const thumb = `https://i.ytimg.com/vi/${c.video_id}/mqdefault.jpg`
              const shotLabel = SHOT_TYPE_LABEL[c.shot_type] ?? c.shot_type
              return (
                <button
                  key={c.event_id}
                  type="button"
                  onClick={() => setOpenIdx(i)}
                  className="group text-left block cursor-pointer transition-shadow duration-200 hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                  style={{
                    background: 'var(--mm-panel)',
                    border: '1px solid #ef4444',
                    borderLeft: '3px solid #ef4444',
                    borderRadius: '4px',
                  }}
                  aria-label={`${c.player_name} ${shotLabel} 클러치샷 재생 (${formatTimestamp(c.video_timestamp)})`}
                >
                  {/* 썸네일 + ▶ */}
                  <div className="relative aspect-video overflow-hidden" style={{ background: '#000' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumb}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                    />
                    <span
                      aria-hidden
                      className="absolute inset-0 flex items-center justify-center transition-colors"
                      style={{ background: 'rgba(0,0,0,0.15)' }}
                    >
                      <PlayCircle
                        size={56}
                        style={{ color: 'var(--mm-yellow)' }}
                        className="drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)] transition-transform group-hover:scale-110"
                        fill="rgba(0,0,0,0.5)"
                      />
                    </span>
                    {/* 클러치 뱃지 */}
                    <span
                      className="absolute top-2 left-2 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.14em] px-1.5 py-0.5"
                      style={{ background: '#ef4444', color: '#fff', borderRadius: '3px' }}
                    >
                      <HeartCrack size={11} aria-hidden />
                      클러치
                    </span>
                    {c.points >= 3 && (
                      <span
                        className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5"
                        style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '3px' }}
                      >
                        +{c.points}
                      </span>
                    )}
                    <span
                      aria-hidden
                      className="absolute bottom-2 left-2 inline-block w-2 h-2 rounded-full"
                      style={{ background: c.team_color, boxShadow: '0 0 0 1px rgba(0,0,0,0.4)' }}
                    />
                  </div>

                  {/* 정보 */}
                  <div className="p-3 flex items-center gap-3">
                    <div
                      className="shrink-0 w-11 h-11 rounded-full overflow-hidden flex items-center justify-center relative"
                      style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
                      aria-hidden
                    >
                      <span
                        className="absolute inset-0 flex items-center justify-center font-jersey font-black text-lg"
                        style={{ color: 'var(--mm-ink)' }}
                      >
                        {initialsOf(c.player_name)}
                      </span>
                      {c.player_photo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.player_photo}
                          alt=""
                          loading="lazy"
                          className="relative w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                        />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-black truncate" style={{ color: 'var(--mm-ink)' }}>
                        {c.player_number ? `#${c.player_number} ` : ''}{c.player_name}
                      </div>
                      <div
                        className="text-[11px] mt-0.5 flex items-center gap-1.5 flex-wrap"
                        style={{ color: 'var(--mm-muted)' }}
                      >
                        <span
                          className="font-bold uppercase tracking-[0.10em] px-1.5 py-0.5"
                          style={{
                            background: 'var(--mm-panel-alt)',
                            color: 'var(--mm-ink-soft)',
                            border: '1px solid var(--mm-rule)',
                            borderRadius: '3px',
                          }}
                        >
                          {shotLabel}
                        </span>
                        <span className="font-mono">{formatTimestamp(c.video_timestamp)}</span>
                      </div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          // 클러치샷 없음 · 안내 코멘트
          <div className="px-4 sm:px-6 md:px-10 py-8 md:py-10 text-center">
            <div
              className="inline-flex items-center gap-2 text-sm font-bold mb-2"
              style={{ color: 'var(--mm-ink-soft)' }}
            >
              <HeartCrack size={18} style={{ color: 'var(--mm-muted)' }} aria-hidden />
              이번 주는 해당 기준에 맞는 경기가 없어요
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
              마지막 2분 · 2포제션 접전에서 1포제션으로 좁힌 결정타가 이번 라운드엔 없었습니다.
            </p>
          </div>
        )}

        {hasClutch && data.totalClips > 0 && (
          <div
            className="px-4 sm:px-6 md:px-10 pb-4 md:pb-5 text-[11px] uppercase tracking-[0.14em] font-bold"
            style={{ color: 'var(--mm-muted)' }}
          >
            이 라운드 · 클러치 {data.clips.length} / 전체 {data.totalClips}
            {data.displayNames.length > 0 ? ` · ${data.displayNames.slice(0, 4).join(' · ')}` : ''}
          </div>
        )}
      </section>

      {/* 팝업 재생기 — 공용 HighlightsClipModal · 클러치샷 플레이리스트 자동 재생 */}
      {openIdx !== null && hasClutch && (
        <HighlightsClipModal
          clips={data.clips}
          startIdx={openIdx}
          title="이번 주 클러치샷"
          icon={<HeartCrack size={16} style={{ color: '#ef4444' }} aria-hidden />}
          onClose={() => setOpenIdx(null)}
          ariaLabel="클러치샷 재생"
        />
      )}
    </>
  )
}
