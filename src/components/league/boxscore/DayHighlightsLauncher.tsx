'use client'
// 박스스코어 「하이라이트 보기」 — 그날 클립을 골라 바로 전체화면 연속 재생 (2026-10-14).
//
// 범위 세 가지: 전체(그날 모든 클립) · 우리 팀(내가 그 경기에서 뛴 팀의 득점) · 내 기록(내 득점 + 내 어시스트).
//
// 규칙
//   · 클립 정의는 하이라이트 피드와 같다 — `GET /highlights/[date]`(= loadRoundDetail) 를 그대로 받는다.
//     새 클립 정의를 만들지 않는다. 친선전 클립도 들어온다(박스스코어·하이라이트 모두 친선전을 남긴다).
//   · 순서는 경기 슬롯 → 영상 시각. (로더는 game_id 문자열 순이라 여기서 슬롯 번호로 다시 줄 세운다)
//   · 「우리 팀」의 팀은 경기마다 박스스코어가 이미 판정한 소속(daily-boxscore — 경기 한정 배정 →
//     이벤트 team_id → 분기 소속)을 그대로 쓴다. 분기마다·경기마다 팀이 바뀌므로 경기 단위로 푼다.
//   · 회원 전용 — 서버(canViewStats)가 막고, 화면은 로그인한 회원·CEO 에게만 펼친다.
//   · 데이터는 사용자가 펼칠 때 한 번 받는다(박스스코어 첫 화면을 느리게 하지 않게).
//   · 재생은 공용 HighlightsPlayer 의 몰입 모드(immersiveOnly) — 재생기를 따로 만들지 않는다.
//     ⚠ openImmersive() 는 클릭 핸들러 안에서 동기로 부른다(Fullscreen API 는 사용자 제스처 안에서만 열린다).
//     재생기는 펼칠 때 미리 화면 밖에 띄워 영상을 준비해 둔다 — 누른 뒤에 만들면 iPhone 이 재생을 막는다.
//   · 기본은 **접힘**(사용자 결정). 펼친 채로 여는 건 명시적 딥링크뿐이다 — `?hl=mine|team|all`
//     (홈 경기일 카드 「내 하이라이트 ▶」, 2026-10-15). 그때도 재생은 사용자가 한 번 더 눌러야 시작된다(위 ⚠).
//     고른 범위가 비어 있으면(그날 안 뛰었음 등) 「전체」로 보인다.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, ChevronUp, Clapperboard, Loader2, Play } from 'lucide-react'
import HighlightsPlayer, { type HighlightsPlayerHandle } from '@/components/highlights/HighlightsPlayer'
import SegmentedTabs from '@/components/league/ui/SegmentedTabs'
import { useCurrentUser } from '@/contexts/LeagueAuthContext'
import type { HighlightClip } from '@/lib/highlights/types'

export type HighlightScope = 'all' | 'team' | 'mine'
type Scope = HighlightScope

/** 박스스코어 경기(롤업 결과) 중 여기서 쓰는 것만 */
export type LauncherGame = {
  id: string
  slot_num: number
  slot_nums?: number[]
  slot_ids?: string[]
  players: { player_id: string; team_id: string | null }[]
}

type LoadState = 'idle' | 'loading' | 'ready' | 'login' | 'error'

