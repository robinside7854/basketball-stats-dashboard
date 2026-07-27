'use client'
// 리그 홈 상단 공지 스트립
// - 서버가 사전 로드한 announcements 를 초기값으로 받고 이후 편집시 client state 갱신
// - 편집 모드(PIN 통과) 에서는 "새 공지 / 목록 관리" 노출
// - 상단 카드: 가장 최근/고정 공지 1건 + 추가 목록 접기(chevron)
// - 미확인 뱃지: localStorage 마지막 열람 시간 대비 published_at 최신 개수
import { useState, useMemo, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { Megaphone, ChevronDown, ChevronUp, Plus, Sparkles, Pencil, Trash2, Calendar, User, MessageCircle, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import dynamic from 'next/dynamic'
import type { LeagueAnnouncement } from '@/lib/announcements/types'
import SectionCard from '@/components/league/ui/SectionCard'
import PushOptIn from '@/components/league/push/PushOptIn'

// 리더(react-markdown 체인)·에디터(tiptap+확장)는 무겁고 클릭 시에만 필요 →
// 홈 초기 클라이언트 번들에서 분리(모달 열림 시 지연 로드).
const AnnouncementReaderModal = dynamic(() => import('./AnnouncementReaderModal'), { ssr: false })
const AnnouncementEditorModal = dynamic(() => import('./AnnouncementEditorModal'), { ssr: false })

interface Props {
  leagueId: string
  initialAnnouncements: LeagueAnnouncement[]
  orgSlug?: string   // 아카이브 링크용
}

const SEEN_KEY_PREFIX = 'league_announcements_last_seen_'
const NEW_BADGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000   // 게시 후 7일 이내 NEW 뱃지

function isNew(iso: string): boolean {
  const t = new Date(iso).getTime()
  return !Number.isNaN(t) && (Date.now() - t) < NEW_BADGE_WINDOW_MS
}

function formatAbsolute(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const yy = String(d.getFullYear()).slice(2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yy}.${mm}.${dd}`
}

function formatRelative(iso: string): string {
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return ''
  const diffMs = Date.now() - d
  const day = 24 * 60 * 60 * 1000
  if (diffMs < 60 * 1000) return '방금 전'
  if (diffMs < 60 * 60 * 1000) return `${Math.floor(diffMs / (60 * 1000))}분 전`
  if (diffMs < day) return `${Math.floor(diffMs / (60 * 60 * 1000))}시간 전`
  if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}일 전`
  const dt = new Date(iso)
  return `${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`
}

// 본문(마크다운 or HTML)에서 텍스트만 뽑아 요약. TipTap HTML + 기존 마크다운 둘 다 대응.
function summarize(src: string, maxLen = 140): string {
  const stripped = src
    // HTML 먼저 (TipTap 저장 본문) — 이미지 태그 alt 는 제거 대신 통째 삭제
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // 마크다운 (기존 데이터)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>]/g, '')
    // 공백 정리
    .replace(/\s+/g, ' ')
    .trim()
  return stripped.length > maxLen ? stripped.slice(0, maxLen) + '…' : stripped
}

export default function AnnouncementsHome({ leagueId, initialAnnouncements, orgSlug }: Props) {
  const { isEditMode, leagueHeaders, openPinModal } = useLeagueEditMode()
  const pin = leagueHeaders['X-League-Pin'] ?? ''

  const [items, setItems] = useState<LeagueAnnouncement[]>(initialAnnouncements)
  const [expanded, setExpanded] = useState(false)
  const [reading, setReading] = useState<LeagueAnnouncement | null>(null)
  const [editing, setEditing] = useState<LeagueAnnouncement | null>(null)
  const [creating, setCreating] = useState(false)
  const [lastSeen, setLastSeen] = useState<number>(0)

  useEffect(() => {
    const v = Number(localStorage.getItem(SEEN_KEY_PREFIX + leagueId) ?? 0)
    setLastSeen(v)
  }, [leagueId])

  const unreadCount = useMemo(
    () => items.filter(a => new Date(a.published_at).getTime() > lastSeen).length,
    [items, lastSeen],
  )

  const markSeen = useCallback(() => {
    const now = Date.now()
    localStorage.setItem(SEEN_KEY_PREFIX + leagueId, String(now))
    setLastSeen(now)
  }, [leagueId])

  const openReader = useCallback((a: LeagueAnnouncement) => {
    setReading(a)
    markSeen()
  }, [markSeen])

  const startCreate = useCallback(() => {
    if (!isEditMode) { openPinModal(); return }
    setCreating(true)
  }, [isEditMode, openPinModal])

  const startEdit = useCallback((a: LeagueAnnouncement) => {
    if (!isEditMode) { openPinModal(); return }
    setEditing(a)
    setReading(null)
  }, [isEditMode, openPinModal])

  const onSaved = useCallback((a: LeagueAnnouncement) => {
    setItems(prev => {
      const idx = prev.findIndex(x => x.id === a.id)
      if (idx >= 0) {
        const next = [...prev]; next[idx] = a
        return next.sort((x, y) => {
          if (x.pinned !== y.pinned) return x.pinned ? -1 : 1
          return y.published_at.localeCompare(x.published_at)
        })
      }
      return [a, ...prev].sort((x, y) => {
        if (x.pinned !== y.pinned) return x.pinned ? -1 : 1
        return y.published_at.localeCompare(x.published_at)
      })
    })
    setCreating(false)
    setEditing(null)
  }, [])

  const onDelete = useCallback(async (a: LeagueAnnouncement) => {
    if (!isEditMode) { openPinModal(); return }
    if (!confirm(`"${a.title}" 공지를 삭제할까요?`)) return
    try {
      const res = await fetch(`/api/leagues/${leagueId}/announcements/${a.id}`, {
        method: 'DELETE',
        headers: { 'X-League-Pin': pin },
      })
      if (!res.ok) throw new Error((await res.json()).error ?? 'failed')
      setItems(prev => prev.filter(x => x.id !== a.id))
      setReading(null)
      toast.success('공지 삭제됨')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    }
  }, [isEditMode, leagueId, pin, openPinModal])

  const featured = items[0]
  const rest = items.slice(1)

  // 공지가 없고 편집자도 아니면 렌더 안 함 (홈 공간 절약)
  if (items.length === 0 && !isEditMode) return null

  return (
    <SectionCard variant="standalone" dataTour="announcements" ariaLabel="리그 공지" emphasized>
      <header
        className="flex items-center justify-between gap-2 px-4 sm:px-6 md:px-10 py-3 sm:py-4"
        style={{ borderBottom: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}
      >
        <div className="inline-flex items-center gap-2 min-w-0">
          <Megaphone size={18} className="text-[color:var(--mm-ink)] shrink-0" aria-hidden />
          <h2 className="font-jersey font-black uppercase text-base sm:text-lg tracking-[0.14em]" style={{ color: 'var(--mm-ink)' }}>
            공지
          </h2>
          {unreadCount > 0 && (
            <span
              className="text-[10px] font-black uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm inline-flex items-center gap-1"
              style={{ background: '#DC2626', color: '#ffffff' }}
              aria-label={`미확인 ${unreadCount}건`}
            >
              <Sparkles size={10} aria-hidden />
              NEW {unreadCount}
            </span>
          )}
        </div>
        <div className="inline-flex items-center gap-1.5">
          <PushOptIn leagueId={leagueId} compact />
          {orgSlug && items.length > 0 && (
            <Link
              href={`/league/${orgSlug}/${leagueId}/archive/announcements`}
              className="min-h-[36px] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.10em] rounded-sm cursor-pointer transition-colors inline-flex items-center gap-1"
              style={{ background: 'transparent', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)' }}
              aria-label="공지 전체 보기"
            >
              전체
              <ChevronRight size={12} aria-hidden />
            </Link>
          )}
          {isEditMode && (
            <button
              type="button"
              onClick={startCreate}
              className="min-h-[36px] px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.10em] rounded-sm cursor-pointer transition-colors inline-flex items-center gap-1.5"
              style={{ background: 'var(--mm-black)', color: '#ffffff', border: '1px solid var(--mm-black)' }}
              aria-label="새 공지 작성"
            >
              <Plus size={12} aria-hidden />
              새 공지
            </button>
          )}
        </div>
      </header>

      {items.length === 0 ? (
        <div className="px-4 sm:px-6 md:px-10 py-5 text-center text-xs" style={{ color: 'var(--mm-muted)' }}>
          아직 공지가 없습니다. 편집 모드에서 첫 공지를 작성해보세요.
        </div>
      ) : (
        <>
          {/* Featured card */}
          {featured && (
            <div className="relative">
              <button
                type="button"
                onClick={() => openReader(featured)}
                className="w-full text-left px-4 sm:px-6 md:px-10 py-4 sm:py-5 cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)] focus-visible:outline-none focus-visible:bg-[color:var(--mm-panel-alt)]"
              >
                {/* 태그 스트립 · 고정 / NEW */}
                <div className="inline-flex items-center gap-1.5 mb-2 flex-wrap">
                  {featured.pinned && (
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm"
                      style={{ background: 'var(--mm-black)', color: '#ffffff' }}>
                      고정
                    </span>
                  )}
                  {isNew(featured.published_at) && (
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm inline-flex items-center gap-0.5"
                      style={{ background: '#DC2626', color: 'white' }}>
                      <Sparkles size={9} aria-hidden />
                      NEW
                    </span>
                  )}
                </div>
                <h3 className="text-lg sm:text-xl font-black break-keep leading-tight" style={{ color: 'var(--mm-ink)' }}>
                  {featured.title}
                </h3>
                {/* 작성자 · 작성일 · 강조 */}
                <div className="flex items-center gap-3 mt-2 flex-wrap text-[13px]">
                  {featured.created_by && (
                    <span className="inline-flex items-center gap-1 font-black" style={{ color: 'var(--mm-ink)' }}>
                      <User size={13} className="text-[color:var(--mm-ink-soft)]" aria-hidden />
                      {featured.created_by}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 font-bold" style={{ color: 'var(--mm-ink-soft)' }}>
                    <Calendar size={12} aria-hidden />
                    {formatAbsolute(featured.published_at)}
                    <span className="text-[11px] font-normal ml-1" style={{ color: 'var(--mm-muted)' }}>
                      ({formatRelative(featured.published_at)})
                    </span>
                  </span>
                </div>
                {featured.body_markdown.trim() && (
                  <p className="text-sm mt-3 line-clamp-2" style={{ color: 'var(--mm-ink-soft)', lineHeight: 1.55 }}>
                    {summarize(featured.body_markdown)}
                  </p>
                )}
                <span
                  className="inline-block mt-3 text-[11px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: 'var(--mm-ink-soft)' }}
                >
                  자세히 보기 →
                </span>
              </button>
              {/* 편집자 액션 · 카드 위에 오버레이 (버튼 in 버튼 방지 위해 형제 요소로) */}
              {isEditMode && (
                <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); startEdit(featured) }}
                    title="수정"
                    aria-label={`${featured.title} 수정`}
                    className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-sm cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)]"
                    style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)' }}
                  >
                    <Pencil size={13} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDelete(featured) }}
                    title="삭제"
                    aria-label={`${featured.title} 삭제`}
                    className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-sm cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)]"
                    style={{ background: 'var(--mm-panel)', color: '#DC2626', border: '1px solid var(--mm-rule)' }}
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Rest list · expandable */}
          {rest.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setExpanded(v => !v)}
                className="w-full flex items-center justify-center gap-1.5 min-h-[36px] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] cursor-pointer transition-colors"
                style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', borderTop: '1px solid var(--mm-rule)' }}
                aria-expanded={expanded}
              >
                {expanded ? (
                  <><ChevronUp size={12} aria-hidden /> 지난 공지 접기</>
                ) : (
                  <><ChevronDown size={12} aria-hidden /> 지난 공지 {rest.length}건 더 보기</>
                )}
              </button>
              {expanded && (
                <ul className="divide-y divide-[color:var(--mm-rule)]" style={{ background: 'var(--mm-panel)' }}>
                  {rest.map(a => (
                    <li key={a.id} className="flex items-stretch">
                      <button
                        type="button"
                        onClick={() => openReader(a)}
                        className="flex-1 text-left px-4 sm:px-6 md:px-10 py-3 cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)] flex items-center gap-3 min-h-[52px]"
                      >
                        <span className="flex-1 min-w-0">
                          <span className="text-sm font-bold block" style={{ color: 'var(--mm-ink)' }}>
                            {a.pinned && <span className="mr-1.5 text-[10px] font-black uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm"
                              style={{ background: 'var(--mm-black)', color: '#ffffff' }}>고정</span>}
                            {isNew(a.published_at) && <span className="mr-1.5 text-[10px] font-black uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm"
                              style={{ background: '#DC2626', color: 'white' }}>NEW</span>}
                            {a.title}
                          </span>
                          {a.created_by && (
                            <span className="text-[11px] font-bold mt-0.5 inline-flex items-center gap-1" style={{ color: 'var(--mm-ink-soft)' }}>
                              <User size={10} className="text-[color:var(--mm-ink-soft)]" aria-hidden />
                              {a.created_by}
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] shrink-0 text-right" style={{ color: 'var(--mm-muted)' }}>
                          <span className="block font-bold" style={{ color: 'var(--mm-ink-soft)' }}>{formatAbsolute(a.published_at)}</span>
                          <span className="block text-[10px]">{formatRelative(a.published_at)}</span>
                        </span>
                      </button>
                      {isEditMode && (
                        <div className="flex items-center gap-1 pr-3">
                          <button
                            type="button"
                            onClick={() => startEdit(a)}
                            title="수정"
                            aria-label={`${a.title} 수정`}
                            className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-sm cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)]"
                            style={{ color: 'var(--mm-ink-soft)' }}
                          >
                            <Pencil size={13} aria-hidden />
                          </button>
                          <button
                            type="button"
                            onClick={() => onDelete(a)}
                            title="삭제"
                            aria-label={`${a.title} 삭제`}
                            className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center rounded-sm cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)]"
                            style={{ color: '#DC2626' }}
                          >
                            <Trash2 size={13} aria-hidden />
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}

      {/* Reader modal */}
      {reading && (
        <AnnouncementReaderModal
          announcement={reading}
          leagueId={leagueId}
          canEdit={isEditMode}
          adminPin={pin || undefined}
          onClose={() => setReading(null)}
          onEdit={isEditMode ? () => startEdit(reading) : undefined}
          onDelete={isEditMode ? () => onDelete(reading) : undefined}
        />
      )}

      {/* Editor modal */}
      {(creating || editing) && pin && (
        <AnnouncementEditorModal
          leagueId={leagueId}
          pin={pin}
          editing={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={onSaved}
        />
      )}
    </SectionCard>
  )
}
