'use client'
import type React from 'react'
import { Trophy } from 'lucide-react'
import SectionCard from '@/components/league/ui/SectionCard'
import SectionHeader from '@/components/league/ui/SectionHeader'

// 5칸 TOP 5 슬롯 — 컬럼 헤더 클릭 시 해당 지표 TOP 5 표시
// 애니메이션: 순수 CSS · 지표 변경 시 fade + slide-in (stagger 50ms)
// key 값이 바뀌면 React 가 컴포넌트 재마운트 → CSS enter 애니메이션 재실행

export type TopFivePlayer = {
  id: string
  name: string
  photo_url?: string | null
  value: string  // 이미 포맷된 값 (예: '18.5', '42%', '2.31')
}

interface Props {
  metricKey: string | null           // null = 선수 없음 · players 가 비면(기준 충족자 0명) 빈 상태 문구
  metricLabel: string | null         // 예: 'PPG', 'FG%'
  metricFullLabel: string | null     // 예: '득점', '야투율'
  players: TopFivePlayer[]           // 최대 5명 · 이미 정렬됨
  onPlayerClick?: (id: string, name: string) => void
  /** 헤더와 사진 사이에 끼우는 컨트롤(모바일 정렬 칩). 누르는 곳과 바뀌는 곳을 붙여 두려고 받는다. */
  controls?: React.ReactNode
}

function initials(name: string): string {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return '?'
  // 한글: 첫 글자 · 영문/기타: 첫 2자 대문자
  const first = trimmed[0]
  if (/[가-힣]/.test(first)) return first
  const alnum = trimmed.replace(/[^\p{L}\p{N}]/gu, '')
  return alnum.slice(0, 2).toUpperCase() || first
}

// 카드 우측 세로 풀사이즈 아바타 — 카드 높이 = 아바타 높이
function BigAvatar({ photo, name }: { photo?: string | null; name: string }) {
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt={name}
        loading="lazy"
        className="w-full h-full"
        style={{
          objectFit: 'cover',
          objectPosition: 'top',
          background: 'var(--mm-panel-alt)',
          display: 'block',
        }}
      />
    )
  }
  return (
    <div
      className="w-full h-full flex items-center justify-center font-bold"
      style={{
        background: 'var(--mm-panel-alt)',
        color: 'var(--mm-ink-soft)',
        fontSize: 'clamp(36px, 8vw, 56px)',
        letterSpacing: '-0.02em',
      }}
    >
      {initials(name)}
    </div>
  )
}

