'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KeyRound, Trophy, ChevronRight, Lock, Sparkles, CheckCircle2, Circle, Dice5, Crown, ShieldCheck, Settings2, Minimize2, Maximize2, Shuffle, Check, ChevronDown, Volume2, VolumeX } from 'lucide-react'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import DraftCodeManager from '@/components/league/DraftCodeManager'
import DraftSessionControl from '@/components/league/DraftSessionControl'
import DraftChat from '@/components/league/DraftChat'
import DraftPlayerStatsModal, { type DraftStatRow } from '@/components/league/DraftPlayerStatsModal'
import DraftLotteryReveal from '@/components/league/DraftLotteryReveal'
import DraftTeamStats from '@/components/league/DraftTeamStats'
import DraftStatTable from '@/components/league/DraftStatTable'
import DraftSummaryCard from '@/components/league/DraftSummaryCard'
import Confetti from '@/components/league/Confetti'
import { MAX_EXTENSIONS, EXTENSION_SECONDS, AUTOPICK_GRACE_SECONDS, PICK_SECONDS } from '@/lib/draftTimer'
import { playBeep, playBuzzer, primeAudio, setMuted as setSoundMuted } from '@/lib/draftSounds'
import { overallScorePerGame } from '@/lib/leagueStats'
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
    pick_deadline: string | null
    extensions_used: Record<string, number>
    started_at: string | null
    completed_at: string | null
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
  const autoPickRef = useRef<string | null>(null) // 자동픽 중복 방지 (deadline 키)
  const startClockRef = useRef<string | null>(null) // 첫 픽 타이머 시작 중복 방지
  const beepSecRef = useRef<number>(-1) // 카운트다운 비프 중복 방지

  const sessionKey = selectedQid ? `draft_code_${leagueId}_${selectedQid}` : null

  useEffect(() => {
    fetch(`/api/leagues/${leagueId}/quarters`)
      .then(r => r.json())
      .then((qs: Quarter[]) => {
        setQuarters(qs)
        const current = qs.find(q => q.is_current) ?? qs[qs.length - 1] ?? qs[0]
        if (current) setSelectedQid(current.id)
      })
  }, [leagueId])

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
      if (r.ok) setState(await r.json() as DraftState)
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
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [state?.draft?.status])

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
      .then(r => r.json())
      .then((d: { players?: DraftStatRow[] }) => {
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
    if (nowMs <= deadlineMs + AUTOPICK_GRACE_SECONDS * 1000) return  // 만료 후 5초 유예 뒤 자동 선택
    if (autoPickRef.current === d.pick_deadline) return // 이 마감건 이미 시도
    autoPickRef.current = d.pick_deadline
    fetch(`/api/leagues/${leagueId}/drafts/${d.id}/auto-pick`, {
      method: 'POST', headers,
    }).then(async r => {
      if (r.ok) { const data = await r.json().catch(() => ({})); if (data.auto) toast.message('시간 초과 — 자동 픽 되었습니다'); fetchState() }
    }).catch(() => null)
  }, [nowMs, state?.draft, authedCode, isEditMode, leagueHeaders, leagueId, fetchState])

  // 첫 픽 타이머 시작 — 추첨 연출(showLottery)이 닫힌 뒤, 아직 시계가 없으면 시작
  useEffect(() => {
    const d = state?.draft
    if (!d || d.status !== 'in_progress' || d.pick_deadline || d.total_picks > 0 || showLottery) return
    const headers: Record<string, string> | null = authedCode ? { 'X-Draft-Code': authedCode } : (isEditMode ? leagueHeaders : null)
    if (!headers) return
    if (startClockRef.current === d.id) return
    startClockRef.current = d.id
    fetch(`/api/leagues/${leagueId}/drafts/${d.id}/start-clock`, { method: 'POST', headers })
      .then(() => fetchState()).catch(() => null)
  }, [state?.draft, showLottery, authedCode, isEditMode, leagueHeaders, leagueId, fetchState])

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
      revealTimer.current = window.setTimeout(() => setReveal(null), 4500)
    }
  }, [state])

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
      if (role === 'supervisor') toast.success(`감독관 인증 완료 — ${label}`)
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

  // 감독관: 준비 체크 시작
  async function openReady() {
    if (!state?.draft || !authedCode) return
    setActing(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/drafts/${state.draft.id}/open-ready`, {
        method: 'POST', headers: { 'X-Draft-Code': authedCode },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? '실패'); return }
      toast.success('준비 체크 시작')
      fetchState()
    } finally { setActing(false) }
  }

  // 감독관: 추첨 진행
  async function runLottery(force: boolean) {
    if (!state?.draft || !authedCode) return
    if (force && !confirm('준비 안 된 참가자가 있어도 강제로 추첨할까요?')) return
    setActing(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/drafts/${state.draft.id}/lottery`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Draft-Code': authedCode },
        body: JSON.stringify({ force }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? '추첨 실패'); return }
      toast.success('추첨 완료!')
      fetchState()
    } finally { setActing(false) }
  }

  // 추가 시간 (현재 차례 단장)
  async function extendTime() {
    if (!state?.draft || !authedTeamId || !authedCode || authedRole !== 'manager') return
    if (state.current_team_id !== authedTeamId) { toast.error('본인 차례가 아닙니다'); return }
    setExtending(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/drafts/${state.draft.id}/extend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Draft-Code': authedCode },
        body: JSON.stringify({ team_id: authedTeamId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error ?? '추가 실패'); return }
      toast.success(`+${EXTENSION_SECONDS}초 (남은 ${data.remaining}회)`)
      fetchState()
    } finally { setExtending(false) }
  }

  // 추천(랜덤픽) — 지난 분기 종합 1위를 선택 후보로 (모바일 바·표 공용)
  function recommendBest() {
    const avail = state?.available_players ?? []
    if (avail.length === 0) return
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
    if (state.current_team_id !== authedTeamId) { toast.error('본인 차례가 아닙니다'); return }
    setPicking(playerId)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/drafts/${state.draft.id}/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Draft-Code': authedCode },
        body: JSON.stringify({ team_id: authedTeamId, league_player_id: playerId }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? '픽 실패'); return }
      toast.success('픽 완료')
      setSelectedPickId(null)
      fetchState()
    } finally { setPicking(null) }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><BasketballLoader size={32} /></div>
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
    <div className={isFocus ? 'fixed inset-0 z-[45] bg-gray-950 overflow-y-auto p-4 sm:p-6 space-y-4' : 'space-y-5'}>
      {/* 픽 공개 히어로 오버레이 — 모두에게 강조되는 임팩트 */}
      {reveal && (() => {
        const rc = teamMap[reveal.team_id]?.color ?? '#f59e0b'
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300"
            style={{ background: `radial-gradient(circle at center, ${rc}33 0%, rgba(0,0,0,0.92) 70%)` }}>
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full mb-5 animate-in slide-in-from-top-4 duration-500"
                style={{ backgroundColor: `${rc}33`, border: `2px solid ${rc}` }}>
                <div className="w-3.5 h-3.5 rounded-full animate-pulse" style={{ backgroundColor: rc }} />
                <span className="text-white font-black tracking-wide text-lg">{teamMap[reveal.team_id]?.name}</span>
                <span className="text-gray-300 text-sm">{reveal.round_number}R · 전체 {reveal.pick_number}순위</span>
              </div>
              <p className="font-jersey text-base uppercase tracking-[0.4em] mb-2 animate-pulse" style={{ color: rc }}>THE PICK IS IN</p>
              <h2 className="font-display text-6xl sm:text-8xl font-black text-white animate-in zoom-in-90 duration-500"
                style={{ textShadow: `0 0 40px ${rc}, 0 0 80px ${rc}88` }}>
                {reveal.player_name}
              </h2>
              {reveal.player_number != null && (
                <p className="jersey-num text-4xl mt-3" style={{ color: rc }}>#{reveal.player_number}</p>
              )}
              <p className="text-gray-400 text-sm mt-4 font-bold">{teamMap[reveal.team_id]?.name} 지명 완료</p>
            </div>
          </div>
        )
      })()}

      {/* 픽 폭죽 */}
      <Confetti trigger={reveal?.pick_number ?? null}
        colors={reveal ? [teamMap[reveal.team_id]?.color ?? '#f59e0b', '#ffffff', '#f59e0b', '#10b981'] : undefined} />

      {/* 추첨 — 로또 머신 애니메이션 */}
      {showLottery && draft?.draft_order && draft.draft_order.length > 0 && (
        <DraftLotteryReveal
          order={draft.draft_order}
          odds={draft.lottery_odds}
          teams={teams}
          onClose={() => setShowLottery(false)}
        />
      )}

      {/* 헤더 + 분기 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold text-white flex items-center gap-2">
            <Sparkles size={22} className="text-amber-400" /> 드래프트
            {isFocus && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-900/60 border border-emerald-700/50 text-emerald-300">집중 모드 · LIVE</span>}
          </h1>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button onClick={() => { primeAudio(); setMuted(v => !v) }} title={muted ? '소리 켜기' : '소리 끄기'}
              className="text-xs px-2 py-1 rounded-lg border border-gray-700 text-gray-400 hover:text-white cursor-pointer">
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            {draft?.status === 'in_progress' && (
              <button onClick={() => setFocusMode(v => !v)}
                className="text-xs px-2.5 py-1 rounded-lg border border-gray-700 text-gray-400 hover:text-white cursor-pointer inline-flex items-center gap-1">
                {focusMode ? <><Minimize2 size={12} /> 집중 해제</> : <><Maximize2 size={12} /> 집중 모드</>}
              </button>
            )}
            {isAuthed ? (
              <>
                <span className={`px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 ${
                  authedRole === 'supervisor' ? 'bg-amber-900/50 border border-amber-700/50 text-amber-300' : 'bg-emerald-900/50 border border-emerald-700/50 text-emerald-300'
                }`}>
                  {authedRole === 'supervisor' ? <ShieldCheck size={12} /> : <div className="w-2 h-2 rounded-full" style={{ backgroundColor: authedTeam?.color }} />}
                  {authedRole === 'supervisor' ? '감독관' : authedTeam?.name} · {authedLabel}
                </span>
                <button onClick={exitAuth} className="text-xs text-gray-500 hover:text-red-400 cursor-pointer">해제</button>
              </>
            ) : (
              <Button onClick={() => setShowCodeModal(true)} className="bg-amber-600 hover:bg-amber-500 text-white text-sm">
                <KeyRound size={14} className="mr-1.5" /> 코드 입력
              </Button>
            )}
          </div>
        </div>

        {!isFocus && (
          <div className="flex gap-2 flex-wrap">
            {quarters.map(q => (
              <button key={q.id} onClick={() => setSelectedQid(q.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors cursor-pointer ${
                  selectedQid === q.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                }`}>
                {String(q.year).slice(2)}.{q.quarter}Q
                {q.is_current && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 관리 패널 — 편집 모드(리그 PIN), 집중 모드 아닐 때만 표시 */}
      {isEditMode && selectedQid && !isFocus && (
        <div className="border border-amber-700/40 rounded-2xl overflow-hidden">
          <button onClick={() => setShowManage(v => !v)}
            className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-amber-950/30 hover:bg-amber-950/50 transition-colors cursor-pointer">
            <span className="flex items-center gap-2 text-amber-300 font-bold text-sm">
              <Settings2 size={16} /> 드래프트 관리 (편집 모드)
            </span>
            <span className="text-xs text-gray-400">{showManage ? '접기 ▲' : '펼치기 ▼'}</span>
          </button>
          {showManage && (
            <div className="p-4 space-y-6 bg-gray-950/40">
              <p className="text-xs text-gray-500">
                리그 PIN으로 드래프트를 직접 관리합니다. 어드민 콘솔 없이 코드 발급·팀장 지정·풀 선별·추첨까지 여기서 진행할 수 있습니다.
              </p>
              <section className="space-y-2">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">코드 발급</h3>
                <DraftCodeManager leagueId={leagueId} quarterId={selectedQid} teams={state?.teams ?? []} authHeaders={leagueHeaders} />
              </section>
              <section className="space-y-2">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">드래프트 세션</h3>
                <DraftSessionControl leagueId={leagueId} quarterId={selectedQid} teams={state?.teams ?? []} authHeaders={leagueHeaders} onChanged={fetchState} />
              </section>
            </div>
          )}
        </div>
      )}

      {/* 코드 입력 모달 */}
      {showCodeModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCodeModal(false)}>
          <div className="bg-gray-900 border border-amber-700/60 rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <Lock size={18} className="text-amber-400" />
              <h3 className="text-white font-black text-lg">코드 입력</h3>
            </div>
            <p className="text-xs text-gray-500 mb-4">단장 코드는 팀 픽 권한, 감독관 코드는 준비·추첨 진행 권한이 부여됩니다.</p>
            <Input autoFocus value={codeInput} onChange={e => { setCodeInput(e.target.value); setAuthError(null) }}
              placeholder="단장/감독관 코드" className="bg-gray-800 border-gray-700 text-white font-mono"
              onKeyDown={e => e.key === 'Enter' && submitCode()} />
            {authError && <p className="text-red-400 text-xs mt-2">{authError}</p>}
            <div className="flex gap-2 mt-4">
              <Button onClick={() => { setShowCodeModal(false); setCodeInput('') }} variant="outline" className="flex-1">취소</Button>
              <Button onClick={submitCode} disabled={authing || !codeInput.trim()} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white">
                {authing ? '확인 중...' : '인증'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 메인 — 상태별 */}
      {!draft ? (
        <div className="bg-gray-900 border border-gray-800 border-dashed rounded-2xl p-12 text-center">
          <Trophy size={36} className="mx-auto text-gray-600 mb-3" />
          <p className="text-gray-200 text-base sm:text-lg font-semibold">이 분기는 아직 드래프트 세션이 만들어지지 않았습니다</p>
          <p className="text-sm text-gray-400 mt-1.5">어드민이 세션을 생성하면 여기에 표시됩니다</p>
        </div>
      ) : draft.status === 'setup' ? (
        <div className="bg-gray-900 border border-blue-700/40 rounded-2xl p-8 text-center space-y-3">
          <p className="text-blue-200 font-bold text-xl">드래프트 준비 중</p>
          <p className="text-sm text-gray-400">감독관 또는 어드민이 준비 체크를 시작하면 진행됩니다</p>
          {authedRole === 'supervisor' && (
            <Button onClick={openReady} disabled={acting} className="bg-amber-600 hover:bg-amber-500 text-white">
              <Dice5 size={14} className="mr-1.5" /> 준비 체크 시작
            </Button>
          )}
        </div>
      ) : draft.status === 'ready_check' ? (
        <div className="bg-gray-900 border border-amber-700/40 rounded-2xl p-6 space-y-5">
          <div className="text-center">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-400">READY CHECK</p>
            <p className="text-white font-bold text-2xl mt-1.5">모든 참가자 준비 대기</p>
            <p className="text-sm text-gray-400 mt-1.5">단장 3명 + 감독관이 모두 준비하면 추첨을 진행할 수 있습니다</p>
          </div>

          {/* 참가자 준비 현황 */}
          <div className="flex flex-wrap justify-center gap-2">
            {teams.map(t => (
              <span key={t.id} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-bold ${
                ready[t.id] ? 'bg-emerald-900/40 border-emerald-600 text-emerald-300' : 'bg-gray-800 border-gray-700 text-gray-400'
              }`}>
                {ready[t.id] ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                {t.name} 단장
              </span>
            ))}
            {state?.supervisor_exists && (
              <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-bold ${
                ready['supervisor'] ? 'bg-emerald-900/40 border-emerald-600 text-emerald-300' : 'bg-gray-800 border-gray-700 text-gray-400'
              }`}>
                {ready['supervisor'] ? <CheckCircle2 size={14} /> : <Circle size={14} />} 감독관
              </span>
            )}
          </div>

          {/* 내 준비 버튼 */}
          {isAuthed ? (
            <div className="flex flex-col items-center gap-3">
              <Button onClick={() => toggleReady(!myReady)} disabled={acting}
                className={`px-8 ${myReady ? 'bg-gray-700 hover:bg-gray-600' : 'bg-emerald-600 hover:bg-emerald-500'} text-white`}>
                {myReady ? '준비 해제' : '준비 완료'}
              </Button>
              {authedRole === 'supervisor' && (
                <div className="flex gap-2">
                  <Button onClick={() => runLottery(false)} disabled={acting || !allReady} className="bg-amber-600 hover:bg-amber-500 text-white">
                    <Dice5 size={14} className="mr-1.5" /> 추첨 시작
                  </Button>
                  <Button onClick={() => runLottery(true)} disabled={acting} variant="outline">강제 추첨</Button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-sm text-gray-400">코드를 입력하면 준비 버튼이 표시됩니다</p>
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
              const expired = remain !== null && remain <= 0
              // 만료 후 자동 선택까지 남은 유예(초)
              const graceLeft = deadline && expired ? Math.max(0, Math.ceil((deadline + AUTOPICK_GRACE_SECONDS * 1000 - nowMs) / 1000)) : null
              const curUsed = state?.current_team_id ? (draft.extensions_used?.[state.current_team_id] ?? 0) : 0
              const myUsed = authedTeamId ? (draft.extensions_used?.[authedTeamId] ?? 0) : 0
              const timerColor = expired ? 'text-red-400' : remain !== null && remain <= 10 ? 'text-red-400' : remain !== null && remain <= 30 ? 'text-amber-300' : 'text-emerald-300'
              return (
                <div className={`rounded-xl p-4 border-2 transition-colors ${isMyTurn ? 'bg-emerald-900/30 border-emerald-500' : 'bg-gray-900 border-gray-800'} ${expired ? 'animate-pulse border-red-500' : ''}`}>
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full ${isMyTurn ? 'animate-pulse' : ''}`} style={{ backgroundColor: currentTeam.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-jersey text-[10px] uppercase tracking-widest text-gray-500">현재 차례 · {draft.total_picks + 1}순위</p>
                      <p className="font-black text-xl text-white truncate">
                        {currentTeam.name}
                        {isMyTurn && <span className="ml-2 text-emerald-400 text-sm">← 내 차례!</span>}
                      </p>
                    </div>
                    {remain !== null && (() => {
                      const frac = Math.max(0, Math.min(1, remain / PICK_SECONDS))
                      const R = 26, C = 2 * Math.PI * R
                      const stroke = expired ? '#ef4444' : remain <= 10 ? '#ef4444' : remain <= 30 ? '#fbbf24' : '#34d399'
                      return (
                        <div className="relative w-16 h-16 shrink-0">
                          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                            <circle cx="32" cy="32" r={R} fill="none" stroke="#1f2937" strokeWidth="6" />
                            <circle cx="32" cy="32" r={R} fill="none" stroke={stroke} strokeWidth="6" strokeLinecap="round"
                              strokeDasharray={C} strokeDashoffset={C * (1 - frac)} className="transition-all duration-500" />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className={`font-display text-lg leading-none tabular-nums ${timerColor}`}>{expired ? '0' : remain}</span>
                            <span className="text-[8px] text-gray-500">초</span>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                  {/* 시간 종료 — 자동 선택 최종 카운트다운 */}
                  {expired && graceLeft !== null && (
                    <div className="mt-3 rounded-lg bg-red-950/60 border border-red-600 px-3 py-2 flex items-center justify-center gap-2 animate-pulse">
                      <span className="text-red-300 text-sm font-bold">⏰ 시간 종료 — {graceLeft}초 뒤 자동으로 선수가 선택됩니다</span>
                      <span className="font-display text-2xl text-red-400 tabular-nums">{graceLeft}</span>
                    </div>
                  )}
                  {/* 추가 시간 — 현재 차례 단장에게만 */}
                  {isMyTurn && (
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-gray-400">추가 시간 {myUsed}/{MAX_EXTENSIONS} 사용</span>
                      <Button onClick={extendTime} disabled={extending || myUsed >= MAX_EXTENSIONS}
                        className="bg-amber-600 hover:bg-amber-500 text-white text-xs h-8">
                        +{EXTENSION_SECONDS}초 추가 {myUsed >= MAX_EXTENSIONS ? '(소진)' : `(${MAX_EXTENSIONS - myUsed}회 남음)`}
                      </Button>
                    </div>
                  )}
                  {!isMyTurn && curUsed > 0 && (
                    <p className="mt-2 text-[10px] text-gray-500">{currentTeam.name} 추가 시간 {curUsed}/{MAX_EXTENSIONS} 사용</p>
                  )}
                </div>
              )
            })()}

            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-800 flex items-center justify-between">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">픽 기록</p>
                <p className="text-[10px] text-gray-500">{draft.method === 'snake' ? 'Snake' : 'Linear'} · {draft.total_picks}픽</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-800/50">
                      <th className="text-left p-2 text-gray-600 font-bold w-10">R</th>
                      {draft.draft_order.map((tid, idx) => {
                        const t = teamMap[tid]
                        return (
                          <th key={`${tid}-${idx}`} className="text-center p-2 min-w-[100px]">
                            <div className="flex items-center justify-center gap-1.5">
                              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t?.color }} />
                              <span className="text-gray-400 font-bold">{t?.name}</span>
                            </div>
                          </th>
                        )
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const maxRound = Math.max(draft.current_round, ...state!.picks.map(p => p.round_number), 1)
                      const rows = []
                      for (let r = 1; r <= maxRound; r++) {
                        const reversed = draft.method === 'snake' && r % 2 === 0
                        rows.push(
                          <tr key={r} className="border-b border-gray-800/30">
                            <td className="p-2 text-gray-500 font-bold whitespace-nowrap">
                              {r}
                              {draft.method === 'snake' && (
                                <span className="ml-1 text-[9px] text-amber-500/70" title={reversed ? '역순' : '정순'}>{reversed ? '←' : '→'}</span>
                              )}
                            </td>
                            {draft.draft_order.map((tid, ci) => {
                              const pick = state!.picks.find(p => p.round_number === r && p.team_id === tid)
                              const tColor = teamMap[tid]?.color
                              const isCurrentCell = draft.status === 'in_progress' && r === draft.current_round && tid === currentTeam?.id
                              return (
                                <td key={ci} className={`p-1.5 text-center ${isCurrentCell ? 'bg-emerald-900/40 ring-1 ring-emerald-500/60' : ''}`}>
                                  {pick ? (
                                    <div className="rounded-md py-1" style={{ backgroundColor: tColor ? `${tColor}1f` : undefined, borderLeft: tColor ? `3px solid ${tColor}` : undefined }}>
                                      <div className="text-white font-bold text-xs leading-tight px-1">{pick.player_name}</div>
                                      <div className="text-[9px] text-gray-500">#{pick.pick_number}</div>
                                    </div>
                                  ) : isCurrentCell ? (
                                    <div className="text-emerald-300 text-xs font-bold animate-pulse">선택 중...</div>
                                  ) : (
                                    <div className="text-gray-700">—</div>
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

            {draft.status === 'completed' && (
              <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-xl p-4 text-center">
                <p className="text-emerald-300 font-bold text-base">드래프트 완료</p>
                <p className="text-xs text-gray-500 mt-1">분기 멤버십이 자동 반영되었습니다</p>
                <Link href={`/league/${orgSlug}/${leagueId}/teams`} className="inline-flex items-center gap-1 mt-2 text-sm text-emerald-400 hover:text-emerald-300">
                  팀 구성 페이지로 <ChevronRight size={14} />
                </Link>
              </div>
            )}
          </div>

          {/* 우측 액션 */}
          <div className="space-y-3">
            {draft.status === 'in_progress' && (
              <>
                {authedRole !== 'manager' ? (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
                    {authedRole === 'supervisor'
                      ? <p className="text-amber-300 text-sm font-bold">감독관 — 진행 관전 중</p>
                      : <>
                          <KeyRound size={24} className="mx-auto text-amber-400 mb-2" />
                          <p className="text-white font-bold mb-1">단장 코드를 입력하세요</p>
                          <Button onClick={() => setShowCodeModal(true)} className="w-full bg-amber-600 hover:bg-amber-500 text-white mt-2">코드 입력</Button>
                        </>}
                  </div>
                ) : isMyTurn ? (
                  <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-xl p-4 text-center">
                    <p className="text-emerald-300 font-black text-lg">🏀 내 차례입니다!</p>
                    <p className="text-sm text-gray-300 mt-1">아래 <b className="text-white">남은 선수 성적표</b>에서 선수를 선택해 픽하세요.</p>
                    <p className="text-xs text-gray-500 mt-1">{state?.available_players.length}명 선택 가능 · 랜덤픽(추천) 버튼도 성적표에 있습니다.</p>
                  </div>
                ) : (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
                    <p className="text-gray-300 text-base mb-1">본인 차례가 아닙니다</p>
                    <p className="text-sm text-gray-500">현재: <span className="text-white font-bold">{currentTeam?.name}</span></p>
                  </div>
                )}
              </>
            )}

            {/* 팀장 명단 */}
            {(state?.leaders ?? []).some(l => l.leader_player_id) && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className="font-jersey text-xs text-gray-500 uppercase tracking-widest mb-2 flex items-center gap-1"><Crown size={12} className="text-amber-400" /> 팀장</p>
                <div className="space-y-1.5">
                  {teams.map(t => {
                    const lid = state?.leaders.find(l => l.team_id === t.id)?.leader_player_id
                    if (!lid) return null
                    return (
                      <div key={t.id} className="flex items-center gap-2 text-xs">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.color }} />
                        <span className="text-gray-400 font-bold">{t.name}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
              <p className="font-jersey text-xs text-gray-500 uppercase tracking-widest">진행 현황</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="font-display text-2xl text-white">{draft.total_picks}</p><p className="text-[10px] text-gray-500">총 픽</p></div>
                <div><p className="font-display text-2xl text-amber-300">{draft.current_round}</p><p className="text-[10px] text-gray-500">라운드</p></div>
                <div><p className="font-display text-2xl text-emerald-300">{state?.available_players.length}</p><p className="text-[10px] text-gray-500">남은 선수</p></div>
              </div>
            </div>
          </div>
        </div>

        {/* 완료 시 결과 요약 카드 */}
        {draft.status === 'completed' && (
          <DraftSummaryCard
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
        <DraftTeamStats teams={teams} picks={(state?.picks ?? []).map(p => ({ team_id: p.team_id, player_id: p.player_id }))} leaders={state?.leaders ?? []} stats={prevStats} />
        <div id="draft-stat-table">
          <DraftStatTable leagueId={leagueId} availablePlayers={(state?.available_players ?? []).map(p => ({ id: p.id, name: p.name, number: p.number }))} prevStats={prevStats} prevQuarterId={prevQuarter?.id ?? null} prevQuarterLabel={prevQuarterLabel} canPick={!!isMyTurn} picking={picking !== null} selectedId={selectedPickId} onSelectId={setSelectedPickId} onPick={pickById} onShowStats={p => setStatsPlayer({ id: p.id, name: p.name, number: p.number })} />
        </div>

        {/* 모바일 스티키 바 가림 방지 여백 */}
        {isMyTurn && <div className="lg:hidden h-16" />}

        {/* 모바일 '내 차례' 스티키 액션 바 */}
        {isMyTurn && (
          <div className="lg:hidden fixed bottom-0 inset-x-0 z-[46] bg-gray-900/95 backdrop-blur border-t border-emerald-700/50 p-2.5 flex items-center gap-2">
            {selectedPickId ? (
              <button onClick={() => pickById(selectedPickId)} disabled={picking !== null}
                className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold flex items-center justify-center gap-1.5">
                <Check size={16} /> {state?.available_players.find(p => p.id === selectedPickId)?.name} 픽 확정
              </button>
            ) : (
              <>
                <button onClick={recommendBest} className="flex-1 py-2.5 rounded-lg bg-purple-700 hover:bg-purple-600 text-white font-bold flex items-center justify-center gap-1.5">
                  <Shuffle size={15} /> 랜덤픽(추천)
                </button>
                <button onClick={() => document.getElementById('draft-stat-table')?.scrollIntoView({ behavior: 'smooth' })}
                  className="flex-1 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold flex items-center justify-center gap-1.5">
                  <ChevronDown size={15} /> 성적표에서 선택
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

      {/* 드래프트 채팅 — 코드 인증한 단장/감독관 전용 */}
      {isAuthed && draft && authedCode && (
        <DraftChat leagueId={leagueId} draftId={draft.id} authedCode={authedCode} teams={teams} authedRole={authedRole} authedTeamId={authedTeamId} authedLabel={authedLabel} />
      )}
    </div>
  )
}
