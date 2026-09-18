'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KeyRound, Trophy, ChevronRight, Lock, Sparkles, CheckCircle2, Circle, Crown, ShieldCheck, Settings2, Minimize2, Maximize2, Shuffle, Check, ChevronDown, Volume2, VolumeX, Hand, Clock, FlaskConical } from 'lucide-react'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import DraftSetupStepper from '@/components/league/DraftSetupStepper'
import DraftPlayerStatsModal, { type DraftStatRow } from '@/components/league/DraftPlayerStatsModal'
import DraftLotteryReveal from '@/components/league/DraftLotteryReveal'
import DraftTeamStats from '@/components/league/DraftTeamStats'
import DraftStatTable from '@/components/league/DraftStatTable'
import DraftSummaryCard from '@/components/league/DraftSummaryCard'
import { PickPhotoFlip } from '@/components/league/DraftPickReveal'
import Confetti from '@/components/league/Confetti'
import { MAX_EXTENSIONS, EXTENSION_SECONDS, AUTOPICK_GRACE_SECONDS, PICK_SECONDS } from '@/lib/draftTimer'
import { playBeep, playBuzzer, primeAudio, setMuted as setSoundMuted } from '@/lib/draftSounds'
import { overallScorePerGame } from '@/lib/leagueStats'
import { teamInk, teamAccentOnDark } from '@/lib/util/contrastColor'
import type { Quarter } from '@/types/league'

interface Team { id: string; name: string; color: string }
interface Player {
  id: string
  name: string
  number: number | null
  position: string | null
  plus_one: boolean
}
interface Pick {
  pick_number: number
  round_number: number
  team_id: string
  player_id: string
  player_name: string
  player_number: number | null
  player_photo_url?: string | null
  picked_at: string
}
interface Leader { team_id: string; leader_player_id: string | null }
interface DraftState {
  draft: {
    id: string
    status: 'setup' | 'ready_check' | 'lottery_waiting' | 'lottery_done' | 'in_progress' | 'completed'
    draft_order: string[]
    current_pick_index: number
    current_round: number
    total_picks: number
    method: 'snake' | 'linear'
    ready_state: Record<string, boolean>
    lottery_odds: Record<string, number> | null
    lottery_done: boolean
    /** 추첨 레이스 출발 시각 — null 이면 팁오프 대기 (migration 118) */
    race_started_at?: string | null
    pick_deadline: string | null
    pick_seconds: number
    extensions_used: Record<string, number>
    started_at: string | null
    completed_at: string | null
    /** 리허설 세션 — 픽·팀장이 리그(분기 소속)에 반영되지 않는다 (migration 115) */
    is_test?: boolean
  } | null
  current_team_id: string | null
  picks: Pick[]
  available_players: Player[]
  pool_size?: number
  pool_player_ids?: string[]
  teams: Team[]
  leaders: Leader[]
  supervisor_exists: boolean
}

const POLL_INTERVAL_MS = 1500

