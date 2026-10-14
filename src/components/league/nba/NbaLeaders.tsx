'use client'
import { useOpenPlayerCard } from '@/contexts/PlayerCardContext'
// 미라클모닝 브랜드 — 리그 리더 (7카테고리 top3 · 자유투는 2026-10-13 뺐다)
// 팔레트: 노랑/검정/화이트 (mm-* 변수)
// 각 카드: 카테고리 라벨 + Top3 (프로필 사진 + 이름 + 값 모두 크게)
// 1위(top): 노랑 배경 + 검정 잉크 하이라이트
// 사진 없으면 이니셜 fallback. 클릭 시 PlayerQuickView.

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { BarChart3 } from 'lucide-react'

// 리더 카드 클릭 시에만 열리는 모달 — 초기 홈 번들에서 분리
import { BasketballLoader } from '@/components/league/BasketballIcons'
import SectionCard from '@/components/league/ui/SectionCard'
import { ProgressBar } from '@/components/league/ui/viz'
import type { PlayerStat } from '@/types/league'
import { leaderMinRounds } from '@/lib/stats/eligibility'
import Chip from '@/components/league/ui/Chip'
import EmptyState from '@/components/league/ui/EmptyState'

interface Props {
  leagueId: string
  minGP?: number
  /** 집계 분기 표시 (`26.4Q`). 없으면 시즌 전체 */
  quarterLabel?: string | null
  /** 클라이언트 폴백 조회도 같은 분기로 */
  quarterId?: string | null
  /** SSR 프리페치 결과 — 있으면 초기 fetch skip (홈 waterfall 제거용) */
  initialPlayers?: PlayerStat[]
  /** SSR 프리페치 결과 — 있으면 초기 fetch skip */
  initialPhotoMap?: Record<string, string | null>
  /** 좁은 칸(홈 「이번 분기」 PC 오른쪽 ~720px)에 놓일 때 — lg 3열·xl 4열 대신 2열 유지(2026-10-12) */
  narrow?: boolean
}

interface CategoryDef {
  key: keyof PlayerStat
  term: string
  label: string
  format: (v: number) => string
  subFormat?: (p: PlayerStat) => string       // FT% 처럼 값 아래 하위 표시 (17/20 등)
  minAttempts?: (p: PlayerStat) => boolean    // 백분율 카테고리 최소 시도 필터
  get?: (p: PlayerStat) => number             // 저장 필드가 아닌 파생값(3점 하루 평균 등)
}
// 값은 전부 **하루(경기한 날) 평균**이다 — 스탯 집계가 라운드(하루) 단위로 통일돼 있다(2026-08-10).
//   예전엔 'PPG(경기당)' 라고 써서 하루 3경기를 뛴 사람의 숫자가 경기당 숫자처럼 읽혔고,
//   3점 성공만 누적 개수라 한 위젯 안에 단위가 섞여 있었다(2026-10-11 정리).
const CATEGORIES: CategoryDef[] = [
  { key: 'ppg',    term: '득점',     label: '득점',       format: v => v.toFixed(1) },
  { key: 'rpg',    term: '리바',     label: '리바운드',   format: v => v.toFixed(1) },
  { key: 'apg',    term: '어시',     label: '어시스트',   format: v => v.toFixed(1) },
  { key: 'fg3m',   term: '3점',      label: '3점 성공',   format: v => v.toFixed(1), get: p => (p.gp > 0 ? p.fg3m / p.gp : 0) },
  { key: 'spg',    term: '스틸',     label: '스틸',       format: v => v.toFixed(1) },
  { key: 'bpg',    term: '블락',     label: '블락',       format: v => v.toFixed(1) },
  { key: 'orp',    term: '공격리바', label: '공격 리바운드', format: v => v.toFixed(1) },
  // 자유투 성공률 카드는 2026-10-13 사용자 요청으로 홈에서 뺐다(subFormat·minAttempts 는 백분율 카드용으로 남겨 둠).
]

const valueOf = (cat: CategoryDef, p: PlayerStat): number => (cat.get ? cat.get(p) : (p[cat.key] as number))

type PlayerMeta = { id: string; name: string; photo_url: string | null }

function initials(name: string): string {
  return name.slice(0, 2)
}

