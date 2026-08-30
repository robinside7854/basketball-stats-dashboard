'use client'
// 대회 등록/수정 — league_quarters(kind='tournament') 행 하나를 만든다.
//
//   여기가 생기기 전까지 대회를 만들 방법이 **화면에도 API 에도 없었다**(대회 보드의 빈 화면이
//   "온볼 운영팀에 알려주시면 등록해 드립니다" 라고 안내하던 이유). 그래서 미라클 대회 묶음은
//   대회 0건 · 경기 0건인 채로 비어 있었다.
//
//   연도·분기 번호는 묻지 않는다 — 대회에서 그 숫자는 UNIQUE 제약을 피하기 위한 것일 뿐
//   아무 의미가 없어서(084), 서버가 조용히 채번한다. 화면은 사람이 답할 수 있는 것만 묻는다.
import { useEffect, useState } from 'react'
import { X, Trophy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'

export type TournamentDraft = {
  id?: string
  name: string
  start_date: string | null
  end_date: string | null
  tournament_type: string | null
  description: string | null
}

interface Props {
  leagueId: string
  /** 있으면 수정, 없으면 신규 */
  initial?: TournamentDraft
  onClose: () => void
  onSaved: () => void
}

const FIELD: React.CSSProperties = {
  background: 'var(--mm-panel-alt)',
  color: 'var(--mm-ink)',
  border: '1px solid var(--mm-rule)',
  borderRadius: 4,
}

export default function TournamentFormModal({ leagueId, initial, onClose, onSaved }: Props) {
  const { leagueHeaders } = useLeagueEditMode()
  const isEdit = !!initial?.id

  const [name, setName] = useState(initial?.name ?? '')
  const [startDate, setStartDate] = useState(initial?.start_date ?? '')
  const [endDate, setEndDate] = useState(initial?.end_date ?? '')
  const [type, setType] = useState(initial?.tournament_type ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, saving])

  async function save() {
    if (saving) return
    const trimmed = name.trim()
    if (!trimmed) { toast.error('대회 이름을 입력하세요'); return }
    // 서버도 같은 검사를 하지만, 저장을 눌렀다가 되돌아오는 것보다 여기서 막는 편이 낫다.
    if (startDate && endDate && endDate < startDate) {
      toast.error('종료일이 시작일보다 빠릅니다')
      return
    }

    setSaving(true)
    try {
      const body = isEdit
        ? {
            quarterId: initial!.id,
            name: trimmed,
            start_date: startDate || null,
            end_date: endDate || null,
            tournament_type: type || null,
            description: description || null,
          }
        : {
            kind: 'tournament',
            name: trimmed,
            start_date: startDate || null,
            end_date: endDate || null,
            tournament_type: type || null,
            description: description || null,
          }

      const res = await fetch(`/api/leagues/${leagueId}/quarters`, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', ...leagueHeaders },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error ?? `저장 실패 (${res.status})`)
      }
      toast.success(isEdit ? '대회 정보를 저장했습니다' : `"${trimmed}" 대회를 등록했습니다`)
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? '대회 정보 수정' : '대회 등록'}
    >
      {/* 모달 뒤를 가리는 것이 목적인 오버레이 — 카드 표면에는 블러를 쓰지 않는다 */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative z-10 w-full max-w-md flex flex-col overflow-hidden"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-yellow)',
          borderRadius: 8,
          maxHeight: '85vh',
          boxShadow: '0 24px 60px -16px rgba(0,0,0,0.5)',
        }}
      >
        <div
          className="flex items-center justify-between gap-3 px-4 py-3 shrink-0"
          style={{ background: 'var(--mm-yellow)', borderBottom: '1px solid var(--mm-black)' }}
        >
          <span className="inline-flex items-center gap-2 min-w-0">
            <Trophy size={16} className="shrink-0" style={{ color: 'var(--mm-black)' }} aria-hidden />
            <span className="text-sm font-black truncate" style={{ color: 'var(--mm-black)' }}>
              {isEdit ? '대회 정보 수정' : '대회 등록'}
            </span>
          </span>
          <button
            type="button" onClick={onClose} disabled={saving} aria-label="닫기"
            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded transition-colors duration-200 hover:bg-black/10 cursor-pointer disabled:cursor-not-allowed"
            style={{ color: 'var(--mm-black)' }}
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <label htmlFor="tf-name" className="block text-xs font-bold mb-1.5" style={{ color: 'var(--mm-ink-soft)' }}>
              대회 이름 <span style={{ color: 'var(--mm-yellow-strong)' }}>*</span>
            </label>
            <input
              id="tf-name" type="text" value={name} maxLength={60}
              onChange={e => setName(e.target.value)}
              placeholder="예: 2026 가을 연합회장배"
              className="w-full min-h-[44px] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
              style={FIELD}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="tf-start" className="block text-xs font-bold mb-1.5" style={{ color: 'var(--mm-ink-soft)' }}>
                시작일
              </label>
              <input
                id="tf-start" type="date" value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full min-h-[44px] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
                style={FIELD}
              />
            </div>
            <div>
              <label htmlFor="tf-end" className="block text-xs font-bold mb-1.5" style={{ color: 'var(--mm-ink-soft)' }}>
                종료일
              </label>
              <input
                id="tf-end" type="date" value={endDate} min={startDate || undefined}
                onChange={e => setEndDate(e.target.value)}
                className="w-full min-h-[44px] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
                style={FIELD}
              />
            </div>
          </div>

          <div>
            <label htmlFor="tf-type" className="block text-xs font-bold mb-1.5" style={{ color: 'var(--mm-ink-soft)' }}>
              대회 성격
            </label>
            <select
              id="tf-type" value={type} onChange={e => setType(e.target.value)}
              className="w-full min-h-[44px] px-3 text-sm cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
              style={FIELD}
            >
              <option value="">선택 안 함</option>
              <option value="amateur">동호인</option>
              <option value="pro">선출 포함</option>
            </select>
          </div>

          <div>
            <label htmlFor="tf-desc" className="block text-xs font-bold mb-1.5" style={{ color: 'var(--mm-ink-soft)' }}>
              메모
            </label>
            <textarea
              id="tf-desc" value={description} rows={3} maxLength={500}
              onChange={e => setDescription(e.target.value)}
              placeholder="주최·장소·참가 자격 등"
              className="w-full px-3 py-2 text-sm leading-relaxed outline-none resize-y focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
              style={FIELD}
            />
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-2 px-4 py-3 shrink-0"
          style={{ borderTop: '1px solid var(--mm-rule)' }}
        >
          <button
            type="button" onClick={onClose} disabled={saving}
            className="min-h-[44px] px-4 text-sm font-bold rounded-sm cursor-pointer transition-colors duration-200 hover:brightness-95 disabled:cursor-not-allowed"
            style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}
          >
            취소
          </button>
          <button
            type="button" onClick={save} disabled={saving}
            className="min-h-[44px] px-5 text-sm font-black rounded-sm cursor-pointer inline-flex items-center gap-2 transition-colors duration-200 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-yellow)' }}
          >
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {isEdit ? '저장' : '대회 등록'}
          </button>
        </div>
      </div>
    </div>
  )
}
