import { ChevronDown, Loader2, Trash2 } from 'lucide-react'
import type { GameSlot, QuarterVideoMap, Setter } from '../_lib/types'

// 고급 설정 — 접어 둔다. 실측(리그 282경기): 경기한정 +1 4% · 쿼터별 +1 0%(2026-11-22 쿼터별 칸 삭제).
//   96%의 경기에서 손대지 않는 것이 선수 수만큼 토글을 펼친 채 자리를 차지하고 있었다.
//   기능을 없앤 것이 아니라 한 줄로 접었다 — 필요한 4%에서는 그대로 다 있다.
export default function AdvancedPanel({
  selectedSlot, quarterVideos,
  advancedOpen, setAdvancedOpen, clearYoutubeUrl, deleteSlot, deletingSlot,
}: {
  selectedSlot: GameSlot
  quarterVideos: QuarterVideoMap
  advancedOpen: boolean
  setAdvancedOpen: Setter<boolean>
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
          슬롯 삭제
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

    {/* 「이 경기 한정 +1」·「쿼터별 +1」 지정 칸은 2026-11-22 운영진 결정으로 뺐다(두 달 0번). 저장된 값은 점수 계산이 계속 읽는다. */}

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
