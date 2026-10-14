'use client'
// 통산 누적 보드 — 「역대 N위」 (2026-10-14)
// 참고: kbl-stats 의 역대 통산 순위(Career Leaders) 화면 · 순위 규칙은 lib/stats/careerRanks.ts(withRanks).
//
// 재료: 스탯 API 를 분기 없이 부른 결과 = 그 리그의 모든 정규 경기(친선전 제외). 새 집계 없음.
// 부문 칩 한 줄 + 상위 5명 목록 — 360px 에서 7부문을 다 펼치면 화면이 끝없이 길어져 하나씩 고른다.
// 출전 자격은 따지지 않는다: 통산 누적은 「얼마나 쌓았나」라 오래 뛴 사람이 위에 오는 게 맞다.
import { useMemo, useState } from 'react'
import { Landmark } from 'lucide-react'
import SectionCard from '@/components/league/ui/SectionCard'
import Chip from '@/components/league/ui/Chip'
import Avatar from '@/components/league/ui/Avatar'
import { CAREER_STATS, careerTop, careerRankLabel, type CareerStatKey } from '@/lib/stats/careerRanks'
import type { PlayerStat } from '@/types/league'

interface Props {
  /** 전체 기간 스탯(분기 없이 받은 것) */
  players: PlayerStat[]
  loading: boolean
  onPlayerClick?: (id: string, name: string) => void
}

export default function CareerLeadersBoard({ players, loading, onPlayerClick }: Props) {
  const [key, setKey] = useState<CareerStatKey>('pts')
  const def = CAREER_STATS.find(s => s.key === key) ?? CAREER_STATS[0]
  const rows = useMemo(() => careerTop(players, p => Number(p[key]) || 0), [players, key])

  return (
    <SectionCard variant="standalone" ariaLabel="통산 누적 — 역대 순위" pad="none">
      <div className="flex items-center gap-2 px-4 py-3 lg:px-6 lg:py-4" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
        <Landmark size={18} style={{ color: 'var(--mm-ink-soft)' }} aria-hidden />
        <h3 className="font-black text-lg lg:text-xl" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>통산 누적</h3>
        <span className="ml-auto text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>전체 기간 · 친선전 제외</span>
      </div>

      <div className="px-4 pt-3 lg:px-6 -mx-0 overflow-x-auto" role="group" aria-label="통산 부문">
        <div className="flex gap-1.5 whitespace-nowrap pb-1">
          {CAREER_STATS.map(s => (
            <Chip key={s.key} as="button" size="sm" selected={s.key === key} onClick={() => setKey(s.key)}>{s.label}</Chip>
          ))}
        </div>
      </div>

      <div className="px-4 py-3 lg:px-6 lg:py-4">
        {loading ? (
          <div className="space-y-2" aria-hidden>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="h-11 rounded-md animate-pulse" style={{ background: 'var(--mm-panel-alt)' }} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--mm-muted)' }}>아직 기록이 없어요</p>
        ) : (
          <ol className="space-y-1.5" aria-label={`통산 ${def.label} 순위`}>
            {rows.map(r => (
              <li key={r.player_id}>
                <button
                  type="button"
                  onClick={() => onPlayerClick?.(r.player_id, r.name)}
                  className="w-full flex items-center gap-2.5 px-2.5 min-h-11 py-1.5 text-left cursor-pointer transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                  style={{
                    background: r.rank === 1 ? 'var(--mm-yellow-soft)' : 'var(--mm-panel-alt)',
                    border: '1px solid var(--mm-rule)',
                    borderRadius: 'var(--mm-radius-ctl)',
                  }}
                  aria-label={`${careerRankLabel(r.rank)} ${r.name} 통산 ${def.label} ${r.value}${def.unit}`}
                >
                  <span className="t-num text-xs font-black shrink-0 w-12 whitespace-nowrap" style={{ color: r.rank === 1 ? 'var(--mm-yellow-strong)' : 'var(--mm-ink-soft)' }}>
                    {careerRankLabel(r.rank)}
                  </span>
                  <Avatar src={r.photo_url} name={r.name} size={24} decorative />
                  <span className="flex-1 min-w-0 truncate font-bold text-sm" style={{ color: 'var(--mm-ink)' }}>{r.name}</span>
                  <span className="t-num font-black shrink-0" style={{ color: 'var(--mm-ink)', fontSize: '16px' }}>
                    {r.value.toLocaleString('ko-KR')}
                    <span className="ml-0.5 text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>{def.unit}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
    </SectionCard>
  )
}
