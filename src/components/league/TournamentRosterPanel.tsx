'use client'
// 대회 참가 인원 등록 — 팀 명단 중 "이 대회에 나가는 사람"을 정한다.
//   모델은 파란날개의 tournament_players(tournament_id, player_id) 와 같다(import 는 안 한다,
//   레거시 트리는 읽기만) — 저장은 이미 있는 league_player_quarters(quarter_id,
//   league_player_id, team_id, is_regular) 를 그대로 쓴다. 새 테이블을 만들지 않는다.
//
//   team_id 는 "우리 팀" league_teams 행(is_external=false) 하나를 가리킨다 — 대회는
//   리그처럼 여러 스크리미지 팀으로 나뉘지 않으므로, 등록 = 그 하나뿐인 우리 팀에 배정.
//   그 행이 아직 없으면(새 대회) 이 패널이 열릴 때 자동으로 하나 만든다.
//
//   편집 권한자에게만 보인다 — 서버(canEditLeague)가 최종 판단, 이 컴포넌트는 UI 노출만.
import { useEffect, useState, useCallback } from 'react'
import { X, UserCheck, Loader2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { BasketballLoader } from '@/components/league/BasketballIcons'

type RosterPlayer = {
  id: string
  name: string
  number: number | null
  position: string | null
  is_active: boolean | null
  team_id: string | null   // league_player_quarters 배정(=등록 시 우리팀 id) — 없으면 미등록
  is_regular: boolean | null
  has_events: boolean      // 이 대회에 이미 기록이 있으면 해제 불가
}

type ApiTeam = { id: string; is_external: boolean | null }

interface Props {
  leagueId: string
  quarterId: string
  quarterName: string
  onClose: () => void
}

export default function TournamentRosterPanel({ leagueId, quarterId, quarterName, onClose }: Props) {
  const { leagueHeaders } = useLeagueEditMode()
  const [players, setPlayers] = useState<RosterPlayer[] | null>(null)
  const [ourTeamId, setOurTeamId] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      // 1) "우리 팀" league_teams 행 확보 — 대회는 스크리미지 팀 분리가 없어 항상 하나뿐이다.
      const teamsRes = await fetch(`/api/leagues/${leagueId}/teams`, { headers: leagueHeaders })
      if (!teamsRes.ok) throw new Error('팀 정보를 불러오지 못했습니다')
      const teams = (await teamsRes.json()) as ApiTeam[]
      let internal = teams.find(t => t.is_external === false) ?? null
      if (!internal) {
        // 이 대회에 아직 "우리 팀" 행이 없다 — 등록을 쓰려면 있어야 하므로 하나 만든다.
        const createRes = await fetch(`/api/leagues/${leagueId}/teams`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...leagueHeaders },
          body: JSON.stringify({ name: '우리 팀' }),
        })
        if (!createRes.ok) throw new Error('참가팀 생성에 실패했습니다')
        internal = (await createRes.json()) as ApiTeam
      }
      setOurTeamId(internal.id)

      // 2) 팀 명단 + 이 대회 등록 현황(quarters/[quarterId]/players 가 병합해서 준다)
      const rosterRes = await fetch(`/api/leagues/${leagueId}/quarters/${quarterId}/players`, { headers: leagueHeaders })
      if (!rosterRes.ok) throw new Error('명단을 불러오지 못했습니다')
      const roster = (await rosterRes.json()) as RosterPlayer[]
      setPlayers(roster.filter(p => p.is_active !== false))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '불러오기 실패')
    }
  }, [leagueId, quarterId, leagueHeaders])

  useEffect(() => {
    let cancelled = false
    ;(async () => { await load(); if (cancelled) return })()
    return () => { cancelled = true }
  }, [load])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const toggle = useCallback(async (player: RosterPlayer, next: boolean) => {
    if (!ourTeamId || pendingId) return
    if (!next && player.has_events) {
      toast.error('이미 경기 기록이 있는 선수는 등록을 해제할 수 없어요.')
      return
    }
    setPendingId(player.id)
    try {
      if (next) {
        const r = await fetch(`/api/leagues/${leagueId}/quarters/${quarterId}/players`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', ...leagueHeaders },
          body: JSON.stringify({ league_player_id: player.id, team_id: ourTeamId, is_regular: true }),
        })
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? '등록 실패')
      } else {
        const r = await fetch(
          `/api/leagues/${leagueId}/quarters/${quarterId}/players?playerId=${player.id}`,
          { method: 'DELETE', headers: leagueHeaders },
        )
        if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error ?? '해제 실패')
      }
      setPlayers(prev => (prev ?? []).map(p =>
        p.id === player.id ? { ...p, team_id: next ? ourTeamId : null, is_regular: next ? true : null } : p,
      ))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '처리 실패')
    } finally {
      setPendingId(null)
    }
  }, [leagueId, quarterId, ourTeamId, pendingId, leagueHeaders])

  const registeredCount = (players ?? []).filter(p => p.team_id === ourTeamId).length

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={`${quarterName} 참가 인원 등록`}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-md bg-[color:var(--mm-panel)] shadow-[0_24px_60px_-16px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col"
        style={{ border: '1px solid var(--mm-yellow)', borderRadius: 8, maxHeight: '85vh' }}
      >
        <div className="flex items-center justify-between gap-3 px-4 py-3 shrink-0" style={{ background: 'var(--mm-yellow)', borderBottom: '1px solid var(--mm-black)' }}>
          <div className="inline-flex items-center gap-2 min-w-0">
            <UserCheck size={16} className="text-[color:var(--mm-black)] shrink-0" aria-hidden />
            <span className="text-xs font-black uppercase tracking-[0.12em] text-[color:var(--mm-black)] truncate">
              {quarterName} · 참가 인원
            </span>
          </div>
          <button
            type="button" onClick={onClose} aria-label="닫기"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded transition-colors hover:bg-black/10 cursor-pointer text-[color:var(--mm-black)] shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        <p className="px-4 pt-3 text-[12px] leading-relaxed" style={{ color: 'var(--mm-ink-soft)' }}>
          체크한 선수만 이 대회 경기 기록 화면(로스터)에 뜹니다. 이미 기록이 있는 선수는 체크를 풀 수 없어요.
        </p>

        <div className="px-4 pt-2 pb-1 text-[11px] font-bold" style={{ color: 'var(--mm-muted)' }}>
          {players ? `등록 ${registeredCount}명 / 전체 ${players.length}명` : ' '}
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {loadError ? (
            <div className="flex flex-col items-center gap-2 py-10 px-4 text-center">
              <ShieldAlert size={24} style={{ color: 'var(--mm-muted)' }} aria-hidden />
              <p className="text-xs font-bold" style={{ color: 'var(--mm-ink-soft)' }}>{loadError}</p>
              <button
                type="button" onClick={load}
                className="mt-1 min-h-[40px] px-4 text-xs font-bold uppercase tracking-[0.10em] rounded-sm cursor-pointer"
                style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)' }}
              >
                다시 시도
              </button>
            </div>
          ) : players === null ? (
            <div className="flex justify-center py-10">
              <BasketballLoader size={28} />
            </div>
          ) : players.length === 0 ? (
            <p className="py-10 text-center text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>
              팀 명단에 등록된 선수가 없어요. 먼저 명단에 선수를 추가하세요.
            </p>
          ) : (
            <ul className="space-y-1">
              {players.map(p => {
                const checked = p.team_id === ourTeamId
                const locked = checked && p.has_events
                const busy = pendingId === p.id
                return (
                  <li key={p.id}>
                    <label
                      className={`flex items-center gap-3 min-h-[44px] px-2 py-1.5 rounded-sm transition-colors ${locked ? '' : 'cursor-pointer'}`}
                      style={{ background: checked ? 'var(--mm-panel-alt)' : 'transparent' }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={busy || (checked && locked)}
                        onChange={(e) => toggle(p, e.target.checked)}
                        className="w-5 h-5 shrink-0 cursor-pointer disabled:cursor-not-allowed"
                        style={{ accentColor: 'var(--mm-yellow-strong)' }}
                        aria-label={`${p.name} 참가 등록`}
                      />
                      <span
                        className="inline-flex items-center justify-center shrink-0 text-[11px] font-black w-6 h-6 rounded-full"
                        style={{ background: 'var(--mm-panel)', color: 'var(--mm-muted)', border: '1px solid var(--mm-rule)' }}
                      >
                        {p.number ?? '-'}
                      </span>
                      <span className="flex-1 min-w-0 text-sm font-bold truncate" style={{ color: 'var(--mm-ink)' }}>
                        {p.name}
                      </span>
                      {busy && <Loader2 size={14} className="animate-spin shrink-0" style={{ color: 'var(--mm-muted)' }} />}
                      {!busy && locked && (
                        <span className="text-[10px] font-bold shrink-0" style={{ color: 'var(--mm-muted)' }}>
                          기록 있음
                        </span>
                      )}
                    </label>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
