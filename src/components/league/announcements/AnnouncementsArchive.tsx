'use client'
// 공지사항 아카이브 (전체 목록) — 게시판 형태
// 최신순 (핀 우선) · 어드민만 작성/수정/삭제 · 카드 클릭 시 Reader 모달로 열람 (+댓글)
import { useState, useCallback } from 'react'
import { Megaphone, Plus, Sparkles, Calendar, User, Pin, Pencil, Trash2, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import AnnouncementReaderModal from './AnnouncementReaderModal'
import AnnouncementEditorModal from './AnnouncementEditorModal'
import type { LeagueAnnouncement } from '@/lib/announcements/types'

interface Props {
  leagueId: string
  initialAnnouncements: LeagueAnnouncement[]
}

const NEW_BADGE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

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

function summarize(src: string, maxLen = 120): string {
  const stripped = src
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return stripped.length > maxLen ? stripped.slice(0, maxLen) + '…' : stripped
}

export default function AnnouncementsArchive({ leagueId, initialAnnouncements }: Props) {
  const { isEditMode, leagueHeaders, openPinModal } = useLeagueEditMode()
  const pin = leagueHeaders['X-League-Pin'] ?? ''

  const [items, setItems] = useState<LeagueAnnouncement[]>(initialAnnouncements)
  const [reading, setReading] = useState<LeagueAnnouncement | null>(null)
  const [editing, setEditing] = useState<LeagueAnnouncement | null>(null)
  const [creating, setCreating] = useState(false)

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
      const next = idx >= 0 ? prev.map(x => x.id === a.id ? a : x) : [a, ...prev]
      return next.sort((x, y) => {
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

  return (
    <>
      <section
        className="mm-brand rounded-md overflow-hidden"
        style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}
      >
        <header
          className="flex items-center justify-between gap-2 px-4 sm:px-6 py-4"
          style={{ borderBottom: '1px solid var(--mm-rule)', background: 'var(--mm-yellow)' }}
        >
          <div className="inline-flex items-center gap-2">
            <Megaphone size={18} className="text-[color:var(--mm-black)]" aria-hidden />
            <h1 className="font-jersey font-black uppercase text-lg tracking-[0.14em]" style={{ color: 'var(--mm-black)' }}>
              공지사항 전체
            </h1>
            <span className="text-xs font-bold" style={{ color: 'var(--mm-black)' }}>
              총 {items.length}건
            </span>
          </div>
          {isEditMode ? (
            <button
              type="button"
              onClick={startCreate}
              className="min-h-[36px] px-3 py-1.5 text-xs font-black uppercase tracking-[0.10em] rounded-sm cursor-pointer transition-colors inline-flex items-center gap-1.5"
              style={{ background: 'var(--mm-black)', color: 'var(--mm-yellow)', border: '1px solid var(--mm-black)' }}
            >
              <Plus size={12} aria-hidden />
              새 공지
            </button>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-1 rounded-sm"
              style={{ background: 'transparent', color: 'var(--mm-black)', border: '1px dashed var(--mm-black)' }}>
              어드민만 작성
            </span>
          )}
        </header>

        {items.length === 0 ? (
          <div className="px-4 py-16 text-center text-sm" style={{ color: 'var(--mm-muted)' }}>
            아직 공지가 없습니다.
          </div>
        ) : (
          <ul className="divide-y divide-[color:var(--mm-rule)]">
            {items.map(a => (
              <li key={a.id} className="flex items-stretch">
                <button
                  type="button"
                  onClick={() => setReading(a)}
                  className="flex-1 text-left px-4 sm:px-6 py-4 cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)] min-h-[64px]"
                >
                  {/* 태그 스트립 */}
                  <div className="inline-flex items-center gap-1.5 mb-1.5 flex-wrap">
                    {a.pinned && (
                      <span className="text-[10px] font-black uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm inline-flex items-center gap-0.5"
                        style={{ background: 'var(--mm-black)', color: 'var(--mm-yellow)' }}>
                        <Pin size={9} aria-hidden />
                        고정
                      </span>
                    )}
                    {isNew(a.published_at) && (
                      <span className="text-[10px] font-black uppercase tracking-[0.14em] px-1.5 py-0.5 rounded-sm inline-flex items-center gap-0.5"
                        style={{ background: '#DC2626', color: 'white' }}>
                        <Sparkles size={9} aria-hidden />
                        NEW
                      </span>
                    )}
                  </div>
                  {/* 제목 */}
                  <h2 className="text-base font-black break-keep leading-snug" style={{ color: 'var(--mm-ink)' }}>
                    {a.title}
                  </h2>
                  {/* 본문 요약 */}
                  {a.body_markdown.trim() && (
                    <p className="text-sm mt-1 line-clamp-1" style={{ color: 'var(--mm-ink-soft)' }}>
                      {summarize(a.body_markdown)}
                    </p>
                  )}
                  {/* 메타 */}
                  <div className="flex items-center gap-3 mt-2 flex-wrap text-[11px]">
                    {a.created_by && (
                      <span className="inline-flex items-center gap-1 font-black" style={{ color: 'var(--mm-ink)' }}>
                        <User size={11} className="text-[color:var(--mm-yellow-strong)]" aria-hidden />
                        {a.created_by}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 font-bold" style={{ color: 'var(--mm-ink-soft)' }}>
                      <Calendar size={11} aria-hidden />
                      {formatAbsolute(a.published_at)}
                    </span>
                  </div>
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
      </section>

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
      {(creating || editing) && pin && (
        <AnnouncementEditorModal
          leagueId={leagueId}
          pin={pin}
          editing={editing}
          onClose={() => { setCreating(false); setEditing(null) }}
          onSaved={onSaved}
        />
      )}
    </>
  )
}
