'use client'
// HighlightsHome — 홈 '이번 주 클러치샷' 위젯 (Client Component · v2)
//
// 변경 (v2, 2026-07-15 사용자 요구):
//   - "이번 주 하이라이트" → "이번 주 클러치샷" 으로 전환
//   - 최근 라운드의 is_clutch=true 클립만 노출
//   - 클러치샷 없으면 안내 코멘트 + 정의 부연 설명
//   - 카드 클릭 → 팝업(HighlightsPlayer 재사용)으로 재생 (기존 라운드 페이지 이동 X)
//
// 데이터 소스는 상위 페이지 unstable_cache 프리페치 후 props 주입.

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { HeartCrack, ChevronRight, PlayCircle } from 'lucide-react'
import { SHOT_TYPE_LABEL } from '@/lib/highlights/clip'
import type { HighlightClip } from '@/lib/highlights/types'
import HighlightsClipModal from '@/components/highlights/HighlightsClipModal'
import SectionCard from '@/components/league/ui/SectionCard'

// 클러치샷 종류 라벨/색상 매핑 (2026-07-18)
//   위닝샷은 브랜드 골드로 최상 등급 · 나머지는 의미별 상용 컬러
const KIND_LABEL: Record<NonNullable<HighlightClip['clutch_kind']>, string> = {
  tie:      '동점',
  chase:    '추격',
  reversal: '역전',
  winning:  '위닝샷',
  dagger:   '쐐기',
}
const KIND_STYLE: Record<NonNullable<HighlightClip['clutch_kind']>, { bg: string; fg: string }> = {
  tie:      { bg: '#0891b2', fg: '#ffffff' },  // cyan-600 · 균형
  chase:    { bg: '#f97316', fg: '#ffffff' },  // orange-500 · 몰아붙임
  reversal: { bg: '#10b981', fg: '#ffffff' },  // emerald-500 · 반전
  winning:  { bg: 'var(--mm-yellow)', fg: 'var(--mm-black)' },  // 브랜드 골드 · 최상 등급
  dagger:   { bg: '#ef4444', fg: '#ffffff' },  // red-500 · 결정타
}
// 가치 순위 (2026-07-19) · 위닝샷 > 역전 > 동점 > 추격 > 쐐기
// (쐐기는 이미 앞선 상태에서 격차 벌리기라 상대적으로 극적 강도 낮음)
const KIND_PRIORITY: Record<NonNullable<HighlightClip['clutch_kind']>, number> = {
  winning:  0,
  reversal: 1,
  tie:      2,
  chase:    3,
  dagger:   4,
}

export type HighlightsHomePayload = {
  date: string
  clips: HighlightClip[]         // 클러치샷만 · 없으면 빈 배열
  clipIndexes: number[]          // 원본 인덱스 (라운드 페이지 딥링크용)
  totalClips: number             // 이 라운드 전체 클립 수 (클러치 여부 무관)
  displayNames: string[]         // 팀 이름
}

interface Props {
  data: HighlightsHomePayload | null
  orgSlug: string
  leagueId: string
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

function formatDateShort(date: string): string {
  const d = new Date(date + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return date
  return `${d.getMonth() + 1}.${d.getDate()} (${DAYS[d.getDay()]})`
}

function initialsOf(name: string): string {
  if (!name) return '?'
  return name.trim().charAt(0).toUpperCase()
}

const CLUTCH_DEFINITION = '경기 마지막 2분 · 2포제션 접전(6점차 이내) 에서 이 슛으로 1포제션(3점차) 이내로 좁혀진 결정타'

export default function HighlightsHome({ data, orgSlug, leagueId }: Props) {
  const [openIdx, setOpenIdx] = useState<number | null>(null)

  // 가치 순위 정렬 · 위닝샷 > 역전 > 동점 > 추격 > 쐐기 (사용자 요청 2026-07-19)
  //   · 원본 인덱스(i)는 유지 → 카드 클릭 시 clips[i] 로 모달 오픈
  //   · 같은 종류 내에서는 원본 시간순 유지 (안정 정렬)
  const orderedClips = useMemo(() => {
    if (!data) return []
    return data.clips
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const oa = a.c.clutch_kind ? KIND_PRIORITY[a.c.clutch_kind] : 99
        const ob = b.c.clutch_kind ? KIND_PRIORITY[b.c.clutch_kind] : 99
        return oa - ob
      })
  }, [data])

  if (!data) return null  // 재생 가능 라운드조차 없으면 섹션 미노출

  const base = `/league/${orgSlug}/${leagueId}`
  const roundHref = `${base}/highlights/${data.date}`
  const dateLabel = formatDateShort(data.date)
  const hasClutch = data.clips.length > 0

