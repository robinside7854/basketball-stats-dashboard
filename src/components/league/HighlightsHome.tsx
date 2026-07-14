'use client'
// HighlightsHome — 홈 페이지 '이번 주 하이라이트' 위젯 (Client Component)
// 발견성 강화: 최근 재생 가능 라운드 대표 클립 3-5개를 홈에 노출.
// 클릭 시 라운드 상세 페이지 (?clip=idx) 로 이동해 그 클립부터 재생.
//
// 데이터 소스는 상위 페이지에서 unstable_cache 로 프리페치 후 props 주입.
// img onError 폴백을 위해 client component (SSR 렌더는 그대로 유지, hydration 후에도 안전).
import Link from 'next/link'
import { Film, PlayCircle, ChevronRight } from 'lucide-react'
import { formatTimestamp } from '@/lib/youtube/utils'
import { SHOT_TYPE_LABEL } from '@/lib/highlights/clip'
import type { HighlightClip } from '@/lib/highlights/types'

export type HighlightsHomePayload = {
  date: string                 // 최근 재생 가능 라운드 date
  clips: HighlightClip[]       // 대표 클립 (이미 상위 3-5로 잘림)
  clipIndexes: number[]        // 각 클립의 라운드 전체 배열에서의 원본 index (딥링크용)
  totalClips: number           // 이 라운드 전체 클립 수
  displayNames: string[]       // 팀 이름 (헤더 서브타이틀용)
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

export default function HighlightsHome({ data, orgSlug, leagueId }: Props) {
  if (!data || data.clips.length === 0) return null

  const base = `/league/${orgSlug}/${leagueId}`
  const roundHref = `${base}/highlights/${data.date}`
  const dateLabel = formatDateShort(data.date)

  return (
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
        <div className="flex items-center gap-2 min-w-0">
          <Film
            size={24}
            style={{ color: 'var(--mm-yellow-strong)' }}
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
            이번 주 하이라이트
          </h3>
          <span
            className="text-[11px] sm:text-[12px] tracking-[0.14em] uppercase font-bold ml-1"
            style={{ color: 'var(--mm-muted)' }}
          >
            {dateLabel}
          </span>
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

      {/* 카드 그리드 — 모바일 1열 / lg 3열 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 p-4 sm:p-6 md:p-8 lg:p-10">
        {data.clips.map((c, i) => {
          const clipIdx = data.clipIndexes[i] ?? 0
          const thumb = `https://i.ytimg.com/vi/${c.video_id}/mqdefault.jpg`
          const shotLabel = SHOT_TYPE_LABEL[c.shot_type] ?? c.shot_type
          const href = `${roundHref}?clip=${clipIdx}`
          return (
            <Link
              key={c.event_id}
              href={href}
              className="group block cursor-pointer transition-shadow duration-200 hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
              style={{
                background: 'var(--mm-panel)',
                border: '1px solid var(--mm-rule)',
                borderRadius: '4px',
              }}
              aria-label={`${c.player_name} ${shotLabel} 재생 (${formatTimestamp(c.video_timestamp)})`}
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
                {/* 선수 사진 or 이니셜 */}
                <div
                  className="shrink-0 w-11 h-11 rounded-full overflow-hidden flex items-center justify-center relative"
                  style={{
                    background: 'var(--mm-panel-alt)',
                    border: '1px solid var(--mm-rule)',
                  }}
                  aria-hidden
                >
                  {/* 이니셜 (배경) — 사진 로드 실패 시 자연 노출 */}
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
                  <div
                    className="text-sm font-black truncate"
                    style={{ color: 'var(--mm-ink)' }}
                  >
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
            </Link>
          )
        })}
      </div>

      {/* 하단 서브텍스트 (팀 이름 · 총 클립 수) */}
      {data.totalClips > data.clips.length && (
        <div
          className="px-4 sm:px-6 md:px-10 pb-4 md:pb-5 text-[11px] uppercase tracking-[0.14em] font-bold"
          style={{ color: 'var(--mm-muted)' }}
        >
          이 라운드 전체 {data.totalClips}클립
          {data.displayNames.length > 0 ? ` · ${data.displayNames.slice(0, 4).join(' · ')}` : ''}
        </div>
      )}
    </section>
  )
}
