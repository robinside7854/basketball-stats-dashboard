'use client'
// 드래프트 완료 화면 — 모든 클라이언트에 한 번에 표시.
//
// - 큰 축하 헤더 (트로피 + 리그 이름 + 분기)
// - 팀별 카드 — 색상 강조, 순번 픽 리스트
// - 통계: 총 픽 수, 진행 시간
// - "이미지로 저장" PNG 다운로드 (html-to-image)
// - "닫기" 로 일반 사용자 dismiss; 감독관 노출은 부모가 제어

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Trophy, Download, X, Users, Clock, Crown, Zap, Hourglass, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { seededShuffle } from '@/lib/draft/shuffle'
import Confetti from './Confetti'

interface Team { id: string; name: string; color: string }
interface Pick {
  pick_number: number
  round_number: number
  team_id: string
  player_id: string
  player_name: string
  player_number: number | null
  player_position: string | null
  picked_at: string
}
interface Leader {
  team_id: string
  leader_player_id: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  title: string                 // "MIRACLE DRAFT 2026.3Q 완료!"
  teams: Team[]
  picks: Pick[]
  draftOrder: string[]
  startedAt?: string | null
  completedAt: string | null
  /** pick_number → 그 픽에 걸린 초. 2건 미만이면 시상 스트립·팀 평균을 렌더하지 않는다. */
  pickDurations?: Record<number, number>
  /** 사람이 고르지 않은 픽(타이머 자동픽·마지막 1명 자동 등록) — 최속/최장 시상에서 뺀다 */
  autoPickNumbers?: number[]
  /** 분기별 팀장 — `league_team_quarter_leaders` rows. team 카드 상단 👑 영역에 표시 */
  leaders?: Leader[]
  /** player id → 이름 매핑 (팀장 이름 표시용). 누락된 ID 는 "팀장" 라벨로 fallback */
  playerNames?: Record<string, string>
  /**
   * 픽 순서를 볼 자격이 있는가(코드 인증 단장·감독관). true 여야 토글이 보인다.
   * false 면 토글 없이 항상 숨김 — 단체방에 결과를 먼저 뿌릴 때 순서가 새지 않게.
   * 기본값 false 로 둔 이유: 호출부가 아직 안 넘겼는데 순서가 노출되는 쪽이 더 나쁜 사고다.
   */
  canRevealOrder?: boolean
}

/** 47 → "47초", 92 → "1분 32초" */
function formatSec(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  if (s < 60) return `${s}초`
  return `${Math.floor(s / 60)}분 ${s % 60}초`
}

