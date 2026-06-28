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
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KeyRound, Trophy, Crown, ShieldCheck, CheckCircle2, Circle, LogOut, Lock, Timer, Zap, AlertTriangle, Info, Users } from 'lucide-react'
import DraftSessionControl from '@/components/league/DraftSessionControl'
import DraftChat from '@/components/league/DraftChat'
import DraftLotteryReveal from '@/components/league/DraftLotteryReveal'
import DraftPickReveal, { type PickRevealData } from '@/components/league/DraftPickReveal'
import DraftScoreboard from '@/components/league/DraftScoreboard'
import DraftFinalResult from '@/components/league/DraftFinalResult'
import DraftCommissioner, { type CommissionerEvent } from '@/components/league/DraftCommissioner'
import { pickLine } from '@/lib/commissionerLines'
import { MAX_EXTENSIONS, EXTENSION_SECONDS, AUTOPICK_GRACE_SECONDS } from '@/lib/draftTimer'
import { primeAudio, playMyTurnBeep } from '@/lib/draftSounds'
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
  picked_at: string
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

// 채팅 패널에 inline 표시되는 ephemeral 시스템 메시지 — 총무 발화/픽 안내/READY 변경 등
export interface SystemMessage {
  id: string                          // 발화 key — 중복 방지용
  text: string
  timestamp: number
  kind: 'commissioner' | 'system'
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
  const [picking, setPicking] = useState(false)
  const [extending, setExtending] = useState(false)
  // 채팅 열림 상태 — 부모에서 보유해야 lg+ 에서 본문 우측에 패널 공간을 확보할 수 있다.
  // 닫힘 상태에서는 FAB(56px) 만 있어 본문을 가리지 않으므로 패딩 불필요.
  const [chatOpen, setChatOpen] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ────────────────── 서버 시간 캘리브레이션 ──────────────────
  // 사용자 기기 시계가 어긋난 경우(±수십초) 타이머가 빗나가 잘못된 타이밍에 auto-pick 이
  // 트리거되고 서버에 의해 거절될 수 있다. /current 응답의 server_time_ms 와 로컬 시각의
  // 차이를 오프셋으로 보관하여 모든 타이머 연산에 보정값을 적용한다.
  const serverOffsetMsRef = useRef<number>(0)
  const getNow = useCallback(() => Date.now() + serverOffsetMsRef.current, [])

  // sessionStorage 키 — 분기·드래프트 단위
  const authKey = `draft_portal_auth_${draftId}`

