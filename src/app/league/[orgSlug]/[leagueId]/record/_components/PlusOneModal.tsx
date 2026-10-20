import { Zap } from 'lucide-react'
import type { RosterPlayer, Setter } from '../_lib/types'
import { useEscapeKey } from '@/hooks/useEscapeKey'

// 플러스원 선수 선택 모달 (호출부가 showPlusOneModal && plusOneConflict 일 때만 그린다)
export default function PlusOneModal({
  plusOneConflict, setShowPlusOneModal, handlePlusOneSelect,
}: {
  plusOneConflict: { teamName: string; players: RosterPlayer[] }
  setShowPlusOneModal: Setter<boolean>
  handlePlusOneSelect: (selectedId: string) => Promise<void>
}) {
  useEscapeKey(() => setShowPlusOneModal(false))
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowPlusOneModal(false)}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div role="dialog" aria-modal="true" aria-labelledby="plus-one-title" className="relative bg-[color:var(--mm-panel)] border border-amber-600/50 rounded-2xl p-6 w-full max-w-sm z-10 space-y-4 shadow-2xl"
        onClick={e => e.stopPropagation()}>
        <div className="text-center space-y-1.5">
          <div className="flex justify-center text-amber-300" aria-hidden><Zap size={24} /></div>
          <h3 id="plus-one-title" className="text-[color:var(--mm-ink)] font-black text-base">플러스원 선수 선택</h3>
          <p className="text-[color:var(--mm-ink-soft)] text-sm">
            <span className="text-amber-300 font-bold">{plusOneConflict.teamName}</span>에 +1 선수가 {plusOneConflict.players.length}명입니다.<br/>
            이 경기에서 +1 혜택을 받을 선수를 선택하세요.
          </p>
        </div>
        <div className="space-y-2">
          {plusOneConflict.players.map(p => (
            <button
              key={p.id}
              onClick={() => handlePlusOneSelect(p.id)}
              className="w-full py-3 px-4 rounded-xl bg-amber-900/30 border border-amber-600/50 text-amber-200 font-bold text-sm hover:bg-amber-900/50 hover:border-amber-500 cursor-pointer transition-colors flex items-center justify-between"
            >
              <span>{p.number != null ? `#${p.number} ` : ''}{p.name}</span>
              <span className="text-amber-400 text-xs font-black">+1 선택</span>
            </button>
          ))}
        </div>
        <button onClick={() => setShowPlusOneModal(false)} className="w-full text-center text-xs text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink-soft)] cursor-pointer py-1">취소</button>
      </div>
    </div>
  )
}
