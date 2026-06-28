'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, MessageCircle, ShieldCheck, X, AlertTriangle } from 'lucide-react'

interface Team { id: string; name: string; color: string }
interface ChatMsg {
  id: string
  sender_role: 'manager' | 'supervisor'
  team_id: string | null
  sender_label: string
  message: string
  created_at: string
}

interface Props {
  leagueId: string
  draftId: string
  authedCode: string
  teams: Team[]
  /** 본인 식별 (내 메시지 강조용) */
  authedRole: 'manager' | 'supervisor' | null
  authedTeamId: string | null
  authedLabel: string | null
}

const POLL_MS = 2500

export default function DraftChat({ leagueId, draftId, authedCode, teams, authedRole, authedTeamId, authedLabel }: Props) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [open, setOpen] = useState(false)
  const [unread, setUnread] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const lastTsRef = useRef<string | null>(null)
  const openRef = useRef(open)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))
  openRef.current = open

  const fetchMsgs = useCallback(async () => {
    const url = `/api/leagues/${leagueId}/drafts/${draftId}/chat${lastTsRef.current ? `?after=${encodeURIComponent(lastTsRef.current)}` : ''}`
    try {
      const res = await fetch(url, { headers: { 'X-Draft-Code': authedCode } })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(/relation|table|does not exist|schema cache/i.test(d.error ?? '')
          ? '채팅 테이블이 아직 없습니다 — 051_draft_chat.sql 마이그레이션을 적용하세요.'
          : (d.error ?? '채팅을 불러오지 못했습니다'))
        return
      }
      setError(null)
      const data = await res.json() as ChatMsg[]
      if (Array.isArray(data) && data.length > 0) {
        lastTsRef.current = data[data.length - 1].created_at
        setMsgs(prev => {
          const seen = new Set(prev.map(m => m.id))
          const added = data.filter(m => !seen.has(m.id))
          if (added.length > 0 && !openRef.current) setUnread(u => u + added.length)
          return [...prev, ...added]
        })
      }
    } catch {
      setError('네트워크 오류로 채팅을 불러오지 못했습니다')
    }
  }, [leagueId, draftId, authedCode])

  useEffect(() => {
    fetchMsgs()
    const t = setInterval(fetchMsgs, POLL_MS)
    return () => clearInterval(t)
  }, [fetchMsgs])

  useEffect(() => {
    if (open && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [msgs, open])

  useEffect(() => { if (open) setUnread(0) }, [open])

  async function send() {
    const message = input.trim()
    if (!message || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/drafts/${draftId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Draft-Code': authedCode },
        body: JSON.stringify({ message }),
      })
      if (res.ok) {
        setInput('')
        setError(null)
        fetchMsgs()
      } else {
        const d = await res.json().catch(() => ({}))
        setError(/relation|table|does not exist|schema cache/i.test(d.error ?? '')
          ? '채팅 테이블이 아직 없습니다 — 051_draft_chat.sql 마이그레이션을 적용하세요.'
          : (d.error ?? '전송 실패'))
      }
    } catch {
      setError('네트워크 오류로 전송하지 못했습니다')
    } finally {
      setSending(false)
    }
  }

  function isMine(m: ChatMsg) {
    if (m.sender_role !== authedRole || m.sender_label !== authedLabel) return false
    return m.sender_role === 'supervisor' || m.team_id === authedTeamId
  }

  // 접힌 상태 — 우하단 작은 플로팅 버튼 (PC), 우하단 모바일에서도 작게
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `채팅 (읽지 않은 메시지 ${unread}건)` : '채팅 열기'}
        className="fixed bottom-4 right-4 lg:bottom-4 z-40 flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] min-w-[44px] rounded-full bg-blue-600 hover:bg-blue-500 text-white shadow-2xl cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        style={{ bottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <MessageCircle size={16} />
        <span className="text-sm font-bold hidden sm:inline">채팅</span>
        {unread > 0 && (
          <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center justify-center">{unread > 99 ? '99+' : unread}</span>
        )}
      </button>
    )
  }

  // 열린 상태 —
  //   PC: 우측 sticky 사이드 패널 (340px), 본문 가리지 않음
  //   모바일: 우측에서 슬라이드 인 (88vw, 닫으면 본문 보임)
  return (
    <div className="fixed top-0 right-0 z-40 h-screen w-[88vw] sm:w-[340px] flex flex-col bg-gray-900 border-l border-gray-700 shadow-2xl animate-slideInRight">
      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slideInRight { animation: slideInRight 0.22s ease-out; }
      `}</style>
      <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-2">
        <MessageCircle size={15} className="text-blue-400" />
        <p className="text-xs font-bold text-gray-200 uppercase tracking-widest">드래프트 채팅</p>
        <span className="text-[11px] text-gray-400">단장·감독관</span>
        <button onClick={() => setOpen(false)} aria-label="채팅 닫기" className="ml-auto p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded text-gray-300 hover:text-white hover:bg-gray-800 cursor-pointer transition-colors duration-200"><X size={16} /></button>
      </div>

      {error && (
        <div className="px-3 py-2 bg-amber-950/40 border-b border-amber-800/40 flex items-start gap-1.5">
          <AlertTriangle size={13} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-200 leading-relaxed">{error}</p>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {msgs.length === 0 && !error ? (
          <p className="text-center text-sm text-gray-300 py-8">아직 메시지가 없습니다. 첫 메시지를 남겨보세요!</p>
        ) : msgs.map(m => {
          const team = m.team_id ? teamMap[m.team_id] : null
          const isSup = m.sender_role === 'supervisor'
          const color = isSup ? '#f59e0b' : (team?.color ?? '#9ca3af')
          const mine = isMine(m)
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                {isSup ? <ShieldCheck size={11} style={{ color }} /> : <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: color }} />}
                <span className="text-[11px] font-bold" style={{ color }}>
                  {isSup ? '감독관' : team?.name ?? ''} · {m.sender_label}
                </span>
                <span className="text-[10px] text-gray-400">{new Date(m.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className={`max-w-[85%] px-3 py-1.5 rounded-2xl text-sm break-words ${mine ? 'rounded-tr-sm text-white' : 'rounded-tl-sm bg-gray-800 text-gray-100'}`}
                style={mine ? { backgroundColor: color + '33', border: `1px solid ${color}66` } : undefined}>
                {m.message}
              </div>
            </div>
          )
        })}
      </div>

      <div className="p-2.5 border-t border-gray-800 flex gap-2" style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="메시지 입력..."
          maxLength={500}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 min-h-[44px] text-base sm:text-sm text-white placeholder:text-gray-500 focus:outline-none focus:border-blue-500"
        />
        <button onClick={send} disabled={sending || !input.trim()} aria-label="메시지 전송"
          className="px-4 min-w-[44px] min-h-[44px] rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white cursor-pointer flex items-center justify-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300">
          <Send size={16} />
        </button>
      </div>
    </div>
  )
}
