'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Play, ChevronRight } from 'lucide-react'

// 카드 클릭 시에만 열리는 모달 — 초기 번들에서 분리 (recharts 4종 포함)
const PlayerQuickViewModal = dynamic(() => import('./PlayerQuickViewModal'), { ssr: false })
// ▶ 클릭 시에만 열리는 클립 모달 — YT iframe API 지연 로드
const MilestoneClipModal = dynamic(() => import('./MilestoneClipModal'), { ssr: false })

type MilestoneCategory = 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK' | '3PM' | 'GP'

interface UpcomingEntry {
  player_id: string
  name: string
  number: number | null
  category: MilestoneCategory
  current: number
  target: number
  distance: number
  percent: number
}

interface RecentEntry {
  player_id: string
  name: string
  number: number | null
  category: MilestoneCategory
  target: number
  achieved_at: string
  event_id?: string
  game_id?: string
  game_date?: string
  video_url?: string | null
  video_id?: string | null
  video_timestamp?: number | null
  clip_start?: number | null
  clip_end?: number | null
  shot_type?: string | null
}

interface MilestoneData {
  upcoming: UpcomingEntry[]
  recent: RecentEntry[]
}

interface Props {
  leagueId: string
  /** SSR 프리페치 결과 — 있으면 초기 fetch skip (홈 waterfall 제거용) */
  initialData?: MilestoneData
}

const CATEGORY_LABEL: Record<MilestoneCategory, string> = {
  PTS: '득점',
  REB: '리바',
  AST: '도움',
  STL: '스틸',
  BLK: '블락',
  '3PM': '3점',
  GP:  '참석',
}

function formatKoreanDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`
}

// RecentEntry → 재생 가능 여부
function isPlayable(r: RecentEntry): boolean {
  return !!(r.video_id && r.video_url && r.video_timestamp != null && r.clip_start != null && r.clip_end != null && r.event_id && r.game_id && r.shot_type)
}

export default function MilestoneFeed({ leagueId, initialData }: Props) {
  const hasInitial = !!initialData
  const [upcoming, setUpcoming] = useState<UpcomingEntry[]>(initialData?.upcoming ?? [])
  const [recent, setRecent] = useState<RecentEntry[]>(initialData?.recent ?? [])
  const [loading, setLoading] = useState(!hasInitial)
  const [quickPlayer, setQuickPlayer] = useState<{ id: string; name: string } | null>(null)
  const [clip, setClip] = useState<RecentEntry | null>(null)

  const params = useParams<{ orgSlug?: string; org?: string }>()
  const orgSlug = params?.orgSlug ?? params?.org ?? ''
  const milestonesHref = orgSlug
    ? `/league/${orgSlug}/${leagueId}/highlights/milestones`
    : null

  useEffect(() => {
    // initial 데이터가 있으면 mount 시 fetch skip — 서버 렌더 결과 그대로 사용
    if (hasInitial) return
    setLoading(true)
    fetch(`/api/leagues/${leagueId}/milestones?maxUpcoming=6&maxRecent=6&horizonDays=30`)
      .then(r => r.json())
      .then(d => {
        setUpcoming(d.upcoming ?? [])
        setRecent(d.recent ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId])

  if (loading) {
    return (
      <div
        className="mm-brand p-6 text-center text-xs font-bold uppercase tracking-[0.20em]"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
          color: 'var(--mm-muted)',
        }}
      >
        마일스톤 스캔 중...
      </div>
    )
  }

  if (upcoming.length === 0 && recent.length === 0) return null

  return (
    <>
      <section
        className="mm-brand"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
        }}
      >
        {/* 헤더 */}
        <header
          className="flex items-baseline justify-between px-5 md:px-8 py-4 md:py-5"
          style={{ borderBottom: '1px solid var(--mm-rule)' }}
        >
          <h3
            className="font-jersey font-black uppercase"
            style={{
              color: 'var(--mm-ink)',
              fontSize: '22px',
              letterSpacing: '-0.005em',
            }}
          >
            커리어 <span style={{ color: 'var(--mm-yellow-strong)' }}>마일스톤</span>
          </h3>
          <span
            className="text-[11px] md:text-[12px] font-bold uppercase tabular-nums"
            style={{ color: 'var(--mm-muted)', letterSpacing: '0.18em' }}
          >
            임박 {upcoming.length} · 최근 {recent.length}
          </span>
        </header>

        <div
          className="grid grid-cols-1 md:grid-cols-2"
          style={{ borderColor: 'var(--mm-rule)' }}
        >
          {/* 좌측: 임박 마일스톤 */}
          <div
            className="p-4 md:p-6 border-b md:border-b-0 border-[color:var(--mm-rule)]"
          >
            <div className="mb-3 md:mb-4">
              <p
                className="font-jersey font-black uppercase"
                style={{
                  color: 'var(--mm-yellow-strong)',
                  fontSize: '13px',
                  letterSpacing: '0.20em',
                }}
              >
                임박 (진행률 순)
              </p>
            </div>
            {upcoming.length === 0 ? (
              <p
                className="text-xs py-4 text-center uppercase tracking-[0.16em] font-bold"
                style={{ color: 'var(--mm-muted)' }}
              >
                임박한 마일스톤 없음
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {upcoming.map(u => (
                  <button
                    key={`${u.player_id}-${u.category}-${u.target}`}
                    onClick={() => setQuickPlayer({ id: u.player_id, name: u.name })}
                    className="w-full text-left group transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                    style={{
                      background: 'var(--mm-panel-alt)',
                      border: '1px solid var(--mm-rule)',
                      padding: '10px 12px',
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
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
                          {u.category}
                        </span>
                        <span
                          className="font-jersey uppercase break-keep min-w-0 transition-colors duration-200"
                          style={{
                            color: 'var(--mm-ink)',
                            fontSize: 'clamp(15px, 4vw, 18px)',
                            fontWeight: 900,
                            letterSpacing: '-0.005em',
                            lineHeight: '1.15',
                            wordBreak: 'break-word',
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {u.name}
                          {u.number != null && (
                            <span
                              className="ml-1.5 tabular-nums"
                              style={{
                                color: 'var(--mm-muted)',
                                fontSize: '12px',
                                fontWeight: 700,
                              }}
                            >
                              #{u.number}
                            </span>
                          )}
                        </span>
                      </div>
                      <span
                        className="font-jersey font-black tabular-nums shrink-0 break-keep"
                        style={{
                          color: 'var(--mm-ink-soft)',
                          fontSize: '13px',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {u.target}까지{' '}
                        <span
                          className="font-jersey"
                          style={{
                            color: 'var(--mm-yellow-strong)',
                            fontSize: '18px',
                            fontWeight: 900,
                          }}
                        >
                          {u.distance}
                        </span>
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="flex items-center gap-2">
                      <div
                        className="flex-1 h-1.5 overflow-hidden"
                        style={{ background: 'var(--mm-rule)' }}
                      >
                        <div
                          className="h-full transition-all duration-200"
                          style={{
                            width: `${Math.min(100, u.percent)}%`,
                            background: 'var(--mm-yellow)',
                          }}
                        />
                      </div>
                      <span
                        className="tabular-nums shrink-0 w-10 text-right font-bold"
                        style={{
                          color: 'var(--mm-muted)',
                          fontSize: '11px',
                          letterSpacing: '0.02em',
                        }}
                      >
                        {u.percent.toFixed(0)}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 우측: 최근 달성 */}
          <div
            className="p-4 md:p-6 md:border-l border-[color:var(--mm-rule)]"
          >
            <div className="mb-3 md:mb-4">
              <p
                className="font-jersey font-black uppercase"
                style={{
                  color: 'var(--mm-yellow-strong)',
                  fontSize: '13px',
                  letterSpacing: '0.20em',
                }}
              >
                최근 달성 (30일)
              </p>
            </div>
            {recent.length === 0 ? (
              <p
                className="text-xs py-4 text-center uppercase tracking-[0.16em] font-bold"
                style={{ color: 'var(--mm-muted)' }}
              >
                최근 달성 없음
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {recent.map(r => {
                  const playable = isPlayable(r)
                  return (
                    <div
                      key={`${r.player_id}-${r.category}-${r.target}-${r.achieved_at}`}
                      className="w-full flex items-center gap-2 transition-colors duration-200 group"
                      style={{
                        background: 'var(--mm-panel-alt)',
                        border: '1px solid var(--mm-rule)',
                        padding: '10px 12px',
                      }}
                    >
                      {/* 카드 본문 (선수 프로필 모달) */}
                      <button
                        type="button"
                        onClick={() => setQuickPlayer({ id: r.player_id, name: r.name })}
                        className="flex-1 flex items-center gap-3 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1 min-w-0"
                        aria-label={`${r.name} 선수 상세 보기`}
                      >
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
                          {r.category}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p
                            className="font-jersey uppercase break-keep"
                            style={{
                              color: 'var(--mm-ink)',
                              fontSize: 'clamp(15px, 4vw, 18px)',
                              fontWeight: 900,
                              letterSpacing: '-0.005em',
                              lineHeight: '1.15',
                              wordBreak: 'break-word',
                              overflowWrap: 'anywhere',
                            }}
                          >
                            {r.name}
                            {r.number != null && (
                              <span
                                className="ml-1.5 tabular-nums"
                                style={{
                                  color: 'var(--mm-muted)',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                }}
                              >
                                #{r.number}
                              </span>
                            )}
                          </p>
                          <p
                            className="font-bold uppercase mt-1 break-keep"
                            style={{
                              color: 'var(--mm-muted)',
                              fontSize: '10px',
                              letterSpacing: '0.14em',
                              lineHeight: 1.3,
                            }}
                          >
                            {formatKoreanDate(r.achieved_at)} · {CATEGORY_LABEL[r.category]}
                          </p>
                        </div>
                        <span
                          className="font-jersey font-black tabular-nums shrink-0"
                          style={{
                            color: 'var(--mm-yellow-strong)',
                            fontSize: '28px',
                            letterSpacing: '-0.015em',
                            lineHeight: '1',
                          }}
                        >
                          {r.target}
                        </span>
                      </button>

                      {/* ▶ 그 순간 재생 (video 있을 때만 활성) */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (playable) setClip(r)
                        }}
                        disabled={!playable}
                        className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] shrink-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1 disabled:cursor-not-allowed"
                        style={{
                          background: playable ? 'var(--mm-yellow)' : 'var(--mm-panel)',
                          color: playable ? 'var(--mm-black)' : 'var(--mm-muted)',
                          border: `1px solid ${playable ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
                          borderRadius: '4px',
                          opacity: playable ? 1 : 0.5,
                        }}
                        aria-label={playable ? `${r.name} ${r.target} 달성 순간 재생` : '영상 없음'}
                        title={playable ? '그 순간 재생' : '영상 없음'}
                      >
                        <Play size={16} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* 더보기 링크 */}
        {milestonesHref && (
          <div
            className="px-4 md:px-6 py-3 flex items-center justify-end"
            style={{ borderTop: '1px solid var(--mm-rule)' }}
          >
            <Link
              href={milestonesHref}
              className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.14em] min-h-[36px] px-3 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
              style={{
                color: 'var(--mm-yellow-strong)',
                background: 'var(--mm-panel-alt)',
                border: '1px solid var(--mm-rule)',
                borderRadius: '4px',
              }}
            >
              전체 마일스톤 보기
              <ChevronRight size={12} />
            </Link>
          </div>
        )}
      </section>

      {quickPlayer && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={quickPlayer.id}
          playerName={quickPlayer.name}
          onClose={() => setQuickPlayer(null)}
        />
      )}

      {clip && clip.event_id && clip.game_id && clip.video_url && clip.video_id
        && clip.video_timestamp != null && clip.clip_start != null && clip.clip_end != null
        && clip.shot_type && (
        <MilestoneClipModal
          clip={{
            player_id: clip.player_id,
            player_name: clip.name,
            player_number: clip.number,
            category: clip.category,
            target: clip.target,
            achieved_at: clip.achieved_at,
            event_id: clip.event_id,
            game_id: clip.game_id,
            video_url: clip.video_url,
            video_id: clip.video_id,
            video_timestamp: clip.video_timestamp,
            clip_start: clip.clip_start,
            clip_end: clip.clip_end,
            shot_type: clip.shot_type,
          }}
          onClose={() => setClip(null)}
        />
      )}
    </>
  )
}
