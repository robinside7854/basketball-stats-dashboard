'use client'
// 「다음 분기 추가」 버튼 — 드래프트 화면에서 바로 다음 분기 행을 만든다.
//
// 왜 여기에 있나: 분기 드래프트는 "분기 행 → 코드 재발급 → 세션 생성 → 공유 토큰" 순서로
// 매번 새로 만든다. 그런데 첫 단계인 분기 행은 로스터 화면에만 있어서, 드래프트를 준비하다
// 로스터로 건너가 연·분기·시작일·종료일 4칸을 손으로 채우고 돌아와야 했다.
// 다음 분기는 계산할 수 있는 값이므로 계산해서 한 번에 만든다.
//
// 기존 API 를 그대로 쓴다: POST /api/leagues/[leagueId]/quarters (guard = canEditLeague).

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import ConfirmModal from './ConfirmModal'
import type { Quarter } from '@/types/league'

interface Props {
  leagueId: string
  quarters: Quarter[]
  /** 인증 헤더 — 어드민은 {} (쿠키), 리그 페이지는 X-League-Pin */
  authHeaders?: Record<string, string>
  /** 생성 성공 후 — 부모가 분기 목록을 다시 읽고 새 분기를 선택한다 */
  onCreated: (newQuarterId: string) => void
}

/** 그 달의 마지막 날. '-31' 을 문자열로 붙이면 2·4·6·9·11월이 조용히 틀린다. */
function lastDayOfMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate()
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** 다음 분기(연도, 분기번호)와 그 기간을 계산한다. 리그형 분기만 근거로 삼는다. */
export function computeNextQuarter(quarters: Quarter[]): {
  year: number
  quarter: number
  startDate: string
  endDate: string
  label: string
} | null {
  // 대회(kind='tournament')는 quarter 번호가 서버 채번한 아무 값이라 최대값 계산에 섞이면
  // 엉뚱한 분기(예: 26.7Q)를 제안한다 — 리그형만 본다.
  const league = quarters.filter(q => q.kind !== 'tournament')
  if (league.length === 0) return null

  let maxYear = -Infinity
  let maxQuarter = -Infinity
  for (const q of league) {
    if (q.year > maxYear || (q.year === maxYear && q.quarter > maxQuarter)) {
      maxYear = q.year
      maxQuarter = q.quarter
    }
  }
  if (!Number.isFinite(maxYear) || !Number.isFinite(maxQuarter)) return null

  const year = maxQuarter < 4 ? maxYear : maxYear + 1
  const quarter = maxQuarter < 4 ? maxQuarter + 1 : 1

  const startMonth = (quarter - 1) * 3 + 1
  const endMonth = startMonth + 2
  const startDate = `${year}-${pad2(startMonth)}-01`
  const endDate = `${year}-${pad2(endMonth)}-${pad2(lastDayOfMonth(year, endMonth))}`

  return { year, quarter, startDate, endDate, label: `${String(year).slice(2)}.${quarter}Q` }
}

export default function NextQuarterButton({ leagueId, quarters, authHeaders = {}, onCreated }: Props) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const next = computeNextQuarter(quarters)
  if (!next) return null

  const currentQ = quarters.find(q => q.is_current && q.kind !== 'tournament')
  const currentLabel = currentQ ? `${String(currentQ.year).slice(2)}.${currentQ.quarter}Q` : null
  const exists = quarters.some(
    q => q.kind !== 'tournament' && q.year === next.year && q.quarter === next.quarter,
  )
  if (exists) return null

  async function create() {
    if (!next) return
    setSaving(true)
    const res = await fetch(`/api/leagues/${leagueId}/quarters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({
        year: next.year,
        quarter: next.quarter,
        // 현재 분기는 건드리지 않는다 — 드래프트 준비 단계에서 시즌을 넘겨 버리면
        // 홈·순위·기록 화면이 한꺼번에 빈 분기를 가리킨다.
        is_current: false,
        start_date: next.startDate,
        end_date: next.endDate,
      }),
    }).catch(() => null)
    setSaving(false)
    setOpen(false)

    if (!res) { toast.error('네트워크 오류 — 다시 시도하세요'); return }
    if (res.status === 401) { toast.error('편집 권한이 필요합니다 (PIN 또는 어드민)'); return }
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data?.error ?? '분기 생성 실패'); return }

    toast.success(`${next.label} 추가 완료`)
    onCreated(data?.id as string)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={saving}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 min-h-11 rounded-sm text-sm sm:text-base font-bold border border-dashed border-[color:var(--mm-rule)] bg-[color:var(--mm-panel-alt)] text-[color:var(--mm-ink-soft)] hover:text-[color:var(--mm-ink)] hover:border-[color:var(--mm-ink-soft)] cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--mm-ground)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Plus size={16} aria-hidden /> 다음 분기 추가 ({next.label})
      </button>

      <ConfirmModal
        open={open}
        title="다음 분기 추가"
        lines={[
          `${next.label}(${next.startDate} ~ ${next.endDate})를 추가할까요?`,
          currentLabel
            ? `현재 분기(${currentLabel})는 그대로입니다.`
            : '현재 분기 설정은 바뀌지 않습니다.',
        ]}
        confirmLabel="분기 추가"
        onCancel={() => setOpen(false)}
        onConfirm={() => { void create() }}
      />
    </>
  )
}
