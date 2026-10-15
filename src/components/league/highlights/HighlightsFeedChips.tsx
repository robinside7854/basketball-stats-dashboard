'use client'
// 하이라이트 피드 필터 칩 (리뉴얼 4단계, 2026-10-12).
//
// 종전엔 하이라이트가 탭 4개(경기별 · 명경기 · 커리어 마일스톤 · 베스트샷)로 갈려 있었고, 선수별 화면은
// 경기별 탭 안쪽에 따로 있었다. 지금은 한 피드에 칩 한 줄 — 상태는 전부 URL 쿼리에 둔다(링크·뒤로가기).
//
//   ?date=YYYY-MM-DD   그날 클립          ?player=<id>   그 선수 클립
//   ?f=best            베스트샷(핀)        ?f=classics    명경기        ?f=milestones   커리어 마일스톤
//
// 조합 규칙 — 의미가 있는 것만 남긴다
//   · 날짜 + 선수        → 그날 그 선수 클립
//   · 베스트샷 + 선수    → 그 선수의 핀
//   · 명경기·마일스톤은 단독 (날짜·선수를 고르면 클립 보기로 돌아간다)
// 칩을 바꾸면 재생 위치(clip·type 등 안쪽 필터)는 버린다 — 다른 목록의 번호라 엉뚱한 클립을 가리킨다.
//
// 바로가기 칩 (2026-10-15)
//   · 「내 클립」 — 로그인 회원만. ?player=<내 선수 id> 와 같다(새 쿼리를 만들지 않는다 — 링크 공유 시
//     받는 사람에게도 그 선수 클립으로 열려야 한다). 내 id 는 브라우저의 로그인 상태에서 푼다.
//   · 최근 날짜 3개 — 날짜 시트를 열지 않고 한 번에. 나머지 날짜는 그대로 「날짜 ▾」 시트에 있다.
import { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { CalendarDays, ChevronDown, Pin, Search, Trophy, User, X, Medal } from 'lucide-react'
import { Avatar, Chip, Sheet } from '@/components/league/ui'
import { formatFeedDate } from './feedFormat'
import { useOptionalCurrentUser } from '@/contexts/LeagueAuthContext'

// 칩 줄에 바로 꺼내 둘 최근 날짜 수 — 360px 에서 가로 스크롤 한 번이면 닿는 만큼
const QUICK_DAYS = 3

export type FeedKind = 'all' | 'best' | 'classics' | 'milestones'

export type FeedDay = { date: string; clips: number }
export type FeedPlayerLabel = { id: string; name: string; number: number | null; photo_url: string | null }

interface Props {
  leagueId: string
  days: FeedDay[]
  /** 서버가 이미 아는 선수(현재 player 파라미터) — 칩 이름을 바로 그린다 */
  knownPlayer: FeedPlayerLabel | null
}

type ApiPlayer = { id: string; name: string; number?: number | string | null; photo_url?: string | null; is_active?: boolean; is_guest?: boolean }

function toNum(v: number | string | null | undefined): number | null {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()

export default function HighlightsFeedChips({ leagueId, days, knownPlayer }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const fRaw = sp.get('f')
  const kind: FeedKind = fRaw === 'best' || fRaw === 'classics' || fRaw === 'milestones' ? fRaw : 'all'
  const date = sp.get('date')
  const playerId = sp.get('player')

  const [dateOpen, setDateOpen] = useState(false)
  const [playerOpen, setPlayerOpen] = useState(false)
  const [players, setPlayers] = useState<FeedPlayerLabel[] | null>(null)
  const [query, setQuery] = useState('')
  // 내 선수 id — 리그 로그인(회원)일 때만. 게이트 화면 등 프로바이더 밖이면 null(칩을 안 그린다)
  const myId = useOptionalCurrentUser()?.user?.player_id ?? null
  const quickDays = days.slice(0, QUICK_DAYS)
  const isMine = !!myId && playerId === myId && kind === 'all' && !date

  // 선수 목록 — 시트를 열 때, 또는 칩 이름을 서버가 모를 때(안쪽 필터에서 선수를 바꾼 경우)만 받는다
  const needPlayers = playerOpen || (!!playerId && knownPlayer?.id !== playerId)
  useEffect(() => {
    if (!needPlayers || players) return
    let cancelled = false
    fetch(`/api/leagues/${leagueId}/players`)
      .then(r => (r.ok ? r.json() : []))
      .then((d: ApiPlayer[]) => {
        if (cancelled) return
        setPlayers(
          (Array.isArray(d) ? d : [])
            .filter(p => p.is_active !== false && p.is_guest !== true && !p.name.includes('게스트'))
            .map(p => ({ id: p.id, name: p.name, number: toNum(p.number), photo_url: p.photo_url ?? null }))
            .sort((a, b) => ((a.number ?? 999) - (b.number ?? 999)) || a.name.localeCompare(b.name, 'ko')),
        )
      })
      .catch(() => { if (!cancelled) setPlayers([]) })
    return () => { cancelled = true }
  }, [needPlayers, players, leagueId])

  const currentPlayer: FeedPlayerLabel | null = useMemo(() => {
    if (!playerId) return null
    if (knownPlayer?.id === playerId) return knownPlayer
    return players?.find(p => p.id === playerId) ?? null
  }, [playerId, knownPlayer, players])

  const filteredPlayers = useMemo(() => {
    const q = norm(query)
    if (!players) return []
    if (!q) return players
    return players.filter(p => norm(p.name).includes(q) || (p.number != null && String(p.number).startsWith(q)))
  }, [players, query])

  function go(next: { f?: FeedKind; date?: string | null; player?: string | null }) {
    const p = new URLSearchParams()
    const f = next.f ?? kind
    if (f !== 'all') p.set('f', f)
    const d = next.date === undefined ? date : next.date
    const pl = next.player === undefined ? playerId : next.player
    if (d && (f === 'all')) p.set('date', d)
    if (pl && (f === 'all' || f === 'best')) p.set('player', pl)
    const qs = p.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false })
  }

  const isAll = kind === 'all' && !date && !playerId

  return (
    <>
      <div
        className="flex items-center gap-2 overflow-x-auto scrollbar-hide -mx-4 px-4 pb-1 lg:mx-0 lg:px-0 lg:flex-wrap"
        role="toolbar"
        aria-label="하이라이트 필터"
      >
        <Chip as="button" size="md" selected={isAll} onClick={() => go({ f: 'all', date: null, player: null })}>
          전체
        </Chip>

        {myId && (
          <Chip
            as="button" size="md" icon={User}
            selected={isMine}
            onClick={() => go(isMine ? { f: 'all', date: null, player: null } : { f: 'all', date: null, player: myId })}
          >
            내 클립
          </Chip>
        )}

        {/* 최근 날짜 바로가기 — 다시 누르면 해제 */}
        {quickDays.map(d => {
          const on = d.date === date && kind === 'all'
          return (
            <Chip
              key={d.date}
              as="button" size="md"
              selected={on}
              onClick={() => go({ f: 'all', date: on ? null : d.date })}
              ariaLabel={`${formatFeedDate(d.date, true)} 클립 ${d.clips}개${on ? ' — 해제' : ''}`}
            >
              {formatFeedDate(d.date)}
            </Chip>
          )
        })}

        <Chip
          as="button" size="md" icon={CalendarDays}
          // 바로가기 칩에 없는 날짜를 골랐을 때만 이 칩이 그 날짜를 보인다(같은 날짜가 두 칩에 켜지지 않게)
          selected={!!date && kind === 'all' && !quickDays.some(d => d.date === date)}
          onClick={() => setDateOpen(true)}
          ariaLabel={date ? `날짜 ${formatFeedDate(date)} — 바꾸기` : '날짜 고르기'}
        >
          {date && kind === 'all' && !quickDays.some(d => d.date === date) ? formatFeedDate(date) : quickDays.length > 0 ? '다른 날짜' : '날짜'}
          <ChevronDown size={14} aria-hidden />
        </Chip>

        <Chip
          as="button" size="md"
          icon={currentPlayer
            ? <Avatar src={currentPlayer.photo_url} name={currentPlayer.name} size={24} decorative />
            : User}
          selected={!!playerId && (kind === 'all' || kind === 'best')}
          onClick={() => setPlayerOpen(true)}
          ariaLabel={currentPlayer ? `선수 ${currentPlayer.name} — 바꾸기` : '선수 고르기'}
        >
          {playerId && (kind === 'all' || kind === 'best')
            ? <span className="max-w-[7em] truncate">{currentPlayer?.name ?? '선수'}</span>
            : '선수'}
          <ChevronDown size={14} aria-hidden />
        </Chip>

        <Chip as="button" size="md" icon={Pin} selected={kind === 'best'} onClick={() => go({ f: kind === 'best' ? 'all' : 'best', date: null })}>
          베스트샷
        </Chip>
        <Chip as="button" size="md" icon={Trophy} selected={kind === 'classics'} onClick={() => go({ f: kind === 'classics' ? 'all' : 'classics', date: null, player: null })}>
          명경기
        </Chip>
        <Chip as="button" size="md" icon={Medal} selected={kind === 'milestones'} onClick={() => go({ f: kind === 'milestones' ? 'all' : 'milestones', date: null, player: null })}>
          마일스톤
        </Chip>
      </div>

      {/* 날짜 — 클립이 있는 날만. 고르면 클립 보기로(베스트샷·명경기·마일스톤에서 빠져나온다) */}
      <Sheet open={dateOpen} onClose={() => setDateOpen(false)} title="날짜 고르기" width="sm">
        {days.length === 0 ? (
          <p className="text-sm pb-4" style={{ color: 'var(--mm-muted)' }}>아직 클립이 있는 날이 없어요.</p>
        ) : (
          <ul className="pb-2 -mx-1">
            {date && (
              <li>
                <button
                  type="button"
                  onClick={() => { setDateOpen(false); go({ f: 'all', date: null }) }}
                  className="w-full flex items-center gap-2 min-h-11 px-2 text-sm font-bold cursor-pointer rounded hover:bg-[color:var(--mm-panel-alt)]"
                  style={{ color: 'var(--mm-muted)' }}
                >
                  <X size={16} aria-hidden /> 날짜 해제
                </button>
              </li>
            )}
            {days.map(d => {
              const active = d.date === date && kind === 'all'
              return (
                <li key={d.date}>
                  <button
                    type="button"
                    onClick={() => { setDateOpen(false); go({ f: 'all', date: d.date }) }}
                    aria-current={active || undefined}
                    className="w-full flex items-center justify-between gap-3 min-h-11 px-2 text-sm cursor-pointer rounded hover:bg-[color:var(--mm-panel-alt)]"
                    style={active ? { background: 'var(--mm-yellow-soft)', color: 'var(--mm-ink)' } : { color: 'var(--mm-ink)' }}
                  >
                    <span className="font-bold">{formatFeedDate(d.date, true)}</span>
                    <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--mm-muted)' }}>{d.clips}클립</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </Sheet>

      {/* 선수 — 얼굴로 찾는다(이름 검색 + 사진). 고르면 그 선수 클립(베스트샷이면 그 선수의 핀) */}
      <Sheet open={playerOpen} onClose={() => setPlayerOpen(false)} title="선수 고르기" width="md">
        <div className="pb-2 space-y-2">
          <label className="relative block">
            <span className="sr-only">이름·등번호 검색</span>
            <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--mm-muted)' }} />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="이름 또는 등번호"
              className="w-full min-h-11 pl-9 pr-3 text-base rounded outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
              style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)' }}
            />
          </label>
          {playerId && (
            <button
              type="button"
              onClick={() => { setPlayerOpen(false); go({ player: null }) }}
              className="w-full flex items-center gap-2 min-h-11 px-2 text-sm font-bold cursor-pointer rounded hover:bg-[color:var(--mm-panel-alt)]"
              style={{ color: 'var(--mm-muted)' }}
            >
              <X size={16} aria-hidden /> 선수 해제
            </button>
          )}
          {players == null ? (
            <p className="text-sm py-4 text-center" style={{ color: 'var(--mm-muted)' }}>불러오는 중…</p>
          ) : filteredPlayers.length === 0 ? (
            <p className="text-sm py-4 text-center" style={{ color: 'var(--mm-muted)' }}>맞는 선수가 없어요</p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {filteredPlayers.map(p => {
                const active = p.id === playerId
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPlayerOpen(false)
                        // 명경기·마일스톤은 선수 단위가 아니다 → 클립 보기로. 베스트샷은 그 선수의 핀으로.
                        go({ f: kind === 'best' ? 'best' : 'all', player: p.id })
                      }}
                      aria-current={active || undefined}
                      className="w-full flex items-center gap-2.5 min-h-12 px-2 text-left cursor-pointer rounded hover:bg-[color:var(--mm-panel-alt)]"
                      style={active ? { background: 'var(--mm-yellow-soft)' } : undefined}
                    >
                      <Avatar src={p.photo_url} name={p.name} size={32} decorative />
                      <span className="min-w-0 truncate text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>
                        {p.number != null && <span className="tabular-nums mr-1" style={{ color: 'var(--mm-muted)' }}>#{p.number}</span>}
                        {p.name}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </Sheet>
    </>
  )
}
