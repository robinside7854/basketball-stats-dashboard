'use client'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Play, Square, RotateCcw, Dice5, CheckCircle2, Circle, Crown, Users } from 'lucide-react'

interface Team {
  id: string
  name: string
  color: string
}

interface Player {
  id: string
  name: string
  number: number | null
  position: string | null
  plus_one?: boolean
}

interface Draft {
  id: string
  league_id: string
  quarter_id: string
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
}

interface Pick {
  id: string
  pick_number: number
  round_number: number
  team_id: string
  league_player_id: string
  picked_at: string
}

interface Leader { team_id: string; leader_player_id: string | null }

interface Props {
  leagueId: string
  quarterId: string
  teams: Team[]
}

export default function DraftSessionControl({ leagueId, quarterId, teams }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [pool, setPool] = useState<string[]>([])
  const [leaders, setLeaders] = useState<Leader[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  // setup 폼: 팀장 지정 + 풀 선택
  const [leaderDraft, setLeaderDraft] = useState<Record<string, string>>({})
  const [poolSel, setPoolSel] = useState<Set<string>>(new Set())

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [dRes, pRes] = await Promise.all([
        fetch(`/api/admin/leagues/${leagueId}/drafts?quarterId=${quarterId}`),
        fetch(`/api/leagues/${leagueId}/players`),
      ])
      if (dRes.ok) {
        const d = await dRes.json()
        setDraft(d.draft ?? null)
        setPicks(d.picks ?? [])
        setPool(d.pool ?? [])
        setLeaders(d.leaders ?? [])
        // 팀장 폼 초기화
        const lmap: Record<string, string> = {}
        for (const l of (d.leaders ?? []) as Leader[]) if (l.leader_player_id) lmap[l.team_id] = l.leader_player_id
        setLeaderDraft(lmap)
      } else {
        setDraft(null); setPicks([]); setPool([]); setLeaders([])
      }
      if (pRes.ok) setPlayers(await pRes.json())
    } finally {
      setLoading(false)
    }
  }, [leagueId, quarterId])

  useEffect(() => { fetchData() }, [fetchData])

  // 준비 체크 단계에서 폴링 (참가자 준비 현황 갱신)
  useEffect(() => {
    if (draft?.status !== 'ready_check') return
    const t = setInterval(fetchData, 2000)
    return () => clearInterval(t)
  }, [draft?.status, fetchData])

  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const playerMap = Object.fromEntries(players.map(p => [p.id, p]))
  const leaderIds = new Set(Object.values(leaderDraft).filter(Boolean))

  async function createSession() {
    if (poolSel.size === 0) { toast.error('드래프트 대상 선수를 1명 이상 선택하세요'); return }
    setActing(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/drafts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quarter_id: quarterId,
        method: 'snake',
        leaders: leaderDraft,
        pool_player_ids: Array.from(poolSel),
      }),
    })
    setActing(false)
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? '생성 실패'); return }
    toast.success('세션 생성 완료 — 준비 체크를 시작하세요')
    fetchData()
  }

  async function openReady() {
    if (!draft) return
    setActing(true)
    const res = await fetch(`/api/leagues/${leagueId}/drafts/${draft.id}/open-ready`, { method: 'POST' })
    setActing(false)
    if (res.ok) { toast.success('준비 체크 시작 — 단장/감독관이 준비 버튼을 누를 수 있습니다'); fetchData() }
    else { const d = await res.json(); toast.error(d.error ?? '실패') }
  }

  async function runLottery(force: boolean) {
    if (!draft) return
    if (force && !confirm('아직 준비 안 된 참가자가 있어도 강제로 추첨하시겠습니까?')) return
    setActing(true)
    const res = await fetch(`/api/leagues/${leagueId}/drafts/${draft.id}/lottery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ force }),
    })
    setActing(false)
    const d = await res.json()
    if (res.ok) { toast.success('추첨 완료 — 드래프트 시작!'); fetchData() }
    else { toast.error(d.error ?? '추첨 실패') }
  }

  async function completeSession() {
    if (!draft) return
    if (!confirm('드래프트를 강제 종료하시겠습니까?')) return
    setActing(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/drafts/${draft.id}/complete`, { method: 'POST' })
    setActing(false)
    if (res.ok) { toast.success('종료'); fetchData() }
    else { const d = await res.json(); toast.error(d.error ?? '실패') }
  }

  async function resetSession() {
    if (!draft) return
    if (!confirm(`정말 리셋하시겠습니까?\n- 픽 ${picks.length}건 삭제\n- 추첨/준비 상태 초기화 (풀·팀장은 유지)\n- 세션 → setup`)) return
    setActing(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/drafts/${draft.id}/reset`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delete_picks: true }),
    })
    setActing(false)
    if (res.ok) { toast.success('리셋 완료'); fetchData() }
    else { const d = await res.json(); toast.error(d.error ?? '실패') }
  }

  if (loading) return <div className="text-center text-gray-500 py-8">로딩 중...</div>

  // ─────────────────────────────────────────────
  // 세션 없음 — 팀장 지정 + 풀 선별 + 생성
  // ─────────────────────────────────────────────
  if (!draft) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
        <div>
          <h3 className="font-bold text-white text-base mb-1">드래프트 세션 생성</h3>
          <p className="text-xs text-gray-500">팀장(단장)을 지정하고 드래프트 대상 선수를 선별하세요. 픽 순서는 지난 분기 승률 기반 추첨으로 결정됩니다 (스네이크).</p>
        </div>

        {/* 팀장 지정 */}
        <div>
          <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1 mb-2">
            <Crown size={12} className="text-amber-400" /> 팀장(단장) 지정 — 드래프트 풀에서 자동 제외
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {teams.map(t => (
              <div key={t.id} className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-2.5 space-y-1.5" style={{ borderTopColor: t.color, borderTopWidth: 2 }}>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="text-white font-bold text-xs">{t.name}</span>
                </div>
                <select
                  value={leaderDraft[t.id] ?? ''}
                  onChange={e => setLeaderDraft(prev => ({ ...prev, [t.id]: e.target.value }))}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-xs text-white"
                >
                  <option value="">— 팀장 선택 —</option>
                  {players.map(p => (
                    <option key={p.id} value={p.id}>{p.name}{p.number != null ? ` #${p.number}` : ''}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        {/* 풀 선택 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider flex items-center gap-1">
              <Users size={12} className="text-emerald-400" /> 드래프트 대상 선수 ({poolSel.size}명 선택)
            </label>
            <div className="flex gap-1.5">
              <button
                onClick={() => setPoolSel(new Set(players.filter(p => !leaderIds.has(p.id)).map(p => p.id)))}
                className="text-[10px] px-2 py-1 rounded bg-gray-800 text-gray-300 hover:text-white cursor-pointer">전체 선택</button>
              <button onClick={() => setPoolSel(new Set())} className="text-[10px] px-2 py-1 rounded bg-gray-800 text-gray-300 hover:text-white cursor-pointer">해제</button>
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5 pr-1">
            {players.map(p => {
              const isLeader = leaderIds.has(p.id)
              const checked = poolSel.has(p.id)
              return (
                <button
                  key={p.id}
                  disabled={isLeader}
                  onClick={() => setPoolSel(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n })}
                  className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left text-xs transition-colors ${
                    isLeader ? 'bg-amber-950/30 border-amber-800/40 opacity-60 cursor-not-allowed'
                    : checked ? 'bg-emerald-900/40 border-emerald-600 cursor-pointer'
                    : 'bg-gray-800 border-gray-700 hover:border-gray-600 cursor-pointer'
                  }`}
                >
                  {isLeader ? <Crown size={12} className="text-amber-400 shrink-0" />
                    : checked ? <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
                    : <Circle size={12} className="text-gray-600 shrink-0" />}
                  <span className="text-white font-bold truncate">{p.name}</span>
                  {p.number != null && <span className="text-gray-500 text-[10px]">#{p.number}</span>}
                  {isLeader && <span className="text-[9px] text-amber-400 ml-auto">팀장</span>}
                </button>
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

  // ─────────────────────────────────────────────
  // 세션 있음
  // ─────────────────────────────────────────────
  const ready = draft.ready_state ?? {}
  const allTeamsReady = teams.every(t => ready[t.id])

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-white text-base">드래프트 세션</h3>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
              draft.status === 'in_progress' ? 'bg-emerald-900/60 border border-emerald-700/50 text-emerald-300' :
              draft.status === 'completed' ? 'bg-gray-800 border border-gray-700 text-gray-400' :
              draft.status === 'ready_check' ? 'bg-amber-900/60 border border-amber-700/50 text-amber-300' :
              'bg-blue-900/60 border border-blue-700/50 text-blue-300'
            }`}>
              {draft.status === 'in_progress' ? '진행 중' : draft.status === 'completed' ? '완료' : draft.status === 'ready_check' ? '준비 체크' : '준비'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            풀 {pool.length}명 · 팀장 {leaders.filter(l => l.leader_player_id).length}명 · {draft.total_picks}픽 완료
          </p>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {draft.status === 'setup' && (
            <Button onClick={openReady} disabled={acting} className="bg-amber-600 hover:bg-amber-500 text-white text-xs h-8">
              <Play size={12} className="mr-1" /> 준비 체크 시작
            </Button>
          )}
          {draft.status === 'ready_check' && (
            <>
              <Button onClick={() => runLottery(false)} disabled={acting || !allTeamsReady} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs h-8">
                <Dice5 size={12} className="mr-1" /> 추첨 시작
              </Button>
              <Button onClick={() => runLottery(true)} disabled={acting} variant="outline" className="text-xs h-8">강제 추첨</Button>
            </>
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

      {/* 팀장 요약 */}
      <div className="flex flex-wrap gap-1.5">
        {teams.map(t => {
          const lid = leaders.find(l => l.team_id === t.id)?.leader_player_id
          return (
            <span key={t.id} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-800 border border-gray-700 text-xs">
              <Crown size={11} className="text-amber-400" />
              <span className="text-gray-300 font-bold">{t.name}</span>
              <span className="text-gray-500">{lid ? (playerMap[lid]?.name ?? '?') : '미지정'}</span>
            </span>
          )
        })}
      </div>

      {/* 준비 체크 현황 */}
      {draft.status === 'ready_check' && (
        <div>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">참가자 준비 현황</p>
          <div className="flex flex-wrap gap-1.5">
            {teams.map(t => (
              <span key={t.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs ${
                ready[t.id] ? 'bg-emerald-900/40 border-emerald-700 text-emerald-300' : 'bg-gray-800 border-gray-700 text-gray-400'
              }`}>
                {ready[t.id] ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                {t.name} 단장
              </span>
            ))}
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs ${
              ready['supervisor'] ? 'bg-emerald-900/40 border-emerald-700 text-emerald-300' : 'bg-gray-800 border-gray-700 text-gray-400'
            }`}>
              {ready['supervisor'] ? <CheckCircle2 size={12} /> : <Circle size={12} />}
              감독관
            </span>
          </div>
        </div>
      )}

      {/* 추첨 결과 (순서 + 확률) */}
      {draft.lottery_done && draft.draft_order.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">추첨 결과 — 픽 순서</p>
          <div className="flex flex-wrap gap-1.5">
            {draft.draft_order.map((tid, idx) => {
              const t = teamMap[tid]
              const odd = draft.lottery_odds?.[tid]
              return (
                <div key={`${tid}-${idx}`} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-gray-800 border border-gray-700 text-xs">
                  <span className="text-gray-500 font-bold">{idx + 1}.</span>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t?.color }} />
                  <span className="text-gray-300 font-bold">{t?.name ?? '?'}</span>
                  {odd != null && <span className="text-[10px] text-amber-400">{(odd * 100).toFixed(0)}%</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 최근 픽 */}
      {picks.length > 0 && (
        <div>
          <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-2">최근 픽 (최신 5)</p>
          <div className="space-y-1">
            {picks.slice(-5).reverse().map(p => {
              const t = teamMap[p.team_id]
              return (
                <div key={p.id} className="flex items-center gap-2 bg-gray-800/40 rounded px-2 py-1.5 text-xs">
                  <span className="text-gray-500 font-bold w-12">#{p.pick_number}</span>
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t?.color }} />
                  <span className="text-gray-300 font-bold">{t?.name}</span>
                  <span className="text-white">{playerMap[p.league_player_id]?.name ?? '?'}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