  // 페이지 진입 시 sessionStorage 복원
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(authKey)
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
  // 1.5s 폴링은 안전망. websocket 으로 league_drafts / league_draft_picks / league_draft_chat
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
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'league_draft_chat', filter: `draft_id=eq.${draftId}` }, refetch)
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
      sessionStorage.setItem(authKey, JSON.stringify(sa))
      // 사용자 제스처(코드 제출 클릭) 직후 오디오 컨텍스트 활성화 —
      // 추후 추첨 드럼롤·픽 부저·내차례 알림 모두 정상 재생되도록
      try { primeAudio() } catch { /* ignore */ }
      setShowCodeModal(false)
      setCodeInput('')
      setSelectedPlayerId(null)
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
    sessionStorage.removeItem(authKey)
    setAuth(null)
    setCodeInput('')
    setSelectedPlayerId(null)
    setShowCodeModal(false)
    toast('인증 해제 — 다른 코드로 입장하세요')
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
  const finalSeenRef = useRef<boolean>(false)
  const [commEvent, setCommEvent] = useState<CommissionerEvent | null>(null)
  const lastCommKeyRef = useRef<string | null>(null)
  // 채팅 시스템 메시지 (총무 발화 + 시스템 알림) — 클라이언트 ephemeral, DB 미저장.
  const [chatSystemMessages, setChatSystemMessages] = useState<SystemMessage[]>([])
  const initialPicksSnapshotRef = useRef<number | null>(null)
  const lastPickNumberRef = useRef<number>(0)
  const pendingRevealRef = useRef<PickRevealData | null>(null)
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
    }
    lastPickNumberRef.current = latest.pick_number
    if (showLottery) {
      // 추첨 reveal 진행 중 — 픽 reveal 큐잉만, 마운트는 추첨 종료 후
      // 동시에 여러 픽이 들어와도 항상 가장 최신 픽만 보여준다 (overwrite OK)
      pendingRevealRef.current = data
      return
    }
    setPickReveal(data)
  }, [state?.picks, state?.teams, state?.available_players, showLottery])

  // 드래프트 완료 감지 — sessionStorage 가드로 새로고침 시 중복 노출 차단
  useEffect(() => {
    if (state?.draft?.status !== 'completed') return
    if (finalSeenRef.current) return
    finalSeenRef.current = true
    try {
      const seen = sessionStorage.getItem(`draft_final_seen_${draftId}`)
      if (!seen) setShowFinal(true)
    } catch { /* ignore */ }
  }, [state?.draft?.status, draftId])

  // ────────────────── 미라클 총무 중계 트리거 ──────────────────
  // status 전환, 추첨 결과, 새 픽 도착에 맞춰 멘트를 띄운다.
  // lastCommKeyRef 로 같은 이벤트 중복 발화 차단.
  // pushCommAndChat(): 말풍선 + 채팅 시스템 메시지 동시 발화 — 시청자 전원 동일 정보.
  function fireComm(next: CommissionerEvent) {
    if (lastCommKeyRef.current === next.key) return
    lastCommKeyRef.current = next.key
    setCommEvent(next)
  }
  function pushCommAndChat(next: CommissionerEvent) {
    fireComm(next)
    // 같은 key 의 중복 추가 방지
    setChatSystemMessages(prev => {
      if (prev.some(m => m.id === next.key)) return prev
      const added: SystemMessage = { id: next.key, text: next.text, timestamp: Date.now(), kind: 'commissioner' }
      const merged = [...prev, added]
      // 메모리 leak 방지 — 최근 50개만 유지
      return merged.length > 50 ? merged.slice(merged.length - 50) : merged
    })
  }

  // 1) 드래프트 시작 / 종료
  useEffect(() => {
    if (!state?.draft) return
    const s = state.draft.status
    if (s === 'in_progress' && state.draft.total_picks === 0) {
      pushCommAndChat({ key: `${draftId}:draftStart`, text: pickLine('draftStart', draftId), durationMs: 5000 })
    }
    if (s === 'completed') {
      pushCommAndChat({ key: `${draftId}:draftEnd`, text: pickLine('draftEnd', draftId), durationMs: 6000 })
      // 최종 픽 코멘트 — 별도 라인으로 자연스러운 마무리
      const t = setTimeout(() => {
        pushCommAndChat({ key: `${draftId}:finalPick`, text: pickLine('finalPick', draftId), durationMs: 5500 })
      }, 5200)
      return () => clearTimeout(t)
    }
  }, [state?.draft, draftId])

  // 2) 추첨 — 자기소개(intro) → 시작 안내(lotteryStart) → 결과 발표(lotteryResult)
  // status 가 lottery_waiting 으로 처음 들어왔을 때 인트로 한 번.
  const introFiredRef = useRef<boolean>(false)
  useEffect(() => {
    if (!state?.draft) return
    if (state.draft.status === 'lottery_waiting' && !introFiredRef.current) {
      introFiredRef.current = true
      pushCommAndChat({ key: `${draftId}:intro`, text: pickLine('intro', draftId), durationMs: 6000 })
      // 인트로 직후 5.5s 뒤 추첨 시작 안내 (말풍선이 인트로 발화를 덮지 않도록)
      const t = setTimeout(() => {
        pushCommAndChat({ key: `${draftId}:lotteryStart`, text: pickLine('lotteryStart', draftId), durationMs: 4500 })
      }, 5500)
      return () => clearTimeout(t)
    }
    if (state.draft.lottery_done && state.draft.draft_order.length > 0) {
      const firstTeamId = state.draft.draft_order[0]
      const firstTeam = state.teams.find(t => t.id === firstTeamId)
      if (firstTeam) {
        const t = setTimeout(() => {
          pushCommAndChat({
            key: `${draftId}:lotteryResult`,
            text: pickLine('lotteryResult', draftId, { teamName: firstTeam.name }),
            durationMs: 6000,
          })
        }, 4500)
        return () => clearTimeout(t)
      }
    }
  }, [state?.draft, state?.teams, draftId])

  // 3) 새 픽 도착 → announce + 3초 뒤 reaction
  const lastAnnouncedPickRef = useRef<number>(0)
  useEffect(() => {
    if (!state?.picks || state.picks.length === 0) return
    const sorted = [...state.picks].sort((a, b) => a.pick_number - b.pick_number)
    const latest = sorted[sorted.length - 1]
    if (latest.pick_number <= lastAnnouncedPickRef.current) return
    lastAnnouncedPickRef.current = latest.pick_number
    const team = state.teams.find(t => t.id === latest.team_id)
    if (!team) return
    const ctx = {
      teamName: team.name,
      playerName: latest.player_name,
      round: latest.round_number,
      pick: latest.pick_number,
    }
    fireComm({
      key: `${draftId}:pick:${latest.pick_number}:announce`,
      text: pickLine('pickAnnounce', `${draftId}:${latest.pick_number}`, ctx),
      durationMs: 4500,
    })
    const t = setTimeout(() => {
      fireComm({
        key: `${draftId}:pick:${latest.pick_number}:reaction`,
        text: pickLine('pickReaction', `${draftId}:${latest.pick_number}:r`),
        durationMs: 4000,
      })
    }, 4800)
    return () => clearTimeout(t)
  }, [state?.picks, state?.teams, draftId])

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

  // 시간 임박 알림 (15초, 5초) + 유예 진입 토스트
  const warnedAtRef = useRef<{ deadline: string | null; warned15: boolean; warned5: boolean; warnedGrace: boolean }>({
    deadline: null, warned15: false, warned5: false, warnedGrace: false,
  })
  useEffect(() => {
    if (!draftRow?.pick_deadline || draftRow.status !== 'in_progress') return
    const w = warnedAtRef.current
    if (w.deadline !== draftRow.pick_deadline) {
      // 새 픽 데드라인 — reset
      warnedAtRef.current = { deadline: draftRow.pick_deadline, warned15: false, warned5: false, warnedGrace: false }
    }
    if (remainingSeconds != null && !graceInfo.inGrace) {
      if (!warnedAtRef.current.warned15 && remainingSeconds <= 15 && remainingSeconds > 5) {
        warnedAtRef.current.warned15 = true
        toast.warning(`⏰ 15초 남음 — 픽을 서둘러주세요`, { duration: 3000 })
      }
      if (!warnedAtRef.current.warned5 && remainingSeconds <= 5 && remainingSeconds > 0) {
        warnedAtRef.current.warned5 = true
        toast.error(`🚨 5초 — 픽 임박!`, { duration: 3000 })
      }
    }
    // 유예 진입 — 처음 한 번만
    if (graceInfo.inGrace && !warnedAtRef.current.warnedGrace) {
      warnedAtRef.current.warnedGrace = true
      toast.error(`⏰ 시간 초과 — ${AUTOPICK_GRACE_SECONDS}초 안에 픽하지 않으면 무작위 자동 픽됩니다`, { duration: 5000 })
    }
  }, [remainingSeconds, draftRow?.pick_deadline, draftRow?.status, graceInfo.inGrace])

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
        // 다음 데드라인 윈도우에서 다시 시도할 수 있게 ref 리셋
        if (autoPickFiredRef.current === deadlineKey) autoPickFiredRef.current = null
        return
      }
      const data = await r.json().catch(() => ({}))
      if (data?.ok && data?.picked_player_id) {
        const playerName = state?.available_players.find(p => p.id === data.picked_player_id)?.name ?? '선수'
        toast.message(`🎲 무작위 자동 픽: ${playerName}`, { duration: 4000 })
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

  // 픽 시간 변경 감지 → 모든 클라이언트에게 토스트.
  // 이전 값과 다르고 마운트 직후 첫 폴링이 아닐 때만 발화 (초기 로드 시 false-positive 방지).
  const prevPickSecondsRef = useRef<number | null>(null)
  useEffect(() => {
    const next = state?.draft?.pick_seconds
    if (typeof next !== 'number') return
    const prev = prevPickSecondsRef.current
    if (prev != null && prev !== next) {
      toast.info(`⏱ 감독관이 픽 시간을 ${next}초로 변경했습니다`, { duration: 4000 })
    }
    prevPickSecondsRef.current = next
  }, [state?.draft?.pick_seconds])

  async function makePick() {
    if (!auth || auth.role !== 'manager' || !auth.teamId || !selectedPlayerId) return
    try { primeAudio() } catch { /* ignore */ }
    setPicking(true)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/drafts/${draftId}/pick`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Draft-Code': auth.plain,
        },
        body: JSON.stringify({ team_id: auth.teamId, league_player_id: selectedPlayerId }),
      })
      const data = await r.json()
      if (!r.ok) {
        toast.error(data.error ?? '픽 실패')
      } else {
        // 본 화면에서 폭죽 이팩트(DraftPickReveal)가 메인 피드백.
        // 단장 본인은 클릭 직후 빠른 확인용으로 작은 토스트만.
        toast.success('픽 전송됨', { duration: 1800 })
        setSelectedPlayerId(null)
        fetchState()
      }
    } catch {
      toast.error('네트워크 오류')
    } finally {
      setPicking(false)
    }
  }

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

  // 라운드 그룹핑
  const totalRounds = draft ? Math.max(1, Math.ceil(draft.total_picks / Math.max(draft.draft_order.length, 1))) : 0
  const picksByRound: Record<number, Pick[]> = {}
  for (const p of state?.picks ?? []) {
    (picksByRound[p.round_number] ||= []).push(p)
  }

  // 내 차례 배경 틴팅 — 외곽 래퍼에만 적용 (안쪽 카드는 영향 X).
  // 강한 블렌드(80%~A6)로 팀 컬러가 확실히 지배해 절대 놓치지 않도록.
  // 텍스트는 흰색 + text-shadow 로 안전 (안쪽 카드는 자체 bg 유지하므로 본문 가독성 OK).
  const myTurnColor = isMyTurn && myTeam?.color ? myTeam.color : null
  const myTurnTextMode = myTurnColor ? getReadableTextColor(myTurnColor) : 'light'
  void myTurnTextMode // 향후 활용 — 현재는 흰 텍스트 + shadow 로 안전.
  const outerStyle = myTurnColor
    ? {
        background: `radial-gradient(ellipse at top, ${myTurnColor}66 0%, transparent 60%), linear-gradient(180deg, ${myTurnColor}99 0%, ${myTurnColor}B3 50%, ${myTurnColor}99 100%), #0a0a0a`,
        transition: 'background 600ms ease',
      }
    : { transition: 'background 600ms ease' as const }

  return (
    <div
      className={`min-h-screen p-3 sm:p-5 lg:p-6 max-w-screen-2xl mx-auto transition-[padding] duration-200 ${
        chatOpen ? 'lg:pr-[360px]' : ''
      } ${myTurnColor ? 'is-my-turn' : ''}`}
      style={outerStyle}
    >
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
      <div className="flex items-center justify-between gap-3 mb-3 sm:mb-5">
        <div className="flex items-center gap-3">
          <Trophy className="text-amber-400 w-8 h-8 sm:w-9 sm:h-9 shrink-0" />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight leading-tight break-keep">{leagueName} 드래프트</h1>
            <p className="text-xs sm:text-sm text-gray-300 truncate">{year ? `${year}.${quarter}Q` : ''} {orgSlug && <span className="ml-1">· {orgSlug}</span>}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!auth ? (
            <Button onClick={openCodeModal} className="bg-amber-600 hover:bg-amber-500 text-white text-sm sm:text-base font-bold min-h-[44px] px-4 sm:px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 transition-colors">
              <KeyRound size={16} className="mr-1.5" /> 단장/감독관 입장
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <div className={`px-2.5 sm:px-3 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-1.5 border min-w-0 max-w-[50vw] sm:max-w-[40vw] lg:max-w-none ${auth.role === 'supervisor' ? 'bg-amber-950/40 border-amber-700/50 text-amber-200' : 'bg-blue-950/40 border-blue-700/50 text-blue-200'}`}>
                {auth.role === 'supervisor' ? <ShieldCheck size={14} className="shrink-0" /> : <Crown size={14} className="shrink-0" />}
                <span className="truncate min-w-0">{auth.label}</span>
                {myTeam && <span className="opacity-70 truncate hidden sm:inline">· {myTeam.name}</span>}
              </div>
              <button onClick={logout} className="p-2 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-md text-gray-300 hover:text-white hover:bg-gray-800 cursor-pointer transition-colors duration-200 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950" title="인증 해제" aria-label="인증 해제">
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
                helper = '아래 액션 카드에서 선수를 선택하고 픽 확정을 누르세요.'
              } else if (currentTeam) {
                title = `${draft.current_round}라운드 ${pickNo}픽 — ${currentTeam.name} 차례`
                helper = '내 차례가 되면 화면 상단·소리·바탕색으로 알려드립니다.'
              } else {
                title = `${draft.current_round}라운드 ${pickNo}픽 진행 중`
                helper = ''
              }
              tint = isMyTurn ? 'border-emerald-500 bg-emerald-950/40' : 'border-amber-700/40 bg-amber-950/20'
            } else if (status === 'completed') {
              title = '드래프트 완료'
              helper = '멤버십이 자동 반영되었습니다.'
              tint = 'border-emerald-700/50 bg-emerald-950/30'
            }
            return (
              <div className={`mb-3 sm:mb-4 rounded-2xl border-2 px-4 py-3 sm:px-5 sm:py-4 ${tint}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-300 mb-1">현재 단계</p>
                    <h2 className="text-xl sm:text-3xl font-black text-white leading-tight break-keep text-balance">{title}</h2>
                    {helper && <p className="text-sm sm:text-base text-gray-200 mt-2 leading-relaxed break-keep">{helper}</p>}
                  </div>
                  {/* 타이머 — in_progress 단계에서만 같은 hero 안에 표시 (스크롤 없이 항상 보임) */}
                  {status === 'in_progress' && remainingSeconds != null && (
                    <BigTimer
                      seconds={remainingSeconds}
                      extensionsUsed={(auth?.role === 'manager' && auth.teamId) ? (draft.extensions_used?.[auth.teamId] ?? 0) : 0}
                      canExtend={!!isMyTurn && !graceInfo.inGrace}
                      onExtend={extendPick}
                      extending={extending}
                      gracePhase={graceInfo.inGrace}
                      graceSeconds={graceInfo.remaining}
                    />
                  )}
                </div>
              </div>
            )
          })()}

          <div className="mb-3 sm:mb-4 flex flex-wrap items-center gap-2">
            <StatusBadge status={draft.status} />
            {draft.method === 'snake' && <Tag color="purple">스네이크</Tag>}
            {draft.method === 'linear' && <Tag color="blue">리니어</Tag>}
            {draft.status === 'in_progress' && currentTeam && (
              <Tag color="amber">
                <Crown size={13} className="inline mr-1" />
                현재: <span className="font-bold ml-1">{currentTeam.name}</span>
              </Tag>
            )}
          </div>

          {/* 드래프트 설정 정보 (시작 전 — 모두에게 보임) */}
          {(draft.status === 'setup' || draft.status === 'ready_check') && (
            <div className="mb-4 rounded-2xl border border-blue-800/40 bg-gradient-to-br from-blue-950/30 to-indigo-950/20 p-4 sm:p-5">
              <div className="flex items-center gap-2 mb-3">
                <Info size={16} className="text-blue-300" />
                <h3 className="text-base font-bold text-blue-100 uppercase tracking-widest">드래프트 설정</h3>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <SettingPill label="픽 시간" value={`${draft.pick_seconds ?? 80}초`} />
                <SettingPill label="추첨 방식" value="완전 무작위" />
                <SettingPill label="진행 방식" value={draft.method === 'snake' ? '스네이크' : '리니어'} />
                <SettingPill label="연장 찬스" value={`+${EXTENSION_SECONDS}초 × ${MAX_EXTENSIONS}`} />
              </div>
              {/* 픽 순서 — 추첨 후에만 표시 */}
              {draft.lottery_done && draft.draft_order.length > 0 && (
                <div className="mt-3 pt-3 border-t border-blue-800/30">
                  <p className="text-[11px] uppercase tracking-widest text-blue-300 font-bold mb-2">픽 순서 (추첨 완료)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {draft.draft_order.map((tid, idx) => {
                      const t = teamsById[tid]
                      return (
                        <div key={`${tid}-${idx}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-gray-900/60 border border-gray-700 break-keep">
                          <span className="text-xs font-black text-gray-300 tabular-nums shrink-0">{idx + 1}.</span>
                          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t?.color }} />
                          <span className="text-sm sm:text-base font-bold text-white">{t?.name ?? '?'}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

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
            />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-3 sm:gap-4 lg:gap-5">
            {/* 픽 보드 (상세 — 라운드별 카드) */}
            <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-3 sm:p-4 lg:p-5 space-y-4">
              <h2 className="text-base font-bold text-gray-200 uppercase tracking-widest">픽 보드 (상세)</h2>
              {draft.status === 'setup' || draft.status === 'ready_check' ? (
                <div className="text-center py-12 text-gray-200 text-base sm:text-lg leading-relaxed">감독관이 시작을 누르면<br className="sm:hidden"/> 픽이 진행됩니다</div>
              ) : (
                <div className="space-y-4">
                  {Array.from({ length: Math.max(totalRounds, 1) }).map((_, idx) => {
                    const round = idx + 1
                    const order = draft.draft_order
                    const orderForRound = draft.method === 'snake' && round % 2 === 0 ? [...order].reverse() : order
                    return (
                      <div key={round}>
                        <p className="text-[11px] font-bold text-gray-300 uppercase tracking-widest mb-2">Round {round}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-2 sm:gap-2.5">
                          {orderForRound.map((teamId, i) => {
                            const pickNumber = (round - 1) * order.length + i + 1
                            const team = teamsById[teamId]
                            const pick = (picksByRound[round] ?? []).find(p => p.pick_number === pickNumber)
                            const isCurrent = pickNumber === draft.current_pick_index + 1 && draft.status === 'in_progress'
                            return (
                              <div key={pickNumber}
                                className={`rounded-lg p-2.5 sm:p-3 border min-w-0 transition-colors duration-200 ${
                                  pick ? 'bg-gray-800/60 border-gray-700' :
                                  isCurrent ? 'bg-amber-950/60 border-amber-500 ring-2 ring-amber-500/40 animate-pulse' :
                                  'bg-gray-900/40 border-gray-800 opacity-60'
                                }`}
                                style={team ? { borderLeftColor: team.color, borderLeftWidth: 3 } : undefined}
                              >
                                <p className="text-[11px] sm:text-xs text-gray-300 font-bold truncate min-w-0">
                                  <span className="tabular-nums">#{pickNumber}</span> · <span className="break-keep">{team?.name ?? '?'}</span>
                                </p>
                                {pick ? (
                                  <p className="text-sm sm:text-base font-bold text-white mt-1 truncate leading-tight min-w-0">
                                    {pick.player_number != null && <span className="text-amber-300 mr-1 tabular-nums">#{pick.player_number}</span>}
                                    <span className="break-keep">{pick.player_name}</span>
                                  </p>
                                ) : isCurrent ? (
                                  <p className="text-sm text-amber-300 mt-1 font-bold">선택 중...</p>
                                ) : (
                                  <p className="text-sm text-gray-600 mt-1">—</p>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* 액션 패널 */}
            <aside className="space-y-4">
              {draft.status === 'in_progress' && auth?.role === 'manager' && (
                isMyTurn ? (
                  <div
                    className="bg-amber-950/40 border-2 rounded-2xl p-4 space-y-3 transition-[box-shadow,border-color] duration-300"
                    style={myTeam?.color ? {
                      borderColor: myTeam.color,
                      boxShadow: `0 0 0 1px ${myTeam.color}66, 0 0 32px ${myTeam.color}55`,
                      animation: 'myTurnPulse 2s ease-in-out infinite',
                    } : { borderColor: '#b45309' }}
                  >
                    <p className="text-amber-300 text-base font-bold flex items-center gap-2">
                      <CheckCircle2 size={18} /> 픽 액션
                    </p>
                    <p className="text-base text-gray-200 leading-relaxed">아래에서 선수를 선택하고 픽 확정을 누르세요.</p>
                    <PlayerPicker
                      players={state?.available_players ?? []}
                      selectedId={selectedPlayerId}
                      onSelect={setSelectedPlayerId}
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={makePick}
                        disabled={!selectedPlayerId || picking}
                        className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold disabled:opacity-40 min-h-[56px] text-base sm:text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 transition-colors"
                      >
                        {picking
                          ? '픽 등록 중...'
                          : selectedPlayerId
                            ? `✓ ${state?.available_players.find(p => p.id === selectedPlayerId)?.name ?? '선수'} 픽 확정`
                            : '선수를 선택하세요'}
                      </Button>
                      {(() => {
                        const used = auth?.teamId ? (draft.extensions_used?.[auth.teamId] ?? 0) : 0
                        const left = Math.max(0, MAX_EXTENSIONS - used)
                        return (
                          <Button
                            onClick={extendPick}
                            disabled={left === 0 || extending}
                            variant="outline"
                            className="bg-gray-800 border-gray-700 text-gray-100 hover:bg-gray-700 disabled:opacity-40 text-sm min-h-[56px] px-3 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                            title={`연장 ${left}회 남음`}
                          >
                            ⏱ +{EXTENSION_SECONDS}s ({left}/{MAX_EXTENSIONS})
                          </Button>
                        )
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 text-center">
                    <Lock className="w-7 h-7 text-gray-400 mx-auto mb-2" />
                    <p className="text-base text-gray-200 font-bold">본인 차례가 아닙니다</p>
                    {currentTeam && <p className="text-sm text-gray-300 mt-1.5"><span className="font-bold text-white">{currentTeam.name}</span> 단장 차례</p>}
                    <p className="text-xs text-gray-400 mt-2 leading-relaxed">내 차례가 되면 화면 상단에 안내됩니다.</p>
                  </div>
                )
              )}

              {draft.status === 'completed' && (
                <div className="bg-emerald-950/40 border border-emerald-700/50 rounded-2xl p-4 text-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                  <p className="text-base sm:text-lg text-emerald-300 font-bold">드래프트 완료</p>
                  <p className="text-sm text-gray-300 mt-1.5 leading-relaxed">멤버십이 즉시 반영되었습니다</p>
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
                    <button
                      onClick={() => setShowFinal(true)}
                      className="text-sm px-4 py-2 rounded-md bg-amber-700/60 hover:bg-amber-600/80 text-amber-50 font-bold cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
                    >
                      결과 화면 다시 보기
                    </button>
                    {orgSlug && (
                      <Link href={`/league/${orgSlug}/${leagueId}/teams`} className="text-sm px-4 py-2 rounded-md bg-blue-900/40 hover:bg-blue-800 text-blue-200 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950">
                        팀 구성 보기 →
                      </Link>
                    )}
                  </div>
                </div>
              )}

              {!auth && (draft.status === 'setup' || draft.status === 'in_progress') && (
                <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 text-center text-base text-gray-200 leading-relaxed">
                  단장/감독관이라면<br className="sm:hidden"/> 우측 상단에서 코드를 입력하세요.
                </div>
              )}

              {auth?.role === 'supervisor' && draft.status !== 'completed' && (
                <PickSecondsCard
                  currentSeconds={draft.pick_seconds ?? 80}
                  onChange={changePickSeconds}
                />
              )}

              {auth?.role === 'supervisor' && (
                <div className="bg-amber-950/30 border border-amber-700/40 rounded-2xl p-4 space-y-1.5">
                  <p className="text-amber-300 text-base font-bold flex items-center gap-2">
                    <ShieldCheck size={16} /> 감독관 모드
                  </p>
                  <p className="text-sm text-gray-200 leading-relaxed">아래 세션 관리 패널에서 풀·팀장·추첨·시작/완료 등 모든 진행을 제어할 수 있습니다.</p>
                </div>
              )}
            </aside>
          </div>

          {/* 팀별 누적 픽 — 포지션 밸런스 확인용 (in_progress / completed) */}
          {(draft.status === 'in_progress' || draft.status === 'completed') && (
            <TeamPickRoster
              teams={state?.teams ?? []}
              picks={state?.picks ?? []}
              draftOrder={draft.draft_order}
            />
          )}

          {/* 감독관 전용 — 세션 관리 패널 (방 안에서 모든 진행 제어) */}
          {auth?.role === 'supervisor' && (
            <div className="mt-4 sm:mt-6 space-y-3">
              <h2 className="text-base font-bold text-gray-200 uppercase tracking-widest flex items-center gap-2">
                <ShieldCheck size={16} className="text-amber-400" /> 세션 관리
              </h2>
              <DraftSessionControl
                leagueId={leagueId}
                quarterId={quarterId}
                teams={state?.teams ?? []}
                authHeaders={{ 'X-Draft-Code': auth.plain }}
                onChanged={fetchState}
              />
            </div>
          )}
        </>
      )}

      {/* 채팅 — 인증된 사용자에게만 floating.
          open/setOpen 을 부모에서 보유 → 열림 시 본문 컨테이너에 lg:pr-[360px] 가 붙어
          데스크탑(≥lg)에서 채팅 패널이 본문을 덮지 않고 오른쪽 공간으로 자리잡는다.
          모바일(<lg)은 기존처럼 오버레이로 슬라이드인 — 사용자가 직접 열고 닫는 UX. */}
      {auth && state?.draft && (
        <DraftChat
          leagueId={leagueId}
          draftId={state.draft.id}
          authedCode={auth.plain}
          teams={state.teams ?? []}
          authedRole={auth.role}
          authedTeamId={auth.teamId}
          authedLabel={auth.label}
          open={chatOpen}
          onOpenChange={setChatOpen}
        />
      )}

      {/* 픽 이팩트 — 새 픽 들어올 때 3초간 전체화면 */}
      <DraftPickReveal data={pickReveal} onClose={() => setPickReveal(null)} />

      {/* 미라클 총무 — 픽셀 캐릭터가 말풍선으로 중계 (setup/ready_check 단계에서는 숨김) */}
      {state?.draft && state.draft.status !== 'setup' && state.draft.status !== 'ready_check' && (
        <DraftCommissioner event={commEvent} />
      )}

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
              try { sessionStorage.setItem(`draft_final_seen_${draftId}`, '1') } catch { /* ignore */ }
            }}
            title={`${leagueName.toUpperCase()} DRAFT ${year ?? new Date().getFullYear()}.${quarter ?? Math.floor(new Date().getMonth() / 3) + 1}Q 완료!`}
            teams={state.teams ?? []}
            picks={state.picks ?? []}
            draftOrder={state.draft.draft_order ?? []}
            startedAt={state.draft.started_at}
            completedAt={state.draft.completed_at}
            leaders={state.leaders ?? []}
            playerNames={playerNames}
          />
        )
      })()}

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

function BigTimer({ seconds, extensionsUsed, canExtend, onExtend, extending, gracePhase, graceSeconds }: {
  seconds: number
  extensionsUsed: number
  canExtend: boolean
  onExtend: () => Promise<void>
  extending?: boolean
  gracePhase?: boolean
  graceSeconds?: number
}) {
  const urgent = seconds <= 10
  const warn = seconds <= 30
  const leftExt = Math.max(0, MAX_EXTENSIONS - extensionsUsed)

  // 유예(grace) 단계: 빨간 펄스 배지로 별도 표시
  if (gracePhase) {
    const g = Math.max(0, graceSeconds ?? 0)
    return (
      <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-red-500 bg-red-950/80 text-red-200 font-mono animate-pulse shadow-[0_0_18px_rgba(239,68,68,0.6)]">
        <AlertTriangle size={16} className="text-red-300" />
        <span className="text-xs font-black uppercase tracking-widest text-red-300">추가 시간</span>
        <span className="font-black text-2xl leading-none tabular-nums text-white">{g}s</span>
        <span className="text-xs text-red-300/90">(이후 무작위 자동픽)</span>
      </div>
    )
  }

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border font-mono ${
      urgent ? 'bg-red-950/70 border-red-500/60 text-red-300 animate-pulse' :
      warn ? 'bg-amber-950/60 border-amber-600/50 text-amber-300' :
      'bg-gray-900 border-gray-700 text-gray-100'
    }`}>
      <Timer size={16} className={urgent ? 'text-red-400' : warn ? 'text-amber-400' : 'text-gray-300'} />
      <span className="font-black text-2xl leading-none tabular-nums">{seconds}s</span>
      {canExtend && leftExt > 0 && (
        <button
          onClick={onExtend}
          disabled={extending}
          className="ml-1 px-3 py-1.5 rounded text-sm font-bold bg-emerald-700/40 hover:bg-emerald-600/60 text-emerald-100 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed min-h-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 transition-colors"
          title={`연장 ${leftExt}회 남음`}
          aria-label={`픽 시간 ${EXTENSION_SECONDS}초 연장 (${leftExt}회 남음)`}
        >
          +{EXTENSION_SECONDS}s
        </button>
      )}
    </div>
  )
}

function SettingPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-gray-900/60 border border-gray-700 px-3 py-2">
      <p className="text-[11px] uppercase tracking-widest text-gray-300 font-bold">{label}</p>
      <p className="text-base sm:text-lg font-bold text-white mt-1 tabular-nums">{value}</p>
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
          <Users size={18} className={allReady ? 'text-emerald-300' : 'text-blue-300'} />
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
            {iAmReady ? '준비 해제' : '✋ 준비 완료'}
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
              {ready ? <CheckCircle2 size={13} className="shrink-0" /> : <Circle size={13} className="shrink-0" />}
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
              <span>{t.name} 단장</span>
            </span>
          )
        })}
        {supervisorExists && (
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm ${
            readyState['supervisor'] ? 'bg-emerald-900/40 border-emerald-700/60 text-emerald-300' : 'bg-gray-800 border-gray-700 text-gray-200'
          }`}>
            {readyState['supervisor'] ? <CheckCircle2 size={13} /> : <Circle size={13} />}
            <ShieldCheck size={13} className="text-amber-400" />
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
            🎬 추첨 대기 화면 열기
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
            {acting ? '추첨 중...' : '🎲 추첨 시작'}
          </Button>
        )}
        {!isSupervisor && (
          <p className="text-base text-gray-200 mt-3 leading-relaxed">감독관이 추첨을 시작할 때까지 기다려주세요</p>
        )}
      </div>
    </div>
  )
}

function LotteryDoneScreen({ teams, draftOrder, odds, isSupervisor, onStartDraft, acting }: {
  teams: Team[]
  draftOrder: string[]
  odds: Record<string, number> | null
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
            const odd = odds?.[tid]
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
                  {odd != null && <p className="text-[11px] sm:text-xs text-gray-200 tabular-nums">{(odd * 100).toFixed(0)}% 확률</p>}
                </div>
              </div>
            )
          })}
        </div>

        <div className="text-center">
          {isSupervisor ? (
            <Button
              onClick={onStartDraft}
              disabled={acting}
              className="bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-400 hover:to-red-500 text-white font-black text-lg sm:text-xl px-10 h-14 sm:h-16 shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
            >
              {acting ? '시작 중...' : '🏀 드래프트 시작'}
            </Button>
          ) : (
            <p className="text-base text-gray-200 leading-relaxed">감독관이 드래프트를 시작할 때까지 기다려주세요</p>
          )}
        </div>
      </div>
    </div>
  )
}

