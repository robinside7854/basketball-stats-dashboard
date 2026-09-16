'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Clock, AlertTriangle, Crown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { getReadableTextColor } from '@/lib/colorContrast'
import { MAX_EXTENSIONS, EXTENSION_SECONDS } from '@/lib/draftTimer'

export interface PickModalPlayer {
  id: string
  name: string
  number: number | null
  position: string | null
}

export interface PickModalMyPick {
  pick_number: number
  player_name: string
  player_position: string | null
}

/** 화면에 세로 열로 세울 포지션 순서. 여기 없는 값(또는 빈 값)은 전부 「기타」로 모은다. */
const POSITION_ORDER = ['PG', 'SG', 'SF', 'PF', 'C'] as const
const OTHER = '기타'

/**
 * "SG, SF" 처럼 복수 포지션인 선수는 **첫 번째로 적힌 포지션**의 열에만 넣는다.
 * 양쪽에 중복 노출하면 "몇 명 남았나"를 눈으로 셀 수 없게 된다(같은 이름이 두 번 보임).
 */
function primaryPosition(raw: string | null): string {
  const first = (raw ?? '').split(',')[0]?.trim().toUpperCase()
  if (!first) return OTHER
  return (POSITION_ORDER as readonly string[]).includes(first) ? first : OTHER
}

