'use client'
// 기록실 — 시즌 최고 기록 8칸 보드 (2026-08-09, 옛 SeasonHighLine 한 줄 표시를 대체)
//
// 사용자 승인 시안: "안 A(기록실 보드) + FGA 포함 8칸이 가장 안정적입니다."
// 리더보드 표 위에 항상 뜨는 8칸 격자. GET /api/leagues/[leagueId]/season-highs 의
// categoryHighs(최대 8개)를 그대로 쓴다 — 새 API·새 쿼리 없음.
//
// ⚠ 8칸 고정 — 기록이 없는 카테고리가 있어도 칸을 지우지 않는다(빈 칸으로 렌더).
//   격자가 7칸·6칸으로 줄어드는 것 자체가 이 컴포넌트의 존재 이유를 깨는 버그다.
import type { CSSProperties } from 'react'
import Link from 'next/link'
import { Crown } from 'lucide-react'
import SectionCard from '@/components/league/ui/SectionCard'
import CountUp from '@/components/league/ui/CountUp'

export type SeasonHighCategory = 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK' | 'FG3M' | 'FGA' | 'FGM'

export interface SeasonHigh {
  category: SeasonHighCategory
  label: string
  value: number
  player: {
    player_id: string
    name: string
    number: number | null
    position: string | null
    photo_url: string | null
  }
  date: string
}

// 보드 렌더 순서 — API(categoryHighs) 배열 순서(PTS·REB·AST·STL·BLK·FG3M·FGA·FGM)와 무관하게
// 이 순서를 고정으로 쓴다. 사용자 지시: "PTS·REB·AST·STL·BLK·FG3M·FGM·FGA (순서 이대로)"
const BOARD_ORDER: { category: SeasonHighCategory; short: string }[] = [
  { category: 'PTS',  short: 'PTS' },
  { category: 'REB',  short: 'REB' },
  { category: 'AST',  short: 'AST' },
  { category: 'STL',  short: 'STL' },
  { category: 'BLK',  short: 'BLK' },
  { category: 'FG3M', short: '3PM' },
  { category: 'FGM',  short: 'FGM' },
  { category: 'FGA',  short: 'FGA' },
]

// 셀 안 표기용 짧은 날짜 (M/D) — 공간이 좁아 연도는 생략
function formatDateShort(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return `${d.getMonth() + 1}/${d.getDate()}`
}

// aria-label 용 풀 날짜 (M월 D일)
function formatDateFull(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  return `${d.getMonth() + 1}월 ${d.getDate()}일`
}

interface Props {
  categoryHighs: SeasonHigh[]
  // 현재 리더보드 정렬 지표가 매핑되는 카테고리 — 해당 칸을 강조한다. null 이면 강조 없음
  // (shooting/advanced 모드이거나 매핑 없는 지표일 때)
  highlightCategory: SeasonHighCategory | null
  orgSlug: string
  leagueId: string
  loading: boolean
}

function SkeletonCell() {
  return (
    <div
      className="min-h-[92px] rounded-md flex flex-col items-center justify-center gap-2 animate-pulse"
      style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
      aria-hidden
    >
      <div className="w-8 h-2 rounded-sm" style={{ background: 'var(--mm-rule)' }} />
      <div className="w-10 h-5 rounded-sm" style={{ background: 'var(--mm-rule)' }} />
      <div className="w-12 h-2 rounded-sm" style={{ background: 'var(--mm-rule)' }} />
    </div>
  )
}

// 기록 없는 카테고리 — 링크 없는 빈 칸. 격자 칸 수를 지키기 위해 반드시 렌더한다.
function EmptyCell({ short }: { short: string }) {
  return (
    <div
      className="min-h-[92px] rounded-md flex flex-col items-center justify-center gap-1 px-1"
      style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
    >
      <span className="text-[10px] font-black uppercase whitespace-nowrap" style={{ color: 'var(--mm-muted)', letterSpacing: '0.12em' }}>
        {short}
      </span>
      <span className="font-jersey font-black" style={{ color: 'var(--mm-muted)', fontSize: '20px' }}>—</span>
      <span className="text-[10px] font-bold whitespace-nowrap" style={{ color: 'var(--mm-muted)' }}>기록 없음</span>
    </div>
  )
}

