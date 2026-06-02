'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KeyRound, X, Trophy, ChevronRight, Lock, Sparkles, ArrowRight } from 'lucide-react'
import { BasketballLoader } from '@/components/league/BasketballIcons'
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
interface DraftState {
  draft: {
    id: string
    status: 'setup' | 'in_progress' | 'completed'
    draft_order: string[]
    current_pick_index: number
    current_round: number
    total_picks: number
    method: 'snake' | 'linear'
    started_at: string | null
    completed_at: string | null
  } | null
  current_team_id: string | null
  picks: Pick[]
  available_players: Player[]
  teams: Team[]
}

// 폴링 간격 (in_progress 일 때만)
const POLL_INTERVAL_MS = 3000

export default function LeagueDraftPage() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params

  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [selectedQid, setSelectedQid] = useState<string | null>(null)
  const [state, setState] = useState<DraftState | null>(null)
  const [loading, setLoading] = useState(true)

  // 단장 인증
  const [authedTeamId, setAuthedTeamId] = useState<string | null>(null)
  const [authedLabel, setAuthedLabel] = useState<string | null>(null)
  const [authedCode, setAuthedCode] = useState<string | null>(null)
  const [showCodeModal, setShowCodeModal] = useState(false)
  const [codeInput, setCodeInput] = useState('')
  const [authError, setAuthError] = useState<string | null>(null)
  const [authing, setAuthing] = useState(false)

  // 픽 진행
  const [picking, setPicking] = useState<string | null>(null)  // 선택한 player_id

  const sessionKey = selectedQid ? `draft_code_${leagueId}_${selectedQid}` : null

  // 분기 + 인증 정보 로드
  useEffect(() => {
    fetch(`/api/leagues/${leagueId}/quarters`)
      .then(r => r.json())
      .then((qs: Quarter[]) => {
        setQuarters(qs)
        const current = qs.find(q => q.is_current) ?? qs[0]
        if (current) setSelectedQid(current.id)
      })
  }, [leagueId])

  // 분기 변경 시 sessionStorage 에서 인증 정보 복구
  useEffect(() => {
    if (!sessionKey) { setAuthedTeamId(null); setAuthedLabel(null); setAuthedCode(null); return }
    const raw = sessionStorage.getItem(sessionKey)
    if (raw) {
      try {
        const { teamId, label, code } = JSON.parse(raw)
        setAuthedTeamId(teamId)
        setAuthedLabel(label)
        setAuthedCode(code)
      } catch {}
    } else {
      setAuthedTeamId(null); setAuthedLabel(null); setAuthedCode(null)
    }
  }, [sessionKey])

  // 드래프트 상태 fetch
  const fetchState = useCallback(async () => {
    if (!selectedQid) return
    try {
      const r = await fetch(`/api/leagues/${leagueId}/drafts/current?quarterId=${selectedQid}`)
      if (r.ok) {
        const d = await r.json() as DraftState
        setState(d)
      }
    } finally {
      setLoading(false)
    }
  }, [leagueId, selectedQid])

  useEffect(() => { fetchState() }, [fetchState])

  // in_progress 폴링
  const pollRef = useRef<number | null>(null)
  useEffect(() => {
    if (state?.draft?.status === 'in_progress') {
      pollRef.current = window.setInterval(fetchState, POLL_INTERVAL_MS)
      return () => { if (pollRef.current) window.clearInterval(pollRef.current) }
    }
  }, [state?.draft?.status, fetchState])

  // 코드 인증
  async function submitCode() {
    if (!selectedQid || !codeInput.trim()) return
    setAuthing(true)
    setAuthError(null)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/drafts/lookup-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quarter_id: selectedQid, plain_code: codeInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data.matched) {
        setAuthError('코드가 일치하지 않습니다')
        setAuthing(false)
        return
      }
      const { team_id, label } = data.matched as { team_id: string; label: string }
      const plain = codeInput.trim()
      sessionStorage.setItem(sessionKey!, JSON.stringify({ teamId: team_id, label, code: plain }))
      setAuthedTeamId(team_id)
      setAuthedLabel(label)
      setAuthedCode(plain)
      setShowCodeModal(false)
      setCodeInput('')
      const teamName = state?.teams.find(t => t.id === team_id)?.name
      toast.success(`${teamName ?? '팀'} 단장 인증 완료 — ${label}`)
    } finally {
      setAuthing(false)
    }
  }

  function exitDraft() {
    if (sessionKey) sessionStorage.removeItem(sessionKey)
    setAuthedTeamId(null); setAuthedLabel(null); setAuthedCode(null)
    toast.success('인증 해제')
  }

  // 픽 실행
  async function pickPlayer(playerId: string) {
    if (!state?.draft || !authedTeamId || !authedCode) return
    if (state.current_team_id !== authedTeamId) {
      toast.error('본인 차례가 아닙니다')
      return
    }
    if (!confirm(`${state.available_players.find(p => p.id === playerId)?.name} 선수를 픽하시겠습니까?`)) return
    setPicking(playerId)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/drafts/${state.draft.id}/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Draft-Code': authedCode },
        body: JSON.stringify({ team_id: authedTeamId, league_player_id: playerId }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error ?? '픽 실패')
        return
      }
      toast.success('픽 완료')
      fetchState()
    } finally {
      setPicking(null)
    }
  }

  if (loading) {
    return <div className="flex justify-center py-16"><BasketballLoader size={32} /></div>
  }

  const teamMap = Object.fromEntries((state?.teams ?? []).map(t => [t.id, t]))
  const draft = state?.draft
  const currentTeam = state?.current_team_id ? teamMap[state.current_team_id] : null
  const authedTeam = authedTeamId ? teamMap[authedTeamId] : null
  const isMyTurn = authedTeamId && state?.current_team_id === authedTeamId
  const isAuthed = !!authedTeamId

  return (
    <div className="space-y-5">
      {/* 헤더 + 분기 선택 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="font-jersey text-2xl font-black text-white uppercase tracking-wide flex items-center gap-2">
            <Sparkles size={20} className="text-amber-400" />
            드래프트
          </h1>
          {isAuthed ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">인증됨</span>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-900/50 border border-emerald-700/50 text-emerald-300 text-xs font-bold inline-flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: authedTeam?.color }} />
                {authedTeam?.name} · {authedLabel}
              </span>
              <button onClick={exitDraft} className="text-xs text-gray-500 hover:text-red-400 cursor-pointer">해제</button>
            </div>
          ) : (
            <Button onClick={() => setShowCodeModal(true)} className="bg-amber-600 hover:bg-amber-500 text-white text-sm">
              <KeyRound size={14} className="mr-1.5" /> 단장 코드 입력
            </Button>
          )}
        </div>

        {/* 분기 탭 */}
        <div className="flex gap-2 flex-wrap">
          {quarters.map(q => (
            <button key={q.id} onClick={() => setSelectedQid(q.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors cursor-pointer ${
                selectedQid === q.id
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
              }`}>
              {String(q.year).slice(2)}.{q.quarter}Q
              {q.is_current && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}
            </button>
          ))}
        </div>
      </div>

      {/* 코드 입력 모달 */}
      {showCodeModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowCodeModal(false)}>
          <div className="bg-gray-900 border border-amber-700/60 rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-1">
              <Lock size={18} className="text-amber-400" />
              <h3 className="text-white font-black text-lg">단장 코드 입력</h3>
            </div>
            <p className="text-xs text-gray-500 mb-4">어드민이 발급한 코드를 입력하면 본인 팀의 픽 권한이 부여됩니다.</p>
            <Input
              autoFocus
              value={codeInput}
              onChange={e => { setCodeInput(e.target.value); setAuthError(null) }}
              placeholder="예: lakdown-q1-2026"
              className="bg-gray-800 border-gray-700 text-white font-mono"
              onKeyDown={e => e.key === 'Enter' && submitCode()}
            />
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

      {/* 메인 영역 — 상태별 */}
      {!draft ? (
        <div className="bg-gray-900 border border-gray-800 border-dashed rounded-2xl p-12 text-center">
          <Trophy size={32} className="mx-auto text-gray-600 mb-2" />
          <p className="text-gray-500">이 분기는 아직 드래프트 세션이 만들어지지 않았습니다</p>
          <p className="text-xs text-gray-600 mt-1">어드민이 세션을 생성하면 여기에 표시됩니다</p>
        </div>
      ) : draft.status === 'setup' ? (
        <div className="bg-gray-900 border border-blue-700/40 rounded-2xl p-8 text-center">
          <p className="text-blue-300 font-bold">드래프트 준비 중</p>
          <p className="text-xs text-gray-500 mt-1">어드민이 시작 버튼을 누르면 픽이 시작됩니다</p>
        </div>
      ) : (
        // in_progress 또는 completed
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
          {/* 좌측: 픽 보드 */}
          <div className="space-y-3">
            {draft.status === 'in_progress' && currentTeam && (
              <div className={`rounded-xl p-4 border-2 transition-colors ${
                isMyTurn ? 'bg-emerald-900/30 border-emerald-500' : 'bg-gray-900 border-gray-800'
              }`}>
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

            {/* 픽 그리드 — 라운드별 */}
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
                      // 라운드별 픽 매트릭스 만들기
                      const maxRound = Math.max(draft.current_round, ...state.picks.map(p => p.round_number), 1)
                      const matrix: (Pick | null)[][] = []
                      for (let r = 1; r <= maxRound; r++) {
                        const row: (Pick | null)[] = draft.draft_order.map((tid, idx) => {
                          // snake: 짝수 라운드는 역순
                          const actualSlot = draft.method === 'snake' && r % 2 === 0
                            ? draft.draft_order.length - 1 - idx
                            : idx
                          const expectedTid = draft.draft_order[actualSlot]
                          const pick = state.picks.find(p => p.round_number === r && p.team_id === expectedTid)
                          return pick ?? null
                        })
                        matrix.push(row)
                      }
                      return matrix.map((row, ri) => (
                        <tr key={ri} className="border-b border-gray-800/30">
                          <td className="p-2 text-gray-500 font-bold">{ri + 1}</td>
                          {row.map((pick, ci) => {
                            const tid = draft.method === 'snake' && (ri + 1) % 2 === 0
                              ? draft.draft_order[draft.draft_order.length - 1 - ci]
                              : draft.draft_order[ci]
                            const isCurrentCell = draft.status === 'in_progress' &&
                              ri + 1 === draft.current_round && tid === currentTeam?.id
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
                      ))
                    })()}
                  </tbody>
                </table>
              </div>
            </div>

            {draft.status === 'completed' && (
              <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-xl p-4 text-center">
                <p className="text-emerald-300 font-bold text-base">드래프트 완료</p>
                <p className="text-xs text-gray-500 mt-1">분기 멤버십이 자동 반영되었습니다</p>
                <Link
                  href={`/league/${orgSlug}/${leagueId}/teams`}
                  className="inline-flex items-center gap-1 mt-2 text-sm text-emerald-400 hover:text-emerald-300"
                >
                  팀 구성 페이지로 <ChevronRight size={14} />
                </Link>
              </div>
            )}
          </div>

          {/* 우측: 액션 패널 */}
          <div className="space-y-3">
            {draft.status === 'in_progress' && (
              <>
                {!isAuthed ? (
                  <div className="bg-gray-900 border border-amber-700/40 rounded-xl p-5 text-center">
                    <KeyRound size={24} className="mx-auto text-amber-400 mb-2" />
                    <p className="text-white font-bold mb-1">단장 코드를 입력하세요</p>
                    <p className="text-xs text-gray-500 mb-3">코드 입력 시 본인 팀 차례에 픽 가능</p>
                    <Button onClick={() => setShowCodeModal(true)} className="w-full bg-amber-600 hover:bg-amber-500 text-white">
                      코드 입력
                    </Button>
                  </div>
                ) : isMyTurn ? (
                  <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-xl p-3">
                    <p className="font-jersey text-xs text-emerald-400 uppercase tracking-widest mb-2">선수 선택</p>
                    <p className="text-[10px] text-gray-500 mb-2">{state.available_players.length}명 가능</p>
                    <div className="max-h-[60vh] overflow-y-auto space-y-1.5 pr-1">
                      {state.available_players.map(p => (
                        <button
                          key={p.id}
                          onClick={() => pickPlayer(p.id)}
                          disabled={picking !== null}
                          className="w-full text-left bg-gray-800 hover:bg-emerald-900/40 border border-gray-700 hover:border-emerald-600 rounded-lg px-3 py-2 transition-colors cursor-pointer disabled:opacity-40 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {p.number != null && <span className="jersey-num text-xs">{p.number}</span>}
                            <span className="text-white font-bold text-sm truncate">{p.name}</span>
                            {p.position && <span className="text-[10px] text-gray-500">{p.position}</span>}
                            {p.plus_one && <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-amber-500/20 text-amber-300">+1</span>}
                          </div>
                          {picking === p.id ? (
                            <BasketballLoader size={14} />
                          ) : (
                            <ArrowRight size={12} className="text-emerald-400 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center">
                    <p className="text-gray-400 text-sm mb-1">본인 차례가 아닙니다</p>
                    <p className="text-xs text-gray-500">
                      현재: <span className="text-white font-bold">{currentTeam?.name}</span>
                    </p>
                  </div>
                )}
              </>
            )}

            {/* 픽 통계 카드 */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
              <p className="font-jersey text-xs text-gray-500 uppercase tracking-widest">진행 현황</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="font-display text-2xl text-white">{draft.total_picks}</p>
                  <p className="text-[10px] text-gray-500">총 픽</p>
                </div>
                <div>
                  <p className="font-display text-2xl text-amber-300">{draft.current_round}</p>
                  <p className="text-[10px] text-gray-500">라운드</p>
                </div>
                <div>
                  <p className="font-display text-2xl text-emerald-300">{state.available_players.length}</p>
                  <p className="text-[10px] text-gray-500">남은 선수</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
