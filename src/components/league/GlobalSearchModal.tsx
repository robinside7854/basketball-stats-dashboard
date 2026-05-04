'use client'
import { useState, useEffect, useRef } from 'react'
import { Search, X, User, ChevronRight } from 'lucide-react'

interface SearchPlayer {
  id: string
  name: string
  position: string | null
  number: number | null
}

interface Props {
  leagueId: string
  onClose: () => void
  onSelectPlayer: (id: string, name: string) => void
}

export default function GlobalSearchModal({ leagueId, onClose, onSelectPlayer }: Props) {
  const [query, setQuery] = useState('')
  const [players, setPlayers] = useState<SearchPlayer[]>([])
  const [filtered, setFiltered] = useState<SearchPlayer[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/leagues/${leagueId}/players`)
      .then(r => r.json())
      .then((data: SearchPlayer[]) => setPlayers(data ?? []))
      .catch(() => setPlayers([]))
  }, [leagueId])

  useEffect(() => {
    if (!query.trim()) { setFiltered(players.slice(0, 8)); return }
    const q = query.toLowerCase()
    setFiltered(players.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.position ?? '').toLowerCase().includes(q) ||
      (p.number != null && String(p.number).includes(q))
    ).slice(0, 8))
    setActiveIdx(0)
  }, [query, players])

  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
      if (e.key === 'Enter' && filtered[activeIdx]) {
        onSelectPlayer(filtered[activeIdx].id, filtered[activeIdx].name)
        onClose()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [filtered, activeIdx, onClose, onSelectPlayer])

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl overflow-hidden z-10">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800">
          <Search size={16} className="text-gray-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="선수 이름, 포지션, 번호 검색..."
            className="flex-1 bg-transparent text-white placeholder-gray-600 text-sm outline-none"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-600 hover:text-gray-400 cursor-pointer" aria-label="검색어 지우기">
              <X size={14} />
            </button>
          )}
          <kbd className="hidden sm:inline text-[10px] text-gray-600 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5">ESC</kbd>
        </div>

        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-600">검색 결과가 없습니다</div>
          ) : (
            filtered.map((p, i) => (
              <button
                key={p.id}
                onClick={() => { onSelectPlayer(p.id, p.name); onClose() }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer ${
                  i === activeIdx ? 'bg-blue-600/20 text-white' : 'hover:bg-gray-800/60 text-gray-300'
                }`}
              >
                <div className="w-7 h-7 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center shrink-0">
                  <User size={13} className="text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white truncate">{p.name}</span>
                    {p.number != null && <span className="text-xs text-gray-600 font-mono">#{p.number}</span>}
                  </div>
                  {p.position && <p className="text-[11px] text-gray-500">{p.position}</p>}
                </div>
                <ChevronRight size={13} className="text-gray-600 shrink-0" />
              </button>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-800/60 flex items-center gap-3 text-[10px] text-gray-600">
          <span><kbd className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5">↑↓</kbd> 이동</span>
          <span><kbd className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5">Enter</kbd> 선택</span>
          <span><kbd className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5">ESC</kbd> 닫기</span>
        </div>
      </div>
    </div>
  )
}
