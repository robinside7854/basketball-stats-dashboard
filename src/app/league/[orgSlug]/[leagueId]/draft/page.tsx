'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KeyRound, Trophy, ChevronRight, Lock, Sparkles, ArrowRight, CheckCircle2, Circle, Dice5, Crown, ShieldCheck, Settings2 } from 'lucide-react'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import DraftCodeManager from '@/components/league/DraftCodeManager'
import DraftSessionControl from '@/components/league/DraftSessionControl'
import DraftChat from '@/components/league/DraftChat'
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
    status: 'setup' | 'ready_check' | 'in_progress' | 'completed'
    draft_order: string[]
    current_pick_index: number
    current_round: number
    total_picks: number
    method: 'snake' | 'linear'
    ready_state: Record<string, boolean>
    lottery_odds: Record<string, number> | null
    lottery_done: boolean
    started_at: string | null
    completed_at: string | null
  } | null
  current_team_id: string | null
  picks: Pick[]
  available_players: Player[]
  pool_size?: number
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
  const revealTimer = useRef<number | null>(null)
  // 추첨 공개 (한 번만)
  const [showLottery, setShowLottery] = useState(false)
  const lotteryShownRef = useRef(false)

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

  // 새 픽 감지 → 히어로 공개
  useEffect(() => {
    const picks = state?.picks ?? []
    if (picks.length === 0) { lastPickRef.current = 0; return }
    const latest = picks[picks.length - 1]
    if (lastPickRef.current === 0) { lastPickRef.current = latest.pick_number; return }
    if (latest.pick_number > lastPickRef.current) {
      lastPickRef.current = latest.pick_number
      setReveal(latest)
      if (revealTimer.current) window.clearTimeout(revealTimer.current)
      revealTimer.current = window.setTimeout(() => setReveal(null), 4500)
    }
  }, [state?.picks])

  // 추첨 완료 감지 → 순서 공개 (한 번만)
  useEffect(() => {
    if (state?.draft?.lottery_done && state.draft.draft_order.length > 0 && !lotteryShownRef.current) {
      lotteryShownRef.current = true
      setShowLottery(true)
      window.setTimeout(() => setShowLottery(false), 6000)
    }
  }, [state?.draft?.lottery_done, state?.draft?.draft_order.length])

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

  async function pickPlayer(playerId: string) {
    if (!state?.draft || !authedTeamId || !authedCode || authedRole !== 'manager') return
    if (state.current_team_id !== authedTeamId) { toast.error('본인 차례가 아닙니다'); return }
    const pname = state.available_players.find(p => p.id === playerId)?.name
    if (!confirm(`${pname} 선수를 픽하시겠습니까?`)) return
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

  return (
    <div className="space-y-5">
      {/* 픽 공개 히어로 오버레이 */}
      {reveal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-4"
              style={{ backgroundColor: `${teamMap[reveal.team_id]?.color}22`, border: `1px solid ${teamMap[reveal.team_id]?.color}` }}>
              <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: teamMap[reveal.team_id]?.color }} />
              <span className="text-white font-black tracking-wide">{teamMap[reveal.team_id]?.name}</span>
              <span className="text-gray-400 text-sm">· {reveal.round_number}R #{reveal.pick_number}</span>
            </div>
            <p className="font-jersey text-sm uppercase tracking-[0.3em] text-amber-400 mb-2">DRAFTED</p>
            <h2 className="font-display text-6xl sm:text-8xl font-black text-white drop-shadow-[0_0_30px_rgba(245,158,11,0.5)]">
              {reveal.player_name}
            </h2>
            {reveal.player_number != null && (
              <p className="jersey-num text-3xl text-amber-300 mt-3">#{reveal.player_number}</p>
            )}
          </div>
        </div>
      )}

      {/* 추첨 결과 공개 오버레이 */}
      {showLottery && draft?.draft_order && (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-300" onClick={() => setShowLottery(false)}>
          <div className="text-center max-w-lg w-full">
            <Dice5 size={40} className="mx-auto text-amber-400 mb-3 animate-bounce" />
            <p className="font-jersey text-sm uppercase tracking-[0.3em] text-amber-400 mb-1">LOTTERY RESULT</p>
            <h2 className="text-2xl font-black text-white mb-5">드래프트 픽 순서 확정</h2>
            <div className="space-y-2">
              {draft.draft_order.map((tid, idx) => {
                const t = teamMap[tid]
                const odd = draft.lottery_odds?.[tid]
                return (
                  <div key={`${tid}-${idx}`} className="flex items-center gap-3 bg-gray-900/80 border border-gray-700 rounded-xl px-4 py-3"
                    style={{ animationDelay: `${idx * 150}ms` }}>
                    <span className="font-display text-3xl text-amber-300 w-10">{idx + 1}</span>
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: t?.color }} />
                    <span className="text-white font-black text-lg flex-1 text-left">{t?.name}</span>
                    {odd != null && <span className="text-xs text-gray-400">1픽 확률 {(odd * 100).toFixed(0)}%</span>}
                  </div>
                )
              })}
            </div>
            <p className="text-xs text-gray-500 mt-4">탭하여 닫기 · 지난 분기 승률 기반 가중 추첨</p>
          </div>
        </div>
      )}

      {/* 헤더 + 분기 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-jersey text-2xl font-black text-white uppercase tracking-wide flex items-center gap-2">
            <Sparkles size={20} className="text-amber-400" /> 드래프트
          </h1>
          {isAuthed ? (
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 ${
                authedRole === 'supervisor' ? 'bg-amber-900/50 border border-amber-700/50 text-amber-300' : 'bg-emerald-900/50 border border-emerald-700/50 text-emerald-300'
              }`}>
                {authedRole === 'supervisor' ? <ShieldCheck size={12} /> : <div className="w-2 h-2 rounded-full" style={{ backgroundColor: authedTeam?.color }} />}
                {authedRole === 'supervisor' ? '감독관' : authedTeam?.name} · {authedLabel}
              </span>
              <button onClick={exitAuth} className="text-xs text-gray-500 hover:text-red-400 cursor-pointer">해제</button>
            </div>
          ) : (
            <Button onClick={() => setShowCodeModal(true)} className="bg-amber-600 hover:bg-amber-500 text-white text-sm">
              <KeyRound size={14} className="mr-1.5" /> 코드 입력
            </Button>
          )}
        </div>

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
      </div>

      {/* 관리 패널 — 편집 모드(리그 PIN) 에서만 표시 */}
      {isEditMode && selectedQid && (
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
          <Trophy size={32} className="mx-auto text-gray-600 mb-2" />
          <p className="text-gray-500">이 분기는 아직 드래프트 세션이 만들어지지 않았습니다</p>
          <p className="text-xs text-gray-600 mt-1">어드민이 세션을 생성하면 여기에 표시됩니다</p>
        </div>
      ) : draft.status === 'setup' ? (
        <div className="bg-gray-900 border border-blue-700/40 rounded-2xl p-8 text-center space-y-3">
          <p className="text-blue-300 font-bold">드래프트 준비 중</p>
          <p className="text-xs text-gray-500">감독관 또는 어드민이 준비 체크를 시작하면 진행됩니다</p>
          {authedRole === 'supervisor' && (
            <Button onClick={openReady} disabled={acting} className="bg-amber-600 hover:bg-amber-500 text-white">
              <Dice5 size={14} className="mr-1.5" /> 준비 체크 시작
            </Button>
          )}
        </div>
      ) : draft.status === 'ready_check' ? (
        <div className="bg-gray-900 border border-amber-700/40 rounded-2xl p-6 space-y-5">
          <div className="text-center">
            <p className="font-jersey text-sm uppercase tracking-[0.2em] text-amber-400">READY CHECK</p>
            <p className="text-white font-black text-xl mt-1">모든 참가자 준비 대기</p>
            <p className="text-xs text-gray-500 mt-1">단장 3명 + 감독관이 모두 준비하면 추첨을 진행할 수 있습니다</p>
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
            <p className="text-center text-xs text-gray-500">코드를 입력하면 준비 버튼이 표시됩니다</p>
          )}
        </div>
      ) : (
        // in_progress / completed
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
          {/* 좌측 픽 보드 */}
          <div className="space-y-3">
            {draft.status === 'in_progress' && currentTeam && (
              <div className={`rounded-xl p-4 border-2 transition-colors ${isMyTurn ? 'bg-emerald-900/30 border-emerald-500' : 'bg-gray-900 border-gray-800'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-4 h-4 rounded-full ${isMyTurn ? 'animate-pulse' : ''}`} style={{ backgroundColor: currentTeam.color }} />
                  <div className="flex-1">
                    <p className="font-jersey text-[10px] uppercase tracking-widest text-gray-500">현재 차례</p>
                    <p className="font-black text-xl text-white">
                      {currentTeam.name}
                      {isMyTurn && <span className="ml-2 text-emerald-400 text-sm">← 내 차례!</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-3xl text-amber-300">{draft.total_picks + 1}</p>
                    <p className="text-[10px] text-gray-500 font-bold">PICK</p>
                  </div>
                </div>
              </div>
            )}

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
                              const isCurrentCell = draft.status === 'in_progress' && r === draft.current_round && tid === currentTeam?.id
                              return (
                                <td key={ci} className={`p-1.5 text-center ${isCurrentCell ? 'bg-emerald-900/30' : ''}`}>
                                  {pick ? (
                                    <div>
                                      <div className="text-white font-bold text-xs">{pick.player_name}</div>
                                      <div className="text-[9px] text-gray-600">#{pick.pick_number}</div>
                                    </div>
                                  ) : isCurrentCell ? (
                                    <div className="text-emerald-400 text-xs font-bold animate-pulse">선택 중...</div>
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
                  <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-xl p-3">
                    <p className="font-jersey text-xs text-emerald-400 uppercase tracking-widest mb-2">선수 선택</p>
                    <p className="text-[10px] text-gray-500 mb-2">{state?.available_players.length}명 가능</p>
                    <div className="max-h-[60vh] overflow-y-auto space-y-1.5 pr-1">
                      {state?.available_players.map(p => (
                        <button key={p.id} onClick={() => pickPlayer(p.id)} disabled={picking !== null}
                          className="w-full text-left bg-gray-800 hover:bg-emerald-900/40 border border-gray-700 hover:border-emerald-600 rounded-lg px-3 py-2 transition-colors cursor-pointer disabled:opacity-40 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {p.number != null && <span className="jersey-num text-xs">{p.number}</span>}
                            <span className="text-white font-bold text-sm truncate">{p.name}</span>
                            {p.position && <span className="text-[10px] text-gray-500">{p.position}</span>}
                            {p.plus_one && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-500/20 text-amber-300">+1</span>}
                          </div>
                          {picking === p.id ? <BasketballLoader size={14} /> : <ArrowRight size={12} className="text-emerald-400 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
                    <p className="text-gray-400 text-sm mb-1">본인 차례가 아닙니다</p>
                    <p className="text-xs text-gray-500">현재: <span className="text-white font-bold">{currentTeam?.name}</span></p>
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
      )}

      {/* 드래프트 채팅 — 코드 인증한 단장/감독관 전용 */}
      {isAuthed && draft && authedCode && (
        <DraftChat leagueId={leagueId} draftId={draft.id} authedCode={authedCode} teams={teams} authedRole={authedRole} authedTeamId={authedTeamId} authedLabel={authedLabel} />
      )}
    </div>
  )
}
