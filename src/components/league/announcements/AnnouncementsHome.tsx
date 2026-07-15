'use client'
// 리그 홈 상단 공지 스트립
// - 서버가 사전 로드한 announcements 를 초기값으로 받고 이후 편집시 client state 갱신
// - 편집 모드(PIN 통과) 에서는 "새 공지 / 목록 관리" 노출
// - 상단 카드: 가장 최근/고정 공지 1건 + 추가 목록 접기(chevron)
// - 미확인 뱃지: localStorage 마지막 열람 시간 대비 published_at 최신 개수
import { useState, useMemo, useCallback, useEffect } from 'react'
import { Megaphone, ChevronDown, ChevronUp, Plus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import AnnouncementReaderModal from './AnnouncementReaderModal'
import AnnouncementEditorModal from './AnnouncementEditorModal'
import type { LeagueAnnouncement } from '@/lib/announcements/types'

interface Props {
  leagueId: string
  initialAnnouncements: LeagueAnnouncement[]
}

const SEEN_KEY_PREFIX = 'league_announcements_last_seen_'

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

// 마크다운 앞부분에서 요약 3줄 만들기 (헤딩/이미지/링크 문법 대충 제거)
function summarize(md: string, maxLen = 140): string {
  const stripped = md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\n{2,}/g, ' · ')
    .replace(/\n/g, ' ')
    .trim()
  return stripped.length > maxLen ? stripped.slice(0, maxLen) + '…' : stripped
}

export default function AnnouncementsHome({ leagueId, initialAnnouncements }: Props) {
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
    <section
      className="mm-brand relative"
      style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderBottom: 0 }}
      aria-label="리그 공지"
    >
      <header
        className="flex items-center justify-between gap-2 px-4 sm:px-6 md:px-10 py-3 sm:py-4"
        style={{ borderBottom: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}
      >
        <div className="inline-flex items-center gap-2 min-w-0">
          <Megaphone size={16} className="text-[color:var(--mm-yellow-strong)] shrink-0" aria-hidden />
          <h2 className="font-jersey font-black uppercase text-sm sm:text-base tracking-[0.14em]" style={{ color: 'var(--mm-ink)' }}>
            공지
          </h2>
          {unreadCount > 0 && (
            <span
              className="text-[10px] font-black uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm inline-flex items-center gap-1"
              style={{ background: '#DC2626', color: 'white' }}
              aria-label={`미확인 ${unreadCount}건`}
            >
              <Sparkles size={10} aria-hidden />
              NEW {unreadCount}
            </span>
          )}
        </div>
        {isEditMode && (
          <button
            type="button"
            onClick={startCreate}
            className="min-h-[36px] px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.10em] rounded-sm cursor-pointer transition-colors inline-flex items-center gap-1.5"
            style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
            aria-label="새 공지 작성"
          >
            <Plus size={12} aria-hidden />
            새 공지
          </button>
        )}
      </header>

      {items.length === 0 ? (
        <div className="px-4 sm:px-6 md:px-10 py-5 text-center text-xs" style={{ color: 'var(--mm-muted)' }}>
          아직 공지가 없습니다. 편집 모드에서 첫 공지를 작성해보세요.
        </div>
      ) : (
        <>
          {/* Featured card */}
          {featured && (
            <button
              type="button"
              onClick={() => openReader(featured)}
              className="w-full text-left px-4 sm:px-6 md:px-10 py-4 sm:py-5 cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)] focus-visible:outline-none focus-visible:bg-[color:var(--mm-panel-alt)]"
            >
              <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                <div className="inline-flex items-center gap-2 min-w-0">
                  {featured.pinned && (
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm shrink-0"
                      style={{ background: 'var(--mm-black)', color: 'var(--mm-yellow)' }}>
                      고정
                    </span>
                  )}
                  <h3 className="text-base sm:text-lg font-black break-keep" style={{ color: 'var(--mm-ink)' }}>
                    {featured.title}
                  </h3>
                </div>
                <span className="text-[11px] shrink-0" style={{ color: 'var(--mm-muted)' }}>
                  {formatRelative(featured.published_at)}
                  {featured.created_by ? ` · ${featured.created_by}` : ''}
                </span>
              </div>
              {featured.body_markdown.trim() && (
                <p className="text-sm mt-1.5 line-clamp-2" style={{ color: 'var(--mm-ink-soft)', lineHeight: 1.55 }}>
                  {summarize(featured.body_markdown)}
                </p>
              )}
              <span
                className="inline-block mt-2 text-[11px] font-bold uppercase tracking-[0.14em]"
                style={{ color: 'var(--mm-yellow-strong)' }}
              >
                자세히 보기 →
              </span>
            </button>
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
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => openReader(a)}
                        className="w-full text-left px-4 sm:px-6 md:px-10 py-3 cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)] flex items-baseline gap-3"
                      >
                        <span className="flex-1 min-w-0">
                          <span className="text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>
                            {a.pinned && <span className="mr-1.5 text-[10px] font-black uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm"
                              style={{ background: 'var(--mm-black)', color: 'var(--mm-yellow)' }}>고정</span>}
                            {a.title}
                          </span>
                        </span>
                        <span className="text-[11px] shrink-0" style={{ color: 'var(--mm-muted)' }}>
                          {formatRelative(a.published_at)}
                        </span>
                      </button>
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
          canEdit={isEditMode}
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
    </section>
  )
}
