'use client'
// 대회 관리 — 대회 묶음(mode='tournament')의 「경기」 탭 본문.
//
// 왜 리그 일정 화면을 쓰지 않는가
//   리그 일정은 "매주 같은 요일에 모인다"를 전제로 **날짜**를 먼저 깔고 그 날짜에 슬롯을 채운다.
//   대회는 주최측이 정한 날에만 열리고, 등록 단위가 날짜가 아니라 **경기**(상대·라운드)다.
//   그대로 두면 자동 생성된 토요일 43개가 화면을 채우고 정작 대회 경기는 안 보인다(실측).
//
// 구조는 파란날개 대회 관리(src/app/(main)/[org]/[team]/tournaments/page.tsx)를 따랐다 —
//   대회 아코디언 → 펼치면 그 대회의 경기 목록. 사용자가 이미 그 화면에 익숙하다.
//   ⚠ 그 트리를 import 하지 않는다(레거시이고 데이터 모델이 다르다). 화면 구조만 옮긴다.
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  Plus, Pencil, Trash2, ChevronDown, ChevronUp, Trophy, CalendarRange,
  Youtube, UserCheck, ClipboardList, Lock, ArrowUpDown, BarChart2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import EmptyState from '@/components/league/EmptyState'
import TournamentFormModal, { type TournamentDraft } from '@/components/league/TournamentFormModal'
import TournamentGameFormModal, { type TournamentGameDraft } from '@/components/league/TournamentGameFormModal'
import TournamentRosterPanel from '@/components/league/TournamentRosterPanel'

// 토너먼트 진행 깊이 — 성적 판정이 "가장 깊이 간 경기"를 이 값으로 고른다.
//   ⚠ 여기 없는 라운드명은 0 으로 떨어져 조별예선보다 얕게 취급된다. 새 라운드명이 생기면 함께 추가.
//   '준결승'과 '4강'은 같은 라운드의 두 표기다(대회마다 부르는 이름이 다르다).
const ROUND_ORDER: Record<string, number> = {
  '결승': 5, '준결승': 4, '4강': 4, '8강': 3, '16강': 2, '조별예선': 1,
}

const TYPE_LABELS: Record<string, string> = { pro: '선출 포함', amateur: '동호인' }

type ApiTeam = { id: string; name: string | null; color: string | null; is_external: boolean | null } | null

type ApiGame = {
  id: string
  date: string
  slot_num: number | null
  quarter_id: string | null
  round_label: string | null
  venue: string | null
  home_score: number | null
  away_score: number | null
  is_started: boolean | null
  is_complete: boolean | null
  home_team: ApiTeam
  away_team: ApiTeam
  video_quarters?: number[]
}

type ApiQuarter = {
  id: string
  kind: string
  name: string | null
  start_date: string | null
  end_date: string | null
  tournament_type?: string | null
  description?: string | null
}

/** 우리 팀 관점으로 뒤집은 한 경기 — 홈/원정이 대회마다 달라 매번 되돌려야 한다. */
type OurView = { ourScore: number; oppScore: number; oppName: string; played: boolean }

function ourView(g: ApiGame): OurView | null {
  const homeIsOurs = g.home_team?.is_external === false
  const awayIsOurs = g.away_team?.is_external === false
  if (!homeIsOurs && !awayIsOurs) return null   // 팀 정보가 없거나 둘 다 외부 — 집계에서 뺀다
  const ourScore = (homeIsOurs ? g.home_score : g.away_score) ?? 0
  const oppScore = (homeIsOurs ? g.away_score : g.home_score) ?? 0
  const oppName = (homeIsOurs ? g.away_team?.name : g.home_team?.name) ?? '상대 미지정'
  return { ourScore, oppScore, oppName, played: ourScore > 0 || oppScore > 0 }
}

function summarize(games: ApiGame[]): { record: string; placement: string } | null {
  const rows = games.map(ourView).filter((v): v is OurView => !!v)
  const played = rows.filter(v => v.played)
  if (played.length === 0) return null

  const wins = played.filter(v => v.ourScore > v.oppScore).length
  const losses = played.filter(v => v.ourScore < v.oppScore).length
  const record = `${wins}승 ${losses}패`

  // 성적은 "치른 경기 중 가장 깊이 간 라운드"로 정한다.
  const withRound = games
    .map(g => ({ g, v: ourView(g) }))
    .filter(x => x.v?.played && x.g.round_label)
    .sort((a, b) => (ROUND_ORDER[b.g.round_label!] ?? 0) - (ROUND_ORDER[a.g.round_label!] ?? 0))
  if (withRound.length === 0) return { record, placement: '' }

  const top = withRound[0]
  const won = top.v!.ourScore > top.v!.oppScore
  let placement = ''
  if (top.g.round_label === '결승') placement = won ? '🏆 우승' : '준우승'
  else if (!won) placement = `${top.g.round_label} 탈락`
  return { record, placement }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '날짜 미정'
  const d = new Date(iso + 'T00:00:00')
  const dow = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
  return `${d.getMonth() + 1}.${d.getDate()}(${dow})`
}

