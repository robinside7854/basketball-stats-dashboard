'use client'
// 드래프트 공유 포털 클라이언트 — 방(/draft/[token]) 풀스크린 진입.
//
// 권한별 표시:
//   - 시청자(미인증)        : 보드 + 상태 시청만
//   - 단장(manager)         : 보드 + 본인 차례에 픽 액션 + 채팅
//   - 감독관(supervisor)    : 보드 + 세션 관리 패널(풀/팀장/추첨/시작/완료/리셋/픽 시간) + 채팅
//
// 모든 사용자가 같은 URL 로 입장 → 입력한 코드에 따라 자동 역할 분기.
// 어드민 페이지를 통하지 않고 방 안에서 모든 운영이 가능.

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KeyRound, Trophy, Crown, ShieldCheck, CheckCircle2, Circle, LogOut, Timer, Users, Dice5, Hand, Video, Volume2, VolumeX, FlaskConical } from 'lucide-react'
import DraftSessionControl from '@/components/league/DraftSessionControl'
import DraftLotteryReveal from '@/components/league/DraftLotteryReveal'
import DraftPickReveal, { type PickRevealData } from '@/components/league/DraftPickReveal'
import DraftPickModal from '@/components/league/DraftPickModal'
import DraftScoreboard from '@/components/league/DraftScoreboard'
import DraftFinalResult from '@/components/league/DraftFinalResult'
import DraftNextUpChips from '@/components/league/DraftNextUpChips'
import DraftRoundSlate from '@/components/league/DraftRoundSlate'
import DraftStealBanner, { type StealBannerData } from '@/components/league/DraftStealBanner'
import { EXTENSION_SECONDS, AUTOPICK_GRACE_SECONDS } from '@/lib/draftTimer'
import { primeAudio, playMyTurnBeep, playBeep, setMuted, isMuted } from '@/lib/draftSounds'
import { getReadableTextColor } from '@/lib/colorContrast'
import { createClient } from '@/lib/supabase/client'

interface Team { id: string; name: string; color: string }
interface Player { id: string; name: string; number: number | null; position: string | null; plus_one: boolean }
interface Pick {
  pick_number: number
  round_number: number
  team_id: string
  player_id: string
  player_name: string
  player_number: number | null
  player_position: string | null
  player_photo_url?: string | null
  picked_at: string
  /** 타이머 만료 자동픽 (picked_by_code_id 없음) */
  is_auto?: boolean
}
interface DraftState {
  draft: {
    id: string
    status: 'setup' | 'ready_check' | 'lottery_waiting' | 'lottery_done' | 'in_progress' | 'completed'
    draft_order: string[]
    current_pick_index: number
    current_round: number
    total_picks: number
    method: 'snake' | 'linear'
    started_at: string | null
    completed_at: string | null
    pick_seconds: number
    ready_state: Record<string, boolean>
    lottery_odds: Record<string, number> | null
    lottery_done: boolean
    pick_deadline: string | null
    extensions_used: Record<string, number>
    /** 리허설 세션 — 픽·팀장이 리그(분기 소속)에 반영되지 않는다 (migration 115) */
    is_test?: boolean
  } | null
  current_team_id: string | null
  picks: Pick[]
  available_players: Player[]
  pool_size?: number
  pool_player_ids?: string[]
  teams: Team[]
  leaders?: LeaderRow[]
  supervisor_exists?: boolean
}

interface SessionAuth {
  codeId: string
  role: 'manager' | 'supervisor'
  teamId: string | null
  label: string
  plain: string // 헤더로 재사용
}

interface LeaderRow {
  team_id: string
  leader_player_id: string | null
  /** /current 응답에 enrich 되어 옴 — 팀장 이름이 표시될 화면용 */
  leader_player_name?: string | null
  leader_player_number?: number | null
}

const POLL_INTERVAL_MS = 1500