export default function RecordRoomBoard({ categoryHighs, highlightCategory, orgSlug, leagueId, loading }: Props) {
  const byCategory = new Map(categoryHighs.map(h => [h.category, h]))
  const year = new Date().getFullYear()

  return (
    <SectionCard variant="standalone" ariaLabel="기록실 — 시즌 최고 기록">
      <div className="flex items-center gap-2 px-3 sm:px-4 pt-3 pb-2.5" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
        <Crown size={14} style={{ color: 'var(--mm-ink-soft)' }} aria-hidden />
        <span className="text-[11px] font-black uppercase" style={{ color: 'var(--mm-ink)', letterSpacing: '0.16em' }}>
          기록실
        </span>
        <span className="ml-auto text-[11px] font-bold uppercase" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>
          {year} 시즌 최고
        </span>
      </div>

      {/* 모바일 4열 × 2행 고정, 데스크톱은 8열 1행. 칸 수는 어떤 화면 폭에서도 8개 그대로.
          key 를 loading 으로 두면 스켈레톤 → 실제 기록으로 바뀔 때 다시 마운트돼 mm-fade-in 이 돈다.
          key 없이 클래스만 붙이면 같은 엘리먼트라 애니메이션이 재생되지 않는다.
          자리는 스켈레톤이 이미 잡아 뒀으므로 위치 이동 없이 밝기만 든다. */}
      <div key={loading ? 'sk' : 'data'} className="grid grid-cols-4 md:grid-cols-8 gap-2 p-3 sm:p-4 mm-fade-in">
        {loading
          ? BOARD_ORDER.map(({ category }) => <SkeletonCell key={category} />)
          : BOARD_ORDER.map(({ category, short }, idx) => {
              const high = byCategory.get(category)
              if (!high) return <EmptyCell key={category} short={short} />

              const isHighlight = highlightCategory === category
              const cellStyle: CSSProperties = {
                background: isHighlight ? 'var(--mm-yellow-soft)' : 'var(--mm-panel-alt)',
                border: '1px solid var(--mm-rule)',
                borderTop: `2px solid ${isHighlight ? 'var(--color-hoop-orange-500)' : 'transparent'}`,
              }
              const unit = category === 'PTS' ? '점' : ''

              return (
                <Link
                  key={category}
                  href={`/league/${orgSlug}/${leagueId}/boxscore/${high.date}`}
                  className="min-h-[92px] rounded-md flex flex-col items-center justify-center gap-1 px-1 text-center cursor-pointer transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-1"
                  style={cellStyle}
                  aria-label={`${high.label} 시즌 최고 ${high.value}${unit} ${high.player.name} — ${formatDateFull(high.date)} 경기 박스스코어 보기`}
                >
                  <span
                    className="text-[10px] font-black uppercase whitespace-nowrap"
                    style={{ color: isHighlight ? 'var(--mm-yellow-strong)' : 'var(--mm-muted)', letterSpacing: '0.12em' }}
                  >
                    {short}
                  </span>
                  {/* 카운트업 — 8칸을 동시에 터뜨리면 산만해서 40ms 씩 밀어 왼쪽부터 차례로 오르게 한다.
                      aria-label 에 이미 최종값이 들어 있어(위 Link) 스크린리더는 애니메이션의 영향을 받지 않는다. */}
                  <CountUp
                    value={high.value}
                    delay={idx * 40}
                    className="font-jersey font-black leading-none"
                    style={{ color: isHighlight ? 'var(--mm-yellow-strong)' : 'var(--mm-ink)', fontSize: '22px', letterSpacing: '-0.01em' }}
                  />
                  <span className="text-[11px] font-bold truncate w-full" style={{ color: 'var(--mm-ink-soft)' }}>
                    {high.player.name}
                  </span>
                  <span className="text-[10px] font-bold tabular-nums" style={{ color: 'var(--mm-muted)' }}>
                    {formatDateShort(high.date)}
                  </span>
                </Link>
              )
            })}
      </div>
    </SectionCard>
  )
}
