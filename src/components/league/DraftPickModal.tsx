'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { X, Clock, AlertTriangle, Crown } from 'lucide-react'
import { Input } from '@/components/ui/input'
import ConfirmModal from '@/components/league/ConfirmModal'
import { teamInk } from '@/lib/util/contrastColor'
import { MAX_EXTENSIONS, EXTENSION_SECONDS } from '@/lib/draftTimer'
import { POSITION_GROUP_ORDER, POSITION_META, primaryPosition, type PositionGroup } from '@/lib/draft/positions'

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

// 포지션 색·아이콘·분류는 @/lib/draft/positions 단일 진실. 여기서 다시 정의하지 않는다.

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
  clockPending = false,
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
  /** null = 선택 해제(행 안의 「취소」). 부모 selectPlayer 가 이미 null 을 받는다. */
  onSelect: (id: string | null) => void
  onConfirm: () => void
  confirming: boolean
  pickNumber: number
  remainingSeconds: number | null
  inGrace: boolean
  graceSeconds: number
  /** 진행 중이지만 픽 마감이 아직 없음(공개 연출 대기) — 0초가 아니라 「곧 시작」으로 보여야 한다 */
  clockPending?: boolean
  extensionsUsed: number
  onExtend: () => void
  extending: boolean
  team: { id: string; name: string; color: string } | null
  captainName: string | null
  myPicks: PickModalMyPick[]
  totalRounds: number
}) {
  const [query, setQuery] = useState('')
  // 지명 확인 대화상자 대상. 행 안의 「픽 확정」은 이 창을 열 뿐이고,
  // 실제 전송은 창에서 한 번 더 누를 때만 일어난다(리허설: 목록에서 손가락이 미끄러져 오지명).
  const [confirmId, setConfirmId] = useState<string | null>(null)

  // Escape 로 닫기 — 확정 전송 중에는 무시(중복 제출/혼란 방지).
  // 확인 창이 떠 있으면 Esc 는 그 창만 닫아야 한다 → 여기서는 건너뛴다.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !confirming && confirmId == null) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, confirming, confirmId, onClose])

  // 검색어 초기화는 부모가 픽마다 key 를 갈아 remount 하는 것으로 처리한다.
  // (effect 안에서 setQuery 를 부르면 cascading render 가 된다)
  const groups = useMemo(() => {
    const q = query.trim()
    const filtered = q
      ? players.filter(p => p.name.includes(q) || (p.number != null && String(p.number).includes(q)))
      : players
    const buckets = new Map<PositionGroup, PickModalPlayer[]>()
    for (const p of filtered) {
      const key = primaryPosition(p.position)
      const arr = buckets.get(key)
      if (arr) arr.push(p)
      else buckets.set(key, [p])
    }
    // 비어 있는 그룹(대개 「기타」)은 열 자체를 만들지 않는다 — 빈 칸이 가로폭만 먹는다.
    const ordered: { key: PositionGroup; list: PickModalPlayer[] }[] = []
    for (const key of POSITION_GROUP_ORDER) {
      const list = buckets.get(key)
      if (list?.length) ordered.push({ key, list })
    }
    return ordered
  }, [players, query])

  const confirmPlayer = players.find(p => p.id === confirmId) ?? null
  const closeConfirm = useCallback(() => setConfirmId(null), [])
  const acceptConfirm = useCallback(() => { setConfirmId(null); onConfirm() }, [onConfirm])

  if (!open) return null

  // 팀 컬러 위 잉크는 휘도 임계값이 아니라 실측 대비비로 고른다 —
  // 챗지피지기(#ff0000)는 임계값 방식이 흰 글자(4.00:1, AA 미달)를 골랐다.
  const ink = teamInk(team?.color ?? '#f59e0b')
  const color = ink.bg
  const onColor = ink.fg
  const extLeft = Math.max(0, MAX_EXTENSIONS - extensionsUsed)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${pickNumber}순위 선수 선택`}
      // z-96: 픽 공개 연출(z-100) 아래, 라운드 슬레이트(z-95) 위.
      // 표면은 불투명 단색 — 전체화면이라 뒤를 비칠 이유가 없다.
      className="fixed inset-0 z-[96] flex flex-col bg-[var(--mm-panel)]"
      style={{
        paddingTop: 'max(0.5rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))',
        paddingLeft: 'max(0.5rem, env(safe-area-inset-left))',
        paddingRight: 'max(0.5rem, env(safe-area-inset-right))',
      }}
    >
      {/* (a) 헤더 — 내 차례 / 남은 초 / 연장 / 닫기 */}
      <div className="shrink-0 flex items-center gap-2 px-1 pb-2 border-b border-[var(--mm-rule)]">
        <div className="min-w-0 flex-1">
          <p className="text-sm sm:text-base font-black text-[var(--mm-ink)] truncate">
            내 차례 · <span className="tabular-nums">{pickNumber}</span>순위
          </p>
          {team && (
            <p className="text-xs sm:text-sm text-[var(--mm-muted)] truncate">{team.name}</p>
          )}
        </div>
        {clockPending ? (
          <span className="shrink-0 text-base sm:text-lg font-bold text-[var(--mm-muted)] break-keep leading-tight">
            공개 중 · 곧 시작
          </span>
        ) : inGrace ? (
          <span className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border-2 border-[var(--mm-negative)] bg-[var(--mm-negative-bg)] text-[var(--mm-negative-fg)] font-mono">
            <AlertTriangle size={16} aria-hidden />
            <span className="text-2xl sm:text-3xl font-black tabular-nums leading-none">{Math.max(0, graceSeconds)}s</span>
          </span>
        ) : remainingSeconds != null ? (
          <span
            className={`shrink-0 text-3xl sm:text-4xl font-black tabular-nums font-mono leading-none ${
              remainingSeconds <= 10 ? 'text-[var(--mm-negative)]' : 'text-[var(--mm-ink)]'
            }`}
            aria-label={`${remainingSeconds}초 남음`}
          >
            {remainingSeconds}s
          </span>
        ) : null}
        <button
          type="button"
          onClick={onExtend}
          // 시계 시작 전 연장은 서버가 409 로 막는다 — 누를 수 있게 두면 실패 토스트만 뜬다
          disabled={extLeft === 0 || extending || inGrace || clockPending}
          className="shrink-0 min-h-11 px-2.5 inline-flex items-center gap-1 rounded-md bg-[var(--mm-panel-alt)] hover:brightness-95 text-[var(--mm-ink)] border border-[var(--mm-rule)] text-xs sm:text-sm font-bold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mm-ground)]"
          aria-label={`픽 시간 ${EXTENSION_SECONDS}초 연장, ${extLeft}회 남음`}
        >
          <Clock size={14} aria-hidden />+{EXTENSION_SECONDS}s ({extensionsUsed}/{MAX_EXTENSIONS})
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={confirming}
          aria-label="선수 선택 창 닫기"
          className="shrink-0 min-w-11 min-h-11 inline-flex items-center justify-center rounded-md text-[var(--mm-muted)] hover:text-[var(--mm-ink)] hover:bg-[var(--mm-panel-alt)] cursor-pointer transition-colors duration-200 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mm-ground)]"
        >
          <X size={20} />
        </button>
      </div>

      {/* (b) 내 팀 지금까지 — 같은 포지션을 또 뽑는 사고를 막는 유일한 근거라 항상 고정 노출 */}
      <div className="shrink-0 flex items-center gap-2 flex-wrap px-1 py-2 border-b border-[var(--mm-rule)]">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden />
        {captainName && (
          <span className="inline-flex items-center gap-1 text-xs sm:text-sm text-[var(--mm-yellow-strong)] font-bold shrink-0">
            <Crown size={14} aria-hidden />{captainName}
          </span>
        )}
        <span className="text-xs sm:text-sm text-[var(--mm-muted)] font-bold tabular-nums shrink-0">
          내 픽 {myPicks.length}/{totalRounds}
        </span>
        {myPicks.length === 0 ? (
          <span className="text-xs text-[var(--mm-muted)]">아직 없음</span>
        ) : (
          myPicks.map(p => (
            <span
              key={p.pick_number}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--mm-panel)] border border-[var(--mm-rule)] text-xs sm:text-sm text-[var(--mm-ink)]"
            >
              <span className="font-bold">{p.player_name}</span>
              {p.player_position && <span className="text-[var(--mm-muted)] font-mono">{p.player_position}</span>}
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
          className="bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink)] h-10 text-base"
        />
      </div>

      {/* (c) 포지션 그룹별 선수 목록 — 1280 에서는 전체가 한 화면. 390 에서는 이 영역만 스크롤한다
          (헤더·내 팀은 고정이라 남은 시간은 절대 사라지지 않는다).
          모바일은 **세로 스택**이다: 390px 을 3열로 쪼개면 한 칸이 약 120px 이라
          「홍길동 픽 확정」 인라인 버튼이 두 줄로 접히고 이름도 잘린다(실측). 그룹이 3개뿐이라
          스택해도 스크롤이 길지 않다. sm 이상부터 그룹 수만큼 열을 세운다. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-1 pb-2">
        {groups.length === 0 ? (
          <p className="text-center text-base text-[var(--mm-muted)] py-10">해당하는 선수가 없습니다</p>
        ) : (
          <div
            className="grid grid-cols-1 gap-x-2 gap-y-3 sm:[grid-template-columns:repeat(var(--dpm-cols),minmax(0,1fr))]"
            style={{ '--dpm-cols': groups.length } as React.CSSProperties}
          >
            {groups.map(g => {
              const meta = POSITION_META[g.key]
              const PosIcon = meta.Icon
              return (
              // scroll-mt: 모바일에서 그룹으로 튈 때 머리띠가 상단 고정 영역에 가리지 않게.
              // 위쪽 얇은 구분선은 모바일(세로 스택)에서만 — sm 이상은 열이 나란히라 선이 노이즈다.
              <div key={g.key} id={`dpm-group-${g.key}`} className="min-w-0 scroll-mt-2 border-t border-[var(--mm-rule)] pt-2 sm:border-t-0 sm:pt-0">
                {/* 포지션 머리띠 — 색 + 아이콘 + 코드 + 인원. 색만으로 구분하지 않도록
                    코드 글자와 아이콘을 항상 함께 둔다(색각 이상·흑백 프린트 대비). */}
                <div
                  className="mb-1.5 px-2 min-h-9 flex items-center gap-1.5 rounded-md"
                  style={{ backgroundColor: meta.color, color: meta.ink }}
                >
                  <PosIcon size={16} aria-hidden />
                  <span className="text-sm font-black">{meta.label}</span>
                  <span className="ml-auto text-sm font-bold tabular-nums" aria-label={`${meta.label} ${g.list.length}명`}>
                    {g.list.length}
                  </span>
                </div>
                <div className="space-y-1">
                  {g.list.map(p => {
                    const isSel = p.id === selectedId
                    return (
                      <div key={p.id}>
                        <button
                          type="button"
                          onClick={() => onSelect(isSel ? null : p.id)}
                          aria-pressed={isSel}
                          className={`w-full min-h-11 px-2 rounded-md border flex items-center gap-1.5 text-sm font-bold text-left cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mm-ground)] ${
                            isSel ? 'border-transparent' : 'bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink)] hover:border-[var(--mm-yellow)]'
                          }`}
                          // 좌측 4px 은 포지션 색 — 행 하나만 봐도 어느 열의 선수인지 알 수 있다.
                          style={{
                            borderLeft: `4px solid ${meta.color}`,
                            ...(isSel ? { backgroundColor: color, color: onColor, boxShadow: `inset 0 0 0 1px ${ink.border}` } : null),
                          }}
                        >
                          <span className="truncate min-w-0">{p.name}</span>
                          <span
                            className="ml-auto shrink-0 px-1.5 py-0.5 rounded text-xs font-black font-mono tabular-nums"
                            style={isSel
                              ? { backgroundColor: 'rgba(0,0,0,0.18)', color: onColor }
                              : { backgroundColor: meta.color, color: meta.ink }}
                          >
                            {p.position?.trim() || meta.label}
                          </span>
                        </button>

                        {/* 인라인 확정 — 고른 그 자리에서 끝낸다. 하단 고정 확정 바는 없앴다
                            (같은 일을 하는 버튼이 둘이라 어느 쪽이 "진짜"인지 매번 물었다).
                            이 버튼은 전송하지 않고 확인 창을 연다 — 지명은 되돌릴 수 없다.
                            펼침은 grid-template-rows 0fr→1fr + opacity/translate 로만 —
                            width/height 애니메이션은 매 프레임 레이아웃을 다시 계산한다. */}
                        <div
                          className={`grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none ${
                            isSel ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
                          }`}
                        >
                          <div className="overflow-hidden">
                            <div
                              className={`pt-1 pb-1.5 space-y-1 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
                                isSel ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => setConfirmId(p.id)}
                                disabled={confirming}
                                tabIndex={isSel ? 0 : -1}
                                aria-hidden={!isSel}
                                className="w-full min-h-11 rounded-md text-base font-black cursor-pointer disabled:cursor-not-allowed disabled:bg-[var(--mm-panel-alt)] disabled:text-[var(--mm-muted)] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mm-ground)]"
                                style={confirming ? undefined : { backgroundColor: color, color: onColor, boxShadow: `inset 0 0 0 1px ${ink.border}` }}
                              >
                                {confirming ? '픽 등록 중...' : `${p.name} 픽 확정`}
                              </button>
                              <button
                                type="button"
                                onClick={() => onSelect(null)}
                                disabled={confirming}
                                tabIndex={isSel ? 0 : -1}
                                aria-hidden={!isSel}
                                className="w-full min-h-11 rounded-md text-sm font-bold text-[var(--mm-muted)] hover:text-[var(--mm-ink)] hover:bg-[var(--mm-panel-alt)] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--mm-ground)]"
                              >
                                취소
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 지명 확인 — 되돌릴 수 없는 액션이므로 팀·포지션을 다시 읽히고 한 번 더 받는다.
          Esc·배경 탭은 취소(ConfirmModal 이 이미 둘 다 처리한다). */}
      <ConfirmModal
        open={confirmPlayer != null}
        title={`${confirmPlayer?.name ?? ''} 선수를 지명할까요?`}
        lines={[
          team?.name ?? '내 팀',
          confirmPlayer?.position?.trim() || '포지션 미등록',
          '확정 후 되돌릴 수 없습니다',
        ]}
        danger
        confirmLabel="지명 확정"
        cancelLabel="취소"
        onConfirm={acceptConfirm}
        onCancel={closeConfirm}
      />
    </div>
  )
}
