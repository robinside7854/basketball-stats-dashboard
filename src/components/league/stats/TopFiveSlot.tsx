'use client'
import { Trophy } from 'lucide-react'
import SectionCard from '@/components/league/ui/SectionCard'

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
  metricKey: string | null           // null = 초기 상태 (안내)
  metricLabel: string | null         // 예: 'PPG', 'FG%'
  metricFullLabel: string | null     // 예: '득점', '야투율'
  players: TopFivePlayer[]           // 최대 5명 · 이미 정렬됨
  onPlayerClick?: (id: string, name: string) => void
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
      className="w-full h-full flex items-center justify-center font-jersey font-black uppercase"
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

export default function TopFiveSlot({ metricKey, metricLabel, metricFullLabel, players, onPlayerClick }: Props) {
  const active = metricKey !== null && players.length > 0

  return (
    <SectionCard variant="standalone" ariaLabel="TOP 5 리더 슬롯" className="p-3 sm:p-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={14} style={{ color: 'var(--mm-ink-soft)' }} />
        <span
          className="text-[11px] font-black uppercase"
          style={{ color: 'var(--mm-ink)', letterSpacing: '0.16em' }}
        >
          TOP 5 리더
        </span>
        {active && (
          <span
            className="ml-auto font-jersey font-black uppercase truncate"
            style={{ color: 'var(--mm-ink)', fontSize: '15px', letterSpacing: '0.02em' }}
          >
            {metricFullLabel ?? metricLabel}
            <span className="ml-1.5" style={{ color: 'var(--mm-ink-soft)', fontWeight: 700 }}>
              ({metricLabel})
            </span>
          </span>
        )}
      </div>

      {!active ? (
        <div
          className="flex items-center justify-center py-8 sm:py-10 text-center"
          style={{ color: 'var(--mm-muted)' }}
        >
          <p className="text-xs sm:text-sm font-bold uppercase" style={{ letterSpacing: '0.10em' }}>
            테이블 컬럼을 클릭해 TOP 5 리더 보기
          </p>
        </div>
      ) : (
        // key={metricKey} → 지표 전환 시 컴포넌트 자체가 재마운트되어 stagger 애니메이션 재생
        <div
          key={metricKey}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3"
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
            // 1위만 3px 좌측 보더에 옐로우-strong 실색상 허용 (도미노 규칙 유일 예외)
            const accent = isFirst ? 'var(--mm-yellow-strong)' : 'transparent'
            return (
              <button
                key={p.id}
                onClick={onPlayerClick ? () => onPlayerClick(p.id, p.name) : undefined}
                className="topfive-slot text-left flex flex-col cursor-pointer overflow-hidden rounded-md transition-shadow duration-200 hover:shadow-[0_10px_28px_-8px_rgba(0,0,0,0.20)]"
                style={{
                  background: isFirst ? 'var(--mm-yellow-soft)' : 'var(--mm-panel-alt)',
                  border: '1px solid var(--mm-rule)',
                  borderTop: `3px solid ${accent}`,
                  // stagger — 각 슬롯이 순차 등장
                  animation: 'topfiveIn 260ms ease-out both',
                  animationDelay: `${i * 50}ms`,
                }}
              >
                {/* 상단: 카드 폭 전체 정사각 사진 + 좌상단 랭크 뱃지 오버레이 (세로 박스형 — 정보/사진 병렬 밀림 제거) */}
                <div className="relative w-full" style={{ aspectRatio: '1 / 1' }}>
                  <div className="absolute inset-0">
                    <BigAvatar photo={p.photo_url} name={p.name} />
                  </div>
                  <span
                    className="absolute top-1.5 left-1.5 inline-flex items-center justify-center font-jersey font-black tabular-nums rounded-md"
                    style={{
                      minWidth: 22, height: 22, padding: '0 6px', fontSize: 13, lineHeight: 1,
                      background: isFirst ? 'var(--mm-yellow-strong)' : 'var(--mm-panel)',
                      color: isFirst ? 'var(--mm-black)' : rankColor,
                      border: '1px solid var(--mm-rule)',
                    }}
                  >
                    {rank}
                  </span>
                </div>
                {/* 하단: 이름 + 값 + 지표 라벨 */}
                <div className="flex flex-col gap-1 px-2.5 py-2">
                  <div
                    className="font-jersey font-black uppercase break-keep truncate"
                    style={{
                      color: 'var(--mm-ink)',
                      fontSize: 'clamp(13px, 3.2vw, 15px)',
                      lineHeight: 1.15,
                      letterSpacing: '-0.005em',
                    }}
                  >
                    {p.name}
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span
                      className="font-jersey font-black tabular-nums leading-none"
                      style={{ color: 'var(--mm-ink)', fontSize: 'clamp(22px, 5vw, 30px)', letterSpacing: '-0.015em' }}
                    >
                      {p.value}
                    </span>
                    <span
                      className="text-[10px] font-black uppercase"
                      style={{ color: 'var(--mm-muted)', letterSpacing: '0.14em' }}
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
