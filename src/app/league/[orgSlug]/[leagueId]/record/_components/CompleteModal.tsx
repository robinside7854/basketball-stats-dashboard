import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { accentOrInk } from '@/lib/util/contrastColor'
import type { GameSlot, Setter } from '../_lib/types'

// 경기 종료(마감) 모달 (호출부가 showComplete 일 때만 그린다)
export default function CompleteModal({
  selectedSlot, isTournament, oppTeam, oppFinalScore, setOppFinalScore, liveScore, setLiveScore,
  fetchLiveScore, completeGame, completing, savingOppScore, setShowComplete,
}: {
  selectedSlot: GameSlot
  isTournament: boolean
  oppTeam: GameSlot['home_team']
  oppFinalScore: string
  setOppFinalScore: Setter<string>
  liveScore: { home: number; away: number } | null
  setLiveScore: Setter<{ home: number; away: number } | null>
  fetchLiveScore: () => Promise<void>
  completeGame: () => Promise<void>
  completing: boolean
  savingOppScore: boolean
  setShowComplete: Setter<boolean>
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-2xl p-6 w-full max-w-sm space-y-4">
        <h3 className="text-[color:var(--mm-ink)] font-black">경기 마감</h3>
        <p className="text-xs text-[color:var(--mm-ink-soft)]">
          {isTournament
            ? '우리 팀 점수는 기록에서 자동 계산됩니다. 상대 점수만 입력하세요.'
            : '점수는 기록한 득점으로 자동 계산됩니다.'}
        </p>

        {/* 대회 — 상대 최종 점수. 상대는 선수를 기록하지 않으므로 점수가 여기서만 들어온다.
            마감 해제 후 다시 열면 저장된 값이 채워져 "고치기" 가 된다. */}
        {isTournament && oppTeam && (
          <div className="space-y-1.5">
            <label htmlFor="opp-final" className="block text-xs font-bold text-[color:var(--mm-ink)]">
              {oppTeam.name ?? '상대팀'} 최종 점수
            </label>
            <input
              id="opp-final"
              type="number" inputMode="numeric" min={0} max={300}
              value={oppFinalScore}
              onChange={e => setOppFinalScore(e.target.value)}
              onBlur={() => { if (oppFinalScore.trim() !== '') fetchLiveScore() }}
              placeholder="예: 42"
              className="w-full min-h-[44px] px-3 rounded-lg bg-[color:var(--mm-panel-alt)] border border-[color:var(--mm-rule)] text-[color:var(--mm-ink)] text-lg font-bold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            />
            <p className="text-xs text-[color:var(--mm-muted)]">
              비워 두면 상대 점수는 0으로 남습니다. 나중에 마감을 해제하고 고칠 수 있습니다.
            </p>
          </div>
        )}
        {liveScore && (
          <div className="bg-[color:var(--mm-panel-alt)] rounded-xl p-4 text-center">
            <div className="flex items-center justify-center gap-4">
              <div>
                <p className="text-xs text-[color:var(--mm-muted)] mb-1" style={{ color: accentOrInk(selectedSlot?.home_team?.color) }}>
                  {selectedSlot?.home_team?.name ?? '홈'}
                </p>
                <p className="text-3xl font-black text-[color:var(--mm-ink)]">{liveScore.home}</p>
              </div>
              <span className="text-[color:var(--mm-muted)] font-bold text-lg">vs</span>
              <div>
                <p className="text-xs text-[color:var(--mm-muted)] mb-1" style={{ color: accentOrInk(selectedSlot?.away_team?.color) }}>
                  {selectedSlot?.away_team?.name ?? '어웨이'}
                </p>
                <p className="text-3xl font-black text-[color:var(--mm-ink)]">{liveScore.away}</p>
              </div>
            </div>
            <p className="text-xs text-[color:var(--mm-muted)] mt-2">지금까지 기록한 득점을 더한 점수</p>
          </div>
        )}
        {!liveScore && (
          <button
            onClick={fetchLiveScore}
            className="w-full py-2 rounded-lg bg-[color:var(--mm-panel-alt)] text-[color:var(--mm-ink-soft)] text-sm cursor-pointer hover:bg-[color:var(--mm-rule)]"
          >
            현재 점수 확인
          </button>
        )}
        <div className="flex gap-2">
          <Button
            onClick={completeGame}
            disabled={completing || savingOppScore}
            className="flex-1 bg-blue-600 hover:bg-blue-500 cursor-pointer disabled:opacity-50"
            size="sm"
          >
            {completing || savingOppScore
              ? <><Loader2 size={14} className="mr-1 animate-spin" />처리 중...</>
              : selectedSlot?.is_complete ? '다시 마감' : '완료 처리'}
          </Button>
          <Button
            onClick={() => { setShowComplete(false); setLiveScore(null) }}
            disabled={completing}
            variant="outline"
            size="sm"
            className="border-[color:var(--mm-rule)] text-[color:var(--mm-ink-soft)] cursor-pointer"
          >취소</Button>
        </div>
      </div>
    </div>
  )
}
