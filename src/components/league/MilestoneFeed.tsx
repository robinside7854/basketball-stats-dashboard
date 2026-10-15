'use client'
import { useOpenPlayerCard } from '@/contexts/PlayerCardContext'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Play, ChevronRight, Trophy } from 'lucide-react'

// 카드 클릭 시에만 열리는 모달 — 초기 번들에서 분리
// ▶ 클릭 시에만 열리는 클립 모달 — YT iframe API 지연 로드
const MilestoneClipModal = dynamic(() => import('./MilestoneClipModal'), { ssr: false })
import SectionCard from '@/components/league/ui/SectionCard'
import EmptyState from '@/components/league/ui/EmptyState'

// 마일스톤은 득점만 다룬다(lib/stats/milestones.ts v3) — 다른 카테고리 라벨은 2026-10-15 정리했다
type MilestoneCategory = 'PTS'

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
  /** 「통산 득점 3위」 — 지금 순위(lib/stats/milestones.ts). 옛 캐시 응답엔 없다 */
  career_rank_label?: string | null
}

// 서버(lib/stats/milestones.ts)는 최근 달성만 준다 — 「임박」은 2026-10-15 계산 자체를 뺐다
interface MilestoneData {
  recent: RecentEntry[]
}

interface Props {
  leagueId: string
  /** SSR 프리페치 결과 — 있으면 초기 fetch skip (홈 waterfall 제거용) */
  initialData?: MilestoneData
}