export default function DraftPickModal({
  open,
  onClose,
  players,
  selectedId,
  onSelect,
  onConfirm,
  confirming,
  pickNumber,
  remainingSeconds,
  inGrace,
  graceSeconds,
  extensionsUsed,
  onExtend,
  extending,
  team,
  captainName,
  myPicks,
  totalRounds,
}: {
  open: boolean
  onClose: () => void
  players: PickModalPlayer[]
  selectedId: string | null
  onSelect: (id: string) => void
  onConfirm: () => void
  confirming: boolean
  pickNumber: number
  remainingSeconds: number | null
  inGrace: boolean
  graceSeconds: number
  extensionsUsed: number
  onExtend: () => void
  extending: boolean
  team: { id: string; name: string; color: string } | null
  captainName: string | null
  myPicks: PickModalMyPick[]
  totalRounds: number
}) {
  const [query, setQuery] = useState('')

  // Escape 로 닫기 — 확정 전송 중에는 무시(중복 제출/혼란 방지)
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !confirming) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, confirming, onClose])

  // 검색어 초기화는 부모가 픽마다 key 를 갈아 remount 하는 것으로 처리한다.
  // (effect 안에서 setQuery 를 부르면 cascading render 가 된다)
  const groups = useMemo(() => {
    const q = query.trim()
    const filtered = q
      ? players.filter(p => p.name.includes(q) || (p.number != null && String(p.number).includes(q)))
      : players
    const buckets = new Map<string, PickModalPlayer[]>()
    for (const p of filtered) {
      const key = primaryPosition(p.position)
      const arr = buckets.get(key)
      if (arr) arr.push(p)
      else buckets.set(key, [p])
    }
    const ordered: { key: string; list: PickModalPlayer[] }[] = []
    for (const key of POSITION_ORDER) {
      const list = buckets.get(key)
      if (list?.length) ordered.push({ key, list })
    }
    // 「기타」는 비어 있으면 열 자체를 만들지 않는다 — 빈 칸이 가로폭만 먹는다.
    const other = buckets.get(OTHER)
    if (other?.length) ordered.push({ key: OTHER, list: other })
    return ordered
  }, [players, query])

  if (!open) return null

  const color = team?.color ?? '#f59e0b'
  const onColor = getReadableTextColor(color) === 'dark' ? '#0a0a0a' : '#ffffff'
  const selected = players.find(p => p.id === selectedId) ?? null
  const extLeft = Math.max(0, MAX_EXTENSIONS - extensionsUsed)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${pickNumber}순위 선수 선택`}
      // z-96: 픽 공개 연출(z-100) 아래, 라운드 슬레이트(z-95) 위.
      // 표면은 불투명 단색 — 전체화면이라 뒤를 비칠 이유가 없다.
      className="fixed inset-0 z-[96] flex flex-col bg-gray-950"
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.5rem, env(safe-area-inset-right))',
      }}
    >
      {/* (a) 헤더 — 내 차례 / 남은 초 / 연장 / 닫기 */}
      <div className="shrink-0 flex items-center gap-2 px-1 pb-2 border-b border-gray-800">
        <div className="min-w-0 flex-1">
          <p className="text-sm sm:text-base font-black text-white truncate">
            내 차례 · <span className="tabular-nums">{pickNumber}</span>순위
          </p>
          {team && (
            <p className="text-xs sm:text-sm text-gray-300 truncate">{team.name}</p>
          )}
        </div>
        {inGrace ? (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border-2 border-red-500 bg-red-950 text-red-200 font-mono">
            <AlertTriangle size={16} aria-hidden />
            <span className="text-2xl sm:text-3xl font-black tabular-nums leading-none">{Math.max(0, graceSeconds)}s</span>
          </span>
        ) : remainingSeconds != null ? (
          <span
            className={`shrink-0 text-3xl sm:text-4xl font-black tabular-nums font-mono leading-none ${
              remainingSeconds <= 10 ? 'text-red-400' : 'text-gray-100'
            }`}
            aria-label={`${remainingSeconds}초 남음`}
          >
            {remainingSeconds}s
          </span>
        ) : null}
        <button
          type="button"
          onClick={onExtend}
          disabled={extLeft === 0 || extending || inGrace}
          className="shrink-0 min-h-11 px-2.5 inline-flex items-center gap-1 rounded-md bg-emerald-800 hover:bg-emerald-700 text-emerald-50 text-xs sm:text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          aria-label={`픽 시간 ${EXTENSION_SECONDS}초 연장, ${extLeft}회 남음`}
        >
          <Clock size={14} aria-hidden />+{EXTENSION_SECONDS}s ({extensionsUsed}/{MAX_EXTENSIONS})
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={confirming}
          aria-label="선수 선택 창 닫기"
          className="shrink-0 min-w-11 min-h-11 inline-flex items-center justify-center rounded-md text-gray-300 hover:text-white hover:bg-gray-800 cursor-pointer transition-colors duration-200 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
        >
          <X size={20} />
        </button>
      </div>

      {/* (b) 내 팀 지금까지 — 같은 포지션을 또 뽑는 사고를 막는 유일한 근거라 항상 고정 노출 */}
      <div className="shrink-0 flex items-center gap-2 flex-wrap px-1 py-2 border-b border-gray-800">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden />
        {captainName && (
          <span className="inline-flex items-center gap-1 text-xs sm:text-sm text-amber-200 font-bold shrink-0">
            <Crown size={14} aria-hidden />{captainName}
          </span>
        )}
        <span className="text-xs sm:text-sm text-gray-300 font-bold tabular-nums shrink-0">
          내 픽 {myPicks.length}/{totalRounds}
        </span>
        {myPicks.length === 0 ? (
          <span className="text-xs text-gray-400">아직 없음</span>
        ) : (
          myPicks.map(p => (
            <span
              key={p.pick_number}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-900 border border-gray-700 text-xs sm:text-sm text-gray-100"
            >
              <span className="font-bold">{p.player_name}</span>
              {p.player_position && <span className="text-gray-400 font-mono">{p.player_position}</span>}
            </span>
          ))
        )}
      </div>

      {/* 검색 — 한 줄. 풀이 커지면 포지션 열만으로는 이름을 못 찾는다. */}
      <div className="shrink-0 px-1 py-2">
        <Input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="이름·번호 검색"
          aria-label="선수 이름 또는 등번호 검색"
          className="bg-gray-900 border-gray-700 text-white h-10 text-base"
        />
      </div>

      {/* (c) 포지션별 선수 목록 — 1280 에서는 전체가 한 화면. 390 에서는 이 영역만 스크롤한다
          (헤더·내 팀·확정 바는 고정이라 남은 시간과 확정 버튼은 절대 사라지지 않는다). */}
      <div className="flex-1 min-h-0 overflow-y-auto px-1">
        {groups.length === 0 ? (
          <p className="text-center text-base text-gray-300 py-10">해당하는 선수가 없습니다</p>
        ) : (
          <div
            className="grid grid-cols-2 gap-x-2 gap-y-3 lg:[grid-template-columns:repeat(var(--dpm-cols),minmax(0,1fr))]"
            style={{ '--dpm-cols': groups.length } as React.CSSProperties}
          >
            {groups.map(g => (
              <div key={g.key} className="min-w-0">
                <p className="text-xs font-black uppercase tracking-widest text-gray-300 mb-1.5 px-0.5">
                  {g.key} <span className="text-gray-500 tabular-nums">{g.list.length}</span>
                </p>
                <div className="space-y-1">
                  {g.list.map(p => {
                    const isSel = p.id === selectedId
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onSelect(p.id)}
                        aria-pressed={isSel}
                        className={`w-full min-h-11 px-2 rounded-md border text-sm font-bold text-left truncate cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950 ${
                          isSel ? 'border-transparent' : 'bg-gray-900 border-gray-700 text-gray-100 hover:border-gray-500'
                        }`}
                        style={isSel ? { backgroundColor: color, color: onColor } : undefined}
                      >
                        {p.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 확정 바 — 첫 탭은 선택, 이 버튼이 유일한 확정 단계다. */}
      <div className="shrink-0 pt-2 px-1 border-t border-gray-800">
        <button
          type="button"
          onClick={onConfirm}
          disabled={!selectedId || confirming}
          className="w-full min-h-[56px] rounded-xl text-lg font-black cursor-pointer disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-400 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-950"
          style={selectedId && !confirming ? { backgroundColor: color, color: onColor } : undefined}
        >
          {confirming ? '픽 등록 중...' : selected ? `${selected.name} 픽 확정` : '선수를 선택하세요'}
        </button>
      </div>
    </div>
  )
}
