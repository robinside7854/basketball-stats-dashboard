'use client'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Play, Square, RotateCcw, GripVertical, ArrowUp, ArrowDown } from 'lucide-react'

interface Team {
  id: string
  name: string
  color: string
}

interface Draft {
  id: string
  league_id: string
  quarter_id: string
  status: 'setup' | 'in_progress' | 'completed'
  draft_order: string[]
  current_pick_index: number
  current_round: number
  total_picks: number
  method: 'snake' | 'linear'
  started_at: string | null
  completed_at: string | null
}

interface Pick {
  id: string
  pick_number: number
  round_number: number
  team_id: string
  league_player_id: string
  picked_at: string
}

interface Props {
  leagueId: string
  quarterId: string
  teams: Team[]
}

export default function DraftSessionControl({ leagueId, quarterId, teams }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [loading, setLoading] = useState(true)
  // Setup 화면용 — 픽 순서 + 메서드
  const [setupOrder, setSetupOrder] = useState<string[]>([])
  const [setupMethod, setSetupMethod] = useState<'snake' | 'linear'>('snake')
  const [acting, setActing] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/admin/leagues/${leagueId}/drafts?quarterId=${quarterId}`)
      if (r.ok) {
        const d = await r.json()
        setDraft(d.draft ?? null)
        setPicks(d.picks ?? [])
      } else {
        setDraft(null)
        setPicks([])
      }
    } finally {
      setLoading(false)
    }
  }, [leagueId, quarterId])

  useEffect(() => { fetchData() }, [fetchData])

  // 세션 없을 때 setup 순서 초기화 — teams 기준 기본 순서
  useEffect(() => {
    if (!draft && teams.length > 0) {
      setSetupOrder(teams.map(t => t.id))
    }
  }, [draft, teams])

  async function createSession() {
    if (setupOrder.length === 0) { toast.error('픽 순서를 설정하세요'); return }
    setActing(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quarter_id: quarterId, draft_order: setupOrder, method: setupMethod }),
    })
    setActing(false)
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? '생성 실패'); return }
    toast.success('드래프트 세션 생성 — 시작 버튼을 누르면 픽 시작')
    fetchData()
  }

  async function startSession() {
    if (!draft) return
    if (!confirm('드래프트를 시작하시겠습니까? 시작 후엔 단장이 픽할 수 있습니다.')) return
    setActing(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/drafts/${draft.id}/start`, { method: 'POST' })
    setActing(false)
    if (res.ok) { toast.success('드래프트 시작'); fetchData() }
    else { const d = await res.json(); toast.error(d.error ?? '시작 실패') }
  }

  async function completeSession() {
    if (!draft) return
    if (!confirm('드래프트를 강제 종료하시겠습니까? 진행 중인 픽은 멈춥니다.')) return
    setActing(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/drafts/${draft.id}/complete`, { method: 'POST' })
    setActing(false)
    if (res.ok) { toast.success('드래프트 종료'); fetchData() }
    else { const d = await res.json(); toast.error(d.error ?? '종료 실패') }
  }

  async function resetSession() {
    if (!draft) return
    if (!confirm(`정말 리셋하시겠습니까?\n\n- 픽 ${picks.length}건 모두 삭제\n- 이 분기 정규 멤버십 중 드래프트로 만들어진 행도 제거\n- 세션 상태 → setup 으로 되돌림`)) return
    setActing(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/drafts/${draft.id}/reset`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delete_picks: true }),
    })
    setActing(false)
    if (res.ok) { toast.success('리셋 완료'); fetchData() }
    else { const d = await res.json(); toast.error(d.error ?? '리셋 실패') }
  }

  function moveOrder(idx: number, delta: -1 | 1) {
    setSetupOrder(prev => {
      const next = [...prev]
      const newIdx = idx + delta
      if (newIdx < 0 || newIdx >= next.length) return prev
      ;[next[idx], next[newIdx]] = [next[newIdx], next[idx]]
      return next
    })
  }

  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))

  // 현재 차례 팀 계산 (snake/linear)
  function currentTeam(): Team | null {
    if (!draft || draft.status !== 'in_progress') return null
    const order = draft.draft_order
    if (!order || order.length === 0) return null
    const idx = draft.current_pick_index
    const tid = draft.method === 'snake' && draft.current_round % 2 === 0
      ? order[order.length - 1 - idx]
      : order[idx]
    return teamMap[tid] ?? null
  }

  if (loading) {
    return <div className="text-center text-gray-500 py-8">로딩 중...</div>
  }

  // 세션 없음 — 생성 UI
  if (!draft) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
        <div>
          <h3 className="font-bold text-white text-base mb-1">드래프트 세션 생성</h3>
          <p className="text-xs text-gray-500">픽 순서와 방식을 정하고 세션을 생성하세요. 시작은 별도 버튼.</p>
        </div>

        {/* 메서드 선택 */}
        <div>
          <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-1.5">픽 방식</label>
          <div className="flex gap-2">
            {(['snake', 'linear'] as const).map(m => (
              <button
                key={m}
                onClick={() => setSetupMethod(m)}
                className={`flex-1 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                  setupMethod === m ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {m === 'snake' ? '🐍 Snake (지그재그)' : '➡ Linear (동일순서)'}
              </button>
            ))}
          </div>
        </div>

        {/* 픽 순서 */}
        <div>
          <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-1.5">픽 순서 (1라운드)</label>
          <div className="space-y-1.5">
            {setupOrder.map((tid, idx) => {
              const t = teamMap[tid]
              return (
                <div
                  key={tid}
                  className="flex items-center gap-2 bg-gray-800/60 border border-gray-700/50 rounded-lg px-3 py-2"
                >
                  <GripVertical size={14} className="text-gray-600" />
                  <span className="text-sm font-bold text-gray-500 w-5">{idx + 1}</span>
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t?.color }} />
                  <span className="flex-1 text-white font-bold text-sm">{t?.name ?? '?'}</span>
                  <button onClick={() => moveOrder(idx, -1)} disabled={idx === 0}
                    className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed">
                    <ArrowUp size={14} />
                  </button>
                  <button onClick={() => moveOrder(idx, 1)} disabled={idx === setupOrder.length - 1}
                    className="p-1 rounded text-gray-400 hover:text-white disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed">
                    <ArrowDown size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        <Button onClick={createSession} disabled={acting} className="w-full bg-amber-600 hover:bg-amber-500 text-white">
          드래프트 세션 생성
        </Button>
      </div>
    )
  }

  // 세션 있음 — 상태별 UI
  const curTeam = currentTeam()

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-white text-base">드래프트 세션</h3>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              draft.status === 'in_progress' ? 'bg-emerald-900/60 border border-emerald-700/50 text-emerald-300' :
              draft.status === 'completed' ? 'bg-gray-800 border border-gray-700 text-gray-400' :
              'bg-blue-900/60 border border-blue-700/50 text-blue-300'
            }`}>
              {draft.status === 'in_progress' ? '진행 중' : draft.status === 'completed' ? '완료' : '준비'}
            </span>
            <span className="text-[10px] text-gray-500">{draft.method === 'snake' ? 'Snake' : 'Linear'}</span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {draft.total_picks}픽 완료 · {draft.draft_order.length}팀 · 현재 {draft.current_round}라운드
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {draft.status === 'setup' && (
            <Button onClick={startSession} disabled={acting} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8">
              <Play size={12} className="mr-1" /> 시작
            </Button>
          )}
          {draft.status === 'in_progress' && (
            <Button onClick={completeSession} disabled={acting} className="bg-orange-600 hover:bg-orange-500 text-white text-xs h-8">
              <Square size={12} className="mr-1" /> 강제 종료
            </Button>
          )}
          <Button onClick={resetSession} disabled={acting} variant="destructive" className="text-xs h-8">
            <RotateCcw size={12} className="mr-1" /> 리셋
          </Button>
        </div>
      </div>

      {/* 진행 중 — 현재 차례 강조 */}
      {draft.status === 'in_progress' && curTeam && (
        <div className="bg-emerald-950/40 border border-emerald-700/40 rounded-lg px-4 py-3 flex items-center gap-3">
          <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: curTeam.color }} />
          <div className="flex-1">
            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">현재 차례</p>
            <p className="text-base font-black text-white">{curTeam.name} 단장 픽 대기 중</p>
          </div>
          <p className="text-xs text-gray-500">전체 {draft.total_picks + 1}번째 픽</p>
        </div>
      )}

      {/* 픽 순서 표시 */}
      <div>
        <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">픽 순서</p>
        <div className="flex flex-wrap gap-1.5">
          {draft.draft_order.map((tid, idx) => {
            const t = teamMap[tid]
            const isCurrent = curTeam?.id === tid
            return (
              <div key={`${tid}-${idx}`} className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs ${
                isCurrent ? 'bg-emerald-900/40 border-emerald-700' : 'bg-gray-800 border-gray-700'
              }`}>
                <span className="text-gray-500 font-bold">{idx + 1}.</span>
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t?.color }} />
                <span className="text-gray-300 font-bold">{t?.name ?? '?'}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* 최근 픽 미리보기 */}
      {picks.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">최근 픽 (최신 5)</p>
          <div className="space-y-1">
            {picks.slice(-5).reverse().map(p => {
              const t = teamMap[p.team_id]
              return (
                <div key={p.id} className="flex items-center gap-2 bg-gray-800/40 rounded px-2 py-1.5 text-xs">
                  <span className="text-gray-500 font-bold w-12">#{p.pick_number}</span>
                  <span className="text-gray-500 w-12">R{p.round_number}</span>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t?.color }} />
                  <span className="text-gray-300 font-bold">{t?.name}</span>
                  <span className="text-gray-500 text-[10px] ml-auto">
                    {new Date(p.picked_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