const CATEGORY_LABEL: Record<MilestoneCategory, string> = {
  PTS: '득점',
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

const MAX_RECENT = 5

export default function MilestoneFeed({ leagueId, initialData }: Props) {
  const hasInitial = !!initialData
  const [recent, setRecent] = useState<RecentEntry[]>(initialData?.recent ?? [])
  const [loading, setLoading] = useState(!hasInitial)
  // 선수 카드는 레이아웃의 전역 카드 하나로 연다(2026-10-14, contexts/PlayerCardContext)
  const openPlayerCard = useOpenPlayerCard()
  const setQuickPlayer = (p: { id: string; name: string } | null) => { if (p) openPlayerCard?.({ playerId: p.id, playerName: p.name }) }
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
    fetch(`/api/leagues/${leagueId}/milestones?maxRecent=${MAX_RECENT}&horizonDays=30`)
      .then(r => r.json())
      .then(d => {
        setRecent(d.recent ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId])

  if (loading) {
    return (
      <div
        className="mm-brand p-6 text-center t-label"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
          borderRadius: 'var(--mm-radius-card)',
        }}
      >
        마일스톤 스캔 중...
      </div>
    )
  }

  const recentShown = recent.slice(0, MAX_RECENT)

  return (
    <>
      <SectionCard variant="stack" pad="none">
        {/* 헤더 */}
        <header
          className="flex items-center justify-between gap-3 px-5 md:px-8 py-4 md:py-5"
          style={{ borderBottom: '1px solid var(--mm-rule)' }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Trophy size={20} aria-hidden style={{ color: 'var(--mm-ink-soft)' }} />
            <h3
              className="font-black break-keep"
              style={{
                color: 'var(--mm-ink)',
                fontSize: '22px',
                letterSpacing: '-0.005em',
              }}
            >
              최근 <span style={{ color: 'var(--mm-ink-soft)' }}>마일스톤</span>
            </h3>
          </div>
          {recentShown.length > 0 && (
            <span className="t-label t-num shrink-0 whitespace-nowrap">
              최근 {recentShown.length}
            </span>
          )}
        </header>

        {/* 최근 달성 — PC 에선 전폭 한 줄이 이름 옆 1000px 빈칸이었다 → 카드 격자(2026-10-12) */}
        {/* (2026-10-15) 비어 있으면 카드째 사라지던 것을 안내 문구로 — 홈 탭 안이라 null 이면 빈 탭이 열린다 */}
        {recentShown.length === 0 ? (
          <EmptyState
            variant="compact"
            icon={Trophy}
            title="최근 달성한 마일스톤이 없어요"
            description="최근 30일 안에 통산 득점 눈금(100·250·500…)을 넘은 선수가 생기면 여기 떠요"
          />
        ) : (
        <div className="p-4 md:p-5">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {recentShown.map(r => {
              const playable = isPlayable(r)
              return (
                <div
                  key={`${r.player_id}-${r.category}-${r.target}-${r.achieved_at}`}
                  className="w-full flex items-center gap-2 transition-colors duration-200 group"
                  style={{
                    background: 'var(--mm-panel-alt)',
                    border: '1px solid var(--mm-rule)',
                    borderRadius: 'var(--mm-radius-ctl)',
                    padding: '6px 8px 6px 12px',
                  }}
                >
                  {/* 카드 본문 (선수 프로필 모달) */}
                  <button
                    type="button"
                    onClick={() => setQuickPlayer({ id: r.player_id, name: r.name })}
                    className="flex-1 flex items-center gap-3 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-1 min-w-0 min-h-[44px]"
                    aria-label={`${r.name} 선수 상세 보기`}
                  >
                    <span
                      className="text-xs font-black t-num shrink-0 whitespace-nowrap"
                      style={{
                        background: 'var(--mm-ink)',
                        color: 'var(--mm-panel)',
                        padding: '3px 6px',
                      }}
                    >
                      {r.category}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p
                        className="font-black break-keep"
                        style={{
                          color: 'var(--mm-ink)',
                          fontSize: 'clamp(16px, 4vw, 18px)',
                          letterSpacing: '-0.005em',
                          lineHeight: '1.15',
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {r.name}
                        {r.number != null && (
                          <span className="ml-1.5 t-num text-xs font-medium" style={{ color: 'var(--mm-muted)' }}>
                            #{r.number}
                          </span>
                        )}
                        <span
                          className="ml-1.5 t-num font-black"
                          style={{ color: 'var(--mm-ink)', fontSize: 'clamp(16px, 4vw, 18px)' }}
                        >
                          {r.target}
                        </span>
                        {/* 서술부는 보조 — 이름·수치와 같은 700 이면 한 줄이 통째로 굵어 위계가 사라진다 */}
                        <span className="ml-1 text-sm font-medium" style={{ color: 'var(--mm-ink)' }}>
                          {CATEGORY_LABEL[r.category]} 달성!
                        </span>
                        {/* 날짜는 같은 줄 끝에 — 모바일에서 한 줄 아낀다 */}
                        <span className="ml-1.5 t-label font-medium whitespace-nowrap">
                          {formatKoreanDate(r.achieved_at)}
                        </span>
                      </p>
                      {r.career_rank_label && (
                        <p className="t-label font-bold mt-0.5" style={{ color: 'var(--mm-ink-soft)' }}>
                          현재 {r.career_rank_label}
                        </p>
                      )}
                    </div>
                  </button>

                  {/* ▶ 그 순간 재생 (video 있을 때만 활성) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      if (playable) setClip(r)
                    }}
                    disabled={!playable}
                    className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] shrink-0 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-1 disabled:cursor-not-allowed"
                    style={{
                      background: playable ? 'var(--mm-ink)' : 'var(--mm-panel)',
                      color: playable ? 'var(--mm-panel)' : 'var(--mm-muted)',
                      border: `1px solid ${playable ? 'var(--mm-ink)' : 'var(--mm-rule)'}`,
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
        </div>
        )}

        {/* 더보기 링크 */}
        {milestonesHref && (
          <div
            className="px-4 md:px-6 py-3 flex items-center justify-end"
            style={{ borderTop: '1px solid var(--mm-rule)' }}
          >
            <Link
              href={milestonesHref}
              className="inline-flex items-center gap-1 text-sm font-bold whitespace-nowrap min-h-11 px-3 cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)]"
              style={{
                color: 'var(--mm-ink-soft)',
                background: 'var(--mm-panel-alt)',
                border: '1px solid var(--mm-rule)',
                borderRadius: '4px',
              }}
            >
              전체 마일스톤 보기
              <ChevronRight size={14} />
            </Link>
          </div>
        )}
      </SectionCard>


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
