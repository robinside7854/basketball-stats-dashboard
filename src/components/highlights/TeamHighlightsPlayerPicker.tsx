'use client'
// TeamHighlightsPlayerPicker — 팀 대시보드 하이라이트 랜딩에서 선수 선택 → 선수별 페이지 이동
// HighlightsPlayerPicker(리그)와 동일 UI · 데이터 소스만 /api/players (팀 스코프)
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { User, ArrowRight } from 'lucide-react'

interface Props {
  org: string
  team: string
}

type PlayerLite = { id: string; name: string; number: number | null; is_active?: boolean }

export default function TeamHighlightsPlayerPicker({ org, team }: Props) {
  const router = useRouter()
  const [players, setPlayers] = useState<PlayerLite[]>([])
  const [selected, setSelected] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/players?team=${team}&org=${org}`)
      .then(r => r.ok ? r.json() : [])
      .then((d: PlayerLite[]) => {
        if (cancelled) return
        setPlayers(
          (Array.isArray(d) ? d : [])
            .filter(p => p.is_active !== false)
            .map(p => ({ id: p.id, name: p.name, number: p.number ?? null }))
            .sort((a, b) => {
              const na = a.number ?? 999
              const nb = b.number ?? 999
              if (na !== nb) return na - nb
              return a.name.localeCompare(b.name, 'ko')
            }),
        )
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [org, team])

  const go = useMemo(() => (id: string) => {
    if (!id) return
    router.push(`/${org}/${team}/highlights/player/${id}`)
  }, [org, team, router])

  return (
    <div
      className="p-3 lg:p-4 flex items-center gap-2 flex-wrap"
      style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
      aria-label="선수별 하이라이트 보기"
    >
      <div className="flex items-center gap-2 shrink-0">
        <User size={16} style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden />
        <span
          className="font-bold text-sm"
          style={{ color: 'var(--mm-ink)' }}
        >
          선수별 보기
        </span>
      </div>

      <select
        value={selected}
        onChange={e => setSelected(e.target.value)}
        disabled={loading || players.length === 0}
        className="flex-1 min-w-[180px] px-3 py-2 min-h-[44px] text-sm cursor-pointer"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
          color: 'var(--mm-ink)',
          borderRadius: '4px',
        }}
        aria-label="선수 선택"
      >
        <option value="">
          {loading ? '선수 목록 로딩...' : players.length === 0 ? '선수 없음' : '선수를 선택하세요'}
        </option>
        {players.map(p => (
          <option key={p.id} value={p.id}>
            {p.number != null ? `#${p.number} ` : ''}{p.name}
          </option>
        ))}
      </select>

      <button
        type="button"
        onClick={() => go(selected)}
        disabled={!selected}
        className="inline-flex items-center gap-1.5 min-h-[44px] px-3 text-xs font-bold uppercase tracking-[0.10em] cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          background: 'var(--mm-yellow)',
          color: 'var(--mm-black)',
          border: '1px solid var(--mm-yellow)',
          borderRadius: '4px',
        }}
        aria-label="선택한 선수의 하이라이트 보기"
      >
        보기 <ArrowRight size={14} />
      </button>
    </div>
  )
}