export default function LeagueDraftPage() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params
  const { isEditMode, leagueHeaders } = useLeagueEditMode()
  const [showManage, setShowManage] = useState(true)

  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [selectedQid, setSelectedQid] = useState<string | null>(null)
  const [state, setState] = useState<DraftState | null>(null)
  const [loading, setLoading] = useState(true)

  // 인증 (단장 또는 감독관)
  const [authedTeamId, setAuthedTeamId] = useState<string | null>(null)
  const [authedRole, setAuthedRole] = useState<'manager' | 'supervisor' | null>(null)
  const [authedLabel, setAuthedLabel] = useState<string | null>(null)
  const [authedCode, setAuthedCode] = useState<string | null>(null)
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authing, setAuthing] = useState(false)

  const [picking, setPicking] = useState<string | null>(null)
  const [acting, setActing] = useState(false)

  // 픽 공개 히어로
  const [reveal, setReveal] = useState<Pick | null>(null)
  const lastPickRef = useRef<number>(0)
  const revealInitRef = useRef(false)
  const revealTimer = useRef<number | null>(null)
  // 추첨 공개 (한 번만) — 로또 머신 애니메이션
  const [showLottery, setShowLottery] = useState(false)
  const lotteryShownRef = useRef(false)
  // 집중(포커스) 모드 — 진행 중일 때 다른 UI 숨김
  const [focusMode, setFocusMode] = useState(true)
  // 픽 타이머 — 1초마다 갱신되는 현재 시각
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [extending, setExtending] = useState(false)
  // 지난 분기 스탯 (드래프트 풀 랭킹·자동픽용)
  const [prevStats, setPrevStats] = useState<Record<string, DraftStatRow>>({})
  const [statsPlayer, setStatsPlayer] = useState<{ id: string; name: string; number: number | null } | null>(null)
  const [selectedPickId, setSelectedPickId] = useState<string | null>(null)  // 성적표에서 선택한 픽 후보
  const [muted, setMuted] = useState(false)
  const [statsGated, setStatsGated] = useState(false) // 비로그인/미승인 — 지난 분기 성적 잠김
  const autoPickRef = useRef<string | null>(null) // 자동픽 중복 방지 (deadline 키)
  const startClockRef = useRef<string | null>(null) // 첫 픽 타이머 시작 중복 방지
  const beepSecRef = useRef<number>(-1) // 카운트다운 비프 중복 방지

  // ── 서버 시간 캘리브레이션 (포털 DraftPortalClient 와 동일 방식) ──
  // 관전 PC 시계가 1분 빠르면 1분 일찍 자동픽을 쏘고 서버가 거절한다. /current 응답의
  // server_time_ms 로 오프셋을 잡아 타이머·자동픽·비프·링 전부 서버 시각 기준으로 돌린다.
  const serverOffsetMsRef = useRef<number>(0)
  const getNow = useCallback(() => Date.now() + serverOffsetMsRef.current, [])

  const sessionKey = selectedQid ? `draft_code_${leagueId}_${selectedQid}` : null

  // 분기 목록 재조회 — 「다음 분기 추가」 후에도 같은 경로를 쓴다.
  // selectQid 를 주면 그 분기를 선택하고, 없으면 현재 분기(없으면 마지막)를 고른다.
  const loadQuarters = useCallback(async (selectQid?: string) => {
    const qs: Quarter[] = await fetch(`/api/leagues/${leagueId}/quarters`).then(r => r.json()).catch(() => [])
    setQuarters(qs ?? [])
    if (selectQid) { setSelectedQid(selectQid); return }
    const current = (qs ?? []).find(q => q.is_current) ?? (qs ?? [])[(qs ?? []).length - 1] ?? (qs ?? [])[0]
    if (current) setSelectedQid(current.id)
  }, [leagueId])

  useEffect(() => { void loadQuarters() }, [loadQuarters])

  // 분기 변경 시 인증 복구
  useEffect(() => {
    if (!sessionKey) { setAuthedTeamId(null); setAuthedRole(null); setAuthedLabel(null); setAuthedCode(null); return }
    const raw = sessionStorage.getItem(sessionKey)
    if (raw) {
      try {
        const { teamId, role, label, code } = JSON.parse(raw)
        setAuthedTeamId(teamId ?? null); setAuthedRole(role ?? 'manager'); setAuthedLabel(label); setAuthedCode(code)
      } catch {}
    } else {
      setAuthedTeamId(null); setAuthedRole(null); setAuthedLabel(null); setAuthedCode(null)
    }
    lastPickRef.current = 0
    revealInitRef.current = false
    lotteryShownRef.current = false
  }, [sessionKey])

  const fetchState = useCallback(async () => {
    if (!selectedQid) return
    try {
      const r = await fetch(`/api/leagues/${leagueId}/drafts/current?quarterId=${selectedQid}`)
      if (r.ok) {
        const d = await r.json() as DraftState & { server_time_ms?: number }
        // 폴링마다 갱신 — RTT 노이즈(수십 ms)는 ±수십초 시계 오차에 비해 무시할 수 있다
        if (typeof d.server_time_ms === 'number') serverOffsetMsRef.current = d.server_time_ms - Date.now()
        setState(d)
      }
    } finally {
      setLoading(false)
    }
  }, [leagueId, selectedQid])

  useEffect(() => { fetchState() }, [fetchState])

  // 폴링 — 무음 갱신. 활성(진행/준비체크) 1.5초, 그 외(설정/완료) 5초로
  // 리셋·새 세션·완료 전환도 모든 화면에 반영되게 한다.
  const pollRef = useRef<number | null>(null)
  useEffect(() => {
    const st = state?.draft?.status
    const interval = st === 'in_progress' || st === 'ready_check' ? POLL_INTERVAL_MS : 5000
    pollRef.current = window.setInterval(fetchState, interval)
    return () => { if (pollRef.current) window.clearInterval(pollRef.current) }
  }, [state?.draft?.status, fetchState])

  // 픽 타이머 — 1초마다 현재 시각 갱신 (진행 중일 때만)
  useEffect(() => {
    if (state?.draft?.status !== 'in_progress') return
    setNowMs(getNow())  // 진행 전환 즉시 보정된 시각으로 맞춘다 (1초 대기 없이)
    const id = window.setInterval(() => setNowMs(getNow()), 1000)
    return () => window.clearInterval(id)
  }, [state?.draft?.status, getNow])

  // 지난 분기 스탯 로드 (드래프트 풀 랭킹·자동픽 추천용)
  const prevQuarter = (() => {
    if (!selectedQid || quarters.length === 0) return null
    const idx = quarters.findIndex(q => q.id === selectedQid)
    return idx > 0 ? quarters[idx - 1] : null
  })()
  const prevQuarterLabel = prevQuarter ? `${String(prevQuarter.year).slice(2)}.${prevQuarter.quarter}Q` : null
  useEffect(() => {
    if (!prevQuarter || !state?.draft) return
    fetch(`/api/leagues/${leagueId}/stats?quarterId=${prevQuarter.id}&unit=round`)
      .then(async r => {
        // 회원 전용 스탯 잠금(2026-07-28) — 비로그인은 401 login_required.
        // 빈칸(—)으로 두면 "데이터가 없다"로 오해하고 랜덤픽 추천이 진짜 무작위가 된다.
        if (r.status === 401) { setStatsGated(true); setPrevStats({}); return }
        setStatsGated(false)
        const d = await r.json() as { players?: DraftStatRow[] }
        const map: Record<string, DraftStatRow> = {}
        for (const p of d.players ?? []) map[p.player_id] = p
        setPrevStats(map)
      })
      .catch(() => null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, prevQuarter?.id, state?.draft?.id])

  // 자동픽 — 타이머 만료 시. 테스트(혼자 진행) 편의를 위해 인증된 누구나(단장/감독관)
  // 또는 편집(PIN) 모드면 트리거 가능. 서버가 만료·현재팀을 검증하므로 안전.
  useEffect(() => {
    const d = state?.draft
    if (!d || d.status !== 'in_progress' || !d.pick_deadline) return
    const headers: Record<string, string> | null = authedCode
      ? { 'X-Draft-Code': authedCode }
      : (isEditMode ? leagueHeaders : null)
    if (!headers) return
    const deadlineMs = new Date(d.pick_deadline).getTime()
    if (nowMs <= deadlineMs + AUTOPICK_GRACE_SECONDS * 1000) return  // 만료 후 10초 유예 뒤 자동 선택
    if (autoPickRef.current === d.pick_deadline) return // 이 마감건 이미 시도
    const deadlineKey = d.pick_deadline
    autoPickRef.current = deadlineKey
    // 포털(DraftPortalClient)과 같은 요청이어야 한다 — 어느 화면이 먼저 닿든 결과가 같게.
    // mode:'random' + CAS(expected_*) 로 stale 슬롯에 쓰는 것을 서버가 막는다.
    fetch(`/api/leagues/${leagueId}/drafts/${d.id}/auto-pick`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'random',
        expected_pick_number: (d.total_picks ?? 0) + 1,
        expected_deadline: deadlineKey,
      }),
    }).then(async r => {
      if (r.ok) {
        const data = await r.json().catch(() => ({}))
        if (data.auto) toast.message('시간 초과 — 자동 픽 되었습니다', { position: 'bottom-center' })
        fetchState()
        return
      }
      // 4xx(409 stale·이미 처리·권한)는 재시도해도 같은 답이다 — ref 를 유지해 폭주를 막는다.
      // 5xx·네트워크 오류만 ref 를 풀어 다음 틱에 다시 시도한다.
      if (r.status >= 500 && autoPickRef.current === deadlineKey) autoPickRef.current = null
    }).catch(() => {
      if (autoPickRef.current === deadlineKey) autoPickRef.current = null
    })
  }, [nowMs, state?.draft, authedCode, isEditMode, leagueHeaders, leagueId, fetchState])

  // 픽 시계 시작 — 공개 연출(추첨 showLottery · 픽 공개 reveal)이 닫힌 뒤 시작한다.
  // 서버는 추첨 직후뿐 아니라 매 픽 직후에도 pick_deadline 을 비워 두므로(연출이 도는 동안
  // 다음 단장의 시간이 흐르지 않게), 연출을 닫은 화면이 눌러 줘야 시계가 돈다.
  // latch 는 (세션, 픽 수) 단위 — 예전엔 total_picks === 0 조건이라 2픽부터는 아예 안 돌았다.
  const startClock = useCallback((key: string, dId: string) => {
    const headers: Record<string, string> | null = authedCode ? { 'X-Draft-Code': authedCode } : (isEditMode ? leagueHeaders : null)
    if (!headers) return
    if (startClockRef.current === key) return
    startClockRef.current = key
    fetch(`/api/leagues/${leagueId}/drafts/${dId}/start-clock`, { method: 'POST', headers })
      .then(() => fetchState())
      .catch(() => { if (startClockRef.current === key) startClockRef.current = null })
  }, [authedCode, isEditMode, leagueHeaders, leagueId, fetchState])

  useEffect(() => {
    const d = state?.draft
    if (!d || d.status !== 'in_progress' || d.pick_deadline) return
    if (showLottery || reveal) return
    startClock(`${d.id}:${d.total_picks}`, d.id)
  }, [state?.draft, showLottery, reveal, startClock])

  // 마감이 생기면 latch 해제 — 다음 픽에서 다시 발화할 수 있게
  useEffect(() => {
    if (state?.draft?.pick_deadline) startClockRef.current = null
  }, [state?.draft?.pick_deadline])

  // 폴백 — 마감이 빈 채로 25초가 지나면 연출이 떠 있어도 시계를 건다(아무도 안 닫는 경우).
  const pendingClock = state?.draft && state.draft.status === 'in_progress' && !state.draft.pick_deadline
    ? { key: `${state.draft.id}:${state.draft.total_picks}`, id: state.draft.id }
    : null
  const pendingClockKey = pendingClock?.key ?? null
  const pendingClockId = pendingClock?.id ?? null
  useEffect(() => {
    if (!pendingClockKey || !pendingClockId) return
    const t = window.setTimeout(() => startClock(pendingClockKey, pendingClockId), 25_000)
    return () => window.clearTimeout(t)
  }, [pendingClockKey, pendingClockId, startClock])

  // 재추첨 대비 — lottery_done 이 false 가 되면 연출/시계 플래그 초기화
  useEffect(() => {
    if (!state?.draft?.lottery_done) { lotteryShownRef.current = false; startClockRef.current = null }
  }, [state?.draft?.lottery_done])

  // 뮤트 동기화
  useEffect(() => { setSoundMuted(muted) }, [muted])

  // 카운트다운 비프 (마지막 10초 + 만료 유예)
  useEffect(() => {
    const d = state?.draft
    if (!d || d.status !== 'in_progress' || !d.pick_deadline) { beepSecRef.current = -1; return }
    const remain = Math.ceil((new Date(d.pick_deadline).getTime() - nowMs) / 1000)
    if (remain > 0 && remain <= 10) {
      if (beepSecRef.current !== remain) { beepSecRef.current = remain; playBeep(remain <= 3) }
    } else if (remain <= 0) {
      const grace = Math.ceil((new Date(d.pick_deadline).getTime() + AUTOPICK_GRACE_SECONDS * 1000 - nowMs) / 1000)
      if (grace > 0 && beepSecRef.current !== -100 - grace) { beepSecRef.current = -100 - grace; playBeep(true) }
    }
  }, [nowMs, state?.draft])

  // 새 픽 감지 → 히어로 공개 (1픽 포함 모든 픽)
  useEffect(() => {
    if (!state) return  // 로딩 전엔 기준선 설정 금지
    const picks = state.picks
    const latestNum = picks.length ? picks[picks.length - 1].pick_number : 0
    // 첫 로드 시점의 기준선 설정 (기존 픽은 공개하지 않음)
    if (!revealInitRef.current) {
      revealInitRef.current = true
      lastPickRef.current = latestNum
      return
    }
    if (latestNum > lastPickRef.current) {
      lastPickRef.current = latestNum
      setReveal(picks[picks.length - 1])
      playBuzzer()
      if (revealTimer.current) window.clearTimeout(revealTimer.current)
      // 픽이 확정되면 서버는 이미 다음 단장의 시계를 돌리고 있다. 내 차례가 된 사람에게
      // 4.5초 전체 화면을 씌우면 그만큼 픽 시간을 뺏기므로 1.2초로 줄인다.
      const myTurnNow = authedRole === 'manager' && !!authedTeamId && state.current_team_id === authedTeamId
      revealTimer.current = window.setTimeout(() => setReveal(null), myTurnNow ? 1200 : 4500)
    }
  }, [state, authedRole, authedTeamId])

  // 추첨 완료 감지 → 로또 머신 공개 (한 번만)
  // status 가드: lottery_waiting/ready_check/setup 단계에서는 절대 노출되지 않게.
  useEffect(() => {
    const d = state?.draft
    if (!d?.lottery_done || d.draft_order.length === 0 || lotteryShownRef.current) return
    if (d.status !== 'lottery_done' && d.status !== 'in_progress') return
    lotteryShownRef.current = true
    setShowLottery(true)
  }, [state?.draft?.lottery_done, state?.draft?.draft_order.length, state?.draft?.status, state?.draft])

  async function submitCode() {
    if (!selectedQid || !codeInput.trim()) return
    setAuthing(true); setAuthError(null)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/drafts/lookup-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quarter_id: selectedQid, plain_code: codeInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.matched) { setAuthError('코드가 일치하지 않습니다'); setAuthing(false); return }
      const { team_id, label, role } = data.matched as { team_id: string | null; label: string; role: 'manager' | 'supervisor' }
      const plain = codeInput.trim()
      sessionStorage.setItem(sessionKey!, JSON.stringify({ teamId: team_id, role, label, code: plain }))
      setAuthedTeamId(team_id); setAuthedRole(role); setAuthedLabel(label); setAuthedCode(plain)
      setShowCodeModal(false); setCodeInput('')
      if (role === 'supervisor') toast.success(`총무 인증 완료 — ${label}`)
      else {
        const teamName = state?.teams.find(t => t.id === team_id)?.name
        toast.success(`${teamName ?? '팀'} 단장 인증 완료 — ${label}`)
      }
    } finally {
      setAuthing(false)
    }
  }

  function exitAuth() {
    if (sessionKey) sessionStorage.removeItem(sessionKey)
    setAuthedTeamId(null); setAuthedRole(null); setAuthedLabel(null); setAuthedCode(null)
    toast.success('인증 해제')
  }

  /** 추첨 레이스 「출발」. 진행 권한과 같은 자격 — 감독관 코드 또는 편집(PIN) 모드. */
  const canStartRace = authedRole === 'supervisor' || isEditMode
  async function startRace() {
    const d = state?.draft
    if (!d || !canStartRace) return
    const headers: Record<string, string> | null = authedCode
      ? { 'X-Draft-Code': authedCode }
      : (isEditMode ? leagueHeaders : null)
    if (!headers) return
    try { primeAudio() } catch { /* ignore */ }
    try {
      const res = await fetch(`/api/leagues/${leagueId}/drafts/${d.id}/lottery/go`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (!res.ok) toast.error(data.error ?? '출발 실패')
    } finally {
      fetchState()
    }
  }

  // 준비 토글
  async function toggleReady(ready: boolean) {
    if (!state?.draft || !authedCode) return
    setActing(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/drafts/${state.draft.id}/ready`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Draft-Code': authedCode },
        body: JSON.stringify({ ...(authedRole === 'manager' ? { team_id: authedTeamId } : {}), ready }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? '실패'); return }
      fetchState()
    } finally { setActing(false) }
  }

  // 진행(준비 체크·추첨·드래프트 시작)은 이 화면에 없다 — 포털(/draft/<token>)에서 총무가 한다.
  // 예전에는 여기에도 「준비 체크 시작」·「추첨 시작」·「강제 추첨」이 있었는데, 그 경로는
  // /lottery/open 을 건너뛰어 모두가 함께 보는 추첨 대기 화면이 통째로 사라졌다.
  // 같은 세션인데 운영자가 어느 탭에 있었느냐로 참가자 연출이 달라지는 상태였다.

  // 추가 시간 (현재 차례 단장)
  async function extendTime() {
    if (!state?.draft || !authedTeamId || !authedCode || authedRole !== 'manager') return
    if (state.current_team_id !== authedTeamId) { toast.error('본인 차례가 아닙니다', { position: 'bottom-center' }); return }
    setExtending(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/drafts/${state.draft.id}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Draft-Code': authedCode },
        body: JSON.stringify({ team_id: authedTeamId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? '추가 실패', { position: 'bottom-center' }); return }
      toast.success(`+${EXTENSION_SECONDS}초 (남은 ${data.remaining}회)`, { position: 'bottom-center' })
      fetchState()
    } finally { setExtending(false) }
  }

  // 추천(랜덤픽) — 지난 분기 종합 1위를 선택 후보로 (모바일 바·표 공용)
  function recommendBest() {
    const avail = state?.available_players ?? []
    if (avail.length === 0 || statsGated) return  // 성적이 잠기면 "추천"이 아니라 진짜 무작위가 된다
    let best = avail[0].id, score = -1
    for (const p of avail) {
      const s = prevStats[p.id]
      const sc = s && s.gp > 0 ? overallScorePerGame({ ppg: s.ppg, rpg: s.rpg, apg: s.apg, spg: s.spg, bpg: s.bpg, topg: s.topg }) : 0
      if (sc > score) { score = sc; best = p.id }
    }
    if (score <= 0) best = avail[Math.floor(Math.random() * avail.length)].id
    setSelectedPickId(best)
  }

  // 픽 실행 (성적표에서 선택한 선수)
  async function pickById(playerId: string) {
    if (!playerId || !state?.draft || !authedTeamId || !authedCode || authedRole !== 'manager') return
    if (state.current_team_id !== authedTeamId) { toast.error('본인 차례가 아닙니다', { position: 'bottom-center' }); return }
    setPicking(playerId)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/drafts/${state.draft.id}/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Draft-Code': authedCode },
        body: JSON.stringify({ team_id: authedTeamId, league_player_id: playerId }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? '픽 실패', { position: 'bottom-center' }); return }
      toast.success('픽 완료', { position: 'bottom-center' })
      setSelectedPickId(null)
      fetchState()
    } finally { setPicking(null) }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><BasketballLoader size={24} /></div>
  }

  const teamMap = Object.fromEntries((state?.teams ?? []).map(t => [t.id, t]))
  const draft = state?.draft
  const currentTeam = state?.current_team_id ? teamMap[state.current_team_id] : null
  const authedTeam = authedTeamId ? teamMap[authedTeamId] : null
  const isMyTurn = authedRole === 'manager' && authedTeamId && state?.current_team_id === authedTeamId
  const isAuthed = !!authedRole
  const ready = draft?.ready_state ?? {}
  const teams = state?.teams ?? []
  const allReady = teams.every(t => ready[t.id]) && (!state?.supervisor_exists || ready['supervisor'])
  const myReady = authedRole === 'supervisor' ? !!ready['supervisor'] : (authedTeamId ? !!ready[authedTeamId] : false)
  // 집중 모드 — 진행 중일 때 다른 UI 숨기고 드래프트에만 집중
  const isFocus = draft?.status === 'in_progress' && focusMode

  return (
    <div className={isFocus ? 'fixed inset-0 z-[45] bg-[color:var(--mm-ground)] overflow-y-auto p-4 sm:p-6 space-y-4' : 'space-y-5'}>
      {/* 픽 공개 히어로 오버레이 — 모두에게 강조되는 임팩트 */}
      {reveal && (() => {
        const rc = teamMap[reveal.team_id]?.color ?? '#EAB308'
        return (
          <div role="button" tabIndex={0} aria-label="픽 공개 닫기"
            onClick={() => { if (revealTimer.current) window.clearTimeout(revealTimer.current); setReveal(null) }}
            onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') { if (revealTimer.current) window.clearTimeout(revealTimer.current); setReveal(null) } }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300 cursor-pointer"
            style={{ background: `radial-gradient(circle at center, ${rc}33 0%, rgba(0,0,0,0.92) 70%)` }}>
            <div className="text-center">
              {isMyTurn && (
                <div className="mb-4">
                  <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)] font-black text-lg sm:text-xl animate-pulse">
                    <Trophy size={20} aria-hidden /> 지금 내 차례
                  </span>
                </div>
              )}
              <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-sm mb-5 animate-in slide-in-from-top-4 duration-500"
                style={{ backgroundColor: `${rc}33`, border: `2px solid ${rc}` }}>
                <div className="w-3.5 h-3.5 rounded-full animate-pulse border" style={{ backgroundColor: teamInk(rc).bg, borderColor: teamInk(rc).border }} />
                <span className="text-white font-bold text-xl">{teamMap[reveal.team_id]?.name}</span>
                <span className="text-white/80 text-base">{reveal.round_number}R · 전체 {reveal.pick_number}순위</span>
              </div>
              <p className="font-jersey text-lg uppercase tracking-[0.4em] mb-3 animate-pulse" style={{ color: teamAccentOnDark(rc) }}>THE PICK IS IN</p>
              <div className="mb-4 animate-in zoom-in-75 duration-500">
                <PickPhotoFlip photoUrl={reveal.player_photo_url} playerName={reveal.player_name} pickNumber={reveal.pick_number} teamColor={rc} size="md" />
              </div>
              <h2 className="font-jersey text-6xl sm:text-8xl font-black text-white animate-in zoom-in-90 duration-500"
                style={{ textShadow: `0 0 40px ${rc}, 0 0 80px ${rc}88` }}>
                {reveal.player_name}
              </h2>
              {reveal.player_number != null && (
                <p className="font-jersey text-5xl mt-3 tabular-nums font-black" style={{ color: rc }}>#{reveal.player_number}</p>
              )}
              <p className="text-white/80 text-base mt-4 font-bold leading-relaxed">{teamMap[reveal.team_id]?.name} 지명 완료</p>
            </div>
          </div>
        )
      })()}

      {/* 픽 폭죽 */}
      <Confetti trigger={reveal?.pick_number ?? null}
        colors={reveal ? [teamMap[reveal.team_id]?.color ?? '#EAB308', '#ffffff', '#EAB308', '#0A0A0A'] : undefined} />

      {/* 추첨 — 로또 머신 애니메이션 */}
      {showLottery && draft?.draft_order && draft.draft_order.length > 0 && (
        <DraftLotteryReveal
          order={draft.draft_order}
          odds={draft.lottery_odds}
          teams={teams}
          raceStartedAt={draft.race_started_at ?? null}
          canStart={canStartRace}
          onStart={startRace}
          onClose={() => setShowLottery(false)}
        />
      )}

      {/* 헤더 + 분기 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* flex-wrap 필수 — 375px 에서 TEST 배지 + LIVE 배지가 함께 붙으면 제목 줄이 넘친다 */}
          <h1 className="font-jersey text-3xl sm:text-4xl font-black text-[color:var(--mm-ink)] flex items-center gap-2 flex-wrap min-w-0">
            <Sparkles size={24} className="text-[color:var(--mm-yellow-strong)]" /> 드래프트
            {state?.draft?.is_test && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)] text-sm font-black tracking-wider">
                <FlaskConical size={16} aria-hidden /> TEST · 리그 미반영
              </span>
            )}
            {isFocus &&<span className="text-sm font-bold px-2.5 py-1 rounded-sm bg-[color:var(--mm-live-bg)] text-white uppercase tracking-wider animate-pulse-red">집중 모드 · LIVE</span>}
          </h1>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button onClick={() => { primeAudio(); setMuted(v => !v) }} title={muted ? '소리 켜기' : '소리 끄기'}
              aria-label={muted ? '소리 켜기' : '소리 끄기'}
              className="text-sm px-2.5 py-2 min-h-11 rounded-sm border border-[color:var(--mm-rule)] text-[color:var(--mm-ink-soft)] hover:text-[color:var(--mm-ink)] hover:bg-[color:var(--mm-panel-alt)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] transition-colors">
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            {draft?.status === 'in_progress' && (
              <button onClick={() => setFocusMode(v => !v)}
                className="text-sm px-3 py-2 min-h-11 rounded-sm border border-[color:var(--mm-rule)] text-[color:var(--mm-ink-soft)] hover:text-[color:var(--mm-ink)] hover:bg-[color:var(--mm-panel-alt)] cursor-pointer inline-flex items-center gap-1.5 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] transition-colors">
                {focusMode ? <><Minimize2 size={14} /> 집중 해제</> : <><Maximize2 size={14} /> 집중 모드</>}
              </button>
            )}
            {isAuthed ? (
              <>
                <span className={`px-3 py-1.5 rounded-sm text-sm font-bold inline-flex items-center gap-1.5 ${
                  authedRole === 'supervisor' ? 'bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)]' : 'bg-[color:var(--mm-panel-alt)] border border-[color:var(--mm-rule)] text-[color:var(--mm-ink)]'
                }`}>
                  {authedRole === 'supervisor' ? <ShieldCheck size={14} /> : <div className="w-2 h-2 rounded-full border" style={{ backgroundColor: teamInk(authedTeam?.color).bg, borderColor: teamInk(authedTeam?.color).border }} />}
                  {authedRole === 'supervisor' ? '총무' : authedTeam?.name} · {authedLabel}
                </span>
                <button onClick={exitAuth} className="text-sm text-[color:var(--mm-ink-soft)] hover:text-[color:var(--mm-live)] cursor-pointer font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-live)] rounded-sm">해제</button>
              </>
            ) : (
              <Button onClick={() => setShowCodeModal(true)} className="bg-[color:var(--mm-yellow)] hover:brightness-95 text-[color:var(--mm-black)] text-sm sm:text-base font-bold min-h-[44px] px-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]">
                <KeyRound size={16} className="mr-1.5" /> 코드 입력
              </Button>
            )}
          </div>
        </div>

        {!isFocus && (
          <div className="flex gap-2 flex-wrap">
            {quarters.map(q => (
              <button key={q.id} onClick={() => setSelectedQid(q.id)}
                className={`px-3.5 py-2 min-h-11 rounded-sm text-sm sm:text-base font-bold border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] ${
                  selectedQid === q.id ? 'bg-[color:var(--mm-yellow)] border-[color:var(--mm-yellow)] text-[color:var(--mm-black)]' : 'bg-[color:var(--mm-panel-alt)] border-[color:var(--mm-rule)] text-[color:var(--mm-ink-soft)] hover:text-[color:var(--mm-ink)]'
                }`}>
                {String(q.year).slice(2)}.{q.quarter}Q
                {q.is_current && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-[color:var(--mm-yellow-strong)] inline-block" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 관리 패널 — 편집 모드(리그 PIN), 집중 모드 아닐 때만 표시 */}
      {isEditMode && selectedQid && !isFocus && (
        <div className="border border-[color:var(--mm-rule)] rounded-sm overflow-hidden">
          <button onClick={() => setShowManage(v => !v)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-[color:var(--mm-panel-alt)] hover:bg-[color:var(--mm-yellow-soft)] transition-colors cursor-pointer">
            <span className="flex items-center gap-2 text-[color:var(--mm-yellow-strong)] font-bold text-sm uppercase tracking-[0.16em]">
              <Settings2 size={16} /> 드래프트 준비
            </span>
            <span className="text-sm text-[color:var(--mm-muted)]">{showManage ? '접기 ▲' : '펼치기 ▼'}</span>
          </button>
          {showManage && (
            <div className="p-4 bg-[color:var(--mm-panel)]">
              <DraftSetupStepper
                leagueId={leagueId}
                quarters={quarters}
                selectedQid={selectedQid}
                teams={state?.teams ?? []}
                authHeaders={leagueHeaders}
                onQuarterCreated={newId => { void loadQuarters(newId) }}
                onTeamsChanged={fetchState}
                onSessionChanged={fetchState}
              />
            </div>
          )}
        </div>
      )}

      {/* 코드 입력 모달 */}
      {showCodeModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCodeModal(false)}>
          <div className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-sm p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1.5">
              <Lock size={20} className="text-[color:var(--mm-yellow-strong)]" />
              <h3 className="font-jersey text-[color:var(--mm-ink)] font-black text-xl sm:text-2xl">코드 입력</h3>
            </div>
            <p className="text-base text-[color:var(--mm-ink-soft)] mb-4 leading-relaxed break-keep">단장 코드는 우리 팀 픽을, 총무 코드는 진행을 맡습니다.</p>
            <Input autoFocus value={codeInput} onChange={e => { setCodeInput(e.target.value); setAuthError(null) }}
              placeholder="단장/총무 코드" className="bg-[color:var(--mm-panel-alt)] border-[color:var(--mm-rule)] text-[color:var(--mm-ink)] font-mono text-lg h-12"
              onKeyDown={e => e.key === 'Enter' && submitCode()} />
            {authError && <p className="text-[color:var(--mm-live)] text-sm mt-2 font-bold">{authError}</p>}
            <div className="flex gap-2 mt-4">
              <Button onClick={() => { setShowCodeModal(false); setCodeInput('') }} variant="outline" className="flex-1 text-base h-12 font-bold">취소</Button>
              <Button onClick={submitCode} disabled={authing || !codeInput.trim()} className="flex-1 bg-[color:var(--mm-yellow)] hover:brightness-95 text-[color:var(--mm-black)] text-base h-12 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]">
                {authing ? '확인 중...' : '인증'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 메인 — 상태별 */}
      {!draft ? (
        <div className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] border-dashed rounded-sm p-12 text-center">
          <Trophy size={24} className="mx-auto text-[color:var(--mm-muted)] mb-3" />
          <p className="font-jersey text-[color:var(--mm-ink)] text-lg sm:text-xl font-bold">이 분기는 아직 드래프트 세션이 만들어지지 않았습니다</p>
          <p className="text-base text-[color:var(--mm-ink-soft)] mt-2 leading-relaxed break-keep">총무가 세션을 만들면 여기에 표시됩니다</p>
        </div>
      ) : draft.status === 'setup' ? (
        <div className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-sm p-8 text-center space-y-3">
          <p className="font-jersey text-[color:var(--mm-ink)] font-bold text-2xl sm:text-3xl">드래프트 준비 중</p>
          <p className="text-base text-[color:var(--mm-ink-soft)] leading-relaxed break-keep">총무가 공유 링크에서 준비를 시작하면 여기에도 표시됩니다</p>
        </div>
      ) : draft.status === 'ready_check' ? (
        <div className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-sm p-6 space-y-5">
          <div className="text-center">
            <p className="text-base font-bold text-[color:var(--mm-yellow-strong)]">준비 확인</p>
            <p className="font-jersey text-[color:var(--mm-ink)] font-bold text-3xl sm:text-4xl mt-2">모든 참가자 준비 대기</p>
            <p className="text-base text-[color:var(--mm-ink-soft)] mt-2 leading-relaxed break-keep">단장 {teams.length}명{state?.supervisor_exists ? ' + 총무' : ''}이 모두 준비하면<br className="sm:hidden"/> 추첨을 진행할 수 있습니다</p>
          </div>

          {/* 참가자 준비 현황 */}
          <div className="flex flex-wrap justify-center gap-2">
            {teams.map(t => (
              <span key={t.id} className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-sm border text-base font-bold ${
                ready[t.id] ? 'bg-[color:var(--mm-yellow)] border-[color:var(--mm-yellow)] text-[color:var(--mm-black)]' : 'bg-[color:var(--mm-panel-alt)] border-[color:var(--mm-rule)] text-[color:var(--mm-ink-soft)]'
              }`}>
                {ready[t.id] ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                {t.name} 단장
              </span>
            ))}
            {state?.supervisor_exists && (
              <span className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-sm border text-base font-bold ${
                ready['supervisor'] ? 'bg-[color:var(--mm-yellow)] border-[color:var(--mm-yellow)] text-[color:var(--mm-black)]' : 'bg-[color:var(--mm-panel-alt)] border-[color:var(--mm-rule)] text-[color:var(--mm-ink-soft)]'
              }`}>
                {ready['supervisor'] ? <CheckCircle2 size={16} /> : <Circle size={16} />} 총무
              </span>
            )}
          </div>

          {/* 내 준비 버튼 */}
          {isAuthed ? (
            <div className="flex flex-col items-center gap-3">
              <Button onClick={() => toggleReady(!myReady)} disabled={acting}
                className={`px-10 text-lg sm:text-xl font-black h-14 sm:h-16 ${myReady ? 'bg-[color:var(--mm-panel-alt)] border border-[color:var(--mm-rule)] text-[color:var(--mm-ink)] hover:bg-[color:var(--mm-rule)]' : 'bg-[color:var(--mm-yellow)] hover:brightness-95 text-[color:var(--mm-black)]'} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]`}>
                {myReady ? '준비 해제' : (<span className="inline-flex items-center gap-2"><Hand size={20} aria-hidden /> 준비 완료</span>)}
              </Button>
              {authedRole === 'supervisor' && (
                <p className="text-base text-[color:var(--mm-ink-soft)] text-center leading-relaxed break-keep">
                  추첨과 드래프트 시작은 공유 링크(드래프트 방)에서 진행하세요.
                </p>
              )}
              {!myReady && authedRole === 'manager' && (
                <p className="text-base text-[color:var(--mm-yellow-strong)] text-center leading-relaxed break-keep">버튼을 누르면 총무에게 준비 신호가 전송됩니다.</p>
              )}
            </div>
          ) : (
            <p className="text-center text-base text-[color:var(--mm-ink-soft)] leading-relaxed">코드를 입력하면 준비 버튼이 표시됩니다</p>
          )}
        </div>
      ) : (
        // in_progress / completed
        <>
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
          {/* 좌측 픽 보드 */}
          <div className="space-y-3">
            {draft.status === 'in_progress' && currentTeam && (() => {
              const deadline = draft.pick_deadline ? new Date(draft.pick_deadline).getTime() : null
              const remain = deadline ? Math.max(0, Math.ceil((deadline - nowMs) / 1000)) : null
              // 마감이 없음 = 픽 공개 연출이 끝나기를 기다리는 구간. 만료(0초·빨강)가 아니다.
              const clockPending = deadline === null
              const expired = remain !== null && remain <= 0
              // 만료 후 자동 선택까지 남은 유예(초)
              const graceLeft = deadline && expired ? Math.max(0, Math.ceil((deadline + AUTOPICK_GRACE_SECONDS * 1000 - nowMs) / 1000)) : null
              const curUsed = state?.current_team_id ? (draft.extensions_used?.[state.current_team_id] ?? 0) : 0
              const myUsed = authedTeamId ? (draft.extensions_used?.[authedTeamId] ?? 0) : 0
              const timerColor = expired ? 'text-[color:var(--mm-live)]' : remain !== null && remain <= 10 ? 'text-[color:var(--mm-live)]' : remain !== null && remain <= 30 ? 'text-[color:var(--mm-yellow-strong)]' : 'text-[color:var(--mm-ink)]'
              return (
                <div className={`rounded-sm p-4 sm:p-5 border-2 transition-colors ${isMyTurn ? 'bg-[color:var(--mm-yellow-soft)] border-[color:var(--mm-yellow)]' : 'bg-[color:var(--mm-panel)] border-[color:var(--mm-rule)]'} ${expired ? 'animate-pulse border-[color:var(--mm-live)]' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full shrink-0 border ${isMyTurn ? 'animate-pulse' : ''}`} style={{ backgroundColor: teamInk(currentTeam.color).bg, borderColor: teamInk(currentTeam.color).border }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-jersey text-sm uppercase tracking-widest text-[color:var(--mm-muted)]">현재 차례 · {draft.total_picks + 1}순위</p>
                      <p className="font-bold text-2xl sm:text-3xl text-[color:var(--mm-ink)] break-keep leading-tight" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
                        {currentTeam.name}
                        {isMyTurn && <span className="ml-2 text-[color:var(--mm-yellow-strong)] text-base sm:text-lg">← 내 차례!</span>}
                      </p>
                    </div>
                    {(remain !== null || clockPending) && (() => {
                      // 감독관이 픽 시간을 바꾸면(예: 120초) 서버가 주는 값으로 링을 그려야 한다
                      const ringSeconds = draft.pick_seconds || PICK_SECONDS
                      // 시계 시작 전에는 링을 꽉 찬 회색으로 — 아직 한 톨도 쓰지 않았다는 뜻
                      const frac = clockPending ? 1 : Math.max(0, Math.min(1, (remain ?? 0) / ringSeconds))
                      const R = 26, C = 2 * Math.PI * R
                      const stroke = clockPending
                        ? 'var(--mm-rule-strong, #9CA3AF)'
                        : expired ? '#DC2626' : (remain ?? 0) <= 10 ? '#DC2626' : (remain ?? 0) <= 30 ? '#A16207' : '#059669'
                      return (
                        <div className="relative w-16 h-16 shrink-0" aria-label={clockPending ? '픽 공개 중 — 시계는 곧 시작됩니다' : undefined} role={clockPending ? 'img' : undefined}>
                          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64" aria-hidden>
                            <circle cx="32" cy="32" r={R} fill="none" stroke="var(--mm-rule)" strokeWidth="6" />
                            <circle cx="32" cy="32" r={R} fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round"
                              strokeDasharray={C} strokeDashoffset={C * (1 - frac)} className="transition-all duration-500" />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            {clockPending ? (
                              <Clock size={24} className="text-[color:var(--mm-muted)]" aria-hidden />
                            ) : (
                              <>
                                <span className={`font-jersey font-black text-2xl leading-none tabular-nums ${timerColor}`}>{expired ? '0' : remain}</span>
                                <span className="text-sm text-[color:var(--mm-muted)]">초</span>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                  {clockPending && (
                    <p className="mt-3 text-base text-[color:var(--mm-ink-soft)] leading-relaxed">공개 중 · 곧 시작</p>
                  )}
                  {/* 시간 종료 — 자동 선택 최종 카운트다운 */}
                  {expired && graceLeft !== null && (
                    <div className="mt-3 rounded-sm bg-[color:var(--mm-live-bg)] px-3 py-2.5 flex items-center justify-center gap-2 animate-pulse flex-wrap">
                      <span className="inline-flex items-center gap-1.5 text-white text-sm sm:text-base font-bold leading-relaxed"><Clock size={16} aria-hidden /> 시간 종료 — {graceLeft}초 뒤 자동으로 선수가 선택됩니다</span>
                      <span className="font-jersey font-black text-3xl text-white tabular-nums">{graceLeft}</span>
                    </div>
                  )}
                  {/* 추가 시간 — 현재 차례 단장에게만 */}
                  {isMyTurn && (
                    <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm text-[color:var(--mm-ink-soft)] tabular-nums">추가 시간 {myUsed}/{MAX_EXTENSIONS} 사용</span>
                      {/* 시계 시작 전 연장은 서버가 409 로 막는다 */}
                      <Button onClick={extendTime} disabled={extending || myUsed >= MAX_EXTENSIONS || clockPending}
                        className="bg-[color:var(--mm-yellow)] hover:brightness-95 text-[color:var(--mm-black)] text-sm h-10 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]">
                        +{EXTENSION_SECONDS}초 추가 {myUsed >= MAX_EXTENSIONS ? '(소진)' : `(${MAX_EXTENSIONS - myUsed}회 남음)`}
                      </Button>
                    </div>
                  )}
                  {!isMyTurn && curUsed > 0 && (
                    <p className="mt-2 text-sm text-[color:var(--mm-muted)]">{currentTeam.name} 추가 시간 {curUsed}/{MAX_EXTENSIONS} 사용</p>
                  )}
                </div>
              )
            })()}

            {/* 픽 기록(라운드 표) — 완료된 세션은 PIN/어드민에게만.
                회원에게는 아래 요약 카드(번호 없는 팀별 명단)만 보인다. 발표 전에 순서가 새면
                "누가 몇 번째로 뽑혔나"가 명단보다 먼저 돌아다닌다(2026-09-16 리허설 피드백).
                진행 중(in_progress)에는 그대로 둔다 — 라이브 관전은 픽이 나오는 걸 보는 화면이다. */}
            {(draft.status !== 'completed' || isEditMode) && (
            <div className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-[color:var(--mm-rule)] flex items-center justify-between">
                <p className="text-sm font-bold text-[color:var(--mm-ink)] uppercase tracking-widest">픽 기록</p>
                <p className="text-sm text-[color:var(--mm-muted)] tabular-nums">{draft.method === 'snake' ? 'Snake' : 'Linear'} · {draft.total_picks}픽</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[color:var(--mm-rule)]">
                      <th className="text-left p-2 text-[color:var(--mm-muted)] font-bold w-10">R</th>
                      {draft.draft_order.map((tid, idx) => {
                        const t = teamMap[tid]
                        return (
                          <th key={`${tid}-${idx}`} className="text-center p-2 min-w-[100px]">
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="w-2 h-2 rounded-full border" style={{ backgroundColor: teamInk(t?.color).bg, borderColor: teamInk(t?.color).border }} />
                              <span className="text-[color:var(--mm-ink)] font-bold text-sm">{t?.name}</span>
                            </div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // 완료된 드래프트는 current_round 를 무시한다 — 마지막 픽에서 라운드가
                      // 올라간 옛 세션을 열면 빈 6번째 줄이 생긴다(서버 수정 전 데이터 방어).
                      const maxRound = Math.max(
                        ...state!.picks.map(p => p.round_number),
                        draft.status === 'completed' ? 0 : draft.current_round,
                        1,
                      )
                      const rows = []
                      for (let r = 1; r <= maxRound; r++) {
                        const reversed = draft.method === 'snake' && r % 2 === 0
                        rows.push(
                          <tr key={r} className="border-b border-[color:var(--mm-rule)]">
                            <td className="p-2 text-[color:var(--mm-ink-soft)] font-bold whitespace-nowrap tabular-nums">
                              {r}
                              {draft.method === 'snake' && (
                                <span className="ml-1 text-sm text-[color:var(--mm-yellow-strong)]" title={reversed ? '역순' : '정순'}>{reversed ? '←' : '→'}</span>
                              )}
                            </td>
                            {draft.draft_order.map((tid, ci) => {
                              const pick = state!.picks.find(p => p.round_number === r && p.team_id === tid)
                              const tColor = teamMap[tid]?.color
                              const isCurrentCell = draft.status === 'in_progress' && r === draft.current_round && tid === currentTeam?.id
                              return (
                                <td key={ci} className={`p-1.5 text-center ${isCurrentCell ? 'bg-[color:var(--mm-yellow-soft)] ring-1 ring-[color:var(--mm-yellow)]' : ''}`}>
                                  {pick ? (
                                    <div className="rounded-sm py-1.5" style={{ backgroundColor: tColor ? `${tColor}1f` : undefined, borderLeft: tColor ? `3px solid ${tColor}` : undefined }}>
                                      <div className="text-[color:var(--mm-ink)] font-bold text-sm leading-tight px-1">{pick.player_name}</div>
                                      <div className="text-sm text-[color:var(--mm-muted)] tabular-nums">#{pick.pick_number}</div>
                                    </div>
                                  ) : isCurrentCell ? (
                                    <div className="text-[color:var(--mm-yellow-strong)] text-sm font-bold animate-pulse">선택 중...</div>
                                  ) : (
                                    <div className="text-[color:var(--mm-muted)]">—</div>
                                  )}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      }
                      return rows
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
            )}

            {draft.status === 'completed' && (
              <div className="bg-[color:var(--mm-yellow)] rounded-sm p-5 text-center">
                <p className="font-jersey text-[color:var(--mm-black)] font-bold text-lg sm:text-xl">드래프트 완료</p>
                <p className="text-sm text-[color:var(--mm-black)]/75 mt-1.5 leading-relaxed">
                  {draft.is_test ? '테스트 세션 — 리그에 반영되지 않았습니다' : '분기 멤버십이 자동 반영되었습니다'}
                </p>
                <Link href={`/league/${orgSlug}/${leagueId}/teams`} className="inline-flex items-center gap-1 mt-3 text-base text-[color:var(--mm-black)] hover:underline underline-offset-4 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)] rounded-sm">
                  팀 구성 페이지로 <ChevronRight size={16} />
                </Link>
              </div>
            )}
          </div>

          {/* 우측 액션 */}
          <div className="space-y-3">
            {draft.status === 'in_progress' && (
              <>
                {authedRole !== 'manager' ? (
                  <div className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-sm p-5 text-center">
                    {authedRole === 'supervisor'
                      ? <p className="text-[color:var(--mm-yellow-strong)] text-base font-bold">총무 — 진행 관전 중</p>
                      : <>
                          <KeyRound size={24} className="mx-auto text-[color:var(--mm-yellow-strong)] mb-2" />
                          <p className="text-[color:var(--mm-ink)] font-bold text-lg mb-2">단장 코드를 입력하세요</p>
                          <Button onClick={() => setShowCodeModal(true)} className="w-full bg-[color:var(--mm-yellow)] hover:brightness-95 text-[color:var(--mm-black)] mt-2 text-base h-12 font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]">코드 입력</Button>
                        </>}
                  </div>
                ) : isMyTurn ? (
                  <div className="bg-[color:var(--mm-yellow)] rounded-sm p-5 text-center">
                    <p className="inline-flex items-center gap-2 justify-center text-[color:var(--mm-black)] font-bold text-2xl sm:text-3xl"><Trophy size={24} aria-hidden /> 내 차례입니다!</p>
                    <p className="text-base text-[color:var(--mm-black)]/85 mt-2 leading-relaxed">아래 <b className="text-[color:var(--mm-black)]">남은 선수 성적표</b>에서 선수를 선택해 픽하세요.</p>
                    <p className="text-sm text-[color:var(--mm-black)]/75 mt-1.5">{state?.available_players.length}명 선택 가능{statsGated ? '' : ' · 랜덤픽(추천) 버튼도 성적표에 있습니다.'}</p>
                  </div>
                ) : (
                  <div className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-sm p-5 text-center">
                    <p className="text-[color:var(--mm-ink)] text-lg font-bold mb-2">본인 차례가 아닙니다</p>
                    <p className="text-base text-[color:var(--mm-ink-soft)]">현재: <span className="text-[color:var(--mm-ink)] font-bold">{currentTeam?.name}</span></p>
                  </div>
                )}
              </>
            )}

            {/* 팀장 명단 */}
            {(state?.leaders ?? []).some(l => l.leader_player_id) && (
              <div className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-sm p-4">
                <p className="font-jersey text-sm text-[color:var(--mm-muted)] uppercase tracking-widest mb-2 flex items-center gap-1.5"><Crown size={14} className="text-[color:var(--mm-yellow-strong)]" /> 팀장</p>
                <div className="space-y-1.5">
                  {teams.map(t => {
                    const lid = state?.leaders.find(l => l.team_id === t.id)?.leader_player_id
                    if (!lid) return null
                    return (
                      <div key={t.id} className="flex items-center gap-2 text-sm">
                        <div className="w-2 h-2 rounded-full border" style={{ backgroundColor: teamInk(t.color).bg, borderColor: teamInk(t.color).border }} />
                        <span className="text-[color:var(--mm-ink)] font-bold">{t.name}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-sm p-4 space-y-2.5">
              <p className="font-jersey text-sm text-[color:var(--mm-muted)] uppercase tracking-widest">진행 현황</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="font-jersey font-black text-3xl text-[color:var(--mm-ink)] tabular-nums">{draft.total_picks}</p><p className="text-sm text-[color:var(--mm-muted)] font-bold uppercase tracking-[0.16em]">총 픽</p></div>
                <div><p className="font-jersey font-black text-3xl text-[color:var(--mm-yellow-strong)] tabular-nums">{draft.status === 'completed' ? Math.max(1, ...state!.picks.map(p => p.round_number)) : draft.current_round}</p><p className="text-sm text-[color:var(--mm-muted)] font-bold uppercase tracking-[0.16em]">라운드</p></div>
                <div><p className="font-jersey font-black text-3xl text-[color:var(--mm-ink)] tabular-nums">{state?.available_players.length}</p><p className="text-sm text-[color:var(--mm-muted)] font-bold uppercase tracking-[0.16em]">남은 선수</p></div>
              </div>
            </div>
          </div>
        </div>

        {/* 완료 시 결과 요약 카드 */}
        {draft.status === 'completed' && (
          <DraftSummaryCard
            showOrder={false}
            teams={teams}
            picks={(state?.picks ?? []).map(p => ({ team_id: p.team_id, player_id: p.player_id, player_name: p.player_name, pick_number: p.pick_number }))}
            leaders={state?.leaders ?? []}
            playerNames={{
              ...Object.fromEntries(Object.values(prevStats).map(s => [s.player_id, s.name ?? ''])),
              ...Object.fromEntries((state?.picks ?? []).map(p => [p.player_id, p.player_name])),
            }}
          />
        )}

        {/* 팀 구성 성적 + 남은 선수 성적표 (하단) */}
        <DraftTeamStats teams={teams} picks={(state?.picks ?? []).map(p => ({ team_id: p.team_id, player_id: p.player_id }))} leaders={state?.leaders ?? []} stats={prevStats} gated={statsGated} />
        <div id="draft-stat-table">
          <DraftStatTable leagueId={leagueId} availablePlayers={(state?.available_players ?? []).map(p => ({ id: p.id, name: p.name, number: p.number }))} prevStats={prevStats} prevQuarterId={prevQuarter?.id ?? null} prevQuarterLabel={prevQuarterLabel} gated={statsGated} canPick={!!isMyTurn} picking={picking !== null} selectedId={selectedPickId} onSelectId={setSelectedPickId} onPick={pickById} onShowStats={p => setStatsPlayer({ id: p.id, name: p.name, number: p.number })} />
        </div>

        {/* 모바일 스티키 바 가림 방지 여백 */}
        {isMyTurn && <div className="lg:hidden h-16" />}

        {/* 모바일 '내 차례' 스티키 액션 바 */}
        {isMyTurn && (
          <div className="lg:hidden fixed bottom-0 inset-x-0 z-[46] bg-[color:var(--mm-panel)]/95 backdrop-blur border-t border-[color:var(--mm-yellow)] p-3 flex items-center gap-2"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            {selectedPickId ? (
              <button onClick={() => pickById(selectedPickId)} disabled={picking !== null}
                className="flex-1 py-3 min-h-[52px] rounded-sm bg-[color:var(--mm-yellow)] hover:brightness-95 disabled:opacity-50 text-[color:var(--mm-black)] font-black text-base flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]">
                <Check size={20} /> {state?.available_players.find(p => p.id === selectedPickId)?.name} 픽 확정
              </button>
            ) : (
              <>
                {/* 성적이 잠긴 상태에서는 "추천"이 성립하지 않아 버튼을 감춘다 */}
                {!statsGated && (
                  <button onClick={recommendBest} className="flex-1 py-3 min-h-[52px] rounded-sm bg-[color:var(--mm-panel-alt)] border border-[color:var(--mm-rule)] hover:bg-[color:var(--mm-yellow-soft)] text-[color:var(--mm-ink)] font-bold text-sm sm:text-base flex items-center justify-center gap-1.5 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]">
                    <Shuffle size={16} /> 랜덤픽(추천)
                  </button>
                )}
                <button onClick={() => document.getElementById('draft-stat-table')?.scrollIntoView({ behavior: 'smooth' })}
                  className="flex-1 py-3 min-h-[52px] rounded-sm bg-[color:var(--mm-yellow)] hover:brightness-95 text-[color:var(--mm-black)] font-bold text-sm sm:text-base flex items-center justify-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]">
                  <ChevronDown size={16} /> 성적표에서 선택
                </button>
              </>
            )}
          </div>
        )}
        </>
      )}

      {/* 선수 스탯 팝업 */}
      {statsPlayer && (
        <DraftPlayerStatsModal
          player={statsPlayer}
          stats={prevStats}
          poolIds={state?.pool_player_ids ?? []}
          prevQuarterLabel={prevQuarterLabel}
          onClose={() => setStatsPlayer(null)}
        />
      )}

    </div>
  )
}
