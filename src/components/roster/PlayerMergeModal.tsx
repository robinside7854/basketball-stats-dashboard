'use client'
import { useState } from 'react'
import { X, ArrowRight, AlertTriangle, Search } from 'lucide-react'
import { toast } from 'sonner'
import type { Player } from '@/types/database'

interface Props {
  players: Player[]
  onClose: () => void
  onMerged: () => void
}

function PlayerPicker({
  label,
  players,
  selected,
  exclude,
  onSelect,
}: {
  label: string
  players: Player[]
  selected: Player | null
  exclude: string | null
  onSelect: (p: Player) => void
}) {
  const [query, setQuery] = useState('')
  const filtered = players.filter(p =>
    p.id !== exclude &&
    (p.name?.includes(query) || String(p.number).includes(query))
  )

  return (
    <div className="flex-1 min-w-0">
      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">{label}</p>

      {selected ? (
        <div className="rounded-xl border border-blue-500/50 bg-blue-950/30 p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-300 font-bold text-sm shrink-0">
            {selected.number}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-white truncate">{selected.name}</p>
            <p className="text-xs text-gray-400">#{selected.number} · {selected.position ?? '포지션 없음'}</p>
          </div>
          <button
            onClick={() => onSelect(null as unknown as Player)}
            className="ml-auto text-gray-500 hover:text-white shrink-0 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-700 bg-gray-900 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
            <Search size={13} className="text-gray-500 shrink-0" />
            <input
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"
              placeholder="이름 또는 번호 검색"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <ul className="max-h-44 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-xs text-gray-500">검색 결과 없음</li>
            ) : filtered.map(p => (
              <li key={p.id}>
                <button
                  onClick={() => onSelect(p)}
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-800 flex items-center gap-3 transition-colors cursor-pointer"
                >
                  <span className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-200 shrink-0">
                    {p.number}
                  </span>
                  <span className="text-sm text-white">{p.name}</span>
                  {p.position && <span className="ml-auto text-xs text-gray-500">{p.position}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export default function PlayerMergeModal({ players, onClose, onMerged }: Props) {
  const [keepPlayer, setKeepPlayer] = useState<Player | null>(null)
  const [mergePlayer, setMergePlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleMerge() {
    if (!keepPlayer || !mergePlayer) return
    if (!confirm(`#${mergePlayer.number} ${mergePlayer.name}의 모든 기록을 #${keepPlayer.number} ${keepPlayer.name}에게 통합합니다.\n이 작업은 되돌릴 수 없습니다.`)) return

    setLoading(true)
    const res = await fetch('/api/players/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepId: keepPlayer.id, mergeId: mergePlayer.id }),
    })
    setLoading(false)

    if (res.ok) {
      toast.success(`통합 완료 — ${mergePlayer.name}의 기록이 ${keepPlayer.name}에게 이전되었습니다`)
      onMerged()
      onClose()
    } else {
      const data = await res.json()
      toast.error(`통합 실패: ${data.error}`)
    }
  }

  const canMerge = !!keepPlayer && !!mergePlayer

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 w-full max-w-lg bg-gray-950 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-base font-bold text-white">선수 데이터 통합</h2>
            <p className="text-xs text-gray-500 mt-0.5">중복 등록된 선수의 기록을 하나로 합칩니다</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* 선수 선택 */}
        <div className="p-5">
          <div className="flex items-start gap-3">
            <PlayerPicker
              label="통합될 선수 (삭제)"
              players={players}
              selected={mergePlayer}
              exclude={keepPlayer?.id ?? null}
              onSelect={p => setMergePlayer(p?.id ? p : null)}
            />

            <div className="flex flex-col items-center justify-center pt-7 shrink-0">
              <ArrowRight size={20} className="text-gray-600" />
            </div>

            <PlayerPicker
              label="유지할 선수 (기준)"
              players={players}
              selected={keepPlayer}
              exclude={mergePlayer?.id ?? null}
              onSelect={p => setKeepPlayer(p?.id ? p : null)}
            />
          </div>

          {/* 경고 */}
          <div className="mt-4 flex items-start gap-2.5 bg-yellow-950/40 border border-yellow-700/40 rounded-xl px-4 py-3">
            <AlertTriangle size={15} className="text-yellow-500 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-300/80 leading-relaxed">
              <strong>통합될 선수</strong>의 모든 경기 이벤트·출전 기록이 <strong>유지할 선수</strong>에게 이전됩니다.
              통합된 선수는 비활성화되며 목록에서 사라집니다.
            </p>
          </div>
        </div>

        {/* 확인 버튼 */}
        <div className="px-5 pb-5">
          <button
            onClick={handleMerge}
            disabled={!canMerge || loading}
            className="w-full py-3 rounded-xl font-bold text-sm transition-all cursor-pointer
              bg-red-600 hover:bg-red-500 text-white
              disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {loading ? '통합 중...' : canMerge
              ? `#${mergePlayer!.number} ${mergePlayer!.name} → #${keepPlayer!.number} ${keepPlayer!.name} 통합`
              : '두 선수를 모두 선택하세요'}
          </button>
        </div>
      </div>
    </div>
  )
}
