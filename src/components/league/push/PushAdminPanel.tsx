'use client'
// 운영자용 푸시 알림 패널 (설정 페이지) — 편집 모드에서만.
// - 현재 구독자 수 표시
// - 빠른 알럿 발송(제목+내용) → 전체 구독자에게 즉시 푸시
// - 본인도 알림을 켤 수 있게 PushOptIn 재사용
import { useState, useEffect, useCallback } from 'react'
import { BellRing, Send, Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'
import PushOptIn from './PushOptIn'

interface Props {
  leagueId: string
  leagueHeaders: Record<string, string>
}

export default function PushAdminPanel({ leagueId, leagueHeaders }: Props) {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [count, setCount] = useState(0)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/leagues/${leagueId}/push`)
      const data = await res.json() as { configured?: boolean; count?: number }
      setConfigured(!!data.configured)
      setCount(data.count ?? 0)
    } catch {
      setConfigured(false)
    }
  }, [leagueId])

  useEffect(() => { refresh() }, [refresh])

  const send = useCallback(async () => {
    if (sending) return
    if (!title.trim()) { toast.error('알림 제목을 입력하세요'); return }
    if (count === 0 && !confirm('현재 알림을 켠 구독자가 없습니다. 그래도 발송을 시도할까요?')) return
    setSending(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...leagueHeaders },
        body: JSON.stringify({ title: title.trim(), body: message.trim() }),
      })
      const data = await res.json() as { sent?: number; total?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? '발송 실패')
      toast.success(`알림 발송 완료 · ${data.sent ?? 0}/${data.total ?? 0}명 전송`)
      setTitle(''); setMessage('')
      refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '발송 실패')
    } finally {
      setSending(false)
    }
  }, [sending, title, message, count, leagueId, leagueHeaders, refresh])

  if (configured === null) return null

  return (
    <div className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] p-5 space-y-3">
      <div className="flex items-center gap-2">
        <BellRing size={16} className="text-[color:var(--mm-ink)]" />
        <h3 className="font-bold text-lg text-[color:var(--mm-ink)]">푸시 알림 (공지 · 알럿)</h3>
      </div>

      {!configured ? (
        <div className="text-xs text-[color:var(--mm-muted)] leading-relaxed space-y-1">
          <p>푸시 알림이 아직 <b className="text-[color:var(--mm-ink)]">서버에 설정되지 않았습니다.</b></p>
          <p>배포 환경에 VAPID 키(환경변수)를 등록하면 활성화됩니다. (설치 안내는 개발자에게 문의)</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 text-xs text-[color:var(--mm-muted)]">
            <Users size={13} aria-hidden />
            <span>알림을 켠 구독자 <b className="text-[color:var(--mm-yellow-strong)] font-mono">{count}</b>명</span>
            <span className="ml-auto"><PushOptIn leagueId={leagueId} /></span>
          </div>

          <div className="space-y-2 pt-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[color:var(--mm-muted)]">빠른 알럿 발송</p>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="알림 제목 (예: 오늘 경기 취소)"
              maxLength={80}
              className="w-full min-h-[42px] px-3 py-2 text-sm font-bold bg-[color:var(--mm-panel-alt)] border border-[color:var(--mm-rule)] rounded-none focus:outline-none focus:ring-2 focus:ring-[color:var(--mm-yellow)]"
              style={{ color: 'var(--mm-ink)' }}
            />
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="알림 내용 (선택 · 최대 200자)"
              maxLength={200}
              rows={2}
              className="w-full px-3 py-2 text-sm bg-[color:var(--mm-panel-alt)] border border-[color:var(--mm-rule)] rounded-none focus:outline-none focus:ring-2 focus:ring-[color:var(--mm-yellow)] resize-none"
              style={{ color: 'var(--mm-ink)' }}
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || !title.trim()}
              className="w-full min-h-[42px] inline-flex items-center justify-center gap-1.5 bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)] hover:brightness-95 cursor-pointer font-black uppercase tracking-[0.14em] text-sm border border-[color:var(--mm-black)] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} aria-hidden />}
              전체 발송
            </button>
            <p className="text-[11px] text-[color:var(--mm-muted)] leading-relaxed">
              공지 작성 시 <b className="text-[color:var(--mm-ink)]">“발행하며 알림 보내기”</b>를 체크하면 공지도 함께 푸시됩니다.
            </p>
          </div>
        </>
      )}
    </div>
  )
}
