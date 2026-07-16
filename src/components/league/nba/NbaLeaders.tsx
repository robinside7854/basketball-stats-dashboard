'use client'
// 미라클모닝 브랜드 — 리그 리더 (4카테고리 top3)
// 팔레트: 노랑/검정/화이트 (mm-* 변수)
// 각 카드: 카테고리 라벨 + Top3 (프로필 사진 + 이름 + 값 모두 크게)
// 1위(top): 노랑 배경 + 검정 잉크 하이라이트
// 사진 없으면 이니셜 fallback. 클릭 시 PlayerQuickView.

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'

// 리더 카드 클릭 시에만 열리는 모달 — 초기 홈 번들에서 분리
const PlayerQuickViewModal = dynamic(() => import('@/components/league/PlayerQuickViewModal'), { ssr: false })
import { BasketballLoader } from '@/components/league/BasketballIcons'
import type { PlayerStat } from '@/types/league'

interface Props {
  leagueId: string
  minGP?: number
  /** SSR 프리페치 결과 — 있으면 초기 fetch skip (홈 waterfall 제거용) */
  initialPlayers?: PlayerStat[]
  /** SSR 프리페치 결과 — 있으면 초기 fetch skip */
  initialPhotoMap?: Record<string, string | null>
}

interface CategoryDef {
  key: keyof PlayerStat
  term: string
  label: string
  format: (v: number) => string
  subFormat?: (p: PlayerStat) => string       // FT% 처럼 값 아래 하위 표시 (17/20 등)
  minAttempts?: (p: PlayerStat) => boolean    // 백분율 카테고리 최소 시도 필터
}
const CATEGORIES: CategoryDef[] = [
  { key: 'ppg',    term: 'PPG',  label: '득점 · PPG',       format: v => v.toFixed(1) },
  { key: 'rpg',    term: 'RPG',  label: '리바운드 · RPG',   format: v => v.toFixed(1) },
  { key: 'apg',    term: 'APG',  label: '어시스트 · APG',   format: v => v.toFixed(1) },
  { key: 'fg3m',   term: '3PM',  label: '3점 성공 · 3PM',   format: v => String(Math.round(v)) },
  { key: 'spg',    term: 'SPG',  label: '스틸 · SPG',       format: v => v.toFixed(1) },
  { key: 'bpg',    term: 'BPG',  label: '블락 · BPG',       format: v => v.toFixed(1) },
  { key: 'orp',    term: 'ORP',  label: '공격 리바 · ORP',  format: v => v.toFixed(1) },
  {
    key: 'ft_pct', term: 'FT%',  label: '자유투 · FT%',
    format: v => `${v.toFixed(1)}%`,
    subFormat: p => `${Math.round(p.ftm)}/${Math.round(p.fta)}`,
    minAttempts: p => p.fta >= 5,   // 최소 시도 5개 이상
  },
]

type PlayerMeta = { id: string; name: string; photo_url: string | null }

function initials(name: string): string {
  return name.slice(0, 2)
}

