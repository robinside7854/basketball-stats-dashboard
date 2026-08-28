'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { Dumbbell, Target, BarChart3, Ruler } from 'lucide-react'
import { Basketball } from '@/components/league/BasketballIcons'
import { sortJerseyNum } from '@/lib/utils'
import { useTeam } from '@/contexts/TeamContext'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const PlayerDetailModal = dynamic(() => import('@/components/roster/PlayerDetailModal'), { ssr: false })
import type { Tournament, PlayerBoxScore } from '@/types/database'
import { CLUB_BASELINE, baselineCaption, type PctKind } from '@/lib/stats/shootingBaseline'

// 성공률 셀 색 — 기준선은 `@/lib/stats/shootingBaseline` 한 곳에서만 온다.
// 예전에는 40/33/70 이 이 파일에 하드코딩돼 있었는데, 그 값들은 프로 기준이라
// 우리 팀 실측(FG 37.5 · 3P 25.7 · FT 64.2)에 대면 사실상 전원이 노랑이었다.
const PCT_KIND: Record<string, PctKind | undefined> = {
  fg_pct: 'fg',
  fg3_pct: 'fg3',
  ft_pct: 'ft',
}

function pctClass(n: number, kind?: PctKind): string {
  if (n <= 0) return 'text-[var(--mm-muted)]'
  // 기준선을 정한 적 없는 지표(eFG%·TS%)는 칠하지 않는다 — 근거 없이 감점하지 않기 위해서다
  if (!kind) return 'text-[var(--mm-ink)]'
  return n >= CLUB_BASELINE[kind] ? 'text-green-400' : 'text-[var(--mm-yellow-strong)]'
}

// 합작 듀오 카드용 프로필 사진 — 3:4 비율 · 검정 테두리 · 음수 마진 겹침(깊이감)
// (모듈 최상단 정의: 페이지 함수 안에 두면 리렌더마다 unmount 된다)
function DuoPhoto({ url, name, number, overlap = false }: {
  url?: string | null; name: string; number: string; overlap?: boolean
}) {
  return (
    <div
      className="overflow-hidden relative shrink-0"
      style={{
        width: 'clamp(58px, 15vw, 96px)',
        aspectRatio: '3 / 4',
        border: '2px solid #000',
        background: '#0f172a',
        // 컨테이너(rounded-xl)보다 타이트한 radius — 안쪽 요소일수록 좁게
        borderRadius: '6px',
        // 순수 검정 대신 배경 색조(slate-950)로 틴트한 그림자
        boxShadow: '3px 3px 0 rgba(2, 6, 23, 0.65)',
        marginLeft: overlap ? 'clamp(-20px, -5vw, -13px)' : undefined,
        zIndex: overlap ? 1 : 0,
      }}
    >
      {url ? (
        <Image src={url} alt={name} fill sizes="(max-width: 640px) 15vw, 96px" className="object-cover object-top" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-sm font-black text-gray-500" aria-label={name}>
          {number}
        </div>
      )}
    </div>
  )
}

// 부문별 리더 카드 아이콘 — 이모지 대신 lucide/자체 SVG (UI 아이콘에 이모지 사용 금지 규칙)
// 🤝(어시스트)와 3️⃣(3점)는 매핑에 적합한 lucide 아이콘이 없어 콘텐츠성 심볼로 유지
function LeaderIcon({ icon }: { icon: string }) {
  const cls = 'mx-auto mb-1'
  if (icon === 'ball') return <Basketball size={20} className={cls} />
  if (icon === 'dumbbell') return <Dumbbell size={20} className={cls} aria-hidden />
  if (icon === 'target') return <Target size={20} className={cls} aria-hidden />
  if (icon === 'chart') return <BarChart3 size={20} className={cls} aria-hidden />
  return <div className="text-2xl mb-1" aria-hidden>{icon}</div>
}

// 순위 뱃지 색 — 이모지 메달 대신 숫자 칩 (UI 아이콘에 이모지 사용 금지 규칙)
const RANK_STYLE: Record<number, React.CSSProperties> = {
  0: { background: '#f59e0b', color: '#000' },   // 금
  1: { background: '#cbd5e1', color: '#000' },   // 은
  2: { background: '#b45309', color: '#fff' },   // 동
}
const RANK_DEFAULT: React.CSSProperties = { background: '#1f2937', color: '#9ca3af' }