function formatDuration(startedAt: string | null | undefined, completedAt: string | null): string {
  if (!startedAt || !completedAt) return '—'
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}분 ${s}초`
  return `${s}초`
}

export default function DraftFinalResult({ open, onClose, title, teams, picks, draftOrder, startedAt, completedAt, leaders, playerNames, pickDurations, autoPickNumbers, canRevealOrder = false }: Props) {
  const captureRef = useRef<HTMLDivElement | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [trigger, setTrigger] = useState<number | null>(null)
  // 기본은 숨김(발표 모드). 자격이 있는 사람이 직접 눌러야 순서가 열린다.
  const [orderShown, setOrderShown] = useState(false)

  // 마운트 시 폭죽 — 1회 burst (Confetti 가 자체적으로 stop. trigger 가 같은 값이면 재발화 X)
  useEffect(() => {
    if (open) {
      setTrigger(Date.now())
    } else {
      setTrigger(null) // 닫힐 때 canvas 정리
    }
  }, [open])

  if (!open) return null

  // 순서 숨김이 걸리면 픽 번호·라운드·시상은 물론 "팀이 놓인 자리"까지 지워야 한다.
  // 팀 카드가 draft_order 대로 늘어서 있으면 번호만 지워도 1순위 팀이 그대로 드러난다.
  const hideOrder = !(canRevealOrder && orderShown)
  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const orderedTeams = hideOrder
    ? seededShuffle(teams, `teams:${teams.map(t => t.id).join(',')}`)
    : [
        ...draftOrder.map(id => teamMap[id]).filter(Boolean) as Team[],
        ...teams.filter(t => !draftOrder.includes(t.id)),
      ]
  const picksByTeam: Record<string, Pick[]> = {}
  for (const p of picks) (picksByTeam[p.team_id] ||= []).push(p)
  for (const tid of Object.keys(picksByTeam)) {
    picksByTeam[tid] = hideOrder
      ? seededShuffle(picksByTeam[tid], tid)
      : picksByTeam[tid].sort((a, b) => a.pick_number - b.pick_number)
  }
  const duration = formatDuration(startedAt, completedAt)
  // 팀장 매핑 — team_id → leader_player_id (있는 경우만)
  const leaderByTeam: Record<string, string | null> = {}
  for (const l of leaders ?? []) {
    if (l.leader_player_id) leaderByTeam[l.team_id] = l.leader_player_id
  }
  const nameMap = playerNames ?? {}

  // ── 소요 시간 시상 (pickDurations 가 2건 이상일 때만) ──────────────────────
  // 자동픽(타이머 만료)·마지막 1명 자동 등록은 사람이 고른 게 아니다 — 시상·평균 모두에서 뺀다.
  // (2026-09-16 리허설: 마지막 자동 등록 3초가 "최속 픽"으로 뜬 것이 계기)
  const autoSet = new Set(autoPickNumbers ?? [])
  const timedPicks = picks
    .filter(p => !autoSet.has(p.pick_number))
    .map(p => ({ pick: p, sec: pickDurations?.[p.pick_number] }))
    .filter((e): e is { pick: Pick; sec: number } => typeof e.sec === 'number' && Number.isFinite(e.sec) && e.sec >= 0)
    .sort((a, b) => a.sec - b.sec)
  const hasAwards = timedPicks.length >= 2
  const medianSec = hasAwards ? timedPicks[Math.floor((timedPicks.length - 1) / 2)].sec : 0
  const fastest = hasAwards ? timedPicks[0] : null
  // 1번 픽의 소요 시간은 draft.started_at 기준이라 추첨 연출·규칙 설명 시간이 섞여 들어간다.
  // 중앙값의 3배를 넘으면 '고민'이 아니라 진행 지연으로 보고 최장 고민 후보에서 제외한다.
  // (3배 이내면 정상 범위로 보고 그대로 후보에 포함한다.)
  const slowPool = timedPicks.filter(e => !(e.pick.pick_number === 1 && e.sec > medianSec * 3))
  const slowest = hasAwards
    ? (slowPool.length > 0 ? slowPool[slowPool.length - 1] : timedPicks[timedPicks.length - 1])
    : null
  // 팀별 평균 소요 시간 (기록이 있는 픽만 대상)
  const teamAvgSec: Record<string, number> = {}
  if (hasAwards) {
    const acc: Record<string, { sum: number; n: number }> = {}
    for (const e of timedPicks) {
      const a = (acc[e.pick.team_id] ||= { sum: 0, n: 0 })
      a.sum += e.sec
      a.n += 1
    }
    for (const [tid, a] of Object.entries(acc)) teamAvgSec[tid] = a.sum / a.n
  }

  async function downloadPng() {
    if (!captureRef.current) return
    setDownloading(true)
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(captureRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#0a0a0f',
      })
      const a = document.createElement('a')
      const safeName = title.replace(/[^a-zA-Z0-9가-힣0-9.\-_]/g, '_').slice(0, 80)
      a.href = dataUrl
      a.download = `${safeName || 'draft-result'}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (e) {
      console.error('[final-result] PNG export failed', e)
      toast.error('이미지 저장에 실패했습니다 — 화면 캡처를 사용해 주세요', { duration: 5000, position: 'bottom-center' })
    } finally {
      setDownloading(false)
    }
  }

  return (
    // 1920×1080 에서 「이미지로 저장」·「닫기」가 화면 밖으로 밀려나 있었다(2026-09-16 실측).
    // 루트를 flex column 으로 잡고 카드만 내부 스크롤시켜 버튼을 항상 첫 화면 안에 둔다.
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/85 backdrop-blur-sm p-3 sm:p-4"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      {/* 1회 burst — 3.5s (3차 스태거 200+ particle). trigger 가 같은 값이면 재발화 X */}
      <Confetti trigger={trigger} durationMs={3500} />
      <div className="relative max-w-6xl w-full mx-auto flex flex-col min-h-0 flex-1">
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          aria-label="닫기"
          className="absolute top-0 right-0 sm:top-2 sm:right-2 z-10 min-w-11 min-h-11 rounded-full bg-gray-900/80 border border-gray-700 text-gray-200 hover:bg-gray-800 cursor-pointer flex items-center justify-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          <X size={20} />
        </button>

        {/* 스크롤 래퍼 — 캡처 대상(captureRef)은 높이 제한 밖에 둬야 PNG 가 잘리지 않는다 */}
        <div className="flex-1 min-h-0 overflow-y-auto">
        {/* 캡처 대상 영역 */}
        <div
          ref={captureRef}
          className="rounded-2xl border-2 border-amber-600/60 p-4 sm:p-6 lg:p-8 space-y-4 sm:space-y-6"
          style={{
            background: 'linear-gradient(180deg, #1a1208 0%, #0a0a0f 70%, #050505 100%)',
            boxShadow: '0 0 64px rgba(245,158,11,0.18)',
          }}
        >
          {/* 헤더 */}
          <div className="text-center space-y-2 sm:space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 shadow-[0_0_30px_rgba(245,158,11,0.6)]">
              {/* 아이콘 4단계(14/16/20/24) 예외 — 64/80px 원형 메달 안을 채우는 장식 마크다.
                  24 로 줄이면 원 한가운데 점만 남는다. 원 크기에 맞춘 값. */}
              <Trophy className="w-9 h-9 sm:w-11 sm:h-11 text-white" />
            </div>
            <p className="text-xs sm:text-sm font-black uppercase tracking-[0.3em] text-amber-300">DRAFT COMPLETE</p>
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white break-keep text-balance leading-tight"
              style={{ textShadow: '0 2px 12px rgba(245,158,11,0.4)' }}>
              {title}
            </h1>
            <div className="flex items-center justify-center gap-3 flex-wrap text-sm sm:text-base text-amber-100/90">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/50 border border-amber-700/40">
                <Users size={14} /> {teams.length}팀
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/50 border border-amber-700/40 tabular-nums">
                #{picks.length}픽
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/50 border border-amber-700/40 tabular-nums">
                <Clock size={14} /> {duration}
              </span>
            </div>
          </div>

          {/* 팀별 로스터 카드 그리드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {orderedTeams.map((t, idx) => {
              const list = picksByTeam[t.id] ?? []
              const leaderId = leaderByTeam[t.id]
              const leaderName = leaderId ? (nameMap[leaderId] ?? '팀장') : null
              // 팀 인원수 — 팀장이 있으면 +1 (팀장이 픽으로도 들어갈 수 있어 중복 방지)
              const leaderIsPicked = leaderId && list.some(p => p.player_id === leaderId)
              const totalMembers = list.length + (leaderName && !leaderIsPicked ? 1 : 0)
              return (
                <div
                  key={t.id}
                  className="rounded-xl border-2 p-3 sm:p-4 min-w-0 backdrop-blur-sm"
                  style={{
                    borderColor: t.color,
                    background: `linear-gradient(180deg, ${t.color}1A 0%, rgba(10,10,15,0.85) 90%)`,
                    boxShadow: `0 0 0 1px ${t.color}33, 0 4px 24px ${t.color}26`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-3 min-w-0">
                    {!hideOrder && (
                      <span className="text-xl sm:text-2xl font-black tabular-nums shrink-0"
                        style={{ color: t.color, fontFamily: 'var(--font-bebas, system-ui, sans-serif)' }}>
                        {idx + 1}
                      </span>
                    )}
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                    <h3 className="text-base sm:text-lg lg:text-xl font-black text-white truncate break-keep min-w-0">{t.name}</h3>
                    <span className="ml-auto flex items-center gap-2 shrink-0">
                      {typeof teamAvgSec[t.id] === 'number' && (
                        <span className="text-sm font-mono tabular-nums text-gray-300">평균 {formatSec(teamAvgSec[t.id])}</span>
                      )}
                      <span className="text-xs sm:text-sm font-mono tabular-nums text-gray-300">{totalMembers}명</span>
                    </span>
                  </div>
                  {/* 팀장 라인 — 카드 최상단에 강조 표시 */}
                  {leaderName && (
                    <div
                      className="flex items-center gap-2 px-2.5 py-2 mb-2 rounded-lg border min-w-0"
                      style={{
                        background: `linear-gradient(90deg, ${t.color}26 0%, rgba(245,158,11,0.10) 100%)`,
                        borderColor: `${t.color}66`,
                      }}
                    >
                      <Crown size={14} className="text-amber-300 shrink-0" />
                      <span
                        className="text-sm font-black uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: t.color, color: '#0a0a0a' }}
                      >
                        팀장
                      </span>
                      <span className="text-white font-bold text-sm sm:text-base truncate break-keep min-w-0">
                        {leaderName}
                      </span>
                    </div>
                  )}
                  {list.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">{leaderName ? '추가 픽 없음' : '픽 없음'}</p>
                  ) : (
                    <div className="space-y-1">
                      {list.map(p => (
                        <div key={p.pick_number} className="flex items-center gap-1.5 min-w-0">
                          {!hideOrder && (
                            <span className="text-sm font-mono tabular-nums w-8 shrink-0 text-gray-400">#{p.pick_number}</span>
                          )}
                          {p.player_number != null && (
                            <span className="text-amber-300 font-mono font-bold w-8 shrink-0 text-xs sm:text-sm tabular-nums">#{p.player_number}</span>
                          )}
                          <span className="text-white font-bold text-sm sm:text-base truncate min-w-0 break-keep flex-1">{p.player_name}</span>
                          {p.player_position && (
                            <span className="text-sm text-gray-300 font-mono shrink-0">
                              {p.player_position.split(',').map(s => s.trim()).join('·')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 소요 시간 시상 — 캡처 영역(captureRef) 안이라 저장된 PNG 에도 함께 담긴다.
              클릭 대상이 아니라 높이는 32px 이상이면 충분. */}
          {/* 최속/최장 시상은 픽 번호를 그대로 부르는 것과 같다 — 숨김 모드에서는 통째로 뺀다. */}
          {!hideOrder && fastest && slowest && (
            <div className="flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
              {([
                { key: 'fast', icon: Zap, label: '최속 픽', entry: fastest },
                // 후보가 1건만 남아 최속·최장이 같은 픽이 되면 같은 칩 두 개가 뜨므로 최장을 뺀다.
                ...(slowest.pick.pick_number === fastest.pick.pick_number
                  ? []
                  : [{ key: 'slow', icon: Hourglass, label: '최장 고민', entry: slowest }]),
              ] as const).map(({ key, icon: Icon, label, entry }) => {
                const teamColor = teamMap[entry.pick.team_id]?.color ?? '#9ca3af'
                const teamName = teamMap[entry.pick.team_id]?.name ?? '—'
                return (
                  <span
                    key={key}
                    className="inline-flex items-center gap-2 min-h-8 px-3 py-1.5 rounded-lg border min-w-0"
                    style={{ background: '#101018', borderColor: `${teamColor}66` }}
                  >
                    <Icon size={20} className="shrink-0" style={{ color: teamColor }} aria-hidden />
                    <span className="text-sm sm:text-base text-gray-100 truncate break-keep min-w-0">
                      <span className="font-black" style={{ color: teamColor }}>{label}</span>
                      <span className="text-gray-400 mx-1.5">·</span>
                      <span className="font-bold">{entry.pick.player_name}</span>
                      <span className="font-mono tabular-nums ml-1.5">{formatSec(entry.sec)}</span>
                      <span className="text-gray-400 ml-1.5">({teamName})</span>
                    </span>
                  </span>
                )
              })}
            </div>
          )}

          {/* 푸터 */}
          <div className="text-center text-xs sm:text-sm text-gray-400 pt-2">
            Generated by 미라클 농구 드래프트 시스템 · {new Date().toLocaleDateString('ko-KR')}
          </div>
        </div>
        </div>

        {/* 액션 — 캡처 영역 바깥. flex column 의 고정 footer 라 스크롤과 무관하게 항상 보인다. */}
        <div className="mt-3 shrink-0 flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
          {/* 캡처 영역(captureRef) 바깥이라 버튼 자체는 PNG 에 안 담기지만,
              토글 상태는 캡처 대상 DOM 을 바꾸므로 저장된 이미지에 그대로 반영된다. */}
          {canRevealOrder && (
            <Button
              onClick={() => setOrderShown(v => !v)}
              variant="outline"
              aria-pressed={orderShown}
              className="bg-gray-900 border-gray-700 text-gray-100 hover:bg-gray-800 text-base sm:text-lg min-h-11 h-12 sm:h-14 px-5 font-bold cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
            >
              {orderShown
                ? <><Eye size={20} className="mr-2" /> 픽 순서 표시</>
                : <><EyeOff size={20} className="mr-2" /> 픽 순서 숨김</>}
            </Button>
          )}
          <Button
            onClick={downloadPng}
            disabled={downloading}
            className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-black text-base sm:text-lg min-h-11 h-12 sm:h-14 px-6 sm:px-8 shadow-2xl cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <Download size={20} className="mr-2" />
            {downloading ? '저장 중...' : '이미지로 저장'}
          </Button>
          <Button
            onClick={onClose}
            variant="outline"
            className="bg-gray-900 border-gray-700 text-gray-100 hover:bg-gray-800 text-base sm:text-lg min-h-11 h-12 sm:h-14 px-5 sm:px-6 font-bold cursor-pointer transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            닫기
          </Button>
        </div>
      </div>
    </div>
  )
}