export default function NbaLeaders({ leagueId, minGP, initialPlayers, initialPhotoMap }: Props) {
  const hasInitial = !!initialPlayers && !!initialPhotoMap
  const [players, setPlayers] = useState<PlayerStat[]>(initialPlayers ?? [])
  const [photoMap, setPhotoMap] = useState<Record<string, string | null>>(initialPhotoMap ?? {})
  // initial 있으면 즉시 렌더 (SSR 프리페치로 waterfall 제거)
  const [loading, setLoading] = useState(!hasInitial)
  const [quickPlayer, setQuickPlayer] = useState<{ id: string; name: string } | null>(null)
  // 모바일에서 카테고리 chip 으로 하나만 노출 · 데스크탑은 전체 그리드 (2026-07-16 세로 스크롤 축소)
  const [selectedCatKey, setSelectedCatKey] = useState<keyof PlayerStat>(CATEGORIES[0].key)

  useEffect(() => {
    // initial 데이터가 있으면 mount 시 fetch skip — 서버 렌더 결과 그대로 사용
    if (hasInitial) return
    setLoading(true)
    Promise.all([
      fetch(`/api/leagues/${leagueId}/stats?unit=round`).then(r => r.json()).catch(() => ({ players: [] })),
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

  const maxGP = players.reduce((m, p) => Math.max(m, p.gp), 0)
  const effectiveMinGP = minGP ?? Math.max(3, Math.ceil(maxGP / 2))

  return (
    <>
      <section
        className="mm-brand"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
          borderTop: 0,
        }}
      >
        <header
          className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 sm:px-6 md:px-10 py-4 md:py-5"
          style={{ borderBottom: '1px solid var(--mm-rule)' }}
        >
          <h3
            className="font-jersey font-black uppercase break-keep"
            style={{ color: 'var(--mm-ink)', fontSize: 'clamp(22px, 6vw, 28px)', letterSpacing: '-0.005em', lineHeight: 1.1 }}
          >
            리그 리더
          </h3>
          <span className="text-[11px] sm:text-[12px] tracking-[0.14em] sm:tracking-[0.18em] uppercase font-bold break-keep" style={{ color: 'var(--mm-muted)' }}>
            최소 {effectiveMinGP} R
          </span>
        </header>

        {loading ? (
          <div className="flex justify-center py-10"><BasketballLoader size={28} /></div>
        ) : players.length === 0 ? (
          <div className="text-center py-10 text-sm" style={{ color: 'var(--mm-muted)' }}>아직 기록된 스탯이 없습니다</div>
        ) : (
          <>
            {/* 모바일 전용 카테고리 chip 필터 · sm+ 는 그리드로 전체 노출 */}
            <div className="sm:hidden flex overflow-x-auto scrollbar-hide gap-1.5 px-4 py-3" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
              {CATEGORIES.map(cat => {
                const active = cat.key === selectedCatKey
                return (
                  <button
                    key={String(cat.key)}
                    type="button"
                    onClick={() => setSelectedCatKey(cat.key)}
                    className="shrink-0 min-h-[36px] px-3 py-1.5 text-xs font-black uppercase transition-colors cursor-pointer whitespace-nowrap"
                    style={{
                      background: active ? 'var(--mm-yellow)' : 'var(--mm-panel-alt)',
                      color: active ? 'var(--mm-black)' : 'var(--mm-ink-soft)',
                      border: `1px solid ${active ? 'var(--mm-black)' : 'var(--mm-rule)'}`,
                      borderRadius: '4px',
                      letterSpacing: '0.10em',
                    }}
                    aria-pressed={active}
                  >
                    {cat.term}
                  </button>
                )
              })}
            </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 sm:gap-5 sm:p-6 md:p-8 lg:p-10">
            {CATEGORIES.map(cat => {
              const eligible = players.filter(p => {
                if (p.gp < effectiveMinGP) return false
                if (cat.minAttempts && !cat.minAttempts(p)) return false
                return true
              })
              const sorted = [...eligible].sort((a, b) => (b[cat.key] as number) - (a[cat.key] as number))
              const top3 = sorted.slice(0, 3)
              if (top3.length === 0) return null
              // 모바일: 선택된 카테고리만 렌더 · sm+: 전체 그리드
              const mobileHidden = cat.key !== selectedCatKey ? 'hidden sm:block' : ''
              return (
                <div
                  key={String(cat.key)}
                  className={`${mobileHidden} transition-shadow duration-200 hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)]`}
                  style={{
                    background: 'var(--mm-panel-alt)',
                    border: '1px solid var(--mm-rule)',
                  }}
                >
                  {/* 카테고리 헤더 */}
                  <div
                    className="px-5 pt-4 pb-3"
                    style={{ borderBottom: '1px solid var(--mm-rule)' }}
                  >
                    <h4
                      className="font-black uppercase break-keep"
                      style={{ color: 'var(--mm-yellow-strong)', fontSize: '13px', letterSpacing: '0.18em', lineHeight: 1.3 }}
                    >
                      {cat.label}
                    </h4>
                  </div>

                  {/* Top3 */}
                  <div className="p-2">
                    {top3.map((p, i) => {
                      const isTop = i === 0
                      const photo = photoMap[p.player_id]
                      // 모바일에서 이름 공간 확보 → clamp 로 폭에 따라 스케일
                      const avatarSize = isTop
                        ? 'clamp(56px, 15vw, 72px)'
                        : 'clamp(48px, 12vw, 60px)'
                      return (
                        <button
                          key={p.player_id}
                          onClick={() => setQuickPlayer({ id: p.player_id, name: p.name })}
                          className="w-full grid gap-3 sm:gap-4 items-center transition-colors duration-200 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)] focus-visible:ring-offset-1"
                          style={{
                            gridTemplateColumns: `auto minmax(0,auto) minmax(0,1fr) auto`,
                            padding: isTop ? '14px 12px' : '10px 12px',
                            background: isTop ? 'var(--mm-yellow)' : 'transparent',
                            color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)',
                          }}
                        >
                          {/* 순위 큰 숫자 */}
                          <span
                            className="font-jersey font-black tabular-nums leading-none"
                            style={{
                              color: isTop ? 'var(--mm-black)' : 'var(--mm-muted)',
                              width: isTop ? '28px' : '24px',
                              textAlign: 'right',
                              fontSize: isTop ? '32px' : '26px',
                            }}
                          >
                            {i + 1}
                          </span>

                          {/* 프로필 사진 or 이니셜 (원형) - 1위 더 큼 */}
                          <span
                            className="rounded-full overflow-hidden flex items-center justify-center shrink-0 relative"
                            style={{
                              width: avatarSize,
                              height: avatarSize,
                              background: 'var(--mm-panel)',
                              border: `${isTop ? 3 : 2}px solid ${isTop ? 'var(--mm-black)' : 'var(--mm-rule)'}`,
                            }}
                          >
                            {photo ? (
                              // next/image · 리더보드는 below-fold → 기본 lazy · sizes = 최대 72px
                              <Image
                                src={photo}
                                alt={p.name}
                                fill
                                sizes="(max-width: 640px) 15vw, 72px"
                                className="object-cover object-top"
                              />
                            ) : (
                              <span
                                className="font-jersey font-black"
                                style={{
                                  color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)',
                                  fontSize: isTop ? '22px' : '18px',
                                }}
                              >
                                {initials(p.name)}
                              </span>
                            )}
                          </span>

                          {/* 이름 + GP - 크게 */}
                          <span className="min-w-0">
                            <span
                              className="block font-jersey uppercase break-keep"
                              style={{
                                color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)',
                                fontSize: isTop ? 'clamp(20px, 5.2vw, 26px)' : 'clamp(17px, 4.4vw, 22px)',
                                fontWeight: 900,
                                letterSpacing: '-0.005em',
                                lineHeight: '1.1',
                                wordBreak: 'break-word',
                                overflowWrap: 'anywhere',
                              }}
                            >
                              {p.name}
                            </span>
                            <span
                              className="block font-bold uppercase mt-1.5"
                              style={{
                                color: isTop ? 'rgba(0,0,0,0.6)' : 'var(--mm-muted)',
                                fontSize: '11px',
                                letterSpacing: '0.16em',
                              }}
                            >
                              {p.gp} 라운드
                            </span>
                          </span>

                          {/* 값 큰 숫자 + FT% 같은 subFormat (성공/시도) */}
                          <span
                            className="flex flex-col items-end leading-none shrink-0"
                          >
                            <span
                              className="font-jersey font-black tabular-nums leading-none"
                              style={{
                                color: isTop ? 'var(--mm-black)' : 'var(--mm-ink)',
                                letterSpacing: '-0.015em',
                                fontSize: isTop ? 'clamp(32px, 8vw, 42px)' : 'clamp(26px, 6.5vw, 34px)',
                              }}
                            >
                              {cat.format(p[cat.key] as number)}
                            </span>
                            {cat.subFormat && (
                              <span
                                className="font-mono tabular-nums mt-1"
                                style={{
                                  color: isTop ? 'rgba(0,0,0,0.6)' : 'var(--mm-muted)',
                                  fontSize: '11px',
                                  letterSpacing: '0.04em',
                                }}
                              >
                                {cat.subFormat(p)}
                              </span>
                            )}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          </>
        )}
      </section>

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
