'use client'
// 시즌 커리어하이 — 카테고리별 라운드 최고 기록 1인 (분기 필터 지원)
// 라운드(R)=일자 단위. 6개 카테고리 (PTS/REB/AST/STL/BLK/FG3M)
// mm-* 팔레트 · font-jersey / Pretendard · 44px 터치 타겟 · 반응형 (2 x 3 → 3 x 2)

import { useEffect, useState } from 'react'
import { Trophy, Shield, Sparkles, Zap, Target, Crown } from 'lucide-react'
import PlayerQuickViewModal from '@/components/league/PlayerQuickViewModal'
import { BasketballLoader } from '@/components/league/BasketballIcons'

type CategoryKey = 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK' | 'FG3M'

interface CategoryHigh {
  category: CategoryKey
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

interface Props {
  leagueId: string
  /** 특정 분기 필터 — 'all' 또는 null 이면 시즌 전체 */
  quarterId: string | null
}

// 카테고리별 accent — POTW 스타일 참고. 어워드 페이지 CATEGORY_ACCENT 와 겹치지 않는 순색.
const CATEGORY_STYLE: Record<CategoryKey, { Icon: typeof Trophy; accent: string; unit: string }> = {
  PTS:  { Icon: Trophy,    accent: '#EAB308', unit: 'PTS'  }, // yellow (mm-yellow)
  REB:  { Icon: Shield,    accent: '#F97316', unit: 'REB'  }, // orange
  AST:  { Icon: Sparkles,  accent: '#06B6D4', unit: 'AST'  }, // cyan
  STL:  { Icon: Zap,       accent: '#10B981', unit: 'STL'  }, // emerald
  BLK:  { Icon: Shield,    accent: '#A855F7', unit: 'BLK'  }, // purple
  FG3M: { Icon: Target,    accent: '#EC4899', unit: '3PM'  }, // pink
}

// 표시 순서 (고정)
const ORDER: CategoryKey[] = ['PTS', 'REB', 'AST', 'STL', 'BLK', 'FG3M']

function initials(name: string): string {
  return name.slice(0, 2)
}

export default function NbaSeasonHighs({ leagueId, quarterId }: Props) {
  const [highs, setHighs] = useState<CategoryHigh[]>([])
  const [loading, setLoading] = useState(true)
  const [quickPlayer, setQuickPlayer] = useState<{ id: string; name: string } | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const qs = quarterId && quarterId !== 'all' ? `?quarterId=${quarterId}` : ''
    fetch(`/api/leagues/${leagueId}/season-highs${qs}`)
      .then(r => r.ok ? r.json() : { categoryHighs: [] })
      .then(d => { if (!cancelled) { setHighs(d.categoryHighs ?? []); setLoading(false) } })
      .catch(() => { if (!cancelled) { setHighs([]); setLoading(false) } })
    return () => { cancelled = true }
  }, [leagueId, quarterId])

  // 순서대로 정렬
  const ordered = ORDER
    .map(cat => highs.find(h => h.category === cat))
    .filter((h): h is CategoryHigh => Boolean(h))

  if (loading) {
    return (
      <div className="flex justify-center py-12" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}>
        <BasketballLoader size={28} />
      </div>
    )
  }

  if (ordered.length === 0) {
    return (
      <div
        className="text-center py-16 px-4"
        style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)' }}
      >
        <Crown size={32} className="mx-auto mb-3" style={{ color: 'var(--mm-muted)' }} aria-hidden />
        <p className="font-jersey font-black uppercase" style={{ color: 'var(--mm-ink)', fontSize: '15px', letterSpacing: '0.05em' }}>
          기록이 없습니다
        </p>
        <p className="text-xs mt-1">경기 데이터가 쌓이면 카테고리별 최고 기록이 표시됩니다</p>
      </div>
    )
  }

  return (
    <>
      <div style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}>
        {/* 헤더 */}
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
          <div className="flex items-center gap-2">
            <Crown size={16} style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden />
            <span className="font-jersey font-black uppercase" style={{ color: 'var(--mm-ink)', fontSize: '15px', letterSpacing: '0.02em' }}>
              시즌 커리어하이
            </span>
            <span className="text-xs font-bold uppercase ml-2" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>
              R(라운드) 기준 · 카테고리별 최고 기록
            </span>
          </div>
        </div>

        {/* 카드 그리드 — 2 x 3 (모바일) → 3 x 2 (데스크탑) */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3 md:p-4">
          {ordered.map(h => {
            const style = CATEGORY_STYLE[h.category]
            const Icon = style.Icon
            return (
              <button
                key={h.category}
                type="button"
                onClick={() => setQuickPlayer({ id: h.player.player_id, name: h.player.name })}
                className="text-left transition-shadow duration-200 hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] cursor-pointer btn-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1 min-h-[132px]"
                style={{
                  background: 'var(--mm-panel)',
                  border: '1px solid var(--mm-rule)',
                }}
                aria-label={`${style.unit} 시즌 커리어하이: ${h.player.name} ${h.value}${style.unit}, ${h.date}`}
              >
                {/* 상단 accent 스트라이프 */}
                <div style={{ height: '3px', background: style.accent }} aria-hidden />

                <div className="p-3 md:p-4">
                  {/* 카테고리 라벨 + 아이콘 */}
                  <div className="flex items-center gap-1.5 mb-2">
                    <div
                      className="w-6 h-6 md:w-7 md:h-7 flex items-center justify-center shrink-0"
                      style={{ background: 'var(--mm-panel-alt)', border: `1.5px solid ${style.accent}` }}
                    >
                      <Icon size={13} style={{ color: style.accent }} aria-hidden />
                    </div>
                    <p
                      className="text-[11px] font-black uppercase"
                      style={{ color: style.accent, letterSpacing: '0.16em' }}
                    >
                      {h.label}
                    </p>
                  </div>

                  {/* 큰 숫자 + 단위 */}
                  <div className="flex items-baseline gap-1.5 mb-3">
                    <span
                      className="font-jersey font-black tabular-nums leading-none"
                      style={{ color: 'var(--mm-ink)', fontSize: 'clamp(32px, 8vw, 42px)', letterSpacing: '-0.015em' }}
                    >
                      {h.value}
                    </span>
                    <span
                      className="font-jersey font-black uppercase"
                      style={{ color: 'var(--mm-muted)', fontSize: '12px', letterSpacing: '0.16em' }}
                    >
                      {style.unit}
                    </span>
                  </div>

                  {/* 선수 정보: 사진 + 이름/번호 */}
                  <div className="flex items-center gap-2 mb-2">
                    {h.player.photo_url ? (
                      <div
                        className="shrink-0 overflow-hidden"
                        style={{
                          width: '36px',
                          aspectRatio: '3 / 4',
                          border: '1.5px solid var(--mm-black)',
                          background: 'var(--mm-black)',
                          borderRadius: '2px',
                        }}
                      >
                        <img
                          src={h.player.photo_url}
                          alt=""
                          className="w-full h-full object-cover object-top"
                          loading="lazy"
                        />
                      </div>
                    ) : (
                      <div
                        className="shrink-0 flex items-center justify-center"
                        style={{
                          width: '36px',
                          aspectRatio: '3 / 4',
                          background: 'var(--mm-panel-alt)',
                          border: '1.5px solid var(--mm-rule)',
                          borderRadius: '2px',
                        }}
                      >
                        <span className="font-jersey font-black text-xs" style={{ color: 'var(--mm-ink-soft)' }}>
                          {initials(h.player.name)}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className="font-jersey font-black uppercase break-keep"
                        style={{
                          color: 'var(--mm-ink)',
                          fontSize: '14px',
                          letterSpacing: '-0.005em',
                          lineHeight: 1.2,
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {h.player.name}
                      </p>
                      {h.player.number != null && (
                        <p className="text-[11px] font-mono tabular-nums" style={{ color: 'var(--mm-muted)' }}>
                          #{h.player.number}
                          {h.player.position ? <span className="ml-1.5">{h.player.position}</span> : null}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 날짜 배지 (mm-yellow) */}
                  <div className="flex">
                    <span
                      className="inline-flex items-center px-2 py-0.5 text-[11px] font-black tabular-nums"
                      style={{
                        background: 'var(--mm-yellow-soft)',
                        color: 'var(--mm-ink)',
                        border: '1px solid var(--mm-yellow)',
                        letterSpacing: '0.08em',
                      }}
                    >
                      {h.date}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {quickPlayer && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={quickPlayer.id}
          playerName={quickPlayer.name}
          onClose={() => setQuickPlayer(null)}
        />
      )}
    </>
  )
}
