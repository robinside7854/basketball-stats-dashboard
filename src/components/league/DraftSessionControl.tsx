'use client'
import { useState, useEffect, useCallback, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Play, Square, RotateCcw, CheckCircle2, Circle, Crown, Users, RefreshCw, Trash2, Save, Link2, Copy, Check, X, Trophy, Video, Dice5, Hand, Zap, AlertTriangle, FlaskConical } from 'lucide-react'
import ConfirmModal from './ConfirmModal'
import { isGuestPlayer } from '@/lib/draft/guests'

interface Team { id: string; name: string; color: string }
interface Player { id: string; name: string; number: number | null; position: string | null; plus_one?: boolean; is_active?: boolean }

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
  /** 리허설 세션 — 픽·팀장이 분기 소속에 반영되지 않는다 (migration 115) */
  is_test?: boolean
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

/** 팀장 자동 지정에 쓰는 단장 코드 — 필요한 필드만 */
interface ManagerCode {
  team_id: string | null
  role: 'manager' | 'supervisor'
  label: string
  league_player_id?: string | null
}

interface Props {
  leagueId: string
  quarterId: string
  teams: Team[]
  /** 인증 헤더 — 어드민은 {} (쿠키), 리그 페이지는 X-League-Pin */
  authHeaders?: Record<string, string>
  /** 관리 액션 후 부모(참여자 보드 등) 갱신 콜백 */
  onChanged?: () => void
  /**
   * 세션 삭제 노출 여부. 기본 true.
   * 포털의 감독관 코드로는 DELETE 라우트가 401 이라 버튼이 눌리기만 하고 실패한다 →
   * 그 경로에서는 false 로 내려 아예 감춘다.
   */
  canDelete?: boolean
  /**
   * 페이즈 진행 Primary CTA(추첨 대기 열기 / 추첨 시작 / 드래프트 시작) 노출 여부. 기본 true.
   * 포털은 페이즈 카드(ReadyPanel·LotteryWaitScreen·LotteryDoneScreen)가 같은 버튼을 이미
   * 크게 내고 있다 → 운영 패널까지 켜면 한 화면에 같은 액션 버튼이 둘이 된다. 그쪽은 false.
   */
  showPrimary?: boolean
  /**
   * 렌더할 구획. 리그 페이지 스테퍼가 한 컴포넌트를 두 칸(③ 세션 / ④ 링크)에 나눠 쓴다.
   *  - 'all'    기본. 예전과 동일한 단일 카드.
   *  - 'editor' 세션 생성·참여 설정만 (공유 링크 제외)
   *  - 'share'  공유 링크 블록만
   * 로직은 그대로 두고 어느 JSX 를 내보낼지만 고른다.
   */
  section?: 'all' | 'editor' | 'share'
}

/** ConfirmModal 로 띄울 위험 액션 — 확인 시 실행할 함수를 함께 들고 있는다. */
interface PendingConfirm {
  title: string
  lines: string[]
  confirmLabel: string
  run: () => void | Promise<void>
}

