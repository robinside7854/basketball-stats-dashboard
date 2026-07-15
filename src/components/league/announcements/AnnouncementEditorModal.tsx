'use client'
// 공지 생성/수정 모달 — PIN 필요 · 마크다운 텍스트에어리어 + 붙여넣기/드롭 이미지 자동 업로드
// 왼쪽 편집기 · 오른쪽 실시간 미리보기 (모바일에서는 세로 스택)
import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Megaphone, Image as ImageIcon, Save, Pin, PinOff } from 'lucide-react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import type { LeagueAnnouncement } from '@/lib/announcements/types'

interface Props {
  leagueId: string
  pin: string   // 이미 검증된 리그 편집 PIN (상위에서 프롬프트)
  editing: LeagueAnnouncement | null   // null 이면 새 공지
  onClose: () => void
  onSaved: (a: LeagueAnnouncement) => void
}

const MAX_BODY = 20_000

export default function AnnouncementEditorModal({ leagueId, pin, editing, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(editing?.title ?? '')
  const [body, setBody] = useState(editing?.body_markdown ?? '')
  const [pinned, setPinned] = useState(editing?.pinned ?? false)
  const [createdBy, setCreatedBy] = useState(editing?.created_by ?? '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const textRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // 이미지 업로드 → 마크다운 삽입 (커서 위치)
  const insertAtCursor = useCallback((text: string) => {
    const ta = textRef.current
    if (!ta) { setBody(b => b + text); return }
    const start = ta.selectionStart
    const end = ta.selectionEnd
    setBody(b => b.slice(0, start) + text + b.slice(end))
    setTimeout(() => {
      ta.focus()
      const pos = start + text.length
      ta.setSelectionRange(pos, pos)
    }, 0)
  }, [])

  const uploadImage = useCallback(async (file: File) => {
    if (uploading) return
    setUploading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`/api/leagues/${leagueId}/announcements/upload-image`, {
        method: 'POST',
        headers: { 'X-League-Pin': pin },
        body: form,
      })
      const data = await res.json() as { url?: string; error?: string }
      if (!res.ok || !data.url) throw new Error(data.error ?? '업로드 실패')
      const md = `\n\n![스크린샷](${data.url})\n\n`
      insertAtCursor(md)
      toast.success('이미지 업로드됨')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '업로드 실패')
    } finally {
      setUploading(false)
    }
  }, [leagueId, pin, uploading, insertAtCursor])

  // 붙여넣기 · 드롭 · 파일 선택 공통
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData.items).filter(it => it.type.startsWith('image/'))
    if (items.length === 0) return
    e.preventDefault()
    for (const it of items) {
      const file = it.getAsFile()
      if (file) uploadImage(file)
    }
  }, [uploadImage])

  const handleDrop = useCallback((e: React.DragEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
    if (files.length === 0) return
    e.preventDefault()
    for (const f of files) uploadImage(f)
  }, [uploadImage])

  const handleFilePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) uploadImage(f)
    e.target.value = ''
  }, [uploadImage])

  const save = useCallback(async () => {
    if (saving) return
    if (!title.trim()) { toast.error('제목을 입력하세요'); return }
    if (body.length > MAX_BODY) { toast.error(`본문은 ${MAX_BODY.toLocaleString()}자 이하`); return }
    setSaving(true)
    try {
      const payload = {
        title: title.trim(),
        body_markdown: body,
        pinned,
        created_by: createdBy.trim() || null,
      }
      const isNew = !editing
      const url = isNew
        ? `/api/leagues/${leagueId}/announcements`
        : `/api/leagues/${leagueId}/announcements/${editing.id}`
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-League-Pin': pin },
        body: JSON.stringify(payload),
      })
      const data = await res.json() as { announcement?: LeagueAnnouncement; error?: string }
      if (!res.ok || !data.announcement) throw new Error(data.error ?? '저장 실패')
      toast.success(isNew ? '공지 발행됨' : '공지 수정됨')
      onSaved(data.announcement)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }, [saving, title, body, pinned, createdBy, editing, leagueId, pin, onSaved])

  const bodyOver = body.length > MAX_BODY

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-2 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={editing ? '공지 수정' : '새 공지 작성'}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-5xl h-[92vh] bg-[color:var(--mm-panel)] shadow-[0_24px_60px_-16px_rgba(0,0,0,0.5)] rounded-sm overflow-hidden flex flex-col"
        style={{ border: '1px solid var(--mm-yellow)', borderRadius: 6 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ background: 'var(--mm-yellow)', borderBottom: '1px solid var(--mm-black)' }}>
          <div className="inline-flex items-center gap-2 min-w-0">
            <Megaphone size={16} className="text-[color:var(--mm-black)]" aria-hidden />
            <span className="text-xs font-black uppercase tracking-[0.14em] text-[color:var(--mm-black)]">
              {editing ? '공지 수정' : '새 공지 작성'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded transition-colors hover:bg-black/10 cursor-pointer text-[color:var(--mm-black)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Meta 입력 */}
        <div className="px-4 py-3 space-y-2 border-b border-[color:var(--mm-rule)]" style={{ background: 'var(--mm-panel-alt)' }}>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="공지 제목 (예: 위닝샷 릴 + 베스트샷 핀 업데이트)"
            className="w-full min-h-[44px] px-3 py-2 text-base font-black bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--mm-yellow)]"
            style={{ color: 'var(--mm-ink)' }}
            maxLength={200}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="text"
              value={createdBy}
              onChange={e => setCreatedBy(e.target.value)}
              placeholder="작성자 (선택 · 예: 롭)"
              className="min-h-[36px] px-3 py-1.5 text-xs font-bold bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--mm-yellow)]"
              style={{ color: 'var(--mm-ink)', flex: '1 1 200px' }}
              maxLength={40}
            />
            <button
              type="button"
              onClick={() => setPinned(v => !v)}
              className="min-h-[36px] px-3 py-1.5 text-xs font-black uppercase tracking-[0.10em] rounded-sm cursor-pointer transition-colors inline-flex items-center gap-1.5"
              style={{
                background: pinned ? 'var(--mm-yellow)' : 'var(--mm-panel)',
                color: pinned ? 'var(--mm-black)' : 'var(--mm-ink-soft)',
                border: `1px solid ${pinned ? 'var(--mm-black)' : 'var(--mm-rule)'}`,
              }}
              aria-pressed={pinned}
              title={pinned ? '고정 해제' : '리스트 최상단 고정'}
            >
              {pinned ? <Pin size={12} aria-hidden /> : <PinOff size={12} aria-hidden />}
              {pinned ? '고정됨' : '고정 안 함'}
            </button>
          </div>
        </div>

        {/* Editor + Preview */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 overflow-hidden min-h-0">
          {/* Editor pane */}
          <div className="flex flex-col overflow-hidden min-h-0" style={{ borderRight: '1px solid var(--mm-rule)' }}>
            <div className="flex items-center justify-between gap-2 px-3 py-2" style={{ background: 'var(--mm-panel-alt)', borderBottom: '1px solid var(--mm-rule)' }}>
              <span className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>
                편집 (마크다운) · 이미지는 붙여넣기/드롭
              </span>
              <label
                className="min-h-[32px] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.10em] rounded-sm cursor-pointer transition-colors inline-flex items-center gap-1.5"
                style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)' }}
              >
                <ImageIcon size={12} aria-hidden />
                이미지 첨부
                <input type="file" accept="image/*" onChange={handleFilePick} className="hidden" />
              </label>
            </div>
            <textarea
              ref={textRef}
              value={body}
              onChange={e => setBody(e.target.value)}
              onPaste={handlePaste}
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              placeholder="## 이번 주 업데이트&#10;&#10;- 위닝샷 카드 클릭 → 하이라이트 릴 자동 재생&#10;- 내 베스트샷 최대 3개 핀 가능 (선수 하이라이트 페이지)&#10;&#10;스크린샷을 그대로 붙여넣기 하면 자동 업로드됩니다."
              className="flex-1 w-full px-4 py-3 text-sm bg-[color:var(--mm-panel)] resize-none focus:outline-none font-mono"
              style={{ color: 'var(--mm-ink)', lineHeight: 1.6, minHeight: 0 }}
              spellCheck={false}
            />
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-[10px] font-bold uppercase tracking-widest" style={{ background: 'var(--mm-panel-alt)', borderTop: '1px solid var(--mm-rule)', color: bodyOver ? '#DC2626' : 'var(--mm-muted)' }}>
              <span>{body.length.toLocaleString()} / {MAX_BODY.toLocaleString()}자</span>
              {uploading && <span className="inline-flex items-center gap-1.5"><BasketballLoader size={12} /> 이미지 업로드 중…</span>}
            </div>
          </div>

          {/* Preview pane */}
          <div className="overflow-y-auto p-4 sm:p-5" style={{ background: 'var(--mm-panel)' }}>
            <div className="text-[10px] font-black uppercase tracking-[0.14em] mb-2" style={{ color: 'var(--mm-muted)' }}>
              미리보기
            </div>
            <article className="announcement-prose">
              <h1>{title || '(제목)'}</h1>
              {body.trim() ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                    img: ({ src, alt }) => {
                      if (typeof src !== 'string') return null
                      return (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={src} alt={alt ?? ''} loading="lazy" className="max-w-full h-auto rounded-sm border border-[color:var(--mm-rule)] my-3" />
                      )
                    },
                  }}
                >
                  {body}
                </ReactMarkdown>
              ) : (
                <p style={{ color: 'var(--mm-muted)', fontStyle: 'italic' }}>본문을 입력하면 여기 미리보기가 표시됩니다.</p>
              )}
            </article>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3" style={{ borderTop: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 text-xs font-bold uppercase tracking-[0.10em] rounded-sm cursor-pointer transition-colors"
            style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}
          >
            취소
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || bodyOver || !title.trim()}
            className="min-h-[40px] px-4 py-2 text-xs font-black uppercase tracking-[0.14em] rounded-sm cursor-pointer transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
          >
            {saving ? <BasketballLoader size={12} className="text-[color:var(--mm-black)]" /> : <Save size={12} aria-hidden />}
            {editing ? '수정 저장' : '발행'}
          </button>
        </div>
      </div>
    </div>
  )
}