function TeamPickRoster({ teams, picks, draftOrder }: {
  teams: Team[]
  picks: Pick[]
  draftOrder: string[]
}) {
  // draftOrder 순서대로 정렬 + draftOrder 에 없는 팀도 뒤에 표시
  const orderedTeams = [
    ...draftOrder.map(id => teams.find(t => t.id === id)).filter(Boolean) as Team[],
    ...teams.filter(t => !draftOrder.includes(t.id)),
  ]
  const picksByTeam: Record<string, Pick[]> = {}
  for (const p of picks) (picksByTeam[p.team_id] ||= []).push(p)
  for (const tid of Object.keys(picksByTeam)) picksByTeam[tid].sort((a, b) => a.pick_number - b.pick_number)

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
              {list.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-3">아직 픽 없음</p>
              ) : (
                <div className="space-y-1">
                  {list.map(p => (
                    <div key={p.pick_number} className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs text-gray-300 font-mono w-8 shrink-0 tabular-nums">#{p.pick_number}</span>
                      {p.player_number != null && (
                        <span className="text-amber-300 font-mono font-bold w-8 shrink-0 text-sm tabular-nums">#{p.player_number}</span>
                      )}
                      <span className="text-white font-bold flex-1 truncate text-sm sm:text-base min-w-0 break-keep">{p.player_name}</span>
                      {p.player_position && (
                        <span className="text-[11px] text-gray-300 font-mono shrink-0">{p.player_position.split(',').map(s => s.trim()).join('·')}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
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

function StatusBadge({ status }: { status: 'setup' | 'ready_check' | 'lottery_waiting' | 'lottery_done' | 'in_progress' | 'completed' }) {
  const map = {
    setup: { label: '준비', color: 'bg-gray-800 text-gray-400 border-gray-700' },
    ready_check: { label: '레디 체크', color: 'bg-blue-950/60 text-blue-300 border-blue-700/50' },
    lottery_waiting: { label: '추첨 대기', color: 'bg-purple-950/60 text-purple-300 border-purple-700/50' },
    lottery_done: { label: '추첨 완료', color: 'bg-amber-950/60 text-amber-300 border-amber-700/50' },
    in_progress: { label: '진행 중', color: 'bg-amber-950/60 text-amber-300 border-amber-700/50' },
    completed: { label: '완료', color: 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50' },
  } as const
  const v = map[status]
  return <span className={`px-3 py-1.5 rounded-md border text-xs font-bold uppercase tracking-wider ${v.color}`}>{v.label}</span>
}

function Tag({ color, children }: { color: 'amber' | 'purple' | 'blue' | 'gray'; children: React.ReactNode }) {
  const colors = {
    amber: 'bg-amber-950/40 text-amber-200 border-amber-700/40',
    purple: 'bg-purple-950/40 text-purple-200 border-purple-700/40',
    blue: 'bg-blue-950/40 text-blue-200 border-blue-700/40',
    gray: 'bg-gray-800 text-gray-300 border-gray-700',
  }
  return <span className={`px-3 py-1.5 rounded-md border text-sm font-bold ${colors[color]}`}>{children}</span>
}

function PlayerPicker({ players, selectedId, onSelect }: { players: Player[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const filtered = players.filter(p => !query.trim() || p.name.includes(query) || (p.number != null && String(p.number).includes(query)))
  return (
    <div className="space-y-2">
      <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="이름·번호 검색" className="bg-gray-900 border-gray-700 text-white h-12 text-base" />
      <div className="max-h-72 overflow-y-auto space-y-1 -mr-2 pr-2">
        {filtered.length === 0 && <p className="text-center text-sm text-gray-300 py-6">선수가 없습니다</p>}
        {filtered.map(p => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`w-full text-left px-3 py-3 min-h-[48px] rounded-md border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 ${
              selectedId === p.id
                ? 'bg-amber-950/60 border-amber-500 text-white'
                : 'bg-gray-900/40 border-gray-800 text-gray-100 hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="font-bold text-base sm:text-lg truncate">
                {p.number != null && <span className="text-amber-300 mr-1.5 tabular-nums">#{p.number}</span>}
                {p.name}
              </span>
              {p.position && <span className="text-sm text-gray-300 font-mono shrink-0">{p.position}</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
