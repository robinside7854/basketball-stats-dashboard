'use client'
// 대회 경기 등록 — 그 대회(quarter)에 속한 league_games 행 하나.
//
//   리그의 "그날 슬롯 9칸 일괄 생성"과는 만드는 것이 다르다. 대회 경기는 상대가 외부 팀이고
//   8강·결승 같은 라운드 표기가 붙는다. 서버가 상대팀(is_external=true)을 이름으로 찾아
//   재사용하거나 새로 만든다 — 같은 상대와 두 번 붙을 때 전적이 흩어지지 않게 하려는 것이다.
//
//   ⚠ 라운드는 자유 입력이 아니라 목록에서 고른다. 대회 보드의 성적 판정(ROUND_ORDER)이
//     아는 값만 성적으로 읽히기 때문에, "8강전" 같은 변형이 들어오면 우승·N강 탈락 표기가
//     조용히 비어 버린다.
import { useEffect, useState } from 'react'
import { X, CalendarPlus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'

const ROUND_LABELS = ['조별예선', '16강', '8강', '4강', '준결승', '결승'] as const

/** 수정 대상. 없으면 신규 등록. */
export type TournamentGameDraft = {
  id: string
  date: string
  opponentName: string
  roundLabel: string | null
  venue: string | null
  weAreAway: boolean
  /** 기록이 시작됐으면 날짜·상대는 여기서 못 바꾼다(기록의 소속 팀이 어긋난다) */
  locked: boolean
}

interface Props {
  leagueId: string
  quarterId: string
  quarterName: string
  /** 대회 기간 — 날짜 기본값과 입력 범위 힌트로 쓴다 */
  startDate: string | null
  endDate: string | null
  /** 이미 붙어 본 상대 이름들 — 오타로 같은 팀이 둘로 갈리는 걸 줄인다 */
  knownOpponents: string[]
  /** 있으면 수정 */
  initial?: TournamentGameDraft
  onClose: () => void
  onSaved: () => void
}

const FIELD: React.CSSProperties = {
  background: 'var(--mm-panel-alt)',
  color: 'var(--mm-ink)',
  border: '1px solid var(--mm-rule)',
  borderRadius: 4,
}

function todayYmd(): string {
  // KST 기준 오늘 — 서버·DB 가 전부 KST 날짜로 경기를 다룬다.
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export default function TournamentGameFormModal({
  leagueId, quarterId, quarterName, startDate, endDate, knownOpponents, initial, onClose, onSaved,
}: Props) {
  const { leagueHeaders } = useLeagueEditMode()
  const isEdit = !!initial
  const locked = initial?.locked === true

  const [date, setDate] = useState(initial?.date ?? startDate ?? todayYmd())
  const [opponent, setOpponent] = useState(initial?.opponentName ?? '')
  const [roundLabel, setRoundLabel] = useState(initial?.roundLabel ?? '')
  const [venue, setVenue] = useState(initial?.venue ?? '')
  const [weAreAway, setWeAreAway] = useState(initial?.weAreAway ?? false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose, saving])

  async function save() {
    if (saving) return
    const opp = opponent.trim()
    if (!opp) { toast.error('상대팀 이름을 입력하세요'); return }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast.error('경기 날짜를 지정하세요'); return }

    setSaving(true)
    try {
      // 기록이 시작된 경기는 날짜·상대·좌우를 아예 보내지 않는다 — 서버가 409 로 막지만,
      //   안 바꿀 값을 보내 놓고 거절당하면 "라운드만 고치려던" 수정까지 통째로 실패한다.
      const teamFields = locked ? {} : {
        date,
        opponent_name: opp,
        we_are_away: weAreAway,
      }
      const res = await fetch(
        isEdit ? `/api/leagues/${leagueId}/games?gameId=${initial!.id}` : `/api/leagues/${leagueId}/games`,
        {
          method: isEdit ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json', ...leagueHeaders },
          body: JSON.stringify(isEdit
            ? { mode: 'tournament', ...teamFields, round_label: roundLabel || null, venue: venue.trim() || null }
            : {
                mode: 'tournament',
                quarter_id: quarterId,
                date,
                opponent_name: opp,
                round_label: roundLabel || null,
                venue: venue.trim() || null,
                we_are_away: weAreAway,
              }),
        },
      )
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j?.error ?? `${isEdit ? '수정' : '등록'} 실패 (${res.status})`)
      }
      toast.success(isEdit ? '경기를 수정했습니다' : `vs ${opp} 경기를 등록했습니다`, {
        description: isEdit ? undefined : '기록 화면에서 쿼터별 영상을 연결하면 기록을 시작할 수 있습니다',
      })
      onSaved()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : `${isEdit ? '수정' : '등록'} 실패`)
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
      aria-label={`${quarterName} 경기 ${isEdit ? '수정' : '등록'}`}
    >
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
            <CalendarPlus size={16} className="shrink-0" style={{ color: 'var(--mm-black)' }} aria-hidden />
            <span className="text-sm font-black truncate" style={{ color: 'var(--mm-black)' }}>
              {quarterName} · 경기 {isEdit ? '수정' : '등록'}
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
          {locked && (
            <p
              className="text-xs leading-relaxed px-3 py-2"
              style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 4, color: 'var(--mm-ink-soft)' }}
            >
              기록이 시작된 경기입니다. <strong>라운드와 장소만</strong> 수정됩니다 —
              날짜·상대팀을 바꾸면 이미 기록된 이벤트의 소속 팀이 어긋나 박스스코어에서 선수들이 사라집니다.
              팀을 바로잡아야 하면 기록 화면의 <strong>팀 교체</strong>를 쓰세요.
            </p>
          )}
          <div>
            <label htmlFor="tg-date" className="block text-xs font-bold mb-1.5" style={{ color: 'var(--mm-ink-soft)' }}>
              경기 날짜 <span style={{ color: 'var(--mm-yellow-strong)' }}>*</span>
            </label>
            <input
              id="tg-date" type="date" value={date} disabled={locked}
              min={startDate ?? undefined} max={endDate ?? undefined}
              onChange={e => setDate(e.target.value)}
              className="w-full min-h-[44px] px-3 text-sm outline-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
              style={FIELD}
            />
          </div>

          <div>
            <label htmlFor="tg-opp" className="block text-xs font-bold mb-1.5" style={{ color: 'var(--mm-ink-soft)' }}>
              상대팀 <span style={{ color: 'var(--mm-yellow-strong)' }}>*</span>
            </label>
            <input
              id="tg-opp" type="text" value={opponent} maxLength={40} disabled={locked}
              list={knownOpponents.length > 0 ? 'tg-known-opponents' : undefined}
              onChange={e => setOpponent(e.target.value)}
              placeholder="상대 동호회 이름"
              className="w-full min-h-[44px] px-3 text-sm outline-none disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
              style={FIELD}
            />
            {knownOpponents.length > 0 && (
              <datalist id="tg-known-opponents">
                {knownOpponents.map(o => <option key={o} value={o} />)}
              </datalist>
            )}
            <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
              같은 이름으로 등록하면 그 상대와의 전적이 한 팀으로 모입니다.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="tg-round" className="block text-xs font-bold mb-1.5" style={{ color: 'var(--mm-ink-soft)' }}>
                라운드
              </label>
              <select
                id="tg-round" value={roundLabel} onChange={e => setRoundLabel(e.target.value)}
                className="w-full min-h-[44px] px-3 text-sm cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
                style={FIELD}
              >
                <option value="">선택 안 함</option>
                {ROUND_LABELS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="tg-venue" className="block text-xs font-bold mb-1.5" style={{ color: 'var(--mm-ink-soft)' }}>
                경기장
              </label>
              <input
                id="tg-venue" type="text" value={venue} maxLength={60}
                onChange={e => setVenue(e.target.value)}
                placeholder="체육관 이름"
                className="w-full min-h-[44px] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
                style={FIELD}
              />
            </div>
          </div>

          <label
            className={`flex items-center gap-3 min-h-[44px] px-3 ${locked ? '' : 'cursor-pointer'}`}
            style={{ ...FIELD, background: 'var(--mm-panel-alt)', opacity: locked ? 0.5 : 1 }}
          >
            <input
              type="checkbox" checked={weAreAway} disabled={locked}
              onChange={e => setWeAreAway(e.target.checked)}
              className="w-5 h-5 shrink-0 cursor-pointer disabled:cursor-not-allowed"
              style={{ accentColor: 'var(--mm-yellow-strong)' }}
            />
            <span className="text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>
              우리 팀이 원정(오른쪽)
            </span>
          </label>
          <p className="text-[11px] leading-relaxed -mt-2" style={{ color: 'var(--mm-muted)' }}>
            박스스코어·쿼터 표가 이 기준으로 좌우를 그립니다. 기록을 시작하기 전에는 나중에 바꿀 수 있습니다.
          </p>
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
            {isEdit ? '저장' : '경기 등록'}
          </button>
        </div>
      </div>
    </div>
  )
}
