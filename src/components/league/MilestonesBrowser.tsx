'use client'
// MilestonesBrowser — 마일스톤 전체 페이지 client 컨트롤러
// - 카테고리 · 선수 · 임박/최근 필터
// - 최근 달성: ▶ 로 그 순간 재생 (MilestoneClipModal)
// - 임박: 진행률 바 + 선수 클릭 → PlayerQuickViewModal
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Play, Filter, TrendingUp, Trophy, X } from 'lucide-react'

const PlayerQuickViewModal = dynamic(() => import('./PlayerQuickViewModal'), { ssr: false })
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

interface Props {
  leagueId: string
  upcoming: UpcomingEntry[]
  recent: RecentEntry[]
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
const ALL_CATEGORIES: MilestoneCategory[] = ['PTS', 'REB', 'AST', 'STL', 'BLK', '3PM', 'GP']

type ViewTab = 'recent' | 'upcoming'

function formatKoreanDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} (${days[d.getDay()]})`
}

function isPlayable(r: RecentEntry): boolean {
  return !!(r.video_id && r.video_url && r.video_timestamp != null && r.clip_start != null && r.clip_end != null && r.event_id && r.game_id && r.shot_type)
}

const chipStyle = (active: boolean): React.CSSProperties => ({
  background: active ? 'var(--mm-yellow)' : 'var(--mm-panel)',
  color: active ? 'var(--mm-black)' : 'var(--mm-ink-soft)',
  border: `1px solid ${active ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
  borderRadius: '4px',
})

