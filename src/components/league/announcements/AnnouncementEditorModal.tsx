'use client'
// 공지 생성/수정 모달 · TipTap WYSIWYG (실제 서식 그대로 보이는 편집기)
// - UNDO/REDO 내장 (Ctrl+Z / Ctrl+Shift+Z + 툴바)
// - 색상/밑줄/취소선/형광펜/헤딩/리스트/인용/코드/링크/구분선
// - 이미지: 붙여넣기/드롭/버튼 → Supabase Storage 자동 업로드
// - 내부 페이지 링크 픽커 (라커룸/스탯 등 유저 접근 가능한 모든 페이지)
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { X, Megaphone, Save, Pin, PinOff, Bell, BellOff } from 'lucide-react'
import { toast } from 'sonner'
import { looksLikeBlockMarkdown, markdownToHtml, repairFlattenedMarkdown } from '@/lib/announcements/markdown'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import RichEditor from './RichEditor'
import type { LeagueAnnouncement } from '@/lib/announcements/types'

// 편집기 초기 HTML 준비 · 세 케이스 처리
//   1) 이미 정상 HTML (다양한 태그 · 리치 컨텐츠) → 그대로
//   2) raw 마크다운 (`##`, `**` 등으로 시작) → marked 로 HTML 변환
//   3) 손상된 상태 (`<p>literal markdown</p>` · TipTap 이 마크다운을 삼킴)
//      → <p> 껍질 제거 후 마크다운으로 재파싱 (자기 복구)
// 문제 배경: TipTap 은 마크다운 문법을 이해 못 함. raw 마크다운을 initialHtml 로 주면
//          <p>## 홈</p> 처럼 리터럴로 감싸버리고 저장 → 리더에 마크다운 문법이 그대로 노출됨.
function bodyToEditorHtml(content: string): string {
  if (!content) return ''
  const trimmed = content.trim()
  if (!trimmed) return ''

  if (trimmed.startsWith('<')) {
    // 문단 태그를 걷어낸 본문에 블록 마크다운(`##`·`- `·`---`)이 남아 있으면 손상된 상태.
    //   · 예전엔 <strong> 같은 인라인 태그가 하나라도 있으면 "정상 HTML" 로 오판했다.
    //     TipTap 은 붙여넣기 때 인라인 규칙만 처리하므로, <strong> 이 섞여 있어도
    //     헤딩·리스트는 리터럴로 남는다 → 인라인 태그 유무로 판정하면 안 된다.
    //   · 실제 블록 태그(h1~h6/ul/ol/li/blockquote/hr/pre/table)가 있으면 정상 HTML.
    const asText = trimmed
      .replace(/<\/?p[^>]*>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
    const hasBlockTag = /<(h[1-6]|ul|ol|li|blockquote|hr|pre|table)\b/i.test(trimmed)

    if (!hasBlockTag && looksLikeBlockMarkdown(asText)) {
      return repairFlattenedMarkdown(trimmed)
    }
    return content  // 정상 HTML
  }

  // raw 마크다운
  return markdownToHtml(content)
}

interface Props {
  leagueId: string
  pin: string
  editing: LeagueAnnouncement | null
  onClose: () => void
  onSaved: (a: LeagueAnnouncement) => void
}

const MAX_BODY = 30_000   // HTML 은 마크업 오버헤드가 있어 마크다운 20k → HTML 30k 로 상향

export default function AnnouncementEditorModal({ leagueId, pin, editing, onClose, onSaved }: Props) {
  const params = useParams<{ orgSlug?: string }>()
  const orgSlug = params?.orgSlug
  const leagueBase = orgSlug ? `/league/${orgSlug}/${leagueId}` : undefined

  const [title, setTitle] = useState(editing?.title ?? '')
  // 마운트 시 1회 · 마크다운 컨텐츠는 HTML 로 변환해서 편집기에 로드
  const [body, setBody] = useState(() => bodyToEditorHtml(editing?.body_markdown ?? ''))
  const [pinned, setPinned] = useState(editing?.pinned ?? false)
  const [createdBy, setCreatedBy] = useState(editing?.created_by ?? '')
  const [saving, setSaving] = useState(false)
  // 신규 발행 시에만 푸시 알림 옵션 (기본 켜짐) · 수정에는 재발송 안 함
  const [notify, setNotify] = useState(!editing)
  const [pushConfigured, setPushConfigured] = useState(false)

  // 서버에 푸시가 설정돼 있을 때만 알림 체크박스 노출
  useEffect(() => {
    let alive = true
    fetch(`/api/leagues/${leagueId}/push`)
      .then(r => r.json())
      .then((d: { configured?: boolean }) => { if (alive) setPushConfigured(!!d.configured) })
      .catch(() => {})
    return () => { alive = false }
  }, [leagueId])

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

  // 이미지 업로드 → URL 반환 (RichEditor 가 삽입)
  const uploadImage = useCallback(async (file: File): Promise<string | null> => {
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
      toast.success('이미지 업로드됨')
      return data.url
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '업로드 실패')
      return null
    }
  }, [leagueId, pin])

  const save = useCallback(async () => {
    if (saving) return
    if (!title.trim()) { toast.error('제목을 입력하세요'); return }
    // 빈 문서 감지: TipTap 은 빈 상태에서도 <p></p> 반환 → 순수 텍스트 유무로 체크
    const textOnly = body.replace(/<[^>]*>/g, '').trim()
    if (body.length > MAX_BODY) { toast.error(`본문은 ${MAX_BODY.toLocaleString()}자 이하`); return }
    setSaving(true)
    try {
      const isNew = !editing
      const payload = {
        title: title.trim(),
        body_markdown: textOnly ? body : '',   // 실질 컨텐츠 없으면 빈 문자열로 저장
        pinned,
        created_by: createdBy.trim() || null,
        // 신규 발행 + 옵션 켜짐일 때만 서버가 전체 푸시 발송
        ...(isNew ? { notify: notify && pushConfigured } : {}),
      }
      const url = isNew
        ? `/api/leagues/${leagueId}/announcements`
        : `/api/leagues/${leagueId}/announcements/${editing.id}`
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-League-Pin': pin },
        body: JSON.stringify(payload),
      })
      const data = await res.json() as { announcement?: LeagueAnnouncement; error?: string; push?: { sent: number; total: number } | null }
      if (!res.ok || !data.announcement) throw new Error(data.error ?? '저장 실패')
      if (isNew && data.push) {
        toast.success(`공지 발행됨 · 알림 ${data.push.sent}/${data.push.total}명 전송`)
      } else {
        toast.success(isNew ? '공지 발행됨' : '공지 수정됨')
      }
      onSaved(data.announcement)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }, [saving, title, body, pinned, createdBy, notify, pushConfigured, editing, leagueId, pin, onSaved])

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
        className="relative z-10 w-full max-w-4xl h-[92vh] bg-[color:var(--mm-panel)] shadow-[0_24px_60px_-16px_rgba(0,0,0,0.5)] rounded-sm overflow-hidden flex flex-col"
        style={{ border: '1px solid var(--mm-yellow)', borderRadius: 6 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0" style={{ background: 'var(--mm-yellow)', borderBottom: '1px solid var(--mm-black)' }}>
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
        <div className="px-4 py-3 space-y-2 border-b border-[color:var(--mm-rule)] shrink-0" style={{ background: 'var(--mm-panel-alt)' }}>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="공지 제목"
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
            {/* 신규 발행 + 서버 푸시 설정된 경우에만 알림 발송 토글 노출 */}
            {!editing && pushConfigured && (
              <button
                type="button"
                onClick={() => setNotify(v => !v)}
                className="min-h-[36px] px-3 py-1.5 text-xs font-black uppercase tracking-[0.10em] rounded-sm cursor-pointer transition-colors inline-flex items-center gap-1.5"
                style={{
                  background: notify ? 'var(--mm-yellow)' : 'var(--mm-panel)',
                  color: notify ? 'var(--mm-black)' : 'var(--mm-ink-soft)',
                  border: `1px solid ${notify ? 'var(--mm-black)' : 'var(--mm-rule)'}`,
                }}
                aria-pressed={notify}
                title={notify ? '발행 시 전체에게 푸시 알림 발송' : '알림 없이 발행'}
              >
                {notify ? <Bell size={12} aria-hidden /> : <BellOff size={12} aria-hidden />}
                {notify ? '알림 보내기' : '알림 끄기'}
              </button>
            )}
          </div>
        </div>

        {/* WYSIWYG 에디터 */}
        <RichEditor
          initialHtml={body}
          onChange={setBody}
          onPasteImage={uploadImage}
          leagueBase={leagueBase}
          placeholder="여기에 공지 내용을 작성하세요. 툴바로 서식 지정, Ctrl+Z 로 실행 취소, 스크린샷은 붙여넣기하면 자동 업로드됩니다."
        />

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 shrink-0" style={{ borderTop: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: bodyOver ? '#DC2626' : 'var(--mm-muted)' }}>
            {body.length.toLocaleString()} / {MAX_BODY.toLocaleString()}자
          </span>
          <div className="flex items-center gap-2">
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
    </div>
  )
}
