'use client'
import LeagueSubTabs from '@/components/league/LeagueSubTabs'
import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { useGameStore } from '@/store/gameStore'
import { useLineupStore } from '@/store/lineupStore'
import { Lock, Loader2, CalendarDays } from 'lucide-react'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import EmptyState from '@/components/league/EmptyState'
import YouTubePlayer from '@/components/record/YouTubePlayer'
import LeagueStatsPanel from '@/components/league/LeagueStatsPanel'
import GameLogModal from '@/components/league/GameLogModal'

import type { ActiveVideo } from './_lib/types'
import { computeActiveVideo } from './_lib/video'
import { buildSideView } from './_lib/sides'
import { useRecordState } from './_hooks/useRecordState'
import { useYoutubeRemote } from './_hooks/useYoutubeRemote'
import { useStarterDefaults } from './_hooks/useStarterDefaults'
import { useInitialLoad } from './_hooks/useInitialLoad'
import { useSlotCore } from './_hooks/useSlotCore'
import { useDeepLink } from './_hooks/useDeepLink'
import { useDateTeams } from './_hooks/useDateTeams'
import { useQuarterVideos } from './_hooks/useQuarterVideos'
import { useFoulCounts } from './_hooks/useFoulCounts'
import { useResumeSession } from './_hooks/useResumeSession'
import { useQuarterRestore } from './_hooks/useQuarterRestore'
import { usePrepActions } from './_hooks/usePrepActions'
import { useVideoActions } from './_hooks/useVideoActions'
import { useGameSession } from './_hooks/useGameSession'
import { useStarterActions } from './_hooks/useStarterActions'
import RecordLanding from './_components/RecordLanding'
import DateHeader from './_components/DateHeader'
import SlotGrid from './_components/SlotGrid'
import PrepCard from './_components/PrepCard'
import VideoPanel from './_components/VideoPanel'
import AdvancedPanel from './_components/AdvancedPanel'
import AdhocTeamsPanel from './_components/AdhocTeamsPanel'
import VideoColumn from './_components/VideoColumn'
import CompletedBanner from './_components/CompletedBanner'
import ScoreStrip from './_components/ScoreStrip'
import QuarterSelector from './_components/QuarterSelector'
import RecordingTools from './_components/RecordingTools'
import StarterSelect from './_components/StarterSelect'
import IrregularTeamModal from './_components/IrregularTeamModal'
import SubstitutionModal from './_components/SubstitutionModal'
import BoxscoreModal from './_components/BoxscoreModal'
import PlusOneModal from './_components/PlusOneModal'
import CompleteModal from './_components/CompleteModal'

// ── 메인 페이지 ──────────────────────────────────────────────
export default function LeagueRecordPage() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params
  const { isEditMode, leagueHeaders, openLogin } = useLeagueEditMode()

  if (!isEditMode) {
    return (
      <div className="mm-brand flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center">
        <Lock size={24} style={{ color: 'var(--mm-muted)' }} />
        <div>
          <h3
            className="font-black text-2xl"
            style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
          >
            어드민 전용
          </h3>
          <p className="text-sm mt-1" style={{ color: 'var(--mm-muted)' }}>
            경기 기록은 어드민 계정으로 로그인해야 할 수 있습니다
          </p>
        </div>
        <button
          onClick={openLogin}
          className="px-5 py-2 min-h-11 whitespace-nowrap text-sm font-bold cursor-pointer transition-colors"
          style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '4px' }}
        >
          어드민 로그인
        </button>
      </div>
    )
  }

  return <RecordInner orgSlug={orgSlug} leagueId={leagueId} leagueHeaders={leagueHeaders} />
}

