import { useState } from 'react'
import type { LeaguePlayer, LeagueTeam } from '@/types/league'
import type { GameSlot, IrregularPlayer, MinRow, ResumeEntry, RosterPlayer, ScheduleDate } from '../_lib/types'

// ── 기록 화면의 상태 모음 ─────────────────────────────────────────────
//   분리 전(page.tsx RecordInner)에 흩어져 있던 useState 를 그대로 옮겨 왔다 — 값·초기값·주석 그대로.
//   여러 훅·패널이 같은 값을 함께 쓰므로 한곳에 두고, 페이지가 필요한 훅에 넘겨 준다.
//   ⚠ 여기에는 effect 를 두지 않는다(effect 순서는 page.tsx 의 훅 호출 순서가 정한다).
export function useRecordState() {
  const [scheduleDates, setScheduleDates] = useState<ScheduleDate[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [slots, setSlots] = useState<GameSlot[]>([])
  const [teams, setTeams] = useState<LeagueTeam[]>([])
  const [allPlayers, setAllPlayers] = useState<LeaguePlayer[]>([])
  const [leagueYtChannel, setLeagueYtChannel] = useState<string | null>(null)
  const [dateQuarterMap, setDateQuarterMap] = useState<Record<string, string>>({})
  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [loadingDates, setLoadingDates] = useState(true)
  const [initializingSlots, setInitializingSlots] = useState(false)
  const [ytSyncing, setYtSyncing] = useState(false)
  const [minutes, setMinutes] = useState<MinRow[]>([])
  const [statsRefresh, setStatsRefresh] = useState(0)
  const [mobileTab, setMobileTab] = useState<'record' | 'stats'>('record')

  // 분기별 홈/어웨이 선수 명단
  const [homeRoster, setHomeRoster] = useState<RosterPlayer[]>([])
  const [awayRoster, setAwayRoster] = useState<RosterPlayer[]>([])
  const [irregularRoster, setIrregularRoster] = useState<IrregularPlayer[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [pendingIrregular, setPendingIrregular] = useState<IrregularPlayer | null>(null)
  const [addingIrregular, setAddingIrregular] = useState(false)

  // 슬롯 수동 추가·삭제 — games_per_round 는 시즌 설정이라 특정 날짜만 늘릴 수단이 없었다.
  const [savingExtraP1, setSavingExtraP1] = useState<string | null>(null)
  // 슬롯을 쿼터 단위로 쓰는 날은 한 경기가 슬롯 4칸이라, 한 칸씩 지정하면 네 번을 눌러야 한다
  const [extraP1AllSlots, setExtraP1AllSlots] = useState(false)
  const [addingSlot, setAddingSlot] = useState(false)
  const [deletingSlot, setDeletingSlot] = useState(false)

  // 영상 수동 연동 — 자동 매핑은 제목 규칙에 기대므로 규칙이 깨지는 날이 있다(쿼터별로 쪼갠
  //   영상 등). 그때 손으로 붙일 수단이 없으면 그 날짜 기록 전체가 영상 없이 진행된다.
  const [ytInput, setYtInput] = useState('')
  const [ytSaving, setYtSaving] = useState(false)
  const [ytPickerOpen, setYtPickerOpen] = useState(false)
  const [ytList, setYtList] = useState<{ video_id: string; title: string; url: string; thumbnail: string | null }[]>([])
  const [ytListLoading, setYtListLoading] = useState(false)

  // 친선전 전용 임시팀 — 선택한 날짜에만 유효하다(109). 상시 3팀과 별도로 들고 있는 이유는
  //   둘의 수명이 다르기 때문이다. teams 는 분기 override 로 이름이 갈리고, 이쪽은 그날로 끝난다.
  const [adhocTeams, setAdhocTeams] = useState<LeagueTeam[]>([])
  const [newTeamName, setNewTeamName] = useState('')
  const [newTeamColor, setNewTeamColor] = useState('#3b82f6')
  const [creatingTeam, setCreatingTeam] = useState(false)
  const [deletingTeamId, setDeletingTeamId] = useState<string | null>(null)

  // 팀 선택 (슬롯별)
  const [pendingHome, setPendingHome] = useState('')
  const [pendingAway, setPendingAway] = useState('')
  const [savingTeam, setSavingTeam] = useState(false)
  // 기록 준비 카드의 접힘 상태. 영상·고급 설정은 대부분의 경기에서 손대지 않으므로 접어 둔다
  //   (실측 2026-09-07: 리그 282경기 중 +1 조정 4% · 쿼터별 +1 0% · 영상은 100% 자동 연결).
  const [videoPanelOpen, setVideoPanelOpen] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [swappingId, setSwappingId] = useState<string | null>(null)

  // 경기 진행
  const [gameStarted, setGameStarted] = useState(false)
  const [startingGame, setStartingGame] = useState(false)
  const [showComplete, setShowComplete] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [liveScore, setLiveScore] = useState<{ home: number; away: number } | null>(null)
  const [currentQuarter, setCurrentQuarter] = useState(1)
  const [showGameLog, setShowGameLog] = useState(false)
  const [showSubModal, setShowSubModal] = useState(false)
  const [showBoxscoreModal, setShowBoxscoreModal] = useState(false)

  // 선발 체크: 선택된 선수 ID 셋 (홈+어웨이 통합)
  const [selectedStarters, setSelectedStarters] = useState<Set<string>>(new Set())

  // 드래그 앤 드롭
  const [dragOverSide, setDragOverSide] = useState<'home' | 'away' | null>(null)
  const [draggingPlayerId, setDraggingPlayerId] = useState<string | null>(null)

  // 플러스원 충돌 모달
  const [showPlusOneModal, setShowPlusOneModal] = useState(false)
  const [plusOneConflict, setPlusOneConflict] = useState<{ teamName: string; players: RosterPlayer[] } | null>(null)
  const [activePlusOneIds, setActivePlusOneIds] = useState<string[]>([])

  // ── 대회 묶음의 쿼터별 영상 ────────────────────────────────────────
  //   촬영본이 쿼터로 쪼개져 올라오는 경기(대회)는 "경기 하나 = 영상 하나" 전제가 깨진다.
  //   경기를 슬롯 4칸으로 쪼개는 우회(8/22 친선전)는 대회에서 쓸 수 없다 — 대회 보드의
  //   전적 판정이 경기 행을 세므로 4쿼터짜리 2경기가 "4승 4패" 로 읽힌다.
  const [isTournament, setIsTournament] = useState(false)
  const [quarterVideos, setQuarterVideos] = useState<Record<number, { url: string; start_offset: number }>>({})
  // 링크 입력·목록 고르기가 어느 쿼터를 채우는지. 기본은 지금 기록 중인 쿼터.
  const [ytTargetQuarter, setYtTargetQuarter] = useState(1)
  // quarterVideos 가 **어느 경기 것인지**. setQuarterVideos 와 항상 같은 배치로 바꾼다 —
  //   따로 두면 "앞 경기 영상 표 + 지금 경기 id" 조합이 생겨, 아래 시작 쿼터 보정이
  //   남의 경기 영상을 근거로 기록 쿼터를 정하게 된다.
  const [videosLoadedFor, setVideosLoadedFor] = useState<string | null>(null)
  // 이 슬롯에 저장된 기록이 있는지. 쿼터 복원(이벤트 최대 쿼터)이 끝났다는 신호도 겸한다.
  const [quarterRestore, setQuarterRestore] = useState<{ slotId: string; hasEvents: boolean } | null>(null)
  // 쿼터 영상이 하나도 없는 경기(옛 `260919 경기3` 번호형)에서 쿼터 UI 를 손으로 펼친 상태.
  //   왜: 그런 날은 쿼터 개념 자체가 없어 화면에서 감추지만, 나중에 쿼터별로 쪼갠 영상을
  //   붙이려면 되돌아올 길이 있어야 한다.
  const [quarterSplitOpen, setQuarterSplitOpen] = useState(false)

  // 마감 모달에서 넣는 상대 최종 점수(112). 우리 점수는 기록에서 나오므로 여기 없다.
  const [oppFinalScore, setOppFinalScore] = useState('')
  const [savingOppScore, setSavingOppScore] = useState(false)

  // 「지난 경기와 같은 선발」 적용 중 (useStarterActions)
  const [applyingPrevStarters, setApplyingPrevStarters] = useState(false)

  // ── 돌아왔을 때 그 장면으로 ─────────────────────────────────────────
  //   쿼터는 **아래 「이벤트 기반 쿼터 복원」이 끝난 뒤에** 덮어쓴다(quarterRestore 도착을 기다림) —
  //   먼저 덮으면 복원 effect 가 늦게 와서 마지막 기록 쿼터로 되돌려 버린다. 둘이 다르면
  //   기록원이 실제로 보고 있던 쿼터(저장값)가 이긴다. 시작 쿼터 보정은 시작된 경기에서 물러나므로 안 싸운다.
  const [resumeTarget, setResumeTarget] = useState<ResumeEntry | null>(null)

  return {
    scheduleDates, setScheduleDates, selectedDate, setSelectedDate,
    slots, setSlots, teams, setTeams,
    allPlayers, setAllPlayers, leagueYtChannel, setLeagueYtChannel,
    dateQuarterMap, setDateQuarterMap, selectedSlotId, setSelectedSlotId,
    loadingDates, setLoadingDates, initializingSlots, setInitializingSlots,
    ytSyncing, setYtSyncing, minutes, setMinutes,
    statsRefresh, setStatsRefresh, mobileTab, setMobileTab,
    homeRoster, setHomeRoster, awayRoster, setAwayRoster,
    irregularRoster, setIrregularRoster, rosterLoading, setRosterLoading,
    pendingIrregular, setPendingIrregular, addingIrregular, setAddingIrregular,
    savingExtraP1, setSavingExtraP1, extraP1AllSlots, setExtraP1AllSlots,
    addingSlot, setAddingSlot, deletingSlot, setDeletingSlot,
    ytInput, setYtInput, ytSaving, setYtSaving,
    ytPickerOpen, setYtPickerOpen, ytList, setYtList,
    ytListLoading, setYtListLoading, adhocTeams, setAdhocTeams,
    newTeamName, setNewTeamName, newTeamColor, setNewTeamColor,
    creatingTeam, setCreatingTeam, deletingTeamId, setDeletingTeamId,
    pendingHome, setPendingHome, pendingAway, setPendingAway,
    savingTeam, setSavingTeam, videoPanelOpen, setVideoPanelOpen,
    advancedOpen, setAdvancedOpen, swappingId, setSwappingId,
    gameStarted, setGameStarted, startingGame, setStartingGame,
    showComplete, setShowComplete, completing, setCompleting,
    reopening, setReopening, liveScore, setLiveScore,
    currentQuarter, setCurrentQuarter, showGameLog, setShowGameLog,
    showSubModal, setShowSubModal, showBoxscoreModal, setShowBoxscoreModal,
    selectedStarters, setSelectedStarters, dragOverSide, setDragOverSide,
    draggingPlayerId, setDraggingPlayerId, showPlusOneModal, setShowPlusOneModal,
    plusOneConflict, setPlusOneConflict, activePlusOneIds, setActivePlusOneIds,
    isTournament, setIsTournament, quarterVideos, setQuarterVideos,
    ytTargetQuarter, setYtTargetQuarter, videosLoadedFor, setVideosLoadedFor,
    quarterRestore, setQuarterRestore, quarterSplitOpen, setQuarterSplitOpen,
    oppFinalScore, setOppFinalScore, savingOppScore, setSavingOppScore,
    applyingPrevStarters, setApplyingPrevStarters, resumeTarget, setResumeTarget,
  }
}

export type RecordState = ReturnType<typeof useRecordState>