export default function DraftSessionControl({ leagueId, quarterId, teams, authHeaders = {}, onChanged, canDelete = true, showPrimary = true, section = 'all' }: Props) {
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)
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
  // 리허설 여부는 생성 시점에만 정한다 — 세션이 만들어진 뒤에는 바꿀 수 없다
  // (진행 중에 껐다 켜면 "어디까지가 진짜인지" 를 아무도 답할 수 없게 된다)
  const [isTestNew, setIsTestNew] = useState(false)
  // 단장 코드에서 팀장을 자동으로 채웠는지 — 안내 한 줄을 띄울지 판단한다
  const [leaderPrefilled, setLeaderPrefilled] = useState(false)

  const jsonHeaders = { 'Content-Type': 'application/json', ...authHeaders }

  const fetchData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [dRes, pRes, cRes] = await Promise.all([
        fetch(`/api/admin/leagues/${leagueId}/drafts?quarterId=${quarterId}`, { headers: authHeaders }),
        fetch(`/api/leagues/${leagueId}/players`),
        // 팀장 자동 지정용. 감독관 코드 보유자에게는 401 이라 조용히 건너뛴다.
        fetch(`/api/admin/leagues/${leagueId}/draft-codes?quarterId=${quarterId}`, { headers: authHeaders }),
      ])
      const playerList: Player[] = pRes.ok ? await pRes.json() : []
      if (pRes.ok) setPlayers(playerList)
      // 지금 뽑을 수 있는 후보 — 탈퇴 회원·게스트 제외
      const selectable = playerList.filter(p => p.is_active !== false && !isGuestPlayer(p.name))

      if (dRes.ok) {
        const d = await dRes.json()
        setDraft(d.draft ?? null)
        setPicks(d.picks ?? [])
        setPool(d.pool ?? [])
        setLeaders(d.leaders ?? [])
        const lmap: Record<string, string> = {}
        for (const l of (d.leaders ?? []) as Leader[]) if (l.leader_player_id) lmap[l.team_id] = l.leader_player_id

        // ── 팀장 자동 지정 ──
        // 단장 코드를 발급할 때 "누가 단장인지" 를 이미 골랐다(league_draft_codes.league_player_id).
        // 세션을 만들 때 같은 이름을 다시 손으로 고르게 하지 않는다. 이미 지정된 팀은 건드리지 않는다.
        // 별도 effect 로 빼지 않는 이유: setState 를 effect 에서 부르면 렌더 후 한 프레임이 더 돌고,
        // 그 사이 사용자가 고른 값이 덮일 수 있다.
        let prefilled = 0
        const canPrefill = !d.draft || d.draft.status === 'setup'
        if (canPrefill && cRes.ok) {
          const codes = (await cRes.json().catch(() => [])) as ManagerCode[]
          for (const c of Array.isArray(codes) ? codes : []) {
            if (c.role === 'supervisor' || !c.team_id) continue
            if (lmap[c.team_id]) continue
            let pid = c.league_player_id ?? null
            if (!pid && typeof c.label === 'string') {
              // 117 이전에 발급된 코드는 연결이 없다 → 레이블을 이름으로 보고 정확히 일치할 때만 채운다
              // ("구범준 단장" 처럼 뒤에 직함이 붙는 관행까지만 벗겨 본다).
              const raw = c.label.trim()
              const bare = raw.replace(/\s*단장$/, '').trim()
              pid = (selectable.find(p => p.name === raw) ?? selectable.find(p => p.name === bare))?.id ?? null
            }
            if (pid && selectable.some(p => p.id === pid)) { lmap[c.team_id] = pid; prefilled++ }
          }
        }
        setLeaderDraft(lmap)
        setLeaderPrefilled(prefilled > 0)

        // setup(또는 세션 없음) 일 때 풀 선택 동기화
        if (canPrefill) {
          const poolIds: string[] = d.pool ?? []
          if (!d.draft && poolIds.length === 0) {
            // 세션 생성 화면의 기본값 = 팀장을 뺀 전원. 매번 「전체 선택」을 누르게 할 이유가 없다.
            const leaderSet = new Set(Object.values(lmap))
            setPoolSel(new Set(selectable.filter(p => !leaderSet.has(p.id)).map(p => p.id)))
          } else {
            setPoolSel(new Set(poolIds))
          }
        }
      } else {
        setDraft(null); setPicks([]); setPool([]); setLeaders([])
      }
    } finally {
      if (!silent) setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, quarterId])

  useEffect(() => { fetchData() }, [fetchData])

  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))
  // playerMap 은 전체 명단(탈퇴 회원 포함) — 과거 완료된 드래프트의 팀장·픽 이름 표시가
  // 이걸 통해 나가므로 여기서 거르면 탈퇴한 회원이 뽑았던 지난 드래프트 기록이 "?" 로 깨진다.
  const playerMap = Object.fromEntries(players.map(p => [p.id, p]))
  const leaderIds = new Set(Object.values(leaderDraft).filter(Boolean))
  // 반면 풀·팀장 "선택" UI(editorBlock)는 지금 뽑을 수 있는 후보만 보여줘야 한다 →
  // 탈퇴 회원(is_active=false)·게스트 제외한 별도 리스트. 게스트는 그날 한 번 뛰러 온 사람이라
  // 분기 소속을 정하는 드래프트 대상이 아니다.
  const rosterPlayers = players.filter(p => p.is_active !== false)
  const activePlayers = rosterPlayers.filter(p => !isGuestPlayer(p.name))
  const guestExcluded = rosterPlayers.length - activePlayers.length

  async function createSession() {
    if (poolSel.size === 0) { toast.error('드래프트 대상 선수를 1명 이상 선택하세요'); return }
    setActing(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/drafts`, {
      method: 'POST', headers: jsonHeaders,
      body: JSON.stringify({ quarter_id: quarterId, method: 'snake', leaders: leaderDraft, pool_player_ids: Array.from(poolSel), is_test: isTestNew }),
    })
    setActing(false)
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? '생성 실패'); return }
    toast.success(isTestNew ? '테스트 세션 생성 완료 — 리그에는 반영되지 않습니다' : '세션 생성 완료 — 준비 체크를 시작하세요')
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
  function requestOpenLotteryWait(force: boolean) {
    if (!draft) return
    if (!force) { openLotteryWait(false); return }
    setPendingConfirm({
      title: '준비를 무시하고 추첨 대기 화면을 열까요?',
      lines: ['아직 준비(READY)를 누르지 않은 참가자가 있습니다.', '강제로 열면 모든 화면이 추첨 대기 모드로 바뀝니다.'],
      confirmLabel: '강제로 열기',
      run: () => openLotteryWait(true),
    })
  }

  async function openLotteryWait(force: boolean) {
    if (!draft) return
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
    if (res.ok) { toast.success('드래프트 시작!', { icon: <Trophy size={16} /> }); fetchData(true); onChanged?.() }
    else { toast.error(d.error ?? '시작 실패') }
  }

  function requestCompleteSession() {
    if (!draft) return
    // 몇 픽까지 진행됐는지, 남은 픽이 몇인지 보여준다 — "강제 종료" 넉 자로는 무엇이 잘리는지 모른다.
    const remaining = Math.max(0, pool.length - picks.length)
    setPendingConfirm({
      title: '드래프트를 강제 종료할까요?',
      lines: [
        `지금까지 ${picks.length}픽이 확정됐습니다.`,
        `아직 안 뽑힌 선수 ${remaining}명은 어느 팀에도 배정되지 않은 채로 남습니다.`,
      ],
      confirmLabel: '강제 종료',
      run: completeSession,
    })
  }

  async function completeSession() {
    if (!draft) return
    setActing(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/drafts/${draft.id}/complete`, { method: 'POST', headers: authHeaders })
    setActing(false)
    if (res.ok) { toast.success('종료'); fetchData(true); onChanged?.() }
    else { const d = await res.json(); toast.error(d.error ?? '실패') }
  }

  function requestResetSession() {
    if (!draft) return
    setPendingConfirm({
      title: '드래프트를 리셋할까요?',
      lines: [
        draft.is_test
          ? `확정된 픽 ${picks.length}건이 삭제됩니다 (테스트 세션이라 분기 소속에는 처음부터 반영되지 않았습니다).`
          : `확정된 픽 ${picks.length}건이 삭제됩니다 (선수 ${picks.length}명의 소속이 사라집니다).`,
        `추첨 결과와 팀 ${teams.length}개의 준비 상태가 초기화됩니다 (풀 ${pool.length}명·팀장은 유지).`,
        '세션이 준비(setup) 단계로 되돌아갑니다.',
        '',
        '이 작업은 되돌릴 수 없습니다.',
      ],
      confirmLabel: '리셋',
      run: resetSession,
    })
  }

  async function resetSession() {
    if (!draft) return
    setActing(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/drafts/${draft.id}/reset`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ delete_picks: true }),
    })
    setActing(false)
    if (res.ok) { toast.success('리셋 완료 — 참여 설정부터 다시 진행하세요'); fetchData(true); onChanged?.() }
    else { const d = await res.json(); toast.error(d.error ?? '실패') }
  }

  // 「추첨부터 다시」 — 리허설 전용. 세팅(풀·팀장·코드·share_token)과 준비 상태를 그대로 두고
  // 추첨 대기 화면으로만 되돌린다.
  // ⚠ 실전에서 픽을 지우는 건 전체 리셋으로만 — 실전 픽은 분기 소속을 만들고 되돌리기가 무겁다.
  //   한 번 누르면 끝나는 버튼을 Primary 영역에 두면 라이브 진행 중 오클릭이 그대로 사고가 된다.
  function requestRestartLottery() {
    if (!draft) return
    setPendingConfirm({
      title: '추첨부터 다시 시작',
      lines: [
        `확정된 픽 ${picks.length}건과 추첨 결과가 지워집니다.`,
        '풀·팀장·코드·준비 상태는 그대로 두고 추첨 대기 화면으로 돌아갑니다.',
        '테스트 세션이라 리그 데이터는 영향 없습니다.',
      ],
      confirmLabel: '추첨부터 다시',
      run: restartLottery,
    })
  }

  async function restartLottery() {
    if (!draft) return
    setActing(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/drafts/${draft.id}/reset`, {
      method: 'POST', headers: jsonHeaders, body: JSON.stringify({ mode: 'lottery' }),
    })
    setActing(false)
    if (res.ok) { toast.success('추첨 대기 화면으로 되돌렸습니다 — 추첨 시작을 누르세요'); fetchData(true); onChanged?.() }
    else { const d = await res.json(); toast.error(d.error ?? '실패') }
  }

  function requestDeleteSession() {
    if (!draft) return
    setPendingConfirm({
      title: draft.is_test ? '테스트 세션을 삭제할까요?' : '세션을 완전히 삭제할까요?',
      lines: [
        `확정된 픽 ${picks.length}건, 참여 선수 ${pool.length}명의 풀 설정, 팀 ${teams.length}개의 추첨 결과와 채팅 기록이 모두 삭제됩니다.`,
        draft.is_test
          ? '테스트 세션이라 분기 소속·팀장은 처음부터 기록되지 않았습니다 — 리그 데이터는 그대로입니다.'
          : '단장·총무 코드는 그대로 유지됩니다.',
        '',
        '이 작업은 되돌릴 수 없습니다.',
      ],
      confirmLabel: '세션 삭제',
      run: deleteSession,
    })
  }

  async function deleteSession() {
    if (!draft) return
    setActing(true)
    const res = await fetch(`/api/admin/leagues/${leagueId}/drafts/${draft.id}`, { method: 'DELETE', headers: authHeaders })
    setActing(false)
    if (res.ok) { toast.success('세션 삭제 완료'); fetchData(true); onChanged?.() }
    else { const d = await res.json(); toast.error(d.error ?? '삭제 실패') }
  }

  function requestGenerateShareToken() {
    if (!draft) return
    if (!draft.share_token) { generateShareToken(); return }
    setPendingConfirm({
      title: '공유 링크를 재발급할까요?',
      lines: ['기존 공유 링크는 폐기되어 더 이상 열리지 않습니다.', '이미 배포한 링크가 있다면 새 링크를 다시 보내야 합니다.'],
      confirmLabel: '재발급',
      run: generateShareToken,
    })
  }

  async function generateShareToken() {
    if (!draft) return
    const isReissue = !!draft.share_token
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

  function requestRevokeShareToken() {
    if (!draft || !draft.share_token) return
    setPendingConfirm({
      title: '공유 링크를 폐기할까요?',
      lines: ['기존 링크는 더 이상 동작하지 않습니다.', '단장·총무가 이미 링크로 들어와 있다면 새로고침 시 접속이 끊깁니다.'],
      confirmLabel: '폐기',
      run: revokeShareToken,
    })
  }

  async function revokeShareToken() {
    if (!draft || !draft.share_token) return
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

  if (loading) return <div className="text-center text-[var(--mm-muted)] py-8">로딩 중...</div>

  // 색은 전부 mm 토큰으로 간다. 예전에는 gray-800 위 gray-100 처럼 다크 전용 조합이 박혀 있었는데,
  // 라이트 모드에서 globals.css 가 gray 스케일을 뒤집기 때문에 그대로 두면
  // 흰 배경 위 흰 글자(1.0:1)가 되는 곳이 여러 군데였다.
  const isTest = !!draft?.is_test
  // 테스트 세션은 리그에 아무것도 안 남기므로, 감독관 코드로도 지울 수 있게 서버가 허용한다.
  // 버튼을 감춰 두면 리허설 뒷정리를 CEO 에게 부탁해야 한다.
  const showDelete = canDelete || isTest

  const testBadge = isTest ? (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[var(--mm-yellow)] text-[var(--mm-black)] text-sm font-black tracking-wider shrink-0">
      <FlaskConical size={16} aria-hidden /> TEST · 리그 미반영
    </span>
  ) : null

  const chipButton = 'text-sm px-2.5 min-h-11 rounded bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mm-ground)]'

  // 위험 액션 확인 모달 — 이른 return 이 여러 갈래라 JSX 를 한 번 만들어 각 갈래에 붙인다.
  const confirmModal = (
    <ConfirmModal
      open={!!pendingConfirm}
      title={pendingConfirm?.title ?? ''}
      lines={pendingConfirm?.lines ?? []}
      danger
      confirmLabel={pendingConfirm?.confirmLabel ?? '확인'}
      onCancel={() => setPendingConfirm(null)}
      onConfirm={() => {
        const run = pendingConfirm?.run
        setPendingConfirm(null)
        void run?.()
      }}
    />
  )

  // ── 풀·팀장 편집 블록 (세션 없음 또는 setup 에서 공통 사용) ──
  const editorBlock = (
    <div className="space-y-5">
      <div>
        <label className="text-sm text-[var(--mm-ink-soft)] font-bold flex items-center gap-1.5 mb-2">
          <Crown size={14} className="text-[var(--mm-yellow-strong)]" /> 팀장(단장) 지정 — 드래프트 풀에서 자동 제외
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {teams.map(t => (
            <div key={t.id} className="bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] rounded-lg p-2.5 space-y-1.5" style={{ borderTopColor: t.color, borderTopWidth: 2 }}>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                <span className="text-[var(--mm-ink)] font-bold text-sm truncate">{t.name}</span>
              </div>
              <select aria-label={`${t.name} 팀장 선택`} value={leaderDraft[t.id] ?? ''} onChange={e => setLeaderDraft(prev => ({ ...prev, [t.id]: e.target.value }))}
                className="w-full bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded px-2 min-h-11 text-sm text-[var(--mm-ink)] cursor-pointer">
                <option value="">— 팀장 선택 —</option>
                {activePlayers.map(p => <option key={p.id} value={p.id}>{p.name}{p.number != null ? ` #${p.number}` : ''}</option>)}
              </select>
            </div>
          ))}
        </div>
        {leaderPrefilled && (
          <p className="text-sm text-[var(--mm-ink-soft)] leading-relaxed mt-2 break-keep">
            단장 코드에 연결된 선수를 자동으로 채웠습니다 — 필요하면 바꾸세요
          </p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <label className="text-sm text-[var(--mm-ink-soft)] font-bold flex items-center gap-1.5 flex-wrap">
            <Users size={14} className="text-[var(--mm-positive)]" /> 드래프트 참여 선수 ({poolSel.size}명 선택 / 전체 {activePlayers.length}명)
            {guestExcluded > 0 && (
              <span className="text-[var(--mm-muted)] font-normal">(게스트 {guestExcluded}명 제외)</span>
            )}
          </label>
          <div className="flex gap-1.5">
            <button onClick={() => setPoolSel(new Set(activePlayers.filter(p => !leaderIds.has(p.id)).map(p => p.id)))} className={chipButton}>전체 선택</button>
            <button onClick={() => setPoolSel(new Set())} className={chipButton}>해제</button>
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-1.5 pr-1">
          {activePlayers.map(p => {
            const isLeader = leaderIds.has(p.id)
            const checked = poolSel.has(p.id)
            return (
              <button key={p.id} disabled={isLeader}
                onClick={() => setPoolSel(prev => { const n = new Set(prev); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n })}
                className={`flex items-center gap-2 px-2.5 py-2 min-h-11 rounded-lg border text-left text-sm transition-colors min-w-0 ${
                  isLeader ? 'bg-[var(--mm-yellow-soft)] border-[var(--mm-yellow-strong)]/40 opacity-70 cursor-not-allowed'
                  : checked ? 'bg-[var(--mm-positive-bg)] border-[var(--mm-positive)]/50 cursor-pointer'
                  : 'bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] hover:border-[var(--mm-muted)] cursor-pointer'
                }`}>
                {isLeader ? <Crown size={14} className="text-[var(--mm-yellow-strong)] shrink-0" /> : checked ? <CheckCircle2 size={14} className="text-[var(--mm-positive)] shrink-0" /> : <Circle size={14} className="text-[var(--mm-muted)] shrink-0" />}
                <span className="text-[var(--mm-ink)] font-bold truncate min-w-0">{p.name}</span>
                {p.number != null && <span className="text-sm text-[var(--mm-muted)] shrink-0">#{p.number}</span>}
                {isLeader && <span className="text-sm text-[var(--mm-yellow-strong)] ml-auto shrink-0 font-bold">팀장</span>}
              </button>
            )
          })}
        </div>
        {players.length === 0 && (
          <p className="text-sm text-[var(--mm-yellow-strong)] mt-2 leading-relaxed">등록된 리그 선수가 없습니다. 선수단(로스터) 페이지에서 선수를 먼저 등록하세요.</p>
        )}
      </div>
    </div>
  )

  // ── 공유 링크 블록 ──
  // 예전에는 마지막 return(ready_check 이후)에만 있었다. 그래서 세션을 막 만든 setup 단계에서는
  // 링크를 꺼낼 방법이 없었고, 운영자가 링크를 보내려면 먼저 「준비 체크 시작」을 눌러야 했다
  // — 아무도 입장하지 않았는데 전원 화면이 READY 로 넘어가 버린다. 모든 단계에서 렌더한다.
  const shareBlock = !draft ? (
    <div className="rounded-lg border border-dashed border-[var(--mm-rule)] bg-[var(--mm-panel-alt)] p-3">
      <p className="text-base text-[var(--mm-ink-soft)] leading-relaxed break-keep">
        세션을 먼저 만들면 여기에서 공유 링크를 발급할 수 있습니다.
      </p>
    </div>
  ) : draft.status === 'completed' ? null : (
    <div className="rounded-lg border border-[var(--mm-rule)] bg-[var(--mm-panel-alt)] p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Link2 size={16} className="text-[var(--mm-ink-soft)]" />
        <p className="text-base font-bold text-[var(--mm-ink)]">공유 링크</p>
        <span className="text-sm text-[var(--mm-muted)]">단장·총무가 들어오는 주소입니다</span>
      </div>
      {draft.share_token ? (
        <div className="space-y-2">
          {/* 운영자가 카톡으로 그대로 보내는 값 — 두 테마 모두에서 확실히 읽혀야 한다 */}
          <div className="flex items-center gap-1.5 bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-md p-2">
            <code className="font-mono text-sm text-[var(--mm-ink)] flex-1 truncate select-all">
              {typeof window !== 'undefined' ? `${window.location.origin}/draft/${draft.share_token}` : `/draft/${draft.share_token}`}
            </code>
            <button onClick={copyShareUrl} aria-label={tokenCopied ? '공유 링크 복사됨' : '공유 링크 복사'} className={`px-3 min-h-11 rounded text-sm font-bold cursor-pointer flex items-center gap-1 transition-colors duration-200 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mm-ground)] ${tokenCopied ? 'bg-[var(--mm-positive-bg)] text-[var(--mm-positive-fg)]' : 'bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90'}`}>
              {tokenCopied ? <Check size={16} /> : <Copy size={16} />}
              {tokenCopied ? '복사됨' : '복사'}
            </button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <Button onClick={requestGenerateShareToken} disabled={acting} variant="outline" className="text-sm min-h-11 bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] cursor-pointer">
              <RotateCcw size={16} className="mr-1" /> 재발급
            </Button>
            {/* 폐기는 기존 링크를 죽이는 파괴 액션 — 재발급과 같은 톤으로 두지 않는다 */}
            <Button onClick={requestRevokeShareToken} disabled={acting} variant="outline" className="text-sm min-h-11 bg-[var(--mm-negative-bg)] border-[var(--mm-negative)]/40 text-[var(--mm-negative)] hover:text-[var(--mm-negative)] hover:border-[var(--mm-negative)]/70 cursor-pointer">
              <X size={16} className="mr-1" /> 폐기
            </Button>
          </div>
        </div>
      ) : (
        <Button onClick={requestGenerateShareToken} disabled={acting} className="bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 text-base min-h-11 w-full sm:w-auto font-bold cursor-pointer">
          <Link2 size={16} className="mr-1" /> 공유 링크 생성
        </Button>
      )}
    </div>
  )

  // 스테퍼 ④ 칸 — 공유 링크만 떼어 쓴다
  if (section === 'share') {
    return <>{shareBlock}{confirmModal}</>
  }

  // ── 세션 없음 — 생성 ──
  if (!draft) {
    return (
      <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-4 sm:p-5 space-y-5">
        <div>
          <h3 className="font-bold text-[var(--mm-ink)] text-lg sm:text-xl mb-1.5">드래프트 세션 생성</h3>
          <p className="text-sm text-[var(--mm-ink-soft)] leading-relaxed">팀장(단장)을 지정하고 드래프트 참여 선수를 선별하세요. 픽 순서는 추첨으로 정합니다 (모든 팀 같은 확률, 스네이크 방식).</p>
        </div>
        {editorBlock}

        {/* 리허설 스위치 — 생성 시점에만 고를 수 있다 */}
        <div className="rounded-lg border border-[var(--mm-rule)] bg-[var(--mm-panel-alt)] p-3">
          <label className="flex items-start gap-3 min-h-11 cursor-pointer">
            <input
              type="checkbox"
              checked={isTestNew}
              onChange={e => setIsTestNew(e.target.checked)}
              className="mt-1 w-5 h-5 shrink-0 cursor-pointer accent-[var(--mm-yellow-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mm-ground)]"
            />
            <span className="min-w-0">
              <span className="block text-base font-bold text-[var(--mm-ink)] break-keep">
                테스트 세션 — 리그에 반영하지 않음 (리허설용)
              </span>
              <span className="block text-sm text-[var(--mm-ink-soft)] leading-relaxed mt-1 break-keep">
                픽·추첨·채팅은 그대로 진행되지만 분기 소속과 팀장은 기록되지 않습니다. 끝나면 세션을 삭제하세요.
              </span>
            </span>
          </label>
        </div>

        <Button onClick={createSession} disabled={acting} className="w-full bg-[var(--mm-yellow)] text-[var(--mm-black)] hover:opacity-90 text-base sm:text-lg font-bold h-12 cursor-pointer">
          {isTestNew ? '테스트 세션 생성' : '드래프트 세션 생성'}
        </Button>
      </div>
    )
  }

  const ready = draft.ready_state ?? {}
  const allTeamsReady = teams.every(t => ready[t.id])

  // ── setup — 풀/팀장 수정 + 준비 시작 ──
  if (draft.status === 'setup') {
    return (
      <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-4 sm:p-5 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          {/* 페이즈 이름은 상단 hero(포털) · 스테퍼 헤더(리그 페이지)가 이미 말한다.
              여기서 또 「참여 설정 (준비 단계)」+「준비」 배지를 내면 한 화면에 3번이 된다. */}
          <div className="flex items-center gap-2">{testBadge}</div>
          <div className="flex gap-1.5 flex-wrap">
            <Button onClick={savePoolLeaders} disabled={acting} variant="outline" className="text-sm min-h-11 border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] cursor-pointer"><Save size={16} className="mr-1" /> 설정 저장</Button>
            {/* 진행(준비 체크)은 총무가 포털에서 한다 — 리그 페이지 스테퍼(section='editor')에서는 감춘다 */}
            {section === 'all' && (
              <Button onClick={openReady} disabled={acting} className="bg-[var(--mm-yellow)] text-[var(--mm-black)] hover:opacity-90 text-sm min-h-11 font-bold cursor-pointer"><Play size={16} className="mr-1" /> 준비 체크 시작</Button>
            )}
            {/* 세션 삭제만 negative — 나머지 두 버튼과 같은 톤이면 손이 안 멈춘다 */}
            {showDelete && (
              <Button onClick={requestDeleteSession} disabled={acting} variant="outline" className="text-sm min-h-11 border-[var(--mm-negative)]/40 bg-[var(--mm-negative-bg)] text-[var(--mm-negative)] hover:border-[var(--mm-negative)]/70 hover:text-[var(--mm-negative)] cursor-pointer"><Trash2 size={16} className="mr-1" /> 세션 삭제</Button>
            )}
          </div>
        </div>
        {isTest && (
          <p className="text-base text-[var(--mm-ink-soft)] leading-relaxed break-keep">
            <b className="text-[var(--mm-ink)]">테스트 세션</b>입니다. 팀장·픽 결과가 분기 소속에 반영되지 않습니다 — 진행은 실전과 똑같습니다.
          </p>
        )}
        <p className="text-base text-[var(--mm-ink-soft)] leading-relaxed break-keep">
          현재 풀 {pool.length}명 · 팀장 {Object.values(leaderDraft).filter(Boolean).length}명.
          {section === 'all'
            ? <> 변경 후 <b className="text-[var(--mm-ink)]">설정 저장</b>을 누른 뒤 <b className="text-[var(--mm-yellow-strong)]">준비 체크 시작</b>으로 진행하세요.</>
            : <> 바꿨다면 <b className="text-[var(--mm-ink)]">설정 저장</b>을 누르세요.</>}
        </p>
        {editorBlock}
        {section === 'all' && shareBlock}
        {confirmModal}
      </div>
    )
  }

  // ── ready_check / in_progress / completed ──
  // 액션 위계 정리:
  //  - 상단 큰 Primary CTA (현재 phase 에서 가장 자연스러운 다음 단계)
  //  - 보조 액션 row (강제 옵션 등 부수 컨트롤)
  //  - 위험 액션은 <details> 안에 격리 (리셋 / 삭제 / 강제 종료)
  //  → 모바일 라이브 진행 중 오클릭 위험 차단.
  //
  // NOTE: phase 헤드라인/단계 stepper 는 DraftPortalClient 상단 hero 가 이미 표시한다.
  // 감독관 패널에서 중복 노출하지 않고, Primary CTA 자체가 phase 를 함축하도록 한다.
  // 「추첨부터 다시」 노출 조건 — 추첨 이후 단계의 테스트 세션에만.
  // 실전 세션에는 일부러 안 낸다(실전에서 픽을 지우는 건 전체 리셋으로만).
  const showRestartLottery = isTest
    && (['lottery_waiting', 'lottery_done', 'in_progress', 'completed'] as const).some(s => s === draft.status)

  let primary: { label: ReactNode; onClick: () => void | Promise<void>; disabled?: boolean; helper?: string } | null = null
  if (draft.status === 'ready_check') {
    primary = {
      label: allTeamsReady
        ? (<span className="inline-flex items-center gap-2"><Video size={20} aria-hidden /> 추첨 대기 화면 열기</span>)
        : (<span className="inline-flex items-center gap-2"><Hand size={20} aria-hidden /> 전원 준비 대기 중</span>),
      onClick: () => requestOpenLotteryWait(false),
      disabled: acting || !allTeamsReady,
      helper: allTeamsReady
        ? '버튼을 누르면 모든 화면이 추첨 대기 모드로 전환됩니다.'
        : '모든 팀이 READY가 되면 버튼이 활성화됩니다.',
    }
  } else if (draft.status === 'lottery_waiting') {
    primary = {
      label: (<span className="inline-flex items-center gap-2"><Dice5 size={20} aria-hidden /> 추첨 시작</span>),
      onClick: runLottery,
      disabled: acting,
      helper: '준비가 끝났다면 즉시 NBA 스타일 추첨 연출이 모두에게 재생됩니다.',
    }
  } else if (draft.status === 'lottery_done') {
    primary = {
      label: (<span className="inline-flex items-center gap-2"><Trophy size={20} aria-hidden /> 드래프트 시작</span>),
      onClick: startDraft,
      disabled: acting,
      helper: '버튼을 누르면 픽 타이머가 시작되고 1번 팀부터 픽이 진행됩니다.',
    }
  }

  return (
    <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-4 sm:p-5 space-y-5">
      {/* ── 명령 센터 헤드 ── 메타 정보 + Primary CTA + 도움 문구 (phase 헤드라인은 상단 hero 가 담당) */}
      <div className="space-y-3">
        {/* 메타 — 풀/팀장/픽 진행 수치만. phase 텍스트 중복 제거. */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <p className="text-base text-[var(--mm-ink-soft)] leading-relaxed min-w-0 flex-1">
            풀 <b className="text-[var(--mm-ink)] tabular-nums">{pool.length}</b>명 · 팀장 <b className="text-[var(--mm-ink)] tabular-nums">{leaders.filter(l => l.leader_player_id).length}</b>명 · <b className="text-[var(--mm-ink)] tabular-nums">{draft.total_picks}</b>픽 완료
          </p>
          {testBadge}
          {draft.status === 'in_progress' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--mm-positive-bg)] border border-[var(--mm-positive)]/40 text-[var(--mm-positive-fg)] text-sm font-bold">
              <span className="w-2 h-2 rounded-full bg-[var(--mm-positive)] animate-pulse" /> 진행 중
            </span>
          )}
          {draft.status === 'completed' && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[var(--mm-neutral-bg)] border border-[var(--mm-rule)] text-[var(--mm-neutral-fg)] text-sm font-bold">
              종료
            </span>
          )}
        </div>

        {/* Primary CTA — phase 에서 가장 자연스러운 다음 단계, full-width 모바일 친화.
            포털은 페이즈 카드가 같은 버튼을 이미 크게 내므로 showPrimary=false 로 끈다. */}
        {primary && showPrimary && (
          <div className="space-y-2">
            <Button
              onClick={primary.onClick}
              disabled={primary.disabled}
              className="w-full bg-[var(--mm-yellow)] text-[var(--mm-black)] hover:opacity-90 font-black text-lg sm:text-xl py-3 min-h-[56px] sm:min-h-[64px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mm-ground)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {primary.label}
            </Button>
            {primary.helper && (
              <p className="text-base text-[var(--mm-ink-soft)] leading-relaxed text-center break-keep">{primary.helper}</p>
            )}
          </div>
        )}

        {/* 보조 액션 — 강제 옵션 / 리허설 재시작 */}
        {(draft.status === 'ready_check' || showRestartLottery) && (
          <div className="flex flex-wrap gap-1.5 justify-center">
            {draft.status === 'ready_check' && (
              <Button onClick={() => requestOpenLotteryWait(true)} disabled={acting} variant="outline" className="text-sm min-h-11 border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mm-ground)]">
                <Zap size={16} className="mr-1" aria-hidden /> 준비 안 된 사람 빼고 열기
              </Button>
            )}
            {/* 위험 액션 details 안이 아니라 여기 둔다 — 리허설에서는 "한 번 더 돌리기"가
                예외가 아니라 기본 동작이라, 매번 접힌 서랍을 열게 할 이유가 없다. */}
            {showRestartLottery && (
              <Button onClick={requestRestartLottery} disabled={acting} variant="outline" className="text-sm min-h-11 border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mm-ground)]">
                <RotateCcw size={16} className="mr-1" aria-hidden /> 추첨부터 다시
              </Button>
            )}
          </div>
        )}
      </div>

      {/* 위험 액션 격리 — details 로 접어둠 */}
      <details className="rounded-lg border border-[var(--mm-negative)]/30 bg-[var(--mm-negative-bg)] group">
        <summary className="cursor-pointer select-none px-3 py-2.5 min-h-11 text-sm font-bold text-[var(--mm-negative)] flex items-center gap-2 list-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-negative)] rounded-lg">
          <span className="inline-flex items-center justify-center text-[var(--mm-negative)]" aria-hidden><AlertTriangle size={16} /></span>
          <span>되돌릴 수 없는 작업</span>
          <span className="ml-auto text-sm text-[var(--mm-negative)] group-open:hidden">펼치기</span>
          <span className="ml-auto text-sm text-[var(--mm-negative)] hidden group-open:inline">접기</span>
        </summary>
        <div className="border-t border-[var(--mm-negative)]/30 p-3 flex flex-wrap gap-1.5">
          {draft.status === 'in_progress' && (
            <Button onClick={requestCompleteSession} disabled={acting} variant="outline" className="text-sm min-h-11 border-[var(--mm-negative)]/40 text-[var(--mm-negative)] bg-[var(--mm-panel)] hover:text-[var(--mm-negative)] hover:border-[var(--mm-negative)]/70 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--mm-negative)]">
              <Square size={14} className="mr-1" /> 강제 종료
            </Button>
          )}
          <Button onClick={requestResetSession} disabled={acting} variant="outline" className="text-sm min-h-11 border-[var(--mm-negative)]/40 text-[var(--mm-negative)] bg-[var(--mm-panel)] hover:text-[var(--mm-negative)] hover:border-[var(--mm-negative)]/70 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--mm-negative)]">
            <RotateCcw size={14} className="mr-1" /> 리셋
          </Button>
          {showDelete && (
            <Button onClick={requestDeleteSession} disabled={acting} variant="outline" className="text-sm min-h-11 border-[var(--mm-negative)]/40 text-[var(--mm-negative)] bg-[var(--mm-panel)] hover:text-[var(--mm-negative)] hover:border-[var(--mm-negative)]/70 cursor-pointer focus-visible:ring-2 focus-visible:ring-[var(--mm-negative)]">
              <Trash2 size={14} className="mr-1" /> 세션 삭제
            </Button>
          )}
        </div>
      </details>

      {/* ── 페이즈 세부 — 팀장 / 준비 / 추첨 결과 단일 카드 ── */}
      <div className="rounded-lg border border-[var(--mm-rule)] bg-[var(--mm-panel-alt)] p-3 sm:p-4 space-y-3">
        {/* 팀장 라인업 — 항상 표시 */}
        <div>
          <p className="text-sm text-[var(--mm-ink-soft)] font-bold mb-2 flex items-center gap-1.5">
            <Crown size={16} className="text-[var(--mm-yellow-strong)]" /> 팀장 라인업
          </p>
          <div className="flex flex-wrap gap-1.5">
            {teams.map(t => {
              const lid = leaders.find(l => l.team_id === t.id)?.leader_player_id
              return (
                <span key={t.id} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[var(--mm-panel)] border border-[var(--mm-rule)] text-sm">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                  <span className="text-[var(--mm-ink)] font-bold">{t.name}</span>
                  <span className="text-[var(--mm-ink-soft)]">{lid ? (playerMap[lid]?.name ?? '?') : '미지정'}</span>
                </span>
              )
            })}
          </div>
        </div>

        {/* 준비 현황 — ready_check 단계에서만 */}
        {draft.status === 'ready_check' && (
          <div className="pt-3 border-t border-[var(--mm-rule)]">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <p className="text-sm text-[var(--mm-ink-soft)] font-bold">참가자 준비 현황</p>
              <button onClick={() => fetchData(true)} className={`inline-flex items-center gap-1 ${chipButton}`} aria-label="준비 현황 새로고침">
                <RefreshCw size={16} /> 새로고침
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {teams.map(t => (
                <span key={t.id} className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm ${ready[t.id] ? 'bg-[var(--mm-positive-bg)] border-[var(--mm-positive)]/40 text-[var(--mm-positive-fg)]' : 'bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink-soft)]'}`}>
                  {ready[t.id] ? <CheckCircle2 size={16} /> : <Circle size={16} />}{t.name} 단장
                </span>
              ))}
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-sm ${ready['supervisor'] ? 'bg-[var(--mm-positive-bg)] border-[var(--mm-positive)]/40 text-[var(--mm-positive-fg)]' : 'bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink-soft)]'}`}>
                {ready['supervisor'] ? <CheckCircle2 size={16} /> : <Circle size={16} />}총무
              </span>
            </div>
          </div>
        )}

        {/* 추첨 결과 — lottery_done 이후 */}
        {draft.lottery_done && draft.draft_order.length > 0 && (
          <div className="pt-3 border-t border-[var(--mm-rule)]">
            <p className="text-sm text-[var(--mm-ink-soft)] font-bold mb-2">추첨 결과 — 픽 순서</p>
            <div className="flex flex-wrap gap-1.5">
              {/* 확률(%)은 뺐다 — 균등 추첨이라 팀마다 같은 숫자가 찍힌다. 정보가 0인 칸이었다. */}
              {draft.draft_order.map((tid, idx) => {
                const t = teamMap[tid]
                return (
                  <div key={`${tid}-${idx}`} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[var(--mm-panel)] border border-[var(--mm-rule)] text-sm">
                    <span className="text-[var(--mm-ink-soft)] font-bold tabular-nums">{idx + 1}.</span>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t?.color }} />
                    <span className="text-[var(--mm-ink)] font-bold">{t?.name ?? '?'}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* 공유 링크 — 정의는 위 shareBlock 한 곳. 모든 단계에서 같은 마크업이 나간다. */}
      {section === 'all' && shareBlock}

      {/* 최근 픽 목록 제거 — 상단 스코어보드(DraftScoreboard)가 모든 픽을
          단일 소스로 보여주므로 여기서 중복 노출하지 않음. */}
      {confirmModal}
    </div>
  )
}
