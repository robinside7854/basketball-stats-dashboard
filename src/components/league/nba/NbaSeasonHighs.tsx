'use client'
// 시즌 커리어하이 — 카테고리별 라운드 최고 기록 1인 (분기 필터 지원)
// 라운드(R)=일자 단위. 8개 카테고리 (PTS/REB/AST/STL/BLK/FG3M/FGA/FGM)
// mm-* 팔레트 · font-jersey / Pretendard · 44px 터치 타겟 · 반응형 (1 x 8 → 2 x 4 → 4 x 2)
// 확대 디자인: 사진 대형·이름 굵게·기록 초대형으로 주목도 극대화.

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Trophy, Shield, Sparkles, Zap, Target, Crown, Flame, CheckCircle2, ClipboardList, Film } from 'lucide-react'
import dynamic from 'next/dynamic'

const PlayerQuickViewModal = dynamic(() => import('@/components/league/PlayerQuickViewModal'), { ssr: false })
import { BasketballLoader } from '@/components/league/BasketballIcons'
import SectionCard from '@/components/league/ui/SectionCard'

type CategoryKey = 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK' | 'FG3M' | 'FGA' | 'FGM'

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
  /** 명시적 orgSlug — 없으면 useParams 로 조회 */
  orgSlug?: string
}

// 카테고리별 accent — POTW/어워드 스타일과 겹치지 않는 순색.
const CATEGORY_STYLE: Record<CategoryKey, { Icon: typeof Trophy; accent: string; unit: string }> = {
  PTS:  { Icon: Trophy,        accent: '#EAB308', unit: 'PTS'  }, // yellow
  REB:  { Icon: Shield,        accent: '#F97316', unit: 'REB'  }, // orange
  AST:  { Icon: Sparkles,      accent: '#06B6D4', unit: 'AST'  }, // cyan
  STL:  { Icon: Zap,           accent: '#10B981', unit: 'STL'  }, // emerald
  BLK:  { Icon: Shield,        accent: '#A855F7', unit: 'BLK'  }, // purple
  FG3M: { Icon: Target,        accent: '#EC4899', unit: '3PM'  }, // pink
  FGA:  { Icon: Flame,         accent: '#DC2626', unit: 'FGA'  }, // red
  FGM:  { Icon: CheckCircle2,  accent: '#059669', unit: 'FGM'  }, // green
}

// 표시 순서 (고정)
const ORDER: CategoryKey[] = ['PTS', 'REB', 'AST', 'STL', 'BLK', 'FG3M', 'FGA', 'FGM']

function initials(name: string): string {
  return name.slice(0, 2)
}

function formatKoreanDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(d.getTime())) return dateStr
  const days = ['일', '월', '화', '수', '목', '금', '토']
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${mm}.${dd} (${days[d.getDay()]})`
}

export default function NbaSeasonHighs({ leagueId, quarterId, orgSlug }: Props) {
  const params = useParams<{ orgSlug?: string; org?: string }>()
  const resolvedOrgSlug = orgSlug ?? params?.orgSlug ?? params?.org ?? ''
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
      <SectionCard variant="standalone" className="flex justify-center py-12">
        <BasketballLoader size={28} />
      </SectionCard>
    )
  }

  if (ordered.length === 0) {
    return (
      <SectionCard variant="standalone" className="text-center py-16 px-4" background="var(--mm-panel)">
        <Crown size={32} className="mx-auto mb-3" style={{ color: 'var(--mm-muted)' }} aria-hidden />
        <p className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: '15px', letterSpacing: '0.05em' }}>
          기록이 없습니다
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--mm-muted)' }}>경기 데이터가 쌓이면 카테고리별 최고 기록이 표시됩니다</p>
      </SectionCard>
    )
  }

  return (
    <>
      <SectionCard variant="standalone">
        {/* 헤더 */}
        <div className="px-4 md:px-5 py-4" style={{ borderBottom: '2px solid var(--mm-rule)' }}>
          <div className="flex items-center gap-2 flex-wrap">
            <Crown size={20} style={{ color: 'var(--mm-ink-soft)' }} aria-hidden />
            <span className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: 'clamp(18px, 4vw, 22px)', letterSpacing: '0.02em' }}>
              시즌 커리어하이
            </span>
            <span className="text-xs md:text-sm font-bold uppercase" style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}>
              R(라운드) 기준 · 카테고리별 최고 기록
            </span>
          </div>
        </div>

        {/* 카드 그리드 — 확대 디자인: 1열(모바일) → 2열(sm) → 4열(lg) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 md:p-5">
          {ordered.map(h => {
            const style = CATEGORY_STYLE[h.category]
            const Icon = style.Icon
            const base = `/league/${resolvedOrgSlug}/${leagueId}`
            return (
              <div
                key={h.category}
                className="flex flex-col transition-shadow duration-200 hover:shadow-[0_16px_48px_-8px_rgba(0,0,0,0.28)]"
                style={{
                  background: 'var(--mm-panel)',
                  border: '1px solid var(--mm-rule)',
                }}
              >
                {/* 상단 컬러 스트라이프 (강조) */}
                <div style={{ height: '5px', background: style.accent }} aria-hidden />

                <button
                  type="button"
                  onClick={() => setQuickPlayer({ id: h.player.player_id, name: h.player.name })}
                  className="text-left cursor-pointer btn-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-2 group p-4 md:p-5 w-full"
                  aria-label={`${style.unit} 시즌 커리어하이: ${h.player.name} ${h.value}${style.unit}, ${h.date} — 선수 상세 보기`}
                >
                  {/* 카테고리 라벨 + 아이콘 */}
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-8 h-8 flex items-center justify-center shrink-0"
                      style={{ background: 'var(--mm-panel-alt)', border: `2px solid ${style.accent}` }}
                    >
                      <Icon size={16} style={{ color: style.accent }} aria-hidden />
                    </div>
                    <p
                      className="text-[12px] md:text-[13px] font-black uppercase"
                      style={{ color: style.accent, letterSpacing: '0.16em' }}
                    >
                      {h.label}
                    </p>
                  </div>

                  {/* 큰 숫자 + 단위 — 초대형 · 카드의 주목 포인트 */}
                  <div className="flex items-baseline gap-2 mb-4">
                    <span
                      className="font-jersey font-black tabular-nums leading-none"
                      style={{
                        color: 'var(--mm-ink)',
                        fontSize: 'clamp(56px, 14vw, 84px)',
                        letterSpacing: '-0.02em',
                      }}
                    >
                      {h.value}
                    </span>
                    <span
                      className="font-bold"
                      style={{ color: 'var(--mm-muted)', fontSize: '14px', letterSpacing: '0.18em' }}
                    >
                      {style.unit}
                    </span>
                  </div>

                  {/* 선수 정보: 대형 사진 + 이름/번호 */}
                  <div className="flex items-center gap-3 mb-3">
                    {h.player.photo_url ? (
                      <div
                        className="shrink-0 overflow-hidden group-hover:brightness-105 transition-all relative"
                        style={{
                          width: 'clamp(72px, 18vw, 96px)',
                          aspectRatio: '3 / 4',
                          border: `2.5px solid var(--mm-black)`,
                          background: 'var(--mm-black)',
                          borderRadius: '3px',
                          boxShadow: '3px 3px 0 rgba(0,0,0,0.30)',
                        }}
                      >
                        {/* next/image · below-fold(스크롤 후) → 기본 lazy · sizes = 컨테이너 실제 폭 */}
                        <Image
                          src={h.player.photo_url}
                          alt=""
                          fill
                          sizes="(max-width: 640px) 18vw, 96px"
                          className="object-cover object-top"
                        />
                      </div>
                    ) : (
                      <div
                        className="shrink-0 flex items-center justify-center"
                        style={{
                          width: 'clamp(72px, 18vw, 96px)',
                          aspectRatio: '3 / 4',
                          background: 'var(--mm-panel-alt)',
                          border: '2px solid var(--mm-rule)',
                          borderRadius: '3px',
                        }}
                      >
                        <span
                          className="font-jersey font-black"
                          style={{ color: 'var(--mm-ink-soft)', fontSize: 'clamp(22px, 5vw, 30px)' }}
                        >
                          {initials(h.player.name)}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p
                        className="font-bold break-keep group-hover:underline underline-offset-4 decoration-[3px]"
                        style={{
                          color: 'var(--mm-ink)',
                          fontSize: 'clamp(19px, 5vw, 24px)',
                          letterSpacing: '-0.005em',
                          lineHeight: 1.15,
                          wordBreak: 'break-word',
                          overflowWrap: 'anywhere',
                          textDecorationColor: 'var(--mm-black)',
                        }}
                      >
                        {h.player.name}
                      </p>
                      {h.player.number != null && (
                        <p className="text-[13px] font-mono tabular-nums mt-0.5" style={{ color: 'var(--mm-muted)' }}>
                          #{h.player.number}
                          {h.player.position ? <span className="ml-2">{h.player.position}</span> : null}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 날짜 배지 (mm-yellow) */}
                  <div className="flex">
                    <span
                      className="inline-flex items-center px-2.5 py-1 text-xs font-black tabular-nums"
                      style={{
                        background: 'var(--mm-yellow-soft)',
                        color: 'var(--mm-ink)',
                        border: '1px solid var(--mm-rule)',
                        letterSpacing: '0.08em',
                      }}
                    >
                      {formatKoreanDate(h.date)}
                    </span>
                  </div>
                </button>

                {/* 하단 액션 버튼 2개 · 박스스코어 · 하이라이트 (해당 경기 데이터가 있을 때만) */}
                {h.date && resolvedOrgSlug && (
                  <div
                    className="mt-auto grid grid-cols-2 gap-2 px-4 md:px-5 pb-4 md:pb-5 pt-3"
                    style={{ borderTop: '1px dashed var(--mm-rule)' }}
                  >
                    <Link
                      href={`${base}/boxscore/${h.date}`}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 text-[11px] font-black tracking-[0.14em] uppercase cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-1"
                      style={{
                        background: 'var(--mm-panel-alt)',
                        color: 'var(--mm-ink)',
                        border: '1px solid var(--mm-rule)',
                        borderRadius: '4px',
                      }}
                      aria-label={`${formatKoreanDate(h.date)} 박스스코어 보기`}
                    >
                      <ClipboardList size={13} aria-hidden />
                      박스스코어
                    </Link>
                    <Link
                      href={`${base}/highlights/${h.date}?player=${h.player.player_id}`}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-3 py-2 text-[11px] font-black tracking-[0.14em] uppercase cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-1"
                      style={{
                        background: 'var(--mm-ink)',
                        color: 'var(--mm-panel)',
                        border: '1px solid var(--mm-ink)',
                        borderRadius: '4px',
                      }}
                      aria-label={`${h.player.name} ${formatKoreanDate(h.date)} 하이라이트 재생`}
                    >
                      <Film size={13} aria-hidden />
                      하이라이트
                    </Link>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </SectionCard>

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