export default function DraftPortalClient({
  leagueId,
  quarterId,
  draftId,
  leagueName,
  orgSlug,
  year,
  quarter,
}: {
  leagueId: string
  quarterId: string
  draftId: string
  leagueName: string
  orgSlug: string
  year: number | null
  quarter: number | null
}) {
  const [state, setState] = useState<DraftState | null>(null)
  const [auth, setAuth] = useState<SessionAuth | null>(null)
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [authing, setAuthing] = useState(false)
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  // 픽 감지 effect 는 1.5초마다 재실행되므로 selectedPlayerId 를 deps 에 넣으면 의존성이 흔들린다.
  // 가로채기 판정은 ref 로 읽는다 — 값 갱신은 아래 selectPlayer() 한 곳에서만.
  const selectedPlayerIdRef = useRef<string | null>(null)
  const selectPlayer = useCallback((id: string | null) => {
    selectedPlayerIdRef.current = id
    setSelectedPlayerId(id)
  }, [])
  const [picking, setPicking] = useState(false)
  const [extending, setExtending] = useState(false)
  // 선수 선택 전체화면 모달 — 내 차례가 되면 pick_deadline 당 한 번 자동으로 열린다.
  // 닫아도 페이즈 카드의 「선수 선택하기」 CTA 로 언제든 다시 연다.
  const [pickModalOpen, setPickModalOpen] = useState(false)
  // 감독관 운영 패널(<details>) 열림 — 기본 닫힘. 1.5초 폴링 재렌더가 사용자의 열기를
  // 되돌리지 않도록 상태로 제어한다.
  const [opsOpen, setOpsOpen] = useState(false)
  // 소리 음소거 — draftSounds 모듈 전역 플래그의 UI 미러. 빔 프로젝터 한 대만 소리를 내도록.
  const [soundMuted, setSoundMuted] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ────────────────── 서버 시간 캘리브레이션 ──────────────────
  // 사용자 기기 시계가 어긋난 경우(±수십초) 타이머가 빗나가 잘못된 타이밍에 auto-pick 이
  // 트리거되고 서버에 의해 거절될 수 있다. /current 응답의 server_time_ms 와 로컬 시각의
  // 차이를 오프셋으로 보관하여 모든 타이머 연산에 보정값을 적용한다.
  const serverOffsetMsRef = useRef<number>(0)
  const getNow = useCallback(() => Date.now() + serverOffsetMsRef.current, [])

  // 인증 저장 키 — 분기·드래프트 단위
  const authKey = `draft_portal_auth_${draftId}`

  // 페이지 진입 시 복원.
  // localStorage 를 쓴다: sessionStorage 는 탭 단위라 iOS 백그라운드 복귀·카톡 인앱→사파리
  // 이동에서 인증이 통째로 날아가 단장이 코드를 다시 쳐야 했다(2026-09-16 점검).
  // 기존 sessionStorage 값이 남아 있으면 1회 이관한다.
  useEffect(() => {
    try {
      let raw = localStorage.getItem(authKey)
      if (!raw) {
        const legacy = sessionStorage.getItem(authKey)
        if (legacy) {
          localStorage.setItem(authKey, legacy)
          sessionStorage.removeItem(authKey)
          raw = legacy
        }
      }
      if (raw) setAuth(JSON.parse(raw) as SessionAuth)
    } catch { /* ignore */ }
  }, [authKey])

  const fetchState = useCallback(async () => {
    try {
      const r = await fetch(`/api/leagues/${leagueId}/drafts/current?quarterId=${quarterId}`, { cache: 'no-store' })
      if (!r.ok) return
      const d = await r.json()
      // 서버 시각과 로컬 시각 오프셋 보정 — RTT 만큼의 작은 노이즈가 있지만
      // ±수십초 단위 시계 오차에 비해 무시할 수 있어 충분히 안전.
      if (typeof d?.server_time_ms === 'number') {
        serverOffsetMsRef.current = d.server_time_ms - Date.now()
      }
      setState(d)
    } catch { /* ignore */ }
  }, [leagueId, quarterId])

  useEffect(() => {
    fetchState()
    pollRef.current = setInterval(fetchState, POLL_INTERVAL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [fetchState])

  // ────────────────── Supabase Realtime 구독 ──────────────────
  // 1.5s 폴링은 안전망. websocket 으로 league_drafts / league_draft_picks
  // INSERT·UPDATE 를 받자마자 fetchState() 호출 → 클라이언트 간 체감 지연 <200ms.
  // RLS 가 막아도 폴링 fallback 으로 정상 동작.
  useEffect(() => {
    if (!draftId) return
    const supabase = createClient()
    const channel = supabase.channel(`draft_realtime_${draftId}`)
    let cancelled = false
    const refetch = () => { if (!cancelled) fetchState() }
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'league_drafts', filter: `id=eq.${draftId}` }, refetch)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'league_draft_picks', filter: `draft_id=eq.${draftId}` }, refetch)
      .subscribe()
    return () => {
      cancelled = true
      try { supabase.removeChannel(channel) } catch { /* ignore */ }
    }
  }, [draftId, fetchState])

  // 탭이 숨겨지면 폴링 중단, 다시 보이면 즉시 1회 가져온 뒤 폴링 재개 — 모바일 배터리/네트워크 절약
  useEffect(() => {
    if (typeof document === 'undefined') return
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      } else if (document.visibilityState === 'visible') {
        fetchState()
        if (!pollRef.current) {
          pollRef.current = setInterval(fetchState, POLL_INTERVAL_MS)
        }
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [fetchState])

  // 코드 입력 → lookup-code 로 본인 식별
  async function submitCode() {
    if (!codeInput.trim()) { toast.error('코드를 입력하세요'); return }
    setAuthing(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/drafts/lookup-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quarter_id: quarterId, plain_code: codeInput.trim() }),
      })
      const data = await r.json()
      if (!r.ok || !data.matched) {
        toast.error('일치하는 코드가 없습니다 — 대소문자 / 공백 / 분기를 확인하세요', { duration: 5000 })
        setAuthing(false)
        return
      }
      const m = data.matched as { code_id: string; role: 'manager' | 'supervisor'; team_id: string | null; label: string }
      const sa: SessionAuth = {
        codeId: m.code_id,
        role: m.role,
        teamId: m.team_id,
        label: m.label,
        plain: codeInput.trim(),
      }
      setAuth(sa)
      try { localStorage.setItem(authKey, JSON.stringify(sa)) } catch { /* ignore */ }
      // 사용자 제스처(코드 제출 클릭) 직후 오디오 컨텍스트 활성화 —
      // 추후 추첨 드럼롤·픽 부저·내차례 알림 모두 정상 재생되도록
      try { primeAudio() } catch { /* ignore */ }
      setShowCodeModal(false)
      setCodeInput('')
      selectPlayer(null)
      const teamName = state?.teams.find(t => t.id === sa.teamId)?.name
      toast.success(
        sa.role === 'supervisor'
          ? `감독관으로 입장했습니다 — 단계별 안내가 표시됩니다 (${sa.label})`
          : `${teamName ?? ''} 팀장으로 입장했습니다 — READY를 눌러주세요 (${sa.label})`,
        { duration: 5000 },
      )
    } catch {
      toast.error('인증 실패')
    } finally {
      setAuthing(false)
    }
  }

  function logout() {
    try { localStorage.removeItem(authKey) } catch { /* ignore */ }
    try { sessionStorage.removeItem(authKey) } catch { /* ignore */ }
    setAuth(null)
    setCodeInput('')
    selectPlayer(null)
    setShowCodeModal(false)
    toast('인증 해제 — 다른 코드로 입장하세요')
  }

  // 모듈 전역 muted 와 화면 상태를 맞춘다 (마운트 1회)
  useEffect(() => { setSoundMuted(isMuted()) }, [])

  function toggleSound() {
    const next = !soundMuted
    setMuted(next)
    setSoundMuted(next)
    // 첫 상호작용에서 오디오 컨텍스트를 깨운다 — 자동재생 정책 때문에 제스처 없이는 소리가 안 난다
    if (!next) { try { primeAudio() } catch { /* ignore */ } }
    toast(next ? '소리 끔' : '소리 켬', { duration: 1500, position: 'bottom-center' })
  }

  function openCodeModal() {
    setCodeInput('')
    setShowCodeModal(true)
  }

  function closeCodeModal() {
    setCodeInput('')
    setShowCodeModal(false)
  }

  // ────────────────── 첫 픽 타이머 자동 시작 ──────────────────
  // status=in_progress 이고 pick_deadline=null 이며 첫 픽 전 — start-clock 호출.
  // 라우트가 멱등이라 여러 클라가 동시 호출해도 안전.
  const startClockTriedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!auth) return // 시청자는 호출 안 함
    if (!state?.draft || !draftId) return
    if (state.draft.status !== 'in_progress') return
    if (state.draft.pick_deadline) return
    if (state.draft.total_picks > 0) return
    if (startClockTriedRef.current === draftId) return
    startClockTriedRef.current = draftId
    fetch(`/api/leagues/${leagueId}/drafts/${draftId}/start-clock`, {
      method: 'POST',
      headers: { 'X-Draft-Code': auth.plain },
    }).then(() => fetchState()).catch(() => null)
  }, [state?.draft, draftId, leagueId, auth, fetchState])

  // ────────────────── 추첨 결과 1회 표시 ──────────────────
  // 모든 클라이언트에게 동시 자동 연출 — 감독관의 "추첨 시작" 직후 폴링 → lottery_done=true 감지.
  // sessionStorage 가드로 새로고침/재방문 시 중복 노출 차단.
  // 상태 가드: setup/ready_check/lottery_waiting 단계에서는 절대 발화 금지.
  const [showLottery, setShowLottery] = useState(false)
  const lotteryShownRef = useRef<boolean>(false)
  const lastLotteryDoneRef = useRef<boolean | null>(null)
  useEffect(() => {
    if (!state?.draft) return
    const { lottery_done, status, draft_order } = state.draft
    // 재추첨 허용: lottery_done 이 true → false → true 로 다시 들어오면 latch ref 리셋.
    // (감독관이 reset 후 다시 추첨 시작하는 시나리오)
    if (lastLotteryDoneRef.current === true && !lottery_done) {
      lotteryShownRef.current = false
    }
    lastLotteryDoneRef.current = lottery_done
    // 발화 자격: lottery_done=true 이고 status 가 lottery_done 이거나 in_progress 이며 draft_order 가 비어있지 않음
    if (!lottery_done) return
    if (status !== 'lottery_done' && status !== 'in_progress') return
    if (!draft_order || draft_order.length === 0) return
    if (lotteryShownRef.current) return
    lotteryShownRef.current = true
    // sessionStorage 키 비교: 현재 draft_order 시그니처와 일치하면 skip(중복 차단).
    // 새 추첨이면 시그니처가 달라 sessionStorage 가드를 자연스럽게 통과.
    try {
      const currentSig = draft_order.join(',')
      const seen = sessionStorage.getItem(`draft_lottery_seen_${draftId}`)
      if (seen !== currentSig) setShowLottery(true)
    } catch { setShowLottery(true) }
  }, [state?.draft, draftId])

  // ────────────────── 리셋 감지 → 연출 상태 클리어 ──────────────────
  // 감독관이 reset 호출 시 DB 의 picks 가 삭제되어도 클라이언트의 발화 latch 는 그대로 남아,
  // 새 사이클의 첫 픽·라운드 연출이 "이미 봤다"로 판정돼 통째로 사라진다.
  // 다음 조건 중 하나라도 만족하면 reset 으로 판단:
  //   1) status 가 후방 단계(setup/ready_check)로 되돌아옴
  //   2) total_picks 가 N → 0 으로 떨어짐 (in_progress 도중 reset)
  //   3) lottery_done 이 true → false 로 바뀜 (추첨 도중 reset)
  const prevStatusRef = useRef<string | null>(null)
  const prevTotalPicksRef = useRef<number | null>(null)
  const prevLotteryDoneRef = useRef<boolean | null>(null)
  useEffect(() => {
    const status = state?.draft?.status ?? null
    const totalPicks = state?.draft?.total_picks ?? null
    const lotteryDone = state?.draft?.lottery_done ?? null
    const prevStatus = prevStatusRef.current
    const prevTotal = prevTotalPicksRef.current
    const prevLottery = prevLotteryDoneRef.current
    // 초기 로드는 비교 대상 없음 — 스냅샷만 기록
    if (prevStatus !== null && status !== null) {
      const rank = (s: string) => ({ setup: 0, ready_check: 1, lottery_waiting: 2, lottery_done: 3, in_progress: 4, completed: 5 }[s] ?? -1)
      const regressed = rank(status) < rank(prevStatus)
      const picksDropped = prevTotal != null && totalPicks != null && prevTotal > 0 && totalPicks === 0
      const lotteryUndone = prevLottery === true && lotteryDone === false
      if (regressed || picksDropped || lotteryUndone) {
        lastPickFiredRef.current = null
        // 발화 latch ref 도 리셋 — 새 사이클에서 다시 발화하도록
        initialPicksSnapshotRef.current = null
        lastPickNumberRef.current = 0
        lotteryShownRef.current = false
        lastLotteryDoneRef.current = null
        // 이전 사이클의 연출 잔상도 거둔다
        setStealBanner(null)
        setSlateRound(null)
        if (finalDismissedThisSession) setFinalDismissedThisSession(false)
      }
    }
    prevStatusRef.current = status
    prevTotalPicksRef.current = totalPicks
    prevLotteryDoneRef.current = lotteryDone
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.draft?.status, state?.draft?.total_picks, state?.draft?.lottery_done])

  // ────────────────── 픽 이팩트 감지 ──────────────────
  // 첫 픽도 반드시 발화시키기 위해 "초기 스냅샷 ref"를 별도로 관리한다.
  // - initialPicksSnapshotRef === null : 아직 picks 가 한 번도 들어오지 않음
  //   → 첫 picks 수신 시 현재 길이를 스냅샷하고, 마지막 픽 번호를 lastPickNumberRef 에 기록 (이팩트 발화 X)
  //   → 페이지 새로고침/중간 입장 시 과거 픽이 폭발하는 것을 방지
  // - 이후 폴링에서 새 픽이 들어오면 lastPickNumberRef 와 비교해 발화.
  //   드래프트의 "최초 1픽"도 이 경로를 타고 정상 발화한다 (이전 0 기반 가드의 함정 제거).
  //
  // 추첨 reveal 진행 중에는 픽 reveal 모달을 즉시 띄우지 않고 pendingRevealRef 에 큐잉.
  // 추첨 reveal 이 닫힌 직후 200ms 지연으로 큐된 픽 reveal 을 보여준다 (모달 stomp 방지).
  const [pickReveal, setPickReveal] = useState<PickRevealData | null>(null)
  const [showFinal, setShowFinal] = useState(false)
  // 사용자가 명시적으로 닫기를 눌렀는지 — true 면 자동 재오픈 안 함 (페이지 다시 진입하면 false 복원)
  const [finalDismissedThisSession, setFinalDismissedThisSession] = useState(false)
  const initialPicksSnapshotRef = useRef<number | null>(null)
  const lastPickNumberRef = useRef<number>(0)
  const pendingRevealRef = useRef<PickRevealData | null>(null)
  // 가로채기 배너 — 내가 골라 둔 선수를 남이 먼저 뽑았을 때. 초기 로드에서는 절대 뜨지 않는다
  // (아래 effect 의 initialPicksSnapshotRef 가드를 그대로 탄다).
  const [stealBanner, setStealBanner] = useState<StealBannerData | null>(null)
  useEffect(() => {
    if (!state?.picks) return
    const picks = state.picks
    // 첫 진입 시 — 스냅샷만 기록 (발화 X)
    if (initialPicksSnapshotRef.current === null) {
      initialPicksSnapshotRef.current = picks.length
      lastPickNumberRef.current = picks.length > 0
        ? Math.max(...picks.map(p => p.pick_number))
        : 0
      return
    }
    if (picks.length === 0) return
    const sorted = [...picks].sort((a, b) => a.pick_number - b.pick_number)
    const latest = sorted[sorted.length - 1]
    if (latest.pick_number <= lastPickNumberRef.current) return
    const team = state.teams.find(t => t.id === latest.team_id)
    const data: PickRevealData = {
      pickNumber: latest.pick_number,
      roundNumber: latest.round_number,
      teamName: team?.name ?? '?',
      teamColor: team?.color ?? '#6b7280',
      playerName: latest.player_name,
      playerNumber: latest.player_number,
      playerPosition: latest.player_position,
      playerPhotoUrl: latest.player_photo_url ?? null,
    }
    lastPickNumberRef.current = latest.pick_number
    // 가로채기 판정 — 내가 찍어둔 선수를 다른 팀이 가져갔다. 고른 선수는 이미 사라졌으니
    // 선택도 함께 비운다(빈 선택 상태로 두면 픽 버튼이 없는 선수를 확정하려 든다).
    if (
      auth?.role === 'manager'
      && selectedPlayerIdRef.current
      && selectedPlayerIdRef.current === latest.player_id
      && latest.team_id !== auth.teamId
    ) {
      selectPlayer(null)
      setStealBanner({
        pickNumber: latest.pick_number,
        playerName: latest.player_name,
        teamName: team?.name ?? '상대 팀',
        teamColor: team?.color ?? '#6b7280',
      })
      toast.warning(`${latest.player_name} 선수를 ${team?.name ?? '상대 팀'}에 빼앗겼습니다 — 다시 골라 주세요`, {
        duration: 4000,
        position: 'bottom-center',
      })
    }
    if (showLottery) {
      // 추첨 reveal 진행 중 — 픽 reveal 큐잉만, 마운트는 추첨 종료 후
      // 동시에 여러 픽이 들어와도 항상 가장 최신 픽만 보여준다 (overwrite OK)
      pendingRevealRef.current = data
      return
    }
    setPickReveal(data)
  }, [state?.picks, state?.teams, state?.available_players, showLottery, auth?.role, auth?.teamId, selectPlayer])

  // 드래프트 완료 감지 — completed 진입 시 자동 풀스크린 결과 모달.
  // 사용자가 명시적으로 '닫기' 누르기 전까지는 새로고침/재방문 시에도 자동 재오픈.
  // (이전: sessionStorage 가드로 1회만 노출 → 사용자가 우연히 닫으면 결과를 못 보는 문제)
  useEffect(() => {
    if (state?.draft?.status !== 'completed') return
    if (finalDismissedThisSession) return
    setShowFinal(true)
  }, [state?.draft?.status, finalDismissedThisSession])

  // 상태가 completed 가 아니게 되면(리셋 등) dismiss 플래그 리셋해 다음 완료 시 다시 자동 표시
  useEffect(() => {
    if (state?.draft?.status !== 'completed' && finalDismissedThisSession) {
      setFinalDismissedThisSession(false)
    }
  }, [state?.draft?.status, finalDismissedThisSession])

  // 라운드 전환 감지 — current_round 가 증가하면 라운드 슬레이트 연출
  const prevRoundRef = useRef<number | null>(null)
  // 슬레이트로 띄울 라운드. 1라운드는 드래프트 시작 연출이 이미 있으므로 제외(아래 조건).
  const [slateRound, setSlateRound] = useState<number | null>(null)
  useEffect(() => {
    const round = state?.draft?.current_round
    if (typeof round !== 'number') return
    if (state?.draft?.status !== 'in_progress') {
      prevRoundRef.current = round
      return
    }
    const prev = prevRoundRef.current
    if (prev != null && round > prev && round > 1) setSlateRound(round)
    prevRoundRef.current = round
  }, [state?.draft?.current_round, state?.draft?.status])

  // 추첨 reveal 이 닫힌 직후 — 큐된 픽 reveal 발화
  useEffect(() => {
    if (!showLottery && pendingRevealRef.current) {
      const queued = pendingRevealRef.current
      pendingRevealRef.current = null
      // 추첨 모달 unmount 트랜지션 여유
      const t = setTimeout(() => setPickReveal(queued), 200)
      return () => clearTimeout(t)
    }
  }, [showLottery])

  // ────────────────── 타이머 ──────────────────
  // getNow() 를 사용해 서버 시간 기준으로 보정된 시각을 쓴다.
  const [now, setNow] = useState<number>(() => Date.now())
  useEffect(() => {
    // 유예(grace) 단계에서는 1초 단위 카운트다운이 더 또렷하게 보이도록 250ms 폴링 — CPU 부담 없음
    const t = setInterval(() => setNow(getNow()), 250)
    return () => clearInterval(t)
  }, [getNow])

  const draftRow = state?.draft
  // 마감 전 남은 초 (0 까지). 마감을 지나도 0 으로 고정 (grace 단계)
  const remainingSeconds = useMemo(() => {
    if (!draftRow?.pick_deadline) return null
    const diff = Math.max(0, Math.floor((new Date(draftRow.pick_deadline).getTime() - now) / 1000))
    return diff
  }, [draftRow?.pick_deadline, now])

  // ────────────────── 픽별 소요 시간 ──────────────────
  // pick_number → 걸린 초. 기준점(시계 시작)은 **직전 픽의 picked_at** 으로 잡는다.
  // 서버는 픽이 확정되는 순간 다음 픽의 시계를 돌리므로(pick/route 가 pick_deadline 재설정)
  // 직전 픽 시각이 곧 이번 픽의 시작이다. 1픽만 draft.started_at 기준 — 이건 start-draft 시각이라
  // 실제 시계 시작(start-clock, 클라이언트가 폴링 후 호출)보다 1~2초 이르다. 1픽만 그만큼 후하게 잡힌다.
  // pick_deadline 은 현재 픽 것 하나뿐이고 +30초 연장으로 변형되기까지 해서 과거 픽의
  // 시작 시각을 되돌려 계산할 수 없다 — 그래서 직전 픽 시각을 쓴다.
  // 사람이 고르지 않은 픽 — ① 타이머 만료 자동픽(is_auto) ② 풀이 1명 남아 자동 등록된 마지막 픽.
  // 최속/최장 시상과 스코어보드 "자동" 표시에 쓴다. ②는 서버에 표시가 없어 "완료 + 풀 소진 + 마지막 픽"으로 판정.
  const autoPickNumbers = useMemo(() => {
    const picks = state?.picks ?? []
    const out = picks.filter(p => p.is_auto).map(p => p.pick_number)
    if (state?.draft?.status === 'completed' && (state?.available_players?.length ?? 0) === 0 && picks.length > 0) {
      const last = Math.max(...picks.map(p => p.pick_number))
      if (!out.includes(last)) out.push(last)
    }
    return out
  }, [state?.picks, state?.draft?.status, state?.available_players])

  const pickDurations = useMemo(() => {
    const out: Record<number, number> = {}
    const sorted = [...(state?.picks ?? [])].sort((a, b) => a.pick_number - b.pick_number)
    const startedMs = state?.draft?.started_at ? new Date(state.draft.started_at).getTime() : NaN
    let prevMs = Number.isFinite(startedMs) ? startedMs : null
    for (const p of sorted) {
      const t = new Date(p.picked_at).getTime()
      if (!Number.isFinite(t)) continue
      if (prevMs != null && t >= prevMs) out[p.pick_number] = Math.max(0, Math.round((t - prevMs) / 1000))
      prevMs = t
    }
    return out
  }, [state?.picks, state?.draft?.started_at])

  // 유예(grace) 단계 — 마감 후 ~ 마감+GRACE 사이
  const graceInfo = useMemo(() => {
    if (!draftRow?.pick_deadline) return { inGrace: false, remaining: 0 }
    const deadlineMs = new Date(draftRow.pick_deadline).getTime()
    if (Number.isNaN(deadlineMs)) return { inGrace: false, remaining: 0 }
    const elapsedAfterDeadline = now - deadlineMs
    if (elapsedAfterDeadline < 0) return { inGrace: false, remaining: 0 }
    if (elapsedAfterDeadline >= AUTOPICK_GRACE_SECONDS * 1000) return { inGrace: false, remaining: -1 }
    return { inGrace: true, remaining: Math.max(0, Math.ceil((AUTOPICK_GRACE_SECONDS * 1000 - elapsedAfterDeadline) / 1000)) }
  }, [draftRow?.pick_deadline, now])

  // 마감 초과(유예 진입) 토스트.
  // 15초·5초 예고 토스트는 없앴다 — 선수 선택 모달이 헤더에 큰 초시계를 띄우고 있어
  // 같은 정보를 덮는 토스트가 두 번 더 뜨면 선수 목록만 가린다.
  const warnedAtRef = useRef<{ deadline: string | null; warnedGrace: boolean }>({
    deadline: null, warnedGrace: false,
  })
  useEffect(() => {
    if (!draftRow?.pick_deadline || draftRow.status !== 'in_progress') return
    if (warnedAtRef.current.deadline !== draftRow.pick_deadline) {
      // 새 픽 데드라인 — reset
      warnedAtRef.current = { deadline: draftRow.pick_deadline, warnedGrace: false }
    }
    // 유예 진입 — 처음 한 번만
    if (graceInfo.inGrace && !warnedAtRef.current.warnedGrace) {
      warnedAtRef.current.warnedGrace = true
      toast.error(`⏰ 시간 초과 — ${AUTOPICK_GRACE_SECONDS}초 안에 픽하지 않으면 무작위 자동 픽됩니다`, { duration: 5000, position: 'bottom-center' })
    }
  }, [draftRow?.pick_deadline, draftRow?.status, graceInfo.inGrace])

  // ────────────────── 유예 종료 → 무작위 자동 픽 ──────────────────
  // 같은 마감건에 대해 1번만 호출. 인증 사용자만 트리거.
  // 현재 차례 팀의 단장이 우선, 감독관은 +2s 지연(현재 팀 단장이 끊겼을 때 백업).
  const autoPickFiredRef = useRef<string | null>(null)
  useEffect(() => {
    if (!auth || !draftRow || draftRow.status !== 'in_progress' || !draftRow.pick_deadline) return
    const deadlineKey = draftRow.pick_deadline
    if (autoPickFiredRef.current === deadlineKey) return
    const deadlineMs = new Date(deadlineKey).getTime()
    if (Number.isNaN(deadlineMs)) return
    const graceEndMs = deadlineMs + AUTOPICK_GRACE_SECONDS * 1000
    if (now < graceEndMs) return
    // 트리거 우선순위: 현재 팀 단장(즉시) → 그 외 단장(+1.5s) → 감독관(+2s)
    const isCurrentManager = auth.role === 'manager' && state?.current_team_id && auth.teamId === state.current_team_id
    const isOtherManager = auth.role === 'manager' && !isCurrentManager
    const isSupervisor = auth.role === 'supervisor'
    const delayMs = isCurrentManager ? 0 : isOtherManager ? 1500 : isSupervisor ? 2000 : -1
    if (delayMs < 0) return
    // 지터 윈도우 확인 — 현재 시각이 graceEnd + delay 이상 지났을 때만
    if (now < graceEndMs + delayMs) return
    autoPickFiredRef.current = deadlineKey
    fetch(`/api/leagues/${leagueId}/drafts/${draftId}/auto-pick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Draft-Code': auth.plain },
      body: JSON.stringify({
        mode: 'random',
        expected_pick_number: (draftRow.total_picks ?? 0) + 1,
        expected_deadline: draftRow.pick_deadline,
      }),
    }).then(async r => {
      if (!r.ok) {
        // 409 (이미 처리/유예 남음/stale) — 다른 클라가 처리했을 가능성이 큼.
        // 빨간 토스트로 사용자를 놀라게 하지 않고 조용히 무시. 폴링이 정상 결과를 곧 가져온다.
        console.warn('[auto-pick] non-OK response', r.status)
        // 4xx 는 서버가 "이 요청은 무효"라고 답한 것 — ref 를 풀면 250ms 타이머가 매 tick
        // 재요청해 초당 4회씩 같은 거절을 반복한다(2026-09-16 점검). 5xx 만 재시도 대상.
        if (r.status >= 500 && autoPickFiredRef.current === deadlineKey) autoPickFiredRef.current = null
        return
      }
      const data = await r.json().catch(() => ({}))
      if (data?.ok && data?.picked_player_id) {
        const playerName = state?.available_players.find(p => p.id === data.picked_player_id)?.name ?? '선수'
        toast.message(`🎲 무작위 자동 픽: ${playerName}`, { duration: 4000, position: 'bottom-center' })
      }
      fetchState()
    }).catch(err => {
      console.warn('[auto-pick] network error', err)
      if (autoPickFiredRef.current === deadlineKey) autoPickFiredRef.current = null
    })
  }, [now, auth, draftRow, leagueId, draftId, state?.current_team_id, state?.available_players, fetchState])

  // ────────────────── lottery 흐름 (감독관 전용) ──────────────────
  const [actingLottery, setActingLottery] = useState(false)

  async function openLotteryScreen() {
    if (!auth || auth.role !== 'supervisor') return
    try { primeAudio() } catch { /* ignore */ }
    setActingLottery(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/drafts/${draftId}/lottery/open`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Draft-Code': auth.plain },
        body: JSON.stringify({}),
      })
      const data = await r.json()
      if (!r.ok) { toast.error(data.error ?? '실패'); return }
      toast.success('🎬 추첨 대기 화면 열림 — 모두 시청 중')
      fetchState()
    } finally {
      setActingLottery(false)
    }
  }

  async function runLottery() {
    if (!auth || auth.role !== 'supervisor') return
    try { primeAudio() } catch { /* ignore */ }
    setActingLottery(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/drafts/${draftId}/lottery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Draft-Code': auth.plain },
      })
      const data = await r.json()
      if (!r.ok) { toast.error(data.error ?? '추첨 실패'); return }
      toast.success('🎲 추첨 완료!')
      fetchState()
    } finally {
      setActingLottery(false)
    }
  }

  async function startDraft() {
    if (!auth || auth.role !== 'supervisor') return
    try { primeAudio() } catch { /* ignore */ }
    setActingLottery(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/drafts/${draftId}/start-draft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Draft-Code': auth.plain },
      })
      const data = await r.json()
      if (!r.ok) { toast.error(data.error ?? '시작 실패'); return }
      toast.success('🏀 드래프트 시작!')
      fetchState()
    } finally {
      setActingLottery(false)
    }
  }

  // ────────────────── READY 토글 ──────────────────
  const [togglingReady, setTogglingReady] = useState(false)
  async function toggleReady() {
    if (!auth || !state?.draft) return
    if (auth.role === 'manager' && !auth.teamId) return
    setTogglingReady(true)
    try {
      const ready_state = state.draft.ready_state ?? {}
      const myKey = auth.role === 'supervisor' ? 'supervisor' : auth.teamId!
      const currentlyReady = !!ready_state[myKey]
      const body = auth.role === 'supervisor'
        ? { ready: !currentlyReady }
        : { team_id: auth.teamId, ready: !currentlyReady }
      const r = await fetch(`/api/leagues/${leagueId}/drafts/${draftId}/ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Draft-Code': auth.plain },
        body: JSON.stringify(body),
      })
      const data = await r.json()
      if (!r.ok) { toast.error(data.error ?? 'READY 변경 실패'); return }
      toast.success(currentlyReady ? '준비 해제' : '✅ 준비 완료 — 감독관에게 알림 전송됨')
      fetchState()
    } finally {
      setTogglingReady(false)
    }
  }

  // ────────────────── 픽 연장 ──────────────────
  // extending 락으로 스팸 클릭이 여러 번의 연장을 소비하는 것을 방지.
  async function extendPick() {
    if (!auth || auth.role !== 'manager' || !auth.teamId) return
    if (extending) return
    setExtending(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/drafts/${draftId}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Draft-Code': auth.plain },
        body: JSON.stringify({ team_id: auth.teamId }),
      })
      const data = await r.json()
      if (!r.ok) { toast.error(data.error ?? '연장 실패'); return }
      toast.success(`⏱ +${EXTENSION_SECONDS}초 연장`)
      fetchState()
    } finally {
      setExtending(false)
    }
  }

  // 픽 시간 변경 (감독관 권한)
  // applyNow=true 면 현재 픽에도 즉시 적용 (서버가 pick_deadline 재계산)
  async function changePickSeconds(newSeconds: number, applyNow: boolean) {
    if (!auth || auth.role !== 'supervisor' || !state?.draft) return
    const r = await fetch(`/api/admin/leagues/${leagueId}/drafts/${draftId}/pick-seconds`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Draft-Code': auth.plain },
      body: JSON.stringify({ pick_seconds: newSeconds, apply_now: applyNow }),
    })
    const data = await r.json()
    if (!r.ok) {
      toast.error(data.error ?? '픽 시간 변경 실패')
    } else {
      toast.success(
        applyNow && data?.applied_now
          ? `픽 시간 ${newSeconds}초 적용 — 현재 픽에도 반영됨`
          : `픽 시간이 ${newSeconds}초로 변경 (다음 픽부터)`,
      )
      fetchState()
    }
  }

  // 실제 픽 제출 — 선수 선택 모달의 확정 바에서 호출.
  // playerId 를 명시적으로 받아 모달 상태와 selectedPlayerId 의 desync 위험 차단.
  async function makePick(playerId: string) {
    if (!auth || auth.role !== 'manager' || !auth.teamId || !playerId) return
    try { primeAudio() } catch { /* ignore */ }
    setPicking(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/drafts/${draftId}/pick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Draft-Code': auth.plain,
        },
        body: JSON.stringify({ team_id: auth.teamId, league_player_id: playerId }),
      })
      const data = await r.json()
      if (!r.ok) {
        toast.error(data.error ?? '픽 실패', { position: 'bottom-center' })
      } else {
        // 본 화면에서 폭죽 이팩트(DraftPickReveal)가 메인 피드백.
        // 단장 본인은 클릭 직후 빠른 확인용으로 작은 토스트만.
        toast.success('픽 전송됨', { duration: 1800, position: 'bottom-center' })
        selectPlayer(null)
        // 확정됐으면 모달을 닫는다 — 열린 채로 두면 이미 뽑힌 선수가 잠깐 남아 다시 눌린다.
        setPickModalOpen(false)
        fetchState()
      }
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setPicking(false)
    }
  }

  // 마지막 픽 자동 등록 — useEffect 는 isMyTurn 정의 이후로 배치 (아래)
  const lastPickFiredRef = useRef<string | null>(null)
  // 예약 타이머를 ref 가 소유한다. key = `${draftId}:${남은 1명의 id}` — 이 키가 바뀌거나
  // 픽이 확정될 때만 취소한다. 예전엔 effect cleanup 이 취소해서 1.5초 폴링에 매번 죽었다.
  const lastPickTimerRef = useRef<{ key: string; timer: ReturnType<typeof setTimeout> } | null>(null)
  const cancelLastPickTimer = useCallback(() => {
    if (lastPickTimerRef.current) {
      clearTimeout(lastPickTimerRef.current.timer)
      lastPickTimerRef.current = null
    }
  }, [])
  useEffect(() => () => cancelLastPickTimer(), [cancelLastPickTimer])

  const draft = state?.draft
  const teamsById = Object.fromEntries((state?.teams ?? []).map(t => [t.id, t]))
  const myTeam = auth?.teamId ? teamsById[auth.teamId] : null
  const currentTeam = state?.current_team_id ? teamsById[state.current_team_id] : null
  const isMyTurn = !!(auth?.role === 'manager' && state?.current_team_id && state.current_team_id === auth.teamId && draft?.status === 'in_progress')

  // ────────────────── 내 차례 알림 (오디오 + 타이틀 깜빡임) ──────────────────
  // 백그라운드 탭에 있는 단장도 자기 차례 진입을 알아챌 수 있도록.
  // false→true 전환에서만 발화하고, true→false 전환에서 타이틀을 복구한다.
  const wasMyTurnRef = useRef(false)
  const originalTitleRef = useRef<string | null>(null)
  useEffect(() => {
    if (isMyTurn && !wasMyTurnRef.current) {
      wasMyTurnRef.current = true
      try { playMyTurnBeep() } catch { /* ignore */ }
      if (typeof document !== 'undefined') {
        if (originalTitleRef.current == null) originalTitleRef.current = document.title
        document.title = '🔔 내 차례! · 드래프트'
        const interval = setInterval(() => {
          if (typeof document === 'undefined') return
          document.title = document.title.startsWith('🔔') ? '⏰ 픽하세요 · 드래프트' : '🔔 내 차례! · 드래프트'
        }, 1500)
        return () => {
          clearInterval(interval)
          if (typeof document !== 'undefined' && originalTitleRef.current != null) {
            document.title = originalTitleRef.current
          }
        }
      }
    }
    if (!isMyTurn && wasMyTurnRef.current) {
      wasMyTurnRef.current = false
      if (typeof document !== 'undefined' && originalTitleRef.current != null) {
        document.title = originalTitleRef.current
      }
    }
  }, [isMyTurn])

  // ────────────────── 카운트다운 비프 + 진동 (내 차례 한정) ──────────────────
  // 관전 화면에만 있고 포털엔 없었다 — 단장이 폰을 주머니에 넣고 있으면 마감을 모른다.
  // 10초부터 1초마다 비프, 10초 진입과 만료 시점에 진동 1회씩.
  const beepStateRef = useRef<{ deadline: string | null; lastSec: number | null; vibrated10: boolean; vibratedExpiry: boolean }>({
    deadline: null, lastSec: null, vibrated10: false, vibratedExpiry: false,
  })
  useEffect(() => {
    if (!isMyTurn) return
    const dl = draftRow?.pick_deadline ?? null
    if (!dl || draftRow?.status !== 'in_progress') return
    if (beepStateRef.current.deadline !== dl) {
      beepStateRef.current = { deadline: dl, lastSec: null, vibrated10: false, vibratedExpiry: false }
    }
    const st = beepStateRef.current
    const vibrate = () => {
      try { navigator.vibrate?.([60, 40, 60]) } catch { /* 미지원 브라우저 */ }
    }
    if (remainingSeconds != null && !graceInfo.inGrace && remainingSeconds <= 10) {
      if (remainingSeconds > 0 && st.lastSec !== remainingSeconds) {
        st.lastSec = remainingSeconds
        try { playBeep(remainingSeconds <= 3) } catch { /* ignore */ }
      }
      if (!st.vibrated10) { st.vibrated10 = true; vibrate() }
    }
    if (graceInfo.inGrace && !st.vibratedExpiry) { st.vibratedExpiry = true; vibrate() }
  }, [isMyTurn, remainingSeconds, graceInfo.inGrace, draftRow?.pick_deadline, draftRow?.status])

  // ────────────────── 마지막 픽 자동 등록 ──────────────────
  // 본인 차례 + 풀에 1명 남음 + 픽 진행 가능 상태 → 사용자에게 선택지가 없으므로 자동 등록.
  // 토스트 1.5초 빌드업 후 자동 makePick.
  // deadlineKey(pick_deadline) 단위로 1회만 발화. 동시 클라가 있어도 서버 멱등성으로 안전.
  const onlyAvailablePlayerId = state?.available_players?.length === 1 ? state.available_players[0].id : null
  useEffect(() => {
    // 조건을 벗어나면(픽이 들어와 후보가 바뀌었거나 내 차례가 끝났거나) 예약을 거둔다.
    const eligible = !!auth && auth.role === 'manager' && !!auth.teamId
      && isMyTurn && draft?.status === 'in_progress' && !picking
      && !!onlyAvailablePlayerId
    if (!eligible) { cancelLastPickTimer(); return }
    const onlyPlayer = state!.available_players[0]
    const timerKey = `${draftId}:${onlyPlayer.id}`
    // 이미 이 키로 예약돼 있으면 그대로 둔다 — 여기서 재예약하면 폴링마다 1.5초가 리셋된다.
    if (lastPickTimerRef.current?.key === timerKey) return
    cancelLastPickTimer()
    const deadlineKey = draft?.pick_deadline ?? `nodl:${draft?.total_picks ?? 0}`
    if (lastPickFiredRef.current !== deadlineKey) {
      lastPickFiredRef.current = deadlineKey
      toast.message(`🎯 마지막 선수입니다 — ${onlyPlayer.name} 자동 등록됩니다`, { duration: 4000, position: 'bottom-center' })
    }
    lastPickTimerRef.current = {
      key: timerKey,
      timer: setTimeout(() => {
        lastPickTimerRef.current = null
        makePick(onlyPlayer.id).catch(() => {})
      }, 1500),
    }
    // cleanup 없음 — 폴링 재실행이 예약을 죽이던 것이 원래 버그다. 정리는 위 조건 분기와 언마운트에서만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, draft?.status, onlyAvailablePlayerId, auth, picking, draftId, cancelLastPickTimer])

  // 내 차례 배경 틴팅 — 외곽 래퍼에만 적용 (안쪽 카드는 영향 X).
  // 강한 블렌드(80%~A6)로 팀 컬러가 확실히 지배해 절대 놓치지 않도록.
  // 텍스트는 흰색 + text-shadow 로 안전 (안쪽 카드는 자체 bg 유지하므로 본문 가독성 OK).
  const myTurnColor = isMyTurn && myTeam?.color ? myTeam.color : null
  const myTurnTextMode = myTurnColor ? getReadableTextColor(myTurnColor) : 'light'
  void myTurnTextMode // 향후 활용 — 현재는 흰 텍스트 + shadow 로 안전.

  // ────────────────── 선수 선택 모달 자동 오픈 ──────────────────
  // 내 차례가 되면 pick_deadline 당 딱 한 번 자동으로 연다. 사용자가 닫았는데 폴링(1.5초)마다
  // 다시 열리면 스코어보드를 볼 수가 없다 → deadline 을 latch 로 써서 픽당 1회로 묶는다.
  const autoOpenedDeadlineRef = useRef<string | null>(null)
  useEffect(() => {
    if (!isMyTurn) {
      // 내 차례가 끝나면 열려 있던 모달을 닫는다(남의 차례에 선수 목록이 떠 있으면 오조작).
      setPickModalOpen(false)
      return
    }
    const key = draftRow?.pick_deadline ?? `nodl:${draftRow?.total_picks ?? 0}`
    if (autoOpenedDeadlineRef.current === key) return
    autoOpenedDeadlineRef.current = key
    setPickModalOpen(true)
  }, [isMyTurn, draftRow?.pick_deadline, draftRow?.total_picks])

  // 모달 (b) 영역용 파생값
  const myPicks = useMemo(
    () => (state?.picks ?? [])
      .filter(p => p.team_id === auth?.teamId)
      .sort((a, b) => a.pick_number - b.pick_number),
    [state?.picks, auth?.teamId],
  )
  const myCaptainName = useMemo(
    () => (state?.leaders ?? []).find(l => l.team_id === auth?.teamId)?.leader_player_name ?? null,
    [state?.leaders, auth?.teamId],
  )
  // 총 라운드 = 팀당 슬롯 수. TeamPickRoster 의 expectedRounds 와 같은 식이라 두 화면 숫자가 어긋나지 않는다.
  const totalRounds = Math.max(
    1,
    Math.ceil((state?.pool_size ?? state?.picks?.length ?? 1) / Math.max(1, state?.teams?.length ?? 1)),
  )

  const outerStyle = {
    ...(myTurnColor
      ? {
          background: `radial-gradient(ellipse at top, ${myTurnColor}66 0%, transparent 60%), linear-gradient(180deg, ${myTurnColor}99 0%, ${myTurnColor}B3 50%, ${myTurnColor}99 100%), #0a0a0a`,
        }
      : {}),
    transition: 'background 600ms ease',
  } as const

  // iOS 안전 영역 패딩 — 인라인 style 은 미디어쿼리를 못 써서 클래스 arbitrary value 로 준다.
  // (인라인으로 주면 sm:/lg: 패딩이 통째로 죽는다)
  const safeAreaPadding = [
    'pt-[max(0.5rem,env(safe-area-inset-top))] sm:pt-[max(0.75rem,env(safe-area-inset-top))] lg:pt-[max(1rem,env(safe-area-inset-top))]',
    'pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:pb-[max(1rem,env(safe-area-inset-bottom))]',
    'pl-[max(0.5rem,env(safe-area-inset-left))] sm:pl-[max(0.75rem,env(safe-area-inset-left))] lg:pl-[max(1rem,env(safe-area-inset-left))]',
    'pr-[max(0.5rem,env(safe-area-inset-right))] sm:pr-[max(0.75rem,env(safe-area-inset-right))] lg:pr-[max(1rem,env(safe-area-inset-right))]',
  ].join(' ')

  return (
    <div
      className={`min-h-screen max-w-screen-2xl mx-auto transition-[padding] duration-200 ${safeAreaPadding} ${myTurnColor ? 'is-my-turn' : ''}`}
      style={outerStyle}
    >
      {/* 상단 고정 1줄 상태 바 — 스크롤해도 "지금 누구 차례, 몇 초 남았나"가 사라지지 않게 */}
      {draft?.status === 'in_progress' && (
        <div
          className="sticky z-30 mb-2 rounded-lg px-3 py-2 min-h-11 flex items-center gap-2 bg-gray-950 border border-gray-800"
          style={{ top: 'env(safe-area-inset-top, 0px)' }}
        >
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: currentTeam?.color ?? '#6b7280' }} aria-hidden />
          <span className="text-base font-bold text-white truncate min-w-0 max-w-[40%] lg:max-w-none">{currentTeam?.name ?? '대기 중'}</span>
          {isMyTurn && (
            <span className="shrink-0 px-2 py-0.5 rounded-md bg-emerald-500 text-black text-sm font-black">내 차례</span>
          )}
          {/* 다음 2팀 — 스네이크 방향을 반영해 계산 (빔에서 "다음 누구"가 항상 보이게) */}
          {draft.draft_order.length > 0 && (
            <DraftNextUpChips
              teams={state?.teams ?? []}
              draftOrder={draft.draft_order}
              method={draft.method}
              currentRound={draft.current_round}
              currentPickIndex={draft.current_pick_index}
              picksMade={draft.total_picks}
              poolSize={state?.pool_size ?? null}
            />
          )}
          {remainingSeconds != null && (
            <span className={`ml-auto shrink-0 text-lg font-black tabular-nums font-mono ${
              graceInfo.inGrace ? 'text-red-400' : remainingSeconds <= 10 ? 'text-red-300' : 'text-gray-100'
            }`}>
              {graceInfo.inGrace ? `+${graceInfo.remaining}s` : `${remainingSeconds}s`}
            </span>
          )}
        </div>
      )}
      {/* 테스트 세션 고지 — 모든 단계에서 계속 보인다.
          리허설 중 "이거 진짜 반영되는 거 아니냐"는 질문이 한 번이라도 나오면 진행이 멈춘다. */}
      {draft?.is_test && (
        <div className="mb-2 rounded-lg px-3 py-2 min-h-11 flex items-center gap-2 bg-amber-400 text-black">
          <FlaskConical size={16} aria-hidden className="shrink-0" />
          <span className="text-sm sm:text-base font-bold break-keep">테스트 세션 — 결과가 리그에 반영되지 않습니다</span>
        </div>
      )}
      {/* 가로채기 배너 — 현황 바 바로 아래(z-20), 3초 후 스스로 사라진다 */}
      <DraftStealBanner data={stealBanner} onDone={() => setStealBanner(null)} />
      {/* 내 차례 펄스 keyframes — 콜아웃 카드 + 외곽 래퍼에서 사용 */}
      {myTurnColor && (
        <style>{`
          @keyframes myTurnPulse {
            0%, 100% { box-shadow: 0 0 0 1px ${myTurnColor}66, 0 0 24px ${myTurnColor}44; }
            50%      { box-shadow: 0 0 0 2px ${myTurnColor}aa, 0 0 48px ${myTurnColor}88; }
          }
          @keyframes myTurnBrightPulse {
            0%, 100% { filter: brightness(1); }
            50%      { filter: brightness(1.08); }
          }
          .is-my-turn {
            animation: myTurnBrightPulse 2.4s ease-in-out infinite;
          }
          .is-my-turn h1, .is-my-turn h2, .is-my-turn h3 {
            text-shadow: 0 1px 2px rgba(0,0,0,0.45);
          }
          @media (prefers-reduced-motion: reduce) {
            .is-my-turn { animation: none !important; }
            .is-my-turn [style*="myTurnPulse"] { animation: none !important; }
          }
        `}</style>
      )}
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between gap-2 sm:gap-3 mb-3 sm:mb-5">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <Trophy size={24} className="text-amber-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight leading-tight truncate">{leagueName} 드래프트</h1>
            <p className="text-sm text-gray-300 truncate">{year ? `${year}.${quarter}Q` : ''} {orgSlug && <span className="ml-1">· {orgSlug}</span>}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* 소리 토글 — 여러 기기가 동시에 소리를 내면 빔 앞에서 에코가 진다 */}
          <button
            type="button"
            onClick={toggleSound}
            aria-label={soundMuted ? '소리 켜기' : '소리 끄기'}
            aria-pressed={soundMuted}
            title={soundMuted ? '소리 켜기' : '소리 끄기'}
            className="min-w-11 min-h-11 inline-flex items-center justify-center rounded-md text-gray-300 hover:text-white hover:bg-gray-800 cursor-pointer transition-colors duration-200 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          >
            {soundMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          {!auth ? (
            <>
              {/* 폰(390px)에서 텍스트 버튼이 화면을 15px 넘쳤다 → sm 미만은 아이콘 전용 */}
              <button
                type="button"
                onClick={openCodeModal}
                aria-label="단장/감독관 입장"
                className="sm:hidden min-w-11 min-h-11 inline-flex items-center justify-center rounded-md bg-amber-600 hover:bg-amber-500 text-white cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
              >
                <KeyRound size={20} />
              </button>
              <Button onClick={openCodeModal} className="hidden sm:inline-flex bg-amber-600 hover:bg-amber-500 text-white text-base font-bold min-h-[44px] px-5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 transition-colors">
                <KeyRound size={16} className="mr-1.5" /> 단장/감독관 입장
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <div className={`px-2.5 sm:px-3 py-2 rounded-lg text-sm font-bold flex items-center gap-1.5 border min-w-0 max-w-[40vw] sm:max-w-[40vw] lg:max-w-none ${auth.role === 'supervisor' ? 'bg-amber-950/40 border-amber-700/50 text-amber-200' : 'bg-blue-950/40 border-blue-700/50 text-blue-200'}`}>
                {auth.role === 'supervisor' ? <ShieldCheck size={14} className="shrink-0" /> : <Crown size={14} className="shrink-0" />}
                <span className="truncate min-w-0">{auth.label}</span>
                {myTeam && <span className="opacity-70 truncate hidden sm:inline">· {myTeam.name}</span>}
              </div>
              <button onClick={logout} className="p-2 min-w-11 min-h-11 flex items-center justify-center rounded-md text-gray-300 hover:text-white hover:bg-gray-800 cursor-pointer transition-colors duration-200 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950" title="인증 해제" aria-label="인증 해제">
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 상태 배지 */}
      {!draft ? (
        <div className="text-center py-16 sm:py-20 text-gray-200">
          <p className="text-lg sm:text-xl leading-relaxed">아직 드래프트 세션이 생성되지 않았습니다</p>
          <p className="text-sm text-gray-400 mt-2">감독관이 세션을 만들면 자동으로 표시됩니다.</p>
        </div>
      ) : (
        <>
          {/* ── Phase Hero — 모든 사용자에게 현재 단계와 다음 행동을 1줄로 명시 ── */}
          {(() => {
            const status = draft.status
            let title = ''
            let helper = ''
            let tint = 'border-gray-800 bg-gray-900/50'
            if (status === 'setup') {
              title = '드래프트 준비 중'
              helper = '감독관이 참여 설정을 마치면 READY 단계로 넘어갑니다.'
              tint = 'border-blue-800/40 bg-blue-950/30'
            } else if (status === 'ready_check') {
              title = auth?.role === 'manager' ? '준비 단계 — READY를 눌러주세요' : auth?.role === 'supervisor' ? '준비 단계 — 모두의 READY 대기 중' : '준비 단계 — 모두의 READY 대기 중'
              helper = auth?.role === 'manager'
                ? '아래 READY 카드에서 ✋ 준비 완료를 누르면 감독관에게 신호가 전송됩니다.'
                : auth?.role === 'supervisor'
                  ? '모든 팀이 준비되면 추첨 대기 화면 열기 버튼이 활성화됩니다.'
                  : '단장·감독관 모두가 준비되면 추첨이 시작됩니다.'
              tint = 'border-blue-800/50 bg-blue-950/30'
            } else if (status === 'lottery_waiting') {
              title = '추첨 임박 — 시작 신호 대기'
              helper = auth?.role === 'supervisor'
                ? '준비 끝났다면 아래 🎲 추첨 시작을 누르세요.'
                : '감독관이 추첨을 시작할 때까지 기다려주세요.'
              tint = 'border-purple-700/50 bg-purple-950/30'
            } else if (status === 'lottery_done') {
              title = '추첨 완료 — 드래프트 시작 대기'
              helper = auth?.role === 'supervisor'
                ? '아래 🏀 드래프트 시작을 누르면 픽 타이머가 작동합니다.'
                : '감독관이 드래프트를 시작할 때까지 기다려주세요.'
              tint = 'border-amber-700/50 bg-amber-950/30'
            } else if (status === 'in_progress') {
              const pickNo = draft.total_picks + 1
              if (isMyTurn) {
                title = `${draft.current_round}라운드 ${pickNo}픽 — 본인 차례입니다!`
                helper = '「선수 선택하기」를 눌러 선수를 고르고 픽을 확정하세요.'
              } else if (currentTeam) {
                title = `${draft.current_round}라운드 ${pickNo}픽 — ${currentTeam.name} 선택 중`
                helper = ''
              } else {
                title = `${draft.current_round}라운드 ${pickNo}픽 진행 중`
                helper = ''
              }
              tint = isMyTurn ? 'border-emerald-500 bg-emerald-950/40' : 'border-amber-700/40 bg-amber-950/20'
            } else if (status === 'completed') {
              title = '드래프트 완료'
              helper = draft.is_test ? '테스트 세션 — 리그에 반영되지 않았습니다.' : '멤버십이 자동 반영되었습니다.'
              tint = 'border-emerald-700/50 bg-emerald-950/30'
            }
            return (
              <div className={`mb-3 sm:mb-4 rounded-2xl border-2 px-4 py-3 sm:px-5 sm:py-4 ${tint}`}>
                {/* 빔 프로젝터에서 멀리서 읽혀야 한다 — lg 에서 5xl */}
                <h2 className="text-xl sm:text-3xl lg:text-5xl font-black text-white leading-tight break-keep text-balance">{title}</h2>
                {helper && <p className="text-sm sm:text-base text-gray-200 mt-2 leading-relaxed break-keep">{helper}</p>}
                {/* 이 카드의 유일한 주요 액션 */}
                {status === 'in_progress' && isMyTurn && (
                  <button
                    type="button"
                    onClick={() => setPickModalOpen(true)}
                    className="mt-3 w-full sm:w-auto min-h-[56px] px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-lg font-black cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                  >
                    선수 선택하기
                  </button>
                )}
                {status === 'completed' && (
                  <button
                    type="button"
                    onClick={() => setShowFinal(true)}
                    className="mt-3 w-full sm:w-auto min-h-11 px-5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-base font-bold cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                  >
                    결과 다시 보기
                  </button>
                )}
              </div>
            )
          })()}

          {/* READY 진행 상황 패널 (ready_check 단계) — 모두 준비 시 감독관에게 '추첨 대기 화면 열기' 버튼 */}
          {draft.status === 'ready_check' && (
            <ReadyPanel
              teams={state?.teams ?? []}
              readyState={draft.ready_state ?? {}}
              supervisorExists={state?.supervisor_exists ?? false}
              auth={auth}
              onToggle={toggleReady}
              toggling={togglingReady}
              onOpenLottery={auth?.role === 'supervisor' ? openLotteryScreen : undefined}
              opening={actingLottery}
            />
          )}

          {/* 추첨 대기 화면 (lottery_waiting) — 모두에게 큰 시청 카드 + 감독관 "추첨 시작" 버튼 */}
          {draft.status === 'lottery_waiting' && (
            <LotteryWaitScreen
              teams={state?.teams ?? []}
              draftOrder={draft.draft_order}
              isSupervisor={auth?.role === 'supervisor'}
              onStartLottery={runLottery}
              acting={actingLottery}
            />
          )}

          {/* 추첨 완료 (lottery_done) — 결과 표시 + 감독관 "드래프트 시작" 버튼 */}
          {draft.status === 'lottery_done' && (
            <LotteryDoneScreen
              teams={state?.teams ?? []}
              draftOrder={draft.draft_order}
              odds={draft.lottery_odds}
              isSupervisor={auth?.role === 'supervisor'}
              onStartDraft={startDraft}
              acting={actingLottery}
            />
          )}

          {/* NBA 스타일 메인 스코어보드 — 픽이 시작되면 상단에 큰 LED 보드로 표시 */}
          {(draft.status === 'in_progress' || draft.status === 'completed') && draft.draft_order.length > 0 && (
            <DraftScoreboard
              title={`${leagueName.toUpperCase()} DRAFT ${year ?? new Date().getFullYear()}.${quarter ?? Math.floor(new Date().getMonth() / 3) + 1}Q`}
              teams={state?.teams ?? []}
              picks={state?.picks ?? []}
              draftOrder={draft.draft_order}
              method={draft.method}
              totalPicks={draft.total_picks}
              currentPickIndex={draft.current_pick_index}
              status={draft.status}
              pickDurations={pickDurations}
              autoPickNumbers={autoPickNumbers}
            />
          )}

          {/* 액션은 전부 위 페이즈 카드 하나로 모았다 — 예전의 픽 액션/차례 아님/완료/안내 카드
              4종은 같은 정보를 네 번 반복하며 스코어보드를 화면 밖으로 밀어내고 있었다. */}

          {/* 팀별 누적 픽 — 포지션 밸런스 확인용 (in_progress / completed) */}
          {(draft.status === 'in_progress' || draft.status === 'completed') && (
            <TeamPickRoster
              teams={state?.teams ?? []}
              picks={state?.picks ?? []}
              draftOrder={draft.draft_order}
              poolSize={state?.pool_size ?? null}
              pickDurations={pickDurations}
            />
          )}

          {/* 감독관 전용 — 운영 패널. 기본은 접혀 있다.
              진행 중에 풀·리셋·삭제 버튼이 펼쳐져 있으면 스코어보드를 밀어낼 뿐 아니라
              빔 화면에 파괴적인 버튼이 그대로 노출된다. */}
          {auth?.role === 'supervisor' && (
            <details
              open={opsOpen}
              onToggle={e => setOpsOpen(e.currentTarget.open)}
              className="mt-4 sm:mt-6 rounded-2xl border border-gray-800 bg-gray-900/60"
            >
              <summary className="min-h-11 flex items-center gap-2 px-4 py-3 cursor-pointer text-base font-bold text-gray-100 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 rounded-2xl">
                <ShieldCheck size={16} className="text-amber-400 shrink-0" aria-hidden /> 운영 패널
              </summary>
              <div className="px-4 pb-4 space-y-3">
                {draft.status !== 'completed' && (
                  <PickSecondsCard currentSeconds={draft.pick_seconds ?? 80} onChange={changePickSeconds} />
                )}
                <DraftSessionControl
                  leagueId={leagueId}
                  quarterId={quarterId}
                  teams={state?.teams ?? []}
                  authHeaders={{ 'X-Draft-Code': auth.plain }}
                  onChanged={fetchState}
                  // 감독관 코드로는 DELETE 라우트가 401 — 눌러도 실패하는 버튼은 아예 감춘다.
                  // 단 테스트 세션은 서버가 감독관 코드 삭제를 허용한다(리허설 뒷정리).
                  canDelete={!!state?.draft?.is_test}
                />
              </div>
            </details>
          )}
        </>
      )}

      {/* 선수 선택 — 전체화면 모달. 내 차례에 픽당 1회 자동으로 열리고, 닫아도
          페이즈 카드의 「선수 선택하기」로 다시 연다. 첫 탭이 선택, 하단 바가 유일한 확정. */}
      {isMyTurn && draft && (
        <DraftPickModal
          // 픽마다 remount — 이전 픽의 검색어가 남아 "선수가 없다"로 보이는 것을 막는다.
          key={draft.pick_deadline ?? `nodl:${draft.total_picks}`}
          open={pickModalOpen}
          onClose={() => setPickModalOpen(false)}
          players={state?.available_players ?? []}
          selectedId={selectedPlayerId}
          onSelect={selectPlayer}
          onConfirm={() => { if (selectedPlayerId) makePick(selectedPlayerId) }}
          confirming={picking}
          pickNumber={draft.total_picks + 1}
          remainingSeconds={remainingSeconds}
          inGrace={graceInfo.inGrace}
          graceSeconds={graceInfo.remaining}
          extensionsUsed={auth?.teamId ? (draft.extensions_used?.[auth.teamId] ?? 0) : 0}
          onExtend={extendPick}
          extending={extending}
          team={myTeam ?? null}
          captainName={myCaptainName}
          myPicks={myPicks}
          totalRounds={totalRounds}
        />
      )}

      {/* 픽 이팩트 — 새 픽 들어올 때 3초간 전체화면 */}
      {/* isMyTurn: 이 픽이 끝나면 서버는 이미 다음 단장의 시계를 돌린다.
          내가 그 다음이면 4.5초 전면 연출이 내 시간을 먹으므로 1.2초로 줄이고 배지를 띄운다. */}
      <DraftPickReveal data={pickReveal} onClose={() => setPickReveal(null)} isMyTurn={isMyTurn} />

      {/* 라운드 슬레이트 — 라운드가 오를 때 0.9초. 픽 공개(z-100) 아래(z-95), 탭을 막지 않는다.
          라운드는 '직전 라운드 마지막 픽'과 동시에 오르므로 픽 공개가 떠 있는 동안에는 보류한다
          (z-95 에 깔려 통째로 가려지면 연출이 버려진다). 공개가 닫히면 그때 마운트되어 재생된다. */}
      <DraftRoundSlate round={pickReveal ? null : slateRound} onDone={() => setSlateRound(null)} />

      {/* 추첨 결과 애니메이션 — lottery_done 직후 한 번만 (모두에게 동시).
          waiting/ready_check 단계에서는 절대 노출되지 않도록 status 가드 포함. */}
      {state?.draft?.lottery_done
        && (state.draft.status === 'lottery_done' || state.draft.status === 'in_progress')
        && state.draft.draft_order.length > 0
        && showLottery && (
        <DraftLotteryReveal
          order={state.draft.draft_order}
          odds={state.draft.lottery_odds}
          teams={state.teams ?? []}
          onClose={() => {
            setShowLottery(false)
            // 같은 추첨 결과(draft_order)는 새로고침 시 재노출 차단.
            // 새 추첨이면 시그니처가 달라져 자동으로 다시 표시됨.
            try {
              const sig = state.draft?.draft_order?.join(',') ?? '1'
              sessionStorage.setItem(`draft_lottery_seen_${draftId}`, sig)
            } catch { /* ignore */ }
          }}
        />
      )}

      {/* 최종 결과 화면 — completed 시 자동 표시. PNG 다운로드 가능. */}
      {state?.draft?.status === 'completed' && (() => {
        // 팀장 이름 매핑 — /current 의 leaders enrich 응답 + picks 의 player_name 합본
        const playerNames: Record<string, string> = {}
        for (const p of state.picks ?? []) playerNames[p.player_id] = p.player_name
        for (const l of state.leaders ?? []) {
          if (l.leader_player_id && l.leader_player_name) playerNames[l.leader_player_id] = l.leader_player_name
        }
        return (
          <DraftFinalResult
            open={showFinal}
            onClose={() => {
              setShowFinal(false)
              // 사용자가 명시적으로 닫음 — 이번 세션에서는 자동 재오픈 안 함.
              // 아래 '결과 다시 보기' 플로팅 버튼으로 언제든 재오픈 가능.
              setFinalDismissedThisSession(true)
            }}
            title={`${leagueName.toUpperCase()} DRAFT ${year ?? new Date().getFullYear()}.${quarter ?? Math.floor(new Date().getMonth() / 3) + 1}Q 완료!`}
            teams={state.teams ?? []}
            picks={state.picks ?? []}
            draftOrder={state.draft.draft_order ?? []}
            startedAt={state.draft.started_at}
            completedAt={state.draft.completed_at}
            leaders={state.leaders ?? []}
            playerNames={playerNames}
            autoPickNumbers={autoPickNumbers}
            pickDurations={pickDurations}
          />
        )
      })()}

      {/* 결과 다시 보기 — 사용자가 닫기 누른 뒤 노출되는 작은 플로팅 재오픈 버튼.
          completed 상태이고 showFinal=false 이며 사용자가 명시적으로 닫은 경우만 표시. */}
      {state?.draft?.status === 'completed' && !showFinal && finalDismissedThisSession && (
        <button
          type="button"
          onClick={() => setShowFinal(true)}
          aria-label="드래프트 결과 다시 보기"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[55] inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-full bg-amber-600 hover:bg-amber-500 text-white text-sm sm:text-base font-bold shadow-2xl cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          style={{ bottom: 'max(5rem, calc(env(safe-area-inset-bottom) + 5rem))' }}
        >
          <Trophy size={16} /> 결과 다시 보기
        </button>
      )}

      {/* 코드 입력 모달 */}
      {showCodeModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          style={{
            paddingTop: 'max(1rem, env(safe-area-inset-top))',
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
          }}
          onClick={closeCodeModal}
        >
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-black text-xl sm:text-2xl mb-1.5">단장/감독관 입장</h3>
            <p className="text-sm text-gray-200 mb-4 leading-relaxed">어드민에게 발급받은 코드를 입력하세요. (대소문자 구분)</p>
            <Input
              value={codeInput}
              onChange={e => setCodeInput(e.target.value)}
              placeholder="코드"
              className="bg-gray-800 border-gray-700 text-white text-lg font-mono tracking-wider h-12"
              onKeyDown={e => e.key === 'Enter' && submitCode()}
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <Button onClick={closeCodeModal} variant="outline" className="flex-1 bg-gray-800 border-gray-700 text-gray-100 hover:bg-gray-700 min-h-[48px] text-base font-bold">취소</Button>
              <Button onClick={submitCode} disabled={authing} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white min-h-[48px] text-base font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950">
                {authing ? '확인 중...' : '입장'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}



function ReadyPanel({
  teams,
  readyState,
  supervisorExists,
  auth,
  onToggle,
  toggling,
  onOpenLottery,
  opening,
}: {
  teams: Team[]
  readyState: Record<string, boolean>
  supervisorExists: boolean
  auth: { role: 'manager' | 'supervisor'; teamId: string | null; label: string } | null
  onToggle: () => Promise<void>
  toggling: boolean
  onOpenLottery?: () => Promise<void>
  opening?: boolean
}) {
  const myKey = auth ? (auth.role === 'supervisor' ? 'supervisor' : auth.teamId) : null
  const iAmReady = myKey ? !!readyState[myKey] : false
  const total = teams.length + (supervisorExists ? 1 : 0)
  const readyCount = teams.filter(t => readyState[t.id]).length + (supervisorExists && readyState['supervisor'] ? 1 : 0)
  const allReady = total > 0 && readyCount === total
  return (
    <div className={`mb-4 rounded-2xl border p-4 transition-colors ${
      allReady ? 'border-emerald-700/60 bg-emerald-950/30' : 'border-blue-800/40 bg-blue-950/20'
    }`}>
      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Users size={20} className={allReady ? 'text-emerald-300' : 'text-blue-300'} />
          <h3 className="text-base sm:text-lg font-bold uppercase tracking-widest">
            {allReady ? <span className="text-emerald-200">전원 준비 완료 — 추첨 가능</span> : <span className="text-blue-100">READY 체크</span>}
          </h3>
          <span className="text-sm text-gray-200 font-mono tabular-nums">{readyCount}/{total}</span>
        </div>
        {auth && myKey && (
          <Button
            onClick={onToggle}
            disabled={toggling}
            className={`text-base sm:text-lg min-h-[52px] sm:min-h-[56px] px-6 font-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 ${
              iAmReady ? 'bg-gray-700 hover:bg-gray-600 text-gray-100' : 'bg-emerald-600 hover:bg-emerald-500 text-white'
            }`}
          >
            {iAmReady ? '준비 해제' : <span className="inline-flex items-center gap-2"><Hand size={20} aria-hidden /> 준비 완료</span>}
          </Button>
        )}
      </div>
      {auth?.role === 'manager' && !iAmReady && (
        <p className="text-sm text-blue-100 mb-2 leading-relaxed">감독관이 추첨을 시작할 수 있도록 <b className="text-white">준비 완료</b>를 눌러주세요.</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        {teams.map(t => {
          const ready = !!readyState[t.id]
          return (
            <span key={t.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs sm:text-sm break-keep ${
              ready ? 'bg-emerald-900/40 border-emerald-700/60 text-emerald-300' : 'bg-gray-800 border-gray-700 text-gray-200'
            }`}>
              {ready ? <CheckCircle2 size={14} className="shrink-0" /> : <Circle size={14} className="shrink-0" />}
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
              <span>{t.name} 단장</span>
            </span>
          )
        })}
        {supervisorExists && (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm ${
            readyState['supervisor'] ? 'bg-emerald-900/40 border-emerald-700/60 text-emerald-300' : 'bg-gray-800 border-gray-700 text-gray-200'
          }`}>
            {readyState['supervisor'] ? <CheckCircle2 size={14} /> : <Circle size={14} />}
            <ShieldCheck size={14} className="text-amber-400" />
            감독관
          </span>
        )}
      </div>
      {/* 전원 준비 시 감독관에게 노출 */}
      {allReady && onOpenLottery && (
        <div className="mt-4 pt-4 border-t border-emerald-700/40 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm sm:text-base text-emerald-100 flex items-center gap-2 leading-relaxed">
            <ShieldCheck size={16} className="text-amber-400 shrink-0" />
            감독관 권한: 모두 추첨 대기 화면으로 이동합니다
          </p>
          <Button
            onClick={onOpenLottery}
            disabled={opening}
            className="bg-purple-600 hover:bg-purple-500 text-white font-black text-base sm:text-lg h-12 sm:h-14 px-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          >
            <span className="inline-flex items-center gap-2"><Video size={20} aria-hidden /> 추첨 대기 화면 열기</span>
          </Button>
        </div>
      )}
    </div>
  )
}

function LotteryWaitScreen({ teams, draftOrder, isSupervisor, onStartLottery, acting }: {
  teams: Team[]
  draftOrder: string[]
  isSupervisor: boolean
  onStartLottery: () => Promise<void>
  acting: boolean
}) {
  return (
    <div className="mb-3 sm:mb-4 rounded-2xl border-2 border-purple-700/50 bg-gradient-to-br from-purple-950/50 via-indigo-950/40 to-gray-950 p-5 sm:p-8 lg:p-10 text-center overflow-hidden relative">
      {/* 배경 글로우 */}
      <div className="absolute inset-0 opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(circle at center, rgba(168,85,247,0.3), transparent 60%)' }} />

      <div className="relative">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-900/60 border border-purple-600/60 text-purple-100 text-sm font-bold uppercase tracking-widest mb-4">
          <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" /> 추첨 대기 중
        </div>
        <h2 className="text-4xl sm:text-6xl font-black text-white mb-3 tracking-tight" style={{ fontFamily: 'var(--font-bebas, sans-serif)' }}>
          🎰 추첨 임박 🎰
        </h2>
        <p className="text-base sm:text-lg text-purple-100 mb-6 leading-relaxed">
          감독관의 신호를 기다리고 있습니다 —<br className="sm:hidden"/> 곧 NBA 스타일 로또볼 추첨이 시작됩니다
        </p>

        {/* 참가 팀들 표시 */}
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          {teams.map(t => (
            <div key={t.id} className="px-2.5 sm:px-3 py-2 rounded-lg bg-gray-900/80 border-2 text-sm sm:text-base font-bold animate-pulse break-keep" style={{ borderColor: t.color, color: '#fff' }}>
              <div className="w-2 h-2 inline-block rounded-full mr-2" style={{ background: t.color }} />
              {t.name}
            </div>
          ))}
        </div>

        {isSupervisor && (
          <Button
            onClick={onStartLottery}
            disabled={acting || draftOrder.length > 0}
            className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-black text-lg sm:text-xl px-10 h-14 sm:h-16 shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          >
            {acting ? '추첨 중...' : <span className="inline-flex items-center gap-2"><Dice5 size={20} aria-hidden /> 추첨 시작</span>}
          </Button>
        )}
        {!isSupervisor && (
          <p className="text-base text-gray-200 mt-3 leading-relaxed">감독관이 추첨을 시작할 때까지 기다려주세요</p>
        )}
      </div>
    </div>
  )
}

function LotteryDoneScreen({ teams, draftOrder, isSupervisor, onStartDraft, acting }: {
  teams: Team[]
  draftOrder: string[]
  /** 서버가 주지만 화면엔 안 쓴다 — 균등 추첨이라 팀별 %는 정보가 없다 */
  odds?: Record<string, number> | null
  isSupervisor: boolean
  onStartDraft: () => Promise<void>
  acting: boolean
}) {
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))
  return (
    <div className="mb-3 sm:mb-4 rounded-2xl border-2 border-amber-700/60 bg-gradient-to-br from-amber-950/40 via-orange-950/30 to-gray-950 p-5 sm:p-7 lg:p-8 overflow-hidden relative">
      <div className="absolute inset-0 opacity-20 pointer-events-none"
        style={{ background: 'radial-gradient(circle at center, rgba(245,158,11,0.3), transparent 60%)' }} />

      <div className="relative">
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-900/60 border border-amber-600/60 text-amber-100 text-sm font-bold uppercase tracking-widest mb-3">
            🎲 추첨 완료
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">픽 순서 확정</h2>
        </div>

        {/* 픽 순서 큰 카드 */}
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          {draftOrder.map((tid, idx) => {
            const t = teamMap[tid]
            return (
              <div
                key={`${tid}-${idx}`}
                className="flex items-center gap-2 px-2.5 sm:px-3 py-2 sm:py-2.5 rounded-xl border-2 bg-gray-900/80 shadow-lg min-w-0 max-w-full"
                style={{ borderColor: t?.color }}
              >
                <span className="text-2xl sm:text-3xl font-black tabular-nums shrink-0" style={{ color: t?.color, fontFamily: 'var(--font-bebas, sans-serif)' }}>
                  {idx + 1}
                </span>
                <div className="text-left min-w-0">
                  <p className="text-sm sm:text-base lg:text-lg font-bold text-white leading-tight break-keep">{t?.name ?? '?'}</p>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-center text-sm text-gray-300 mb-4">가중치 없음 · 균등 확률</p>

        <div className="text-center">
          {isSupervisor ? (
            <Button
              onClick={onStartDraft}
              disabled={acting}
              className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white font-black text-lg sm:text-xl px-10 h-14 sm:h-16 shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
            >
              {acting ? '시작 중...' : <span className="inline-flex items-center gap-2"><Trophy size={20} aria-hidden /> 드래프트 시작</span>}
            </Button>
          ) : (
            <p className="text-base text-gray-200 leading-relaxed">감독관이 드래프트를 시작할 때까지 기다려주세요</p>
          )}
        </div>
      </div>
    </div>
  )
}

function TeamPickRoster({ teams, picks, draftOrder, poolSize, pickDurations }: {
  teams: Team[]
  picks: Pick[]
  draftOrder: string[]
  /** 풀 인원 — 팀당 몇 칸을 미리 그릴지(라운드 수) 계산에 쓴다 */
  poolSize?: number | null
  /** pick_number → 걸린 초 */
  pickDurations?: Record<number, number>
}) {
  // draftOrder 순서대로 정렬 + draftOrder 에 없는 팀도 뒤에 표시
  const orderedTeams = [
    ...draftOrder.map(id => teams.find(t => t.id === id)).filter(Boolean) as Team[],
    ...teams.filter(t => !draftOrder.includes(t.id)),
  ]
  const picksByTeam: Record<string, Pick[]> = {}
  for (const p of picks) (picksByTeam[p.team_id] ||= []).push(p)
  for (const tid of Object.keys(picksByTeam)) picksByTeam[tid].sort((a, b) => a.pick_number - b.pick_number)

  // 팀당 슬롯 수 = 예상 라운드 수. 빈 칸을 미리 그려두면 "몇 명 더 뽑나"가 눈에 보인다.
  const teamCount = Math.max(1, orderedTeams.length)
  const expectedRounds = Math.max(1, Math.ceil((poolSize ?? picks.length) / teamCount))

  return (
    <div className="mt-4 sm:mt-6 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Users size={16} className="text-blue-300" />
        <h2 className="text-base font-bold text-gray-100 uppercase tracking-widest">팀별 누적 픽</h2>
        <span className="text-xs text-gray-300">포지션 밸런스 확인용</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
        {orderedTeams.map(t => {
          const list = picksByTeam[t.id] ?? []
          // 포지션 카운트
          const posCount: Record<string, number> = {}
          for (const p of list) {
            const positions = (p.player_position ?? '').split(',').map(s => s.trim()).filter(Boolean)
            for (const pos of positions) posCount[pos] = (posCount[pos] ?? 0) + 1
          }
          return (
            <div
              key={t.id}
              className="bg-gray-900/60 border border-gray-800 rounded-xl p-3"
              style={{ borderTopColor: t.color, borderTopWidth: 3 }}
            >
              <div className="flex items-center gap-2 mb-2 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                <p className="text-base font-bold text-white truncate">{t.name}</p>
                <span className="text-xs text-gray-300 ml-auto font-mono shrink-0 tabular-nums">{list.length}명</span>
              </div>
              {Object.keys(posCount).length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2 pb-2 border-b border-gray-800">
                  {Object.entries(posCount).map(([pos, n]) => (
                    <span key={pos} className="px-2 py-0.5 rounded bg-blue-950/40 border border-blue-800/40 text-xs font-bold text-blue-200">
                      {pos} <span className="text-blue-300">×{n}</span>
                    </span>
                  ))}
                </div>
              )}
              {/* 슬롯 — 예상 라운드 수만큼 빈 칸을 먼저 그리고, 픽이 들어오면 그 자리가 채워진다.
                  채워지는 칸은 key(pick_number)가 새로 생기며 마운트되므로 CSS 애니메이션이 1회만 돈다.
                  JS 타이머 없음. */}
              <div className="space-y-1">
                {list.map(p => {
                  const dur = pickDurations?.[p.pick_number]
                  return (
                    <div key={p.pick_number} className="dp-slot-in flex items-center gap-1.5 min-w-0">
                      <span className="text-sm text-gray-300 font-mono w-9 shrink-0 tabular-nums">#{p.pick_number}</span>
                      {p.player_number != null && (
                        <span className="text-amber-300 font-mono font-bold w-8 shrink-0 text-sm tabular-nums">#{p.player_number}</span>
                      )}
                      <span className="text-white font-bold flex-1 truncate text-sm sm:text-base min-w-0 break-keep">{p.player_name}</span>
                      {p.player_position && (
                        <span className="text-sm text-gray-300 font-mono shrink-0">{p.player_position.split(',').map(s => s.trim()).join('·')}</span>
                      )}
                      {dur != null && (
                        <span
                          className="text-sm text-gray-300 font-mono tabular-nums shrink-0 px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700"
                          title="이 픽까지 걸린 시간"
                        >
                          {dur}초
                        </span>
                      )}
                    </div>
                  )
                })}
                {Array.from({ length: Math.max(0, expectedRounds - list.length) }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    className="flex items-center gap-1.5 min-w-0 rounded border border-dashed border-gray-700 px-2 py-1"
                    aria-hidden
                  >
                    <span className="text-sm text-gray-400 font-mono w-9 shrink-0 tabular-nums">—</span>
                    <span className="text-sm text-gray-400 flex-1 min-w-0 truncate">빈 자리</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <style jsx>{`
        /* 픽이 들어와 슬롯이 채워지는 순간에만 1회 재생 — 마운트 애니메이션이라 타이머가 필요 없다 */
        .dp-slot-in {
          animation: dp-slot-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes dp-slot-in {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .dp-slot-in { animation: none; opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  )
}

function PickSecondsCard({ currentSeconds, onChange }: { currentSeconds: number; onChange: (n: number, applyNow: boolean) => Promise<void> }) {
  const [val, setVal] = useState(String(currentSeconds))
  const [applyNow, setApplyNow] = useState(false)
  const [saving, setSaving] = useState(false)
  useEffect(() => { setVal(String(currentSeconds)) }, [currentSeconds])
  async function submit() {
    const n = parseInt(val, 10)
    if (!Number.isFinite(n) || n < 30 || n > 600) { toast.error('30~600초 사이의 숫자'); return }
    if (n === currentSeconds) return
    setSaving(true)
    await onChange(n, applyNow)
    setSaving(false)
  }
  return (
    <div className="bg-blue-950/30 border border-blue-800/40 rounded-2xl p-4 space-y-2.5">
      <p className="text-blue-200 text-base font-bold flex items-center gap-2">
        <Timer size={16} /> 픽 시간 (초)
      </p>
      <p className="text-sm text-gray-200 leading-relaxed">단장들과 채팅 합의 후 변경. 기본은 다음 픽부터 적용.</p>
      <div className="flex gap-2">
        <Input
          type="number"
          min={30}
          max={600}
          step={5}
          value={val}
          onChange={e => setVal(e.target.value)}
          className="bg-gray-900 border-gray-700 text-white text-base h-10 flex-1 font-mono"
        />
        <Button onClick={submit} disabled={saving || parseInt(val, 10) === currentSeconds} className="bg-blue-600 hover:bg-blue-500 text-white h-10 text-sm font-bold px-4">
          {saving ? '저장 중...' : '적용'}
        </Button>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-100 cursor-pointer select-none pt-1 min-h-[32px]">
        <input
          type="checkbox"
          checked={applyNow}
          onChange={e => setApplyNow(e.target.checked)}
          className="w-4 h-4 rounded border-gray-600 bg-gray-900 cursor-pointer accent-blue-500"
        />
        <span>현재 픽에도 즉시 적용 (마감 시각 재계산)</span>
      </label>
      <p className="text-sm text-gray-300 tabular-nums">현재: <b className="text-white">{currentSeconds}초</b></p>
    </div>
  )
}