export default function DayHighlightsLauncher({
  leagueId, date, games, initialScope,
}: {
  leagueId: string; date: string; games: LauncherGame[]
  /** 딥링크(?hl=)로 들어왔을 때만 — 펼친 채로 그 범위를 골라 둔다 */
  initialScope?: HighlightScope | null
}) {
  const { user, ceo, loading: authLoading } = useCurrentUser()
  const canView = !!user || ceo
  const meId = user?.player_id ?? null

  const [open, setOpen] = useState(!!initialScope)
  const [state, setState] = useState<LoadState>('idle')
  const [clips, setClips] = useState<HighlightClip[]>([])
  const [scope, setScope] = useState<Scope>(initialScope ?? 'all')
  const [idx, setIdx] = useState(0)
  // 재생기를 새로 띄우는 열쇠 — 범위를 바꾸거나 전체화면을 닫으면 처음 클립에 멈춘 새 재생기로 갈아 끼운다
  const [playerKey, setPlayerKey] = useState(0)
  const playerRef = useRef<HighlightsPlayerHandle | null>(null)

  // 슬롯 id → 슬롯 번호 · 슬롯 id → 그 슬롯이 속한 경기(롤업)
  const { slotNumOf, gameOf } = useMemo(() => {
    const slotNumOf = new Map<string, number>()
    const gameOf = new Map<string, LauncherGame>()
    for (const g of games) {
      const ids = g.slot_ids && g.slot_ids.length > 0 ? g.slot_ids : [g.id]
      const nums = g.slot_nums && g.slot_nums.length === ids.length ? g.slot_nums : ids.map(() => g.slot_num)
      ids.forEach((sid, i) => { slotNumOf.set(sid, nums[i]); gameOf.set(sid, g) })
      gameOf.set(g.id, g)
      if (!slotNumOf.has(g.id)) slotNumOf.set(g.id, g.slot_num)
    }
    return { slotNumOf, gameOf }
  }, [games])

  // 그날 내가 뛴 경기가 있는가 — 「우리 팀」은 경기마다 그 경기의 내 팀으로 판정한다
  const playedToday = useMemo(
    () => !!meId && games.some(g => g.players.some(p => p.player_id === meId)),
    [games, meId],
  )

  const sorted = useMemo(() => {
    const slot = (c: HighlightClip) => slotNumOf.get(c.game_id) ?? Number.MAX_SAFE_INTEGER
    return [...clips].sort((a, b) =>
      (slot(a) - slot(b)) || a.game_id.localeCompare(b.game_id) || (a.video_timestamp - b.video_timestamp))
  }, [clips, slotNumOf])

  const lists = useMemo(() => {
    const playable = sorted.filter(c => !!c.video_id)
    const team = !meId ? [] : playable.filter(c => {
      const g = gameOf.get(c.game_id)
      const myTeam = g?.players.find(p => p.player_id === meId)?.team_id ?? null
      return !!myTeam && c.team_id === myTeam
    })
    const mine = !meId ? [] : playable.filter(c => c.player_id === meId || c.assist_player_id === meId)
    return { all: playable, team, mine } satisfies Record<Scope, HighlightClip[]>
  }, [sorted, meId, gameOf])

  const load = useCallback(async () => {
    setState('loading')
    try {
      const r = await fetch(`/api/leagues/${leagueId}/highlights/${date}`)
      if (r.status === 401) { setState('login'); return }
      if (!r.ok) { setState('error'); return }
      const d = await r.json() as { clips?: HighlightClip[] }
      setClips(d.clips ?? [])
      setState('ready')
    } catch {
      setState('error')
    }
  }, [leagueId, date])

  function toggle() {
    const next = !open
    setOpen(next)
    if (next && state === 'idle' && canView) void load()
  }

  // 딥링크로 펼친 채 열렸을 때 — 로그인 확인이 끝나면 한 번 받는다(펼침 버튼을 누른 것과 같은 요청)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 로그인 확인(외부 상태)이 끝난 뒤 1회 조회 시작
    if (open && state === 'idle' && canView && !authLoading) void load()
  }, [open, state, canView, authLoading, load])

  const teamHint = !user ? '로그인한 회원만' : !playedToday ? '이날 출전 기록이 없어요' : null
  const mineHint = !user ? '로그인한 회원만' : null

  // 「전체」는 나머지 둘을 품으므로 기본값으로 두면 0개짜리가 골라져 있을 일이 없다.
  //   딥링크가 고른 범위가 막혀 있거나 비어 있으면 「전체」로 보인다(빈 재생 버튼을 남기지 않는다).
  const blocked = (k: Scope) => (k === 'team' && !!teamHint) || (k === 'mine' && !!mineHint) || lists[k].length === 0
  const shownScope: Scope = scope !== 'all' && blocked(scope) ? 'all' : scope
  const current = lists[shownScope]

  function pickScope(k: Scope) {
    if (k === shownScope) return
    setScope(k)
    setIdx(0)
    setPlayerKey(n => n + 1)
  }

  const onImmersiveChange = useCallback((isOpen: boolean) => {
    // 닫으면 처음 클립에 멈춘 새 재생기로 — 다음에 누르면 다시 처음부터
    if (!isOpen) { setIdx(0); setPlayerKey(n => n + 1) }
  }, [])

  const label = (text: string, n: number | null) => (
    <span className="inline-flex items-center gap-1">
      {text}
      {n !== null && <span className="tabular-nums" style={{ opacity: 0.75 }}>{n}</span>}
    </span>
  )

  const ready = state === 'ready'

  return (
    <div className="shrink-0 px-4 lg:px-6 py-2.5" style={{ background: 'var(--mm-panel)', borderBottom: '1px solid var(--mm-rule)' }}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls="day-highlights-panel"
        className="w-full inline-flex items-center justify-between sm:justify-center gap-2 min-h-11 px-3 text-sm font-bold cursor-pointer transition-colors duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-1"
        style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-chip)' }}
      >
        <span className="inline-flex items-center gap-2">
          <Clapperboard size={16} aria-hidden style={{ color: 'var(--mm-yellow-strong)' }} />
          하이라이트 보기
        </span>
        {open ? <ChevronUp size={18} aria-hidden /> : <ChevronDown size={18} aria-hidden />}
      </button>

      {open && (
        // PC: 범위 탭·재생 버튼이 1000px 로 늘어나지 않게 가운데 폭을 묶는다(토글 글자도 가운데)
        <div id="day-highlights-panel" className="mt-2.5 space-y-2.5 sm:max-w-lg sm:mx-auto">
          {authLoading ? (
            <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--mm-muted)' }} /></div>
          ) : !canView || state === 'login' ? (
            <p className="text-sm px-1" style={{ color: 'var(--mm-muted)' }}>로그인한 회원만 볼 수 있어요.</p>
          ) : state === 'error' ? (
            <div className="flex items-center gap-2 px-1">
              <p className="text-sm" style={{ color: 'var(--mm-muted)' }}>하이라이트를 불러오지 못했어요.</p>
              <button
                type="button"
                onClick={() => void load()}
                className="inline-flex items-center min-h-11 px-3 text-sm font-bold underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                style={{ color: 'var(--mm-ink)' }}
              >
                다시 시도
              </button>
            </div>
          ) : !ready ? (
            <div className="flex justify-center py-4"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--mm-muted)' }} /></div>
          ) : lists.all.length === 0 ? (
            <p className="text-sm px-1" style={{ color: 'var(--mm-muted)' }}>이날은 아직 하이라이트가 없어요.</p>
          ) : (
            <>
              <SegmentedTabs
                items={[
                  { key: 'all', label: label('전체', lists.all.length) },
                  { key: 'team', label: label('우리 팀', teamHint ? null : lists.team.length), disabled: !!teamHint || lists.team.length === 0 },
                  { key: 'mine', label: label('내 기록', mineHint ? null : lists.mine.length), disabled: !!mineHint || lists.mine.length === 0 },
                ]}
                value={shownScope}
                onChange={pickScope}
                ariaLabel="하이라이트 범위"
                size="md"
                fullWidth
              />
              {teamHint && (
                <p className="text-xs px-1" style={{ color: 'var(--mm-muted)' }}>
                  {!user ? '우리 팀 · 내 기록은 로그인한 회원만 볼 수 있어요.' : '이날 출전 기록이 없어요 — 우리 팀은 고를 수 없어요.'}
                </p>
              )}
              <button
                type="button"
                // ⚠ 동기 호출 — Fullscreen API 는 이 탭(사용자 제스처) 안에서만 열린다
                onClick={() => playerRef.current?.openImmersive()}
                disabled={current.length === 0}
                className="w-full inline-flex items-center justify-center gap-2 min-h-12 px-4 text-base font-black cursor-pointer transition-all duration-200 hover:brightness-95 active:scale-[0.99] disabled:opacity-40 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-black)] focus-visible:ring-offset-1"
                style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', borderRadius: 'var(--mm-radius-chip)' }}
                aria-label={`${current.length}개 클립을 전체화면으로 이어서 재생`}
              >
                <Play size={18} fill="currentColor" aria-hidden />
                전체화면으로 재생
                <span className="tabular-nums font-bold">· {current.length}개</span>
              </button>
            </>
          )}
        </div>
      )}

      {/* 화면 밖에서 영상을 미리 준비하는 재생기 — fixed 위치가 조상의 transform 에 끌려가지 않게 body 로 띄운다 */}
      {open && ready && current.length > 0 && createPortal(
        <HighlightsPlayer
          key={`${shownScope}-${playerKey}`}
          ref={playerRef}
          clips={current}
          currentIdx={Math.min(idx, current.length - 1)}
          onIndexChange={setIdx}
          onImmersiveChange={onImmersiveChange}
          immersiveOnly
        />,
        document.body,
      )}
    </div>
  )
}
