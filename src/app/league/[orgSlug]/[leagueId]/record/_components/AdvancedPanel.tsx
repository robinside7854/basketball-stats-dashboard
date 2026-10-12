import { ChevronDown, Loader2, Trash2, Zap } from 'lucide-react'
import { QUARTER_OPTIONS } from '../_lib/constants'
import type { GameSlot, QuarterVideoMap, RosterPlayer, Setter } from '../_lib/types'

// 고급 설정 — 접어 둔다. 실측(리그 282경기): 경기한정 +1 4% · 쿼터별 +1 0%.
//   96%의 경기에서 손대지 않는 것이 선수 수만큼 토글을 펼친 채 자리를 차지하고 있었다.
//   기능을 없앤 것이 아니라 한 줄로 접었다 — 필요한 4%에서는 그대로 다 있다.
export default function AdvancedPanel({
  selectedSlot, homeRoster, awayRoster, quarterVideos,
  advancedOpen, setAdvancedOpen, extraP1AllSlots, setExtraP1AllSlots, savingExtraP1,
  toggleExtraPlusOne, togglePlusOneQuarter, clearYoutubeUrl, deleteSlot, deletingSlot,
}: {
  selectedSlot: GameSlot
  homeRoster: RosterPlayer[]
  awayRoster: RosterPlayer[]
  quarterVideos: QuarterVideoMap
  advancedOpen: boolean
  setAdvancedOpen: Setter<boolean>
  extraP1AllSlots: boolean
  setExtraP1AllSlots: Setter<boolean>
  savingExtraP1: string | null
  toggleExtraPlusOne: (playerId: string, playerName: string) => Promise<void>
  togglePlusOneQuarter: (playerId: string, quarter: number) => Promise<void>
  clearYoutubeUrl: () => Promise<void>
  deleteSlot: () => Promise<void>
  deletingSlot: boolean
}) {
  return (
    <details
      className="mt-3 pt-3"
      style={{ borderTop: '1px dashed var(--mm-rule)' }}
      open={advancedOpen}
      onToggle={e => setAdvancedOpen(e.currentTarget.open)}
    >
      <summary className="flex items-center gap-2 min-h-11 cursor-pointer list-none select-none [&::-webkit-details-marker]:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
        <ChevronDown
          size={14}
          aria-hidden
          className="shrink-0 transition-transform duration-200"
          style={{ color: 'var(--mm-muted)', transform: advancedOpen ? 'none' : 'rotate(-90deg)' }}
        />
        <span className="t-label" style={{ color: 'var(--mm-muted)' }}>고급</span>
        <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>
          이 경기 +1 · 슬롯 삭제
        </span>
        {/* 지금 켜져 있으면 접힌 채로도 보이게 — 켜 놓고 잊으면 그 경기 점수가 통째로 달라진다 */}
        {((selectedSlot.plus_one_extra_ids ?? []).length > 0
          || Object.keys(selectedSlot.plus_one_quarters ?? {}).length > 0) && (
          <span
            className="text-xs font-bold px-1.5 py-0.5"
            style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '4px' }}
          >
            +1 지정됨
          </span>
        )}
      </summary>

    {/* 이 경기 한정 +1 — 선수 목록의 +1 은 전역 플래그라 켜면 과거 마감 경기까지 소급된다.
        (미라클은 plus_one_bonus=1 이라 그 선수의 과거 야투마다 점수가 올라간다)
        대회 연습처럼 그날만 룰이 다른 경우를 위해 경기 쪽에 담는다. */}
    {(homeRoster.length > 0 || awayRoster.length > 0) && (
      <div className="mt-3 pt-3" style={{ borderTop: '1px dashed var(--mm-rule)' }}>
        <div className="flex items-baseline gap-2 flex-wrap mb-2">
          <span className="t-label" style={{ color: 'var(--mm-muted)' }}>
            이 경기 한정 +1
          </span>
          <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>
            이 경기에서만 적용됩니다 · 과거 기록은 그대로입니다
          </span>
          <label className="inline-flex items-center gap-1.5 text-xs cursor-pointer min-h-11" style={{ color: 'var(--mm-ink-soft)' }}>
            <input
              type="checkbox"
              checked={extraP1AllSlots}
              onChange={e => setExtraP1AllSlots(e.target.checked)}
              className="cursor-pointer w-4 h-4"
            />
            이 날짜 전 슬롯에 함께 적용
          </label>
        </div>
        <ul className="flex flex-wrap gap-1.5 list-none p-0 m-0">
          {[...homeRoster, ...awayRoster].map(pl => {
            const extra = (selectedSlot.plus_one_extra_ids ?? []).includes(pl.id)
            const always = !!pl.plus_one
            const busy = savingExtraP1 === pl.id
            return (
              <li key={pl.id}>
                <button
                  type="button"
                  onClick={() => toggleExtraPlusOne(pl.id, pl.name)}
                  disabled={busy || always}
                  aria-pressed={extra || always}
                  title={always
                    ? '선수 목록에서 상시 +1 로 지정된 선수입니다 (여기서 끌 수 없습니다)'
                    : extra ? '이 경기 +1 해제' : '이 경기에서만 +1 로 지정'}
                  className="inline-flex items-center gap-1.5 px-2.5 min-h-11 text-xs font-bold cursor-pointer transition-colors duration-200 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                  style={always
                    ? { background: 'var(--mm-panel)', color: 'var(--mm-muted)', border: '1px dashed var(--mm-rule)', borderRadius: '4px' }
                    : extra
                    ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-yellow)', borderRadius: '4px' }
                    : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
                >
                  {busy
                    ? <Loader2 size={14} className="animate-spin" aria-hidden />
                    : <Zap size={14} strokeWidth={2.5} aria-hidden style={{ opacity: (extra || always) ? 1 : 0.35 }} />}
                  {pl.name}
                  {always && <span className="text-xs">상시</span>}
                </button>
              </li>
            )
          })}
        </ul>

        {/* 쿼터별 +1 (113) — 전반과 후반의 +1 선수가 다른 경기가 있다.
            +1 이 켜진 선수만 보여준다(꺼진 선수에겐 의미가 없다).
            지정이 없으면 전 쿼터 적용이라 처음엔 네 칸이 다 켜져 보인다. */}
        {(() => {
          const active = [...homeRoster, ...awayRoster].filter(
            pl => pl.plus_one || (selectedSlot.plus_one_extra_ids ?? []).includes(pl.id),
          )
          if (active.length === 0) return null
          const limits = (selectedSlot.plus_one_quarters ?? {}) as Record<string, number[]>
          return (
            <div className="mt-3 pt-3" style={{ borderTop: '1px dashed var(--mm-rule)' }}>
              <div className="flex items-baseline gap-2 flex-wrap mb-2">
                <span className="t-label" style={{ color: 'var(--mm-muted)' }}>쿼터별 +1</span>
                <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>
                  전·후반 +1 선수가 다를 때 씁니다 · 끄면 그 쿼터에는 +1 이 붙지 않습니다
                </span>
              </div>
              {/* 선수마다 한 칸 — 이름과 토글을 같은 줄에 두면 좁은 화면에서 감겨
                  "연장2 전 쿼터" 가 누구 것인지 흐려진다(375px 실측). */}
              <ul className="space-y-2 list-none p-0 m-0">
                {active.map(pl => {
                  const on = limits[pl.id] ?? QUARTER_OPTIONS.map(q => q.value)
                  const busy = savingExtraP1 === pl.id
                  const limited = !!limits[pl.id]
                  return (
                    <li
                      key={pl.id}
                      className="p-2"
                      style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
                    >
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="text-xs font-bold break-keep" style={{ color: 'var(--mm-ink)' }}>
                          {pl.name}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>
                          {limited ? `${on.map(v => QUARTER_OPTIONS.find(q => q.value === v)?.label ?? v).join('·')} 만` : '전 쿼터'}
                        </span>
                        {busy && <Loader2 size={14} className="animate-spin" aria-hidden style={{ color: 'var(--mm-muted)' }} />}
                      </div>
                      <div className="flex gap-1 flex-wrap">
                      {QUARTER_OPTIONS.map(q => {
                        const active2 = on.includes(q.value)
                        return (
                          <button
                            key={q.value}
                            type="button"
                            disabled={busy}
                            onClick={() => togglePlusOneQuarter(pl.id, q.value)}
                            aria-pressed={active2}
                            aria-label={`${pl.name} ${q.label} +1 ${active2 ? '해제' : '적용'}`}
                            className="inline-flex items-center justify-center min-h-11 min-w-11 px-2 text-xs font-bold cursor-pointer transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                            style={active2
                              ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-yellow)', borderRadius: '4px' }
                              : { background: 'var(--mm-panel-alt)', color: 'var(--mm-muted)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
                          >
                            {q.label}
                          </button>
                        )
                      })}
                      </div>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-2 text-xs leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
                이미 기록한 경기도 여기서 고치면 점수가 다시 계산됩니다.
              </p>
            </div>
          )
        })()}
      </div>
    )}

      {/* 위험한 정리 동작 두 개. 종전에는 팀 셀렉트 옆에 나란히 있어서, 매 경기 쓰는
          버튼(저장·좌우교체) 사이에 「슬롯 삭제」가 섞여 있었다. 여기로 내린다.
          ⚠ 슬롯 삭제는 이벤트가 하나라도 있으면 서버가 409 로 막는다(기록 영구 소멸 방지). */}
      <div className="mt-3 pt-3 flex items-center gap-2 flex-wrap" style={{ borderTop: '1px dashed var(--mm-rule)' }}>
        {Object.keys(quarterVideos).length === 0 && selectedSlot.youtube_url && (
          <button
            onClick={clearYoutubeUrl}
            title="잘못 매핑된 YouTube 영상 링크 제거"
            className="shrink-0 text-xs font-bold px-2.5 py-1.5 transition-colors duration-200 cursor-pointer min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
          >
            영상 링크 제거
          </button>
        )}
        {!selectedSlot.is_started && !selectedSlot.is_complete && (
          <button
            onClick={deleteSlot}
            disabled={deletingSlot}
            title="이 슬롯 삭제 (기록이 있으면 막힙니다)"
            aria-label={`${selectedSlot.slot_num}경기 슬롯 삭제`}
            className="inline-flex items-center gap-1.5 shrink-0 text-xs font-bold px-2.5 py-1.5 transition-colors duration-200 cursor-pointer min-h-[44px] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
          >
            {deletingSlot
              ? <Loader2 size={14} className="animate-spin" aria-hidden />
              : <Trash2 size={14} strokeWidth={2.5} aria-hidden />}
            슬롯 삭제
          </button>
        )}
        {selectedSlot.is_started && (
          <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>
            기록이 시작된 경기라 슬롯을 지울 수 없습니다
          </span>
        )}
      </div>
    </details>
  )
}
