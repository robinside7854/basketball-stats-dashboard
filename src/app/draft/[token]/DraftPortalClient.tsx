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

import { useState, useEffect, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KeyRound, Trophy, Crown, ShieldCheck, CheckCircle2, LogOut, Lock, Timer } from 'lucide-react'
import DraftSessionControl from '@/components/league/DraftSessionControl'
import DraftChat from '@/components/league/DraftChat'

interface Team { id: string; name: string; color: string }
interface Player { id: string; name: string; number: number | null; position: string | null; plus_one: boolean }
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
    status: 'setup' | 'ready_check' | 'in_progress' | 'completed'
    draft_order: string[]
    current_pick_index: number
    current_round: number
    total_picks: number
    method: 'snake' | 'linear'
    started_at: string | null
    completed_at: string | null
    pick_seconds: number
  } | null
  current_team_id: string | null
  picks: Pick[]
  available_players: Player[]
  teams: Team[]
}

interface SessionAuth {
  codeId: string
  role: 'manager' | 'supervisor'
  teamId: string | null
  label: string
  plain: string // 헤더로 재사용
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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

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
      setState(d)
    } catch { /* ignore */ }
  }, [leagueId, quarterId])

  useEffect(() => {
    fetchState()
    pollRef.current = setInterval(fetchState, POLL_INTERVAL_MS)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
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
      setShowCodeModal(false)
      setCodeInput('')
      setSelectedPlayerId(null)
      const teamName = state?.teams.find(t => t.id === sa.teamId)?.name
      toast.success(
        sa.role === 'supervisor'
          ? `✅ 감독관 인증: ${sa.label}`
          : `✅ ${teamName ?? ''} 단장 인증: ${sa.label}`,
        { duration: 4000 },
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

  // 픽 시간 변경 (감독관 권한)
  async function changePickSeconds(newSeconds: number) {
    if (!auth || auth.role !== 'supervisor' || !state?.draft) return
    const r = await fetch(`/api/admin/leagues/${leagueId}/drafts/${draftId}/pick-seconds`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Draft-Code': auth.plain },
      body: JSON.stringify({ pick_seconds: newSeconds }),
    })
    const data = await r.json()
    if (!r.ok) {
      toast.error(data.error ?? '픽 시간 변경 실패')
    } else {
      toast.success(`픽 시간이 ${newSeconds}초로 변경되었습니다`)
      fetchState()
    }
  }

  async function makePick() {
    if (!auth || auth.role !== 'manager' || !auth.teamId || !selectedPlayerId) return
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
        toast.success('픽 완료')
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

  // 라운드 그룹핑
  const totalRounds = draft ? Math.max(1, Math.ceil(draft.total_picks / Math.max(draft.draft_order.length, 1))) : 0
  const picksByRound: Record<number, Pick[]> = {}
  for (const p of state?.picks ?? []) {
    (picksByRound[p.round_number] ||= []).push(p)
  }

  return (
    <div className="min-h-screen p-4 sm:p-6 max-w-7xl mx-auto">
      {/* 상단 헤더 */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Trophy className="text-amber-400 w-7 h-7" />
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight">{leagueName} 드래프트</h1>
            <p className="text-xs text-gray-500">{year ? `${year}.${quarter}Q` : ''} {orgSlug && <span className="ml-1">· {orgSlug}</span>}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!auth ? (
            <Button onClick={openCodeModal} className="bg-amber-600 hover:bg-amber-500 text-white text-xs sm:text-sm">
              <KeyRound size={14} className="mr-1.5" /> 단장/감독관 입장
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <div className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border ${auth.role === 'supervisor' ? 'bg-amber-950/40 border-amber-700/50 text-amber-300' : 'bg-blue-950/40 border-blue-700/50 text-blue-300'}`}>
                {auth.role === 'supervisor' ? <ShieldCheck size={12} /> : <Crown size={12} />}
                <span>{auth.label}</span>
                {myTeam && <span className="opacity-70">· {myTeam.name}</span>}
              </div>
              <button onClick={logout} className="p-1.5 rounded-md text-gray-500 hover:text-white hover:bg-gray-800 cursor-pointer" title="인증 해제">
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 상태 배지 */}
      {!draft ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg">아직 드래프트 세션이 생성되지 않았습니다</p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <StatusBadge status={draft.status} />
            {draft.method === 'snake' && <Tag color="purple">스네이크</Tag>}
            {draft.method === 'linear' && <Tag color="blue">리니어</Tag>}
            {draft.status === 'in_progress' && currentTeam && (
              <Tag color="amber">
                <Crown size={11} className="inline mr-1" />
                현재: <span className="font-bold ml-1">{currentTeam.name}</span>
              </Tag>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
            {/* 픽 보드 */}
            <section className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 space-y-4">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">픽 보드</h2>
              {draft.status === 'setup' || draft.status === 'ready_check' ? (
                <div className="text-center py-12 text-gray-500">감독관이 시작을 누르면 픽이 진행됩니다</div>
              ) : (
                <div className="space-y-4">
                  {Array.from({ length: Math.max(totalRounds, 1) }).map((_, idx) => {
                    const round = idx + 1
                    const order = draft.draft_order
                    const orderForRound = draft.method === 'snake' && round % 2 === 0 ? [...order].reverse() : order
                    return (
                      <div key={round}>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2">Round {round}</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                          {orderForRound.map((teamId, i) => {
                            const pickNumber = (round - 1) * order.length + i + 1
                            const team = teamsById[teamId]
                            const pick = (picksByRound[round] ?? []).find(p => p.pick_number === pickNumber)
                            const isCurrent = pickNumber === draft.current_pick_index + 1 && draft.status === 'in_progress'
                            return (
                              <div key={pickNumber}
                                className={`rounded-lg p-2.5 border transition-all ${
                                  pick ? 'bg-gray-800/60 border-gray-700' :
                                  isCurrent ? 'bg-amber-950/60 border-amber-500 ring-2 ring-amber-500/40 animate-pulse' :
                                  'bg-gray-900/40 border-gray-800 opacity-60'
                                }`}
                                style={team ? { borderLeftColor: team.color, borderLeftWidth: 3 } : undefined}
                              >
                                <p className="text-[9px] text-gray-500 font-bold">#{pickNumber} · {team?.name ?? '?'}</p>
                                {pick ? (
                                  <p className="text-sm font-bold text-white mt-1 truncate">
                                    {pick.player_number != null && <span className="text-amber-300 mr-1">#{pick.player_number}</span>}
                                    {pick.player_name}
                                  </p>
                                ) : isCurrent ? (
                                  <p className="text-xs text-amber-300 mt-1">선택 중...</p>
                                ) : (
                                  <p className="text-xs text-gray-600 mt-1">—</p>
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
                  <div className="bg-amber-950/40 border border-amber-700/50 rounded-2xl p-4 space-y-3">
                    <p className="text-amber-300 text-sm font-bold flex items-center gap-1.5">
                      <CheckCircle2 size={14} /> 본인 차례입니다
                    </p>
                    <p className="text-xs text-gray-400">선수를 선택하고 픽 확정을 누르세요.</p>
                    <PlayerPicker
                      players={state?.available_players ?? []}
                      selectedId={selectedPlayerId}
                      onSelect={setSelectedPlayerId}
                    />
                    <Button
                      onClick={makePick}
                      disabled={!selectedPlayerId || picking}
                      className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold disabled:opacity-40"
                    >
                      {picking ? '픽 등록 중...' : '픽 확정'}
                    </Button>
                  </div>
                ) : (
                  <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 text-center">
                    <Lock className="w-6 h-6 text-gray-600 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">본인 차례가 아닙니다</p>
                    {currentTeam && <p className="text-xs text-gray-500 mt-1"><span className="font-bold text-white">{currentTeam.name}</span> 단장 차례</p>}
                  </div>
                )
              )}

              {draft.status === 'completed' && (
                <div className="bg-emerald-950/40 border border-emerald-700/50 rounded-2xl p-4 text-center">
                  <CheckCircle2 className="w-7 h-7 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm text-emerald-300 font-bold">드래프트 완료</p>
                  <p className="text-xs text-gray-400 mt-1">멤버십이 즉시 반영되었습니다</p>
                  {orgSlug && (
                    <Link href={`/league/${orgSlug}/${leagueId}/teams`} className="inline-block mt-3 text-xs px-3 py-1.5 rounded-md bg-blue-900/40 hover:bg-blue-800 text-blue-300 font-bold">
                      팀 구성 보기 →
                    </Link>
                  )}
                </div>
              )}

              {!auth && (draft.status === 'setup' || draft.status === 'in_progress') && (
                <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-4 text-center text-xs text-gray-500">
                  단장/감독관이라면 우측 상단에서 코드를 입력하세요.
                </div>
              )}

              {auth?.role === 'supervisor' && draft.status !== 'completed' && (
                <PickSecondsCard
                  currentSeconds={draft.pick_seconds ?? 80}
                  onChange={changePickSeconds}
                />
              )}

              {auth?.role === 'supervisor' && (
                <div className="bg-amber-950/30 border border-amber-700/40 rounded-2xl p-4 space-y-1">
                  <p className="text-amber-300 text-sm font-bold flex items-center gap-1.5">
                    <ShieldCheck size={14} /> 감독관 모드
                  </p>
                  <p className="text-xs text-gray-400">아래 세션 관리 패널에서 풀·팀장·추첨·시작/완료 등 모든 진행을 제어할 수 있습니다.</p>
                </div>
              )}
            </aside>
          </div>

          {/* 감독관 전용 — 세션 관리 패널 (방 안에서 모든 진행 제어) */}
          {auth?.role === 'supervisor' && (
            <div className="mt-6 space-y-3">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                <ShieldCheck size={14} className="text-amber-400" /> 세션 관리
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

      {/* 채팅 — 인증된 사용자에게만 floating */}
      {auth && state?.draft && (
        <DraftChat
          leagueId={leagueId}
          draftId={state.draft.id}
          authedCode={auth.plain}
          teams={state.teams ?? []}
          authedRole={auth.role}
          authedTeamId={auth.teamId}
          authedLabel={auth.label}
        />
      )}

      {/* 코드 입력 모달 */}
      {showCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={closeCodeModal}>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-black text-lg mb-1">단장/감독관 입장</h3>
            <p className="text-xs text-gray-500 mb-4">어드민에게 발급받은 코드를 입력하세요. (대소문자 구분)</p>
            <Input
              value={codeInput}
              onChange={e => setCodeInput(e.target.value)}
              placeholder="코드"
              className="bg-gray-800 border-gray-700 text-white text-base font-mono tracking-wider"
              onKeyDown={e => e.key === 'Enter' && submitCode()}
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <Button onClick={closeCodeModal} variant="outline" className="flex-1 bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700">취소</Button>
              <Button onClick={submitCode} disabled={authing} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white">
                {authing ? '확인 중...' : '입장'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PickSecondsCard({ currentSeconds, onChange }: { currentSeconds: number; onChange: (n: number) => Promise<void> }) {
  const [val, setVal] = useState(String(currentSeconds))
  const [saving, setSaving] = useState(false)
  useEffect(() => { setVal(String(currentSeconds)) }, [currentSeconds])
  async function submit() {
    const n = parseInt(val, 10)
    if (!Number.isFinite(n) || n < 30 || n > 600) { toast.error('30~600초 사이의 숫자'); return }
    if (n === currentSeconds) return
    setSaving(true)
    await onChange(n)
    setSaving(false)
  }
  return (
    <div className="bg-blue-950/30 border border-blue-800/40 rounded-2xl p-4 space-y-2">
      <p className="text-blue-300 text-sm font-bold flex items-center gap-1.5">
        <Timer size={14} /> 픽 시간 (초)
      </p>
      <p className="text-[10px] text-gray-500">단장들과 채팅 합의 후 변경 — 다음 픽부터 적용됩니다.</p>
      <div className="flex gap-1.5">
        <Input
          type="number"
          min={30}
          max={600}
          step={5}
          value={val}
          onChange={e => setVal(e.target.value)}
          className="bg-gray-900 border-gray-700 text-white text-sm h-8 flex-1 font-mono"
        />
        <Button onClick={submit} disabled={saving || parseInt(val, 10) === currentSeconds} className="bg-blue-600 hover:bg-blue-500 text-white h-8 text-xs">
          {saving ? '저장 중...' : '적용'}
        </Button>
      </div>
      <p className="text-[10px] text-gray-600">현재: {currentSeconds}초</p>
    </div>
  )
}

function StatusBadge({ status }: { status: 'setup' | 'ready_check' | 'in_progress' | 'completed' }) {
  const map = {
    setup: { label: '준비', color: 'bg-gray-800 text-gray-400 border-gray-700' },
    ready_check: { label: '레디 체크', color: 'bg-blue-950/60 text-blue-300 border-blue-700/50' },
    in_progress: { label: '진행 중', color: 'bg-amber-950/60 text-amber-300 border-amber-700/50' },
    completed: { label: '완료', color: 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50' },
  } as const
  const v = map[status]
  return <span className={`px-2.5 py-1 rounded-md border text-[11px] font-bold uppercase tracking-wider ${v.color}`}>{v.label}</span>
}

function Tag({ color, children }: { color: 'amber' | 'purple' | 'blue' | 'gray'; children: React.ReactNode }) {
  const colors = {
    amber: 'bg-amber-950/40 text-amber-300 border-amber-700/40',
    purple: 'bg-purple-950/40 text-purple-300 border-purple-700/40',
    blue: 'bg-blue-950/40 text-blue-300 border-blue-700/40',
    gray: 'bg-gray-800 text-gray-400 border-gray-700',
  }
  return <span className={`px-2.5 py-1 rounded-md border text-[11px] font-bold ${colors[color]}`}>{children}</span>
}

function PlayerPicker({ players, selectedId, onSelect }: { players: Player[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const filtered = players.filter(p => !query.trim() || p.name.includes(query) || (p.number != null && String(p.number).includes(query)))
  return (
    <div className="space-y-2">
      <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="이름·번호 검색" className="bg-gray-900 border-gray-700 text-white h-8 text-xs" />
      <div className="max-h-72 overflow-y-auto space-y-1 -mr-2 pr-2">
        {filtered.length === 0 && <p className="text-center text-xs text-gray-500 py-6">선수가 없습니다</p>}
        {filtered.map(p => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`w-full text-left px-3 py-2 rounded-md border transition-colors cursor-pointer ${
              selectedId === p.id
                ? 'bg-amber-950/60 border-amber-500 text-white'
                : 'bg-gray-900/40 border-gray-800 text-gray-300 hover:border-gray-600'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-sm">
                {p.number != null && <span className="text-amber-300 mr-1.5">#{p.number}</span>}
                {p.name}
              </span>
              {p.position && <span className="text-[10px] text-gray-500 font-mono">{p.position}</span>}
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
