'use client'
import LeagueSubTabs from '@/components/league/LeagueSubTabs'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { useGameStore } from '@/store/gameStore'
import { useLineupStore } from '@/store/lineupStore'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  Lock, Loader2, Play, Square, ChevronLeft,
  CheckCircle2, Circle, Youtube, RefreshCw, UserPlus, ClipboardList,
  CalendarDays, PlayCircle, Zap, AlertTriangle, Sparkles, X, ArrowLeftRight, Wand2,
  Link2, Search, Plus, Trash2,
} from 'lucide-react'
import { volumeForRound } from '@/lib/social/volume'
import { generateRotation, resolveFirstGame } from '@/lib/league/rotation'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import EmptyState from '@/components/league/EmptyState'
import YouTubePlayer from '@/components/record/YouTubePlayer'
import LeagueEventInputPad from '@/components/league/LeagueEventInputPad'
import RecordAuditPanel from '@/components/league/RecordAuditPanel'
import LeagueSubstitutionPanel from '@/components/league/LeagueSubstitutionPanel'
import LeagueStatsPanel from '@/components/league/LeagueStatsPanel'
import GameLogModal from '@/components/league/GameLogModal'
import type { LeaguePlayer, LeagueTeam } from '@/types/league'
import { textOnBg, accentOrInk } from '@/lib/util/contrastColor'

// 정식 경기(1~4쿼터 + 연장)용 선택지. league_game_events.quarter 는 CHECK(1~6) 이라 연장은 2회까지.
// 미라클의 짧은 슬롯 경기는 쿼터를 나누지 않으므로 1 을 그대로 두면 기존 기록과 동일하다.
const QUARTER_OPTIONS = [
  { value: 1, label: '1Q' }, { value: 2, label: '2Q' },
  { value: 3, label: '3Q' }, { value: 4, label: '4Q' },
  { value: 5, label: '연장' }, { value: 6, label: '연장2' },
] as const

type ScheduleDate = { id: string; date: string }
type GameSlot = {
  id: string; slot_num: number; date: string; is_complete: boolean; is_started: boolean
  is_exhibition?: boolean
  /** 이 경기에서만 +1 로 치는 선수 (110). 전역 플래그·배타 지정에 더해진다. */
  plus_one_extra_ids?: string[] | null
  home_score: number; away_score: number
  youtube_url?: string | null; youtube_start_offset?: number
  home_team_id?: string | null; away_team_id?: string | null
  quarter_id?: string | null
  home_team?: { id: string; name: string; color: string; is_external?: boolean } | null
  away_team?: { id: string; name: string; color: string; is_external?: boolean } | null
}
type MinRow = { id: string; league_player_id: string; league_game_id: string; out_time: number | null }
type RosterPlayer = LeaguePlayer & { team_id?: string; is_regular?: boolean }
type IrregularPlayer = LeaguePlayer & { team_id: string | null; is_regular: boolean | null }

