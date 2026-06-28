'use client'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Play, Square, RotateCcw, CheckCircle2, Circle, Crown, Users, RefreshCw, Trash2, Save, Link2, Copy, Check, X } from 'lucide-react'

interface Team { id: string; name: string; color: string }
interface Player { id: string; name: string; number: number | null; position: string | null; plus_one?: boolean }

interface Draft {
  id: string
  league_id: string
  quarter_id: string
  status: 'setup' | 'ready_check' | 'lottery_waiting' | 'lottery_done' | 'in_progress' | 'completed'
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
  share_token: string | null
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
  /** 인증 헤더 — 어드민은 {} (쿠키), 리그 페이지는 X-League-Pin */
  authHeaders?: Record<string, string>
  /** 관리 액션 후 부모(참여자 보드 등) 갱신 콜백 */
  onChanged?: () => void
}

export default function DraftSessionControl({ leagueId, quarterId, teams, authHeaders = {}, onChanged }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [pool, setPool] = useState<string[]>([])
  const [leaders, setLeaders] = useState<Leader[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  const [leaderDraft, setLeaderDraft] = useState<Record<string, string>>({})
  const [poolSel, setPoolSel] = useState<Set<string>>(new Set())
  const [tokenCopied, setTokenCopied] = useState(false)

  const jsonHeaders = { 'Content-Type': 'application/json', ...authHeaders }

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [dRes, pRes] = await Promise.all([
        fetch(`/api/admin/leagues/${leagueId}/drafts?quarterId=${quarterId}`, { headers: authHeaders }),
        fetch(`/api/leagues/${leagueId}/players`),
      ])
      if (dRes.ok) {
        const d = await dRes.json()
        setDraft(d.draft ?? null)
        setPicks(d.picks ?? [])
        setPool(d.pool ?? [])
        setLeaders(d.leaders ?? [])
        const lmap: Record<string, string> = {}
        for (const l of (d.leaders ?? []) as Leader[]) if (l.leader_player_id) lmap[l.team_id] = l.leader_player_id
        setLeaderDraft(lmap)
        // setup(또는 세션 없음) 일 때 풀 선택 동기화
        if (!d.draft || d.draft.status === 'setup') setPoolSel(new Set(d.pool ?? []))
      } else {
        setDraft(null); setPicks([]); setPool([]); setLeaders([])
      }
      if (pRes.ok) setPlayers(await pRes.json())
    } finally {
      if (!silent) setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, quarterId])

  useEffect(() => { fetchData() }, [fetchData])

  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const playerMap = Object.fromEntries(players.map(p => [p.id, p]))
  const leaderIds = new Set(Object.values(leaderDraft).filter(Boolean))

  async function createSession() {
    if (poolSel.size === 0) { toast.error('드래프트 대상 선수를 1명 이상 선택하세요'); return }
    setActing(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/drafts`, {
      method: 'POST', headers: jsonHeaders,
      body: JSON.stringify({ quarter_id: quarterId, method: 'snake', leaders: leaderDraft, pool_player_ids: Array.from(poolSel) }),
    })
    setActing(false)
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? '생성 실패'); return }
    toast.success('세션 생성 완료 — 준비 체크를 시작하세요')
    fetchData(true); onChanged?.()
  }

  async function savePoolLeaders() {
    if (!draft) return
    if (poolSel.size === 0) { toast.error('대상 선수를 1명 이상 선택하세요'); return }
    setActing(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/drafts/${draft.id}`, {
      method: 'PATCH', headers: jsonHeaders,
      body: JSON.stringify({ leaders: leaderDraft, pool_player_ids: Array.from(poolSel) }),
    })
    setActing(false)
    const d = await res.json()
    if (!res.ok) { toast.error(d.error ?? '저장 실패'); return }
    toast.success('참여 설정 저장 완료')
    fetchData(true); onChanged?.()
  }

  async function openReady() {
    if (!draft) return
    setActing(true)
    const res = await fetch(`/api/leagues/${leagueId}/drafts/${draft.id}/open-ready`, { method: 'POST', headers: authHeaders })
    setActing(false)
    if (res.ok) { toast.success('준비 체크 시작'); fetchData(true); onChanged?.() }
    else { const d = await res.json(); toast.error(d.error ?? '실패') }
  }

  // ① 추첨 대기 화면 열기 — ready_check → lottery_waiting
  async function openLotteryWait(force: boolean) {
    if (!draft) return
    if (force && !confirm('아직 준비 안 된 참가자가 있어도 강제로 추첨 대기 화면을 여시겠습니까?')) return
    setActing(true)
    const res = await fetch(`/api/leagues/${leagueId}/drafts/${draft.id}/lottery/open`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ force }),
    })
    setActing(false)
    const d = await res.json()
    if (res.ok) { toast.success('추첨 대기 화면이 열렸습니다 — 모두 시청 후 추첨 시작'); fetchData(true); onChanged?.() }
    else { toast.error(d.error ?? '실패') }
  }

  // ② 추첨 실행 — lottery_waiting → lottery_done
  async function runLottery() {
    if (!draft) return
    setActing(true)
    const res = await fetch(`/api/leagues/${leagueId}/drafts/${draft.id}/lottery`, {
      method: 'POST', headers: jsonHeaders,
    })
    setActing(false)
    const d = await res.json()
    if (res.ok) { toast.success('🎲 추첨 완료 — 결과를 시청 후 드래프트 시작'); fetchData(true); onChanged?.() }
    else { toast.error(d.error ?? '추첨 실패') }
  }

  // ③ 드래프트 시작 — lottery_done → in_progress
  async function startDraft() {
    if (!draft) return
    setActing(true)
    const res = await fetch(`/api/leagues/${leagueId}/drafts/${draft.id}/start-draft`, {
      method: 'POST', headers: jsonHeaders,
    })
    setActing(false)
    const d = await res.json()
    if (res.ok) { toast.success('🏀 드래프트 시작!'); fetchData(true); onChanged?.() }
    else { toast.error(d.error ?? '시작 실패') }
  }

  async function completeSession() {
    if (!draft) return
    if (!confirm('드래프트를 강제 종료하시겠습니까?')) return
    setActing(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/drafts/${draft.id}/complete`, { method: 'POST', headers: authHeaders })
    setActing(false)
    if (res.ok) { toast.success('종료'); fetchData(true); onChanged?.() }
    else { const d = await res.json(); toast.error(d.error ?? '실패') }
  }

  async function resetSession() {
    if (!draft) return
    if (!confirm(`정말 리셋하시겠습니까?\n- 픽 ${picks.length}건 삭제\n- 추첨/준비 상태 초기화 (풀·팀장은 유지)\n- 세션 → setup`)) return
    setActing(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/drafts/${draft.id}/reset`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ delete_picks: true }),
    })
    setActing(false)
    if (res.ok) { toast.success('리셋 완료 — 참여 설정부터 다시 진행하세요'); fetchData(true); onChanged?.() }
    else { const d = await res.json(); toast.error(d.error ?? '실패') }
  }

  async function deleteSession() {
    if (!draft) return
    if (!confirm('세션을 완전히 삭제하고 처음부터 다시 설정하시겠습니까?\n픽·추첨·채팅 기록이 모두 삭제됩니다. (코드는 유지)')) return
    setActing(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/drafts/${draft.id}`, { method: 'DELETE', headers: authHeaders })
    setActing(false)
    if (res.ok) { toast.success('세션 삭제 완료'); fetchData(true); onChanged?.() }
    else { const d = await res.json(); toast.error(d.error ?? '삭제 실패') }
  }

  async function generateShareToken() {
    if (!draft) return
    const isReissue = !!draft.share_token
    if (isReissue && !confirm('기존 공유 링크가 폐기되고 새 링크가 발급됩니다. 진행하시겠습니까?')) return
    setActing(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/drafts/${draft.id}/share-token`, { method: 'POST', headers: jsonHeaders })
    setActing(false)
    if (res.ok) {
      toast.success(isReissue ? '공유 링크 재발급 완료' : '공유 링크 생성 완료')
      fetchData(true)
    } else {
      const d = await res.json()
      toast.error(d.error ?? '실패')
    }
  }

  async function revokeShareToken() {
    if (!draft || !draft.share_token) return
    if (!confirm('공유 링크를 폐기하시겠습니까? 기존 링크는 더 이상 동작하지 않습니다.')) return
    setActing(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/drafts/${draft.id}/share-token`, { method: 'DELETE', headers: authHeaders })
    setActing(false)
    if (res.ok) { toast.success('공유 링크 폐기 완료'); fetchData(true) }
    else { const d = await res.json(); toast.error(d.error ?? '실패') }
  }

  async function copyShareUrl() {
    if (!draft?.share_token) return
    const url = `${window.location.origin}/draft/${draft.share_token}`
    try {
      await navigator.clipboard.writeText(url)
      setTokenCopied(true)
      setTimeout(() => setTokenCopied(false), 2000)
      toast.success('링크가 복사되었습니다')
    } catch {
      toast.error('복사 실패 — 직접 선택해서 복사하세요')
    }
  }

  if (loading) return <div className="text-center text-gray-500 py-8">로딩 중...</div>

  // ── 풀·팀장 편집 블록 (세션 없음 또는 setup 에서 공통 사용) ──
  const editorBlock = (
    <div className="space-y-5">
      <div>
        <label className="text-[11px] text-gray-300 font-bold uppercase tracking-wider flex items-center gap-1.5 mb-2">
          <Crown size={14} className="text-amber-400" /> 팀장(단장) 지정 — 드래프트 풀에서 자동 제외
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {teams.map(t => (
            <div key={t.id} className="bg-gray-800/60 border border-gray-700/50 rounded-lg p-2.5 space-y-1.5" style={{ borderTopColor: t.color, borderTopWidth: 2 }}>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                <span className="text-white font-bold text-sm">{t.name}</span>
              </div>
              <select value={leaderDraft[t.id] ?? ''} onChange={e => setLeaderDraft(prev => ({ ...prev, [t.id]: e.target.value }))}
                className="w-full bg-gray-900 border border-gray-700 rounded px-2 py-1.5 text-sm text-white">
                <option value="">— 팀장 선택 —</option>
                {players.map(p => <option key={p.id} value={p.id}>{p.name}{p.number != null ? ` #${p.number}` : ''}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[11px] text-gray-300 font-bold uppercase tracking-wider flex items-center gap-1.5">
            <Users size={14} className="text-emerald-400" /> 드래프트 참여 선수 ({poolSel.size}명 선택 / 전체 {players.length}명)
          </label>
          <div className="flex gap-1.5">
            <button onClick={() => setPoolSel(new Set(players.filter(p => !leaderIds.has(p.id)).map(p => p.id)))} className="text-xs px-2.5 py-1.5 min-h-[32px] rounded bg-gray-800 text-gray-100 hover:text-white cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950">전체 선택</button>
            <button onClick={() => setPoolSel(new Set())} className="text-xs px-2.5 py-1.5 min-h-[32px] rounded bg-gray-800 text-gray-100 hover:text-white cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950">해제</button>
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5 pr-1">
          {players.map(p => {
            const isLeader = leaderIds.has(p.id)
            const checked = poolSel.has(p.id)
            return (
              <button key={p.id} disabled={isLeader}
                onClick={() => setPoolSel(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n })}
                className={`flex items-center gap-2 px-2.5 py-2 min-h-[36px] rounded-lg border text-left text-sm transition-colors min-w-0 ${
                  isLeader ? 'bg-amber-950/30 border-amber-800/40 opacity-60 cursor-not-allowed'
                  : checked ? 'bg-emerald-900/40 border-emerald-600 cursor-pointer'
                  : 'bg-gray-800 border-gray-700 hover:border-gray-600 cursor-pointer'
                }`}>
                {isLeader ? <Crown size={14} className="text-amber-400 shrink-0" /> : checked ? <CheckCircle2 size={14} className="text-emerald-400 shrink-0" /> : <Circle size={14} className="text-gray-500 shrink-0" />}
                <span className="text-white font-bold truncate min-w-0">{p.name}</span>
                {p.number != null && <span className="text-xs text-gray-400 shrink-0">#{p.number}</span>}
                {isLeader && <span className="text-[11px] text-amber-400 ml-auto shrink-0 font-bold">팀장</span>}
              </button>
            )
          })}
        </div>
        {players.length === 0 && (
          <p className="text-sm text-amber-400 mt-2 leading-relaxed">등록된 리그 선수가 없습니다. 선수단(로스터) 페이지에서 선수를 먼저 등록하세요.</p>
        )}
      </div>
    </div>
  )

  // ── 세션 없음 — 생성 ──
  if (!draft) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
        <div>
          <h3 className="font-bold text-white text-lg sm:text-xl mb-1.5">드래프트 세션 생성</h3>
          <p className="text-sm text-gray-300 leading-relaxed">팀장(단장)을 지정하고 드래프트 참여 선수를 선별하세요. 픽 순서는 지난 분기 승률 기반 추첨으로 결정됩니다 (스네이크).</p>
        </div>
        {editorBlock}
        <Button onClick={createSession} disabled={acting} className="w-full bg-amber-600 hover:bg-amber-500 text-white text-base sm:text-lg font-bold h-12">드래프트 세션 생성</Button>
      </div>
    )
  }

  const ready = draft.ready_state ?? {}
  const allTeamsReady = teams.every(t => ready[t.id])

  // ── setup — 풀/팀장 수정 + 준비 시작 ──
  if (draft.status === 'setup') {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-white text-lg sm:text-xl">참여 설정 (준비 단계)</h3>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-900/60 border border-blue-700/50 text-blue-300 uppercase tracking-wider">준비</span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <Button onClick={savePoolLeaders} disabled={acting} variant="outline" className="text-sm h-10"><Save size={14} className="mr-1" /> 설정 저장</Button>
            <Button onClick={openReady} disabled={acting} className="bg-amber-600 hover:bg-amber-500 text-white text-sm h-10 font-bold"><Play size={14} className="mr-1" /> 준비 체크 시작</Button>
            <Button onClick={deleteSession} disabled={acting} variant="destructive" className="text-sm h-10"><Trash2 size={14} className="mr-1" /> 세션 삭제</Button>
          </div>
        </div>
        <p className="text-sm text-gray-300 leading-relaxed">현재 풀 {pool.length}명 · 팀장 {Object.values(leaderDraft).filter(Boolean).length}명. 변경 후 <b className="text-white">설정 저장</b>을 누른 뒤 <b className="text-amber-300">준비 체크 시작</b>으로 진행하세요.</p>
        {editorBlock}
      </div>
    )
  }

  // ── ready_check / in_progress / completed ──
  // 액션 위계 정리:
  //  - 상단 큰 Primary CTA (현재 phase 에서 가장 자연스러운 다음 단계)
  //  - 보조 액션 row (강제 옵션 등 부수 컨트롤)
  //  - 위험 액션은 <details> 안에 격리 (리셋 / 삭제 / 강제 종료)
  //  → 모바일 라이브 진행 중 오클릭 위험 차단.
  // ── 명령 센터(Command Center) 구성 ──
  // 1) 단계 stepper: setup → ready → lottery → pick → done
  // 2) 큰 헤드라인: phase 한 줄 + 1-line 도움 문구 (next action 예측)
  // 3) Primary CTA: phase 에서 가장 자연스러운 다음 단계
  let primary: { label: string; onClick: () => void | Promise<void>; disabled?: boolean; helper?: string } | null = null
  let phaseHeadline = ''
  if (draft.status === 'ready_check') {
    primary = {
      label: allTeamsReady ? '🎬 추첨 대기 화면 열기' : '✋ 전원 준비 대기 중',
      onClick: () => openLotteryWait(false),
      disabled: acting || !allTeamsReady,
      helper: allTeamsReady
        ? '버튼을 누르면 모든 화면이 추첨 대기 모드로 전환됩니다.'
        : '모든 팀이 READY가 되면 버튼이 활성화됩니다.',
    }
    phaseHeadline = '준비 단계 — 모두의 READY를 기다리는 중'
  } else if (draft.status === 'lottery_waiting') {
    primary = {
      label: '🎲 추첨 시작',
      onClick: runLottery,
      disabled: acting,
      helper: '준비가 끝났다면 즉시 NBA 스타일 추첨 연출이 모두에게 재생됩니다.',
    }
    phaseHeadline = '추첨 대기 — 시작 명령 대기 중'
  } else if (draft.status === 'lottery_done') {
    primary = {
      label: '🏀 드래프트 시작',
      onClick: startDraft,
      disabled: acting,
      helper: '버튼을 누르면 픽 타이머가 시작되고 1번 팀부터 픽이 진행됩니다.',
    }
    phaseHeadline = '추첨 완료 — 드래프트 시작 대기'
  } else if (draft.status === 'in_progress') {
    phaseHeadline = `1라운드 ${draft.current_pick_index + 1}픽 진행 중 (${draft.total_picks}/${draft.draft_order.length * Math.max(1, Math.ceil((draft.total_picks + 1) / Math.max(draft.draft_order.length, 1)))}픽)`
  } else if (draft.status === 'completed') {
    phaseHeadline = '드래프트 완료 — 멤버십 자동 반영됨'
  }

  // 단계 stepper 표시용 — setup 은 이미 별도 분기, 여기선 ready 부터.
  const stepperSteps = [
    { key: 'ready', label: '준비', match: ['ready_check'] },
    { key: 'lottery', label: '추첨', match: ['lottery_waiting', 'lottery_done'] },
    { key: 'pick', label: '픽', match: ['in_progress'] },
    { key: 'done', label: '완료', match: ['completed'] },
  ] as const
  const activeStepIdx = stepperSteps.findIndex(s => (s.match as readonly string[]).includes(draft.status))

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-5">
      {/* ── 명령 센터 헤드 ── 단계·헤드라인·Primary CTA·도움 문구 묶음 */}
      <div className="space-y-3">
        {/* 단계 stepper */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {stepperSteps.map((s, i) => {
            const isActive = i === activeStepIdx
            const isDone = activeStepIdx > i
            return (
              <div key={s.key} className="flex items-center gap-1.5 sm:gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs sm:text-sm font-bold uppercase tracking-wider transition-colors ${
                  isActive ? 'bg-amber-900/60 border-amber-500 text-amber-200' :
                  isDone ? 'bg-emerald-950/40 border-emerald-700/50 text-emerald-300' :
                  'bg-gray-800 border-gray-700 text-gray-400'
                }`}>
                  <span className="w-4 h-4 rounded-full inline-flex items-center justify-center tabular-nums text-[10px] font-black bg-gray-900/80 border border-current">{i + 1}</span>
                  {s.label}
                </span>
                {i < stepperSteps.length - 1 && (
                  <span className={`text-xs ${isDone ? 'text-emerald-500' : 'text-gray-600'}`}>›</span>
                )}
              </div>
            )
          })}
        </div>

        {/* 헤드라인 + 메타 */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-black text-white text-xl sm:text-2xl leading-tight">{phaseHeadline}</h3>
            <p className="text-sm text-gray-300 mt-1.5 leading-relaxed">풀 <b className="text-white tabular-nums">{pool.length}</b>명 · 팀장 <b className="text-white tabular-nums">{leaders.filter(l => l.leader_player_id).length}</b>명 · <b className="text-white tabular-nums">{draft.total_picks}</b>픽 완료</p>
          </div>
          {draft.status === 'in_progress' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-950/60 border border-emerald-700/50 text-emerald-200 text-sm font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> 진행 중
            </span>
          )}
          {draft.status === 'completed' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-gray-200 text-sm font-bold uppercase tracking-wider">
              종료
            </span>
          )}
        </div>

        {/* Primary CTA — phase 에서 가장 자연스러운 다음 단계, full-width 모바일 친화 */}
        {primary && (
          <div className="space-y-2">
            <Button
              onClick={primary.onClick}
              disabled={primary.disabled}
              className="w-full bg-amber-600 hover:bg-amber-500 text-white font-black text-lg sm:text-xl py-3 min-h-[56px] sm:min-h-[64px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {primary.label}
            </Button>
            {primary.helper && (
              <p className="text-sm text-gray-200 leading-relaxed text-center">{primary.helper}</p>
            )}
          </div>
        )}

        {/* 보조 액션 — 강제 옵션 등 */}
        {(draft.status === 'ready_check') && (
          <div className="flex flex-wrap gap-1.5 justify-center">
            <Button onClick={() => openLotteryWait(true)} disabled={acting} variant="outline" className="text-sm h-10 min-h-[40px] focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950">
              ⚡ 강제 열기 (READY 무시)
            </Button>
          </div>
        )}
      </div>

      {/* 위험 액션 격리 — details 로 접어둠 */}
      <details className="rounded-lg border border-red-900/40 bg-red-950/20 group">
        <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-bold text-red-300 hover:text-red-200 flex items-center gap-2 list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded-lg">
          <span className="inline-flex items-center justify-center w-4 h-4 text-red-400">⚠</span>
          <span className="uppercase tracking-wider">위험 액션</span>
          <span className="ml-auto text-xs text-red-400/70 group-open:hidden">펼치기</span>
          <span className="ml-auto text-xs text-red-400/70 hidden group-open:inline">접기</span>
        </summary>
        <div className="border-t border-red-900/40 p-3 flex flex-wrap gap-1.5">
          {draft.status === 'in_progress' && (
            <Button onClick={completeSession} disabled={acting} variant="outline" className="text-sm h-10 min-h-[40px] border-orange-700/50 text-orange-300 bg-orange-950/40 hover:bg-orange-900/40 focus-visible:ring-2 focus-visible:ring-orange-400">
              <Square size={14} className="mr-1" /> 강제 종료
            </Button>
          )}
          <Button onClick={resetSession} disabled={acting} variant="outline" className="text-sm h-10 min-h-[40px] border-red-700/50 text-red-300 bg-red-950/40 hover:bg-red-900/40 focus-visible:ring-2 focus-visible:ring-red-400">
            <RotateCcw size={14} className="mr-1" /> 리셋
          </Button>
          <Button onClick={deleteSession} disabled={acting} variant="outline" className="text-sm h-10 min-h-[40px] border-red-700/50 text-red-300 bg-red-950/40 hover:bg-red-900/40 focus-visible:ring-2 focus-visible:ring-red-400">
            <Trash2 size={14} className="mr-1" /> 세션 삭제
          </Button>
        </div>
      </details>

      {/* ── 페이즈 세부 — 팀장 / 준비 / 추첨 결과 단일 카드 ── */}
      <div className="rounded-lg border border-gray-800 bg-gray-950/40 p-3 sm:p-4 space-y-3">
        {/* 팀장 라인업 — 항상 표시 */}
        <div>
          <p className="text-xs text-gray-300 font-bold uppercase tracking-widest mb-2 flex items-center gap-1.5">
            <Crown size={14} className="text-amber-400" /> 팀장 라인업
          </p>
          <div className="flex flex-wrap gap-1.5">
            {teams.map(t => {
              const lid = leaders.find(l => l.team_id === t.id)?.leader_player_id
              return (
                <span key={t.id} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-sm">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                  <span className="text-gray-200 font-bold">{t.name}</span>
                  <span className="text-gray-300">{lid ? (playerMap[lid]?.name ?? '?') : '미지정'}</span>
                </span>
              )
            })}
          </div>
        </div>

        {/* 준비 현황 — ready_check 단계에서만 */}
        {draft.status === 'ready_check' && (
          <div className="pt-3 border-t border-gray-800">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-300 font-bold uppercase tracking-widest">참가자 준비 현황</p>
              <button onClick={() => fetchData(true)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 min-h-[32px] rounded bg-gray-800 text-gray-100 hover:text-white cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400" aria-label="준비 현황 새로고침">
                <RefreshCw size={12} /> 새로고침
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {teams.map(t => (
                <span key={t.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm ${ready[t.id] ? 'bg-emerald-900/40 border-emerald-700 text-emerald-200' : 'bg-gray-800 border-gray-700 text-gray-200'}`}>
                  {ready[t.id] ? <CheckCircle2 size={13} /> : <Circle size={13} />}{t.name} 단장
                </span>
              ))}
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm ${ready['supervisor'] ? 'bg-emerald-900/40 border-emerald-700 text-emerald-200' : 'bg-gray-800 border-gray-700 text-gray-200'}`}>
                {ready['supervisor'] ? <CheckCircle2 size={13} /> : <Circle size={13} />}감독관
              </span>
            </div>
          </div>
        )}

        {/* 추첨 결과 — lottery_done 이후 */}
        {draft.lottery_done && draft.draft_order.length > 0 && (
          <div className="pt-3 border-t border-gray-800">
            <p className="text-xs text-gray-300 font-bold uppercase tracking-widest mb-2">추첨 결과 — 픽 순서</p>
            <div className="flex flex-wrap gap-1.5">
              {draft.draft_order.map((tid, idx) => {
                const t = teamMap[tid]
                const odd = draft.lottery_odds?.[tid]
                return (
                  <div key={`${tid}-${idx}`} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-sm">
                    <span className="text-gray-200 font-bold tabular-nums">{idx + 1}.</span>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t?.color }} />
                    <span className="text-white font-bold">{t?.name ?? '?'}</span>
                    {odd != null && <span className="text-xs text-amber-300 tabular-nums">{(odd * 100).toFixed(0)}%</span>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* 공유 링크 — 단장·감독관용 별도 진입 페이지 */}
      {draft.status !== 'completed' && (
        <div className="rounded-lg border border-blue-900/50 bg-blue-950/20 p-3 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Link2 size={15} className="text-blue-400" />
            <p className="text-sm font-bold text-blue-300 uppercase tracking-widest">공유 링크</p>
            <span className="text-xs text-gray-300">단장·감독관 전용 진입 페이지</span>
          </div>
          {draft.share_token ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 bg-gray-900 border border-gray-700 rounded-md p-2">
                <code className="font-mono text-xs sm:text-sm text-blue-300 flex-1 truncate select-all">
                  {typeof window !== 'undefined' ? `${window.location.origin}/draft/${draft.share_token}` : `/draft/${draft.share_token}`}
                </code>
                <button onClick={copyShareUrl} aria-label="공유 링크 복사" className={`px-2.5 py-1.5 rounded text-xs font-bold cursor-pointer flex items-center gap-1 transition-colors min-h-[32px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 ${tokenCopied ? 'bg-emerald-700 text-white' : 'bg-blue-700 hover:bg-blue-600 text-white'}`}>
                  {tokenCopied ? <Check size={12} /> : <Copy size={12} />}
                  {tokenCopied ? '복사됨' : '복사'}
                </button>
              </div>
              <div className="flex gap-1.5">
                <Button onClick={generateShareToken} disabled={acting} variant="outline" className="text-sm h-9 bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700">
                  <RotateCcw size={12} className="mr-1" /> 재발급
                </Button>
                <Button onClick={revokeShareToken} disabled={acting} variant="outline" className="text-sm h-9 bg-red-950/40 border-red-800/50 text-red-300 hover:bg-red-900/40">
                  <X size={12} className="mr-1" /> 폐기
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={generateShareToken} disabled={acting} className="bg-blue-600 hover:bg-blue-500 text-white text-sm h-10 w-full sm:w-auto font-bold">
              <Link2 size={14} className="mr-1" /> 공유 링크 생성
            </Button>
          )}
        </div>
      )}

      {/* 최근 픽 목록 제거 — 상단 스코어보드(DraftScoreboard)가 모든 픽을
          단일 소스로 보여주므로 여기서 중복 노출하지 않음. */}
    </div>
  )
}
