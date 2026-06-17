'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Send, MessageCircle, ShieldCheck } from 'lucide-react'

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
}

const POLL_MS = 2500

export default function DraftChat({ leagueId, draftId, authedCode, teams }: Props) {
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const lastTsRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))

  const fetchMsgs = useCallback(async () => {
    const url = `/api/leagues/${leagueId}/drafts/${draftId}/chat${lastTsRef.current ? `?after=${encodeURIComponent(lastTsRef.current)}` : ''}`
    const res = await fetch(url, { headers: { 'X-Draft-Code': authedCode } })
    if (!res.ok) return
    const data = await res.json() as ChatMsg[]
    if (Array.isArray(data) && data.length > 0) {
      lastTsRef.current = data[data.length - 1].created_at
      setMsgs(prev => {
        const seen = new Set(prev.map(m => m.id))
        const merged = [...prev, ...data.filter(m => !seen.has(m.id))]
        return merged
      })
    }
  }, [leagueId, draftId, authedCode])

  useEffect(() => {
    fetchMsgs()
    const t = setInterval(fetchMsgs, POLL_MS)
    return () => clearInterval(t)
  }, [fetchMsgs])

  // 새 메시지 시 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [msgs])

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
        fetchMsgs()
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl flex flex-col h-[420px]">
      <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-2">
        <MessageCircle size={14} className="text-blue-400" />
        <p className="text-xs font-bold text-gray-300 uppercase tracking-widest">드래프트 채팅</p>
        <span className="text-[10px] text-gray-600 ml-auto">단장 · 감독관 전용</span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2">
        {msgs.length === 0 ? (
          <p className="text-center text-xs text-gray-600 py-8">아직 메시지가 없습니다. 첫 메시지를 남겨보세요!</p>
        ) : msgs.map(m => {
          const team = m.team_id ? teamMap[m.team_id] : null
          const isSup = m.sender_role === 'supervisor'
          return (
            <div key={m.id} className="text-sm">
              <div className="flex items-center gap-1.5 mb-0.5">
                {isSup ? (
                  <ShieldCheck size={11} className="text-amber-400" />
                ) : (
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: team?.color ?? '#888' }} />
                )}
                <span className={`text-[11px] font-bold ${isSup ? 'text-amber-300' : 'text-gray-300'}`}>
                  {isSup ? '감독관' : team?.name ?? ''} · {m.sender_label}
                </span>
                <span className="text-[9px] text-gray-600">
                  {new Date(m.created_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-gray-100 break-words pl-3.5">{m.message}</p>
            </div>
          )
        })}
      </div>

      <div className="p-2.5 border-t border-gray-800 flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder="메시지 입력..."
          maxLength={500}
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-blue-600"
        />
        <button onClick={send} disabled={sending || !input.trim()}
          className="px-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white cursor-pointer flex items-center">
          <Send size={15} />
        </button>
      </div>
    </div>
  )
}