  return (
    <>
      <SectionCard variant="stack" dataTour="highlights-home" background="var(--mm-panel-alt)">
        {/* 헤더 */}
        <header
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 sm:px-6 md:px-10 py-4 md:py-5"
          style={{ borderBottom: '1px solid var(--mm-rule)' }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 min-w-0">
              <HeartCrack
                size={24}
                style={{ color: '#ef4444' }}
                aria-hidden
                className="shrink-0"
              />
              <h3
                className="font-jersey font-black uppercase break-keep"
                style={{
                  color: 'var(--mm-ink)',
                  fontSize: 'clamp(22px, 6vw, 28px)',
                  letterSpacing: '-0.005em',
                  lineHeight: 1.1,
                }}
              >
                이번 주 클러치샷
              </h3>
              {hasClutch && (
                <span
                  className="text-[11px] font-black tracking-[0.14em] uppercase px-1.5 py-0.5 ml-1"
                  style={{
                    background: '#ef4444',
                    color: '#fff',
                    borderRadius: '3px',
                  }}
                  aria-label={`총 ${data.clips.length}개`}
                >
                  {data.clips.length}
                </span>
              )}
              <span
                className="text-[11px] sm:text-[12px] tracking-[0.14em] uppercase font-bold ml-1"
                style={{ color: 'var(--mm-muted)' }}
              >
                {dateLabel}
              </span>
            </div>
            {/* 클러치샷 정의 부연 설명 (작은 카피) */}
            <p
              className="text-[11px] sm:text-xs mt-1.5 leading-relaxed"
              style={{ color: 'var(--mm-muted)' }}
            >
              {CLUTCH_DEFINITION}
            </p>
          </div>
          <Link
            href={roundHref}
            className="inline-flex items-center gap-1 text-[11px] sm:text-[12px] font-black tracking-[0.14em] uppercase min-h-[36px] px-2 -mx-2 cursor-pointer transition-colors"
            style={{ color: 'var(--mm-yellow-strong)' }}
            aria-label="이번 라운드 하이라이트 전체 보기"
          >
            전체 보기
            <ChevronRight size={14} />
          </Link>
        </header>

        {/* 컨텐츠 · 균등 그리드 카드 (2026-07-19 재설계 v2)
            · 종류 배지를 상단 전체 폭 스트립으로 격상 (한눈에 파악)
            · vs 상대팀은 이름 바로 아래 강조된 라인으로 분리 노출
            · 정렬: 위닝샷 > 역전 > 동점 > 추격 > 쐐기 (가치순 · 랜덤 아님)
        */}
        {hasClutch ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4 sm:p-6 md:p-8 lg:p-10">
            {orderedClips.map(({ c, i }) => {
              const shotLabel = SHOT_TYPE_LABEL[c.shot_type] ?? c.shot_type
              const kind = c.clutch_kind
              const kindStyle = kind ? KIND_STYLE[kind] : null
              const kindLabel = kind ? KIND_LABEL[kind] : null
              const isWinning = kind === 'winning'
              return (
                <button
                  key={c.event_id}
                  type="button"
                  onClick={() => setOpenIdx(i)}
                  className="group text-left block cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-8px_rgba(0,0,0,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1 relative overflow-hidden flex flex-col"
                  style={{
                    background: 'var(--mm-panel)',
                    border: isWinning ? '2px solid var(--mm-yellow-strong)' : '1px solid var(--mm-rule)',
                    borderRadius: '4px',
                    minHeight: 220,
                  }}
                  aria-label={`${c.player_name} · ${kindLabel ?? '클러치샷'} · ${shotLabel} · vs ${c.opponent_name ?? ''} 재생`}
                >
                  {/* 종류 배지 — 상단 전체 폭 스트립 (한눈에 파악) */}
                  {kindStyle && kindLabel ? (
                    <div
                      className="flex items-center justify-center gap-1 py-1.5 text-[12px] sm:text-[13px] font-black tracking-[0.14em] uppercase"
                      style={{ background: kindStyle.bg, color: kindStyle.fg }}
                    >
                      {isWinning && <span aria-hidden>★</span>}
                      {kindLabel}
                      {isWinning && <span aria-hidden>★</span>}
                    </div>
                  ) : (
                    <div
                      className="flex items-center justify-center gap-1 py-1.5 text-[12px] font-black tracking-[0.14em] uppercase"
                      style={{ background: '#ef4444', color: '#fff' }}
                    >
                      <HeartCrack size={12} aria-hidden />
                      클러치
                    </div>
                  )}

                  {/* 프로필 사진 (원형 · 팀 컬러 테두리 · 큼직) */}
                  <div className="flex justify-center pt-4 pb-2">
                    <div
                      className="relative w-16 h-16 sm:w-20 sm:h-20 rounded-full overflow-hidden flex items-center justify-center"
                      style={{
                        background: 'var(--mm-panel-alt)',
                        border: `2px solid ${c.team_color}`,
                        boxShadow: '0 4px 12px -4px rgba(0,0,0,0.25)',
                      }}
                      aria-hidden
                    >
                      <span
                        className="absolute inset-0 flex items-center justify-center font-jersey font-black text-2xl sm:text-3xl"
                        style={{ color: 'var(--mm-ink)' }}
                      >
                        {initialsOf(c.player_name)}
                      </span>
                      {c.player_photo && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={c.player_photo}
                          alt=""
                          loading="lazy"
                          className="relative w-full h-full object-cover"
                          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                        />
                      )}
                      <span
                        aria-hidden
                        className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                        style={{ background: 'rgba(0,0,0,0.5)' }}
                      >
                        <PlayCircle size={32} style={{ color: 'var(--mm-yellow)' }} fill="rgba(0,0,0,0.4)" />
                      </span>
                    </div>
                  </div>

                  {/* 이름 (중앙 · Bold) */}
                  <div
                    className="text-sm sm:text-base font-black text-center px-3 truncate"
                    style={{ color: 'var(--mm-ink)' }}
                  >
                    {c.player_number ? `#${c.player_number} ` : ''}{c.player_name}
                  </div>

                  {/* vs 상대팀 — 별도 라인 · 명확히 강조 */}
                  {c.opponent_name && (
                    <div
                      className="mx-3 mt-1.5 flex items-center justify-center gap-1 text-[11px] sm:text-[12px] py-0.5"
                      style={{ color: 'var(--mm-muted)' }}
                    >
                      <span className="font-bold uppercase tracking-[0.10em]" style={{ color: 'var(--mm-muted)' }}>vs</span>
                      <span
                        className="font-black truncate"
                        style={{ color: 'var(--mm-ink-soft)' }}
                      >
                        {c.opponent_name}
                      </span>
                    </div>
                  )}

                  {/* 공격방식 + 점수 — 하단 */}
                  <div className="mt-auto p-3 flex items-center justify-center gap-1.5 flex-wrap">
                    <span
                      className="text-[11px] font-bold uppercase tracking-[0.10em] px-1.5 py-0.5"
                      style={{
                        background: 'var(--mm-panel-alt)',
                        color: 'var(--mm-ink-soft)',
                        border: '1px solid var(--mm-rule)',
                        borderRadius: '3px',
                      }}
                    >
                      {shotLabel}
                    </span>
                    {c.points > 0 && (
                      <span
                        className="text-[11px] font-black px-1.5 py-0.5"
                        style={{
                          background: 'var(--mm-yellow)',
                          color: 'var(--mm-black)',
                          borderRadius: '3px',
                        }}
                      >
                        +{c.points}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        ) : (
          // 클러치샷 없음 · 안내 코멘트
          <div className="px-4 sm:px-6 md:px-10 py-8 md:py-10 text-center">
            <div
              className="inline-flex items-center gap-2 text-sm font-bold mb-2"
              style={{ color: 'var(--mm-ink-soft)' }}
            >
              <HeartCrack size={18} style={{ color: 'var(--mm-muted)' }} aria-hidden />
              이번 주는 해당 기준에 맞는 경기가 없어요
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: 'var(--mm-muted)' }}>
              마지막 2분 · 2포제션 접전에서 1포제션으로 좁힌 결정타가 이번 라운드엔 없었습니다.
            </p>
          </div>
        )}

        {hasClutch && data.totalClips > 0 && (
          <div
            className="px-4 sm:px-6 md:px-10 pb-4 md:pb-5 text-[11px] uppercase tracking-[0.14em] font-bold"
            style={{ color: 'var(--mm-muted)' }}
          >
            이 라운드 · 클러치 {data.clips.length} / 전체 {data.totalClips}
            {data.displayNames.length > 0 ? ` · ${data.displayNames.slice(0, 4).join(' · ')}` : ''}
          </div>
        )}
      </SectionCard>

      {/* 팝업 재생기 — 공용 HighlightsClipModal · 클러치샷 플레이리스트 자동 재생 */}
      {openIdx !== null && hasClutch && (
        <HighlightsClipModal
          clips={data.clips}
          startIdx={openIdx}
          title="이번 주 클러치샷"
          icon={<HeartCrack size={16} style={{ color: '#ef4444' }} aria-hidden />}
          onClose={() => setOpenIdx(null)}
          ariaLabel="클러치샷 재생"
        />
      )}
    </>
  )
}