function fmtPeriod(start: string | null, end: string | null): string {
  if (!start) return '기간 미정'
  if (!end || end === start) return fmtDate(start)
  return `${fmtDate(start)} ~ ${fmtDate(end)}`
}

export default function TournamentSchedule({ leagueId, base }: { leagueId: string; base: string }) {
  const { isEditMode, leagueHeaders, openPinModal } = useLeagueEditMode()
  const [quarters, setQuarters] = useState<ApiQuarter[] | null>(null)
  const [games, setGames] = useState<ApiGame[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [sortDesc, setSortDesc] = useState(true)

  const [editingT, setEditingT] = useState<TournamentDraft | null>(null)
  const [gameFor, setGameFor] = useState<{ q: ApiQuarter; initial?: TournamentGameDraft } | null>(null)
  const [rosterQuarter, setRosterQuarter] = useState<ApiQuarter | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [qRes, gRes] = await Promise.all([
        fetch(`/api/leagues/${leagueId}/quarters`, { headers: leagueHeaders, cache: 'no-store' }),
        fetch(`/api/leagues/${leagueId}/games?withVideos=1`, { headers: leagueHeaders, cache: 'no-store' }),
      ])
      setQuarters(qRes.ok ? await qRes.json() : [])
      setGames(gRes.ok ? await gRes.json() : [])
    } catch {
      setQuarters([]); setGames([])
    }
    // leagueHeaders 는 매 렌더 새 객체라 의존성에 넣으면 무한 재조회가 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId])

  useEffect(() => { load() }, [load, isEditMode])

  // 대회 홈의 「경기 목록」 링크가 `?quarter=<id>` 로 들어온다 — 그 대회를 펼쳐 준다.
  //   안 펼치면 링크를 눌러도 접힌 목록만 보여 "눌렀는데 아무 일도 안 일어난" 것처럼 읽힌다.
  //   ⚠ useSearchParams 대신 location 을 쓴다 — 최초 1회만 필요하고, 이 화면은 Suspense
  //     경계 안에 있긴 하지만 훅을 늘리지 않는 편이 단순하다.
  const deepLinkRef = useRef(false)
  useEffect(() => {
    if (deepLinkRef.current || quarters === null) return
    deepLinkRef.current = true
    const q = new URLSearchParams(window.location.search).get('quarter')
    if (q && quarters.some(x => x.id === q)) setExpanded(q)
  }, [quarters])

  const tournaments = (quarters ?? [])
    .filter(q => q.kind === 'tournament')
    .sort((a, b) => {
      const d = (b.start_date ?? '').localeCompare(a.start_date ?? '')
      return (sortDesc ? d : -d) || (a.name ?? '').localeCompare(b.name ?? '', 'ko')
    })

  const knownOpponents = Array.from(new Set(
    games.flatMap(g => [g.home_team, g.away_team])
      .filter((t): t is NonNullable<ApiTeam> => !!t && t.is_external === true)
      .map(t => t.name)
      .filter((n): n is string => !!n),
  )).sort((a, b) => a.localeCompare(b, 'ko'))

  async function removeTournament(q: ApiQuarter, gameCount: number) {
    if (busyId) return
    if (gameCount > 0) {
      toast.error(`경기 ${gameCount}건이 등록된 대회입니다`, { description: '경기를 먼저 삭제해야 대회를 지울 수 있습니다' })
      return
    }
    if (!window.confirm(`"${q.name ?? '이 대회'}" 를 삭제하시겠습니까?`)) return
    setBusyId(q.id)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/quarters?quarterId=${q.id}`, { method: 'DELETE', headers: leagueHeaders })
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `삭제 실패 (${res.status})`)
      toast.success('대회를 삭제했습니다')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패')
    } finally { setBusyId(null) }
  }

  async function removeGame(g: ApiGame) {
    if (busyId) return
    const v = ourView(g)
    if (!window.confirm(`${fmtDate(g.date)} vs ${v?.oppName ?? '상대'} 경기를 삭제하시겠습니까?`)) return
    setBusyId(g.id)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/games?gameId=${g.id}`, { method: 'DELETE', headers: leagueHeaders })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        // 409 = 기록이 있는 경기. 지우면 그 기록이 영구 소멸하므로 서버가 막는다.
        throw new Error(j?.error ?? `삭제 실패 (${res.status})`)
      }
      toast.success('경기를 삭제했습니다')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '삭제 실패', { duration: 7000 })
    } finally { setBusyId(null) }
  }

  if (quarters === null) {
    return <div className="flex justify-center py-16"><BasketballLoader size={24} /></div>
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-5"
        style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}
      >
        <div className="min-w-0">
          <h2 className="font-bold" style={{ color: 'var(--mm-ink)', fontSize: 28, letterSpacing: '-0.005em' }}>
            대회 관리
          </h2>
          <p className="text-xs mt-1 font-bold break-keep" style={{ color: 'var(--mm-muted)' }}>
            대회 {tournaments.length}개 · 경기 {games.filter(g => g.quarter_id).length}건
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setSortDesc(v => !v)}
            title="정렬 순서 변경"
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3 text-xs font-bold rounded-sm cursor-pointer transition-colors duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
            style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}
          >
            <ArrowUpDown size={14} aria-hidden />
            {sortDesc ? '최신순' : '오래된순'}
          </button>
          {isEditMode ? (
            <button
              type="button"
              onClick={() => setEditingT({ name: '', start_date: null, end_date: null, tournament_type: null, description: null })}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 text-sm font-black rounded-sm cursor-pointer transition-colors duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
              style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-yellow)' }}
            >
              <Plus size={16} aria-hidden />
              대회 추가
            </button>
          ) : (
            <button
              type="button"
              onClick={openPinModal}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-4 text-xs font-bold rounded-sm cursor-pointer transition-colors duration-200 hover:brightness-95"
              style={{ background: 'var(--mm-panel)', color: 'var(--mm-muted)', border: '1px solid var(--mm-rule)' }}
            >
              <Lock size={14} aria-hidden />
              편집 모드
            </button>
          )}
        </div>
      </div>

      {tournaments.length === 0 ? (
        <EmptyState
          Icon={Trophy}
          title="등록된 대회가 없습니다"
          description="대회를 추가한 뒤 그 안에 경기를 등록하면 여기에 목록으로 표시됩니다."
          isEditMode={isEditMode}
          editorHint="위 “대회 추가” 로 대회명과 기간을 넣으세요. 일정은 자동으로 만들어지지 않습니다 — 경기를 등록한 날짜만 일정에 잡힙니다."
          size="lg"
        />
      ) : (
        <div className="space-y-3">
          {tournaments.map(q => {
            const qGames = games
              .filter(g => g.quarter_id === q.id)
              .sort((a, b) => {
                const r = (ROUND_ORDER[b.round_label ?? ''] ?? 0) - (ROUND_ORDER[a.round_label ?? ''] ?? 0)
                return r || b.date.localeCompare(a.date) || (a.slot_num ?? 0) - (b.slot_num ?? 0)
              })
            const summary = summarize(qGames)
            const open = expanded === q.id
            const champion = summary?.placement.includes('우승') && !summary.placement.includes('준우승')

            return (
              <div
                key={q.id}
                style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 4 }}
              >
                {/* 대회 헤더 */}
                <div className="flex items-start justify-between gap-2 p-4 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : q.id)}
                    aria-expanded={open}
                    aria-label={`${q.name ?? '대회'} 경기 목록 ${open ? '접기' : '펼치기'}`}
                    className="flex items-start gap-3 text-left cursor-pointer min-w-0 flex-1 min-h-[44px]"
                  >
                    {open
                      ? <ChevronUp size={20} className="shrink-0 mt-0.5" style={{ color: 'var(--mm-muted)' }} aria-hidden />
                      : <ChevronDown size={20} className="shrink-0 mt-0.5" style={{ color: 'var(--mm-muted)' }} aria-hidden />}
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-lg break-keep" style={{ color: 'var(--mm-ink)', lineHeight: 1.25 }}>
                          {q.name ?? '이름 없는 대회'}
                        </span>
                        {champion && <Trophy size={16} className="shrink-0" style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden />}
                      </span>
                      <span className="mt-1 flex items-center gap-2 flex-wrap text-[11px] font-bold" style={{ color: 'var(--mm-muted)' }}>
                        <span className="inline-flex items-center gap-1">
                          <CalendarRange size={14} aria-hidden />
                          {fmtPeriod(q.start_date, q.end_date)}
                        </span>
                        {q.tournament_type && <span>· {TYPE_LABELS[q.tournament_type] ?? q.tournament_type}</span>}
                        <span>· 경기 {qGames.length}건</span>
                        {summary && (
                          <>
                            <span style={{ color: 'var(--mm-ink-soft)' }}>· {summary.record}</span>
                            {summary.placement && (
                              <span
                                className="px-1.5 py-px rounded-sm"
                                style={{
                                  background: champion ? 'var(--mm-yellow)' : 'var(--mm-panel-alt)',
                                  color: champion ? 'var(--mm-black)' : 'var(--mm-ink-soft)',
                                  border: `1px solid ${champion ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
                                }}
                              >
                                {summary.placement}
                              </span>
                            )}
                          </>
                        )}
                      </span>
                    </span>
                  </button>

                  {isEditMode && (
                    <div className="flex items-center gap-1 flex-wrap shrink-0">
                      <Action Icon={Plus} label="경기 추가" ariaLabel={`${q.name ?? '대회'} 경기 추가`}
                        primary onClick={() => setGameFor({ q })} />
                      <Action Icon={UserCheck} label="참가 등록" ariaLabel={`${q.name ?? '대회'} 참가 인원 등록`}
                        onClick={() => setRosterQuarter(q)} />
                      <Action Icon={Pencil} label="수정" ariaLabel={`${q.name ?? '대회'} 정보 수정`}
                        onClick={() => setEditingT({
                          id: q.id, name: q.name ?? '', start_date: q.start_date, end_date: q.end_date,
                          tournament_type: q.tournament_type ?? null, description: q.description ?? null,
                        })} />
                      <Action Icon={Trash2} label="삭제" ariaLabel={`${q.name ?? '대회'} 삭제`}
                        disabled={busyId === q.id} onClick={() => removeTournament(q, qGames.length)} />
                    </div>
                  )}
                </div>

                {/* 경기 목록 */}
                {open && (
                  <div style={{ borderTop: '1px solid var(--mm-rule)' }}>
                    {qGames.length === 0 ? (
                      <p className="text-center py-6 text-sm" style={{ color: 'var(--mm-muted)' }}>
                        등록된 경기가 없습니다{isEditMode ? ' — 위 “경기 추가” 로 상대팀과 날짜를 넣으세요' : ''}
                      </p>
                    ) : (
                      <ul className="list-none p-0 m-0">
                        {qGames.map(g => {
                          const v = ourView(g)
                          const vq = g.video_quarters ?? []
                          const won = v ? v.ourScore > v.oppScore : false
                          return (
                            <li
                              key={g.id}
                              className="flex items-start justify-between gap-2 px-4 sm:px-5 py-3 flex-wrap"
                              style={{ borderTop: '1px solid var(--mm-rule)' }}
                            >
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                {g.round_label && (
                                  <span
                                    className="text-[11px] font-bold px-1.5 py-0.5 rounded-sm shrink-0"
                                    style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}
                                  >
                                    {g.round_label}
                                  </span>
                                )}
                                <span className="text-sm font-bold" style={{ color: 'var(--mm-ink-soft)' }}>{fmtDate(g.date)}</span>
                                <span className="text-sm font-bold break-keep" style={{ color: 'var(--mm-ink)' }}>
                                  vs {v?.oppName ?? '상대 미지정'}
                                </span>
                                {g.venue && <span className="text-[11px]" style={{ color: 'var(--mm-muted)' }}>@ {g.venue}</span>}
                                {v?.played && (
                                  <span
                                    className="text-sm font-black"
                                    style={{ color: won ? 'var(--mm-positive, #16a34a)' : 'var(--mm-live, #dc2626)' }}
                                  >
                                    {v.ourScore} - {v.oppScore} ({won ? 'W' : 'L'})
                                  </span>
                                )}
                                {g.is_complete && (
                                  <span className="text-[11px] font-bold" style={{ color: 'var(--mm-muted)' }}>마감</span>
                                )}
                                {/* 쿼터 영상 진행도 — 대회는 촬영본이 쿼터로 쪼개져 올라온다 */}
                                <span
                                  className="inline-flex items-center gap-1 text-[11px] font-bold shrink-0"
                                  style={{ color: vq.length > 0 ? 'var(--mm-ink-soft)' : 'var(--mm-muted)' }}
                                  title={vq.length > 0 ? `연결된 쿼터: ${vq.join('·')}쿼터` : '연결된 영상 없음'}
                                >
                                  <Youtube size={14} aria-hidden />
                                  영상 {vq.length}/4
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
                                {/* 박스스코어 — 리그에서는 '일정·결과'의 날짜 카드가 진입점이었는데,
                                    대회는 이 화면이 그 자리를 대신하므로 여기에 둔다.
                                    안 두면 기록을 해도 결과를 볼 길이 없다(2026-08-31 사용자 지적). */}
                                {g.is_started && (
                                  <Link
                                    href={`${base}/boxscore/${g.date}?game=${g.id}`}
                                    aria-label={`${fmtDate(g.date)} vs ${v?.oppName ?? '상대'} 박스스코어`}
                                    className="inline-flex items-center gap-1 min-h-[44px] px-2.5 text-[11px] font-bold whitespace-nowrap rounded-sm cursor-pointer transition-colors duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
                                    style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}
                                  >
                                    <BarChart2 size={14} aria-hidden />
                                    기록지
                                  </Link>
                                )}
                                <Link
                                  href={`${base}/record?date=${g.date}&game=${g.id}`}
                                  aria-label={`${fmtDate(g.date)} vs ${v?.oppName ?? '상대'} 기록하기`}
                                  className="inline-flex items-center gap-1 min-h-[44px] px-2.5 text-[11px] font-bold whitespace-nowrap rounded-sm cursor-pointer transition-colors duration-200 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
                                  style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}
                                >
                                  <ClipboardList size={14} aria-hidden />
                                  기록
                                </Link>
                                {isEditMode && (
                                  <>
                                    <Action Icon={Pencil} label="수정" ariaLabel={`${fmtDate(g.date)} 경기 수정`}
                                      onClick={() => setGameFor({
                                        q,
                                        initial: {
                                          id: g.id,
                                          date: g.date,
                                          opponentName: v?.oppName ?? '',
                                          roundLabel: g.round_label,
                                          venue: g.venue,
                                          weAreAway: g.away_team?.is_external === false,
                                          // 기록이 시작된 경기는 날짜·상대를 바꾸면 이벤트의 소속 팀이 어긋난다
                                          locked: !!g.is_started || !!g.is_complete,
                                        },
                                      })} />
                                    <Action Icon={Trash2} label="삭제" ariaLabel={`${fmtDate(g.date)} 경기 삭제`}
                                      disabled={busyId === g.id} onClick={() => removeGame(g)} />
                                  </>
                                )}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editingT && (
        <TournamentFormModal
          leagueId={leagueId}
          initial={editingT.id ? editingT : undefined}
          onClose={() => setEditingT(null)}
          onSaved={load}
        />
      )}

      {gameFor && (
        <TournamentGameFormModal
          leagueId={leagueId}
          quarterId={gameFor.q.id}
          quarterName={gameFor.q.name ?? '대회'}
          startDate={gameFor.q.start_date}
          endDate={gameFor.q.end_date}
          knownOpponents={knownOpponents}
          initial={gameFor.initial}
          onClose={() => setGameFor(null)}
          onSaved={async () => { setExpanded(gameFor.q.id); await load() }}
        />
      )}

      {rosterQuarter && (
        <TournamentRosterPanel
          leagueId={leagueId}
          quarterId={rosterQuarter.id}
          quarterName={rosterQuarter.name ?? '대회'}
          onClose={() => setRosterQuarter(null)}
        />
      )}
    </div>
  )
}

// 목록의 작은 조작 버튼. 여러 곳에 같은 모양이 나오므로 한 곳에 둔다 —
//   따로 쓰면 터치 영역·포커스 링이 버튼마다 어긋난다.
function Action({
  Icon, label, ariaLabel, onClick, disabled, primary,
}: {
  Icon: typeof Plus
  label: string
  ariaLabel: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick() }}
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 min-h-[44px] px-2.5 text-[11px] font-bold whitespace-nowrap rounded-sm cursor-pointer transition-colors duration-200 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow)]"
      style={primary
        ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-yellow)' }
        : { background: 'var(--mm-panel-alt)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}
    >
      <Icon size={14} aria-hidden />
      {label}
    </button>
  )
}
