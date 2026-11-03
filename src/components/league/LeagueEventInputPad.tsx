'use client'
import { useState, useEffect, useRef } from 'react'
import { Handshake, CircleDashed, Crosshair, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { useGameStore } from '@/store/gameStore'
import type { LeaguePlayer } from '@/types/league'
import { textOnBg, accentOrInk, teamInk } from '@/lib/util/contrastColor'

type RosterPlayer = LeaguePlayer & { team_id?: string; is_regular?: boolean }

interface Props {
  leagueId: string
  gameId: string
  homePlayers?: RosterPlayer[]
  awayPlayers?: RosterPlayer[]
  homeTeam?: { id: string; name: string; color: string; is_external?: boolean }
  awayTeam?: { id: string; name: string; color: string; is_external?: boolean }
  leagueHeaders: Record<string, string>
  /**
   * 기록이 저장·취소될 때 부른다. `eventType` 은 방금 바뀐 기록의 종류 —
   * 부모가 파울 수처럼 특정 종류만 다시 셀 때 쓴다(모르면 undefined).
   */
  onEventSaved: (eventType?: string) => void
  /**
   * 선수별 개인 파울 수(이 경기 전체). 부모가 이 경기 기록에서 센다.
   * 4개부터 주의, 5개(퇴장 기준)부터 경고로 선수 버튼에 표시한다.
   */
  foulCounts?: Record<string, number>
  activePlusOneIds?: string[]  // per-game override; if set, only these player IDs get +1
  /**
   * 기록 중인 경기 쿼터(1~4, 연장 5~6). league_game_events.quarter 에 그대로 저장된다.
   * 미라클 리그의 짧은 슬롯 경기는 쿼터를 나누지 않아 기본값 1 로 두면 기존과 동일하게 동작한다.
   */
  currentQuarter?: number
  // 대회형 즉석 등록으로 상대 선수가 새로 생겼을 때 알림 — 부모가 전체 로스터를 다시
  // 불러와(loadRoster) 교체 화면 등 다른 화면에도 이 선수가 반영되게 한다.
  // 패드 자체 렌더링은 로컬 상태(addedOpponents)로 즉시 반영되므로 이 콜백이 없어도 동작한다.
  onOpponentRegistered?: () => void
  /**
   * 상대(외부) 선수를 즉석 등록해 **개인 기록까지 남길지**. 기본 true(기존 동작).
   *
   * 대회 기록기는 false 로 넘긴다 — 상대는 우리 동호회 사람이 아니라 명단을 알 수도 없고,
   * 그 기록이 우리 통계에 섞이면 안 된다. 대회의 상대는 **점수만** 남긴다
   * (기록 화면의 「상대 득점」 버튼 → scoring.ts 의 OPPONENT_SCORING).
   */
  opponentRecording?: boolean
}

type EventBtn = {
  type: string
  label: string
  color: string
  activeColor: string
  needsResult?: boolean
  needsRelated?: boolean
}

// 순서: 슈팅 → 리바운드 → 기타 → 자유투
const EVENT_GROUPS: { label: string; cols: number; buttons: EventBtn[] }[] = [
  {
    label: '슈팅', cols: 4,
    buttons: [
      { type: 'shot_3p',       label: '3점슛',  color: 'bg-yellow-600 hover:bg-yellow-500', activeColor: 'bg-yellow-500', needsResult: true, needsRelated: true },
      { type: 'shot_2p_mid',   label: '미들슛',  color: 'bg-blue-600 hover:bg-blue-500',    activeColor: 'bg-blue-500',   needsResult: true, needsRelated: true },
      { type: 'shot_layup',    label: '레이업',  color: 'bg-blue-700 hover:bg-blue-600',    activeColor: 'bg-blue-600',   needsResult: true, needsRelated: true },
      { type: 'shot_post',     label: '골밑슛',  color: 'bg-violet-700 hover:bg-violet-600', activeColor: 'bg-violet-600', needsResult: true, needsRelated: true },
    ],
  },
  {
    label: '리바운드', cols: 2,
    buttons: [
      { type: 'oreb', label: '공격 리바', color: 'bg-green-700 hover:bg-green-600', activeColor: 'bg-green-600' },
      { type: 'dreb', label: '수비 리바', color: 'bg-green-600 hover:bg-green-500', activeColor: 'bg-green-500' },
    ],
  },
  {
    // 「파울」 버튼은 2026-11-03 운영진 결정으로 뺐다 — 2.2만 건 중 파울 기록 3건.
    //   미라클은 파울을 기록하지 않는다. 옛 foul 이벤트·개인 파울 표시(선수 버튼 F4/F5)는 그대로 둔다.
    label: '기타', cols: 3,
    buttons: [
      { type: 'steal',    label: '스틸', color: 'bg-purple-600 hover:bg-purple-500', activeColor: 'bg-purple-500' },
      { type: 'block',    label: '블록', color: 'bg-indigo-600 hover:bg-indigo-500', activeColor: 'bg-indigo-500' },
      { type: 'turnover', label: '턴오버', color: 'bg-red-700 hover:bg-red-600',       activeColor: 'bg-red-600' },
    ],
  },
  {
    // 자유투는 패드에 「자유투」 한 칸만(2026-11-03, 운영진). 누르면 아래 FT_CHOICES 에서 종류를 고른다 —
    //   4종이 나란히 있으면 미라클 자체 룰(1구 2점)을 모르는 새 기록원이 고를 수 없었다.
    label: '자유투', cols: 1,
    buttons: [
      { type: 'ft_menu', label: '자유투', color: 'bg-teal-600 hover:bg-teal-500', activeColor: 'bg-teal-500' },
    ],
  },
]
// 「자유투」를 누르면 보이는 종류. 실측(2.2만 건): 2점 파울 470 · 앤드원 117 · 3점 파울 21 · 정식 1점 1.
const FT_CHOICES: (EventBtn & { hint: string })[] = [
  { type: 'ft_2pt',     label: '2점슛 파울', hint: '1구 · 2점',   color: 'bg-teal-600 hover:bg-teal-500', activeColor: 'bg-teal-500', needsResult: true },
  { type: 'ft_3pt_1',   label: '3점슛 파울', hint: '2구 · 2+1점', color: 'bg-teal-700 hover:bg-teal-600', activeColor: 'bg-teal-600', needsResult: true },
  { type: 'and_one',    label: '앤드원',     hint: '1점 · 바로 저장', color: 'bg-amber-600 hover:bg-amber-500', activeColor: 'bg-amber-500' },
  // 정식 룰(1구 1점). 미라클 자체룰 경기와 한 화면에 공존하므로 라벨에 득점을 박아 둔다.
  { type: 'free_throw', label: '정식 자유투', hint: '1구 · 1점',   color: 'bg-teal-500 hover:bg-teal-400', activeColor: 'bg-teal-400', needsResult: true },
]

const SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post']

// ── PC 단축키 (2026-11-03) — 숙련 기록원이 영상에서 눈을 떼지 않게 ─────────
//   선수: 왼쪽 팀 1~5 · 오른쪽 팀 6~9,0 (코트 격자 순서). 피커(어시스트·리바운드·턴오버)에서도 같은 번호.
//   슛 종류: Q 3점 · W 미들 · E 레이업 · R 골밑 → 그 뒤 A 성공 / S 실패(기존).
//   그 외: D 수비 리바 · C 공격 리바 · F 스틸 · G 턴오버 · B 블록 · T 자유투(종류 고르기).
//   힌트 글자는 PC(lg↑)에서만 보인다. 입력칸에 커서가 있으면 무시.
const SHOT_HOTKEYS: Record<string, string> = { shot_3p: 'Q', shot_2p_mid: 'W', shot_layup: 'E', shot_post: 'R' }
const EVENT_HOTKEYS: Record<string, string> = { dreb: 'D', oreb: 'C', steal: 'F', turnover: 'G', block: 'B', ft_menu: 'T' }
const HOME_KEYS = ['1', '2', '3', '4', '5']
const AWAY_KEYS = ['6', '7', '8', '9', '0']
/** 단축키 배지 — 검은 바탕에 흰 글자로 PC(lg↑)에서만. 종전 흐린 모노 글자는 눈에 안 띄었다(운영진 2026-11-03). */
function Kbd({ k, className = '' }: { k: string; className?: string }) {
  return (
    <kbd aria-hidden className={`hidden lg:inline-flex absolute top-1 right-1 min-w-[20px] h-5 px-1 items-center justify-center rounded-md bg-black/60 text-white text-[11px] font-bold leading-none shadow-sm ${className}`}>
      {k}
    </kbd>
  )
}
/** pendingShot 이 이 묶음 것인가 — 자유투 종류(FT_CHOICES)는 「자유투」 묶음 소속으로 본다 */
function groupOwns(group: { label: string; buttons: EventBtn[] }, type: string): boolean {
  if (group.buttons.some(b => b.type === type)) return true
  return group.label === '자유투' && FT_CHOICES.some(c => c.type === type)
}
function playerHotkey(side: 'home' | 'away', index: number): string | null {
  return (side === 'home' ? HOME_KEYS : AWAY_KEYS)[index] ?? null
}
const FT_TYPES   = ['free_throw', 'ft_2pt', 'ft_3pt_1', 'ft_3pt_2', 'and_one']

type LastEventDetails = {
  id: string
  type: string
  result: 'made' | 'missed'
  playerId: string
  label: string
}

export default function LeagueEventInputPad({
  leagueId, gameId,
  homePlayers = [], awayPlayers = [],
  homeTeam, awayTeam,
  leagueHeaders, onEventSaved,
  activePlusOneIds,
  onOpponentRegistered,
  opponentRecording = true,
  currentQuarter = 1,
  foulCounts,
}: Props) {
  const { getCurrentTimestamp } = useGameStore()

  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null)
  const [possessionPlayerId, setPossessionPlayerId] = useState<string | null>(null)
  const [pendingShot, setPendingShot] = useState<EventBtn | null>(null)
  const [awaitingAssist, setAwaitingAssist] = useState(false)
  const [pendingResult, setPendingResult] = useState<'made' | 'missed' | null>(null)
  const [lastEvent, setLastEvent] = useState<LastEventDetails | null>(null)
  const [showLastMenu, setShowLastMenu] = useState(false)
  const [addingAssistForLast, setAddingAssistForLast] = useState(false)
  const [awaitingRebound, setAwaitingRebound] = useState(false)
  const [ftChooser, setFtChooser] = useState(false)   // 「자유투」 눌러 종류 고르는 중
  // 영상 시각은 **첫 터치** 순간에 잡는다(2026-11-03). 어시스트·턴오버 짝을 고르는 동안 영상이 흘러
  //   저장 시각이 장면보다 몇 초 뒤로 밀리던 것을 막는다. 리바운드는 제 장면이 따로 있어 제 순간을 쓴다.
  const [pendingTs, setPendingTs] = useState<number | null>(null)   // 슛 O 누른 순간(어시스트 대기용)
  const [stealTs, setStealTs] = useState<number | null>(null)       // 스틸 누른 순간(턴오버 짝용)
  const [reboundShooterTeamId, setReboundShooterTeamId] = useState<string | null>(null)
  const [lastReboundId, setLastReboundId] = useState<string | null>(null) // 슛 직후 저장된 리바운드 ID
  const [awaitingTovPair, setAwaitingTovPair] = useState(false)    // Phase 2-G
  const [stealerTeamId, setStealerTeamId] = useState<string | null>(null)
  const [lastStlEventId, setLastStlEventId] = useState<string | null>(null)
  // Optimistic UI: 아직 서버 응답 대기 중인 저장 있음 · undo 가드용
  const [lastEventPending, setLastEventPending] = useState(false)

  // ── 대회형: 상대(외부) 선수 즉석 등록 ──────────────────────────
  // 등록 직후 부모의 roster 리로드를 기다리지 않고 바로 화면·선택 상태에 반영해야
  // "기록 중 이탈 금지" 요구를 만족한다 — 그래서 props 로 받은 명단과 별도로 로컬에 쌓는다.
  const [addedOpponents, setAddedOpponents] = useState<RosterPlayer[]>([])
  const [oppDraft, setOppDraft] = useState<Record<'home' | 'away', { number: string; name: string; showName: boolean; busy: boolean }>>({
    home: { number: '', name: '', showName: false, busy: false },
    away: { number: '', name: '', showName: false, busy: false },
  })

  // 코트 표시용 명단 = props 명단 + 이번 세션에 새로 등록한 선수(중복 방지)
  const homeDisplay: RosterPlayer[] = [...homePlayers, ...addedOpponents.filter(p => p.team_id === homeTeam?.id && !homePlayers.some(h => h.id === p.id))]
  const awayDisplay: RosterPlayer[] = [...awayPlayers, ...addedOpponents.filter(p => p.team_id === awayTeam?.id && !awayPlayers.some(h => h.id === p.id))]

  const allPlayers: RosterPlayer[] = [...homeDisplay, ...awayDisplay]
  const selectedObj   = selectedPlayer ? (allPlayers.find(p => p.id === selectedPlayer) ?? null) : null
  const selectedTeamId = selectedObj?.team_id ?? null
  const selectedTeam   = selectedObj
    ? (selectedObj.team_id === homeTeam?.id ? homeTeam : selectedObj.team_id === awayTeam?.id ? awayTeam : null)
    : null
  const isPlusOne = activePlusOneIds !== undefined
    ? activePlusOneIds.includes(selectedPlayer ?? '')
    : !!(selectedObj as LeaguePlayer | null)?.plus_one

  // 어시스트 추가 모드일 때는 마지막 이벤트 선수의 팀 동료
  const assistForLastCandidates = addingAssistForLast && lastEvent
    ? allPlayers.filter(p => p.id !== lastEvent.playerId && allPlayers.find(a => a.id === lastEvent.playerId)?.team_id && p.team_id === allPlayers.find(a => a.id === lastEvent.playerId)?.team_id)
    : []


  function selectPlayer(id: string) {
    setFtChooser(false)
    setSelectedPlayer(id)
    setPossessionPlayerId(null)
    setPendingShot(null)
    setAwaitingAssist(false)
  }

  function patchOppDraft(side: 'home' | 'away', patch: Partial<{ number: string; name: string; showName: boolean; busy: boolean }>) {
    setOppDraft(prev => ({ ...prev, [side]: { ...prev[side], ...patch } }))
  }

  // 등번호만으로 상대 선수를 즉석 등록 — 같은 번호를 다시 등록해도(더블탭 등)
  // 서버가 기존 선수를 그대로 돌려주므로(idempotent) 여기서 중복 걱정은 안 해도 된다.
  async function registerOpponent(side: 'home' | 'away') {
    const team = side === 'home' ? homeTeam : awayTeam
    if (!team) return
    const draft = oppDraft[side]
    const num = Number(draft.number)
    if (draft.number.trim() === '' || !Number.isInteger(num) || num < 0 || num > 99) {
      toast.error('등번호는 0~99 사이 숫자로 입력하세요')
      return
    }
    patchOppDraft(side, { busy: true })
    try {
      const r = await fetch(`/api/leagues/${leagueId}/games/${gameId}/opponent-players`, {
        method: 'POST',
        headers: leagueHeaders,
        body: JSON.stringify({ team_id: team.id, number: num, name: draft.name.trim() || undefined }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => null) as { error?: string } | null
        toast.error(err?.error ?? '상대 선수 등록 실패')
        patchOppDraft(side, { busy: false })
        return
      }
      const saved = await r.json() as { id: string; name: string; number: number | null }
      const newPlayer: RosterPlayer = {
        id: saved.id, league_id: leagueId, name: saved.name, number: saved.number,
        position: null, birth_date: null, plus_one: false, is_guest: false,
        created_at: new Date().toISOString(), team_id: team.id,
        // 즉석 등록 상대 선수 — 083 신규 필드는 이 API 응답에 없어 알 수 없다. 기본값으로 채운다.
        height_cm: null, is_pro: false, is_active: true, legacy_id: null,
      }
      setAddedOpponents(prev => [...prev.filter(p => p.id !== newPlayer.id), newPlayer])
      selectPlayer(newPlayer.id)  // 등록 즉시 선택 상태로 — 바로 이어서 기록
      toast.success(`#${saved.number ?? ''} ${saved.name} 등록 — 바로 기록하세요`)
      patchOppDraft(side, { number: '', name: '', showName: false, busy: false })
      onOpponentRegistered?.()
    } catch {
      // 실패 시 입력값은 그대로 둔다 — 다시 타이핑하지 않게
      toast.error('상대 선수 등록 실패 - 네트워크를 확인하세요')
      patchOppDraft(side, { busy: false })
    }
  }

  function handleShotClick(btn: EventBtn) {
    setPendingShot(btn)
    setAwaitingAssist(false)
  }

  // ── 슛 결과 단축키 (A = 성공, S = 실패) ──────────────────
  // pendingShot 활성 · 다른 모드(리바운드/어시스트/TOV) 대기 중이 아닐 때만 반응.
  // 입력 필드/modifier 조합은 무시.
  useEffect(() => {
    if (!pendingShot) return
    if (awaitingRebound || awaitingAssist || awaitingTovPair || addingAssistForLast) return

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      const tag = t?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (t?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return

      const k = e.key.toLowerCase()
      if (k === 'a') {
        e.preventDefault()
        handleResult('made')
      } else if (k === 's') {
        e.preventDefault()
        handleResult('missed')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingShot, awaitingRebound, awaitingAssist, awaitingTovPair, addingAssistForLast])

  // ── 어시스트 자동 타임아웃은 2026-11-03 에 뺐다 ──────────────────
  //   성공 슛의 27% 가 어시스트 없음 → 매번 3초를 기다렸다(경기당 약 35초). 이제는 피커에서
  //   상대 선수를 누르는 것이 곧 「어시스트 없음」이다(resolveAssistWithPlayer).

  // ── API ──────────────────────────────────────────────────────
  async function saveEvent(body: object): Promise<string | null> {
    const r = await fetch(`/api/leagues/${leagueId}/events`, { method: 'POST', headers: leagueHeaders, body: JSON.stringify(body) })
    if (!r.ok) { toast.error('저장 실패'); return null }
    return (await r.json()).id
  }

  // shotArg: 슛 종류 상자의 ✓/✗ 는 pendingShot 상태를 거치지 않고 종류를 직접 넘긴다(2026-11-03).
  //   상태를 먼저 set 하고 바로 읽으면 옛 값이라, 인자가 정본이고 상태는 폴백이다.
  function saveShot(result: 'made' | 'missed', assistId?: string, shotArg?: EventBtn, tsArg?: number | null) {
    const shot = shotArg ?? pendingShot
    if (!selectedPlayer || !shot) return
    const ts = tsArg ?? pendingTs ?? getCurrentTimestamp()
    setPendingTs(null)
    const body = {
      league_game_id: gameId, quarter: currentQuarter, video_timestamp: ts,
      type: shot.type, league_player_id: selectedPlayer, team_id: selectedTeamId,
      result, related_player_id: assistId ?? null,
    }
    const pName = allPlayers.find(p => p.id === selectedPlayer)?.name ?? ''
    const aPName = assistId ? allPlayers.find(p => p.id === assistId)?.name : null
    const mark  = result === 'made' ? ' ✓' : ' ✗'
    const lbl   = `${pName} — ${shot.label}${mark}${aPName ? ` (A: ${aPName})` : ''}`
    const shotType = shot.type  // capture before potential clear
    const shooterTeamId = selectedTeamId
    // ── 즉시 UI 반영 (Optimistic) ──
    const tempId = `opt-${crypto.randomUUID()}`
    setLastEvent({ id: tempId, type: shotType, result, playerId: selectedPlayer, label: lbl })
    setLastReboundId(null)
    setLastEventPending(true)
    toast.success(`기록: ${lbl}`)
    setAwaitingAssist(false)
    setPendingResult(null)
    if (shotType === 'ft_3pt_1') {
      // 2구 자동 진입
      setPendingShot({ type: 'ft_3pt_2', label: '3점슛 파울 2구째', color: 'bg-teal-800 hover:bg-teal-700', activeColor: 'bg-teal-700', needsResult: true })
      setPendingResult(null)
    } else if (!FT_TYPES.includes(shotType) || shotType === 'ft_2pt' || shotType === 'ft_3pt_2') {
      setPendingShot(null)
    }
    // Phase 1-B: 마지막 자유투 실패 시 리바운드 피커 자동 등장 (즉시)
    // 마지막 자유투 실패에만 리바운드 피커를 띄운다. free_throw(정식 1구)는 몇 구 중 몇 번째인지
    // 알 수 없어 제외한다 — 1구째 실패에 피커가 뜨면 없는 리바운드를 기록하게 된다.
    // 마지막 구 실패 후 리바운드는 기록원이 REB 버튼으로 직접 찍는다.
    const LAST_FT = ['ft_2pt', 'ft_3pt_2', 'and_one']
    if (result === 'missed' && LAST_FT.includes(shotType)) {
      setReboundShooterTeamId(shooterTeamId)
      setAwaitingRebound(true)
    }
    // ── 백그라운드 저장 ──
    fetch(`/api/leagues/${leagueId}/events`, { method: 'POST', headers: leagueHeaders, body: JSON.stringify(body) })
      .then(r => r.ok ? r.json() : null)
      .then(saved => {
        if (saved?.id) {
          setLastEvent(prev => prev?.id === tempId ? { ...prev, id: saved.id } : prev)
          setLastEventPending(false)
          onEventSaved(shotType)
        } else {
          toast.error('저장 실패 - 되돌립니다')
          setLastEvent(prev => prev?.id === tempId ? null : prev)
          setLastEventPending(false)
        }
      })
      .catch(() => {
        toast.error('저장 실패 - 되돌립니다')
        setLastEvent(prev => prev?.id === tempId ? null : prev)
        setLastEventPending(false)
      })
  }

  // Phase 2-G: 스틸 후 TOV 페어
  async function handleTovPair(tovPlayerId: string | null) {
    if (tovPlayerId) {
      const p = allPlayers.find(x => x.id === tovPlayerId)
      const id = await saveEvent({
        league_game_id: gameId, quarter: currentQuarter, video_timestamp: stealTs ?? getCurrentTimestamp(),
        type: 'turnover', league_player_id: tovPlayerId,
        team_id: p?.team_id ?? null, result: null, related_player_id: null,
      })
      if (id) {
        toast.success(`기록: ${p?.name ?? ''} — 턴오버 (스틸 연결)`)
        onEventSaved('turnover')
      }
      // STL 이벤트에 TOV 선수 ID 연결 (스틸-턴오버 관계 분석용)
      if (lastStlEventId) {
        fetch(`/api/leagues/${leagueId}/events/${lastStlEventId}`, {
          method: 'PATCH',
          headers: leagueHeaders,
          body: JSON.stringify({ related_player_id: tovPlayerId }),
        }).catch(() => {})
      }
    }
    setLastStlEventId(null)
    setAwaitingTovPair(false)
    setStealerTeamId(null)
    setStealTs(null)
  }

  function saveInstant(btn: EventBtn) {
    if (!selectedPlayer) return
    if (btn.type === 'ft_menu') { setFtChooser(v => !v); return }
    const isAndOne = btn.type === 'and_one'
    const body = {
      league_game_id: gameId, quarter: currentQuarter, video_timestamp: getCurrentTimestamp(),
      type: btn.type, league_player_id: selectedPlayer, team_id: selectedTeamId,
      result: isAndOne ? 'made' : null, related_player_id: null,
    }
    const pName = allPlayers.find(p => p.id === selectedPlayer)?.name ?? ''
    const lbl = isAndOne ? `${pName} — 앤드원 ✓` : `${pName} — ${btn.label}`
    // ── 즉시 UI 반영 ──
    const tempId = `opt-${crypto.randomUUID()}`
    setLastEvent({ id: tempId, type: btn.type, result: isAndOne ? 'made' : 'missed', playerId: selectedPlayer, label: lbl })
    setLastReboundId(null)
    setLastEventPending(true)
    toast.success(`기록: ${lbl}`)
    const POSSESSION_TYPES = new Set(['oreb', 'dreb', 'steal'])
    if (POSSESSION_TYPES.has(btn.type)) setPossessionPlayerId(selectedPlayer)
    else setPossessionPlayerId(null)
    // Phase 2-G: 스틸 후 상대팀 TOV 페어 피커 (즉시)
    if (btn.type === 'steal') {
      setLastStlEventId(tempId)
      setStealerTeamId(selectedTeamId)
      setStealTs(body.video_timestamp)
      setAwaitingTovPair(true)
    }
    // ── 백그라운드 저장 ──
    fetch(`/api/leagues/${leagueId}/events`, { method: 'POST', headers: leagueHeaders, body: JSON.stringify(body) })
      .then(r => r.ok ? r.json() : null)
      .then(saved => {
        if (saved?.id) {
          setLastEvent(prev => prev?.id === tempId ? { ...prev, id: saved.id } : prev)
          // 스틸이면 lastStlEventId 도 실 id 로 갱신 (TOV 페어 PATCH 참조)
          setLastStlEventId(prev => prev === tempId ? saved.id : prev)
          setLastEventPending(false)
          onEventSaved(btn.type)
        } else {
          toast.error('저장 실패 - 되돌립니다')
          setLastEvent(prev => prev?.id === tempId ? null : prev)
          setLastStlEventId(prev => prev === tempId ? null : prev)
          setLastEventPending(false)
        }
      })
      .catch(() => {
        toast.error('저장 실패 - 되돌립니다')
        setLastEvent(prev => prev?.id === tempId ? null : prev)
        setLastStlEventId(prev => prev === tempId ? null : prev)
        setLastEventPending(false)
      })
  }

  function handleResult(result: 'made' | 'missed', shotArg?: EventBtn) {
    const shot = shotArg ?? pendingShot
    if (!shot) return
    const ts = getCurrentTimestamp()   // 첫 터치 = O/X 누른 순간
    setFtChooser(false)
    if (result === 'missed' && SHOT_TYPES.includes(shot.type)) {
      // 필드골 실패 → saveShot 내부에서 리바운드 피커 자동 활성 (LAST_FT 로직과 별개)
      // 여기선 명시적으로 리바운드 대기 세팅 (필드골은 saveShot 의 LAST_FT 체크에 걸리지 않음)
      const shooterTeamId = selectedTeamId
      saveShot('missed', undefined, shot, ts)  // Optimistic · 즉시 반환
      setReboundShooterTeamId(shooterTeamId)
      setAwaitingRebound(true)
    } else if (result === 'missed' || !shot.needsRelated) {
      saveShot(result, undefined, shot, ts)
    } else {
      // 어시스트 피커로 — 피커는 pendingShot 상태를 읽으므로 여기서 맞춰 둔다. 시각은 지금 것.
      setPendingShot(shot)
      setPendingResult('made')
      setPendingTs(ts)
      setAwaitingAssist(true)
    }
  }

  // ── 어시스트 피커에서 「다음 터치가 곧 답」 (2026-11-03, 3초 대기 폐지) ──
  //   같은 팀 선수 = 어시스트. 상대 팀 선수 = 어시스트 없이 저장하고 그 선수를 바로 선택해
  //   다음 기록의 첫 터치로 쓴다. 득점 직후 다음 장면은 항상 상대 공격이라 다른 뜻으로 읽힐 수 없다.
  function resolveAssistWithPlayer(pid: string) {
    const p = allPlayers.find(x => x.id === pid)
    setAwaitingAssist(false)
    if (p && p.team_id === selectedTeamId && pid !== selectedPlayer) {
      saveShot(pendingResult ?? 'made', pid)
    } else {
      saveShot(pendingResult ?? 'made')
      selectPlayer(pid)
    }
  }

  // 통합 리바운드 저장 함수 (슛 실패/블록/FT 미스 공통)
  async function doRebound(rebounderId: string | null) {
    if (rebounderId) {
      const rebounder = allPlayers.find(p => p.id === rebounderId)
      const rebType = rebounder?.team_id === reboundShooterTeamId ? 'oreb' : 'dreb'
      const rebId = await saveEvent({
        league_game_id: gameId, quarter: currentQuarter, video_timestamp: getCurrentTimestamp(),
        type: rebType, league_player_id: rebounderId,
        team_id: rebounder?.team_id ?? null,
        result: null, related_player_id: null,
      })
      if (rebId) {
        setLastReboundId(rebId)  // 슛과 연계된 리바운드로 추적
        setSelectedPlayer(rebounderId)       // 리바운더가 공 소유 → 자동 선택
        setPossessionPlayerId(rebounderId)   // 포제션 인디케이터 활성화
        const rName = rebounder?.name ?? ''
        toast.success(`기록: ${rName} — ${rebType === 'oreb' ? '공격 리바' : '수비 리바'}`)
        onEventSaved(rebType)
      }
    } else {
      setLastReboundId(null)  // 아웃바운드/건너뛰기
    }
    setAwaitingRebound(false)
    setReboundShooterTeamId(null)
  }

  async function undoLast() {
    if (!lastEvent) return
    // Optimistic 저장이 아직 서버에서 완료 안 된 경우 취소 불가 (id 미확정)
    if (lastEventPending || lastEvent.id.startsWith('opt-')) {
      toast('저장 중 - 잠시 후 다시 시도', { icon: '⏳' })
      return
    }
    // 슛 취소 시 연계된 리바운드도 함께 삭제
    const rebId = lastReboundId
    if (rebId) {
      await fetch(`/api/leagues/${leagueId}/events/${rebId}`, { method: 'DELETE', headers: leagueHeaders })
      setLastReboundId(null)
    }
    const r = await fetch(`/api/leagues/${leagueId}/events/${lastEvent.id}`, { method: 'DELETE', headers: leagueHeaders })
    if (!r.ok) { toast.error('취소 실패'); return }
    toast(`↩ 취소: ${lastEvent.label}${rebId ? ' + 리바운드' : ''}`)
    const undoneType = lastEvent.type
    setLastEvent(null)
    setShowLastMenu(false)
    onEventSaved(undoneType)
  }

  // 마지막 이벤트에 어시스트 추가 (삭제 후 재입력 + 어시스트 선택)
  async function startAddAssistForLast() {
    if (!lastEvent || !SHOT_TYPES.includes(lastEvent.type)) return
    setShowLastMenu(false)
    const r = await fetch(`/api/leagues/${leagueId}/events/${lastEvent.id}`, { method: 'DELETE', headers: leagueHeaders })
    if (!r.ok) { toast.error('실패'); return }
    // 해당 선수로 포커스 + 어시스트 선택 모드
    setSelectedPlayer(lastEvent.playerId)
    const btn = EVENT_GROUPS.flatMap(g => g.buttons).find(b => b.type === lastEvent.type)
    if (btn) { setPendingShot(btn); setPendingResult('made') }
    setAddingAssistForLast(true)
    setAwaitingAssist(false) // 직접 선택 (타임아웃 없이)
    onEventSaved(lastEvent.type)
  }

  async function finishAssistForLast(assistId?: string) {
    if (!lastEvent || !pendingShot) return
    const id = await saveEvent({
      league_game_id: gameId, quarter: currentQuarter, video_timestamp: getCurrentTimestamp(),
      type: lastEvent.type, league_player_id: lastEvent.playerId, team_id: allPlayers.find(p => p.id === lastEvent.playerId)?.team_id ?? null,
      result: 'made', related_player_id: assistId ?? null,
    })
    if (!id) return
    const pName = allPlayers.find(p => p.id === lastEvent.playerId)?.name ?? ''
    const aPName = assistId ? allPlayers.find(p => p.id === assistId)?.name : null
    const lbl = `${pName} — ${pendingShot.label} ✓${aPName ? ` (A: ${aPName})` : ''}`
    setLastEvent({ id, type: lastEvent.type, result: 'made', playerId: lastEvent.playerId, label: lbl })
    toast.success(`기록: ${lbl}`)
    setAddingAssistForLast(false)
    setPendingShot(null)
    setPendingResult(null)
    onEventSaved(lastEvent.type)
  }

  const canAddAssist = lastEvent && SHOT_TYPES.includes(lastEvent.type) && lastEvent.result === 'made'

  // ── PC 단축키 — 최신 상태를 ref 로 보고 한 번만 리스너를 건다 ───────────
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {})
  keyRef.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    const tag = t?.tagName
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return
    if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
    const k = e.key
    // 선수 번호
    const hi = HOME_KEYS.indexOf(k), ai = AWAY_KEYS.indexOf(k)
    if (hi >= 0 || ai >= 0) {
      const p = hi >= 0 ? homeDisplay[hi] : awayDisplay[ai]
      if (!p) return
      e.preventDefault()
      if (awaitingRebound) doRebound(p.id)
      else if (awaitingAssist) resolveAssistWithPlayer(p.id)
      else if (awaitingTovPair) { if (p.team_id !== stealerTeamId) handleTovPair(p.id) }
      else if (addingAssistForLast) { if (assistForLastCandidates.some(c => c.id === p.id)) finishAssistForLast(p.id) }
      else selectPlayer(p.id)
      return
    }
    // 종류 — 선수가 있고 다른 단계 대기 중이 아닐 때만
    if (!selectedPlayer || awaitingRebound || awaitingAssist || awaitingTovPair || addingAssistForLast) return
    const up = k.length === 1 ? k.toUpperCase() : k
    const shotType = Object.keys(SHOT_HOTKEYS).find(tp => SHOT_HOTKEYS[tp] === up)
    if (shotType && !pendingShot) {
      const btn = EVENT_GROUPS.flatMap(g => g.buttons).find(b => b.type === shotType)
      if (btn) { e.preventDefault(); handleShotClick(btn) }
      return
    }
    const evType = Object.keys(EVENT_HOTKEYS).find(tp => EVENT_HOTKEYS[tp] === up)
    if (evType && !pendingShot) {
      const btn = EVENT_GROUPS.flatMap(g => g.buttons).find(b => b.type === evType)
      if (btn) { e.preventDefault(); saveInstant(btn) }
    }
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ── 선수 카드 렌더 ────────────────────────────────────────────
  function renderPlayerBtn(p: RosterPlayer, teamColor: string, hotkey: string | null = null) {
    const isSelected = selectedPlayer === p.id
    const hasPossession = possessionPlayerId === p.id
    const fouls = foulCounts?.[p.id] ?? 0
    // 선택 시 배경 = 팀 컬러(또는 소유 표시 초록). 흰/노랑 등 밝은 팀 컬러에서
    // 텍스트가 안 보이는 것을 방지하기 위해 배경 휘도에 따라 텍스트 컬러 자동 결정.
    const selectedBg = hasPossession ? '#16a34a' : teamColor
    const selectedText = textOnBg(selectedBg)
    return (
      <button
        key={p.id}
        onClick={() => selectPlayer(p.id)}
        className={`relative py-2 px-1 min-h-[52px] rounded-xl text-center transition-all cursor-pointer border active:scale-95 ${
          isSelected
            ? `shadow-lg ${hasPossession ? 'ring-2 ring-green-300 ring-offset-1 ring-offset-[color:var(--mm-panel)]' : ''}`
            : 'bg-[color:var(--mm-panel-alt)]/80 border-[color:var(--mm-rule)] text-[color:var(--mm-ink)] hover:bg-[color:var(--mm-rule)] hover:border-[color:var(--mm-muted)]'
        } ${(activePlusOneIds !== undefined ? activePlusOneIds.includes(p.id) : p.plus_one) ? 'ring-1 ring-amber-400/60' : ''}`}
        style={isSelected ? { backgroundColor: selectedBg, borderColor: selectedBg, color: selectedText } : {}}
        aria-label={fouls > 0 ? `${p.name} (개인 파울 ${fouls}개${fouls >= 5 ? ' · 퇴장 기준' : ''})` : undefined}
      >
        {p.number != null && (
          <div className="text-base font-black font-mono leading-none mb-0.5">#{p.number}</div>
        )}
        <div className={`font-semibold leading-tight px-0.5 break-keep ${p.number != null ? 'text-xs' : 'text-sm'}`}
          style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
          {hasPossession ? `▶ ${p.name}` : p.name}
        </div>
        {(activePlusOneIds !== undefined ? activePlusOneIds.includes(p.id) : p.plus_one) ? (
          <span className="absolute top-1 right-1 text-xs font-black text-amber-300 leading-none">+1</span>
        ) : hotkey && <Kbd k={hotkey} />}
        {/* 개인 파울 — 4개 주의 · 5개 퇴장 기준만 보인다. 파울 버튼을 뺀 뒤(2026-11-03) 옛 기록 1건이 「F1」로
            크게 보여 오류로 오인됐다. 경고가 필요한 수부터만 그린다. */}
        {fouls >= 4 && (
          <span
            className="absolute top-1 left-1 px-1 text-xs font-black leading-tight tabular-nums"
            style={fouls >= 5
              ? { background: 'var(--mm-live-bg)', color: '#FFFFFF', borderRadius: '3px' }
              : fouls >= 4
              ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '3px' }
              : { color: 'inherit', opacity: 0.75 }}
            title={fouls >= 5 ? `개인 파울 ${fouls}개 — 퇴장 기준(5반칙)` : `개인 파울 ${fouls}개`}
          >
            F{fouls}
          </span>
        )}
      </button>
    )
  }

  // 대회형 상대(외부) 팀에만 뜨는 즉석 등록 UI. 화면 전환·모달 없이 그 자리에서 처리.
  function renderOpponentRegister(side: 'home' | 'away') {
    // 대회 기록기는 상대 개인 기록을 남기지 않는다 — 점수만 별도 버튼으로 받는다.
    if (!opponentRecording) return null
    const team = side === 'home' ? homeTeam : awayTeam
    if (!team?.is_external) return null
    const draft = oppDraft[side]
    return (
      <div className="mt-1.5 p-1.5 rounded-lg space-y-1 bg-[color:var(--mm-panel-alt)]/60 border border-[color:var(--mm-rule)]">
        <div className="flex items-center gap-1">
          <input
            type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2}
            value={draft.number}
            onChange={e => patchOppDraft(side, { number: e.target.value.replace(/[^0-9]/g, '') })}
            onKeyDown={e => { if (e.key === 'Enter') registerOpponent(side) }}
            placeholder="번호"
            aria-label={`${team.name} 상대 선수 등번호`}
            disabled={draft.busy}
            className="w-12 min-h-11 text-center text-sm font-bold rounded-lg bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] text-[color:var(--mm-ink)] placeholder:text-[color:var(--mm-muted)] cursor-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50"
          />
          <button
            onClick={() => registerOpponent(side)}
            disabled={draft.busy || draft.number.trim() === ''}
            aria-label={`${team.name} 상대 선수 등록`}
            className="flex-1 min-h-11 rounded-lg text-xs font-bold text-blue-100 bg-blue-700 hover:bg-blue-600 cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 inline-flex items-center justify-center gap-1"
          >
            <UserPlus size={14} aria-hidden />
            {draft.busy ? '등록 중' : '상대 등록'}
          </button>
        </div>
        {draft.showName ? (
          <input
            type="text"
            value={draft.name}
            onChange={e => patchOppDraft(side, { name: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') registerOpponent(side) }}
            placeholder="이름 (선택, 모르면 비워두세요)"
            aria-label={`${team.name} 상대 선수 이름`}
            disabled={draft.busy}
            className="w-full min-h-11 text-xs px-2 rounded-lg bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] text-[color:var(--mm-ink)] placeholder:text-[color:var(--mm-muted)] cursor-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-50"
          />
        ) : (
          <button
            onClick={() => patchOppDraft(side, { showName: true })}
            className="w-full min-h-11 flex items-center text-xs text-[color:var(--mm-ink-soft)] hover:text-[color:var(--mm-ink)] cursor-pointer underline-offset-2 hover:underline"
          >
            이름도 입력 (선택)
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {/* ── 헤더: 선택된 선수 + 마지막 이벤트 + 취소 ── */}
      <div className="flex items-center gap-2 min-h-11 relative">
        {selectedObj ? (() => {
          // 팀 컬러가 흰/노랑 등 밝은 색이면 흰 텍스트가 안 보이므로 자동 대비 처리
          const bg = selectedTeam?.color ?? '#3b82f6'
          const fg = textOnBg(bg)
          return (
            <span className="shrink-0 px-3 py-1 rounded-lg text-sm font-bold"
              style={{ backgroundColor: bg, color: fg }}>
              {selectedObj.name}{selectedTeam ? ` · ${selectedTeam.name}` : ''}
            </span>
          )
        })() : (
          <span className="shrink-0 px-3 py-1 rounded-lg bg-[color:var(--mm-panel-alt)] border border-[color:var(--mm-rule)] text-[color:var(--mm-ink-soft)] text-sm font-bold">
            선수를 선택하세요
          </span>
        )}
        {isPlusOne && (
          <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-black">+1</span>
        )}

        {/* 마지막 이벤트 — 클릭하면 빠른 수정 메뉴 */}
        {lastEvent && (
          <button
            onClick={() => setShowLastMenu(v => !v)}
            className="flex-1 min-h-11 text-xs text-[color:var(--mm-ink-soft)] truncate text-left hover:text-[color:var(--mm-ink)] cursor-pointer transition-colors"
          >
            {lastEvent.label}
          </button>
        )}

        {/* Phase 1-D: Undo — lastEvent 있으면 오렌지로 강조 */}
        <button onClick={undoLast} disabled={!lastEvent}
          className={`shrink-0 px-3 py-1.5 min-h-11 rounded-lg text-xs font-bold border transition-colors cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed ${
            lastEvent
              ? 'bg-orange-900/30 border-orange-600/60 text-orange-400 hover:bg-orange-900/50'
              : 'bg-[color:var(--mm-panel-alt)] border-[color:var(--mm-rule)] text-[color:var(--mm-muted)]'
          }`}>
          ↩ 취소
        </button>

        {/* 빠른 수정 메뉴 */}
        {showLastMenu && lastEvent && (
          <div className="absolute top-full left-0 mt-1 z-30 bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-xl shadow-2xl overflow-hidden min-w-[180px]">
            {canAddAssist && (
              <button onClick={startAddAssistForLast}
                className="w-full text-left px-4 py-2.5 min-h-11 text-sm text-blue-300 hover:bg-[color:var(--mm-panel-alt)] cursor-pointer transition-colors flex items-center gap-2">
                <Handshake size={14} aria-hidden /> 어시스트 추가
              </button>
            )}
            <button onClick={undoLast}
              className="w-full text-left px-4 py-2.5 min-h-11 text-sm text-red-400 hover:bg-[color:var(--mm-panel-alt)] cursor-pointer transition-colors flex items-center gap-2">
              <span>↩</span> 기록 취소
            </button>
            <button onClick={() => setShowLastMenu(false)}
              className="w-full text-left px-4 py-2.5 min-h-11 text-xs text-[color:var(--mm-ink-soft)] hover:bg-[color:var(--mm-panel-alt)] cursor-pointer transition-colors">
              닫기
            </button>
          </div>
        )}
      </div>

      {/* ── 선수 선택: 두 팀 2열 (연계 동작 중에는 숨김) ── */}
      {!pendingShot && !awaitingAssist && !awaitingRebound && !awaitingTovPair && !addingAssistForLast && (
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="flex items-center justify-between mb-1.5 px-2 py-1 rounded-lg"
            style={{ backgroundColor: `${homeTeam?.color ?? '#3b82f6'}18` }}>
            <span className="text-xs font-bold" style={{ color: accentOrInk(homeTeam?.color ?? '#3b82f6') }}>{homeTeam?.name ?? '홈팀'}</span>
            <span className="text-xs font-bold" style={{ color: accentOrInk(homeTeam?.color ?? '#3b82f6') }}>코트 {homeDisplay.length}명</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {homeDisplay.map((p, i) => renderPlayerBtn(p, homeTeam?.color ?? '#3b82f6', playerHotkey('home', i)))}
          </div>
          {renderOpponentRegister('home')}
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5 px-2 py-1 rounded-lg"
            style={{ backgroundColor: `${awayTeam?.color ?? '#ef4444'}18` }}>
            <span className="text-xs font-bold" style={{ color: accentOrInk(awayTeam?.color ?? '#ef4444') }}>{awayTeam?.name ?? '어웨이팀'}</span>
            <span className="text-xs font-bold" style={{ color: accentOrInk(awayTeam?.color ?? '#ef4444') }}>코트 {awayDisplay.length}명</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {awayDisplay.map((p, i) => renderPlayerBtn(p, awayTeam?.color ?? '#ef4444', playerHotkey('away', i)))}
          </div>
          {renderOpponentRegister('away')}
        </div>
      </div>
      )}

      {/* ── 리바운드 선택 (슛 실패 / 블록 / FT 미스 공통) ── */}
      {awaitingRebound && (
        <div className="pt-1 space-y-2">
          <p className="text-xs text-[color:var(--mm-ink-soft)]">리바운드 선수 선택</p>
          <button
            onClick={() => doRebound(null)}
            className="w-full py-2 min-h-11 rounded-xl text-sm font-bold bg-[color:var(--mm-rule)]/60 border border-[color:var(--mm-rule)]/50 text-[color:var(--mm-ink-soft)] hover:bg-[color:var(--mm-rule)] hover:text-[color:var(--mm-ink)] cursor-pointer transition-colors"
          >
            <span className="inline-flex items-center gap-1.5 justify-center"><CircleDashed size={14} aria-hidden /> 아웃바운드 / 미기록</span>
          </button>
          {/* 수비 팀(수비 리바)을 위에 크게 — 실측 수비 리바 69% : 공격 리바 31% (2026-11-03). 눈이 가는 거리를 줄인다. */}
          {[
            { side: 'home' as const, players: homeDisplay, team: homeTeam, isShooterTeam: reboundShooterTeamId === homeTeam?.id },
            { side: 'away' as const, players: awayDisplay, team: awayTeam, isShooterTeam: reboundShooterTeamId === awayTeam?.id },
          ].sort((a, b) => Number(a.isShooterTeam) - Number(b.isShooterTeam))
          .map(({ side, players: tPlayers, team, isShooterTeam }) => tPlayers.length === 0 ? null : (
            <div key={team?.id ?? side}>
              {/* 팀 색이 없을 때 회색 리터럴로 떨어뜨리면 라이트 모드에서 3:1 이 안 나온다 —
                  accentOrInk 는 인자가 없으면 테마 잉크로 간다. */}
              <p className="t-label mb-1.5 px-1" style={{ color: accentOrInk(team?.color) }}>
                {team?.name ?? '팀'} — {isShooterTeam ? '공격 리바' : '수비 리바'}
              </p>
              <div className={`grid gap-1.5 ${isShooterTeam ? 'grid-cols-5' : 'grid-cols-3'}`}>
                {tPlayers.map((p, i) => {
                  const bg = teamInk(team?.color).bg
                  const fg = textOnBg(bg)
                  const hk = playerHotkey(side, i)
                  return (
                    <button key={p.id} onClick={() => doRebound(p.id)}
                      className={`relative rounded-xl font-bold cursor-pointer active:scale-95 transition-all truncate px-1 ${
                        isShooterTeam ? 'py-1.5 min-h-11 text-xs' : 'py-3 min-h-[52px] text-sm'}`}
                      style={{ backgroundColor: `${bg}cc`, color: fg }}>
                      {p.name}
                      {hk && <Kbd k={hk} />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          <button onClick={() => doRebound(null)}
            className="text-xs text-[color:var(--mm-ink-soft)] hover:text-[color:var(--mm-ink)] cursor-pointer w-full text-center min-h-11">
            리바운드 건너뛰기
          </button>
        </div>
      )}

      {/* ── 이벤트 버튼 (선수 선택 후) ── */}
      {selectedPlayer && !awaitingAssist && !addingAssistForLast && !awaitingRebound && !awaitingTovPair && (
        <div className="space-y-1 pt-0.5">
          {/* ft_3pt_2: EVENT_GROUPS에 없는 자동 진입 2구 — 직접 O/X 표시 */}
          {pendingShot?.type === 'ft_3pt_2' ? (
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-xs font-semibold text-[color:var(--mm-ink-soft)]">3점슛 파울 2구째 (1점)</p>
                <button onClick={() => setPendingShot(null)} className="text-xs text-[color:var(--mm-ink-soft)] hover:text-[color:var(--mm-ink)] cursor-pointer min-h-11 px-2 inline-flex items-center">취소</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => handleResult('made')}
                  aria-label="성공 (단축키 A)"
                  className="relative py-4 bg-green-600 hover:bg-green-500 text-[#fff] text-xl font-black rounded-2xl active:scale-95 cursor-pointer transition-all shadow-lg">
                  ✓ 성공
                  <kbd className="absolute top-1 right-2 text-xs font-mono bg-black/25 rounded px-1">A</kbd>
                </button>
                <button onClick={() => handleResult('missed')}
                  aria-label="실패 (단축키 S)"
                  className="relative py-4 bg-red-700 hover:bg-red-600 text-[#fff] text-xl font-black rounded-2xl active:scale-95 cursor-pointer transition-all shadow-lg">
                  ✗ 실패
                  <kbd className="absolute top-1 right-2 text-xs font-mono bg-black/25 rounded px-1">S</kbd>
                </button>
              </div>
            </div>
          ) : EVENT_GROUPS
            .filter(group => !pendingShot || groupOwns(group, pendingShot.type))
            .map(group => {
            const groupHasPending = !!pendingShot && groupOwns(group, pendingShot.type)
            return (
              <div key={group.label}>
                <div className="flex items-center justify-between mb-0.5">
                  <p className="text-xs font-semibold text-[color:var(--mm-ink-soft)]">{group.label}</p>
                  {group.label === '자유투' && ftChooser && !groupHasPending && (
                    <button onClick={() => setFtChooser(false)}
                      className="text-xs text-[color:var(--mm-ink-soft)] hover:text-[color:var(--mm-ink)] cursor-pointer min-h-11 px-2 inline-flex items-center">취소</button>
                  )}
                  {groupHasPending && (
                    <button onClick={() => { setPendingShot(null); setAwaitingAssist(false) }}
                      className="text-xs text-[color:var(--mm-ink-soft)] hover:text-[color:var(--mm-ink)] cursor-pointer min-h-11 px-2 inline-flex items-center">취소</button>
                  )}
                </div>
                {groupHasPending ? (
                  /* 해당 그룹을 O/X 버튼으로 덮기 · 단축키 A/S */
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => handleResult('made')}
                      aria-label="성공 (단축키 A)"
                      className="relative py-4 bg-green-600 hover:bg-green-500 text-[#fff] text-xl font-black rounded-2xl active:scale-95 cursor-pointer transition-all shadow-lg">
                      ✓ 성공
                      <kbd className="absolute top-1 right-2 text-xs font-mono bg-black/25 rounded px-1">A</kbd>
                    </button>
                    <button onClick={() => handleResult('missed')}
                      aria-label="실패 (단축키 S)"
                      className="relative py-4 bg-red-700 hover:bg-red-600 text-[#fff] text-xl font-black rounded-2xl active:scale-95 cursor-pointer transition-all shadow-lg">
                      ✗ 실패
                      <kbd className="absolute top-1 right-2 text-xs font-mono bg-black/25 rounded px-1">S</kbd>
                    </button>
                  </div>
                ) : group.label === '자유투' && ftChooser ? (
                  <div className="grid grid-cols-4 gap-1.5">
                    {FT_CHOICES.map(c => (
                      <button key={c.type}
                        onClick={() => { setFtChooser(false); if (c.needsResult) handleShotClick(c); else saveInstant(c) }}
                        className={`py-2 px-1 min-h-[52px] rounded-xl text-[color:var(--mm-ink)] transition-all active:scale-95 cursor-pointer border-2 border-transparent ${c.color}`}>
                        <div className="text-sm font-bold leading-tight break-keep">{c.label}</div>
                        <div className="text-[11px] opacity-85 leading-tight mt-0.5">{c.hint}</div>
                      </button>
                    ))}
                  </div>
                ) : group.label === '슈팅' ? (
                  /* 슛 종류 상자 — 종류 밑에 ✓/✗ 를 같이 둔다(2026-11-03, 운영진 결정).
                     종전엔 종류를 누른 뒤 성공/실패를 한 번 더 눌렀다(슛마다 1터치 · 경기당 35번).
                     기록원은 공이 들어가는 걸 보고 누르므로 결과를 이미 안다 — 한 번에 묻는다.
                     키보드(Q/W/E/R → A/S)는 종전 경로(pendingShot 오버레이)를 그대로 쓴다. */
                  <div className="grid grid-cols-4 gap-1.5">
                    {group.buttons.map(btn => (
                      <div key={btn.type}
                        className={`relative rounded-xl border-2 border-transparent overflow-hidden ${btn.color.split(' ')[0]}`}>
                        <div className="pt-1.5 pb-1 px-1 text-center text-xs font-bold leading-tight break-keep text-[color:var(--mm-ink)]">
                          {btn.label}
                          {SHOT_HOTKEYS[btn.type] && <Kbd k={SHOT_HOTKEYS[btn.type]} />}
                        </div>
                        <div className="grid grid-cols-2 gap-px bg-black/20">
                          <button onClick={() => handleResult('made', btn)}
                            aria-label={`${btn.label} 성공`}
                            className="min-h-[44px] bg-green-600/90 hover:bg-green-500 text-[#fff] text-lg font-black cursor-pointer active:scale-95 transition-all">
                            O
                          </button>
                          <button onClick={() => handleResult('missed', btn)}
                            aria-label={`${btn.label} 실패`}
                            className="min-h-[44px] bg-red-700/90 hover:bg-red-600 text-[#fff] text-lg font-black cursor-pointer active:scale-95 transition-all">
                            X
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`grid gap-1.5 ${
                    group.cols === 5 ? 'grid-cols-5'
                    : group.cols === 4 ? 'grid-cols-4'
                    : group.cols === 3 ? 'grid-cols-3'
                    : group.cols === 1 ? 'grid-cols-1'
                    : 'grid-cols-2'
                  }`}>
                    {group.buttons.map(btn => (
                      <button
                        key={btn.type}
                        onClick={() => {
                          if (btn.needsResult) handleShotClick(btn)
                          else saveInstant(btn)
                        }}
                        className={`relative py-3 px-1 min-h-[44px] rounded-xl text-sm font-bold leading-tight break-keep text-[color:var(--mm-ink)] transition-all active:scale-95 cursor-pointer border-2 ${btn.color} border-transparent`}
                      >
                        {btn.label}
                        {EVENT_HOTKEYS[btn.type] && <Kbd k={EVENT_HOTKEYS[btn.type]} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── 어시스트 선택 — 대기 없음. 같은 팀 = 어시스트 · 상대 팀 = 없음으로 저장 + 그 선수 선택 ── */}
      {awaitingAssist && (
        <div className="pt-1 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[color:var(--mm-ink-soft)]">누가 어시스트? <span className="text-[color:var(--mm-muted)]">· 상대 선수를 누르면 어시스트 없이 넘어갑니다</span></p>
            <button onClick={() => { setAwaitingAssist(false); saveShot(pendingResult ?? 'made') }}
              className="shrink-0 px-3 min-h-11 rounded-lg text-xs font-bold border border-[color:var(--mm-rule)] text-[color:var(--mm-ink-soft)] hover:text-[color:var(--mm-ink)] cursor-pointer">없음</button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { players: homeDisplay, team: homeTeam },
              { players: awayDisplay, team: awayTeam },
            ].map(({ players: tPlayers, team }) => {
              const isShooterTeam = team?.id === selectedTeamId
              return (
                <div key={team?.id ?? 'team'}>
                  <p className="t-label mb-1.5 px-1" style={{ color: accentOrInk(team?.color) }}>
                    {team?.name ?? '팀'} {isShooterTeam ? '— 어시스트' : '— 다음 공격'}
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {tPlayers.map((p, i) => {
                      const isShooter = p.id === selectedPlayer
                      const base = teamInk(team?.color).bg
                      return (
                        <button key={p.id} onClick={() => resolveAssistWithPlayer(p.id)} disabled={isShooter}
                          className={`relative py-2 min-h-11 rounded-xl text-sm font-bold cursor-pointer active:scale-95 transition-all truncate px-1 disabled:opacity-30 disabled:cursor-not-allowed ${
                            isShooterTeam ? '' : 'opacity-70'}`}
                          style={{ backgroundColor: `${base}cc`, color: textOnBg(base) }}>
                          {p.name}
                          {(() => { const hk = playerHotkey(team?.id === homeTeam?.id ? 'home' : 'away', i); return hk ? <Kbd k={hk} /> : null })()}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 어시스트 추가 모드 (마지막 이벤트 보정용) ── */}
      {addingAssistForLast && lastEvent && (
        <div className="pt-1 space-y-2">
          <p className="text-xs text-blue-400">어시스트 선수 선택 (보정 모드)</p>
          <div className="grid grid-cols-3 gap-1.5">
            <button onClick={() => finishAssistForLast()}
              className="py-3 rounded-xl text-sm font-medium bg-[color:var(--mm-rule)] text-[color:var(--mm-ink)] hover:bg-[color:var(--mm-rule)] cursor-pointer">없음</button>
            {assistForLastCandidates.map(p => (
              <button key={p.id} onClick={() => finishAssistForLast(p.id)}
                className="py-3 rounded-xl text-sm font-bold bg-blue-800 text-blue-200 hover:bg-blue-700 cursor-pointer truncate px-1">
                {p.name}
              </button>
            ))}
          </div>
          <button onClick={() => { setAddingAssistForLast(false); setPendingShot(null) }}
            className="text-xs text-[color:var(--mm-ink-soft)] hover:text-[color:var(--mm-ink)] cursor-pointer w-full text-center min-h-11">취소</button>
        </div>
      )}

      {/* ── Phase 2-G: 스틸→TOV 페어 피커 ── */}
      {awaitingTovPair && (
        <div className="pt-1 space-y-2">
          <p className="inline-flex items-center gap-1.5 text-xs text-[color:var(--mm-ink-soft)]"><Crosshair size={14} aria-hidden /> 스틸 → 턴오버 선수 선택</p>
          <button onClick={() => handleTovPair(null)}
            className="w-full py-2 min-h-11 rounded-xl text-sm font-bold bg-[color:var(--mm-rule)]/60 border border-[color:var(--mm-rule)]/50 text-[color:var(--mm-ink-soft)] hover:bg-[color:var(--mm-rule)] hover:text-[color:var(--mm-ink)] cursor-pointer transition-colors">
            불명 / 미기록
          </button>
          {(() => {
            const opposing = allPlayers.filter(p => p.team_id !== stealerTeamId)
            const oppTeam = opposing[0]?.team_id === homeTeam?.id ? homeTeam : awayTeam
            return opposing.length > 0 ? (
              <div>
                <p className="t-label mb-1.5 px-1" style={{ color: accentOrInk(oppTeam?.color) }}>
                  {oppTeam?.name ?? '상대팀'}
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {opposing.map(p => {
                    const base = teamInk(oppTeam?.color).bg
                    return (
                    <button key={p.id} onClick={() => handleTovPair(p.id)}
                      className="py-2 min-h-11 rounded-xl text-sm font-bold cursor-pointer active:scale-95 transition-all"
                      style={{ backgroundColor: `${base}cc`, color: textOnBg(base) }}>
                      {p.name}
                    </button>
                    )
                  })}
                </div>
              </div>
            ) : null
          })()}
          <button onClick={() => handleTovPair(null)}
            className="text-xs text-[color:var(--mm-ink-soft)] hover:text-[color:var(--mm-ink)] cursor-pointer w-full text-center min-h-11">
            건너뛰기
          </button>
        </div>
      )}

    </div>
  )
}
