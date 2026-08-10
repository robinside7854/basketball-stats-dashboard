'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { ChevronDown, ChevronRight, SearchCheck, CircleCheck, Loader2 } from 'lucide-react'
import { useGameStore } from '@/store/gameStore'
import { auditGameEvents, AUDIT_KIND_LABEL, type AuditEvent, type AuditFinding } from '@/lib/stats/recordAudit'

interface Props {
  leagueId: string
  gameId: string
  /** 이름 표시용 — 이 경기와 무관한 선수가 섞여 있어도 무해하다(맵 조회일 뿐) */
  players: { id: string; name: string }[]
  /** 이벤트가 저장될 때마다 올라가는 카운터. 값이 바뀌면 다시 점검한다 */
  refreshKey: number
}

const KIND_COLOR: Record<string, string> = {
  missing_rebound: '#f59e0b',
  missing_tov_pair: '#a855f7',
  gap: '#ef4444',
  duplicate: '#38bdf8',
}

export default function RecordAuditPanel({ leagueId, gameId, players, refreshKey }: Props) {
  const { seekTo } = useGameStore()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [findings, setFindings] = useState<AuditFinding[]>([])
  const [error, setError] = useState<string | null>(null)

  // 이름 맵은 표시용일 뿐인데 배열을 의존성에 넣으면 부모가 매 렌더 새 배열을 만들 때마다
  // 점검이 다시 돌아 무한 루프가 된다 — ref 로 최신값만 참조한다.
  const playersRef = useRef(players)
  playersRef.current = players

  const run = useCallback(async () => {
    if (!gameId) return
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/leagues/${leagueId}/events?gameId=${gameId}`)
      if (!r.ok) throw new Error(`이벤트 조회 실패 (${r.status})`)
      const rows = await r.json() as AuditEvent[]
      if (!Array.isArray(rows)) throw new Error('이벤트 응답 형식이 예상과 다릅니다')
      setFindings(auditGameEvents(rows, new Map(playersRef.current.map(p => [p.id, p.name]))))
    } catch (e) {
      // 조용히 빈 목록으로 넘어가면 "점검 결과 깨끗함"으로 오해된다 — 실패를 드러낸다
      setError(e instanceof Error ? e.message : '점검 실패')
      setFindings([])
    } finally {
      setLoading(false)
    }
  }, [leagueId, gameId])

  // 이벤트를 칠 때마다 즉시 재조회하면 입력 흐름을 방해하므로 1.5초 쉬었다가 돈다
  useEffect(() => {
    const t = setTimeout(run, 1500)
    return () => clearTimeout(t)
  }, [run, refreshKey])

  const count = findings.length

  return (
    <div style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}>
      <button
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        aria-label={`기록 점검 ${count}건 ${open ? '접기' : '펼치기'}`}
        className="w-full min-h-11 px-3 flex items-center gap-2 cursor-pointer transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded-[4px]"
      >
        {open
          ? <ChevronDown size={14} strokeWidth={2} aria-hidden style={{ color: 'var(--mm-muted)' }} />
          : <ChevronRight size={14} strokeWidth={2} aria-hidden style={{ color: 'var(--mm-muted)' }} />}
        <SearchCheck size={13} strokeWidth={2} aria-hidden style={{ color: 'var(--mm-muted)' }} />
        <span className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>
          기록 점검
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {loading && <Loader2 size={12} className="animate-spin" aria-hidden style={{ color: 'var(--mm-muted)' }} />}
          {error ? (
            <span className="text-xs font-bold" style={{ color: '#ef4444' }}>실패</span>
          ) : count === 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-bold" style={{ color: '#22c55e' }}>
              <CircleCheck size={12} strokeWidth={2} aria-hidden />확인할 지점 없음
            </span>
          ) : (
            <span
              className="px-2 py-0.5 text-xs font-black rounded-full"
              style={{ background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b55' }}
            >
              확인 {count}곳
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-1.5">
          {error && (
            <p className="text-xs" style={{ color: '#ef4444' }}>{error}</p>
          )}
          {!error && count === 0 && (
            <p className="text-xs" style={{ color: 'var(--mm-muted)' }}>
              누락으로 의심되는 지점이 없습니다.
            </p>
          )}
          {findings.map((f, i) => (
            <button
              key={`${f.kind}-${f.eventId ?? i}-${Math.round(f.timestamp)}`}
              onClick={() => seekTo(f.timestamp)}
              aria-label={`${f.label} — 영상 해당 지점으로 이동`}
              className="w-full min-h-11 px-2.5 py-2 flex items-center gap-2 text-left cursor-pointer transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
            >
              <span
                className="shrink-0 px-1.5 py-0.5 text-[10px] font-black rounded"
                style={{ background: `${KIND_COLOR[f.kind]}22`, color: KIND_COLOR[f.kind] }}
              >
                {AUDIT_KIND_LABEL[f.kind]}
              </span>
              <span className="text-xs leading-snug break-keep" style={{ color: 'var(--mm-ink)' }}>
                {f.label}
              </span>
            </button>
          ))}
          {count > 0 && (
            <p className="text-[11px] leading-relaxed pt-1" style={{ color: 'var(--mm-muted)' }}>
              누르면 영상의 해당 지점으로 이동합니다. 아웃바운드로 나간 공이나 촬영이 끊긴
              구간은 정상이므로, 실제로 빠진 것만 채워 넣으면 됩니다.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