// ── 내부 컴포넌트 ─────────────────────────────────────────────
function RecordInner({ orgSlug, leagueId, leagueHeaders }: { orgSlug: string; leagueId: string; leagueHeaders: Record<string, string> }) {
  const { setCurrentGame, ytPlayer } = useGameStore()
  const { setLineup, resetLineup, onCourt } = useLineupStore()

  // ⚠ 훅 호출 순서 = effect 실행 순서. 분리 전(한 파일이던 시절)의 effect 순서를 그대로 지킨다:
  //   ① 키보드 단축키 ② 상대 점수 채우기 ③ 선발 기본 체크 ④ 초기 로드 ⑤ 딥링크·이어서 기록 진입
  //   ⑥ 분기 팀 ⑦ 임시팀 ⑧~⑫ 쿼터 영상(목록 캐시·영상 표·패널 열기·링크 대상·시작 쿼터)
  //   ⑬~⑯ 이어서 기록(장면 저장·이탈 경고·장면 복원·영상 위치) ⑰ 이벤트 기반 쿼터 복원
  //   effect 가 없는 동작 묶음(use*Actions·useSlotCore)은 매 렌더 새로 만드는 함수라 위치와 무관하다.
  const { seekRelative, togglePlay } = useYoutubeRemote({ ytPlayer }) // ①

  const st = useRecordState()
  const {
    scheduleDates, selectedDate, slots, allPlayers, leagueYtChannel, selectedSlotId, loadingDates,
    initializingSlots, ytSyncing, minutes, setMinutes, statsRefresh, setStatsRefresh, mobileTab,
    setMobileTab, homeRoster, setHomeRoster, awayRoster, setAwayRoster, irregularRoster, rosterLoading,
    pendingIrregular, setPendingIrregular, addingIrregular, savingExtraP1, extraP1AllSlots,
    setExtraP1AllSlots, addingSlot, deletingSlot, ytInput, setYtInput, ytSaving, ytPickerOpen,
    setYtPickerOpen, ytList, ytListLoading, adhocTeams, newTeamName, setNewTeamName, newTeamColor,
    setNewTeamColor, creatingTeam, deletingTeamId, pendingHome, setPendingHome, pendingAway,
    setPendingAway, savingTeam, videoPanelOpen, setVideoPanelOpen, advancedOpen, setAdvancedOpen,
    swappingId, gameStarted, startingGame, showComplete, setShowComplete, completing, reopening,
    liveScore, setLiveScore, currentQuarter, setCurrentQuarter, showGameLog, setShowGameLog,
    showSubModal, setShowSubModal, showBoxscoreModal, setShowBoxscoreModal, selectedStarters,
    dragOverSide, setDragOverSide, draggingPlayerId, setDraggingPlayerId, showPlusOneModal,
    setShowPlusOneModal, plusOneConflict, setPlusOneConflict, activePlusOneIds, isTournament,
    quarterVideos, ytTargetQuarter, setYtTargetQuarter, quarterSplitOpen, setQuarterSplitOpen,
    oppFinalScore, setOppFinalScore, savingOppScore, applyingPrevStarters,
  } = st

  // 쿼터 태그된 영상이 하나라도 있으면 "쿼터가 있는 경기". 없으면 쿼터를 화면에 꺼내지 않는다.
  //   기록 데이터의 quarter 값은 그대로다 — 표시만 감춘다.
  const hasQuarterVideos = Object.keys(quarterVideos).length > 0
  const showQuarterUi = hasQuarterVideos || quarterSplitOpen

  const selectedSlot = slots.find(s => s.id === selectedSlotId) ?? null

  // 영상 한 편 = 한 쿼터인 경기 (2026-10-17 사용자 — 미라클 정규전이 「경기 1편 = 1쿼터짜리」로 올라온다).
  //   대표 영상만 있고 쿼터별 영상이 없으면 쿼터를 나눌 일이 없으므로 쿼터 선택·쿼터 표기를 감춘다.
  //   기록은 1쿼터로 그대로 저장된다. 영상이 아예 없는 날(4쿼터를 손으로 넘기는 날)과 대회는 그대로 보인다.
  //   이미 2쿼터 이상으로 넘겨 둔 경우엔 되돌릴 수 있게 보인다.
  const singleSegment = !isTournament && !showQuarterUi && !!selectedSlot?.youtube_url && currentQuarter === 1

  // ── 대회는 "우리 한 팀" 이다 ────────────────────────────────────────
  //   리그는 양 팀 모두 우리 동호회 사람이라 홈·어웨이를 나란히 기록한다.
  //   대회는 상대가 외부 동호회다 — 상대 선수는 명단조차 알 수 없고, 우리 통계에 섞이면 안 된다.
  //   그래서 대회에서는 **우리 쪽만** 기록하고 상대는 점수만 남긴다(scoring.ts 의 OPPONENT_SCORING).
  //   `is_external === false` 인 쪽이 우리다. 좌우는 대회마다 뒤집히므로 매번 판정한다.
  const ourSide: 'home' | 'away' | null = !isTournament ? null
    : selectedSlot?.home_team?.is_external === false ? 'home'
    : selectedSlot?.away_team?.is_external === false ? 'away'
    : null
  const oppTeam = ourSide === 'home' ? selectedSlot?.away_team
    : ourSide === 'away' ? selectedSlot?.home_team
    : null
  /** 대회에서 기록 대상이 되는 우리 팀 명단. 리그면 홈+어웨이 둘 다가 대상이라 여기 안 쓴다. */
  const ourRoster = ourSide === 'home' ? homeRoster : ourSide === 'away' ? awayRoster : []

  // 경기를 바꾸거나 마감 모달을 열 때 저장돼 있던 값을 채운다 — 마감 해제 후 다시 마감할 때
  //   이전에 넣은 점수가 그대로 보여야 "다시 입력"이 아니라 "고치기"가 된다.
  useEffect(() => {
    setOppFinalScore(selectedSlot?.opponent_score_manual != null ? String(selectedSlot.opponent_score_manual) : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 세터는 useRecordState·훅에서 넘겨받은 것(안정). 의존성 배열은 분리 전 그대로 둔다.
  }, [selectedSlotId, selectedSlot?.opponent_score_manual])

  // 지금 화면에서 재생해야 할 영상 — 판정 규칙과 사연은 _lib/video.ts 의 computeActiveVideo 참고.
  const activeVideo: ActiveVideo | null = computeActiveVideo(selectedSlot, quarterVideos, currentQuarter)

  /** 지금 **실제로 재생 중인 영상**의 쿼터. 없으면 null. 쿼터 카드 배지는 이것만 본다. */
  const playingQuarter: number | null = activeVideo == null
    ? null
    : activeVideo.source === 'quarter' ? currentQuarter : activeVideo.representativeQuarter

  // ── 쿼터별 코트 좌우 ───────────────────────────────────────────────
  //   같은 경기라도 쿼터마다 두 팀의 코트 좌우가 바뀐다. 영상과 화면 배치가 반대면
  //   기록원이 매번 머리로 뒤집어 눌러야 한다.
  //
  // ⚠ **표시만 뒤집는다.** 기록은 선수의 team_id 로, 점수는 team_id 비교로 붙기 때문에
  //   화면을 뒤집어도 스탯·점수는 한 건도 달라지지 않는다. 반대로 이 값을 보고
  //   home_team_id 를 바꾸면(= 기존 ⇄ 버튼이 하는 일) 과거 기록의 홈·원정이 통째로 어긋난다.
  //   그래서 팀을 **저장**하는 입력(팀 드롭다운·비정규 배정)에는 절대 태우지 않는다.
  const swappedQuarters = selectedSlot?.sides_swapped_quarters ?? []
  const sidesFlipped = swappedQuarters.includes(currentQuarter)
  /** 화면 왼쪽/오른쪽이 각각 어느 쪽인지. 좌우로 그리는 위젯은 이 둘만 본다. */
  const leftSide: 'home' | 'away' = sidesFlipped ? 'away' : 'home'
  const rightSide: 'home' | 'away' = sidesFlipped ? 'home' : 'away'

  /** 한쪽(홈 또는 어웨이)의 팀·점수 묶음 — 정의는 _lib/sides.ts 의 buildSideView. */
  function sideView(side: 'home' | 'away') {
    return buildSideView(side, selectedSlot, liveScore, homeRoster, awayRoster)
  }

  useStarterDefaults({ ...st }) // ③
  useInitialLoad({ ...st, leagueId }) // ④
  const { loadRoster, selectDate, selectSlot, refreshSlots, autoFillRotation } = useSlotCore({
    ...st, leagueId, leagueHeaders, setCurrentGame, resetLineup, setLineup,
  })
  useDeepLink({ ...st, leagueId, selectDate, selectSlot }) // ⑤
  const { loadAdhocTeams } = useDateTeams({ ...st, leagueId }) // ⑥⑦
  const { loadQuarterVideos } = useQuarterVideos({ ...st, leagueId }) // ⑧~⑫
  const { setFoulEvents, foulReqRef, refreshFoulEvents, foulCounts, teamFoulsOf } = useFoulCounts({ ...st, leagueId })
  const { resumeSnapRef, completedIdsRef, confirmLeave } = useResumeSession({ // ⑬~⑯
    ...st, leagueId, selectedSlot, activeVideo, ytPlayer,
  })
  useQuarterRestore({ ...st, leagueId, foulReqRef, setFoulEvents }) // ⑰

  // ── 동작 묶음 (effect 없음) ─────────────────────────────────────────
  const {
    toggleQuarterSides, teamOptions, teamNameById, createAdhocTeam, deleteAdhocTeam, saveTeams, swapSides,
    toggleExhibition, addSlot, deleteSlot, togglePlusOneQuarter, toggleExtraPlusOne,
  } = usePrepActions({
    ...st, leagueId, leagueHeaders, selectedSlot, sidesFlipped, swappedQuarters, resetLineup,
    refreshSlots, autoFillRotation, loadRoster, loadAdhocTeams,
  })
  const { attachVideo, clearQuarterVideo, loadYoutubeList, clearYoutubeUrl, syncYoutube } = useVideoActions({
    ...st, leagueId, leagueHeaders, selectedSlot, refreshSlots, autoFillRotation, loadQuarterVideos,
  })
  const {
    startGame, handlePlusOneSelect, completeGame, reopenGame, openCompleteModal, fetchLiveScore,
    handleEventSaved, addIrregularToTeam,
  } = useGameSession({
    ...st, leagueId, leagueHeaders, selectedSlot, setLineup, refreshSlots, selectSlot, loadRoster,
    refreshFoulEvents, resumeSnapRef, completedIdsRef,
  })
  const { toggleStarter, selectAllTeam, prevStarterSources, applyPrevStarters, handleDrop } = useStarterActions({
    ...st, leagueId, selectedSlot, addIrregularToTeam,
  })

  // 이미 홈/어웨이 명단에 들어있는지 체크
  const assignedIds = new Set([...homeRoster.map(p => p.id), ...awayRoster.map(p => p.id)])

  // ── 로딩 ─────────────────────────────────────────────────
  if (loadingDates) {
    return <div className="flex justify-center py-12"><BasketballLoader size={24} /></div>
  }

  // ── 날짜 없음 ─────────────────────────────────────────────
  if (scheduleDates.length === 0) {
    return (
      <EmptyState
        Icon={CalendarDays}
        title="등록된 경기 일정이 없습니다"
        description="경기 기록을 하려면 먼저 '일정' 탭에서 경기 날짜를 추가해 주세요."
      />
    )
  }

  // ── 날짜 미선택 ─── 「일정」 탭으로 안내 + 최근 경기일 바로가기 (_components/RecordLanding)
  if (!selectedDate) {
    return <RecordLanding orgSlug={orgSlug} leagueId={leagueId} scheduleDates={scheduleDates} selectDate={selectDate} />
  }

  // ── 슬롯 초기화 중 ────────────────────────────────────────
  if (initializingSlots) {
    return <div className="flex flex-col items-center gap-3 py-16" style={{ color: 'var(--mm-muted)' }}><Loader2 size={24} className="animate-spin" /><span className="text-sm">경기 슬롯 생성 중...</span></div>
  }

  const dateLabel = (() => {
    const d = new Date(selectedDate + 'T00:00:00')
    const days = ['일', '월', '화', '수', '목', '금', '토']
    return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`
  })()

  // ── 슬롯 그리드 + 기록 UI ─────────────────────────────────
  return (
    <div className="mm-brand space-y-4">
      <LeagueSubTabs group="games" />

      {/* 날짜 헤더 + YouTube 연동 (1행) */}
      <DateHeader
        orgSlug={orgSlug}
        leagueId={leagueId}
        dateLabel={dateLabel}
        isTournament={isTournament}
        leagueYtChannel={leagueYtChannel}
        ytSyncing={ytSyncing}
        syncYoutube={syncYoutube}
      />

      {/* 슬롯 그리드 + 「추가」 타일 */}
      <SlotGrid
        slots={slots}
        selectedSlotId={selectedSlotId}
        selectedDate={selectedDate}
        isTournament={isTournament}
        addingSlot={addingSlot}
        confirmLeave={confirmLeave}
        selectSlot={selectSlot}
        addSlot={addSlot}
      />

      {isTournament && slots.length === 0 && selectedDate && (
        <p className="text-center py-6 text-sm leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
          이 날짜에 등록된 대회 경기가 없습니다.<br />
          <span className="text-xs">대회 화면에서 <strong style={{ color: 'var(--mm-ink-soft)' }}>경기 추가</strong> 로 상대팀과 라운드를 넣어 등록하세요.</span>
        </p>
      )}

      {/* 슬롯 미선택 */}
      {!selectedSlotId && (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--mm-muted)' }}>
          위 슬롯을 선택하면 기록을 시작할 수 있습니다
        </div>
      )}

      {/* 선택된 슬롯 기록 UI */}
      {selectedSlot && (
        <div className="pt-4" style={{ borderTop: '1px solid var(--mm-rule)' }}>
          {/* ── 기록 준비 ── 경기 종류 · 팀 · 영상(접힘) · 고급(접힘) · 임시팀(친선전) */}
          <PrepCard
            selectedSlot={selectedSlot}
            isTournament={isTournament}
            gameStarted={gameStarted}
            teamOptions={teamOptions}
            pendingHome={pendingHome}
            pendingAway={pendingAway}
            setPendingHome={setPendingHome}
            setPendingAway={setPendingAway}
            saveTeams={saveTeams}
            savingTeam={savingTeam}
            swapSides={swapSides}
            swappingId={swappingId}
            toggleExhibition={toggleExhibition}
            videoPanel={
              <VideoPanel
                selectedSlot={selectedSlot}
                slots={slots}
                isTournament={isTournament}
                currentQuarter={currentQuarter}
                setCurrentQuarter={setCurrentQuarter}
                playingQuarter={playingQuarter}
                quarterVideos={quarterVideos}
                showQuarterUi={showQuarterUi}
                sidesFlipped={sidesFlipped}
                toggleQuarterSides={toggleQuarterSides}
                setQuarterSplitOpen={setQuarterSplitOpen}
                videoPanelOpen={videoPanelOpen}
                setVideoPanelOpen={setVideoPanelOpen}
                ytInput={ytInput}
                setYtInput={setYtInput}
                ytSaving={ytSaving}
                ytList={ytList}
                ytListLoading={ytListLoading}
                ytPickerOpen={ytPickerOpen}
                setYtPickerOpen={setYtPickerOpen}
                ytTargetQuarter={ytTargetQuarter}
                setYtTargetQuarter={setYtTargetQuarter}
                attachVideo={attachVideo}
                clearQuarterVideo={clearQuarterVideo}
                loadYoutubeList={loadYoutubeList}
              />
            }
            advancedPanel={
              <AdvancedPanel
                selectedSlot={selectedSlot}
                homeRoster={homeRoster}
                awayRoster={awayRoster}
                quarterVideos={quarterVideos}
                advancedOpen={advancedOpen}
                setAdvancedOpen={setAdvancedOpen}
                extraP1AllSlots={extraP1AllSlots}
                setExtraP1AllSlots={setExtraP1AllSlots}
                savingExtraP1={savingExtraP1}
                toggleExtraPlusOne={toggleExtraPlusOne}
                togglePlusOneQuarter={togglePlusOneQuarter}
                clearYoutubeUrl={clearYoutubeUrl}
                deleteSlot={deleteSlot}
                deletingSlot={deletingSlot}
              />
            }
            adhocPanel={selectedSlot.is_exhibition && (
              <AdhocTeamsPanel
                selectedDate={selectedDate}
                adhocTeams={adhocTeams}
                newTeamName={newTeamName}
                setNewTeamName={setNewTeamName}
                newTeamColor={newTeamColor}
                setNewTeamColor={setNewTeamColor}
                creatingTeam={creatingTeam}
                createAdhocTeam={createAdhocTeam}
                deletingTeamId={deletingTeamId}
                deleteAdhocTeam={deleteAdhocTeam}
              />
            )}
          />

          {/* 영상 먼저 — 팀 미지정 시 절반 크기로 표시 (16:9 비율 유지) */}
          {activeVideo && !selectedSlot.home_team_id && (
            <div className="mb-3 flex justify-center">
              <div className="w-1/2 rounded-xl overflow-hidden bg-black">
                <YouTubePlayer
                  key={activeVideo.url + '-pre'}
                  youtubeUrl={activeVideo.url}
                  startOffset={activeVideo.startOffset}
                />
              </div>
            </div>
          )}

          {/* 팀이 지정된 경우: 비디오(좌) + 기록(우) 2열 레이아웃 */}
          {selectedSlot.home_team_id && selectedSlot.away_team_id ? (
            <>
            <div className="lg:grid lg:grid-cols-[5fr_3fr] lg:gap-3 space-y-4 lg:space-y-0">

              {/* ── 좌측: 비디오 + 경기 제어 (sticky) ── */}
              <VideoColumn
                selectedSlot={selectedSlot}
                gameStarted={gameStarted}
                activeVideo={activeVideo}
                showQuarterUi={showQuarterUi}
                currentQuarter={currentQuarter}
                leftSide={leftSide}
                rightSide={rightSide}
                sideView={sideView}
                ytPlayer={ytPlayer}
                seekRelative={seekRelative}
                togglePlay={togglePlay}
                openCompleteModal={openCompleteModal}
              />

              {/* ── 우측: 기록 패널 ── */}
              <div className="space-y-3">
                {/* 모바일 탭 */}
                <div className="flex gap-1 lg:hidden">
                  {(['record', 'stats'] as const).map(tab => (
                    <button key={tab} onClick={() => setMobileTab(tab)}
                      className="flex-1 py-2 text-xs font-bold transition-colors cursor-pointer min-h-[44px]"
                      style={mobileTab === tab
                        ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '4px' }
                        : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }
                      }>
                      {tab === 'record' ? '기록' : '통계'}
                    </button>
                  ))}
                </div>

                <div className={mobileTab === 'record' ? '' : 'hidden lg:block'}>
                  {selectedSlot?.is_complete ? (
                    /* ── 마감된 경기 배너 ── */
                    <CompletedBanner
                      selectedSlot={selectedSlot}
                      liveScore={liveScore}
                      reopening={reopening}
                      reopenGame={reopenGame}
                      setShowGameLog={setShowGameLog}
                    />
                  ) : gameStarted ? (
                    <>
                      {/* 컴팩트 스코어 스트립 */}
                      <ScoreStrip
                        selectedSlot={selectedSlot}
                        homeRoster={homeRoster}
                        awayRoster={awayRoster}
                        currentQuarter={currentQuarter}
                        hideQuarterLabel={singleSegment}
                        leftSide={leftSide}
                        rightSide={rightSide}
                        sideView={sideView}
                        teamFoulsOf={teamFoulsOf}
                        setShowGameLog={setShowGameLog}
                        setPlusOneConflict={setPlusOneConflict}
                        setShowPlusOneModal={setShowPlusOneModal}
                        setShowSubModal={setShowSubModal}
                        setShowBoxscoreModal={setShowBoxscoreModal}
                      />

                      {/* 쿼터 선택 — 영상 한 편이 곧 한 경기(한 쿼터)인 경기에서는 감춘다(singleSegment) */}
                      {!singleSegment && <QuarterSelector currentQuarter={currentQuarter} setCurrentQuarter={setCurrentQuarter} />}

                      {/* 입력 패드 · 상대 점수 안내(대회) · 게스트·임시 선수 · 타팀 임시 출전 */}
                      <RecordingTools
                        leagueId={leagueId}
                        leagueHeaders={leagueHeaders}
                        selectedSlot={selectedSlot}
                        selectedSlotId={selectedSlotId}
                        currentQuarter={currentQuarter}
                        isTournament={isTournament}
                        leftSide={leftSide}
                        rightSide={rightSide}
                        sideView={sideView}
                        onCourt={onCourt}
                        homeRoster={homeRoster}
                        awayRoster={awayRoster}
                        irregularRoster={irregularRoster}
                        assignedIds={assignedIds}
                        foulCounts={foulCounts}
                        activePlusOneIds={activePlusOneIds}
                        oppTeam={oppTeam}
                        handleEventSaved={handleEventSaved}
                        fetchLiveScore={fetchLiveScore}
                        loadRoster={loadRoster}
                        setPendingIrregular={setPendingIrregular}
                      />
                    </>
                  ) : (
                    /* 드래그 앤 드롭 선발 선수 선택 */
                    <StarterSelect
                      selectedSlot={selectedSlot}
                      isTournament={isTournament}
                      homeRoster={homeRoster}
                      awayRoster={awayRoster}
                      irregularRoster={irregularRoster}
                      rosterLoading={rosterLoading}
                      ourSide={ourSide}
                      ourRoster={ourRoster}
                      leftSide={leftSide}
                      rightSide={rightSide}
                      sideView={sideView}
                      selectedStarters={selectedStarters}
                      toggleStarter={toggleStarter}
                      selectAllTeam={selectAllTeam}
                      dragOverSide={dragOverSide}
                      setDragOverSide={setDragOverSide}
                      draggingPlayerId={draggingPlayerId}
                      setDraggingPlayerId={setDraggingPlayerId}
                      handleDrop={handleDrop}
                      prevStarterSources={prevStarterSources}
                      applyPrevStarters={applyPrevStarters}
                      applyingPrevStarters={applyingPrevStarters}
                      addIrregularToTeam={addIrregularToTeam}
                      addingIrregular={addingIrregular}
                      setPendingIrregular={setPendingIrregular}
                      teamNameById={teamNameById}
                      startGame={startGame}
                      startingGame={startingGame}
                    />
                  )}
                </div>

                {/* 통계 (모바일) */}
                <div className={mobileTab === 'stats' ? 'lg:hidden' : 'hidden'}>
                  <LeagueStatsPanel
                    leagueId={leagueId}
                    gameId={selectedSlotId}
                    players={allPlayers}
                    refreshKey={statsRefresh}

                    homePlayers={homeRoster}
                    awayPlayers={awayRoster}
                    homeTeam={selectedSlot?.home_team ?? undefined}
                    awayTeam={selectedSlot?.away_team ?? undefined}
                  />
                </div>
              </div>
            </div>

            {/* 비정규 선수 팀 선택 미니 모달 */}
              {pendingIrregular && (
                <IrregularTeamModal
                  selectedSlot={selectedSlot}
                  pendingIrregular={pendingIrregular}
                  setPendingIrregular={setPendingIrregular}
                  addIrregularToTeam={addIrregularToTeam}
                  addingIrregular={addingIrregular}
                />
              )}

              {/* 교체 모달 */}
              {showSubModal && (
                <SubstitutionModal
                  leagueId={leagueId}
                  leagueHeaders={leagueHeaders}
                  selectedSlot={selectedSlot}
                  selectedSlotId={selectedSlotId}
                  currentQuarter={currentQuarter}
                  allPlayers={allPlayers}
                  homeRoster={homeRoster}
                  awayRoster={awayRoster}
                  minutes={minutes}
                  setShowSubModal={setShowSubModal}
                  setMinutes={setMinutes}
                  setHomeRoster={setHomeRoster}
                  setAwayRoster={setAwayRoster}
                />
              )}

              {/* 박스스코어 모달 */}
              {showBoxscoreModal && (
                <BoxscoreModal
                  leagueId={leagueId}
                  selectedSlot={selectedSlot}
                  selectedSlotId={selectedSlotId}
                  allPlayers={allPlayers}
                  statsRefresh={statsRefresh}
                  homeRoster={homeRoster}
                  awayRoster={awayRoster}
                  setShowBoxscoreModal={setShowBoxscoreModal}
                />
              )}

              {/* 플러스원 선수 선택 모달 */}
              {showPlusOneModal && plusOneConflict && (
                <PlusOneModal
                  plusOneConflict={plusOneConflict}
                  setShowPlusOneModal={setShowPlusOneModal}
                  handlePlusOneSelect={handlePlusOneSelect}
                />
              )}

              {/* 경기 종료 모달 */}
              {showComplete && (
                <CompleteModal
                  selectedSlot={selectedSlot}
                  isTournament={isTournament}
                  oppTeam={oppTeam}
                  oppFinalScore={oppFinalScore}
                  setOppFinalScore={setOppFinalScore}
                  liveScore={liveScore}
                  setLiveScore={setLiveScore}
                  fetchLiveScore={fetchLiveScore}
                  completeGame={completeGame}
                  completing={completing}
                  savingOppScore={savingOppScore}
                  setShowComplete={setShowComplete}
                />
              )}
            </>
          ) : (
            <div className="text-center py-8 text-sm" style={{ color: 'var(--mm-muted)' }}>
              홈·어웨이 팀을 선택하고 저장하면 기록을 시작할 수 있습니다
            </div>
          )}
        </div>
      )}
      {/* 게임 이벤트 로그 모달 */}
      {showGameLog && selectedSlotId && (
        <GameLogModal
          gameId={selectedSlotId}
          leagueId={leagueId}
          leagueHeaders={leagueHeaders}
          allPlayers={[...homeRoster, ...awayRoster, ...allPlayers.filter(p => !homeRoster.some(r => r.id === p.id) && !awayRoster.some(r => r.id === p.id))]}
          onCourtIds={onCourt}
          isEditMode={true}
          onClose={() => setShowGameLog(false)}
          onChanged={() => {
            fetchLiveScore()
            setStatsRefresh(k => k + 1)
            refreshFoulEvents()
          }}
          homeTeam={selectedSlot?.home_team ?? undefined}
          awayTeam={selectedSlot?.away_team ?? undefined}
        />
      )}
    </div>
  )
}
