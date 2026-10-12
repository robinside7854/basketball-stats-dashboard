import { textOnBg } from '@/lib/util/contrastColor'
import type { GameSlot, IrregularPlayer, Setter } from '../_lib/types'

// 비정규 선수 팀 선택 미니 모달 (호출부가 pendingIrregular 가 있을 때만 그린다)
export default function IrregularTeamModal({
  selectedSlot, pendingIrregular, setPendingIrregular, addIrregularToTeam, addingIrregular,
}: {
  selectedSlot: GameSlot
  pendingIrregular: IrregularPlayer
  setPendingIrregular: Setter<IrregularPlayer | null>
  addIrregularToTeam: (player: IrregularPlayer, side: 'home' | 'away') => Promise<void>
  addingIrregular: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div
        className="p-5 w-full max-w-xs space-y-3"
        style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
      >
        <h3 className="font-black text-base" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>
          {pendingIrregular.name}을(를) 어느 팀에 추가할까요?
        </h3>
        <div className="flex gap-2">
          {(() => {
            const hBg = selectedSlot?.home_team?.color ?? '#3b82f6'
            const aBg = selectedSlot?.away_team?.color ?? '#ef4444'
            return (
              <>
                <button
                  onClick={() => addIrregularToTeam(pendingIrregular, 'home')}
                  disabled={addingIrregular}
                  className="flex-1 py-2 text-xs font-bold cursor-pointer disabled:opacity-50 transition-opacity min-h-[44px]"
                  style={{ backgroundColor: hBg, color: textOnBg(hBg), borderRadius: '4px' }}
                >
                  {selectedSlot?.home_team?.name ?? '홈팀'}
                </button>
                <button
                  onClick={() => addIrregularToTeam(pendingIrregular, 'away')}
                  disabled={addingIrregular}
                  className="flex-1 py-2 text-xs font-bold cursor-pointer disabled:opacity-50 transition-opacity min-h-[44px]"
                  style={{ backgroundColor: aBg, color: textOnBg(aBg), borderRadius: '4px' }}
                >
                  {selectedSlot?.away_team?.name ?? '어웨이팀'}
                </button>
              </>
            )
          })()}
        </div>
        <button
          onClick={() => setPendingIrregular(null)}
          disabled={addingIrregular}
          className="w-full py-1.5 text-xs cursor-pointer transition-colors"
          style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
        >취소</button>
      </div>
    </div>
  )
}
