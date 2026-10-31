'use client'
import { useOpenPlayerCard } from '@/contexts/PlayerCardContext'
// 미라클모닝 브랜드 — 리그 리더 (6카테고리 top3 · 자유투 2026-10-13 · 3점 2026-10-19 뺐다)
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
import type { PlayerStat } from '@/types/league'
import { leaderMinRounds } from '@/lib/stats/eligibility'
import InfoTip from '@/components/league/ui/InfoTip'
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
  // 2026-11 운영진: 공격 리바운드 자리에 어시스트, 어시스트 자리에 3점(성공 개수 하루 평균 — 성공률 아님)
  { key: 'apg',    term: '어시',     label: '어시스트',   format: v => v.toFixed(1) },
  { key: 'fg3m',   term: '3점',      label: '3점 성공',   format: v => v.toFixed(1), get: p => (p.gp > 0 ? p.fg3m / p.gp : 0) },
  { key: 'spg',    term: '스틸',     label: '스틸',       format: v => v.toFixed(1) },
  { key: 'bpg',    term: '블록',     label: '블록',       format: v => v.toFixed(1) },
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
  const setQuickPlayer = (p: { id: string; name: string } | null) => { if (p) openPlayerCard?.({ playerId: p.id, playerName: p.name, quarterId }) }

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

  // 리뉴얼 R1 (2026-10-31, 운영진 「간결 · 그림 중심」): 부문마다 1위 사진 한 장 + 숫자 하나 — 6칸 격자.
  //   종전 「부문 칩 6개(폰) + 부문당 3줄(사진·이름·출전일·값)」을 걷었다. 2·3위는 작은 사진만(누르면 카드).
  //   「최소 N일 출전」 문구는 ⓘ 안으로. 되돌리기: docs/renewal-rollback.md (R1).
  const boards = CATEGORIES.map(cat => {
    const eligible = players.filter(p => p.gp >= effectiveMinGP && (!cat.minAttempts || cat.minAttempts(p)))
    const top3 = [...eligible].sort((a, b) => valueOf(cat, b) - valueOf(cat, a)).slice(0, 3)
    return { cat, top3 }
  }).filter(b => b.top3.length > 0)

  return (
    <SectionCard variant="stack" pad="none">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
        <h3 className="font-black break-keep" style={{ color: 'var(--mm-ink)', fontSize: 'clamp(22px, 6vw, 28px)', letterSpacing: '-0.005em', lineHeight: 1.1 }}>
          리그 리더
        </h3>
        <span className="flex items-center gap-1">
          {quarterLabel && <span className="t-label">{quarterLabel}</span>}
          <InfoTip label="리그 리더 기준" text={`숫자는 하루(경기한 날) 평균이에요. ${effectiveMinGP}일 이상 뛴 선수만 순위에 들어가요.`} />
        </span>
      </header>

      {loading ? (
        <div className="flex justify-center py-10"><BasketballLoader size={24} /></div>
      ) : boards.length === 0 ? (
        <EmptyState variant="compact" icon={BarChart3} title="아직 기록된 스탯이 없습니다" />
      ) : (
        <ul className={`grid grid-cols-2 sm:grid-cols-3 ${narrow ? '' : 'lg:grid-cols-6'} gap-2.5 p-3 sm:p-4`}>
          {boards.map(({ cat, top3 }) => {
            const [first, ...rest] = top3
            const photo = photoMap[first.player_id]
            return (
              <li key={String(cat.key)} className="overflow-hidden flex flex-col"
                style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}>
                <button type="button" onClick={() => setQuickPlayer({ id: first.player_id, name: first.name })}
                  className="mm-press relative block w-full aspect-[4/5] cursor-pointer text-left"
                  aria-label={`${cat.label} 1위 ${first.name} ${cat.format(valueOf(cat, first))}`}>
                  {photo ? (
                    <Image src={photo} alt="" fill sizes="(min-width: 1024px) 180px, 50vw" className="object-cover object-top" />
                  ) : (
                    <span className="absolute inset-0 flex items-center justify-center font-jersey font-black text-4xl" style={{ color: 'var(--mm-muted)' }}>{initials(first.name)}</span>
                  )}
                  {/* 사진 위 글자 — 아래쪽만 어둡게 깔아 읽히게 */}
                  <span aria-hidden className="absolute inset-x-0 bottom-0 h-2/3" style={{ background: 'linear-gradient(to top, rgba(20,18,15,0.85), transparent)' }} />
                  <span className="absolute left-2.5 top-2.5 text-xs font-black px-2 py-0.5" style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: 'var(--mm-radius-chip)' }}>{cat.label}</span>
                  <span className="absolute inset-x-2.5 bottom-2 flex items-end justify-between gap-2">
                    <span className="min-w-0 truncate font-black text-sm sm:text-base" style={{ color: '#fff' }}>{first.name}</span>
                    <span className="font-jersey font-black tabular-nums leading-none text-[30px]" style={{ color: '#fff' }}>{cat.format(valueOf(cat, first))}</span>
                  </span>
                </button>
                {rest.length > 0 && (
                  <span className="flex items-center gap-1.5 px-2.5 py-2">
                    {rest.map((p, i) => {
                      const ph = photoMap[p.player_id]
                      return (
                        <button key={p.player_id} type="button" onClick={() => setQuickPlayer({ id: p.player_id, name: p.name })}
                          className="mm-press flex items-center gap-1 min-h-[36px] min-w-0 cursor-pointer" title={`${i + 2}위 ${p.name} ${cat.format(valueOf(cat, p))}`}>
                          <span className="t-label tabular-nums">{i + 2}</span>
                          <span className="relative w-7 h-7 rounded-full overflow-hidden shrink-0 flex items-center justify-center" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}>
                            {ph ? <Image src={ph} alt={p.name} fill sizes="28px" className="object-cover object-top" /> : <span className="text-[10px] font-black">{initials(p.name)}</span>}
                          </span>
                        </button>
                      )
                    })}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </SectionCard>
  )
}