export default function TopFiveSlot({ metricKey, metricLabel, metricFullLabel, players, onPlayerClick, controls }: Props) {
  const active = metricKey !== null && players.length > 0

  return (
    // pad="none" — 머리(SectionHeader)가 자기 패딩을 가진다. 본문만 아래에서 같은 폭으로 감싼다(이중 패딩 방지).
    <SectionCard variant="standalone" ariaLabel="TOP 5 리더 슬롯" pad="none">
      <SectionHeader
        divider={false}
        icon={<Trophy size={18} />}
        title={
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1 min-w-0">
            <span className="whitespace-nowrap">TOP 5 리더</span>
            {active && (
              <span
                className="basis-full sm:basis-auto min-w-0 font-bold text-base break-keep"
                style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
              >
                {metricFullLabel ?? metricLabel}
                <span className="ml-1.5 whitespace-nowrap" style={{ color: 'var(--mm-ink-soft)', fontWeight: 500 }}>
                  ({metricLabel})
                </span>
              </span>
            )}
          </span>
        }
      />

      <div className="px-4 pb-4 lg:px-6 lg:pb-5">
      {controls}

      {!active ? (
        <div
          className="flex items-center justify-center py-8 sm:py-10 text-center"
          style={{ color: 'var(--mm-muted)' }}
        >
          <p className="t-label">
            이 지표는 기준을 채운 선수가 아직 없어요
          </p>
        </div>
      ) : (
        // key={metricKey} → 지표 전환 시 컴포넌트 자체가 재마운트되어 stagger 애니메이션 재생
        <div
          key={metricKey}
          // 모바일: 한 줄 가로 스크롤(카드 폭 30% → 3장 + 다음 장 끝이 보여 넘길 수 있음을 알린다).
          //   종전 2열 그리드는 5명이 3줄 · 화면 한 장 높이를 차지해, 정렬을 바꾸면 결과가 화면 밖에 있었다.
          className="flex overflow-x-auto snap-x gap-2 -mx-1 px-1 pb-1 sm:mx-0 sm:px-0 sm:pb-0 sm:grid sm:grid-cols-3 lg:grid-cols-5 sm:gap-3"
        >
          {players.slice(0, 5).map((p, i) => {
            const rank = i + 1
            const isFirst = rank === 1
            const rankColor = isFirst
              ? 'var(--mm-ink)'
              : rank === 2
              ? 'var(--mm-ink-soft)'
              : rank === 3
              ? 'var(--mm-ink-soft)'
              : 'var(--mm-muted)'
            // 1위 표시는 yellow-soft 바탕 + 노란 순위 배지 두 가지로 충분하다 — 윗변 3px 띠는 겹쳐서 뺐다(2026-10-17)
            return (
              <button
                key={p.id}
                onClick={onPlayerClick ? () => onPlayerClick(p.id, p.name) : undefined}
                type="button"
                className="topfive-slot mm-lift w-[30%] min-w-[104px] shrink-0 snap-start sm:w-auto sm:min-w-0 text-left flex flex-col cursor-pointer overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
                style={{
                  borderRadius: 'var(--mm-radius-card)',
                  background: isFirst ? 'var(--mm-yellow-soft)' : 'var(--mm-panel-alt)',
                  border: '1px solid var(--mm-rule)',
                  // stagger — 각 슬롯이 순차 등장
                  animation: 'topfiveIn 260ms ease-out backwards',  // backwards — 끝난 뒤 transform 을 붙잡지 않아 mm-lift 호버가 먹는다
                  animationDelay: `${i * 50}ms`,
                }}
              >
                {/* 상단: 카드 폭 전체 정사각 사진 + 좌상단 랭크 뱃지 오버레이 (세로 박스형 — 정보/사진 병렬 밀림 제거) */}
                <div className="relative w-full" style={{ aspectRatio: '1 / 1' }}>
                  <div className="absolute inset-0">
                    <BigAvatar photo={p.photo_url} name={p.name} />
                  </div>
                  <span
                    className="absolute top-1.5 left-1.5 inline-flex items-center justify-center t-num font-bold"
                    style={{
                      borderRadius: 'var(--mm-radius-chip)',
                      minWidth: 26, height: 26, padding: '0 6px', fontSize: 16, lineHeight: 1,
                      background: isFirst ? 'var(--mm-yellow-strong)' : 'var(--mm-panel)',
                      color: isFirst ? 'var(--mm-panel)' : rankColor,
                      border: '1px solid var(--mm-rule)',
                    }}
                  >
                    {rank}
                  </span>
                </div>
                {/* 하단: 이름 + 값 + 지표 라벨 */}
                <div className="flex flex-col gap-1 px-2 py-1.5 sm:px-2.5 sm:py-2">
                  <div
                    className="font-bold break-keep truncate"
                    title={p.name}
                    style={{
                      color: 'var(--mm-ink)',
                      fontSize: 'clamp(14px, 3.2vw, 17px)',
                      lineHeight: 1.15,
                      letterSpacing: '-0.005em',
                    }}
                  >
                    {p.name}
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className="font-jersey font-black tabular-nums leading-none"
                      style={{ color: 'var(--mm-ink)', fontSize: 'clamp(20px, 5vw, 30px)', letterSpacing: '-0.015em' }}
                    >
                      {p.value}
                    </span>
                    <span
                      className="t-label"
                      style={{ color: 'var(--mm-muted)' }}
                    >
                      {metricLabel}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
      </div>

      {/* Scoped keyframes — Framer Motion 없이 순수 CSS */}
      <style jsx>{`
        @keyframes topfiveIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        /* prefers-reduced-motion 존중 */
        @media (prefers-reduced-motion: reduce) {
          .topfive-slot {
            animation: none !important;
          }
        }
      `}</style>
    </SectionCard>
  )
}