export default function NbaLeaders({ leagueId, minGP, quarterLabel, quarterId, initialPlayers, initialPhotoMap, narrow = false }: Props) {
  const hasInitial = !!initialPlayers && !!initialPhotoMap
  const [players, setPlayers] = useState<PlayerStat[]>(initialPlayers ?? [])
  const [photoMap, setPhotoMap] = useState<Record<string, string | null>>(initialPhotoMap ?? {})
  // initial 있으면 즉시 렌더 (SSR 프리페치로 waterfall 제거)
  const [loading, setLoading] = useState(!hasInitial)
  // 선수 카드는 레이아웃의 전역 카드 하나로 연다(2026-10-14, contexts/PlayerCardContext)
  const openPlayerCard = useOpenPlayerCard()
  const setQuickPlayer = (p: { id: string; name: string } | null) => { if (p) openPlayerCard?.({ playerId: p.id, playerName: p.name }) }
  // 모바일에서 카테고리 chip 으로 하나만 노출 · 데스크탑은 전체 그리드 (2026-07-16 세로 스크롤 축소)
  const [selectedCatKey, setSelectedCatKey] = useState<keyof PlayerStat>(CATEGORIES[0].key)

  useEffect(() => {
    // initial 데이터가 있으면 mount 시 fetch skip — 서버 렌더 결과 그대로 사용
    if (hasInitial) return
    setLoading(true)
    Promise.all([
      fetch(`/api/leagues/${leagueId}/stats?unit=round${quarterId ? `&quarterId=${quarterId}` : ''}`).then(r => r.json()).catch(() => ({ players: [] })),
      fetch(`/api/leagues/${leagueId}/players`).then(r => r.json()).catch(() => []),
    ]).then(([statsD, playersD]) => {
      setPlayers(statsD.players ?? [])
      const pm: Record<string, string | null> = {}
      for (const p of (playersD ?? []) as PlayerMeta[]) pm[p.id] = p.photo_url
      setPhotoMap(pm)
      setLoading(false)
    })
    // hasInitial 은 리렌더 방지용 (leagueId 변경 시에만 재조회)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId])

  // 최소 출전 — 정본은 leaderMinRounds (개인 대시보드 순위도 같은 식을 쓴다)
  const effectiveMinGP = minGP ?? leaderMinRounds(players)

  return (
    <>
      <SectionCard variant="stack" pad="none">
        <header
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 sm:px-6 md:px-10 py-4 md:py-5"
          style={{ borderBottom: '1px solid var(--mm-rule)' }}
        >
          <h3
            className="font-black break-keep"
            style={{ color: 'var(--mm-ink)', fontSize: 'clamp(22px, 6vw, 28px)', letterSpacing: '-0.005em', lineHeight: 1.1 }}
          >
            리그 리더
          </h3>
          <span className="t-label break-keep">
            {quarterLabel ? `${quarterLabel} · ` : ''}하루 평균 · 최소 {effectiveMinGP}일 출전
          </span>
        </header>

        {loading ? (
          <div className="flex justify-center py-10"><BasketballLoader size={24} /></div>
        ) : players.length === 0 ? (
          <EmptyState variant="compact" icon={BarChart3} title="아직 기록된 스탯이 없습니다" />
        ) : (
          <>
            {/* 모바일 전용 카테고리 chip 필터 · sm+ 는 그리드로 전체 노출 */}
            <div className="sm:hidden flex overflow-x-auto scrollbar-hide gap-1.5 px-4 py-3" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
              {CATEGORIES.map(cat => {
                const active = cat.key === selectedCatKey
                return (
                  <Chip
                    key={String(cat.key)}
                    as="button"
                    size="md"
                    selected={active}
                    onClick={() => setSelectedCatKey(cat.key)}
                  >
                    {cat.term}
                  </Chip>
                )
              })}
            </div>
          {/* PC 폭(1280)에서 2열이면 카드 안 이름과 값 사이가 텅 비었다 → lg 3열 · xl 4열.
              카드 폭이 ~260px 까지 좁아지므로 lg+ 에서 사진·글자를 한 단계 줄인다. */}
          <div className={`grid grid-cols-1 sm:grid-cols-2 ${narrow ? '' : 'lg:grid-cols-3 xl:grid-cols-4'} gap-3 p-4 sm:gap-4 sm:p-5 lg:p-6`}>
            {CATEGORIES.map(cat => {
              const eligible = players.filter(p => {
                if (p.gp < effectiveMinGP) return false
                if (cat.minAttempts && !cat.minAttempts(p)) return false
                return true
              })
              const sorted = [...eligible].sort((a, b) => valueOf(cat, b) - valueOf(cat, a))
              const top3 = sorted.slice(0, 3)
              if (top3.length === 0) return null
              // 모바일: 선택된 카테고리만 렌더 · sm+: 전체 그리드
              const mobileHidden = cat.key !== selectedCatKey ? 'hidden sm:block' : ''
              return (
                <div
                  key={String(cat.key)}
                  className={`${mobileHidden} overflow-hidden`}
                  style={{
                    background: 'var(--mm-panel-alt)',
                    border: '1px solid var(--mm-rule)',
                    borderRadius: 'var(--mm-radius-ctl)',
                  }}
                >
                  {/* 카테고리 헤더 */}
                  <div
                    className="px-4 py-2.5"
                    style={{ borderBottom: '1px solid var(--mm-rule)' }}
                  >
                    {/* "득점 · PPG" 처럼 한글이 섞인 라벨 — uppercase 는 한글에 효과가 없고
                        track-label(0.14em)은 자간만 벌렸다. t-label 로 통일. */}
                    <h4 className="text-sm font-black break-keep" style={{ color: 'var(--mm-ink)' }}>
                      {cat.label}
                    </h4>
                  </div>

                  {/* Top3 — 이름과 값 사이를 「1위 대비 막대」로 채운다(2026-10-12).
                      종전엔 이름은 왼쪽 끝, 값은 오른쪽 끝이라 그 사이 빈칸이 아무 뜻이 없었다.
                      막대 길이 = 값 / 1위 값 → 1~3위 격차가 한눈에 보인다. */}
                  <div className="p-1.5 sm:p-2">
                    {(() => {
                      const topVal = valueOf(cat, top3[0])
                      return top3.map((p, i) => {
                      const isTop = i === 0
                      const photo = photoMap[p.player_id]
                      const v = valueOf(cat, p)
                      // 모바일·좁은 카드(lg+)는 작게, sm~md 2열은 넓으니 크게
                      const avatarCls = isTop
                        ? 'w-11 h-11 sm:w-[52px] sm:h-[52px] lg:w-11 lg:h-11'
                        : 'w-9 h-9 sm:w-11 sm:h-11 lg:w-9 lg:h-9'
                      return (
                        <button
                          key={p.player_id}
                          onClick={() => setQuickPlayer({ id: p.player_id, name: p.name })}
                          className="w-full grid gap-2.5 sm:gap-3 items-center transition-colors duration-200 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-rule)] focus-visible:ring-offset-1"
                          style={{
                            gridTemplateColumns: 'auto auto minmax(0,1fr) auto',
                            padding: isTop ? '10px 10px' : '8px 10px',
                            background: isTop ? 'var(--mm-yellow-soft)' : 'transparent',
                            borderLeft: isTop ? '3px solid var(--mm-yellow-strong)' : '3px solid transparent',
                            color: 'var(--mm-ink)',
                          }}
                        >
                          {/* 순위 큰 숫자 */}
                          <span
                            className={`font-jersey font-black tabular-nums leading-none text-right ${isTop ? 'text-[26px] w-5' : 'text-[20px] w-5'}`}
                            style={{ color: isTop ? 'var(--mm-ink)' : 'var(--mm-muted)' }}
                          >
                            {i + 1}
                          </span>

                          {/* 프로필 사진 or 이니셜 (원형) - 1위 더 큼 */}
                          <span
                            className={`rounded-full overflow-hidden flex items-center justify-center shrink-0 relative ${avatarCls}`}
                            style={{
                              background: 'var(--mm-panel)',
                              border: `${isTop ? 3 : 2}px solid ${isTop ? 'var(--mm-yellow-strong)' : 'var(--mm-rule)'}`,
                            }}
                          >
                            {photo ? (
                              // next/image · 리더보드는 below-fold → 기본 lazy · sizes = 최대 52px
                              <Image
                                src={photo}
                                alt={p.name}
                                fill
                                sizes="52px"
                                className="object-cover object-top"
                              />
                            ) : (
                              <span
                                className={`font-jersey font-black ${isTop ? 'text-lg' : 'text-sm'}`}
                                style={{ color: 'var(--mm-ink)' }}
                              >
                                {initials(p.name)}
                              </span>
                            )}
                          </span>

                          {/* 이름 + (1위 대비 막대 · 라운드 수) */}
                          <span className="min-w-0">
                            {/* 선수명은 본문체 — 유니폼체(좁음) + 한글에 무효한 uppercase 제거 */}
                            <span
                              className={`block truncate ${isTop ? 'font-black text-lg sm:text-xl lg:text-lg' : 'font-semibold text-base sm:text-lg lg:text-base'}`}
                              style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em', lineHeight: '1.15' }}
                              title={p.name}
                            >
                              {p.name}
                            </span>
                            <span className="flex items-center gap-2 mt-1.5">
                              <ProgressBar
                                value={v}
                                max={topVal}
                                height={5}
                                color={isTop ? 'var(--mm-yellow-strong)' : 'var(--mm-ink-soft)'}
                                className="flex-1 min-w-0"
                                label={`1위 대비 ${topVal > 0 ? Math.round((v / topVal) * 100) : 0}%`}
                              />
                              <span className="t-label font-medium shrink-0 whitespace-nowrap">{p.gp}일</span>
                            </span>
                          </span>

                          {/* 값 큰 숫자 + FT% 같은 subFormat (성공/시도) */}
                          <span className="flex flex-col items-end leading-none shrink-0">
                            <span
                              className={`font-jersey font-black tabular-nums leading-none ${isTop ? 'text-[30px] sm:text-[36px] lg:text-[28px]' : 'text-[24px] sm:text-[28px] lg:text-[22px]'}`}
                              style={{ color: 'var(--mm-ink)', letterSpacing: '-0.015em' }}
                            >
                              {cat.format(v)}
                            </span>
                            {cat.subFormat && (
                              <span className="t-num text-xs mt-1" style={{ color: 'var(--mm-muted)' }}>
                                {cat.subFormat(p)}
                              </span>
                            )}
                          </span>
                        </button>
                      )
                    })
                    })()}
                  </div>
                </div>
              )
            })}
          </div>
          </>
        )}
      </SectionCard>

    </>
  )
}