interface AssistPlayer { id: string; name: string; number: string; photo_url?: string | null }
interface ScorerStat {
  playerId: string; playerName: string; playerNumber: string
  totalFgm: number; assistedFgm: number; assistedPts: number; unassistedPts: number
  assistedRatio: number; byType: Record<string, number>; unassistedByType: Record<string, number>
}
interface AssistData {
  players: AssistPlayer[]
  matrix: Record<string, Record<string, number>>
  topPairs: { assister: AssistPlayer; scorer: AssistPlayer; count: number }[]
  scorerStats: ScorerStat[]
  shotTypeBreakdown: Record<string, number>
  shotLabels: Record<string, string>
}

interface SeasonPlayer extends PlayerBoxScore {
  pts_avg: number; reb_avg: number; ast_avg: number; games_played: number
  usg_pct: number
  eff: number
}

type ViewMode = 'avg' | 'vol' | 'per36'

const GAME_MINUTES = 28

function toPer36(perGameValue: number): number {
  return Math.round((perGameValue / GAME_MINUTES) * 36 * 10) / 10
}

export default function StatsPage() {
  const team = useTeam()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [selectedTId, setSelectedTId] = useState('all')
  const [players, setPlayers] = useState<SeasonPlayer[]>([])
  const [viewMode, setViewMode] = useState<ViewMode>('avg')
  const [sortKey, setSortKey] = useState<keyof SeasonPlayer>('pts_avg')
  const [playerModal, setPlayerModal] = useState<string | null>(null)
  const [assistData, setAssistData] = useState<AssistData | null>(null)

  useEffect(() => { fetch(`/api/tournaments?team=${team}`).then(r => r.json()).then(setTournaments) }, [team])
  useEffect(() => {
    const tParam = selectedTId !== 'all' ? `&tournamentId=${selectedTId}` : ''
    fetch(`/api/stats/assists?team=${team}${tParam}`).then(r => r.json()).then(setAssistData)
  }, [selectedTId, team])

  useEffect(() => {
    const tParam = selectedTId !== 'all' ? `&tournamentId=${selectedTId}` : ''
    fetch(`/api/stats/season?team=${team}${tParam}`).then(r => r.json()).then(d => {
      const raw = d.players || []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const withEff = raw.map((p: any) => {
        const gp = p.games_played || 1
        const positive = p.pts_avg + p.reb_avg + p.ast_avg + (p.stl ?? 0) / gp + (p.blk ?? 0) / gp
        const negative = ((p.fga ?? 0) - (p.fgm ?? 0)) / gp + ((p.fta ?? 0) - (p.ftm ?? 0)) / gp + (p.tov ?? 0) / gp
        return { ...p, eff: Math.round((positive - negative) * 10) / 10 }
      })
      setPlayers(withEff)
    })
  }, [selectedTId, team])

  function switchMode(mode: ViewMode) {
    setViewMode(mode)
    setSortKey(mode === 'avg' || mode === 'per36' ? 'pts_avg' : 'pts')
  }

  const sorted = [...players].sort((a, b) => {
    if (sortKey === 'player_number') return sortJerseyNum(a.player_number, b.player_number)
    return (Number(b[sortKey]) || 0) - (Number(a[sortKey]) || 0)
  })

  const leaders = [
    { label: '득점왕', key: 'pts_avg', unit: 'PPG', icon: 'ball' },
    { label: '리바운드왕', key: 'reb_avg', unit: 'RPG', icon: 'dumbbell' },
    { label: '어시스트왕', key: 'ast_avg', unit: 'APG', icon: '🤝' },
    { label: 'FG%', key: 'fg_pct', unit: '%', icon: 'target' },
    { label: '3P%', key: 'fg3_pct', unit: '%', icon: '3️⃣' },
    { label: 'TS%', key: 'ts_pct', unit: '%', icon: 'chart' },
  ] as const

  const avgCols: { key: keyof SeasonPlayer; label: string }[] = [
    { key: 'player_number', label: '#' },
    { key: 'player_name', label: '이름' },
    { key: 'games_played', label: 'GP' },
    { key: 'pts_avg', label: 'PPG' },
    { key: 'reb_avg', label: 'RPG' },
    { key: 'ast_avg', label: 'APG' },
    { key: 'usg_pct', label: 'USG%' },
    { key: 'fg_pct', label: 'FG%' },
    { key: 'fg3_pct', label: '3P%' },
    { key: 'ft_pct', label: 'FT%' },
    { key: 'efg_pct', label: 'eFG%' },
    { key: 'ts_pct', label: 'TS%' },
    { key: 'ast_tov', label: 'A/T' },
    { key: 'stl', label: 'STL' },
    { key: 'blk', label: 'BLK' },
    { key: 'eff', label: 'EFF' },
  ]

  const per36Cols: { key: keyof SeasonPlayer; label: string }[] = [
    { key: 'player_number', label: '#' },
    { key: 'player_name', label: '이름' },
    { key: 'games_played', label: 'GP' },
    { key: 'pts_avg', label: 'P/36' },
    { key: 'reb_avg', label: 'R/36' },
    { key: 'ast_avg', label: 'A/36' },
    { key: 'fg_pct', label: 'FG%' },
    { key: 'fg3_pct', label: '3P%' },
    { key: 'ft_pct', label: 'FT%' },
    { key: 'ts_pct', label: 'TS%' },
    { key: 'stl', label: 'S/36' },
    { key: 'blk', label: 'B/36' },
  ]

  const volCols: { key: keyof SeasonPlayer; label: string }[] = [
    { key: 'player_number', label: '#' },
    { key: 'player_name', label: '이름' },
    { key: 'games_played', label: 'GP' },
    { key: 'pts', label: 'PTS' },
    { key: 'reb', label: 'REB' },
    { key: 'ast', label: 'AST' },
    { key: 'stl', label: 'STL' },
    { key: 'blk', label: 'BLK' },
    { key: 'tov', label: 'TOV' },
    { key: 'fgm', label: 'FGM' },
    { key: 'fga', label: 'FGA' },
    { key: 'fg3m', label: '3PM' },
    { key: 'fg3a', label: '3PA' },
    { key: 'ftm', label: 'FTM' },
    { key: 'fta', label: 'FTA' },
    { key: 'oreb', label: 'OR' },
    { key: 'dreb', label: 'DR' },
  ]

  const cols = viewMode === 'avg' ? avgCols : viewMode === 'per36' ? per36Cols : volCols

  function NameCell({ s }: { s: SeasonPlayer }) {
    return (
      <td className="px-2 py-2 text-left whitespace-nowrap">
        <button
          onClick={() => setPlayerModal(s.player_id)}
          className="font-medium hover:text-[var(--mm-yellow-strong)] hover:underline underline-offset-2 transition-colors cursor-pointer"
        >
          {s.player_name}
        </button>
      </td>
    )
  }

  function renderCell(s: SeasonPlayer, key: keyof SeasonPlayer) {
    const v = s[key]
    if (key === 'player_number') return <td key={key} className="px-2 py-2 font-bold text-[var(--mm-ink)]">{v as string}</td>
    if (key === 'player_name') return <NameCell key={key} s={s} />
    if (key === 'games_played') return <td key={key} className="px-2 py-2 text-[var(--mm-muted)]">{v as number}</td>

    const n = Number(v) || 0
    const gp = s.games_played || 1

    if (viewMode === 'per36') {
      if (['fg_pct', 'fg3_pct', 'ft_pct', 'ts_pct'].includes(key as string)) {
        return <td key={key} className={`px-2 py-2 font-medium ${pctClass(n, PCT_KIND[key as string])}`}>
          {n > 0 ? n.toFixed(1) : '-'}
        </td>
      }
      if (key === 'pts_avg') return <td key={key} className="px-2 py-2 font-bold text-[var(--mm-ink)]">{toPer36(n)}</td>
      if (key === 'reb_avg') return <td key={key} className="px-2 py-2">{toPer36(n)}</td>
      if (key === 'ast_avg') return <td key={key} className="px-2 py-2 text-[var(--mm-ink)]">{toPer36(n)}</td>
      if (key === 'stl') return <td key={key} className="px-2 py-2 text-green-400">{toPer36(n / gp)}</td>
      if (key === 'blk') return <td key={key} className="px-2 py-2 text-indigo-400">{toPer36(n / gp)}</td>
      return <td key={key} className="px-2 py-2">{n > 0 ? n.toFixed(1) : '-'}</td>
    }

    if (viewMode === 'avg') {
      if (key === 'pts_avg') return <td key={key} className="px-2 py-2 font-bold text-[var(--mm-ink)]">{n.toFixed(1)}</td>
      if (key === 'reb_avg') return <td key={key} className="px-2 py-2">{n.toFixed(1)}</td>
      if (key === 'ast_avg') return <td key={key} className="px-2 py-2 text-[var(--mm-ink)]">{n.toFixed(1)}</td>
      if (key === 'usg_pct') return <td key={key} className="px-2 py-2 text-purple-400">{n > 0 ? n.toFixed(1) : '-'}</td>
      if (key === 'stl') return <td key={key} className="px-2 py-2 text-green-400">{n}</td>
      if (key === 'blk') return <td key={key} className="px-2 py-2 text-indigo-400">{n}</td>
      if (key === 'fg_pct' || key === 'fg3_pct' || key === 'ft_pct')
        return <td key={key} className={`px-2 py-2 font-medium ${pctClass(n, PCT_KIND[key])}`}>{n > 0 ? n.toFixed(1) : '-'}</td>
      if (key === 'eff') return <td key={key} className={`px-2 py-2 font-bold ${n >= 10 ? 'text-[var(--mm-yellow-strong)]' : n >= 0 ? 'text-[var(--mm-ink)]' : 'text-red-400'}`}>{n.toFixed(1)}</td>
      if (['efg_pct','ts_pct','ast_tov'].includes(key as string))
        return <td key={key} className="px-2 py-2">{n > 0 ? n.toFixed(1) : '-'}</td>
    } else {
      if (key === 'pts') return <td key={key} className="px-2 py-2 font-bold text-[var(--mm-ink)]">{n}</td>
      if (key === 'reb') return <td key={key} className="px-2 py-2">{n}</td>
      if (key === 'ast') return <td key={key} className="px-2 py-2 text-[var(--mm-ink)]">{n}</td>
      if (key === 'stl') return <td key={key} className="px-2 py-2 text-green-400">{n}</td>
      if (key === 'blk') return <td key={key} className="px-2 py-2 text-indigo-400">{n}</td>
      if (key === 'tov') return <td key={key} className="px-2 py-2 text-red-400">{n}</td>
    }
    return <td key={key} className="px-2 py-2">{n}</td>
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <h1 className="text-2xl font-bold shrink-0">시즌 스탯</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={selectedTId} onValueChange={v => setSelectedTId(v ?? '')}>
            <SelectTrigger className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]">
              <SelectItem value="all">전체 경기</SelectItem>
              {tournaments.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.year})</SelectItem>)}
            </SelectContent>
          </Select>

          <div className="flex rounded-lg overflow-hidden border border-[var(--mm-rule)]">
            <button
              onClick={() => switchMode('avg')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer ${viewMode === 'avg' ? 'bg-[var(--mm-ink)] text-[var(--mm-panel)]' : 'bg-[var(--mm-panel-alt)] text-[var(--mm-muted)] hover:text-[var(--mm-ink)]'}`}
            >
              경기당 평균
            </button>
            <button
              onClick={() => switchMode('per36')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer border-l border-[var(--mm-rule)] ${viewMode === 'per36' ? 'bg-amber-500 text-white' : 'bg-[var(--mm-panel-alt)] text-[var(--mm-muted)] hover:text-[var(--mm-ink)]'}`}
            >
              36분 환산
            </button>
            <button
              onClick={() => switchMode('vol')}
              className={`px-4 py-1.5 text-sm font-medium transition-colors cursor-pointer border-l border-[var(--mm-rule)] ${viewMode === 'vol' ? 'bg-[var(--mm-ink)] text-[var(--mm-panel)]' : 'bg-[var(--mm-panel-alt)] text-[var(--mm-muted)] hover:text-[var(--mm-ink)]'}`}
            >
              누적 볼륨
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'per36' && (
        <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <Ruler size={20} className="text-amber-400 shrink-0" aria-hidden />
          <div>
            <p className="text-sm text-amber-300 font-medium">NBA 스타일 36분 환산</p>
            <p className="text-xs text-[var(--mm-muted)] mt-0.5">파란날개 기준 28분(7분×4쿼터)을 NBA 기준 36분으로 환산한 예상 수치입니다. FG%·3P%·FT%·TS%는 비율 지표로 환산하지 않습니다.</p>
          </div>
        </div>
      )}

      {players.length > 0 && viewMode !== 'vol' && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-[var(--mm-ink)]">부문별 리더</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {leaders.map(({ label, key, unit, icon }) => {
              const leader = [...players].sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0))[0]
              if (!leader) return null
              const displayVal = viewMode === 'per36' && ['pts_avg', 'reb_avg', 'ast_avg'].includes(key)
                ? toPer36(Number(leader[key]))
                : Number(leader[key]).toFixed(1)
              const displayUnit = viewMode === 'per36' && ['pts_avg', 'reb_avg', 'ast_avg'].includes(key)
                ? unit.replace('PG', '/36')
                : unit
              return (
                <div key={key} className="bg-[var(--mm-panel)] border border-[var(--mm-rule)]/70 rounded-xl p-4 text-center hover:border-[color:var(--mm-yellow)]/60 transition-colors cursor-pointer">
                  <LeaderIcon icon={icon} />
                  <div className="text-xs text-[var(--mm-muted)] mb-1">{label}</div>
                  <button
                    onClick={() => setPlayerModal(leader.player_id)}
                    className="font-bold text-[var(--mm-ink)] hover:text-[var(--mm-yellow-strong)] hover:underline underline-offset-2 transition-colors cursor-pointer block w-full"
                  >
                    {leader.player_name}
                  </button>
                  <div className="text-xl font-black font-mono text-[var(--mm-ink)] mt-1">{displayVal}<span className="text-xs font-sans font-normal text-[var(--mm-muted)] ml-1">{displayUnit}</span></div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {players.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3 text-[var(--mm-ink)]">
            선수별 통계
            <span className="ml-2 text-sm font-normal text-[var(--mm-muted)]">
              {viewMode === 'avg' ? '경기당 평균' : viewMode === 'per36' ? '36분 환산' : '시즌 누적'}
            </span>
          </h2>
          {/* 모바일 정렬 칩 + 카드뷰 (md 미만) */}
          <div className="md:hidden">
            <div className="px-1 pb-2 overflow-x-auto">
              <div className="flex gap-1.5 whitespace-nowrap">
                {cols.filter(c => c.key !== 'player_name' && c.key !== 'player_number').map(col => (
                  <button key={col.key as string} onClick={() => setSortKey(col.key)}
                    className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors shrink-0 cursor-pointer ${
                      sortKey === col.key ? 'bg-[var(--mm-ink)] text-[var(--mm-panel)]' : 'bg-[var(--mm-panel-alt)] text-[var(--mm-muted)] hover:text-[var(--mm-ink)]'
                    }`}>
                    {col.label}{sortKey === col.key ? ' ↓' : ''}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {sorted.map((s, i) => {
                const sortLabel = cols.find(c => c.key === sortKey)?.label ?? ''
                const sortVal = (s as unknown as Record<string, unknown>)[sortKey as string]
                const subKeys: (keyof SeasonPlayer)[] = (viewMode === 'vol'
                  ? ['games_played','pts','reb','ast']
                  : viewMode === 'per36'
                  ? ['games_played','pts_avg','reb_avg','ast_avg']
                  : ['games_played','pts_avg','reb_avg','ast_avg']) as (keyof SeasonPlayer)[]
                const filteredSubKeys = subKeys.filter(k => k !== sortKey).slice(0, 4)
                return (
                  <button key={s.player_id} onClick={() => setPlayerModal(s.player_id)}
                    className="w-full text-left bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl px-3 py-2.5 hover:bg-[var(--mm-panel-alt)] transition-colors active:bg-[var(--mm-panel-alt)]/80 cursor-pointer">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-sm font-black text-[var(--mm-muted)] font-mono w-5 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-[var(--mm-ink)] text-sm truncate">
                          {s.player_name}
                          <span className="text-[var(--mm-muted)] font-mono ml-1 text-xs">#{s.player_number}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-xl font-black text-[var(--mm-yellow-strong)] leading-none">
                          {typeof sortVal === 'number' ? sortVal : String(sortVal ?? '-')}
                        </div>
                        <div className="text-xs text-[var(--mm-muted)] font-bold mt-0.5">{sortLabel}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-1 pt-1.5 border-t border-[var(--mm-rule)]/60">
                      {filteredSubKeys.map(k => {
                        const lbl = cols.find(c => c.key === k)?.label ?? String(k)
                        const v = (s as unknown as Record<string, unknown>)[k as string]
                        return (
                          <div key={k as string} className="text-center">
                            <div className="text-xs text-[var(--mm-muted)]">{lbl}</div>
                            <div className="text-xs font-bold text-[var(--mm-ink)]">{typeof v === 'number' ? v : String(v ?? '-')}</div>
                          </div>
                        )
                      })}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 데스크탑 테이블 (md 이상) */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-center border-collapse">
              <thead>
                <tr className="bg-[var(--mm-panel-alt)] text-[var(--mm-muted)]">
                  {cols.map(col => (
                    <th
                      key={col.key as string}
                      onClick={() => setSortKey(col.key)}
                      className={`px-2 py-2 border-b border-[var(--mm-rule)] font-medium cursor-pointer hover:text-[var(--mm-ink)] whitespace-nowrap transition-colors
                        ${col.key === 'player_name' ? 'text-left' : ''}
                        ${sortKey === col.key ? 'text-[var(--mm-yellow-strong)]' : ''}`}
                    >
                      {col.label}{sortKey === col.key ? ' ↓' : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map(s => (
                  <tr key={s.player_id} className="border-b border-[var(--mm-rule)] hover:bg-[var(--mm-panel-alt)]">
                    {cols.map(col => renderCell(s, col.key))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-4 mt-3">
            <p className="text-xs text-[var(--mm-muted)]">* 컬럼 클릭 시 정렬 변경 / 이름 클릭 시 선수 상세</p>
            {/* 색이 무슨 뜻인지 밝히지 않으면 "38%인데 왜 초록?" 이 된다 */}
            <p className="text-xs text-[var(--mm-muted)] break-keep">* {baselineCaption(CLUB_BASELINE)}</p>
            {viewMode === 'avg' && <p className="text-xs text-[var(--mm-muted)]">* USG%: 팀 전체 공격 점유 중 해당 선수 비율 / EFF: (PTS+REB+AST+STL+BLK)-(빗나간FG+빗나간FT+TOV) 경기당</p>}
            {viewMode === 'per36' && <p className="text-xs text-[var(--mm-muted)]">* 28분 기준 → 36분 환산 (× 1.286)</p>}
          </div>
        </div>
      )}

      {players.length === 0 && (
        <div className="text-center py-20 text-[var(--mm-muted)]">
          <p>경기 기록 데이터가 없습니다</p>
          <p className="text-sm mt-2">경기 기록 탭에서 스탯을 입력하면 자동으로 집계됩니다</p>
        </div>
      )}

      {/* 합작 듀오 TOP 5 — 어시스트 최다 연결 (두 선수 프로필 크게 겹쳐 표시) */}
      {assistData && assistData.topPairs.length > 0 && (
        <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-4 sm:p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold text-[var(--mm-ink)]">합작 듀오 TOP 5</h2>
            <span className="text-xs text-[var(--mm-muted)]">어시스트 → 득점 최다 연결</span>
          </div>

          {/* 모바일 2열 → 태블릿 3열 → 데스크톱 5열 (가로 스크롤 없음) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
            {assistData.topPairs.slice(0, 5).map((pair, i) => (
              <div
                key={`${pair.assister.id}-${pair.scorer.id}`}
                className="relative bg-[var(--mm-panel-alt)]/40 border border-[var(--mm-rule)] rounded-xl p-3 pt-4 flex flex-col items-center text-center"
              >
                {/* 순위 칩 */}
                <div
                  className="absolute top-2 left-2 w-6 h-6 rounded-md flex items-center justify-center text-xs font-black tabular-nums"
                  style={RANK_STYLE[i] ?? RANK_DEFAULT}
                  aria-label={`${i + 1}위`}
                >
                  {i + 1}
                </div>

                {/* 듀오 사진 — 겹쳐 배치 */}
                <div className="flex items-end justify-center mt-1 mb-3">
                  <DuoPhoto url={pair.assister.photo_url} name={pair.assister.name} number={pair.assister.number} />
                  <DuoPhoto url={pair.scorer.photo_url} name={pair.scorer.name} number={pair.scorer.number} overlap />
                </div>

                {/* 어시스트 → 득점 */}
                <div className="w-full min-w-0">
                  <div className="text-xs sm:text-sm font-bold text-[var(--mm-ink)] truncate">
                    <span className="text-[var(--mm-ink)]">#{pair.assister.number}</span> {pair.assister.name}
                  </div>
                  <div className="text-[var(--mm-muted)] text-[11px] leading-tight my-0.5" aria-hidden>↓</div>
                  <div className="text-xs sm:text-sm font-bold text-[var(--mm-ink)] truncate">
                    <span className="text-green-400">#{pair.scorer.number}</span> {pair.scorer.name}
                  </div>
                </div>

                {/* 합작 횟수 */}
                <div className="mt-3 pt-2.5 border-t border-[var(--mm-rule)]/50 w-full">
                  <span className="text-2xl font-black font-mono text-amber-400 tabular-nums">{pair.count}</span>
                  <span className="text-xs text-[var(--mm-muted)] ml-1">회</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {playerModal && (
        <PlayerDetailModal
          playerId={playerModal}
          onClose={() => setPlayerModal(null)}
        />
      )}
    </div>
  )
}
