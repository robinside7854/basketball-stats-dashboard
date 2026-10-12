import { ClipboardList, RefreshCw, Zap } from 'lucide-react'
import { accentOrInk } from '@/lib/util/contrastColor'
import { QUARTER_OPTIONS } from '../_lib/constants'
import type { SideView } from '../_lib/sides'
import type { GameSlot, RosterPlayer, Setter } from '../_lib/types'

// 컴팩트 스코어 스트립 (기록 중) — 점수 · 기록 내역 · +1 · 교체 · 스탯 + 지금 쿼터 팀파울
export default function ScoreStrip({
  selectedSlot, homeRoster, awayRoster, currentQuarter, leftSide, rightSide, sideView, teamFoulsOf,
  setShowGameLog, setPlusOneConflict, setShowPlusOneModal, setShowSubModal, setShowBoxscoreModal,
}: {
  selectedSlot: GameSlot
  homeRoster: RosterPlayer[]
  awayRoster: RosterPlayer[]
  currentQuarter: number
  leftSide: 'home' | 'away'
  rightSide: 'home' | 'away'
  sideView: (side: 'home' | 'away') => SideView
  teamFoulsOf: (teamId: string | null | undefined) => number
  setShowGameLog: Setter<boolean>
  setPlusOneConflict: Setter<{ teamName: string; players: RosterPlayer[] } | null>
  setShowPlusOneModal: Setter<boolean>
  setShowSubModal: Setter<boolean>
  setShowBoxscoreModal: Setter<boolean>
}) {
  return (
    <div className="bg-[color:var(--mm-ground)] border border-[color:var(--mm-rule)] rounded-xl overflow-hidden">
      <div className="flex items-stretch min-h-11">
        {/* 좌우는 이 쿼터의 코트 배치를 따른다(위 스코어보드와 같은 sideView) */}
        <div className="flex-1 py-2 px-3 flex items-center gap-2">
          <span className="text-xs font-bold truncate" style={{ color: accentOrInk(sideView(leftSide).color) }}>
            {sideView(leftSide).team?.name ?? (leftSide === 'home' ? '홈팀' : '어웨이팀')}
          </span>
          <span className="text-2xl font-black text-[color:var(--mm-ink)] tabular-nums leading-none ml-auto">
            {sideView(leftSide).score}
          </span>
        </div>
        <div className="flex flex-col items-center justify-center px-2 border-x border-[color:var(--mm-rule)] shrink-0">
          <span className="text-xs text-green-400 font-bold tracking-widest">LIVE</span>
          <span className="text-sm text-[color:var(--mm-muted)] font-black leading-none">:</span>
        </div>
        <div className="flex-1 py-2 px-3 flex items-center gap-2">
          <span className="text-2xl font-black text-[color:var(--mm-ink)] tabular-nums leading-none mr-auto">
            {sideView(rightSide).score}
          </span>
          <span className="text-xs font-bold truncate" style={{ color: accentOrInk(sideView(rightSide).color) }}>
            {sideView(rightSide).team?.name ?? (rightSide === 'home' ? '홈팀' : '어웨이팀')}
          </span>
        </div>
        <button
          onClick={() => setShowGameLog(true)}
          className="border-l border-[color:var(--mm-rule)] px-3 min-h-11 flex items-center gap-1 text-xs text-[color:var(--mm-ink)] hover:text-[color:var(--mm-ink)] hover:bg-[color:var(--mm-panel-alt)]/60 cursor-pointer transition-colors shrink-0"
        >
          <ClipboardList size={14} />
          <span className="hidden sm:inline">기록 내역</span>
        </button>
        {/* 플러스원 선수 재설정 버튼 — plus_one 선수가 있을 때만 표시 */}
        {[...homeRoster, ...awayRoster].some(p => p.plus_one) && (
          <button
            onClick={() => {
              const homePO = homeRoster.filter(p => p.plus_one)
              const awayPO = awayRoster.filter(p => p.plus_one)
              const conflict = homePO.length >= 2
                ? { teamName: selectedSlot?.home_team?.name ?? '홈팀', players: homePO }
                : awayPO.length >= 2
                ? { teamName: selectedSlot?.away_team?.name ?? '어웨이팀', players: awayPO }
                : { teamName: '플러스원', players: [...homePO, ...awayPO] }
              setPlusOneConflict(conflict)
              setShowPlusOneModal(true)
            }}
            className="border-l border-[color:var(--mm-rule)] px-2.5 flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 hover:bg-[color:var(--mm-panel-alt)]/60 cursor-pointer transition-colors shrink-0"
            title="플러스원 선수 설정"
          >
            <Zap size={14} aria-hidden />
            <span className="hidden sm:inline">+1</span>
          </button>
        )}
        <button
          onClick={() => setShowSubModal(true)}
          className="border-l border-[color:var(--mm-rule)] px-2.5 flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 hover:bg-[color:var(--mm-panel-alt)]/60 cursor-pointer transition-colors shrink-0"
        >
          <RefreshCw size={14} />
          <span className="hidden sm:inline">교체</span>
        </button>
        <button
          onClick={() => setShowBoxscoreModal(true)}
          className="border-l border-[color:var(--mm-rule)] px-2.5 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-[color:var(--mm-panel-alt)]/60 cursor-pointer transition-colors shrink-0"
        >
          <ClipboardList size={14} />
          <span className="hidden sm:inline">스탯</span>
        </button>
      </div>
      {/* 팀 파울 — 지금 쿼터 기준. 5개부터 보너스(상대 자유투)라 강조한다.
          좌우는 위 스트립과 같은 sideView 를 따른다. 외부(대회 상대) 팀은
          파울을 기록하지 않으므로 칸을 비운다 — 0 으로 보이면 사실처럼 읽힌다. */}
      {(() => {
        const qLabel = QUARTER_OPTIONS.find(q => q.value === currentQuarter)?.label ?? `${currentQuarter}Q`
        const chip = (side: 'home' | 'away', align: 'left' | 'right') => {
          const v = sideView(side)
          if (!v.team || v.team.is_external) return <span />
          const n = teamFoulsOf(v.team.id)
          const bonus = n >= 5
          return (
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-xs font-bold tabular-nums ${align === 'right' ? 'flex-row-reverse' : ''}`}
              style={bonus
                ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '4px' }
                : n === 4
                ? { color: 'var(--mm-yellow)' }
                : { color: 'var(--mm-muted)' }}
              title={bonus ? `${v.team.name} 팀파울 ${n}개 — 상대 보너스(자유투) 구간` : `${v.team.name} 팀파울 ${n}개 (${qLabel})`}
            >
              팀파울 {n}{bonus && <span>· 보너스</span>}
            </span>
          )
        }
        return (
          <div className="flex items-center justify-between gap-2 px-3 py-1 border-t border-[color:var(--mm-rule)]">
            {chip(leftSide, 'left')}
            <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>{qLabel}</span>
            {chip(rightSide, 'right')}
          </div>
        )
      })()}
    </div>
  )
}