// ── 메인 페이지 ──────────────────────────────────────────────
export default function LeagueRecordPage() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params
  const { isEditMode, leagueHeaders, openPinModal } = useLeagueEditMode()

  if (!isEditMode) {
    return (
      <div className="mm-brand flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center">
        <Lock size={24} style={{ color: 'var(--mm-muted)' }} />
        <div>
          <h3
            className="font-bold text-2xl"
            style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
          >
            편집 모드 전용
          </h3>
          <p className="text-sm mt-1" style={{ color: 'var(--mm-muted)' }}>
            경기 기록은 편집 모드에서만 가능합니다
          </p>
        </div>
        <button
          onClick={openPinModal}
          className="px-5 py-2 text-sm font-bold uppercase tracking-[0.14em] cursor-pointer transition-colors"
          style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '4px' }}
        >
          PIN 입력
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

  // ── YouTube 원격 제어 ────────────────────────────────────────
  function seekRelative(delta: number) {
    if (!ytPlayer) return
    try {
      ytPlayer.seekTo((ytPlayer.getCurrentTime() ?? 0) + delta, true)
      ytPlayer.unMute()
    } catch {}
  }
  function togglePlay() {
    if (!ytPlayer) return
    try {
      const state = ytPlayer.getPlayerState()
      if (state === 1 /* PLAYING */) ytPlayer.pauseVideo()
      else { ytPlayer.unMute(); ytPlayer.playVideo() }
    } catch {}
  }

  // Backspace 핸들러를 위해 최신 selectedSlotId 보관 (state 정의 전에 ref 생성)
  const selectedSlotIdRef = useRef<string>('')
  const deleteLastEventRef = useRef<() => Promise<void>>(async () => {})

  // 키보드 단축키: Space(재생/정지), ←/→(±5s), Shift+←/→(±10s), Backspace(마지막 이벤트 삭제)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.code === 'Backspace') {
        e.preventDefault()
        deleteLastEventRef.current()
        return
      }
      if (!ytPlayer) return
      if (e.code === 'Space')      { e.preventDefault(); togglePlay() }
      else if (e.code === 'ArrowLeft')  { e.preventDefault(); seekRelative(e.shiftKey ? -10 : -5) }
      else if (e.code === 'ArrowRight') { e.preventDefault(); seekRelative(e.shiftKey ? 10 : 5) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ytPlayer]) // eslint-disable-line react-hooks/exhaustive-deps

  const [scheduleDates, setScheduleDates] = useState<ScheduleDate[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [slots, setSlots] = useState<GameSlot[]>([])
  const [teams, setTeams] = useState<LeagueTeam[]>([])
  const [allPlayers, setAllPlayers] = useState<LeaguePlayer[]>([])
  const [leagueYtChannel, setLeagueYtChannel] = useState<string | null>(null)
  const [plusOneAge, setPlusOneAge] = useState<number | null>(null)
  const [dateStats, setDateStats] = useState<Record<string, { total: number; yt: number; complete: number; started: number; unused: number; pending: number }>>({})
  const [quarters, setQuarters] = useState<{ id: string; year: number; quarter: number }[]>([])
  const [selectedQFilter, setSelectedQFilter] = useState<'all' | string>('all')
  const [dateQuarterMap, setDateQuarterMap] = useState<Record<string, string>>({})
  const [selectedSlotId, setSelectedSlotId] = useState('')
  const [loadingDates, setLoadingDates] = useState(true)
  const [initializingSlots, setInitializingSlots] = useState(false)
  const [ytSyncing, setYtSyncing] = useState(false)
  const [minutes, setMinutes] = useState<MinRow[]>([])
  // 후보 버튼 정렬 힌트 — 실패해도 기록에는 지장이 없어 조용히 비워 둔다(순서만 기본값이 된다)
  const [tendencies, setTendencies] = useState<{ assist: Record<string, string[]>; rebound: string[] }>()
  const [statsRefresh, setStatsRefresh] = useState(0)
  // 라운드가 방금 전수 마감됐을 때 뜨는 안내 (인스타 카드 발행 유도). null = 안 뜸
  const [roundDone, setRoundDone] = useState<{ date: string; vol: number | null } | null>(null)
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

  // 팀 선택 (슬랏별)
  const [pendingHome, setPendingHome] = useState('')
  const [pendingAway, setPendingAway] = useState('')
  const [savingTeam, setSavingTeam] = useState(false)
  const [autoFilling, setAutoFilling] = useState(false)
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
  const [showStarterPicker, setShowStarterPicker] = useState(false)
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

  const selectedSlot = slots.find(s => s.id === selectedSlotId) ?? null

  // 지금 화면에서 재생해야 할 영상 — 대회는 기록 중인 쿼터의 영상, 없으면 경기 대표 영상.
  //   판정 규칙은 서버의 gameVideo.ts 와 같다(쿼터 영상 우선 → 대표 폴백).
  const activeVideo: { url: string; startOffset: number } | null = (() => {
    if (!selectedSlot) return null
    const q = quarterVideos[currentQuarter]
    if (q) return { url: q.url, startOffset: q.start_offset }
    if (selectedSlot.youtube_url) return { url: selectedSlot.youtube_url, startOffset: selectedSlot.youtube_start_offset ?? 0 }
    return null
  })()

  // 슬롯 단위로 한 번만 자동 초기화 — 비정규 선수 추가 등 같은 슬롯 내 roster 변경 시엔 유지
  const initializedSlotRef = useRef<string | null>(null)
  useEffect(() => {
    if (gameStarted) return
    if (!selectedSlotId) { initializedSlotRef.current = null; return }
    if (homeRoster.length === 0 && awayRoster.length === 0) return
    // 같은 슬롯에서 이미 초기화 완료 → 추가 갱신은 사용자의 선택을 보존
    if (initializedSlotRef.current === selectedSlotId) return

    // 정규 선수만 기본 체크 (비정규는 기본 미체크 — GP 오염 방지)
    const regularIds = [...homeRoster, ...awayRoster]
      .filter(p => p.is_regular !== false)
      .map(p => p.id)
    setSelectedStarters(new Set(regularIds))
    initializedSlotRef.current = selectedSlotId
  }, [homeRoster, awayRoster, gameStarted, selectedSlotId])


  // 날짜별 집계 — 서버가 이미 세어 준 값을 받는다(`/games/date-summary`).
  //   예전에는 `/games` 로 전 경기(303행 × 전 컬럼 + 팀 조인)를 받아 브라우저에서 셌다.
  //   화면에 쓰이는 건 날짜당 숫자 넷뿐이고, 무엇보다 PostgREST 가 1000행에서 조용히 잘려
  //   시즌이 쌓이면 뒷부분이 통째로 빠진 집계가 나온다.
  //   unused/pending 만 여기서 가른다 — '오늘' 기준이라 서버 시간대에 맡기지 않는다.
  function applyDateSummaries(rows: Array<{ date: string; total: number; started: number; complete: number; yt: number }>) {
    const today = new Date().toISOString().slice(0, 10)
    const stats: Record<string, { total: number; yt: number; complete: number; started: number; unused: number; pending: number }> = {}
    for (const r of rows) {
      // 시작도 마감도 안 된 슬롯 = 과거면 미사용(영상이 9개 안 됐던 날의 남은 칸), 오늘·미래면 미시작
      const idle = r.total - r.complete - Math.max(0, r.started - r.complete)
      stats[r.date] = {
        total: r.total,
        yt: r.yt,
        complete: r.complete,
        started: Math.max(0, r.started - r.complete),
        unused: r.date < today ? idle : 0,
        pending: r.date < today ? 0 : idle,
      }
    }
    setDateStats(stats)
  }

  // 초기 로드
  useEffect(() => {
    async function init() {
      setLoadingDates(true)
      const [dRes, tRes, pRes, lRes, gRes, qRes] = await Promise.all([
        fetch(`/api/leagues/${leagueId}/schedule-dates`),
        fetch(`/api/leagues/${leagueId}/teams`),
        // 기록 화면은 상대 선수를 눌러 득점을 남겨야 하므로 옵트인
        fetch(`/api/leagues/${leagueId}/players?includeExternal=1`),
        fetch(`/api/leagues/${leagueId}`),
        // 집계 전용 — 전 경기(303행 × 전 컬럼 + 팀 조인)를 받던 것을 날짜당 한 줄로 줄였다.
        fetch(`/api/leagues/${leagueId}/games/date-summary`),
        fetch(`/api/leagues/${leagueId}/quarters`),
      ])
      if (dRes.ok) setScheduleDates(await dRes.json())
      if (tRes.ok) setTeams(await tRes.json())
      if (pRes.ok) setAllPlayers(await pRes.json())
      if (lRes.ok) {
        const ld = await lRes.json()
        setLeagueYtChannel(ld.youtube_channel ?? null)
        setPlusOneAge(ld.plus_one_age ?? null)
        // 대회 묶음이면 영상 연동이 통째로 다르다 — 경기 하나에 쿼터별 영상 4개가 붙고,
        //   제목 추측 방식의 자동 매핑은 쓰지 않는다(엉뚱한 자리에 조용히 붙는다).
        setIsTournament(ld.mode === 'tournament')
      }
      if (qRes.ok) setQuarters(await qRes.json())
      if (gRes.ok) {
        const summaries = await gRes.json()
        applyDateSummaries(summaries)
        // 날짜 → 분기 맵 — 집계 응답이 날짜당 quarter_id 를 함께 준다(전 경기 순회 불필요)
        const dqMap: Record<string, string> = {}
        for (const r of summaries as Array<{ date: string; quarter_id: string | null }>) {
          if (r.date && r.quarter_id) dqMap[r.date] = r.quarter_id
        }
        setDateQuarterMap(dqMap)
      }
      setLoadingDates(false)
      // 후보 정렬 힌트는 있으면 좋은 것이라 초기 로딩을 붙잡지 않는다(뒤늦게 채워도 무해)
      fetch(`/api/leagues/${leagueId}/tendencies`)
        .then(r => r.ok ? r.json() : null)
        .then(t => { if (t) setTendencies(t) })
        .catch(() => {})
    }
    init()
  }, [leagueId])

  // 대회 관리 화면의 「기록」 버튼이 보내는 딥링크 — `?date=YYYY-MM-DD&game=<id>`.
  //   없으면 종전대로 날짜 목록부터 시작한다.
  //   ⚠ `useSearchParams()` 를 쓰지 않는다 — 이 페이지는 Suspense 경계가 없어서 그걸 쓰면
  //     빌드가 깨진다(일정 화면이 같은 이유로 내부 컴포넌트를 분리해 뒀다).
  //     여기서 필요한 건 최초 1회 읽기뿐이라 location 으로 충분하다.
  const deepLinkRef = useRef(false)
  useEffect(() => {
    if (deepLinkRef.current) return
    if (loadingDates || scheduleDates.length === 0) return
    const sp = new URLSearchParams(window.location.search)
    const date = sp.get('date')
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { deepLinkRef.current = true; return }
    deepLinkRef.current = true
    ;(async () => {
      await selectDate(date)
      // 슬롯은 selectDate 의 setState 가 반영된 뒤에야 목록에 있다 — 여기서 직접 다시 읽는다.
      const gameId = sp.get('game')
      if (!gameId) return
      const res = await fetch(`/api/leagues/${leagueId}/games?date=${date}`, { cache: 'no-store' })
      if (!res.ok) return
      const rows = (await res.json()) as GameSlot[]
      const hit = rows.find(s => s.id === gameId)
      if (hit) await selectSlot(hit)
    })()
    // selectDate/selectSlot 은 매 렌더 새로 만들어진다 — 넣으면 매번 다시 돈다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingDates, scheduleDates.length, leagueId])

  // 선택한 날짜/슬랏의 분기로 teams 자동 갱신 — 분기별 팀명/색상 override 적용
  //   버그 수정 (2026-07-18): dateQuarterMap 이 초기 로딩 타이밍 문제로 미준비 상태이거나
  //     이전 분기 teams 상태(락다운 등)가 남아있는 경우 잘못된 이름이 dropdown 에 노출됨.
  //   개선: selectedSlot 이 있으면 slot.quarter_id (더 직접적) · 없으면 dateQuarterMap fallback.
  //         cache: 'no-store' 로 Next.js fetch dedupe 캐시 방지.
  //   슬랏 목록(slots)에서 selectedSlotId 로 찾은 slot 의 quarter_id 가 최우선.
  useEffect(() => {
    if (!selectedDate) return
    const slotQid = slots.find(s => s.id === selectedSlotId)?.quarter_id
    const qid = slotQid ?? dateQuarterMap[selectedDate]
    if (!qid) return
    fetch(`/api/leagues/${leagueId}/teams?quarterId=${qid}`, { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(ts => { if (Array.isArray(ts)) setTeams(ts) })
      .catch(() => null)
  }, [leagueId, selectedDate, selectedSlotId, dateQuarterMap, slots])

  // 이 날짜의 임시팀 로드 — 날짜를 고르는 순간 받아 둔다. 친선전 토글 뒤에 로드하면
  //   드롭다운이 한 박자 비어 보이고, 기록원은 그걸 "팀을 못 만든다"로 읽는다.
  async function loadAdhocTeams(date: string) {
    if (!date) { setAdhocTeams([]); return }
    const res = await fetch(`/api/leagues/${leagueId}/teams?exhibitionDate=${date}`, { cache: 'no-store' })
      .catch(() => null)
    if (res?.ok) {
      const ts = await res.json()
      setAdhocTeams(Array.isArray(ts) ? ts : [])
    } else {
      setAdhocTeams([])
    }
  }
  useEffect(() => { loadAdhocTeams(selectedDate) }, [leagueId, selectedDate]) // eslint-disable-line react-hooks/exhaustive-deps

  // 날짜가 바뀌면 영상 목록 캐시를 버린다 — 안 버리면 다른 날짜 영상이 그대로 뜬다
  useEffect(() => { setYtList([]); setYtPickerOpen(false); setYtInput('') }, [selectedDate, selectedSlotId])

  async function loadRoster(slot: GameSlot) {
    if (!slot.home_team_id || !slot.away_team_id) return
    setRosterLoading(true)
    let assignedIrregularIds: string[] = []
    // roster API 응답의 resolved quarter_id 를 사용 — 게임에 quarter_id 가 null 로 저장되어 있어도
    // 서버에서 date 매칭으로 자동 유추 후 반환 (그리고 백필). 이 값으로 미배정 풀도 조회해야
    // 게스트/비정규 선수 추가가 정상 동작.
    let effectiveQuarterId: string | null = slot.quarter_id ?? null
    const rRes = await fetch(`/api/leagues/${leagueId}/games/${slot.id}/roster`)
    if (rRes.ok) {
      const rd = await rRes.json()
      const home: RosterPlayer[] = rd.home ?? []
      const away: RosterPlayer[] = rd.away ?? []
      setHomeRoster(home)
      setAwayRoster(away)
      assignedIrregularIds = rd.assigned_irregular_ids ?? []
      if (rd.quarter_id) effectiveQuarterId = rd.quarter_id
      // 친선전 = 스팟 구성. 서버가 "이 팀 명단 전체 − 이미 배정된 사람"을 후보로 내려준다.
      //   분기 명단(quarters/[id]/players)을 부르지 않는 게 핵심이다 — 부르는 순간
      //   "원래 어느 팀 소속" 이라는 개념이 화면에 다시 새어들어 스팟 구성 전제가 깨진다.
      if (rd.is_exhibition) {
        setIrregularRoster((rd.unassigned ?? []).map((p: LeaguePlayer) => ({
          ...p, team_id: null, is_regular: false,
        })) as IrregularPlayer[])
        setRosterLoading(false)
        return
      }

      // 이미 시작된 경기 로드 시: plus_one 충돌 있으면 자동 팝업
      if (slot.is_started) {
        const homePO = home.filter(p => p.plus_one)
        const awayPO = away.filter(p => p.plus_one)
        const conflict = homePO.length >= 2
          ? { teamName: slot.home_team?.name ?? '홈팀', players: homePO }
          : awayPO.length >= 2
          ? { teamName: slot.away_team?.name ?? '어웨이팀', players: awayPO }
          : null
        if (conflict) {
          setPlusOneConflict(conflict)
          setShowPlusOneModal(true)
        }
      }
    }
    // 미배정 풀: 비정규/미배정 선수 + 이 경기에 출전하지 않는 다른 팀 선수(임대 가능)
    if (effectiveQuarterId) {
      const qRes = await fetch(`/api/leagues/${leagueId}/quarters/${effectiveQuarterId}/players`)
      if (qRes.ok) {
        const qd: IrregularPlayer[] = await qRes.json()
        const assignedSet = new Set(assignedIrregularIds)
        setIrregularRoster(qd.filter(p => {
          // 탈퇴 회원(is_active=false)은 새 경기에 "더 데려올" 후보에서 제외 —
          // 이미 이 경기에 배정돼 있었다면 위 assignedSet 분기에서 걸러지지 않고
          // homeRoster/awayRoster 쪽(roster API)이 과거 기록 보존 책임을 진다.
          if (p.is_active === false) return false
          if (assignedSet.has(p.id)) return false
          // 비정규/미배정 → 포함 (기존 동작)
          if (p.is_regular !== true) return true
          // 다른 팀 정규선수 → 임대 후보로 포함
          if (p.team_id && p.team_id !== slot.home_team_id && p.team_id !== slot.away_team_id) return true
          return false
        }))
      } else {
        setIrregularRoster([])
      }
    } else {
      setIrregularRoster([])
    }
    setRosterLoading(false)
  }

  // 날짜 선택 → 슬랏 초기화 + 로드
  async function selectDate(date: string) {
    setSelectedDate(date)
    setSelectedSlotId('')
    resetLineup()
    setGameStarted(false)
    setSlots([])

    if (!date) return
    setInitializingSlots(true)
    // ⚠ 대회는 **슬롯을 만들지 않는다.** 리그는 날짜를 열면 games_per_round 만큼 빈 슬롯을
    //   깔지만, 대회 경기는 대회(quarter_id)·상대팀과 함께 등록돼야 한다 — 여기서 만든 빈 슬롯은
    //   어느 대회 카드에도 안 잡히는 미아 경기가 되고, 기록하면 그 기록도 갈 곳이 없다.
    //   그래서 있는 경기만 읽는다.
    const res = isTournament
      ? await fetch(`/api/leagues/${leagueId}/games?date=${date}`, { cache: 'no-store' })
      : await fetch(`/api/leagues/${leagueId}/games`, {
          method: 'POST',
          headers: leagueHeaders,
          body: JSON.stringify({ date }),
        })
    setInitializingSlots(false)
    if (res.ok) setSlots(await res.json())
    else toast.error(isTournament ? '경기를 불러오지 못했습니다' : '슬랏 생성 실패')
  }

  // 슬랏 선택
  async function selectSlot(slot: GameSlot) {
    setSelectedSlotId(slot.id)
    setPendingHome(slot.home_team_id ?? '')
    setPendingAway(slot.away_team_id ?? '')
    setGameStarted(slot.is_started ?? false)
    setCurrentGame({ id: slot.id } as never)
    resetLineup()
    setHomeRoster([])
    setAwayRoster([])
    setIrregularRoster([])
    // DB에 저장된 값으로 즉시 초기화 (navigation 복귀 시 0:0 방지)
    if (slot.is_started) {
      setLiveScore({ home: slot.home_score ?? 0, away: slot.away_score ?? 0 })
    } else {
      setLiveScore(null)
    }

    await loadRoster(slot)

    // 이미 시작된 경기면 이벤트 기반 재계산으로 갱신
    if (slot.is_started) {
      const scoreRes = await fetch(`/api/leagues/${leagueId}/games/${slot.id}/recompute`, {
        method: 'POST',
        headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (scoreRes.ok) {
        const scores = await scoreRes.json()
        setLiveScore({ home: scores.home_score ?? scores.home ?? 0, away: scores.away_score ?? scores.away ?? 0 })
      }
    }

    // 출전 기록 로드 + 코트 상태 복원 (out_time=null인 선수가 현재 코트)
    const res = await fetch(`/api/leagues/${leagueId}/minutes?gameId=${slot.id}`)
    if (res.ok) {
      const mins: MinRow[] = await res.json()
      setMinutes(mins)
      if (slot.is_started) {
        const courtIds = mins.filter(m => m.out_time === null).map(m => m.league_player_id)
        setLineup(courtIds)
      }
    }
  }

  // ── 팀 드롭다운 후보 ──────────────────────────────────────────
  //   정규전: 상시팀(분기 override 적용된 이름).
  //   친선전: 이 날짜 임시팀만. 상시 3팀은 뺀다 — 친선전은 그날 짠 팀으로 하는 경기이지
  //           락다운/굿모닝이 뛴 경기가 아니고, 섞어 놓으면 손이 미끄러져 상시팀이 들어간다.
  //   예외: 이미 이 경기에 배정돼 있는 팀은 상시팀이라도 남긴다. 임시팀 개념이 없던 시절의
  //         친선전이 "팀 없음"으로 보이면 기록원이 그걸 덮어쓰고, 그 순간 옛 기록의
  //         team_id 와 경기 팀이 어긋난다.
  const teamOptions: { id: string; name: string }[] = (() => {
    if (!selectedSlot?.is_exhibition) return teams
    const opts: { id: string; name: string }[] = adhocTeams.map(t => ({ id: t.id, name: t.name }))
    const seen = new Set(opts.map(o => o.id))
    for (const t of [selectedSlot.home_team, selectedSlot.away_team]) {
      if (t && !seen.has(t.id)) { opts.push({ id: t.id, name: `${t.name} (상시팀)` }); seen.add(t.id) }
    }
    return opts
  })()

  // 이름 조회는 상시팀·임시팀을 함께 본다 — 친선전 화면에서 teams 만 뒤지면 항상 미스가 난다
  function teamNameById(id: string | null | undefined): string | null {
    if (!id) return null
    return teams.find(t => t.id === id)?.name ?? adhocTeams.find(t => t.id === id)?.name ?? null
  }

  // 이 날짜 전용 임시팀 만들기. 만든 즉시 비어 있는 쪽(홈 → 어웨이)에 꽂아 준다 —
  //   현장에서 만들고 다시 드롭다운을 여는 동작을 없애기 위해서다.
  async function createAdhocTeam() {
    const name = newTeamName.trim()
    if (!name) { toast.error('팀 이름을 입력하세요'); return }
    if (!selectedDate) { toast.error('날짜를 먼저 선택하세요'); return }
    setCreatingTeam(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/teams`, {
        method: 'POST',
        headers: leagueHeaders,
        body: JSON.stringify({ name, color: newTeamColor, exhibition_date: selectedDate }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body.error ?? `팀 생성 실패 (${res.status})`); return }
      setNewTeamName('')
      await loadAdhocTeams(selectedDate)
      if (!pendingHome) setPendingHome(body.id)
      else if (!pendingAway && body.id !== pendingHome) setPendingAway(body.id)
      toast.success(`임시팀 "${name}" 생성 — ${selectedDate} 친선전에서만 쓰입니다`)
    } catch (e) {
      toast.error(`팀 생성 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`)
    } finally {
      setCreatingTeam(false)
    }
  }

  // 잘못 만든 임시팀 정리. 경기에 물려 있으면 서버가 409 로 막는다(기록이 끊기므로).
  async function deleteAdhocTeam(teamId: string, name: string) {
    if (!confirm(`임시팀 "${name}" 을 삭제하시겠습니까?\n\n· 이 팀이 배정된 경기가 있으면 삭제되지 않습니다`)) return
    setDeletingTeamId(teamId)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/teams/${teamId}`, {
        method: 'DELETE',
        headers: leagueHeaders,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body.error ?? `삭제 실패 (${res.status})`, { duration: 6000 }); return }
      if (pendingHome === teamId) setPendingHome('')
      if (pendingAway === teamId) setPendingAway('')
      await loadAdhocTeams(selectedDate)
      toast.success('임시팀 삭제됨')
    } finally {
      setDeletingTeamId(null)
    }
  }

  async function saveTeams() {
    if (!pendingHome || !pendingAway) { toast.error('홈·어웨이 팀을 모두 선택하세요'); return }
    if (pendingHome === pendingAway) { toast.error('같은 팀을 선택할 수 없습니다'); return }

    // 이미 기록이 들어간 경기의 팀 교체는 **이벤트 이관과 한 묶음**이어야 한다.
    //   경기의 home/away 만 바꾸면 league_game_events.team_id 가 이 경기와 무관한 팀을 가리켜
    //   그 선수들이 박스스코어에서 통째로 사라진다(화면은 멀쩡하고 점수만 빈다).
    const recorded = !!selectedSlot && (selectedSlot.is_started || selectedSlot.is_complete)
    if (recorded) {
      const nameOf = (id: string) => teamOptions.find(t => t.id === id)?.name ?? teamNameById(id) ?? '?'
      if (!confirm(
        `기록이 있는 경기의 팀을 바꿉니다.

` +
        `· 홈: ${teamNameById(selectedSlot!.home_team_id) ?? '-'} → ${nameOf(pendingHome)}
` +
        `· 어웨이: ${teamNameById(selectedSlot!.away_team_id) ?? '-'} → ${nameOf(pendingAway)}

` +
        `이 경기에 저장된 기록(이벤트·명단)의 소속 팀도 함께 옮깁니다.
` +
        `좌우가 통째로 뒤집히는 경우에는 스코어도 같이 뒤집습니다.`
      )) return
      setSavingTeam(true)
      try {
        const r = await fetch(`/api/leagues/${leagueId}/games/${selectedSlotId}/reassign-teams`, {
          method: 'POST',
          headers: leagueHeaders,
          body: JSON.stringify({ home_team_id: pendingHome, away_team_id: pendingAway }),
        })
        const b = await r.json().catch(() => ({}))
        if (!r.ok) { toast.error(b.error ?? `팀 교체 실패 (${r.status})`, { duration: 8000 }); return }
        toast.success(`팀 교체 완료 — 기록 ${b.moved ?? 0}건 이관${b.swapped_scores ? ' · 스코어 좌우 교체' : ''}`)
        await refreshSlots()
        const updated = slots.find(x => x.id === selectedSlotId)
        if (updated) await loadRoster({ ...updated, home_team_id: pendingHome, away_team_id: pendingAway })
        setStatsRefresh(v => v + 1)
      } finally {
        setSavingTeam(false)
      }
      return
    }

    setSavingTeam(true)
    const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ home_team_id: pendingHome, away_team_id: pendingAway }),
    })
    setSavingTeam(false)
    if (res.ok) {
      toast.success('팀 저장 완료')
      await refreshSlots()
      const updated = slots.find(s => s.id === selectedSlotId)
      if (updated) await loadRoster({ ...updated, home_team_id: pendingHome, away_team_id: pendingAway })
    } else {
      // 서버가 거절 이유를 준다(임시팀·날짜 불일치 등). 뭉개면 기록원이 같은 시도를 반복한다.
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? '팀 저장 실패', { duration: 6000 })
    }
  }

  // ── 대진 자동 편성 ───────────────────────────────────────────────
  // 1경기는 현장 가위바위보라 사람이 넣는다. 그 결과만 있으면 2~9경기는 규칙으로 정해진다
  // (승자 잔류 · 2연속 뛴 팀은 강제 휴식) — 근거와 증명은 src/lib/league/rotation.ts.
  async function autoFillMatchups() {
    const ordered = [...slots].sort((a, b) => (a.slot_num ?? 0) - (b.slot_num ?? 0))
    const first = ordered[0]
    if (!first) { toast.error('이 날짜에 슬롯이 없습니다'); return }
    // 친선전은 승자 잔류 규칙이 없는 스팟 경기다. 회전 대진을 덮어씌우면 그날 짠 팀이
    //   상시 3팀으로 바뀌어 버린다.
    if (first.is_exhibition) {
      toast.error('친선전 날짜에는 자동 편성을 쓸 수 없습니다', {
        description: '친선전 팀은 그날 만든 임시팀이라 승자 잔류 회전 규칙이 적용되지 않습니다',
        duration: 6000,
      })
      return
    }
    if (!first.is_complete) {
      toast.error('1경기를 먼저 기록·마감해야 합니다', {
        description: '누가 이겼는지 알아야 2경기부터의 대진이 정해집니다',
        duration: 6000,
      })
      return
    }
    const resolved = resolveFirstGame(
      first.home_team_id ?? null, first.away_team_id ?? null,
      first.home_score ?? null, first.away_score ?? null,
      teams.map(t => t.id),
    )
    if (!resolved) {
      toast.error('1경기 결과로 승자를 가릴 수 없습니다', {
        description: '무승부이거나 팀·점수가 비어 있습니다. 좌우 배치와 점수를 확인하세요',
        duration: 6000,
      })
      return
    }
    const rest = ordered.slice(1)
    // 이미 기록이 들어간 경기는 건드리지 않는다 — 대진을 바꾸면 그 경기 이벤트의 팀이 어긋난다
    const locked = rest.filter(s => s.is_started || s.is_complete)
    // 친선 슬롯도 건드리지 않는다 — 임시팀 배정이 회전 대진으로 덮여 사라진다
    const targets = rest.filter(s => !s.is_started && !s.is_complete && !s.is_exhibition)
    if (targets.length === 0) { toast('채울 슬롯이 없습니다 (전부 기록 시작됨)'); return }
    if (!confirm(
      `${targets.length}개 슬롯의 대진을 자동으로 채웁니다.\n\n` +
      `· 1경기 승자 기준으로 승자 잔류 + 2연속 휴식 규칙 적용\n` +
      `· 좌우(홈/어웨이)는 임의 배정이니 각 슬롯에서 바꾸세요\n` +
      (locked.length > 0 ? `· 이미 기록이 시작된 ${locked.length}개는 건드리지 않습니다\n` : '')
    )) return

    setAutoFilling(true)
    try {
      // 회전은 "몇 번째 경기인가"로 정해지므로, 잠긴 슬롯도 순번에는 포함해 계산한다
      const plan = generateRotation(resolved.winnerId, resolved.loserId, resolved.restingId, rest.length)
      let saved = 0
      for (let i = 0; i < rest.length; i++) {
        const slot = rest[i]
        if (slot.is_started || slot.is_complete || slot.is_exhibition) continue
        const r = await fetch(`/api/leagues/${leagueId}/games?gameId=${slot.id}`, {
          method: 'PATCH',
          headers: leagueHeaders,
          body: JSON.stringify({ home_team_id: plan[i].homeTeamId, away_team_id: plan[i].awayTeamId }),
        })
        if (!r.ok) throw new Error(`${slot.slot_num}경기 저장 실패 (${r.status})`)
        saved++
      }
      await refreshSlots()
      toast.success(`대진 ${saved}경기 자동 편성 완료`, { description: '좌우 배치는 각 슬롯에서 바꿀 수 있습니다' })
    } catch (e) {
      toast.error(`자동 편성 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`, { duration: 6000 })
    } finally {
      setAutoFilling(false)
    }
  }

  // 좌우(홈↔어웨이) 뒤집기 — 코트 배치가 무작위라 매번 손으로 다시 고르지 않게 한다.
  // 이미 기록이 들어간 경기는 점수 대응이 어긋나므로 막는다.
  async function swapSides(slotId: string) {
    const slot = slots.find(s => s.id === slotId)
    if (!slot?.home_team_id || !slot?.away_team_id) { toast.error('먼저 두 팀을 지정하세요'); return }
    if (slot.is_started || slot.is_complete) {
      toast.error('기록이 시작된 경기는 좌우를 바꿀 수 없습니다', {
        description: '이미 저장된 점수·이벤트와 홈/어웨이가 어긋납니다',
        duration: 6000,
      })
      return
    }
    setSwappingId(slotId)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/games?gameId=${slotId}`, {
        method: 'PATCH',
        headers: leagueHeaders,
        body: JSON.stringify({ home_team_id: slot.away_team_id, away_team_id: slot.home_team_id }),
      })
      if (!r.ok) throw new Error(`저장 실패 (${r.status})`)
      await refreshSlots()
      if (slotId === selectedSlotId) {
        setPendingHome(slot.away_team_id)
        setPendingAway(slot.home_team_id)
        const updated = { ...slot, home_team_id: slot.away_team_id, away_team_id: slot.home_team_id }
        await loadRoster(updated)
      }
      toast.success('좌우 교체됨')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '좌우 교체 실패')
    } finally {
      setSwappingId(null)
    }
  }

  // 붙여넣은 값에서 videoId 를 뽑는다. watch?v= · youtu.be/ · shorts/ · embed/ · 순수 ID 를 받는다.
  //   기록원이 주소창을 통째로 복사하면 `&t=` `?si=` 같은 꼬리가 붙는데, 그대로 저장하면
  //   플레이어가 못 읽는 경우가 있어 여기서 ID 만 남긴다.
  function extractVideoId(raw: string): string | null {
    const v = raw.trim()
    if (!v) return null
    if (/^[\w-]{11}$/.test(v)) return v
    const m = v.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/)
    return m ? m[1] : null
  }

  // 이 슬롯에 영상 링크를 직접 지정. 쿼터별로 쪼갠 영상은 기록 중에 갈아끼우게 된다.
  async function saveYoutubeUrl(raw: string) {
    if (!selectedSlotId) return
    const id = extractVideoId(raw)
    if (!id) {
      toast.error('YouTube 링크를 인식하지 못했습니다', {
        description: 'youtube.com/watch?v=… · youtu.be/… 또는 영상 ID 11자리를 넣으세요',
        duration: 6000,
      })
      return
    }
    setYtSaving(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
        method: 'PATCH',
        headers: leagueHeaders,
        body: JSON.stringify({ youtube_url: `https://www.youtube.com/watch?v=${id}`, youtube_start_offset: 0 }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? `영상 연동 실패 (${res.status})`, { duration: 6000 })
        return
      }
      setYtInput('')
      setYtPickerOpen(false)
      await refreshSlots()
      toast.success('영상 연동됨')
    } finally {
      setYtSaving(false)
    }
  }

  // 링크 입력·목록 고르기의 단일 입구. 대회면 쿼터 칸에, 리그면 종전대로 경기에 붙인다.
  //   호출부 세 곳(입력 Enter · 연동 버튼 · 목록 항목)이 각자 분기하면 하나를 빠뜨렸을 때
  //   그 경로로만 대회 영상이 경기 대표 자리에 덮어써진다.
  function attachVideo(raw: string) {
    if (isTournament) return saveQuarterVideo(ytTargetQuarter, raw)
    return saveYoutubeUrl(raw)
  }

  // ── 쿼터별 영상 (대회) ─────────────────────────────────────────────
  const loadQuarterVideos = useCallback(async (gameId: string | null) => {
    if (!gameId) { setQuarterVideos({}); return }
    try {
      const res = await fetch(`/api/leagues/${leagueId}/games/${gameId}/videos`, { cache: 'no-store' })
      if (!res.ok) { setQuarterVideos({}); return }
      const rows = (await res.json()) as Array<{ quarter: number; youtube_url: string; start_offset: number }>
      const map: Record<number, { url: string; start_offset: number }> = {}
      for (const r of rows) map[r.quarter] = { url: r.youtube_url, start_offset: r.start_offset ?? 0 }
      setQuarterVideos(map)
    } catch {
      setQuarterVideos({})
    }
  }, [leagueId])

  // 슬롯이 바뀌면 그 경기의 쿼터 영상을 다시 읽는다. 안 읽으면 앞 경기의 영상이 그대로 남아
  //   기록원이 다른 경기 영상을 보면서 기록하게 된다 — 화면상으로는 정상이라 눈치채기 어렵다.
  useEffect(() => {
    if (!isTournament) { setQuarterVideos({}); return }
    loadQuarterVideos(selectedSlotId)
  }, [isTournament, selectedSlotId, loadQuarterVideos])

  // 쿼터가 넘어가면 링크 입력 대상도 따라간다(기록 중 4번 중 3번은 지금 쿼터를 채운다).
  useEffect(() => { setYtTargetQuarter(currentQuarter) }, [currentQuarter])

  async function saveQuarterVideo(quarter: number, raw: string) {
    if (!selectedSlotId) return
    const id = extractVideoId(raw)
    if (!id) {
      toast.error('YouTube 링크를 인식하지 못했습니다', {
        description: 'youtube.com/watch?v=… · youtu.be/… 또는 영상 ID 11자리를 넣으세요',
        duration: 6000,
      })
      return
    }
    setYtSaving(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/games/${selectedSlotId}/videos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...leagueHeaders },
        body: JSON.stringify({ quarter, youtube_url: `https://www.youtube.com/watch?v=${id}` }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error ?? `영상 연동 실패 (${res.status})`, { duration: 6000 })
        return
      }
      setYtInput('')
      setYtPickerOpen(false)
      await loadQuarterVideos(selectedSlotId)
      // 대표 영상(league_games.youtube_url)이 서버에서 함께 바뀌므로 슬롯도 다시 읽는다.
      await refreshSlots()
      toast.success(`${quarter}쿼터 영상 연동됨`)
    } finally {
      setYtSaving(false)
    }
  }

  async function clearQuarterVideo(quarter: number) {
    if (!selectedSlotId) return
    if (!confirm(`${quarter}쿼터 영상 연결을 해제하시겠습니까?\n\n· 기록한 내용은 지워지지 않습니다\n· 다시 연결하면 그대로 재생됩니다`)) return
    const res = await fetch(`/api/leagues/${leagueId}/games/${selectedSlotId}/videos?quarter=${quarter}`, {
      method: 'DELETE',
      headers: leagueHeaders,
    })
    if (res.ok) {
      await loadQuarterVideos(selectedSlotId)
      await refreshSlots()
      toast.success(`${quarter}쿼터 영상 해제됨`)
    } else {
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? '해제 실패')
    }
  }

  // 이 날짜에 올라온 채널 영상 목록 — 제목을 눈으로 보고 고른다(번호 추측 없음).
  async function loadYoutubeList() {
    if (!selectedDate) { toast.error('날짜를 먼저 선택하세요'); return }
    setYtPickerOpen(true)
    if (ytList.length > 0) return
    setYtListLoading(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/youtube-videos?date=${selectedDate}`, {
        headers: leagueHeaders,
        cache: 'no-store',
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(body.error ?? `영상 목록을 불러오지 못했습니다 (${res.status})`, { duration: 6000 })
        setYtPickerOpen(false)
        return
      }
      setYtList(body.videos ?? [])
      if ((body.videos ?? []).length === 0) toast('이 날짜에 올라온 영상이 없습니다')
    } finally {
      setYtListLoading(false)
    }
  }

  // 선택된 슬롯의 YouTube URL 제거 (잘못 매핑된 영상 수동 정리용)
  async function clearYoutubeUrl() {
    if (!selectedSlotId || !selectedSlot) return
    if (!selectedSlot.youtube_url) return
    if (!confirm('이 슬롯의 YouTube 영상 링크를 제거하시겠습니까?\n\n· 잘못 매핑된 영상을 정리할 때 사용\n· 이후 \"전체 날짜 YouTube 연동\" 버튼으로 재매핑 가능')) return
    const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ youtube_url: null, youtube_start_offset: 0 }),
    })
    if (res.ok) {
      toast.success('YouTube 영상 링크 제거됨')
      await refreshSlots()
    } else {
      toast.error('제거 실패')
    }
  }

  // 개별 경기 친선 토글 (리그 순위 제외 ↔ 정규전 복귀)
  async function toggleExhibition() {
    if (!selectedSlotId || !selectedSlot) return
    const current = !!selectedSlot.is_exhibition
    const next = !current
    const msg = next
      ? '이 경기를 친선전으로 표시하시겠습니까?\n\n· 리그 순위·개인 스탯·배지·마일스톤 집계에서 모두 제외됨\n· 박스스코어·하이라이트에는 그대로 남음\n\n· 팀 구성이 이 경기 전용으로 바뀝니다 — 분기 소속을 따르지 않고\n  이 화면에서 직접 배정한 선수만 명단이 됩니다\n\n· 팀도 이 날짜 전용 임시팀에서 고릅니다 — 아래에서 만들어 배정하세요'
      : '이 경기를 정규전으로 되돌리시겠습니까?\n\n· 리그 순위·개인 스탯 집계에 다시 포함됨\n· 명단이 분기 소속 기준으로 돌아갑니다\n\n· 임시팀이 배정돼 있으면 되돌릴 수 없습니다 (상시팀으로 먼저 교체)'
    if (!confirm(msg)) return
    const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ is_exhibition: next }),
    })
    if (res.ok) {
      toast.success(next ? '친선전으로 변경 — 팀 구성을 이 화면에서 직접 배정하세요' : '정규전으로 복귀')
      await refreshSlots()
      // 명단 기준이 통째로 바뀌므로(분기 소속 ↔ 이 경기 전용) 다시 읽는다.
      //   refreshSlots 는 슬랏만 갱신해서, 안 하면 바뀌기 전 명단이 화면에 그대로 남는다.
      const reloaded = { ...selectedSlot, is_exhibition: next }
      if (reloaded.home_team_id && reloaded.away_team_id) await loadRoster(reloaded)
    } else {
      // 409 = 임시팀이 배정된 채로 정규전 복귀를 시도한 경우. 이유를 그대로 보여준다.
      const body = await res.json().catch(() => ({}))
      toast.error(body.error ?? '변경 실패', { duration: 7000 })
    }
  }

  async function syncYoutube() {
    if (!leagueYtChannel) { toast.error('설정 탭에서 YouTube 채널을 먼저 지정하세요'); return }
    if (!selectedDate) { toast.error('날짜를 먼저 선택하세요'); return }
    setYtSyncing(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/youtube-sync`, {
        method: 'POST',
        headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelHandle: leagueYtChannel, date: selectedDate }),
      })
      let data: Record<string, unknown> = {}
      try { data = await res.json() } catch { /* non-JSON response */ }
      if (res.ok) {
        toast.success(`${data.mapped}개 경기 YouTube 연동 완료`)
        await refreshSlots()
        fetch(`/api/leagues/${leagueId}/games/date-summary`).then(r => r.json()).then(applyDateSummaries).catch(() => null)
      } else {
        const msg = (data.error as string) ?? `YouTube 연동 실패 (${res.status})`
        toast.error(msg, { duration: 6000 })
      }
    } catch (e) {
      toast.error(`네트워크 오류: ${e instanceof Error ? e.message : '알 수 없는 오류'}`, { duration: 6000 })
    } finally {
      setYtSyncing(false)
    }
  }

  // 이 날짜에 슬롯 한 칸 추가. 리그 설정(games_per_round)은 건드리지 않는다 —
  //   그걸 바꾸면 모든 날짜가 같이 늘어난다.
  async function addSlot() {
    if (!selectedDate) { toast.error('날짜를 먼저 선택하세요'); return }
    setAddingSlot(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/games`, {
        method: 'POST',
        headers: leagueHeaders,
        body: JSON.stringify({ date: selectedDate, addSlot: true }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body.error ?? `슬롯 추가 실패 (${res.status})`, { duration: 6000 }); return }
      setSlots(body.slots ?? [])
      toast.success(
        `${body.added_slot}경기 슬롯 추가됨${body.is_exhibition ? ' · 친선전' : ''}`,
        { description: body.is_exhibition ? '이 날짜의 다른 슬롯과 같은 친선전으로 만들어졌습니다' : undefined },
      )
    } catch (e) {
      toast.error(`슬롯 추가 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`)
    } finally {
      setAddingSlot(false)
    }
  }

  // 선택된 슬롯 삭제. 기록이 붙은 슬롯은 서버가 409 로 막는다 —
  //   league_games 삭제는 league_game_events 로 캐스케이드돼 그 경기 기록이 영구 소멸한다.
  async function deleteSlot() {
    if (!selectedSlot) return
    if (!confirm(
      `${selectedSlot.slot_num}경기 슬롯을 삭제하시겠습니까?

` +
      `· 기록(이벤트)이 하나라도 있으면 삭제되지 않습니다
` +
      `· 뒤 슬롯 번호는 다시 매기지 않습니다 (번호가 비어도 기록에는 지장 없음)`
    )) return
    setDeletingSlot(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlot.id}`, {
        method: 'DELETE',
        headers: leagueHeaders,
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(body.error ?? `삭제 실패 (${res.status})`, { duration: 7000 }); return }
      setSelectedSlotId('')
      resetLineup()
      await refreshSlots()
      toast.success('슬롯 삭제됨')
    } finally {
      setDeletingSlot(false)
    }
  }

  // 이 경기 한정 +1 토글.
  //   선수 목록의 +1 은 **전역 플래그**라 켜는 순간 과거 마감 경기까지 소급된다 —
  //   그 선수의 과거 야투마다 점수가 올라가 순위·기록이 통째로 바뀐다. 그래서 "이번 경기만"은
  //   반드시 경기 쪽(league_games.plus_one_extra_ids)에 담는다. 판정 정본은 scoring.ts isPlusOneFor().
  async function toggleExtraPlusOne(playerId: string, playerName: string) {
    if (!selectedSlot) return
    const cur = selectedSlot.plus_one_extra_ids ?? []
    const on = cur.includes(playerId)
    const next = on ? cur.filter(id => id !== playerId) : [...cur, playerId]
    // 이 날짜 전 슬롯에 적용 — 쿼터를 슬롯으로 쪼갠 날은 한 경기가 4칸이라 한 칸씩 누르면 어긋나기 쉽다.
    const targets = extraP1AllSlots ? slots : [selectedSlot]
    setSavingExtraP1(playerId)
    try {
      const failed: number[] = []
      for (const sl of targets) {
        const c = sl.plus_one_extra_ids ?? []
        const n = on ? c.filter(id => id !== playerId) : (c.includes(playerId) ? c : [...c, playerId])
        const r = await fetch(`/api/leagues/${leagueId}/games?gameId=${sl.id}`, {
          method: 'PATCH',
          headers: leagueHeaders,
          body: JSON.stringify({ plus_one_extra_ids: n }),
        })
        if (!r.ok) { failed.push(sl.slot_num); continue }
        // 이미 기록된 이벤트의 저장 점수를 다시 맞춘다 — 안 하면 화면 집계와 저장 스코어가 갈린다.
        if (sl.is_started || sl.is_complete) {
          const sc = await fetch(`/api/leagues/${leagueId}/games/${sl.id}/recompute`, {
            method: 'POST', headers: { ...leagueHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({}),
          }).then(res => res.ok ? res.json() : null).catch(() => null)
          if (sc && sl.id === selectedSlotId) setLiveScore({ home: sc.home_score ?? sc.home ?? 0, away: sc.away_score ?? sc.away ?? 0 })
        }
      }
      await refreshSlots()
      setStatsRefresh(v => v + 1)
      if (failed.length > 0) {
        toast.error(`${failed.join(', ')}경기 슬롯 저장 실패 — 다시 시도하세요`, { duration: 7000 })
      } else {
        const scope = extraP1AllSlots ? `${selectedDate} 전 슬롯` : '이 경기'
        toast.success(on ? `${playerName} — ${scope} +1 해제` : `${playerName} — ${scope}에만 +1 적용`)
      }
    } finally {
      setSavingExtraP1(null)
    }
  }

  async function refreshSlots() {
    if (!selectedDate) return
    const res = await fetch(`/api/leagues/${leagueId}/games?date=${selectedDate}`, { cache: 'no-store' })
    if (res.ok) {
      const updated: GameSlot[] = await res.json()
      setSlots(updated)
      if (selectedSlotId) {
        const s = updated.find(x => x.id === selectedSlotId)
        if (s) {
          setPendingHome(s.home_team_id ?? '')
          setPendingAway(s.away_team_id ?? '')
          setGameStarted(s.is_started ?? false)
        }
      }
    }
  }

  // 선발 체크 모달 열기 (기본: 모두 해제)
  function openStarterPicker() {
    if (homeRoster.length === 0 && awayRoster.length === 0) {
      toast.error('출전 가능한 선수가 없습니다')
      return
    }
    setSelectedStarters(new Set())
    setShowStarterPicker(true)
  }

  function toggleStarter(pid: string) {
    setSelectedStarters(prev => {
      const next = new Set(prev)
      if (next.has(pid)) next.delete(pid)
      else next.add(pid)
      return next
    })
  }

  function selectAllTeam(side: 'home' | 'away') {
    const ids = (side === 'home' ? homeRoster : awayRoster).map(p => p.id)
    setSelectedStarters(prev => {
      const next = new Set(prev)
      const allSelected = ids.every(id => next.has(id))
      if (allSelected) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }

  // ── 드래그 앤 드롭 헬퍼 ───────────────────────────────────────

  async function handleDrop(e: React.DragEvent, side: 'home' | 'away') {
    e.preventDefault()
    setDragOverSide(null)
    setDraggingPlayerId(null)
    const playerId = e.dataTransfer.getData('playerId')
    if (!playerId) return

    const allPoolPlayers = [...homeRoster, ...awayRoster, ...irregularRoster]
    const player = allPoolPlayers.find(p => p.id === playerId)
    if (!player) return

    const isHome = homeRoster.some(p => p.id === playerId)
    const isAway = awayRoster.some(p => p.id === playerId)

    if ((side === 'home' && isHome) || (side === 'away' && isAway)) {
      // 같은 팀에 드롭 → 선발 토글
      toggleStarter(playerId)
      return
    }

    // 다른 팀 또는 미배정 풀 → addIrregularToTeam 호출
    await addIrregularToTeam(player as IrregularPlayer, side)
  }

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
            className="shrink-0 text-[11px] font-bold px-1 uppercase tracking-[0.10em]"
            style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '4px' }}
          >
            비정규
          </span>
        )}
        {/* 모바일 전용: 다른 팀으로 이동 (iOS Safari DnD 불가 대체) */}
        <button
          onClick={e => {
            e.stopPropagation()
            addIrregularToTeam(p as IrregularPlayer, otherSide)
          }}
          disabled={addingIrregular}
          className="lg:hidden ml-auto shrink-0 inline-flex items-center justify-center min-h-[36px] min-w-[36px] px-2 text-[11px] font-bold cursor-pointer transition-colors disabled:opacity-40"
          style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)', borderRadius: '4px' }}
          aria-label={`${p.name} → ${otherTeamName} 팀으로 이동`}
          title={`→ ${otherTeamName}`}
        >
          → {otherTeamName}
        </button>
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
        className={`flex items-center gap-1 px-2.5 py-1 min-h-[36px] text-xs font-medium cursor-pointer lg:cursor-grab transition-colors select-none ${
          isDragging ? 'opacity-40' : ''
        }`}
        style={chipStyle}
        aria-label={`${p.name} 팀 배정`}
      >
        {p.number ? `#${p.number} ` : ''}{p.name}
        {teamName && (
          <span
            className="text-[11px] font-bold px-1 ml-0.5"
            style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '4px' }}
          >
            {teamName}
          </span>
        )}
      </button>
    )
  }

  // 선발 체크된 선수만 onCourt + minutes INSERT (실제 로직)
  async function doStartGame(starterIds: string[]) {
    setStartingGame(true)
    await Promise.all(starterIds.map(pid =>
      fetch(`/api/leagues/${leagueId}/minutes`, {
        method: 'POST',
        headers: leagueHeaders,
        body: JSON.stringify({ league_game_id: selectedSlotId, league_player_id: pid, quarter: currentQuarter, in_time: 0 }),
      })
    ))
    setLineup(starterIds)
    setGameStarted(true)
    setShowStarterPicker(false)
    await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ is_started: true }),
    })
    // minutes 재로드
    const r = await fetch(`/api/leagues/${leagueId}/minutes?gameId=${selectedSlotId}`)
    if (r.ok) setMinutes(await r.json())
    refreshSlots()
    setStartingGame(false)
  }

  // 플러스원 충돌 체크 후 경기 시작
  async function startGame() {
    if (!selectedSlotId) return
    const starterIds = Array.from(selectedStarters)
    if (starterIds.length === 0) { toast.error('선발 선수를 1명 이상 선택하세요'); return }
    const homeStarters = starterIds.filter(id => homeRoster.some(p => p.id === id))
    const awayStarters = starterIds.filter(id => awayRoster.some(p => p.id === id))
    if (homeStarters.length > 5 || awayStarters.length > 5) {
      toast.error(`팀당 선발은 최대 5명입니다 (홈 ${homeStarters.length}명 / 어웨이 ${awayStarters.length}명)`)
      return
    }

    // 플러스원 충돌 체크: 같은 팀 스타터 중 plus_one=true가 2명 이상
    function checkPlusOneConflict(teamStarters: string[], roster: RosterPlayer[], teamName: string) {
      const plusOnePlayers = teamStarters
        .map(id => roster.find(p => p.id === id))
        .filter((p): p is RosterPlayer => !!(p?.plus_one))
      if (plusOnePlayers.length >= 2) return { teamName, players: plusOnePlayers }
      return null
    }
    const homeConflict = checkPlusOneConflict(homeStarters, homeRoster, selectedSlot?.home_team?.name ?? '홈팀')
    const awayConflict = checkPlusOneConflict(awayStarters, awayRoster, selectedSlot?.away_team?.name ?? '어웨이팀')
    const conflict = homeConflict || awayConflict
    if (conflict) {
      setPlusOneConflict(conflict)
      setShowPlusOneModal(true)
      return
    }

    // 플러스원 충돌 없으면 기존 plus_one 플래그 사용
    const allPlusOneIds = [...homeRoster, ...awayRoster]
      .filter(p => selectedStarters.has(p.id) && p.plus_one)
      .map(p => p.id)
    setActivePlusOneIds(allPlusOneIds)
    await doStartGame(starterIds)
  }

  // 플러스원 충돌 모달에서 선택 처리
  async function handlePlusOneSelect(selectedId: string) {
    setShowPlusOneModal(false)
    const conflictTeam = plusOneConflict
    setPlusOneConflict(null)

    // 이미 시작된 경기면 전체 로스터 기준, 아니면 선발 기준
    const base = gameStarted
      ? [...homeRoster, ...awayRoster].filter(p => p.plus_one).map(p => p.id)
      : [...homeRoster, ...awayRoster].filter(p => selectedStarters.has(p.id) && p.plus_one).map(p => p.id)

    // 충돌 팀은 선택된 선수만, 나머지 팀은 전부
    const finalPlusOneIds = base.filter(id => {
      if (conflictTeam?.players.some(p => p.id === id)) return id === selectedId
      return true
    })
    setActivePlusOneIds(finalPlusOneIds)

    // DB에 plus_one_player_id 저장
    await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ plus_one_player_id: selectedId }),
    })

    // 이미 시작된 경기라면 doStartGame 호출 안 함 (라인업 중복 방지)
    if (!gameStarted) {
      const starterIds = Array.from(selectedStarters)
      await doStartGame(starterIds)
    }
  }

  async function completeGame() {
    if (!selectedSlotId) { toast.error('경기를 선택하세요'); return }
    setCompleting(true)
    try {
      const recomputeRes = await fetch(`/api/leagues/${leagueId}/games/${selectedSlotId}/recompute`, {
        method: 'POST',
        headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (recomputeRes.ok) {
        const scores = await recomputeRes.json()
        setLiveScore(scores)
      }
      const patchRes = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
        method: 'PATCH',
        headers: leagueHeaders,
        body: JSON.stringify({ is_complete: true }),
      })
      if (!patchRes.ok) {
        const err = await patchRes.json().catch(() => ({}))
        throw new Error((err.error as string) ?? `완료 처리 실패 (${patchRes.status})`)
      }
      setShowComplete(false)
      toast.success('경기 완료 처리됨')
      refreshSlots()

      // ── 라운드 전수 마감 감지 → 인스타 카드 준비 안내 ──────────────────
      // 이 슬롯을 뺀 나머지가 전부 마감이면 방금 이 라운드가 끝난 것이다.
      // "시작된 슬롯만" 으로 느슨하게 잡으면 5경기째 마감했을 때 아직 시작 안 한 6~9번이
      // 없는 것으로 처리돼 너무 일찍 뜬다 — 그래서 전 슬롯 마감을 기준으로 한다.
      const others = slots.filter(s => s.id !== selectedSlotId)
      if (others.length > 0 && others.every(s => s.is_complete)) {
        const done = Object.entries(dateStats)
          .filter(([, st]) => st.total > 0 && st.complete >= st.total)
          .map(([d]) => d)
        if (!done.includes(selectedDate)) done.push(selectedDate)
        setRoundDone({ date: selectedDate, vol: volumeForRound(selectedDate, done) })
      }
    } catch (e) {
      toast.error(`마감 실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`, { duration: 6000 })
    } finally {
      setCompleting(false)
    }
  }

  // 마감된 경기를 다시 기록 모드로 복귀 (이벤트 유지, is_complete만 해제)
  async function reopenGame() {
    if (!selectedSlotId) return
    setReopening(true)
    const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${selectedSlotId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ is_complete: false }),
    })
    setReopening(false)
    if (!res.ok) { toast.error('전환 실패'); return }
    toast.success('기록 모드로 복귀했습니다. 기존 이벤트는 유지됩니다.')
    await refreshSlots()
    // 코트 상태 복원 (다시 기록하기 후에도 선수 표시 유지)
    const mRes = await fetch(`/api/leagues/${leagueId}/minutes?gameId=${selectedSlotId}`)
    if (mRes.ok) {
      const mins: MinRow[] = await mRes.json()
      setMinutes(mins)
      const courtIds = mins.filter(m => m.out_time === null).map(m => m.league_player_id)
      setLineup(courtIds)
    }
  }

  // 마감 버튼 클릭 핸들러: 점수 미리 계산 후 모달 표시
  async function openCompleteModal() {
    setShowComplete(true)
    await fetchLiveScore()
  }

  async function fetchLiveScore() {
    if (!selectedSlotId) return
    const res = await fetch(`/api/leagues/${leagueId}/games/${selectedSlotId}/recompute`, {
      method: 'POST',
      headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    if (res.ok) {
      const data = await res.json()
      setLiveScore({ home: data.home_score ?? data.home ?? 0, away: data.away_score ?? data.away ?? 0 })
    }
  }

  function handleEventSaved() {
    setStatsRefresh(k => k + 1)
    if (selectedSlotId) {
      fetch(`/api/leagues/${leagueId}/minutes?gameId=${selectedSlotId}`)
        .then(r => r.json()).then(setMinutes)
    }
  }

  // 선택한 경기의 쿼터 복원 — 새로고침·경기 전환 후에도 마지막으로 기록하던 쿼터에서 이어간다.
  //   전용 컬럼을 두지 않고 이미 저장된 이벤트의 최대 쿼터를 읽는다(기록이 곧 진실).
  //   복원에 실패해도 기본값 1 로 두고 기록 자체는 막지 않는다.
  useEffect(() => {
    if (!selectedSlotId) { setCurrentQuarter(1); return }
    let cancelled = false
    fetch(`/api/leagues/${leagueId}/events?gameId=${selectedSlotId}`)
      .then(r => (r.ok ? r.json() : null))
      .then((rows: Array<{ quarter?: number | null }> | null) => {
        if (cancelled || !Array.isArray(rows)) return
        const max = rows.reduce((m, e) => Math.max(m, e.quarter ?? 1), 1)
        setCurrentQuarter(Math.min(Math.max(max, 1), 6))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [leagueId, selectedSlotId])

  // Backspace 단축키용: 최신 selectedSlotId와 deleteLastEvent 함수를 ref로 노출
  useEffect(() => {
    selectedSlotIdRef.current = selectedSlotId
    deleteLastEventRef.current = async () => {
      const slotId = selectedSlotIdRef.current
      if (!slotId) return
      try {
        const r = await fetch(`/api/leagues/${leagueId}/events?gameId=${slotId}`)
        if (!r.ok) return
        const events = await r.json() as Array<{ id: string; created_at?: string }>
        if (!Array.isArray(events) || events.length === 0) return
        const last = events[events.length - 1]
        if (!last?.id) return
        const del = await fetch(`/api/leagues/${leagueId}/events/${last.id}`, {
          method: 'DELETE',
          headers: leagueHeaders,
        })
        if (del.ok) {
          handleEventSaved()
          fetchLiveScore()
        }
      } catch {}
    }
  }, [selectedSlotId, leagueId, leagueHeaders]) // eslint-disable-line react-hooks/exhaustive-deps

  // 비정규 선수를 홈/어웨이 팀에 추가 (이 경기 하나에만 유효 — 다른 경기에 뛰면 그 경기에서 따로 지정)
  async function addIrregularToTeam(player: IrregularPlayer, side: 'home' | 'away') {
    if (!selectedSlotId) { toast.error('경기를 선택하세요'); return }
    const teamId = side === 'home' ? selectedSlot?.home_team_id : selectedSlot?.away_team_id
    if (!teamId) { toast.error('팀이 지정되지 않았습니다'); return }
    setAddingIrregular(true)
    // 경기별 배정 (league_game_players) — 이 경기(selectedSlotId)에만 배정된다.
    //   (2026-08-08 사고: 예전엔 서버에서 같은 날짜·같은 팀 경기에도 자동 배정했다 —
    //    정규 선수가 다른 팀 게스트로 한 경기 뛰면 그날 전체 소속이 바뀌는 사고로 이어져 제거함.)
    const res = await fetch(`/api/leagues/${leagueId}/games/${selectedSlotId}/irregular-players`, {
      method: 'POST',
      headers: leagueHeaders,
      body: JSON.stringify({ league_player_id: player.id, team_id: teamId }),
    })
    if (!res.ok) {
      setAddingIrregular(false)
      toast.error('비정규 선수 추가 실패')
      return
    }
    // 게임이 시작된 경우, minutes도 INSERT
    if (gameStarted) {
      await fetch(`/api/leagues/${leagueId}/minutes`, {
        method: 'POST',
        headers: leagueHeaders,
        body: JSON.stringify({ league_game_id: selectedSlotId, league_player_id: player.id, quarter: currentQuarter, in_time: 0 }),
      })
      const r = await fetch(`/api/leagues/${leagueId}/minutes?gameId=${selectedSlotId}`)
      if (r.ok) setMinutes(await r.json())
    }
    // roster 재로드
    if (selectedSlot) await loadRoster(selectedSlot)
    setPendingIrregular(null)
    setAddingIrregular(false)
    toast.success(`${player.name} → ${side === 'home' ? selectedSlot?.home_team?.name ?? '홈' : selectedSlot?.away_team?.name ?? '어웨이'} 추가됨`)
  }

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

  // ── 날짜 선택 화면 ─────────────────────────────────────────
  if (!selectedDate) {
    // 전체 요약 집계
    const totalGames    = Object.values(dateStats).reduce((s, d) => s + d.total,    0)
    const totalComplete = Object.values(dateStats).reduce((s, d) => s + d.complete, 0)
    const totalStarted  = Object.values(dateStats).reduce((s, d) => s + d.started,  0)
    const totalPending  = Object.values(dateStats).reduce((s, d) => s + (d.pending ?? 0), 0)
    const totalUnused   = Object.values(dateStats).reduce((s, d) => s + (d.unused ?? 0), 0)
    // 진행률은 미사용 슬롯 분모에서 제외 → 실제 진행할 경기 대비 비율
    const totalActive = totalGames - totalUnused
    const completionPct = totalActive > 0 ? (totalComplete / totalActive * 100) : 0

    // 필터 + 역순 정렬
    const filteredDates = [...scheduleDates]
      .filter(sd => selectedQFilter === 'all' || dateQuarterMap[sd.date] === selectedQFilter)
      .sort((a, b) => b.date.localeCompare(a.date))

    return (
      <div className="mm-brand space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2
              className="font-bold text-3xl"
              style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
            >
              경기 기록
            </h2>
            <p className="text-sm mt-1" style={{ color: 'var(--mm-muted)' }}>
              기록할 날짜를 선택하세요
            </p>
          </div>
          {/* '전체 날짜 YouTube 연동' 버튼은 2026-08-10 제거 — 일정 페이지의
              '일정 등록 + 영상 연동' 하나로 합쳤다. 날짜 등록과 영상 붙이기는 항상
              함께 일어나는데 두 화면에 흩어져 있어 두 번 들어가야 했다.
              아래 날짜별 개별 연동 버튼은 남긴다 — 특정 날짜만 다시 붙일 때 쓴다. */}
        </div>

        {/* 전체 경기 완료 현황 요약 */}
        {totalGames > 0 && (
          <div
            className="px-5 py-3 flex items-center gap-6 flex-wrap"
            style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
          >
            <div className="flex items-center gap-1.5">
              <CheckCircle2 size={14} style={{ color: '#059669' }} />
              <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>완료</span>
              <span className="text-sm font-black ml-1" style={{ color: '#059669' }}>{totalComplete}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Play size={14} style={{ color: 'var(--mm-yellow-strong)' }} />
              <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>기록 중</span>
              <span className="text-sm font-black ml-1" style={{ color: 'var(--mm-yellow-strong)' }}>{totalStarted}</span>
            </div>
            <div className="flex items-center gap-1.5" title="아직 진행되지 않은 미래·오늘 슬롯">
              <Circle size={14} style={{ color: 'var(--mm-muted)' }} />
              <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>미시작</span>
              <span className="text-sm font-black ml-1" style={{ color: 'var(--mm-ink-soft)' }}>{totalPending}</span>
            </div>
            {totalUnused > 0 && (
              <div className="flex items-center gap-1.5" title="과거 날짜에 만들어졌으나 영상·기록이 없는 슬롯 (영상 9개 미만 진행된 날의 잔여)">
                <span className="text-base leading-none" style={{ color: 'var(--mm-muted)' }}>○</span>
                <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>미사용</span>
                <span className="text-sm font-black ml-1" style={{ color: 'var(--mm-muted)' }}>{totalUnused}</span>
              </div>
            )}
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>진행 대상 {totalActive}/{totalGames}경기</span>
              <div className="w-24 h-1.5 overflow-hidden" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}>
                <div className="h-full transition-all" style={{ width: `${completionPct}%`, background: '#059669' }} />
              </div>
              <span className="text-xs font-bold" style={{ color: '#059669' }}>{Math.round(completionPct)}%</span>
            </div>
          </div>
        )}

        {/* 분기 필터 탭 */}
        {quarters.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {[{ id: 'all', label: '전체' }, ...quarters.map(q => ({ id: q.id, label: `${String(q.year).slice(2)}.${q.quarter}Q` }))].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedQFilter(tab.id)}
                className="inline-flex items-center justify-center px-4 py-2 min-h-[44px] min-w-[44px] text-xs font-bold uppercase tracking-[0.14em] transition-colors cursor-pointer"
                style={
                  selectedQFilter === tab.id
                    ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-yellow)', borderRadius: '4px' }
                    : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }
                }
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {filteredDates.map(sd => {
            const d = new Date(sd.date + 'T00:00:00')
            const days = ['일', '월', '화', '수', '목', '금', '토']
            const stat = dateStats[sd.date]
            const allLinked = stat && stat.total > 0 && stat.yt === stat.total
            // 진행 대상 = 전체 - 미사용. 진행 대상이 모두 완료되면 그 날 완료로 처리
            const activeTotal = stat ? stat.total - stat.unused : 0
            const allDone = stat && activeTotal > 0 && stat.complete === activeTotal
            return (
              <button
                key={sd.id}
                onClick={() => selectDate(sd.date)}
                className={`w-full text-left rounded-xl px-4 py-3 hover:-translate-y-0.5 hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] transition-all duration-200 cursor-pointer`}
                style={{
                  background: 'var(--mm-panel)',
                  border: allDone
                    ? '1px solid color-mix(in srgb, #16a34a 55%, var(--mm-rule))'
                    : '1px solid var(--mm-rule)',
                }}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  {/* 날짜 */}
                  <span
                    className="font-bold text-lg whitespace-nowrap"
                    style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
                  >
                    {d.getFullYear()}년 {d.getMonth() + 1}월 {d.getDate()}일
                    <span className="ml-1.5 text-sm" style={{ color: 'var(--mm-muted)' }}>({days[d.getDay()]})</span>
                  </span>

                  {/* 상태 배지들 — 날짜 바로 옆 */}
                  {stat && stat.total > 0 && (
                    <span
                      className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5"
                      style={
                        allDone
                          ? { background: '#059669', color: '#FFFFFF', border: '1px solid #059669', borderRadius: '4px' }
                          : stat.complete > 0
                          ? { background: 'var(--mm-yellow-soft)', color: 'var(--mm-yellow-strong)', border: '1px solid var(--mm-yellow)', borderRadius: '4px' }
                          : { background: 'var(--mm-panel-alt)', color: 'var(--mm-muted)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }
                      }
                    >
                      <CheckCircle2 size={14} />
                      {stat.complete}/{activeTotal}
                      {allDone && <span className="ml-0.5">완료</span>}
                    </span>
                  )}

                  {stat && stat.started > 0 && !allDone && (
                    <span
                      className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5"
                      style={{ background: 'var(--mm-yellow-soft)', color: 'var(--mm-yellow-strong)', border: '1px solid var(--mm-yellow)', borderRadius: '4px' }}
                    >
                      <Play size={14} />
                      {stat.started} 진행
                    </span>
                  )}

                  {stat && stat.pending > 0 && (
                    <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>
                      미시작 {stat.pending}
                    </span>
                  )}

                  {stat && stat.unused > 0 && (
                    <span className="text-xs" style={{ color: 'var(--mm-muted)' }} title="영상이 없거나 진행 안 한 잔여 슬롯">
                      미사용 {stat.unused}
                    </span>
                  )}

                  {/* YouTube 연동 — 다른 배지들과 같은 줄, 인접 배치 (YouTube 브랜드 레드 유지) */}
                  {stat && stat.total > 0 && stat.yt > 0 && (
                    <span
                      className="flex items-center gap-1 text-xs font-mono"
                      style={{ color: allLinked ? '#DC2626' : 'var(--mm-muted)' }}
                    >
                      <Youtube size={14} />
                      {stat.yt}/{stat.total}
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── 슬랏 초기화 중 ────────────────────────────────────────
  if (initializingSlots) {
    return <div className="flex flex-col items-center gap-3 py-16" style={{ color: 'var(--mm-muted)' }}><Loader2 size={24} className="animate-spin" /><span className="text-sm">경기 슬랏 생성 중...</span></div>
  }

  const dateLabel = (() => {
    const d = new Date(selectedDate + 'T00:00:00')
    const days = ['일', '월', '화', '수', '목', '금', '토']
    return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`
  })()

  // ── 슬랏 그리드 + 기록 UI ─────────────────────────────────
  return (
    <div className="mm-brand space-y-4">
      <LeagueSubTabs group="games" />
      {/* 라운드 전수 마감 → 인스타 카드 준비 완료 안내.
          카드 생성기는 편집 권한자만 쓰는 도구라 여기(기록 화면)에 띄운다 — 마지막 경기를
          마감한 바로 그 자리가 카드를 만들 마음이 드는 유일한 순간이다. */}
      {roundDone && (
        <div
          className="flex items-center gap-3 flex-wrap p-3"
          style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-ink)', borderRadius: '4px' }}
        >
          <Sparkles size={16} aria-hidden style={{ color: 'var(--mm-ink)' }} />
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>
              {roundDone.date} 라운드 마감 완료 — 인스타 카드{' '}
              {roundDone.vol != null ? <><b>VOL.{roundDone.vol}</b> </>: ''}준비됨
            </p>
            <p className="text-xs" style={{ color: 'var(--mm-ink-soft)' }}>
              카드 9장이 이 라운드 기록으로 채워져 있습니다. 눌러서 확인하고 저장하세요.
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a
              href={`/league/${orgSlug}/${leagueId}/social?date=${roundDone.date}`}
              className="inline-flex items-center justify-center px-4 min-h-11 text-xs font-black uppercase tracking-wider cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)', borderRadius: '4px' }}
            >
              카드 만들러 가기
            </a>
            <button
              onClick={() => setRoundDone(null)}
              aria-label="안내 닫기"
              className="inline-flex items-center justify-center min-h-11 min-w-11 cursor-pointer transition-colors"
              style={{ color: 'var(--mm-ink-soft)' }}
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        </div>
      )}

      {/* 날짜 헤더 + YouTube 연동 (1행) */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => { setSelectedDate(''); setSelectedSlotId(''); setSlots([]) }}
          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] transition-colors cursor-pointer shrink-0"
          style={{ color: 'var(--mm-muted)' }}
          aria-label="날짜 선택으로 돌아가기"
        >
          <ChevronLeft size={20} />
        </button>
        <h2
          className="font-bold text-xl"
          style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
        >
          {dateLabel} 경기 기록
        </h2>
        {/* YouTube 자동 연동 — 제목의 `경기 N` 을 그날 슬롯 N 에 꽂는 **리그 전용** 기능이다.
            대회에서는 감춘다: 슬롯 번호에 의미가 없고 촬영본이 쿼터로 쪼개져 있어, 돌리면
            엉뚱한 자리에 조용히 붙는다(2026-08-22 사고). 서버(syncYoutubeForLeague)도 같이 막혀 있다 —
            여기서만 감추면 cron·경기시작 훅으로 되살아난다. */}
        {!isTournament && (
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {leagueYtChannel && (
              <span className="text-xs font-mono text-red-300/70 hidden sm:inline">{leagueYtChannel}</span>
            )}
            <button
              onClick={syncYoutube}
              disabled={ytSyncing}
              className="inline-flex items-center justify-center gap-1.5 px-3 py-2 min-h-[44px] min-w-[44px] rounded-lg text-xs font-medium bg-red-700 hover:bg-red-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              aria-label="YouTube 연동"
            >
              {ytSyncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              <span className="hidden sm:inline">YouTube 연동</span>
            </button>
          </div>
        )}
      </div>

      {/* 대진 자동 편성 — 승자 잔류 로테이션은 미라클 리그의 3팀 편성 규칙이다.
          대회는 대진이 주최측 편성이라 이 버튼이 짜 주는 대진이 실제와 무관하다. */}
      {!isTournament && slots.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={autoFillMatchups}
            disabled={autoFilling}
            className="inline-flex items-center gap-1.5 px-3 min-h-11 text-xs font-bold cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
          >
            {autoFilling
              ? <Loader2 size={14} className="animate-spin" aria-hidden />
              : <Wand2 size={14} aria-hidden />}
            {autoFilling ? '편성 중…' : '대진 자동 채우기'}
          </button>
          <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>
            1경기 마감 후 누르면 나머지 대진이 채워집니다 (승자 잔류 · 2연속 뛰면 휴식)
          </span>
        </div>
      )}

      {/* 슬랏 그리드 — PC에서 크게 */}
      <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-9 gap-2">
        {slots.map(slot => {
          const isSelected = slot.id === selectedSlotId
          const hasTeams = slot.home_team_id && slot.away_team_id
          const hasYT = !!slot.youtube_url
          return (
            <button
              key={slot.id}
              onClick={() => selectSlot(slot)}
              className={`relative flex flex-col items-center justify-center px-2 py-2.5 min-h-[44px] rounded-xl border text-base font-bold transition-all duration-200 cursor-pointer hover:-translate-y-0.5 ${
                isSelected
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : slot.is_complete
                  ? 'bg-green-900/30 border-green-700/50 text-green-400'
                  : 'bg-gray-900 border-gray-800 text-gray-300 hover:border-gray-600'
              }`}
            >
              <span className="text-base">{slot.slot_num}</span>
              <div className="flex items-center gap-0.5 mt-1">
                {hasYT && <Youtube size={14} className="text-red-400" />}
                {slot.is_complete
                  ? <CheckCircle2 size={14} className="text-green-400" />
                  : slot.is_started
                  ? <Circle size={14} className="text-yellow-400" />
                  : hasTeams
                  ? <Circle size={14} className="text-gray-500" />
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

      {isTournament && slots.length === 0 && selectedDate && (
        <p className="text-center py-6 text-sm leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
          이 날짜에 등록된 대회 경기가 없습니다.<br />
          <span className="text-xs">대회 화면에서 <strong style={{ color: 'var(--mm-ink-soft)' }}>경기 추가</strong> 로 상대팀과 라운드를 넣어 등록하세요.</span>
        </p>
      )}

      {/* 슬랏 미선택 */}
      {!selectedSlotId && (
        <div className="text-center py-8 text-sm" style={{ color: 'var(--mm-muted)' }}>
          위 슬랏을 선택하면 기록을 시작할 수 있습니다
        </div>
      )}

      {/* 선택된 슬랏 기록 UI */}
      {selectedSlot && (
        <div className="pt-4" style={{ borderTop: '1px solid var(--mm-rule)' }}>
          {/* 팀 설정 (항상 상단 compact) */}
          <div
            className="p-3 mb-4"
            style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs shrink-0 font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>경기 {selectedSlot.slot_num}</span>
              {selectedSlot.is_exhibition && (
                <span
                  className="text-xs font-bold px-1.5 py-0.5 shrink-0 uppercase tracking-[0.12em]"
                  style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '4px' }}
                >
                  친선
                </span>
              )}
              <select
                value={pendingHome}
                onChange={e => setPendingHome(e.target.value)}
                className="flex-1 px-2 py-1.5 text-xs cursor-pointer disabled:opacity-50 min-h-[44px]"
                style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
              >
                <option value="">{selectedSlot.is_exhibition ? '홈 임시팀 선택' : '홈 팀 선택'}</option>
                {teamOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {/* 좌우 교체 — 코트 배치가 현장에서 무작위로 정해져 매번 두 셀렉트를 다시 고르던 자리 */}
              <button
                onClick={() => swapSides(selectedSlot.id)}
                disabled={gameStarted || swappingId === selectedSlot.id || !selectedSlot.home_team_id || !selectedSlot.away_team_id}
                title="홈↔어웨이 좌우 바꾸기"
                aria-label="홈과 어웨이 좌우 바꾸기"
                className="shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
              >
                {swappingId === selectedSlot.id
                  ? <Loader2 size={14} className="animate-spin" aria-hidden />
                  : <ArrowLeftRight size={14} aria-hidden />}
              </button>
              <select
                value={pendingAway}
                onChange={e => setPendingAway(e.target.value)}
                className="flex-1 px-2 py-1.5 text-xs cursor-pointer disabled:opacity-50 min-h-[44px]"
                style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
              >
                <option value="">{selectedSlot.is_exhibition ? '어웨이 임시팀 선택' : '어웨이 팀 선택'}</option>
                {teamOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {/* 기록이 시작된 뒤에도 팀을 고칠 수 있어야 한다 — 잘못 지정한 채 마감하면
                  지금까지는 되돌릴 방법이 아예 없었다. 기록은 서버가 함께 옮긴다. */}
              <button
                onClick={saveTeams}
                disabled={savingTeam}
                title={(selectedSlot.is_started || selectedSlot.is_complete)
                  ? '팀을 바꾸고 이 경기 기록의 소속 팀도 함께 옮깁니다'
                  : '이 경기의 홈·어웨이 팀 저장'}
                className="cursor-pointer shrink-0 text-xs font-bold uppercase tracking-[0.14em] px-3 py-1.5 disabled:opacity-50 transition-colors min-h-[44px]"
                style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '4px' }}
              >
                {savingTeam
                  ? <Loader2 size={14} className="animate-spin" />
                  : (selectedSlot.is_started || selectedSlot.is_complete) ? '팀 교체' : '저장'}
              </button>
              {/* 친선 토글은 대회에서 감춘다 — 대회 경기를 친선으로 표시하면 집계 15곳이
                  전부 걸러내 그 대회의 스탯·순위가 통째로 비어 버린다. 대회 경기는 정의상 공식전이다. */}
              {!isTournament && (
              <button
                onClick={toggleExhibition}
                title={selectedSlot.is_exhibition ? '정규전으로 되돌리기' : '친선전으로 표시 (리그 순위 제외)'}
                className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] px-2.5 py-1.5 transition-colors cursor-pointer min-h-[44px]"
                style={
                  selectedSlot.is_exhibition
                    ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-yellow)', borderRadius: '4px' }
                    : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }
                }
              >
                {selectedSlot.is_exhibition ? '친선전 해제' : '친선전으로 표시'}
              </button>
              )}
              {/* 대회는 쿼터 칸마다 해제 버튼이 따로 있다 — 여기서 대표 영상만 지우면
                  쿼터 영상은 남아 화면이 서로 어긋난다. */}
              {!isTournament && selectedSlot.youtube_url && (
                <button
                  onClick={clearYoutubeUrl}
                  title="잘못 매핑된 YouTube 영상 링크 제거"
                  className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] px-2.5 py-1.5 transition-colors cursor-pointer min-h-[44px]"
                  style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
                >
                  영상 링크 제거
                </button>
              )}
              {!selectedSlot.is_started && !selectedSlot.is_complete && (
                <button
                  onClick={deleteSlot}
                  disabled={deletingSlot}
                  title="이 슬롯 삭제 (기록이 있으면 막힙니다)"
                  aria-label={`${selectedSlot.slot_num}경기 슬롯 삭제`}
                  className="inline-flex items-center gap-1.5 shrink-0 text-xs font-bold uppercase tracking-[0.12em] px-2.5 py-1.5 transition-colors duration-200 cursor-pointer min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
                >
                  {deletingSlot
                    ? <Loader2 size={14} className="animate-spin" aria-hidden />
                    : <Trash2 size={14} strokeWidth={2.5} aria-hidden />}
                  슬롯 삭제
                </button>
              )}
            </div>

            {/* 영상 수동 연동 — 자동 매핑은 제목에서 경기 번호를 읽는다. 규칙이 깨지는 날
                (쿼터별로 쪼갠 영상 등)에는 못 붙거나 엉뚱한 슬롯에 붙는다. 그때 손으로 붙일
                수단이 없으면 그날 기록 전체가 영상 없이 진행된다. */}
            <div className="mt-3 pt-3" style={{ borderTop: '1px dashed var(--mm-rule)' }}>
              {/* 대회 — 쿼터별 영상 4칸. 촬영본이 쿼터로 쪼개져 올라오므로 한 칸으로는 담기지 않는다.
                  아래 링크 입력·목록 고르기는 여기서 고른 쿼터를 채운다. */}
              {isTournament && (
                <div className="mb-3">
                  <div className="flex items-baseline gap-2 flex-wrap mb-2">
                    <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>쿼터별 영상</span>
                    <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>
                      기록 중 쿼터를 바꾸면 그 쿼터 영상으로 자동 전환됩니다
                    </span>
                  </div>
                  <ul className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 list-none p-0 m-0">
                    {[1, 2, 3, 4].map(q => {
                      const v = quarterVideos[q]
                      const isTarget = ytTargetQuarter === q
                      const isPlaying = currentQuarter === q
                      return (
                        <li key={q} className="flex items-stretch gap-1">
                          <button
                            type="button"
                            onClick={() => { setYtTargetQuarter(q); setYtPickerOpen(false) }}
                            aria-pressed={isTarget}
                            aria-label={`${q}쿼터 영상 ${v ? '교체' : '연결'}`}
                            title={v ? `${q}쿼터 영상 연결됨 — 눌러서 교체 대상으로 지정` : `${q}쿼터에 영상 연결`}
                            className="flex-1 min-w-0 flex flex-col items-start justify-center px-2 py-1.5 min-h-[44px] text-xs font-bold cursor-pointer transition-colors duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                            style={{
                              background: isTarget ? 'var(--mm-yellow)' : 'var(--mm-panel-alt)',
                              color: isTarget ? 'var(--mm-black)' : 'var(--mm-ink-soft)',
                              border: `1px solid ${isTarget ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
                              borderRadius: '4px',
                            }}
                          >
                            <span className="inline-flex items-center gap-1.5">
                              {q}쿼터
                              {/* 노란 배경은 "지금 링크를 붙일 대상", 이 배지는 "지금 재생 중".
                                  둘이 겹칠 때가 많아 아이콘으로 두면 무슨 뜻인지 구분되지 않는다. */}
                              {isPlaying && (
                                <span
                                  className="px-1 py-px text-[10px] font-bold rounded-sm"
                                  style={{
                                    background: isTarget ? 'rgba(0,0,0,0.18)' : 'var(--mm-panel)',
                                    color: isTarget ? 'var(--mm-black)' : 'var(--mm-ink-soft)',
                                  }}
                                >
                                  재생 중
                                </span>
                              )}
                            </span>
                            <span className="inline-flex items-center gap-1 mt-0.5 font-normal">
                              {v
                                ? <><Youtube size={14} aria-hidden /> 연결됨</>
                                : <span style={{ color: isTarget ? 'var(--mm-black)' : 'var(--mm-muted)' }}>미연결</span>}
                            </span>
                          </button>
                          {v && (
                            <button
                              type="button"
                              onClick={() => clearQuarterVideo(q)}
                              aria-label={`${q}쿼터 영상 해제`}
                              title={`${q}쿼터 영상 해제`}
                              className="shrink-0 w-11 min-h-[44px] inline-flex items-center justify-center cursor-pointer transition-colors duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                              style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-muted)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
                            >
                              <Trash2 size={14} aria-hidden />
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs shrink-0 font-bold" style={{ color: 'var(--mm-muted)' }}>
                  {isTournament ? `${ytTargetQuarter}쿼터 영상` : '영상'}
                </span>
                <label htmlFor="yt-url-input" className="sr-only">YouTube 영상 링크</label>
                <input
                  id="yt-url-input"
                  value={ytInput}
                  onChange={e => setYtInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !ytSaving) { e.preventDefault(); attachVideo(ytInput) } }}
                  placeholder={
                    isTournament
                      ? (quarterVideos[ytTargetQuarter] ? `${ytTargetQuarter}쿼터 영상 교체 — 링크 붙여넣기` : `${ytTargetQuarter}쿼터 영상 링크 붙여넣기`)
                      : selectedSlot.youtube_url ? '다른 영상으로 교체 — 링크 붙여넣기' : 'YouTube 링크 붙여넣기'
                  }
                  className="flex-1 min-w-[180px] px-2.5 py-1.5 text-xs min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
                />
                <button
                  type="button"
                  onClick={() => attachVideo(ytInput)}
                  disabled={ytSaving || ytInput.trim().length === 0}
                  className="inline-flex items-center gap-1.5 shrink-0 cursor-pointer text-xs font-bold uppercase tracking-[0.14em] px-3 py-1.5 min-h-[44px] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '4px' }}
                >
                  {ytSaving
                    ? <Loader2 size={14} className="animate-spin" aria-hidden />
                    : <Link2 size={14} strokeWidth={2.5} aria-hidden />}
                  연동
                </button>
                <button
                  type="button"
                  onClick={loadYoutubeList}
                  disabled={ytListLoading}
                  title="이 날짜에 올라온 채널 영상을 목록으로 불러와 고릅니다"
                  className="inline-flex items-center gap-1.5 shrink-0 cursor-pointer text-xs font-bold uppercase tracking-[0.12em] px-2.5 py-1.5 min-h-[44px] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
                >
                  {ytListLoading
                    ? <Loader2 size={14} className="animate-spin" aria-hidden />
                    : <Search size={14} strokeWidth={2.5} aria-hidden />}
                  목록에서 고르기
                </button>
              </div>

              {isTournament && (
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
                  {/* 조사는 강조 태그 안에 붙인다 — 밖에 두면 "1쿼터 에" 로 한 칸 벌어진다 */}
                  고른 영상은 위에서 선택한 <strong style={{ color: 'var(--mm-ink-soft)' }}>{ytTargetQuarter}쿼터에</strong> 연결됩니다.
                </p>
              )}

              {/* 이 날짜 영상 목록 — 제목을 그대로 보여준다. 번호를 추측하지 않는 게 핵심이다.
                  이미 다른 슬롯에 붙은 영상은 어디에 붙었는지 표시해 중복 배정을 막는다. */}
              {ytPickerOpen && ytList.length > 0 && (
                <ul
                  className="mt-2 list-none p-0 m-0 overflow-y-auto max-h-[260px]"
                  style={{ border: '1px solid var(--mm-rule)', borderRadius: '4px', background: 'var(--mm-panel-alt)' }}
                >
                  {ytList.map(v => {
                    // 대회는 이 경기의 쿼터 칸들과 대조한다 — 슬롯 대표 영상만 보면
                    //   2~4쿼터에 이미 붙은 영상이 "안 붙음"으로 보여 같은 영상을 두 번 붙이게 된다.
                    const usedQuarter = isTournament
                      ? ([1, 2, 3, 4].find(q => quarterVideos[q]?.url.includes(v.video_id)) ?? null)
                      : null
                    const usedBy = isTournament ? null : slots.find(sl => sl.youtube_url?.includes(v.video_id))
                    const isThis = isTournament
                      ? usedQuarter === ytTargetQuarter
                      : usedBy?.id === selectedSlot.id
                    return (
                      <li key={v.video_id} style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                        <button
                          type="button"
                          onClick={() => attachVideo(v.url)}
                          disabled={ytSaving || isThis}
                          className="w-full text-left flex items-center gap-2.5 px-2.5 py-2 min-h-[44px] cursor-pointer transition-colors duration-200 hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                        >
                          {v.thumbnail && (
                            /* eslint-disable-next-line @next/next/no-img-element */
                            <img src={v.thumbnail} alt="" className="w-14 h-10 object-cover shrink-0 opacity-80" style={{ borderRadius: '3px' }} />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs leading-snug" style={{ color: 'var(--mm-ink)' }}>{v.title}</span>
                            {(usedBy || usedQuarter) && (
                              <span className="block text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>
                                {usedQuarter
                                  ? (isThis ? `지금 이 ${usedQuarter}쿼터에 연결됨` : `${usedQuarter}쿼터에 연결됨`)
                                  : isThis ? '지금 이 슬롯에 연결됨' : `${usedBy!.slot_num}경기에 연결됨`}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {/* 이 경기 한정 +1 — 선수 목록의 +1 은 전역 플래그라 켜면 과거 마감 경기까지 소급된다.
                (미라클은 plus_one_bonus=1 이라 그 선수의 과거 야투마다 점수가 올라간다)
                대회 연습처럼 그날만 룰이 다른 경우를 위해 경기 쪽에 담는다. */}
            {(homeRoster.length > 0 || awayRoster.length > 0) && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px dashed var(--mm-rule)' }}>
                <div className="flex items-baseline gap-2 flex-wrap mb-2">
                  <span className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>
                    이 경기 한정 +1
                  </span>
                  <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>
                    이 경기에서만 적용됩니다 · 과거 기록은 그대로입니다
                  </span>
                  <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer min-h-11" style={{ color: 'var(--mm-ink-soft)' }}>
                    <input
                      type="checkbox"
                      checked={extraP1AllSlots}
                      onChange={e => setExtraP1AllSlots(e.target.checked)}
                      className="cursor-pointer w-4 h-4"
                    />
                    이 날짜 전 슬롯에 함께 적용
                  </label>
                </div>
                <ul className="flex flex-wrap gap-1.5 list-none p-0 m-0">
                  {[...homeRoster, ...awayRoster].map(pl => {
                    const extra = (selectedSlot.plus_one_extra_ids ?? []).includes(pl.id)
                    const always = !!pl.plus_one
                    const busy = savingExtraP1 === pl.id
                    return (
                      <li key={pl.id}>
                        <button
                          type="button"
                          onClick={() => toggleExtraPlusOne(pl.id, pl.name)}
                          disabled={busy || always}
                          aria-pressed={extra || always}
                          title={always
                            ? '선수 목록에서 상시 +1 로 지정된 선수입니다 (여기서 끌 수 없습니다)'
                            : extra ? '이 경기 +1 해제' : '이 경기에서만 +1 로 지정'}
                          className="inline-flex items-center gap-1.5 px-2.5 min-h-11 text-xs font-bold cursor-pointer transition-colors duration-200 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                          style={always
                            ? { background: 'var(--mm-panel)', color: 'var(--mm-muted)', border: '1px dashed var(--mm-rule)', borderRadius: '4px' }
                            : extra
                            ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-yellow)', borderRadius: '4px' }
                            : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
                        >
                          {busy
                            ? <Loader2 size={14} className="animate-spin" aria-hidden />
                            : <Zap size={14} strokeWidth={2.5} aria-hidden style={{ opacity: (extra || always) ? 1 : 0.35 }} />}
                          {pl.name}
                          {always && <span className="text-[10px]">상시</span>}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}

            {/* 친선전 안내 — 명단 기준이 평소와 다르다는 걸 화면에서 알 수 있어야 한다.
                안 밝히면 "왜 우리 팀 사람들이 명단에 없지?" 가 된다. */}
            {selectedSlot.is_exhibition && (
              <p
                className="mt-2 text-xs leading-relaxed"
                style={{ color: 'var(--mm-muted)' }}
              >
                <span className="font-bold" style={{ color: 'var(--mm-ink-soft)' }}>스팟 구성</span>
                {' — 이 경기의 팀은 분기 소속을 따르지 않습니다. 위 드롭다운의 팀도, 아래 미배정 목록의 선수도 이 날짜 전용입니다. '}
                {'여기서 한 배정은 이 경기에만 적용되고 분기 팀 구성은 바뀌지 않습니다.'}
              </p>
            )}

            {/* 이 날짜 전용 임시팀 관리 — 친선전은 상시 3팀이 아니라 그날 짠 팀으로 한다.
                만든 팀은 이 날짜의 친선 슬롯에서만 보이고, 순위·명단·드래프트·일정에는 등장하지 않는다. */}
            {selectedSlot.is_exhibition && (
              <div className="mt-3 pt-3" style={{ borderTop: '1px dashed var(--mm-rule)' }}>
                <div className="flex items-baseline gap-2 flex-wrap mb-2">
                  <span className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>
                    임시팀
                  </span>
                  <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>
                    {selectedDate} 전용 · 같은 날 다른 친선 경기에서도 그대로 씁니다
                  </span>
                </div>

                {adhocTeams.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5 mb-2 list-none p-0 m-0">
                    {adhocTeams.map(t => (
                      <li
                        key={t.id}
                        className="inline-flex items-center gap-1.5 pl-2.5 text-xs font-bold min-h-[44px]"
                        style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
                      >
                        <span
                          aria-hidden
                          className="w-2.5 h-2.5 shrink-0"
                          style={{ background: t.color, borderRadius: '9999px' }}
                        />
                        {t.name}
                        <button
                          type="button"
                          onClick={() => deleteAdhocTeam(t.id, t.name)}
                          disabled={deletingTeamId === t.id}
                          aria-label={`임시팀 ${t.name} 삭제`}
                          title="삭제 (경기에 배정돼 있으면 막힙니다)"
                          className="inline-flex items-center justify-center w-11 h-11 shrink-0 cursor-pointer transition-colors duration-200 hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                          style={{ color: 'var(--mm-muted)' }}
                        >
                          {deletingTeamId === t.id
                            ? <Loader2 size={14} className="animate-spin" aria-hidden />
                            : <X size={14} strokeWidth={2.5} aria-hidden />}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs mb-2" style={{ color: 'var(--mm-muted)' }}>
                    아직 만든 팀이 없습니다 — 아래에서 이름을 넣어 두 팀을 만드세요 (예: 흰팀 / 검은팀)
                  </p>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <label htmlFor="adhoc-team-name" className="sr-only">임시팀 이름</label>
                  <input
                    id="adhoc-team-name"
                    value={newTeamName}
                    onChange={e => setNewTeamName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !creatingTeam) { e.preventDefault(); createAdhocTeam() } }}
                    placeholder="팀 이름 (예: 흰팀)"
                    maxLength={20}
                    className="px-2.5 py-1.5 text-xs min-h-[44px] w-[160px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
                  />
                  <label htmlFor="adhoc-team-color" className="sr-only">임시팀 색상</label>
                  <input
                    id="adhoc-team-color"
                    type="color"
                    value={newTeamColor}
                    onChange={e => setNewTeamColor(e.target.value)}
                    title="임시팀 색상 — 박스스코어·기록 화면에서 두 팀을 가르는 색"
                    className="w-11 h-11 shrink-0 cursor-pointer p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
                  />
                  <button
                    type="button"
                    onClick={createAdhocTeam}
                    disabled={creatingTeam || newTeamName.trim().length === 0}
                    className="inline-flex items-center gap-1.5 cursor-pointer shrink-0 text-xs font-bold uppercase tracking-[0.14em] px-3 py-1.5 min-h-[44px] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                    style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '4px' }}
                  >
                    {creatingTeam
                      ? <Loader2 size={14} className="animate-spin" aria-hidden />
                      : <UserPlus size={14} strokeWidth={2.5} aria-hidden />}
                    팀 만들기
                  </button>
                </div>
              </div>
            )}
          </div>

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

              {/* ── 좌측: 비디오 + 경기 제어 (sticky, 뷰포트 높이 고정) ── */}
              {/* 모바일: display:contents → 비디오 sticky 기준이 그리드 전체가 되어 기록 중에도 항상 보임 */}
              {/* --record-header-offset: 모바일/데스크탑 상단 TabNav 아래 stick 위치 통일 */}
              {/* 스티키 컨테이너에 뷰포트 높이 캡 · 내부 스크롤로 마감/마감데이터 등 모든 버튼 접근 가능 (2026-07-18)
                    · 이전: 컨테이너 높이가 뷰포트보다 크면 아래 버튼이 뷰포트 밖으로 밀림
                    · 신규: max-h + overflow-y-auto 로 컨테이너 내부에서 스크롤 가능 */}
              <div
                className="contents lg:block lg:sticky lg:space-y-2"
                style={{ ['--record-header-offset' as string]: '56px', top: 'var(--record-header-offset)' } as React.CSSProperties}
              >

                {/* 경기 시작/마감 (2026-07-18 · 비디오 위로 이동 · 항상 노출 · 스크롤 필요 없음) */}
                <div
                  className="mb-2 lg:mb-0 p-3"
                  style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
                >
                  {selectedSlot?.is_complete ? (
                    <div
                      className="flex items-center justify-center gap-2 py-1.5 text-xs font-medium min-h-[44px]"
                      style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)', borderRadius: '4px' }}
                    >
                      <CheckCircle2 size={14} style={{ color: 'var(--mm-muted)' }} />경기 마감 완료
                    </div>
                  ) : !gameStarted ? (
                    <div
                      className="flex items-center justify-center gap-2 py-1.5 text-xs min-h-[44px]"
                      style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)', borderRadius: '4px' }}
                    >
                      <Play size={14} />우측에서 선발 선수 선택 후 시작
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <div
                        className="flex-1 py-1.5 text-xs text-center font-bold uppercase tracking-[0.14em] min-h-[44px] flex items-center justify-center"
                        style={{ background: 'rgba(5,150,105,0.12)', border: '1px solid #059669', color: '#059669', borderRadius: '4px' }}
                      >
                        경기 진행 중
                      </div>
                      <button
                        onClick={openCompleteModal}
                        className="flex items-center gap-1 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.14em] cursor-pointer transition-colors btn-press min-h-[44px]"
                        style={{ background: 'var(--mm-live-bg)', color: '#FFFFFF', borderRadius: '4px' }}
                      >
                        <Square size={14} />마감
                      </button>
                    </div>
                  )}
                </div>

                {activeVideo ? (
                  <div
                    className="sticky z-[5] mb-2 lg:relative lg:top-auto lg:z-auto lg:mb-0 bg-black rounded-xl overflow-hidden"
                    style={{ top: 'var(--record-header-offset, 56px)' }}
                  >
                    {/* key 에 영상 주소가 들어가므로 쿼터를 넘기면 플레이어가 그 쿼터 영상으로 다시 뜬다.
                        (대회는 쿼터마다 영상이 다르다 — activeVideo 가 그 판정을 담당) */}
                    <YouTubePlayer
                      key={activeVideo.url}
                      youtubeUrl={activeVideo.url}
                      startOffset={activeVideo.startOffset}
                    />
                    {/* 트랜스포트 컨트롤 오버레이 — 영상 좌하단 (44px 터치 타겟) */}
                    {ytPlayer && (
                      <div className="absolute bottom-2 left-2 z-20 flex items-center gap-1 bg-black/75 backdrop-blur-sm rounded-xl px-1.5 py-1">
                        {[
                          { label: '−10', delta: -10 },
                          { label: '−5',  delta: -5  },
                        ].map(({ label, delta }) => (
                          <button key={label} onClick={() => seekRelative(delta)}
                            aria-label={`${label}초`}
                            className="min-h-[44px] min-w-[44px] px-2 rounded-lg text-sm font-bold text-gray-200 hover:text-white hover:bg-white/15 cursor-pointer transition-colors inline-flex items-center justify-center">
                            {label}
                          </button>
                        ))}
                        <button onClick={togglePlay}
                          className="min-h-[44px] min-w-[44px] rounded-lg text-white hover:bg-white/20 cursor-pointer transition-colors mx-0.5 inline-flex items-center justify-center"
                          aria-label="재생/일시정지">
                          <PlayCircle size={24} />
                        </button>
                        {[
                          { label: '+5',  delta: 5  },
                          { label: '+10', delta: 10 },
                        ].map(({ label, delta }) => (
                          <button key={label} onClick={() => seekRelative(delta)}
                            aria-label={`${label}초`}
                            className="min-h-[44px] min-w-[44px] px-2 rounded-lg text-sm font-bold text-gray-200 hover:text-white hover:bg-white/15 cursor-pointer transition-colors inline-flex items-center justify-center">
                            {label}
                          </button>
                        ))}
                        <span className="text-[11px] text-gray-500 ml-1 hidden lg:inline">Space·←·→</span>
                      </div>
                    )}
                    {/* 스코어보드 오버레이 — 영상 상단 좌측 (풀스크린 버튼과 겹치지 않도록 우하단→좌상단 이동) */}
                    {gameStarted && (
                      <div className="absolute top-2 left-2 z-10 pointer-events-none">
                        <div className="flex items-stretch gap-px rounded-xl overflow-hidden shadow-2xl bg-black/80 backdrop-blur-sm border border-white/10 text-white">
                          {/* 홈팀 */}
                          <div className="flex flex-col items-center px-3 py-1.5 min-w-[64px] max-w-[140px]">
                            <span className="text-xs font-bold truncate w-full text-center"
                              style={{ color: selectedSlot.home_team?.color ?? '#3b82f6' }}>
                              {selectedSlot.home_team?.name ?? 'HOME'}
                            </span>
                            <span className="text-2xl lg:text-3xl font-black tabular-nums leading-none mt-0.5">
                              {liveScore?.home ?? selectedSlot.home_score ?? 0}
                            </span>
                          </div>
                          {/* 구분선 + LIVE */}
                          <div className="flex flex-col items-center justify-center px-2 border-x border-white/10">
                            <span className="text-[11px] text-green-400 font-black tracking-widest">LIVE</span>
                            <span className="text-lg font-black text-gray-500 leading-none">:</span>
                          </div>
                          {/* 어웨이팀 */}
                          <div className="flex flex-col items-center px-3 py-1.5 min-w-[64px] max-w-[140px]">
                            <span className="text-xs font-bold truncate w-full text-center"
                              style={{ color: selectedSlot.away_team?.color ?? '#ef4444' }}>
                              {selectedSlot.away_team?.name ?? 'AWAY'}
                            </span>
                            <span className="text-2xl lg:text-3xl font-black tabular-nums leading-none mt-0.5">
                              {liveScore?.away ?? selectedSlot.away_score ?? 0}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="mb-2 lg:mb-0 flex items-center justify-center h-40 text-sm"
                    style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)', borderRadius: '4px' }}
                  >
                    영상 미연동
                  </div>
                )}


              </div>

              {/* ── 우측: 기록 패널 ── */}
              <div className="space-y-3">
                {/* 모바일 탭 */}
                <div className="flex gap-1 lg:hidden">
                  {(['record', 'stats'] as const).map(tab => (
                    <button key={tab} onClick={() => setMobileTab(tab)}
                      className="flex-1 py-2 text-xs font-bold uppercase tracking-[0.14em] transition-colors cursor-pointer min-h-[44px]"
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
                    <div className="space-y-3">
                      <div className="bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden">
                        {/* 최종 스코어 */}
                        <div className="grid grid-cols-[1fr_auto_1fr]">
                          <div className="py-5 px-4 text-center min-w-0">
                            <p className="text-xs font-bold mb-2 break-keep" style={{ color: accentOrInk(selectedSlot.home_team?.color ?? '#3b82f6'), lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                              {selectedSlot.home_team?.name ?? '홈팀'}
                            </p>
                            <p className="text-5xl font-black text-white tabular-nums leading-none">{liveScore?.home ?? selectedSlot.home_score}</p>
                          </div>
                          <div className="flex flex-col items-center justify-center px-4 border-x border-gray-800">
                            <span className="text-2xl text-gray-600 font-black leading-none">:</span>
                          </div>
                          <div className="py-5 px-4 text-center min-w-0">
                            <p className="text-xs font-bold mb-2 break-keep" style={{ color: accentOrInk(selectedSlot.away_team?.color ?? '#ef4444'), lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                              {selectedSlot.away_team?.name ?? '어웨이팀'}
                            </p>
                            <p className="text-5xl font-black text-white tabular-nums leading-none">{liveScore?.away ?? selectedSlot.away_score}</p>
                          </div>
                        </div>
                        {/* 마감 배너 */}
                        <div className="border-t border-gray-800 py-4 px-6 flex flex-col items-center gap-1.5">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 size={20} className="text-gray-500" />
                            <span className="text-lg font-black text-gray-400 tracking-tight">마감된 경기입니다</span>
                          </div>
                          <p className="text-xs text-gray-500">이벤트 로그에서 수정·삭제, 또는 아래에서 기록 모드로 복귀할 수 있습니다</p>
                        </div>
                        {/* 하단 버튼 행 */}
                        <div className="grid grid-cols-2 border-t border-gray-800/60">
                          <button
                            onClick={() => setShowGameLog(true)}
                            className="py-2.5 flex items-center justify-center gap-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-900/60 text-xs font-medium transition-colors cursor-pointer border-r border-gray-800/60"
                          >
                            <ClipboardList size={14} />
                            이벤트 로그
                          </button>
                          <button
                            onClick={reopenGame}
                            disabled={reopening}
                            className="py-2.5 flex items-center justify-center gap-1.5 text-blue-500 hover:text-blue-400 hover:bg-blue-900/20 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 btn-press"
                          >
                            {reopening
                              ? <><Loader2 size={14} className="animate-spin" />복귀 중...</>
                              : <><RefreshCw size={14} />다시 기록하기</>}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : gameStarted ? (
                    <>
                      {/* 컴팩트 스코어 스트립 */}
                      <div className="bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
                        <div className="flex items-stretch">
                          <div className="flex-1 py-2 px-3 flex items-center gap-2">
                            <span className="text-xs font-bold truncate" style={{ color: accentOrInk(selectedSlot?.home_team?.color ?? '#3b82f6') }}>
                              {selectedSlot?.home_team?.name ?? '홈팀'}
                            </span>
                            <span className="text-2xl font-black text-white tabular-nums leading-none ml-auto">
                              {liveScore?.home ?? selectedSlot?.home_score ?? 0}
                            </span>
                          </div>
                          <div className="flex flex-col items-center justify-center px-2 border-x border-gray-800 shrink-0">
                            <span className="text-[10px] text-green-400 font-bold tracking-widest">LIVE</span>
                            <span className="text-sm text-gray-500 font-black leading-none">:</span>
                          </div>
                          <div className="flex-1 py-2 px-3 flex items-center gap-2">
                            <span className="text-2xl font-black text-white tabular-nums leading-none mr-auto">
                              {liveScore?.away ?? selectedSlot?.away_score ?? 0}
                            </span>
                            <span className="text-xs font-bold truncate" style={{ color: accentOrInk(selectedSlot?.away_team?.color ?? '#ef4444') }}>
                              {selectedSlot?.away_team?.name ?? '어웨이팀'}
                            </span>
                          </div>
                          <button
                            onClick={() => setShowGameLog(true)}
                            className="border-l border-gray-800 px-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800/60 cursor-pointer transition-colors shrink-0"
                          >
                            <ClipboardList size={14} />
                            <span className="hidden sm:inline">로그</span>
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
                              className="border-l border-gray-800 px-2.5 flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 hover:bg-gray-800/60 cursor-pointer transition-colors shrink-0"
                              title="플러스원 선수 설정"
                            >
                              <Zap size={14} aria-hidden />
                              <span className="hidden sm:inline">+1</span>
                            </button>
                          )}
                          <button
                            onClick={() => setShowSubModal(true)}
                            className="border-l border-gray-800 px-2.5 flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 hover:bg-gray-800/60 cursor-pointer transition-colors shrink-0"
                          >
                            <RefreshCw size={14} />
                            <span className="hidden sm:inline">교체</span>
                          </button>
                          <button
                            onClick={() => setShowBoxscoreModal(true)}
                            className="border-l border-gray-800 px-2.5 flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 hover:bg-gray-800/60 cursor-pointer transition-colors shrink-0"
                          >
                            <ClipboardList size={14} />
                            <span className="hidden sm:inline">스탯</span>
                          </button>
                        </div>
                      </div>

                      {/* 쿼터 선택 — 1~4쿼터 정식 경기용. 안 건드리면 1Q 고정이라 기존 슬롯 경기와 동일하다. */}
                      <div className="flex items-center gap-1.5 px-2 py-2 border-t border-gray-800 bg-gray-900/60 overflow-x-auto" role="group" aria-label="기록 중인 쿼터">
                        <span className="pl-1 shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500">쿼터</span>
                        {QUARTER_OPTIONS.map(q => {
                          const active = currentQuarter === q.value
                          return (
                            <button
                              key={q.value}
                              type="button"
                              onClick={() => setCurrentQuarter(q.value)}
                              aria-pressed={active}
                              aria-label={`${q.label} 로 기록`}
                              className={`h-11 min-w-11 shrink-0 px-3 text-xs font-black tabular-nums border cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                                active
                                  ? 'bg-amber-500 border-amber-400 text-gray-950'
                                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:text-white'
                              }`}
                            >
                              {q.label}
                            </button>
                          )
                        })}
                      </div>

                      <LeagueEventInputPad
                        leagueId={leagueId}
                        gameId={selectedSlotId}
                        currentQuarter={currentQuarter}
                        leagueHeaders={leagueHeaders}
                        homePlayers={homeRoster.filter(p => onCourt.includes(p.id))}
                        awayPlayers={awayRoster.filter(p => onCourt.includes(p.id))}
                        homeTeam={selectedSlot?.home_team ?? undefined}
                        awayTeam={selectedSlot?.away_team ?? undefined}
                        onEventSaved={() => { handleEventSaved(); fetchLiveScore() }}
                        activePlusOneIds={activePlusOneIds.length > 0 ? activePlusOneIds : undefined}
                        tendencies={tendencies}
                        onOpponentRegistered={() => { if (selectedSlot) loadRoster(selectedSlot) }}
                      />

                      {/* 기록 누락 자동 점검 — 놓친 지점만 뽑아 영상 그 시각으로 보낸다.
                          이름 표시용 명단은 즉석 등록된 상대 선수까지 덮도록 셋을 합친다. */}
                      <RecordAuditPanel
                        leagueId={leagueId}
                        gameId={selectedSlotId}
                        players={[...allPlayers, ...homeRoster, ...awayRoster]}
                        refreshKey={statsRefresh}
                      />

                      {/* 비정규 선수 추가 */}
                      {irregularRoster.length > 0 && (
                        <div
                          className="p-3"
                          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
                        >
                          <div className="flex items-center gap-1.5 mb-2">
                            <UserPlus size={14} style={{ color: 'var(--mm-muted)' }} />
                            <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>비정규 선수 추가</p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {irregularRoster.map(p => {
                              const isAdded = assignedIds.has(p.id)
                              return (
                                <button
                                  key={p.id}
                                  onClick={() => !isAdded && setPendingIrregular(p)}
                                  disabled={isAdded}
                                  className="px-2.5 py-1 text-xs font-medium transition-colors"
                                  style={isAdded
                                    ? { background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)', cursor: 'not-allowed', textDecoration: 'line-through', borderRadius: '4px' }
                                    : { background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', cursor: 'pointer', borderRadius: '4px' }
                                  }
                                >
                                  {p.number ? `#${p.number} ` : ''}{p.name}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* 타팀 임시 출전 (경기 진행 중) — 칩 클릭 시 팀 선택 모달 사용 */}
                      {(() => {
                        const homeLendable = homeRoster.filter(p => p.is_regular !== false)
                        const awayLendable = awayRoster.filter(p => p.is_regular !== false)
                        if (homeLendable.length === 0 && awayLendable.length === 0) return null
                        return (
                          <div
                            className="p-3 space-y-2"
                            style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow)', borderRadius: '4px' }}
                          >
                            <div className="flex items-center gap-1.5">
                              <RefreshCw size={14} style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden />
                              <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-yellow-strong)' }}>타팀 임시 출전</p>
                              <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>이번 경기에만 적용</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {homeLendable.map(p => (
                                <button
                                  key={p.id}
                                  onClick={() => setPendingIrregular(p as IrregularPlayer)}
                                  className="px-2 py-1 text-xs font-medium cursor-pointer transition-colors"
                                  style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-yellow)', color: 'var(--mm-yellow-strong)', borderRadius: '4px' }}
                                >
                                  {p.name} <span style={{ color: 'var(--mm-muted)' }}>→ {selectedSlot?.away_team?.name}</span>
                                </button>
                              ))}
                              {awayLendable.map(p => (
                                <button
                                  key={p.id}
                                  onClick={() => setPendingIrregular(p as IrregularPlayer)}
                                  className="px-2 py-1 text-xs font-medium cursor-pointer transition-colors"
                                  style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-yellow)', color: 'var(--mm-yellow-strong)', borderRadius: '4px' }}
                                >
                                  {p.name} <span style={{ color: 'var(--mm-muted)' }}>→ {selectedSlot?.home_team?.name}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )
                      })()}
                    </>
                  ) : (
                    /* 드래그 앤 드롭 선발 선수 선택 */
                    <div
                      className="p-3 space-y-3"
                      style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
                    >
                      {/* 헤더 */}
                      {(() => {
                        const hc = homeRoster.filter(p => selectedStarters.has(p.id)).length
                        const ac = awayRoster.filter(p => selectedStarters.has(p.id)).length
                        return (
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-base" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>선발 선수 선택</h4>
                            <div className="flex items-center gap-2 text-xs">
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
                            </div>
                          </div>
                        )
                      })()}
                      <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>
                        <span className="hidden lg:inline">선수를 끌어다 팀에 배정하세요. </span>
                        <span className="lg:hidden">카드를 탭하여 선발 체크 · 오른쪽 버튼으로 다른 팀 이동. </span>
                        정규선수 이동은 이번 경기만 적용됩니다.
                      </p>

                      {/* 드롭 존 — 홈/어웨이 2컬럼 (홈=파랑 / 어웨이=빨강은 팀 시맨틱 유지) */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* 홈팀 드롭 존 */}
                        <div
                          onDragOver={e => { e.preventDefault(); setDragOverSide('home') }}
                          onDragLeave={() => setDragOverSide(null)}
                          onDrop={e => handleDrop(e, 'home')}
                          className="min-h-[180px] p-2 border-2 border-dashed transition-colors"
                          style={dragOverSide === 'home'
                            ? { borderColor: '#3b82f6', background: 'rgba(59,130,246,0.10)', borderRadius: '4px' }
                            : { borderColor: 'var(--mm-rule)', borderRadius: '4px' }
                          }
                        >
                          <div className="flex items-center justify-between mb-2 px-1">
                            <span className="text-xs font-bold px-2 py-0.5"
                              style={{ color: accentOrInk(selectedSlot?.home_team?.color ?? '#3b82f6'), backgroundColor: `${selectedSlot?.home_team?.color ?? '#3b82f6'}22`, borderRadius: '4px' }}>
                              {selectedSlot?.home_team?.name ?? '홈팀'}
                            </span>
                            <button onClick={() => selectAllTeam('home')} className="text-xs font-bold uppercase tracking-[0.14em] cursor-pointer transition-colors" style={{ color: '#3b82f6' }}>전체</button>
                          </div>
                          <div className="space-y-1">
                            {homeRoster.map(p => renderStarterCard(p, 'home'))}
                            {homeRoster.length === 0 && (
                              <p className="text-xs px-2 py-4 text-center" style={{ color: 'var(--mm-muted)' }}>선수를 여기로 드래그</p>
                            )}
                          </div>
                        </div>

                        {/* 어웨이팀 드롭 존 */}
                        <div
                          onDragOver={e => { e.preventDefault(); setDragOverSide('away') }}
                          onDragLeave={() => setDragOverSide(null)}
                          onDrop={e => handleDrop(e, 'away')}
                          className="min-h-[180px] p-2 border-2 border-dashed transition-colors"
                          style={dragOverSide === 'away'
                            ? { borderColor: '#ef4444', background: 'rgba(239,68,68,0.10)', borderRadius: '4px' }
                            : { borderColor: 'var(--mm-rule)', borderRadius: '4px' }
                          }
                        >
                          <div className="flex items-center justify-between mb-2 px-1">
                            <span className="text-xs font-bold px-2 py-0.5"
                              style={{ color: accentOrInk(selectedSlot?.away_team?.color ?? '#ef4444'), backgroundColor: `${selectedSlot?.away_team?.color ?? '#ef4444'}22`, borderRadius: '4px' }}>
                              {selectedSlot?.away_team?.name ?? '어웨이팀'}
                            </span>
                            <button onClick={() => selectAllTeam('away')} className="text-xs font-bold uppercase tracking-[0.14em] cursor-pointer transition-colors" style={{ color: '#ef4444' }}>전체</button>
                          </div>
                          <div className="space-y-1">
                            {awayRoster.map(p => renderStarterCard(p, 'away'))}
                            {awayRoster.length === 0 && (
                              <p className="text-xs px-2 py-4 text-center" style={{ color: 'var(--mm-muted)' }}>선수를 여기로 드래그</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 미배정 풀 — 비정규 선수 */}
                      {irregularRoster.length > 0 && (
                        <div>
                          <p className="text-xs mb-2" style={{ color: 'var(--mm-muted)' }}>
                            <span className="hidden lg:inline">위로 드래그하여 팀 배정 / </span>
                            <span className="lg:hidden">칩을 탭하여 팀 배정 / </span>
                            미배정 선수
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
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                  <div
                    className="p-5 w-full max-w-xs space-y-3"
                    style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
                  >
                    <h3 className="font-bold text-base" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>
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
                              className="flex-1 py-2 text-xs font-bold uppercase tracking-[0.14em] cursor-pointer disabled:opacity-50 transition-opacity min-h-[44px]"
                              style={{ backgroundColor: hBg, color: textOnBg(hBg), borderRadius: '4px' }}
                            >
                              {selectedSlot?.home_team?.name ?? '홈팀'}
                            </button>
                            <button
                              onClick={() => addIrregularToTeam(pendingIrregular, 'away')}
                              disabled={addingIrregular}
                              className="flex-1 py-2 text-xs font-bold uppercase tracking-[0.14em] cursor-pointer disabled:opacity-50 transition-opacity min-h-[44px]"
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
              )}

              {/* 교체 모달 */}
              {showSubModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowSubModal(false)}>
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                  <div className="relative w-full max-w-lg bg-gray-900 border border-gray-700 rounded-2xl p-4 shadow-2xl"
                    onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-white">선수 교체</h3>
                      <button onClick={() => setShowSubModal(false)} className="text-gray-500 hover:text-white cursor-pointer transition-colors text-xs">닫기</button>
                    </div>
                    <LeagueSubstitutionPanel
                      leagueId={leagueId}
                      gameId={selectedSlotId}
                      currentQuarter={currentQuarter}
                      leagueHeaders={leagueHeaders}
                      players={allPlayers}
                      homeRoster={homeRoster}
                      awayRoster={awayRoster}
                      homeTeam={selectedSlot?.home_team ?? undefined}
                      awayTeam={selectedSlot?.away_team ?? undefined}
                      minutes={minutes}
                      onSubstitution={async () => {
                        await Promise.all([
                          fetch(`/api/leagues/${leagueId}/minutes?gameId=${selectedSlotId}`)
                            .then(r => r.json()).then(setMinutes),
                          fetch(`/api/leagues/${leagueId}/games/${selectedSlotId}/roster`)
                            .then(r => r.ok ? r.json() : null)
                            .then(d => {
                              if (d?.home) setHomeRoster(d.home)
                              if (d?.away) setAwayRoster(d.away)
                            }),
                        ])
                      }}
                    />
                  </div>
                </div>
              )}

              {/* 박스스코어 모달 */}
              {showBoxscoreModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowBoxscoreModal(false)}>
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                  <div className="relative w-full max-w-3xl max-h-[85vh] overflow-y-auto bg-gray-900 border border-gray-700 rounded-2xl p-4 shadow-2xl"
                    onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-white">실시간 박스스코어</h3>
                      <button onClick={() => setShowBoxscoreModal(false)} className="text-gray-500 hover:text-white cursor-pointer transition-colors text-xs">닫기</button>
                    </div>
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
              )}

              {/* 플러스원 선수 선택 모달 */}
              {showPlusOneModal && plusOneConflict && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowPlusOneModal(false)}>
                  <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
                  <div className="relative bg-gray-900 border border-amber-600/50 rounded-2xl p-6 w-full max-w-sm z-10 space-y-4 shadow-2xl"
                    onClick={e => e.stopPropagation()}>
                    <div className="text-center space-y-1.5">
                      <div className="flex justify-center text-amber-300" aria-hidden><Zap size={24} /></div>
                      <h3 className="text-white font-black text-base">플러스원 선수 선택</h3>
                      <p className="text-gray-400 text-sm">
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
                    <button onClick={() => setShowPlusOneModal(false)} className="w-full text-center text-xs text-gray-600 hover:text-gray-400 cursor-pointer py-1">취소</button>
                  </div>
                </div>
              )}

              {/* 경기 종료 모달 */}
              {showComplete && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                  <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm space-y-4">
                    <h3 className="text-white font-bold">경기 마감</h3>
                    <p className="text-xs text-gray-400">이벤트 기반 점수로 자동 계산됩니다.</p>
                    {liveScore && (
                      <div className="bg-gray-800 rounded-xl p-4 text-center">
                        <div className="flex items-center justify-center gap-4">
                          <div>
                            <p className="text-xs text-gray-500 mb-1" style={{ color: accentOrInk(selectedSlot?.home_team?.color) }}>
                              {selectedSlot?.home_team?.name ?? '홈'}
                            </p>
                            <p className="text-3xl font-black text-white">{liveScore.home}</p>
                          </div>
                          <span className="text-gray-600 font-bold text-lg">vs</span>
                          <div>
                            <p className="text-xs text-gray-500 mb-1" style={{ color: accentOrInk(selectedSlot?.away_team?.color) }}>
                              {selectedSlot?.away_team?.name ?? '어웨이'}
                            </p>
                            <p className="text-3xl font-black text-white">{liveScore.away}</p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 mt-2">이벤트 합산 기준</p>
                      </div>
                    )}
                    {!liveScore && (
                      <button
                        onClick={fetchLiveScore}
                        className="w-full py-2 rounded-lg bg-gray-800 text-gray-400 text-sm cursor-pointer hover:bg-gray-700"
                      >
                        현재 점수 확인
                      </button>
                    )}
                    <div className="flex gap-2">
                      <Button
                        onClick={completeGame}
                        disabled={completing}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 cursor-pointer disabled:opacity-50"
                        size="sm"
                      >
                        {completing ? <><Loader2 size={14} className="mr-1 animate-spin" />처리 중...</> : '완료 처리'}
                      </Button>
                      <Button
                        onClick={() => { setShowComplete(false); setLiveScore(null) }}
                        disabled={completing}
                        variant="outline"
                        size="sm"
                        className="border-gray-700 text-gray-400 cursor-pointer"
                      >취소</Button>
                    </div>
                  </div>
                </div>
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
          }}
          homeTeam={selectedSlot?.home_team ?? undefined}
          awayTeam={selectedSlot?.away_team ?? undefined}
        />
      )}
    </div>
  )
}