export default function MilestonesBrowser({ leagueId, upcoming, recent }: Props) {
  const [tab, setTab] = useState<ViewTab>('recent')
  const [category, setCategory] = useState<MilestoneCategory | null>(null)
  const [playerId, setPlayerId] = useState<string | null>(null)
  const [quickPlayer, setQuickPlayer] = useState<{ id: string; name: string } | null>(null)
  const [clip, setClip] = useState<RecentEntry | null>(null)

  // 선수 옵션 (recent + upcoming 병합, 중복 제거)
  const playerOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; number: number | null }>()
    for (const r of recent) if (!map.has(r.player_id)) map.set(r.player_id, { id: r.player_id, name: r.name, number: r.number })
    for (const u of upcoming) if (!map.has(u.player_id)) map.set(u.player_id, { id: u.player_id, name: u.name, number: u.number })
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  }, [recent, upcoming])

  const filteredRecent = useMemo(() => {
    return recent.filter(r => {
      if (category && r.category !== category) return false
      if (playerId && r.player_id !== playerId) return false
      return true
    })
  }, [recent, category, playerId])

  const filteredUpcoming = useMemo(() => {
    return upcoming.filter(u => {
      if (category && u.category !== category) return false
      if (playerId && u.player_id !== playerId) return false
      return true
    })
  }, [upcoming, category, playerId])

  const activeCount = (category ? 1 : 0) + (playerId ? 1 : 0)

  return (
    <>
      {/* 필터 바 */}
      <div
        className="p-3 lg:p-4 space-y-3 mm-brand"
        style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
        aria-label="마일스톤 필터"
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Filter size={14} style={{ color: 'var(--mm-muted)' }} aria-hidden />
            <span
              className="font-jersey font-black uppercase text-sm tracking-[0.14em]"
              style={{ color: 'var(--mm-ink)' }}
            >
              필터
            </span>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => { setCategory(null); setPlayerId(null) }}
                className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.10em] px-2 py-1 min-h-[32px] cursor-pointer transition-colors"
                style={{ color: 'var(--mm-muted)', background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
              >
                <X size={12} aria-hidden /> 초기화 ({activeCount})
              </button>
            )}
          </div>
          <span className="text-xs" style={{ color: 'var(--mm-muted)' }} aria-live="polite">
            {tab === 'recent'
              ? `${filteredRecent.length} / ${recent.length}개 달성`
              : `${filteredUpcoming.length} / ${upcoming.length}개 임박`}
          </span>
        </div>

        {/* 뷰 탭 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => setTab('recent')}
            aria-pressed={tab === 'recent'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors"
            style={chipStyle(tab === 'recent')}
          >
            <Trophy size={12} aria-hidden />
            최근 달성
          </button>
          <button
            type="button"
            onClick={() => setTab('upcoming')}
            aria-pressed={tab === 'upcoming'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors"
            style={chipStyle(tab === 'upcoming')}
          >
            <TrendingUp size={12} aria-hidden />
            임박
          </button>
        </div>

        {/* 카테고리 */}
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>카테고리</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setCategory(null)}
              className="px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors"
              style={chipStyle(category === null)}
            >
              전체
            </button>
            {ALL_CATEGORIES.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(category === c ? null : c)}
                className="px-3 py-1.5 min-h-[36px] text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors"
                style={chipStyle(category === c)}
                aria-pressed={category === c}
              >
                {c} <span className="ml-1 text-[10px] opacity-80">{CATEGORY_LABEL[c]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 선수 드롭다운 */}
        {playerOptions.length > 0 && (
          <div className="space-y-1.5">
            <label
              className="text-[11px] font-bold uppercase tracking-[0.14em] block"
              htmlFor="milestone-player-filter"
              style={{ color: 'var(--mm-muted)' }}
            >
              선수
            </label>
            <select
              id="milestone-player-filter"
              value={playerId ?? ''}
              onChange={(e) => setPlayerId(e.target.value || null)}
              className="w-full max-w-xs min-h-[44px] px-3 text-sm font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
              style={{
                background: 'var(--mm-panel-alt)',
                color: 'var(--mm-ink)',
                border: '1px solid var(--mm-rule)',
                borderRadius: '4px',
              }}
            >
              <option value="">전체 선수</option>
              {playerOptions.map(p => (
                <option key={p.id} value={p.id}>
                  {p.number != null ? `#${p.number} ` : ''}{p.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* 리스트 */}
      {tab === 'recent' ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mm-brand">
          {filteredRecent.length === 0 ? (
            <p
              className="col-span-full p-6 text-center text-xs font-bold uppercase tracking-[0.16em]"
              style={{ color: 'var(--mm-muted)', background: 'var(--mm-panel)', border: '1px dashed var(--mm-rule)', borderRadius: '4px' }}
            >
              조건에 맞는 최근 달성이 없습니다
            </p>
          ) : filteredRecent.map(r => {
            const playable = isPlayable(r)
            return (
              <div
                key={`${r.player_id}-${r.category}-${r.target}-${r.achieved_at}`}
                className="flex items-center gap-2 group"
                style={{
                  background: 'var(--mm-panel-alt)',
                  border: '1px solid var(--mm-rule)',
                  padding: '12px',
                  borderRadius: '4px',
                }}
              >
                <button
                  type="button"
                  onClick={() => setQuickPlayer({ id: r.player_id, name: r.name })}
                  className="flex-1 flex items-center gap-3 text-left cursor-pointer min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
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
                          style={{ color: 'var(--mm-muted)', fontSize: '12px', fontWeight: 700 }}
                        >
                          #{r.number}
                        </span>
                      )}
                    </p>
                    <p
                      className="font-bold uppercase mt-1"
                      style={{ color: 'var(--mm-muted)', fontSize: '10px', letterSpacing: '0.14em', lineHeight: 1.3 }}
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

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); if (playable) setClip(r) }}
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
      ) : (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mm-brand">
          {filteredUpcoming.length === 0 ? (
            <p
              className="col-span-full p-6 text-center text-xs font-bold uppercase tracking-[0.16em]"
              style={{ color: 'var(--mm-muted)', background: 'var(--mm-panel)', border: '1px dashed var(--mm-rule)', borderRadius: '4px' }}
            >
              조건에 맞는 임박 마일스톤이 없습니다
            </p>
          ) : filteredUpcoming.map(u => (
            <button
              key={`${u.player_id}-${u.category}-${u.target}`}
              onClick={() => setQuickPlayer({ id: u.player_id, name: u.name })}
              className="text-left cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
              style={{
                background: 'var(--mm-panel-alt)',
                border: '1px solid var(--mm-rule)',
                padding: '12px',
                borderRadius: '4px',
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
                    className="font-jersey uppercase break-keep min-w-0"
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
                        style={{ color: 'var(--mm-muted)', fontSize: '12px', fontWeight: 700 }}
                      >
                        #{u.number}
                      </span>
                    )}
                  </span>
                </div>
                <span
                  className="font-jersey font-black tabular-nums shrink-0"
                  style={{ color: 'var(--mm-ink-soft)', fontSize: '13px', letterSpacing: '0.02em' }}
                >
                  {u.target}까지{' '}
                  <span className="font-jersey" style={{ color: 'var(--mm-yellow-strong)', fontSize: '18px', fontWeight: 900 }}>
                    {u.distance}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 overflow-hidden" style={{ background: 'var(--mm-rule)' }}>
                  <div
                    className="h-full transition-all duration-200"
                    style={{ width: `${Math.min(100, u.percent)}%`, background: 'var(--mm-yellow)' }}
                  />
                </div>
                <span
                  className="tabular-nums shrink-0 w-10 text-right font-bold"
                  style={{ color: 'var(--mm-muted)', fontSize: '11px', letterSpacing: '0.02em' }}
                >
                  {u.percent.toFixed(0)}%
                </span>
              </div>
              <p
                className="mt-2 font-bold uppercase"
                style={{ color: 'var(--mm-muted)', fontSize: '10px', letterSpacing: '0.14em' }}
              >
                {CATEGORY_LABEL[u.category]} · 현재 {u.current}
              </p>
            </button>
          ))}
        </div>
      )}

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
