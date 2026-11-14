import LeagueEventInputPad from '@/components/league/LeagueEventInputPad'
import LiveStatStrip from './LiveStatStrip'
import type { SideView } from '../_lib/sides'
import type { GameSlot } from '../_lib/types'

// 기록 중 입력 영역 — 입력 패드 · (대회) 상대 점수 안내 · 실시간 요약
export default function RecordingTools({
  leagueId, leagueHeaders, selectedSlot, selectedSlotId, currentQuarter, isTournament,
  leftSide, rightSide, sideView, onCourt,
  foulCounts, activePlusOneIds, oppTeam, statsRefresh,
  handleEventSaved, fetchLiveScore, loadRoster, focusOn, toggleFocus, openCompleteModal,
}: {
  leagueId: string
  leagueHeaders: Record<string, string>
  selectedSlot: GameSlot
  selectedSlotId: string
  currentQuarter: number
  isTournament: boolean
  leftSide: 'home' | 'away'
  rightSide: 'home' | 'away'
  sideView: (side: 'home' | 'away') => SideView
  onCourt: string[]
  foulCounts: Record<string, number>
  activePlusOneIds: string[]
  oppTeam: GameSlot['home_team']
  statsRefresh: number
  handleEventSaved: (eventType?: string) => void
  fetchLiveScore: () => Promise<void>
  loadRoster: (slot: GameSlot) => Promise<void>
  focusOn: boolean
  toggleFocus: () => void
  openCompleteModal: () => Promise<void>
}) {
  return (
    <>
      {/* 좌우가 뒤집힌 쿼터에서는 패드에 **넘기는 짝을 통째로 맞바꾼다.**
          패드 안에서는 '왼쪽/오른쪽' 으로만 쓰이고 이벤트의 team_id 는 선수
          객체에서 나오므로, 바꿔 넘겨도 기록은 그대로다.
          ⚠ 선수와 팀을 **한 쌍으로** 같이 바꿔야 한다 — 하나만 바꾸면 상대 선수
            즉석 등록이 반대 팀으로 들어간다. */}
      <LeagueEventInputPad
        leagueId={leagueId}
        gameId={selectedSlotId}
        currentQuarter={currentQuarter}
        leagueHeaders={leagueHeaders}
        homePlayers={sideView(leftSide).roster.filter(p => onCourt.includes(p.id))}
        awayPlayers={sideView(rightSide).roster.filter(p => onCourt.includes(p.id))}
        homeTeam={sideView(leftSide).team ?? undefined}
        awayTeam={sideView(rightSide).team ?? undefined}
        onEventSaved={(eventType) => { handleEventSaved(eventType); fetchLiveScore() }}
        foulCounts={foulCounts}
        activePlusOneIds={activePlusOneIds.length > 0 ? activePlusOneIds : undefined}
        onOpponentRegistered={() => { if (selectedSlot) loadRoster(selectedSlot) }}
        // 대회는 상대 선수를 기록하지 않는다 — 점수만 위 「상대 득점」 으로 남긴다
        opponentRecording={!isTournament}
      />

      {/* 상대 점수 안내 (대회) — 실시간으로 따라 누르지 않는다.
          사용자 결정(2026-08-30): 우리 기록만으로도 손이 모자라므로
          **마감할 때 최종 점수를 한 번에** 넣는다. 그 입력은 마감 모달에 있다. */}
      {isTournament && oppTeam && (
        <div
          className="p-3"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
        >
          <p className="text-xs leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
            <strong style={{ color: 'var(--mm-ink-soft)' }}>{oppTeam.name ?? '상대팀'}</strong> 점수는
            경기 <strong style={{ color: 'var(--mm-ink-soft)' }}>마감</strong>할 때 최종 점수로 한 번에 넣습니다.
            {selectedSlot.opponent_score_manual != null && (
              <> · 현재 입력값 <strong style={{ color: 'var(--mm-ink)' }}>{selectedSlot.opponent_score_manual}점</strong></>
            )}
          </p>
        </div>
      )}

      {/* 게스트·임시 선수 추가 · 타팀 임시 출전은 2026-11-03 부터 「교체」 모달 안에 있다(운영진 — 자주 있는 일이 아니다). */}

      {/* 실시간 요약 — 기록이 쌓이는 것이 바로 보이게(운영진 2026-11-03). 코트 위 선수만, 숫자 6개. */}
      <LiveStatStrip
        leagueId={leagueId}
        gameId={selectedSlotId}
        refreshKey={statsRefresh}
        left={{ team: sideView(leftSide).team ?? undefined, players: sideView(leftSide).roster.filter(p => onCourt.includes(p.id)) }}
        right={{ team: sideView(rightSide).team ?? undefined, players: sideView(rightSide).roster.filter(p => onCourt.includes(p.id)) }}
      />
      {/* 폰 기록 집중 화면의 맨 아래 — 마감(경기당 한 번이라 스크롤해서 누른다)과 집중 화면 켜고 끄기.
          「경기 진행 중 · 마감」 상자는 집중 화면에서 숨겨지므로 마감은 여기서 한다. PC 는 영상 위 상자 그대로. */}
      <div className="lg:hidden grid grid-cols-3 gap-2 pt-1">
        {/* 가로 전체화면(2026-11-14 운영진) — 폰을 눕히면 왼쪽 영상 · 오른쪽 기록기. 안드로이드는 화면 방향도 가로로 고정한다
            (아이폰 브라우저는 고정을 막아 두어 폰을 직접 눕히면 된다 — 눕히기만 해도 같은 배치가 된다). */}
        <button type="button" onClick={() => { void toggleLandscape() }}
          className="min-h-11 rounded-lg text-xs font-bold border border-[color:var(--mm-rule)] text-[color:var(--mm-ink-soft)] cursor-pointer break-keep">
          가로 전체화면
        </button>
        <button type="button" onClick={toggleFocus}
          className="min-h-11 rounded-lg text-xs font-bold border border-[color:var(--mm-rule)] text-[color:var(--mm-ink-soft)] cursor-pointer">
          {focusOn ? '전체 화면 보기' : '기록 집중 화면으로'}
        </button>
        <button type="button" onClick={() => { void openCompleteModal() }}
          className="min-h-11 rounded-lg text-xs font-bold cursor-pointer"
          style={{ background: 'var(--mm-live-bg)', color: '#FFFFFF' }}>
          경기 마감
        </button>
      </div>
    </>
  )
}

async function toggleLandscape() {
  try {
    if (document.fullscreenElement) {
      try { (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.() } catch {}
      await document.exitFullscreen()
      return
    }
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    try { await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape') } catch {}
  } catch { /* 전체화면을 막은 브라우저(아이폰) — 폰을 눕히면 같은 배치가 된다 */ }
}
