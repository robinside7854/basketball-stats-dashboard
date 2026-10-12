import type React from 'react'
import { AlertTriangle, Loader2, Play, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { accentOrInk } from '@/lib/util/contrastColor'
import type { SideView } from '../_lib/sides'
import type { GameSlot, IrregularPlayer, RosterPlayer, Setter } from '../_lib/types'

// 드래그 앤 드롭 선발 선수 선택 (경기 시작 전)
//   「지난 경기와 같은 선발」 · 홈/어웨이 드롭 존(대회는 우리 팀 한 칸) · 미배정 풀 · 「경기 시작」
export default function StarterSelect({
  selectedSlot, isTournament, homeRoster, awayRoster, irregularRoster, rosterLoading,
  ourSide, ourRoster, leftSide, rightSide, sideView,
  selectedStarters, toggleStarter, selectAllTeam,
  dragOverSide, setDragOverSide, draggingPlayerId, setDraggingPlayerId, handleDrop,
  prevStarterSources, applyPrevStarters, applyingPrevStarters,
  addIrregularToTeam, addingIrregular, setPendingIrregular, teamNameById,
  startGame, startingGame,
}: {
  selectedSlot: GameSlot
  isTournament: boolean
  homeRoster: RosterPlayer[]
  awayRoster: RosterPlayer[]
  irregularRoster: IrregularPlayer[]
  rosterLoading: boolean
  ourSide: 'home' | 'away' | null
  ourRoster: RosterPlayer[]
  leftSide: 'home' | 'away'
  rightSide: 'home' | 'away'
  sideView: (side: 'home' | 'away') => SideView
  selectedStarters: Set<string>
  toggleStarter: (pid: string) => void
  selectAllTeam: (side: 'home' | 'away') => void
  dragOverSide: 'home' | 'away' | null
  setDragOverSide: Setter<'home' | 'away' | null>
  draggingPlayerId: string | null
  setDraggingPlayerId: Setter<string | null>
  handleDrop: (e: React.DragEvent, side: 'home' | 'away') => Promise<void>
  prevStarterSources: { side: 'home' | 'away'; teamName: string; src: GameSlot }[]
  applyPrevStarters: () => Promise<void>
  applyingPrevStarters: boolean
  addIrregularToTeam: (player: IrregularPlayer, side: 'home' | 'away') => Promise<void>
  addingIrregular: boolean
  setPendingIrregular: Setter<IrregularPlayer | null>
  teamNameById: (id: string | null | undefined) => string | null
  startGame: () => Promise<void>
  startingGame: boolean
}) {
  function renderStarterCard(p: RosterPlayer, side: 'home' | 'away') {
    const checked = selectedStarters.has(p.id)
    const isIrregular = p.is_regular === false
    const isDragging = draggingPlayerId === p.id
    const otherSide: 'home' | 'away' = side === 'home' ? 'away' : 'home'
    const otherTeamName = side === 'home' ? (selectedSlot?.away_team?.name ?? '어웨이') : (selectedSlot?.home_team?.name ?? '홈')
    // 팀 시맨틱 색 유지 (홈=파랑 / 어웨이=빨강)
    const checkedStyle: React.CSSProperties = side === 'home'
      ? { background: 'rgba(59,130,246,0.15)', border: '1px solid #3b82f6', color: 'var(--mm-ink)' }
      : { background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', color: 'var(--mm-ink)' }
    const uncheckedStyle: React.CSSProperties = {
      background: 'var(--mm-panel-alt)',
      border: '1px solid var(--mm-rule)',
      color: 'var(--mm-ink-soft)',
    }
    const accentClass = side === 'home' ? 'accent-blue-500' : 'accent-red-500'
    return (
      <div
        key={p.id}
        draggable
        onDragStart={e => {
          setDraggingPlayerId(p.id)
          e.dataTransfer.setData('playerId', p.id)
          e.dataTransfer.setData('playerType', p.is_regular === false ? 'irregular' : 'regular')
        }}
        onDragEnd={() => setDraggingPlayerId(null)}
        onClick={() => toggleStarter(p.id)}
        className={`flex items-center gap-2 px-2 py-1.5 min-h-[44px] lg:cursor-grab text-xs transition-colors select-none ${
          isDragging ? 'opacity-40' : ''
        }`}
        style={{ ...(checked ? checkedStyle : uncheckedStyle), borderRadius: '4px' }}
      >
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggleStarter(p.id)}
          onClick={e => e.stopPropagation()}
          className={`w-4 h-4 cursor-pointer shrink-0 ${accentClass}`}
        />
        {p.number && <span className="font-mono w-6" style={{ color: 'var(--mm-muted)' }}>#{p.number}</span>}
        <span className="font-medium min-w-0 break-keep" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', lineHeight: 1.2 }}>{p.name}</span>
        {isIrregular && (
          <span
            className="shrink-0 text-xs font-bold px-1"
            style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '4px' }}
          >
            게스트·임시
          </span>
        )}
        {/* 모바일 전용: 다른 팀으로 이동 (iOS Safari DnD 불가 대체)
            ⚠ 대회에는 옮겨 갈 "다른 팀" 이 없다 — 상대는 외부 동호회다. 이 버튼을 남기면
              우리 선수가 상대팀 소속으로 배정돼 그 득점이 상대 점수로 들어간다. */}
        {!isTournament && (
        <button
          onClick={e => {
            e.stopPropagation()
            addIrregularToTeam(p as IrregularPlayer, otherSide)
          }}
          disabled={addingIrregular}
          className="lg:hidden ml-auto shrink-0 inline-flex items-center justify-center min-h-11 min-w-11 px-2 text-xs font-bold cursor-pointer transition-colors disabled:opacity-40"
          style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)', borderRadius: '4px' }}
          aria-label={`${p.name} → ${otherTeamName} 팀으로 이동`}
          title={`→ ${otherTeamName}`}
        >
          → {otherTeamName}
        </button>
        )}
      </div>
    )
  }

  function renderDraggableChip(p: IrregularPlayer) {
    const isDragging = draggingPlayerId === p.id
    const isOtherTeam = p.is_regular === true && !!p.team_id
    const teamName = isOtherTeam ? teamNameById(p.team_id) : null
    // 타팀 임대 vs 비정규 구분: mm-yellow tint 로 통일 (임대는 얇은 outline 강조)
    const chipStyle: React.CSSProperties = isOtherTeam
      ? { background: 'var(--mm-panel)', border: '1px solid var(--mm-yellow-strong)', color: 'var(--mm-ink)', borderRadius: '4px' }
      : { background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow)', color: 'var(--mm-yellow-strong)', borderRadius: '4px' }
    return (
      <button
        key={p.id}
        type="button"
        draggable
        onDragStart={e => {
          setDraggingPlayerId(p.id)
          e.dataTransfer.setData('playerId', p.id)
          e.dataTransfer.setData('playerType', 'irregular')
        }}
        onDragEnd={() => setDraggingPlayerId(null)}
        onClick={() => setPendingIrregular(p)}
        className={`flex items-center gap-1 px-2.5 py-1 min-h-11 text-xs font-medium cursor-pointer lg:cursor-grab transition-colors select-none ${
          isDragging ? 'opacity-40' : ''
        }`}
        style={chipStyle}
        aria-label={`${p.name} 팀 배정`}
      >
        {p.number ? `#${p.number} ` : ''}{p.name}
        {teamName && (
          <span
            className="text-xs font-bold px-1 ml-0.5"
            style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '4px' }}
          >
            {teamName}
          </span>
        )}
      </button>
    )
  }

  return (
    <div
      className="p-3 space-y-3"
      style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
    >
      {/* 헤더 */}
      {(() => {
        const hc = homeRoster.filter(p => selectedStarters.has(p.id)).length
        const ac = awayRoster.filter(p => selectedStarters.has(p.id)).length
        const oc = ourRoster.filter(p => selectedStarters.has(p.id)).length
        return (
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-base" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>선발 선수 선택</h4>
            <div className="flex items-center gap-2 text-xs">
              {/* 대회는 우리 한 팀뿐이라 홈/어웨이를 나눠 세지 않는다 */}
              {isTournament ? (
                <span
                  className={oc > 5 ? 'inline-flex items-center gap-1 font-bold' : ''}
                  style={{ color: oc > 5 ? 'var(--mm-live)' : 'var(--mm-muted)' }}
                >
                  {oc}/5{oc > 5 && <AlertTriangle size={14} aria-hidden />}
                </span>
              ) : (
                <>
                  <span
                    className={hc > 5 ? 'inline-flex items-center gap-1 font-bold' : ''}
                    style={{ color: hc > 5 ? 'var(--mm-live)' : 'var(--mm-muted)' }}
                  >
                    홈 {hc}/5{hc > 5 && <AlertTriangle size={14} aria-hidden />}
                  </span>
                  <span
                    className={ac > 5 ? 'inline-flex items-center gap-1 font-bold' : ''}
                    style={{ color: ac > 5 ? 'var(--mm-live)' : 'var(--mm-muted)' }}
                  >
                    어웨이 {ac}/5{ac > 5 && <AlertTriangle size={14} aria-hidden />}
                  </span>
                </>
              )}
            </div>
          </div>
        )
      })()}
      <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>
        {isTournament ? (
          <>이 경기에 뛴 선수를 고르세요. 상대팀 선수는 기록하지 않습니다.</>
        ) : (
          <>
            <span className="hidden lg:inline">선수를 끌어다 팀에 배정하세요. </span>
            <span className="lg:hidden">카드를 탭하여 선발 체크 · 오른쪽 버튼으로 다른 팀 이동. </span>
            다른 팀으로 옮긴 선수는 이번 경기에만 적용됩니다.
          </>
        )}
      </p>

      {/* 지난 경기와 같은 선발 — 같은 날 앞 경기에 이 팀이 나왔을 때만 보인다 */}
      {prevStarterSources.length > 0 && (
        <button
          type="button"
          onClick={applyPrevStarters}
          disabled={applyingPrevStarters || rosterLoading}
          title="같은 날 앞 경기의 선발을 그대로 체크합니다. 체크한 뒤에도 고칠 수 있습니다"
          className="w-full inline-flex items-center justify-center gap-1.5 px-3 min-h-11 text-xs font-bold cursor-pointer transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
        >
          {applyingPrevStarters
            ? <Loader2 size={14} className="animate-spin" aria-hidden />
            : <RefreshCw size={14} aria-hidden />}
          지난 경기와 같은 선발
          <span className="font-normal" style={{ color: 'var(--mm-muted)' }}>
            · {prevStarterSources.map(x => `${x.teamName} ${x.src.slot_num}경기`).join(', ')}
          </span>
        </button>
      )}

      {/* 대회 — 우리 팀 한 칸만. 상대 칸을 두면 "여기에 상대 선수를 넣나?" 로 읽히고
          실제로 넣으면 상대 선수 기록이 우리 통계에 섞인다. */}
      {isTournament ? (
        <div
          className="min-h-[180px] p-2"
          style={{ border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
        >
          <div className="flex items-center justify-between mb-2 px-1">
            <span
              className="text-xs font-bold px-2 py-0.5"
              style={{
                color: accentOrInk((ourSide === 'home' ? selectedSlot?.home_team?.color : selectedSlot?.away_team?.color) ?? '#3b82f6'),
                backgroundColor: `${(ourSide === 'home' ? selectedSlot?.home_team?.color : selectedSlot?.away_team?.color) ?? '#3b82f6'}22`,
                borderRadius: '4px',
              }}
            >
              {(ourSide === 'home' ? selectedSlot?.home_team?.name : selectedSlot?.away_team?.name) ?? '우리 팀'}
            </span>
            {ourSide && (
              <button
                onClick={() => selectAllTeam(ourSide)}
                className="text-xs font-bold cursor-pointer transition-colors"
                style={{ color: 'var(--mm-yellow-strong)' }}
              >
                전체
              </button>
            )}
          </div>
          <div className="space-y-1">
            {ourSide && ourRoster.map(p => renderStarterCard(p, ourSide))}
            {ourRoster.length === 0 && (
              <p className="text-xs px-2 py-4 text-center leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
                이 대회에 등록된 선수가 없습니다.<br />
                대회 화면의 <strong style={{ color: 'var(--mm-ink-soft)' }}>참가 등록</strong> 에서 뛸 선수를 골라 주세요.
              </p>
            )}
          </div>
        </div>
      ) : (
      /* 드롭 존 — 홈/어웨이 2컬럼 (홈=파랑 / 어웨이=빨강은 팀 시맨틱 유지) */
      /* 두 칸의 **위치만** 이 쿼터의 코트 배치를 따른다. side 값(home/away)은
         그대로 넘어가므로 드롭·전체선택·카드 렌더는 언제나 올바른 팀에 붙는다. */
      <div className="grid grid-cols-2 gap-3">
        {[leftSide, rightSide].map(side => {
          const v = sideView(side)
          const fallback = side === 'home' ? '#3b82f6' : '#ef4444'
          return (
            <div
              key={side}
              onDragOver={e => { e.preventDefault(); setDragOverSide(side) }}
              onDragLeave={() => setDragOverSide(null)}
              onDrop={e => handleDrop(e, side)}
              className="min-h-[180px] p-2 border-2 border-dashed transition-colors"
              style={dragOverSide === side
                ? { borderColor: v.color, background: `${v.color}1A`, borderRadius: '4px' }
                : { borderColor: 'var(--mm-rule)', borderRadius: '4px' }
              }
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <span className="text-xs font-bold px-2 py-0.5"
                  style={{ color: accentOrInk(v.color), backgroundColor: `${v.color}22`, borderRadius: '4px' }}>
                  {v.team?.name ?? (side === 'home' ? '홈팀' : '어웨이팀')}
                </span>
                <button onClick={() => selectAllTeam(side)} className="text-xs font-bold cursor-pointer transition-colors duration-200" style={{ color: fallback }}>전체</button>
              </div>
              <div className="space-y-1">
                {v.roster.map(p => renderStarterCard(p, side))}
                {v.roster.length === 0 && (
                  <p className="text-xs px-2 py-4 text-center" style={{ color: 'var(--mm-muted)' }}>선수를 여기로 드래그</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
      )}

      {/* 미배정 풀 — 비정규 선수. 대회에는 비정규 개념이 없다(참가 등록이 곧 명단). */}
      {!isTournament && irregularRoster.length > 0 && (
        <div>
          <p className="text-xs mb-2" style={{ color: 'var(--mm-muted)' }}>
            <span className="hidden lg:inline">위로 드래그하여 팀 배정 / </span>
            <span className="lg:hidden">칩을 탭하여 팀 배정 / </span>
            팀이 정해지지 않은 선수 (게스트·임시)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {irregularRoster.map(p => renderDraggableChip(p))}
          </div>
        </div>
      )}

      {/* 경기 시작 버튼 */}
      <Button
        onClick={startGame}
        disabled={startingGame || rosterLoading || (homeRoster.length === 0 && awayRoster.length === 0)}
        className="w-full bg-green-600 hover:bg-green-500 cursor-pointer"
      >
        {startingGame
          ? <><Loader2 size={14} className="mr-1.5 animate-spin" />시작 중...</>
          : <><Play size={14} className="mr-1.5" />경기 시작</>}
      </Button>
    </div>
  )
}
