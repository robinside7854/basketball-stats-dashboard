'use client'
// 공지 댓글 · 리더 모달 하단에 삽입
// - 로그인 없음. 닉네임 자유 · 비번 4자리 (숫자)
// - 본인 수정/삭제: 비번 필요 · 어드민(리그 PIN): 비번 없이 삭제 가능
// - 삭제된 댓글은 마스킹되어 목록에 남음 (soft delete)
import { useEffect, useState, useCallback, useRef } from 'react'
import { MessageCircle, Send, Trash2, Edit2, Shield } from 'lucide-react'
import { toast } from 'sonner'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import type { AnnouncementComment } from '@/lib/announcements/types'

interface Props {
  leagueId: string
  announcementId: string
  isAdmin: boolean
  adminPin?: string   // 어드민 삭제 시 헤더로 전달
}

const NICK_KEY = 'league_ann_comment_nickname'   // 마지막 사용 닉네임 기억 (편의)

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const y = String(d.getFullYear()).slice(2)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${y}.${m}.${dd} ${hh}:${mi}`
}

export default function AnnouncementComments({ leagueId, announcementId, isAdmin, adminPin }: Props) {
  const [comments, setComments] = useState<AnnouncementComment[] | null>(null)
  const [loading, setLoading] = useState(true)

  // 새 댓글 폼
  const [nickname, setNickname] = useState('')
  const [body, setBody] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 편집 상태 (comment id → editing body / password)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [editPassword, setEditPassword] = useState('')

  const listEndRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setNickname(localStorage.getItem(NICK_KEY) ?? '')
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/announcements/${announcementId}/comments`)
      if (!res.ok) throw new Error('failed')
      const data = await res.json() as { comments?: AnnouncementComment[] }
      setComments(data.comments ?? [])
    } catch {
      toast.error('댓글을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }, [leagueId, announcementId])

  useEffect(() => { load() }, [load])

  const submit = useCallback(async () => {
    if (submitting) return
    if (!nickname.trim()) { toast.error('닉네임을 입력하세요'); return }
    if (!body.trim()) { toast.error('댓글을 입력하세요'); return }
    if (!/^\d{4}$/.test(password)) { toast.error('비밀번호는 숫자 4자리'); return }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/announcements/${announcementId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname: nickname.trim(), body: body.trim(), password }),
      })
      const data = await res.json() as { comment?: AnnouncementComment; error?: string }
      if (!res.ok || !data.comment) throw new Error(data.error ?? '실패')
      setComments(prev => [...(prev ?? []), data.comment!])
      setBody('')
      setPassword('')
      localStorage.setItem(NICK_KEY, nickname.trim())
      setTimeout(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '댓글 실패')
    } finally {
      setSubmitting(false)
    }
  }, [submitting, nickname, body, password, leagueId, announcementId])

  const startEdit = (c: AnnouncementComment) => {
    setEditingId(c.id)
    setEditBody(c.body)
    setEditPassword('')
  }
  const cancelEdit = () => { setEditingId(null); setEditBody(''); setEditPassword('') }

  const saveEdit = async (c: AnnouncementComment) => {
    if (!editBody.trim()) { toast.error('내용을 입력하세요'); return }
    if (!/^\d{4}$/.test(editPassword)) { toast.error('비밀번호 4자리'); return }
    try {
      const res = await fetch(`/api/leagues/${leagueId}/announcements/${announcementId}/comments/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: editBody.trim(), password: editPassword }),
      })
      const data = await res.json() as { comment?: AnnouncementComment; error?: string }
      if (!res.ok || !data.comment) throw new Error(data.error ?? '실패')
      setComments(prev => (prev ?? []).map(x => x.id === c.id ? data.comment! : x))
      cancelEdit()
      toast.success('수정됨')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '수정 실패')
    }
  }

  const del = async (c: AnnouncementComment) => {
    if (isAdmin) {
      if (!confirm(`"${c.nickname}"의 댓글을 어드민 권한으로 삭제할까요?`)) return
      try {
        const res = await fetch(`/api/leagues/${leagueId}/announcements/${announcementId}/comments/${c.id}`, {
          method: 'DELETE',
          headers: { 'X-League-Pin': adminPin ?? '', 'Content-Type': 'application/json' },
        })
        if (!res.ok) throw new Error((await res.json()).error ?? '실패')
        setComments(prev => (prev ?? []).map(x => x.id === c.id ? { ...x, deleted_at: new Date().toISOString(), deleted_by_admin: true, nickname: '(관리자에 의해 삭제)', body: '이 댓글은 관리자에 의해 삭제되었습니다.' } : x))
        toast.success('삭제됨')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : '삭제 실패')
      }
      return
    }
    // 일반 사용자: 비번 프롬프트
    const pw = window.prompt('댓글 비밀번호 4자리를 입력하세요')
    if (!pw) return
    if (!/^\d{4}$/.test(pw)) { toast.error('숫자 4자리'); return }
    try {
      const res = await fetch(`/api/leagues/${leagueId}/announcements/${announcementId}/comments/${c.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? '실패')
      setComments(prev => (prev ?? []).map(x => x.id === c.id ? { ...x, deleted_at: new Date().toISOString(), deleted_by_admin: false, nickname: '(삭제됨)', body: '삭제된 댓글입니다.' } : x))
      toast.success('삭제됨')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    }
  }

  const active = (comments ?? []).filter(c => !c.deleted_at).length
  const total = comments?.length ?? 0

  return (
    <div className="px-5 sm:px-6 py-5" style={{ borderTop: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}>
      <div className="flex items-center gap-2 mb-3">
        <MessageCircle size={14} className="text-[color:var(--mm-yellow-strong)]" aria-hidden />
        <h3 className="text-xs font-black uppercase tracking-[0.14em]" style={{ color: 'var(--mm-ink)' }}>
          댓글 {total > 0 ? `${active}${total !== active ? ` / ${total}` : ''}` : ''}
        </h3>
      </div>

      {/* 댓글 목록 */}
      {loading ? (
        <div className="py-4 flex justify-center"><BasketballLoader size={18} /></div>
      ) : (comments && comments.length > 0) ? (
        <ul className="space-y-2 mb-4">
          {comments.map(c => {
            const isDeleted = !!c.deleted_at
            const isEditing = editingId === c.id
            return (
              <li
                key={c.id}
                className="px-3 py-2.5 rounded-sm"
                style={{
                  background: isDeleted ? 'var(--mm-panel)' : 'var(--mm-panel)',
                  border: '1px solid var(--mm-rule)',
                  opacity: isDeleted ? 0.6 : 1,
                }}
              >
                <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                  <div className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="text-xs font-black" style={{ color: isDeleted ? 'var(--mm-muted)' : 'var(--mm-ink)' }}>
                      {c.nickname}
                    </span>
                    {c.deleted_by_admin && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1 py-0.5 rounded-sm"
                        style={{ background: '#DC2626', color: 'white' }}>
                        <Shield size={9} aria-hidden /> 관리자
                      </span>
                    )}
                    <span className="text-[10px]" style={{ color: 'var(--mm-muted)' }}>
                      {formatDateTime(c.created_at)}
                      {c.updated_at !== c.created_at && !isDeleted && ' · 수정됨'}
                    </span>
                  </div>
                  {!isDeleted && !isEditing && (
                    <div className="inline-flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        title="수정"
                        aria-label={`${c.nickname} 댓글 수정`}
                        className="min-w-[32px] min-h-[32px] inline-flex items-center justify-center rounded-sm cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)]"
                        style={{ color: 'var(--mm-muted)' }}
                      >
                        <Edit2 size={12} aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => del(c)}
                        title={isAdmin ? '어드민 삭제' : '삭제 (비번 필요)'}
                        aria-label={`${c.nickname} 댓글 삭제`}
                        className="min-w-[32px] min-h-[32px] inline-flex items-center justify-center rounded-sm cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)]"
                        style={{ color: '#DC2626' }}
                      >
                        <Trash2 size={12} aria-hidden />
                      </button>
                    </div>
                  )}
                </div>

                {isEditing ? (
                  <div className="space-y-2 mt-1">
                    <textarea
                      value={editBody}
                      onChange={e => setEditBody(e.target.value)}
                      maxLength={500}
                      rows={2}
                      className="w-full px-2.5 py-1.5 text-sm bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--mm-yellow)]"
                      style={{ color: 'var(--mm-ink)' }}
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="password"
                        inputMode="numeric"
                        pattern="\d{4}"
                        maxLength={4}
                        value={editPassword}
                        onChange={e => setEditPassword(e.target.value.replace(/\D/g, ''))}
                        placeholder="비번 4자리"
                        className="min-h-[36px] w-28 px-2 py-1 text-xs bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--mm-yellow)]"
                        style={{ color: 'var(--mm-ink)' }}
                      />
                      <button
                        type="button"
                        onClick={() => saveEdit(c)}
                        className="min-h-[36px] px-3 text-[11px] font-black uppercase tracking-[0.10em] rounded-sm cursor-pointer"
                        style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
                      >
                        저장
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="min-h-[36px] px-3 text-[11px] font-bold uppercase tracking-[0.10em] rounded-sm cursor-pointer"
                        style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}
                      >
                        취소
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap break-words" style={{ color: isDeleted ? 'var(--mm-muted)' : 'var(--mm-ink)', lineHeight: 1.5, fontStyle: isDeleted ? 'italic' : 'normal' }}>
                    {c.body}
                  </p>
                )}
              </li>
            )
          })}
          <div ref={listEndRef} />
        </ul>
      ) : (
        <p className="text-xs text-center py-4" style={{ color: 'var(--mm-muted)' }}>첫 댓글을 남겨보세요!</p>
      )}

      {/* 새 댓글 작성 */}
      <div className="rounded-sm p-3 space-y-2" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            value={nickname}
            onChange={e => setNickname(e.target.value.slice(0, 20))}
            placeholder="닉네임"
            className="min-h-[36px] px-2.5 py-1 text-xs font-bold bg-[color:var(--mm-panel-alt)] border border-[color:var(--mm-rule)] rounded-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--mm-yellow)]"
            style={{ color: 'var(--mm-ink)', flex: '1 1 140px' }}
          />
          <input
            type="password"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            value={password}
            onChange={e => setPassword(e.target.value.replace(/\D/g, ''))}
            placeholder="비번 4자리"
            className="min-h-[36px] w-28 px-2 py-1 text-xs bg-[color:var(--mm-panel-alt)] border border-[color:var(--mm-rule)] rounded-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--mm-yellow)]"
            style={{ color: 'var(--mm-ink)' }}
            title="수정/삭제 시 필요합니다"
          />
        </div>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value.slice(0, 500))}
          placeholder="댓글을 입력하세요"
          rows={2}
          className="w-full px-2.5 py-1.5 text-sm bg-[color:var(--mm-panel-alt)] border border-[color:var(--mm-rule)] rounded-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--mm-yellow)] resize-none"
          style={{ color: 'var(--mm-ink)', lineHeight: 1.5 }}
        />
        <div className="flex items-center justify-between">
          <span className="text-[10px]" style={{ color: 'var(--mm-muted)' }}>
            {body.length}/500 · 비번은 수정/삭제 시 필요
          </span>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="min-h-[36px] px-3 py-1.5 text-xs font-black uppercase tracking-[0.10em] rounded-sm cursor-pointer transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
            style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)' }}
          >
            {submitting ? <BasketballLoader size={12} className="text-[color:var(--mm-black)]" /> : <Send size={12} aria-hidden />}
            등록
          </button>
        </div>
      </div>
    </div>
  )
}
