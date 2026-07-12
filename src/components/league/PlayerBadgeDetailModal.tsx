'use client'
// 배지 상세 모달 — 특정 배지 타입의 획득 게임 목록 (날짜/상대팀/meta 요약).
// LeaderBadgePanel 의 팝업 스타일 준수 (mm-* 팔레트, focus ring, ESC 닫기).

import { useEffect, useState } from 'react'
import { X, Target, Layers, Trophy, Zap } from 'lucide-react'
import { BasketballLoader } from './BasketballIcons'

type BadgeType = 'perfect_game' | 'double_double' | 'triple_double' | 'winning_shot'

interface BadgeRow {
  badge_type: BadgeType
  game_id: string
  earned_at_date: string
  meta: Record<string, unknown> | null
  opponent_name?: string
  score?: string
  result?: 'W' | 'L' | 'D'
}

interface Props {
  leagueId: string
  playerId: string
  badgeKey: BadgeType
  categoryLabel: string
  onClose: () => void
}

const ICON_MAP: Record<BadgeType, typeof Trophy> = {
  perfect_game:  Target,
  double_double: Layers,
  triple_double: Trophy,
  winning_shot:  Zap,
}

function formatKoreanDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}.${mm}.${dd} (${days[d.getDay()]})`
}

function metaLine(row: BadgeRow): string {
  const m = row.meta ?? {}
  const num = (k: string) => typeof (m as Record<string, unknown>)[k] === 'number' ? (m as Record<string, number>)[k] : undefined
  switch (row.badge_type) {
    case 'perfect_game': {
      const fgm = num('fgm'); const fga = num('fga'); const pts = num('pts')
      if (fgm !== undefined && fga !== undefined) return `${fgm}/${fga} 야투 성공 · ${pts ?? 0}점`
      return ''
    }
    case 'double_double':
    case 'triple_double': {
      const parts: string[] = []
      const pts = num('pts'); const reb = num('reb'); const ast = num('ast')
      const stl = num('stl'); const blk = num('blk')
      if (pts !== undefined) parts.push(`${pts}점`)
      if (reb !== undefined) parts.push(`${reb}리바`)
      if (ast !== undefined) parts.push(`${ast}어시`)
      if (stl !== undefined && stl >= 10) parts.push(`${stl}스틸`)
      if (blk !== undefined && blk >= 10) parts.push(`${blk}블락`)
      return parts.join(' · ')
    }
    case 'winning_shot': {
      const bh = num('before_score_home'); const ba = num('before_score_away')
      const ah = num('after_score_home');  const aa = num('after_score_away')
      const ps = num('points_scored')
      if (bh !== undefined && ba !== undefined && ah !== undefined && aa !== undefined) {
        return `역전 · ${bh}:${ba} → ${ah}:${aa}${ps !== undefined ? ` (+${ps})` : ''}`
      }
      return ''
    }
    default: return ''
  }
}

export default function PlayerBadgeDetailModal({ leagueId, playerId, badgeKey, categoryLabel, onClose }: Props) {
  const [rows, setRows] = useState<BadgeRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const Icon = ICON_MAP[badgeKey]

  // ESC 닫기
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // 데이터 로드 — 서버가 이미 desc 정렬, 클라이언트에서 배지 타입 필터링
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/leagues/${leagueId}/players/${playerId}/badges`)
      .then(r => r.ok ? r.json() : { badges: [] })
      .then(d => {
        if (cancelled) return
        const all: BadgeRow[] = d.badges ?? []
        setRows(all.filter(b => b.badge_type === badgeKey))
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [leagueId, playerId, badgeKey])

  const isGold = badgeKey === 'triple_double'
  const headerBg = isGold ? 'bg-[color:var(--mm-yellow)]' : 'bg-[color:var(--mm-yellow-soft)]'
  const headerFg = isGold ? 'text-[color:var(--mm-black)]' : 'text-[color:var(--mm-yellow-strong)]'

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="badge-detail-title"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md max-h-[80vh] bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] rounded-sm shadow-[0_20px_60px_-12px_rgba(0,0,0,0.35)] overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        <div className={`flex items-center justify-between px-5 py-3.5 border-b border-[color:var(--mm-rule)] ${headerBg}`}>
          <div className="flex items-center gap-2">
            <Icon size={18} className={headerFg} aria-hidden />
            <p id="badge-detail-title" className={`text-sm font-black uppercase tracking-widest ${headerFg}`}>
              {categoryLabel} · {rows?.length ?? 0}회
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)] p-1 rounded hover:bg-[color:var(--mm-panel-alt)] cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
          >
            <X size={16} />
          </button>
        </div>
        <div className="overflow-y-auto p-3">
          {loading ? (
            <div className="py-8 flex justify-center"><BasketballLoader size={22} /></div>
          ) : !rows || rows.length === 0 ? (
            <div className="py-8 text-center text-xs text-[color:var(--mm-muted)]">획득 이력이 없습니다</div>
          ) : (
            <div className="space-y-1.5">
              {rows.map((row, i) => {
                const detail = metaLine(row)
                const resultChip = row.result
                  ? row.result === 'W'
                    ? 'text-[color:var(--mm-yellow-strong)]'
                    : row.result === 'L'
                      ? 'text-[color:var(--mm-muted)]'
                      : 'text-[color:var(--mm-muted)]'
                  : 'text-[color:var(--mm-muted)]'
                return (
                  <div
                    key={`${row.game_id}-${i}`}
                    className="w-full px-4 py-3 rounded-sm border bg-[color:var(--mm-panel-alt)] border-[color:var(--mm-rule)]"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-sm font-bold text-[color:var(--mm-ink)]">{formatKoreanDate(row.earned_at_date)}</span>
                      <span className={`text-xs font-bold uppercase tracking-widest ${resultChip}`}>
                        {row.result ? `${row.result} ` : ''}{row.opponent_name ? `vs ${row.opponent_name}` : ''}{row.score ? ` (${row.score})` : ''}
                      </span>
                    </div>
                    {detail && (
                      <p className="text-xs text-[color:var(--mm-muted)] mt-1 font-mono">{detail}</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
