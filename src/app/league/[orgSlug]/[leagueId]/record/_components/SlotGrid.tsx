import { CheckCircle2, Circle, Loader2, Plus, Youtube } from 'lucide-react'
import type { GameSlot } from '../_lib/types'

// 슬롯 그리드 — 하루 경기 수만큼. 9열 고정이던 것을 슬롯 수에 맞췄다(2026-09-07):
//   하루 9경기 로테이션에서 3대진으로 바뀌어 9열이면 3칸이 왼쪽에 몰리고 나머지가 빈다.
export default function SlotGrid({
  slots, selectedSlotId, selectedDate, isTournament, addingSlot, confirmLeave, selectSlot, addSlot,
}: {
  slots: GameSlot[]
  selectedSlotId: string
  selectedDate: string
  isTournament: boolean
  addingSlot: boolean
  confirmLeave: () => boolean
  selectSlot: (slot: GameSlot) => void
  addSlot: () => void
}) {
  return (
    <div className={`grid grid-cols-4 sm:grid-cols-5 gap-2 ${slots.length <= 4 ? 'lg:grid-cols-4' : slots.length <= 6 ? 'lg:grid-cols-6' : 'lg:grid-cols-9'}`}>
      {slots.map(slot => {
        const isSelected = slot.id === selectedSlotId
        const hasTeams = slot.home_team_id && slot.away_team_id
        const hasYT = !!slot.youtube_url
        return (
          <button
            key={slot.id}
            onClick={() => {
              if (slot.id !== selectedSlotId && !confirmLeave()) return
              selectSlot(slot)
            }}
            className={`relative flex flex-col items-center justify-center px-2 py-2.5 min-h-[44px] rounded-xl border text-base font-bold transition-all duration-200 cursor-pointer hover:-translate-y-0.5 ${
              isSelected
                ? 'bg-blue-600 border-blue-500 text-[#fff]'
                : slot.is_complete
                ? 'bg-green-900/30 border-green-700/50 text-green-400'
                : 'bg-[color:var(--mm-panel)] border-[color:var(--mm-rule)] text-[color:var(--mm-ink)] hover:border-[color:var(--mm-rule)]'
            }`}
          >
            {/* 번호 대신 대진명. 숫자만 있으면 어느 탭이 어느 경기인지 알 수 없어
                매번 눌러서 확인해야 했다. 팀이 아직 안 정해진 슬롯만 번호로 남긴다. */}
            {hasTeams ? (
              <span className="flex flex-col items-center leading-tight w-full min-w-0">
                <span className="text-xs font-bold truncate w-full text-center">{slot.home_team?.name ?? '홈'}</span>
                {/* opacity 로 흐리게 두니 선택 상태(파란 배경)에서 2.7:1 이었다 — 위계는 굵기로만 준다 */}
                <span className="text-xs font-normal">vs</span>
                <span className="text-xs font-bold truncate w-full text-center">{slot.away_team?.name ?? '어웨이'}</span>
              </span>
            ) : (
              <span className="text-xs">경기 {slot.slot_num}</span>
            )}
            <div className="flex items-center gap-0.5 mt-1">
              {hasYT && <Youtube size={14} className="text-red-400" />}
              {slot.is_complete
                ? <CheckCircle2 size={14} className="text-green-400" />
                : slot.is_started
                ? <Circle size={14} className="text-yellow-400" />
                : hasTeams
                ? <Circle size={14} className="text-[color:var(--mm-muted)]" />
                : null}
            </div>
          </button>
        )
      })}

      {/* 슬롯 한 칸 추가 — 리그 설정(games_per_round)은 시즌 전체에 걸리므로 그 날짜에만 붙인다.
          8/22 친선전처럼 쿼터별로 쪼갠 영상이 10개인 날은 기본 9칸으로 모자란다.
          ⚠ 대회에서는 감춘다. 여기서 만든 슬롯은 대회(quarter_id)에도 상대팀에도 묶이지 않아
            어느 대회 카드에도 안 잡히는 미아 경기가 된다 — 대회 경기는 대회 보드에서 등록한다. */}
      {!isTournament && (
      <button
        type="button"
        onClick={addSlot}
        disabled={addingSlot || !selectedDate}
        aria-label="이 날짜에 경기 슬롯 추가"
        title="이 날짜에 슬롯을 한 칸 더 만듭니다 (리그 설정은 바뀌지 않습니다)"
        className="flex flex-col items-center justify-center px-2 py-2.5 min-h-[44px] rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer hover:-translate-y-0.5 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        style={{ border: '1px dashed var(--mm-rule)', background: 'transparent', color: 'var(--mm-muted)' }}
      >
        {addingSlot
          ? <Loader2 size={16} className="animate-spin" aria-hidden />
          : <Plus size={16} strokeWidth={2.5} aria-hidden />}
        <span className="mt-1">추가</span>
      </button>
      )}
    </div>
  )
}
