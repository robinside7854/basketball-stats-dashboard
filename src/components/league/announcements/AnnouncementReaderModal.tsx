'use client'
// 공지 읽기 모달 — 마크다운 렌더 (react-markdown + gfm)
// 편집 PIN 이 있을 때 하단에 '수정/삭제' 버튼 노출 (본 모달은 열람 전용, 클릭 시 콜백)
import { useEffect } from 'react'
import { X, Megaphone, Pencil, Trash2 } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import type { LeagueAnnouncement } from '@/lib/announcements/types'

interface Props {
  announcement: LeagueAnnouncement
  canEdit: boolean         // 편집 PIN 통과된 사용자에게만 true
  onClose: () => void
  onEdit?: () => void
  onDelete?: () => void
}

function formatKoreanDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}.${mm}.${dd} (${days[d.getDay()]}) ${hh}:${mi}`
}

export default function AnnouncementReaderModal({ announcement, canEdit, onClose, onEdit, onDelete }: Props) {
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

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label="공지 상세"
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-2xl max-h-[85vh] bg-[color:var(--mm-panel)] shadow-[0_24px_60px_-16px_rgba(0,0,0,0.5)] rounded-sm overflow-hidden flex flex-col"
        style={{ border: '1px solid var(--mm-yellow)', borderRadius: 6 }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-3.5" style={{ background: 'var(--mm-yellow)', borderBottom: '1px solid var(--mm-black)' }}>
          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1.5 mb-1">
              <Megaphone size={14} className="text-[color:var(--mm-black)]" aria-hidden />
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[color:var(--mm-black)]">공지</span>
              {announcement.pinned && (
                <span className="text-[10px] font-black uppercase tracking-[0.14em] px-1.5 py-0.5 bg-[color:var(--mm-black)] text-[color:var(--mm-yellow)] rounded-sm">
                  고정
                </span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-black leading-tight text-[color:var(--mm-black)] break-keep" id="announcement-title">
              {announcement.title}
            </h2>
            <p className="text-[11px] text-[color:var(--mm-black)]/70 mt-1">
              {formatKoreanDate(announcement.published_at)}
              {announcement.created_by ? ` · ${announcement.created_by}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded transition-colors hover:bg-black/10 cursor-pointer shrink-0 text-[color:var(--mm-black)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body — markdown */}
        <div className="overflow-y-auto flex-1 px-5 sm:px-6 py-5">
          {announcement.body_markdown.trim() === '' ? (
            <p className="text-sm text-[color:var(--mm-muted)] italic">본문이 비어 있습니다.</p>
          ) : (
            <article className="announcement-prose">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
                  img: ({ src, alt }) => {
                    if (typeof src !== 'string') return null
                    // next/image 는 리모트 도메인 화이트리스트 필요 → 안전한 기본 <img> 사용
                    return (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={src} alt={alt ?? ''} loading="lazy" className="max-w-full h-auto rounded-sm border border-[color:var(--mm-rule)] my-3" />
                    )
                  },
                }}
              >
                {announcement.body_markdown}
              </ReactMarkdown>
            </article>
          )}
        </div>

        {/* Footer — 편집자용 액션 */}
        {canEdit && (
          <div className="flex items-center justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}>
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="min-h-[36px] px-3 py-1.5 text-xs font-bold uppercase tracking-[0.10em] rounded-sm cursor-pointer transition-colors inline-flex items-center gap-1.5"
                style={{ background: 'var(--mm-panel)', color: '#DC2626', border: '1px solid var(--mm-rule)' }}
              >
                <Trash2 size={12} aria-hidden /> 삭제
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="min-h-[36px] px-3 py-1.5 text-xs font-black uppercase tracking-[0.10em] rounded-sm cursor-pointer transition-colors inline-flex items-center gap-1.5"
                style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
              >
                <Pencil size={12} aria-hidden /> 수정
              </button>
            )}
          </div>
        )}
      </div>

    </div>
  )
}
