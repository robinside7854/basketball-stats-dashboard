'use client'
import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Plus, Trash2, Loader2, Lock, Download, Upload, Crown, ChevronDown, Pencil, Check, X } from 'lucide-react'
import type { LeaguePlayer, LeagueTeam } from '@/types/league'

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C']
const POSITION_FILTER_OPTIONS = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C']

type Quarter = { id: string; year: number; quarter: number; is_current: boolean }
type PlayerQuarterMap = Record<string, Record<string, { team_id: string | null; is_regular: boolean | null }>>
type LeaderMap = Record<string, Record<string, string | null>>
type SortKey = 'name' | 'age_asc' | 'age_desc'

function parsePositions(pos: string | null): string[] {
  if (!pos) return []
  return pos.split(',').map(p => p.trim()).filter(Boolean)
}

// ── 수정 1: BirthDateInput — 년도 텍스트 입력으로 변경 ──────────────────────
function BirthDateInput({ value, onChange, className }: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  // rawYear: 로컬 년도 raw 문자열 (4자리 완성 전에도 표시)
  const parts = value ? value.split('-') : ['', '', '']
  const storedY = parts[0] ?? ''
  const m = parts[1] ?? ''
  const d = parts[2] ?? ''

  const [rawYear, setRawYear] = useState(storedY)

  // value prop이 외부에서 변경될 때 rawYear 동기화
  useEffect(() => {
    const p = value ? value.split('-') : ['', '', '']
    setRawYear(p[0] ?? '')
  }, [value])

  function buildDate(y: string, mm: string, dd: string): string {
    // 4자리 완성 시에만 YYYY-MM-DD 조합
    if (y.length === 4 && /^\d{4}$/.test(y)) {
      const mmPad = mm.padStart(2, '0').slice(0, 2)
      const ddPad = dd.padStart(2, '0').slice(0, 2)
      return `${y}-${mmPad}-${ddPad}`
    }
    return ''
  }

  function handleYearChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 4)
    setRawYear(raw)
    if (raw.length === 4) {
      const result = buildDate(raw, m, d)
      if (result) onChange(result)
      else if (!m && !d) onChange('')
    } else {
      // 미완성이면 날짜 저장 안 함 — 단 기존 m/d 보존 위해 빈 날짜 전달
      onChange('')
    }
  }

  function handleMonthChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = String(e.target.value).padStart(2, '0').slice(0, 2)
    if (rawYear.length === 4) {
      const result = buildDate(rawYear, val, d)
      if (result) onChange(result)
    }
  }

  function handleDayChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = String(e.target.value).padStart(2, '0').slice(0, 2)
    if (rawYear.length === 4) {
      const result = buildDate(rawYear, m, val)
      if (result) onChange(result)
    }
  }

  const base = `bg-gray-800 border border-gray-700 text-white rounded-lg text-center focus:outline-none focus:border-blue-500 ${className ?? ''}`
  return (
    <div className="flex items-center gap-1">
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        placeholder="년도"
        maxLength={4}
        value={rawYear}
        onChange={handleYearChange}
        className={`${base} w-16 px-1 py-1.5 text-xs`}
      />
      <span className="text-gray-600 text-xs">/</span>
      <input
        type="number" placeholder="월" min={1} max={12}
        value={Number(m) || ''}
        onChange={handleMonthChange}
        className={`${base} w-12 px-1 py-1.5 text-xs`}
      />
      <span className="text-gray-600 text-xs">/</span>
      <input
        type="number" placeholder="일" min={1} max={31}
        value={Number(d) || ''}
        onChange={handleDayChange}
        className={`${base} w-12 px-1 py-1.5 text-xs`}
      />
    </div>
  )
}

function PositionBadge({ pos }: { pos: string }) {
  const colors: Record<string, string> = {
    PG: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    SG: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
    SF: 'bg-green-500/20 text-green-300 border-green-500/40',
    PF: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
    C:  'bg-red-500/20 text-red-300 border-red-500/40',
    G:  'bg-sky-500/20 text-sky-300 border-sky-500/40',
    F:  'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${colors[pos] ?? 'bg-gray-700 text-gray-300 border-gray-600'}`}>
      {pos}
    </span>
  )
}

function formatBirthDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  const y = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}.${mm}.${day}`
}

function calcAge(dateStr: string | null): string {
  if (!dateStr) return ''
  const birth = new Date(dateStr)
  if (isNaN(birth.getTime())) return ''
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--
  return `${age}세`
}

function calcAgeNum(dateStr: string | null): number {
  if (!dateStr) return 0
  const birth = new Date(dateStr)
  if (isNaN(birth.getTime())) return 0
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const monthDiff = now.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--
  return age
}

type PlayerSeasonStats = {
  gp: number; pts: number
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
  oreb: number; dreb: number; reb: number
  ast: number; stl: number; blk: number; tov: number; pf: number
  ppg: number; rpg: number; apg: number; spg: number; bpg: number; topg: number
  fg_pct: number; fg3_pct: number; ft_pct: number; efg_pct: number
}

type ShotBreakdown = {
  layup: { m: number; a: number; dist: number; fg_pct: number }
  mid:   { m: number; a: number; dist: number; fg_pct: number }
  post:  { m: number; a: number; dist: number; fg_pct: number }
  drive: { m: number; a: number; dist: number; fg_pct: number }
  three: { m: number; a: number; dist: number; fg_pct: number }
  ft:    { m: number; a: number; ft_pct: number }
  total_fga: number
}
type CareerHighEntry = {
  value: number; extra?: string; date?: string; opponent?: string
  round_num?: number; result?: string; score?: string; league_name?: string
}
type PlayerDetail = {
  rankings: { ppg: number; rpg: number; apg: number; spg: number; bpg: number; total: number }
  career_high: Record<string, CareerHighEntry>
  shot_breakdown: ShotBreakdown
  recent_games: Array<{
    date?: string; opponent?: string; round_num?: number; result?: string; score?: string
    pts: number; reb: number; ast: number; fgm: number; fga: number; league_name?: string
  }>
}

interface PlayerModalProps {
  player: LeaguePlayer
  isEditMode: boolean
  leagueHeaders: Record<string, string>
  leagueId: string
  membershipMap: PlayerQuarterMap
  displayQuarters: Quarter[]
  teams: LeagueTeam[]
  leaderMap: LeaderMap
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}

function PlayerModal({
  player, isEditMode, leagueHeaders, leagueId,
  membershipMap, displayQuarters, teams, leaderMap,
  onClose, onSaved, onDeleted,
}: PlayerModalProps) {
  const [isP1, setIsP1] = useState(player.plus_one)
  const [editForm, setEditForm] = useState({
    name: player.name,
    position: parsePositions(player.position),
    birth_date: player.birth_date ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [togglingP1, setTogglingP1] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [stats, setStats] = useState<PlayerSeasonStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [detail, setDetail] = useState<PlayerDetail | null>(null)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  // 선수 시즌 스탯 + 상세 데이터 로드
  useEffect(() => {
    setStatsLoading(true)
    Promise.all([
      fetch(`/api/leagues/${leagueId}/stats?playerId=${player.id}`).then(r => r.json()),
      fetch(`/api/leagues/${leagueId}/players/${player.id}/detail`).then(r => r.json()),
    ])
      .then(([statsData, detailData]) => {
        setStats(statsData.players?.[0] ?? null)
        setDetail(detailData)
      })
      .catch(() => {})
      .finally(() => setStatsLoading(false))
  }, [leagueId, player.id])

  // 분기별 팀 정보 helpers
  function getQLabel(qId: string, pid: string): string {
    const m = membershipMap[qId]?.[pid]
    if (!m || m.is_regular === null) return '—'
    if (!m.is_regular) return '비정규'
    return teams.find(t => t.id === m.team_id)?.name ?? '—'
  }
  function getQTeamColor(qId: string, pid: string): string | null {
    const m = membershipMap[qId]?.[pid]
    if (!m || !m.is_regular || !m.team_id) return null
    return teams.find(t => t.id === m.team_id)?.color ?? null
  }
  function getQTeamId(qId: string, pid: string): string | null {
    return membershipMap[qId]?.[pid]?.team_id ?? null
  }
  function isPlayerLeader(qId: string, teamId: string | null, pid: string): boolean {
    if (!teamId) return false
    return leaderMap[qId]?.[teamId] === pid
  }

  // 현재 분기 팀 컬러 → 히어로 배경에 사용
  const curQ = displayQuarters.find(q => q.is_current) ?? displayQuarters[displayQuarters.length - 1]
  const heroColor = curQ ? getQTeamColor(curQ.id, player.id) : null

  const positions = parsePositions(player.position)

  async function handleToggleP1() {
    const newVal = !isP1
    setIsP1(newVal)
    setTogglingP1(true)
    const res = await fetch(`/api/leagues/${leagueId}/players?playerId=${player.id}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ plus_one: newVal }),
    })
    setTogglingP1(false)
    if (res.ok) {
      toast.success(newVal ? '+1 활성화' : '+1 해제')
      onSaved()
    } else {
      setIsP1(!newVal)
      toast.error('+1 업데이트 실패')
    }
  }

  function togglePos(pos: string) {
    setEditForm(f => ({
      ...f,
      position: f.position.includes(pos) ? f.position.filter(p => p !== pos) : [...f.position, pos],
    }))
  }

  async function handleSave() {
    if (!editForm.name.trim()) { toast.error('이름을 입력하세요'); return }
    setSaving(true)
    const res = await fetch(`/api/leagues/${leagueId}/players?playerId=${player.id}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({
        name: editForm.name.trim(),
        position: editForm.position.length > 0 ? editForm.position.join(',') : null,
        birth_date: editForm.birth_date || null,
      }),
    })
    setSaving(false)
    if (res.ok) { toast.success('수정 완료'); onSaved(); onClose() }
    else { const d = await res.json(); toast.error(d.error ?? '수정 실패') }
  }

  async function handleDelete() {
    if (!confirm('이 선수를 삭제하시겠습니까?')) return
    setDeleting(true)
    const res = await fetch(`/api/leagues/${leagueId}/players?playerId=${player.id}`, {
      method: 'DELETE',
      headers: leagueHeaders,
    })
    setDeleting(false)
    if (res.ok) { toast.success('삭제 완료'); onDeleted(); onClose() }
    else toast.error('삭제 실패')
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* 모달 — PC 기준 max-w-2xl, 카드 스타일 */}
      <div className="relative z-10 w-full max-w-2xl max-h-[90vh] bg-[#080e1a] border border-gray-800 rounded-2xl flex flex-col overflow-hidden shadow-2xl">

        {/* 상단 닫기 버튼 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800/60 shrink-0">
          <span className="text-xs font-medium text-gray-500 tracking-widest uppercase">Player Profile</span>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-gray-800 cursor-pointer">
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* ── 히어로 섹션 ─────────────────────────────────── */}
          <div className="relative overflow-hidden" style={{ minHeight: '200px' }}>
            {/* 팀 컬러 그라디언트 배경 */}
            <div
              className="absolute inset-0"
              style={{
                background: heroColor
                  ? `linear-gradient(135deg, ${heroColor}18 0%, #050a14 55%, #080e1a 100%)`
                  : 'linear-gradient(135deg, #0d1a2e 0%, #050a14 100%)',
              }}
            />
            {/* 상단 컬러 스트립 */}
            {heroColor && (
              <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${heroColor}, transparent)` }} />
            )}
            {/* 거대 등번호/이니셜 워터마크 */}
            <div className="absolute right-0 top-0 bottom-0 flex items-center overflow-hidden pointer-events-none select-none">
              <span
                className="font-black leading-none pr-6"
                style={{
                  fontSize: '220px',
                  color: heroColor ? `${heroColor}0d` : 'rgba(255,255,255,0.025)',
                }}
              >
                {player.number !== null ? player.number : player.name.charAt(0)}
              </span>
            </div>

            {/* 콘텐츠 */}
            <div className="relative z-10 flex items-center gap-6 px-7 py-8">
              {/* 아바타 원형 */}
              <div
                className="w-28 h-28 shrink-0 rounded-full flex items-center justify-center border-2 shadow-lg"
                style={{
                  backgroundColor: heroColor ? `${heroColor}20` : '#162032',
                  borderColor: heroColor ? `${heroColor}50` : '#1d4ed8',
                  boxShadow: heroColor ? `0 0 30px ${heroColor}20` : undefined,
                }}
              >
                {player.number !== null ? (
                  <span className="text-5xl font-black" style={{ color: heroColor ?? '#93c5fd' }}>
                    {player.number}
                  </span>
                ) : (
                  <span className="text-4xl font-black text-blue-300">{player.name.charAt(0)}</span>
                )}
              </div>

              {/* 이름/정보 */}
              <div className="flex-1 min-w-0">
                {/* 이름 + +1 토글 */}
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div className="min-w-0">
                    <h1 className="text-5xl font-black text-white leading-none tracking-tight mb-1">{player.name}</h1>
                    {player.number !== null && (
                      <span className="text-sm text-gray-500 font-mono">#{player.number}</span>
                    )}
                  </div>
                  {/* +1 토글 버튼 */}
                  <button
                    onClick={isEditMode ? handleToggleP1 : undefined}
                    disabled={togglingP1}
                    className={`mt-1 shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center font-black text-xl border-2 transition-all disabled:opacity-50 ${
                      isP1
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/60 shadow-[0_0_24px_rgba(245,158,11,0.25)]'
                        : 'bg-gray-800/50 text-gray-600 border-gray-700'
                    } ${isEditMode ? 'cursor-pointer hover:scale-105 active:scale-95' : 'cursor-default'}`}
                    title={isEditMode ? (isP1 ? '+1 해제' : '+1 활성화') : undefined}
                  >
                    +1
                  </button>
                </div>

                {/* 포지션 */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {positions.length > 0
                    ? positions.map(pos => <PositionBadge key={pos} pos={pos} />)
                    : <span className="text-xs text-gray-700">포지션 미지정</span>
                  }
                </div>

                {/* 생년월일 */}
                {player.birth_date ? (
                  <p className="text-sm text-gray-400">
                    {formatBirthDate(player.birth_date)}
                    <span className="ml-2 text-gray-600">({calcAge(player.birth_date)})</span>
                  </p>
                ) : (
                  <p className="text-sm text-gray-700">생년월일 미입력</p>
                )}
              </div>
            </div>
          </div>

          {/* ── 분기별 소속 ──────────────────────────────────── */}
          {displayQuarters.length > 0 && (
            <div className="px-6 py-4 border-t border-gray-800/60">
              <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-3">분기별 소속</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {displayQuarters.map(q => {
                  const label = getQLabel(q.id, player.id)
                  const teamColor = getQTeamColor(q.id, player.id)
                  const teamId = getQTeamId(q.id, player.id)
                  const isLdr = isPlayerLeader(q.id, teamId, player.id)
                  return (
                    <div
                      key={q.id}
                      className={`flex items-center justify-between px-3 py-2 rounded-xl border ${
                        q.is_current
                          ? 'bg-blue-900/15 border-blue-800/30'
                          : 'bg-gray-900/40 border-gray-800/40'
                      }`}
                    >
                      <span className={`text-xs font-mono font-bold ${q.is_current ? 'text-blue-400' : 'text-gray-600'}`}>
                        {String(q.year).slice(2)}.{q.quarter}Q
                        {q.is_current && <span className="ml-1 text-blue-500">●</span>}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {isLdr && <Crown size={11} className="text-yellow-400" />}
                        {label !== '—' && label !== '비정규' && teamColor && (
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: teamColor }} />
                        )}
                        <span className={`text-xs font-medium ${
                          label === '비정규' ? 'text-gray-600' :
                          label === '—' ? 'text-gray-700' : 'text-white'
                        }`}>{label}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── 시즌 스탯 ────────────────────────────────────── */}
          <div className="px-6 py-4 border-t border-gray-800/60">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-3">시즌 스탯</p>
            {statsLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 size={18} className="animate-spin text-gray-700" />
              </div>
            ) : stats ? (
              <div className="space-y-3">
                {/* 주요 평균 — GP / PPG / RPG / APG / STL / BLK with ranks */}
                <div className="grid grid-cols-6 gap-2">
                  {[
                    { label: 'GP',  value: String(stats.gp),           rank: 0,                          accent: false },
                    { label: 'PPG', value: stats.ppg.toFixed(1),       rank: detail?.rankings.ppg ?? 0,  accent: true  },
                    { label: 'RPG', value: stats.rpg.toFixed(1),       rank: detail?.rankings.rpg ?? 0,  accent: false },
                    { label: 'APG', value: stats.apg.toFixed(1),       rank: detail?.rankings.apg ?? 0,  accent: false },
                    { label: 'STL', value: stats.spg.toFixed(1),       rank: detail?.rankings.spg ?? 0,  accent: false },
                    { label: 'BLK', value: stats.bpg.toFixed(1),       rank: detail?.rankings.bpg ?? 0,  accent: false },
                  ].map(({ label, value, rank, accent }) => (
                    <div key={label} className={`rounded-xl p-2.5 text-center border ${accent ? 'bg-blue-900/20 border-blue-800/30' : 'bg-gray-900/50 border-gray-800/40'}`}>
                      <p className="text-[8px] text-gray-600 mb-1 uppercase tracking-wider">{label}</p>
                      <p className={`text-xl font-black leading-none ${accent ? 'text-blue-300' : 'text-white'}`}>{value}</p>
                      {rank > 0 && (
                        <p className={`text-[9px] font-bold mt-1 leading-none ${rank === 1 ? 'text-yellow-400' : rank <= 3 ? 'text-orange-400' : 'text-gray-600'}`}>
                          {rank}위
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* 슈팅 퍼센트 3칸 */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'FG%', pct: stats.fg_pct, made: stats.fgm, att: stats.fga },
                    { label: '3P%', pct: stats.fg3_pct, made: stats.fg3m, att: stats.fg3a },
                    { label: 'FT%', pct: stats.ft_pct, made: stats.ftm, att: stats.fta },
                  ].map(({ label, pct, made, att }) => (
                    <div key={label} className="bg-gray-900/50 border border-gray-800/40 rounded-xl p-3 text-center">
                      <p className="text-[9px] text-gray-600 mb-1 uppercase tracking-wider">{label}</p>
                      <p className="text-xl font-black text-white leading-none">{att > 0 ? `${pct.toFixed(1)}%` : '—'}</p>
                      <p className="text-[10px] text-gray-700 mt-1">{made}/{att}</p>
                    </div>
                  ))}
                </div>

                {/* 시즌 누적 6칸 */}
                <div className="grid grid-cols-6 gap-1.5">
                  {[
                    { label: 'PTS', value: stats.pts, hi: true },
                    { label: 'REB', value: stats.reb },
                    { label: 'AST', value: stats.ast },
                    { label: 'STL', value: stats.stl },
                    { label: 'BLK', value: stats.blk },
                    { label: 'TOV', value: stats.tov },
                  ].map(({ label, value, hi }) => (
                    <div key={label} className={`rounded-xl p-2 text-center border ${hi ? 'bg-blue-900/15 border-blue-800/25' : 'bg-gray-900/40 border-gray-800/30'}`}>
                      <p className="text-[8px] text-gray-600 mb-0.5 uppercase tracking-wider">{label}</p>
                      <p className={`text-sm font-black leading-none ${hi ? 'text-blue-300' : 'text-white'}`}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* TOPG / eFG% 보조 */}
                <div className="flex items-center gap-2">
                  {[
                    { label: 'TOPG', value: stats.topg.toFixed(1) },
                    { label: 'eFG%', value: stats.fga > 0 ? `${stats.efg_pct.toFixed(1)}%` : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex-1 text-center py-2 bg-gray-900/30 rounded-lg border border-gray-800/30">
                      <p className="text-[9px] text-gray-700 uppercase">{label}</p>
                      <p className="text-xs font-bold text-gray-400">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-center text-xs text-gray-700 py-4">아직 기록된 스탯이 없습니다</p>
            )}
          </div>

          {/* ── 공격 스타일 ───────────────────────────────────── */}
          {detail?.shot_breakdown && detail.shot_breakdown.total_fga > 0 && (
            <div className="px-6 py-4 border-t border-gray-800/60">
              <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-3">공격 스타일</p>
              {(() => {
                const sb = detail.shot_breakdown
                const zones = [
                  { key: 'layup', label: '레이업',   color: '#f97316', data: sb.layup },
                  { key: 'mid',   label: '미드레인지', color: '#eab308', data: sb.mid   },
                  { key: 'post',  label: '골밑슛',   color: '#ef4444', data: sb.post  },
                  { key: 'drive', label: '드라이브', color: '#14b8a6', data: sb.drive },
                  { key: 'three', label: '3점슛',    color: '#3b82f6', data: sb.three },
                ].filter(z => z.data.a > 0)
                return (
                  <div className="flex gap-4">
                    <div className="flex-1 space-y-2">
                      {/* 적층 바 */}
                      <div className="flex h-3 rounded-full overflow-hidden">
                        {zones.map(z => (
                          <div key={z.key} style={{ width: `${z.data.dist}%`, backgroundColor: z.color }} />
                        ))}
                      </div>
                      {/* 범례 */}
                      <div className="space-y-1.5">
                        {zones.map(z => (
                          <div key={z.key} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: z.color }} />
                            <span className="text-[11px] text-gray-400 flex-1">{z.label}</span>
                            <span className="text-[11px] font-bold" style={{ color: z.color }}>{z.data.dist}%</span>
                          </div>
                        ))}
                        <p className="text-[10px] text-gray-700 mt-1">총 {sb.total_fga}회 시도</p>
                      </div>
                    </div>
                    {/* 구역별 야투율 테이블 */}
                    <div className="w-44 shrink-0">
                      <div className="grid grid-cols-3 gap-x-2 text-[9px] text-gray-600 mb-1 px-0.5">
                        <span>구역</span><span className="text-right">성공/시도</span><span className="text-right">성공률</span>
                      </div>
                      {[...zones, ...(sb.ft.a > 0 ? [{ key: 'ft', label: '자유투', color: '#9ca3af', data: { m: sb.ft.m, a: sb.ft.a, dist: 0, fg_pct: sb.ft.ft_pct } }] : [])].map(z => (
                        <div key={z.key} className="grid grid-cols-3 gap-x-2 py-0.5 border-b border-gray-800/40 px-0.5">
                          <div className="flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: z.color }} />
                            <span className="text-[10px] text-gray-400 truncate">{z.label}</span>
                          </div>
                          <span className="text-[10px] text-gray-500 text-right">{z.data.m}/{z.data.a}</span>
                          <span className="text-[10px] font-bold text-white text-right">{z.data.fg_pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── 커리어 하이 ───────────────────────────────────── */}
          {detail && Object.keys(detail.career_high).length > 0 && (
            <div className="px-6 py-4 border-t border-gray-800/60">
              <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-3">커리어 하이</p>
              {(() => {
                const ch = detail.career_high
                const items = [
                  { key: 'pts',   label: 'PTS',   color: 'text-yellow-400',  accent: '#eab308' },
                  { key: 'reb',   label: 'REB',   color: 'text-orange-400',  accent: '#f97316' },
                  { key: 'ast',   label: 'AST',   color: 'text-cyan-400',    accent: '#22d3ee' },
                  { key: 'stl',   label: 'STL',   color: 'text-green-400',   accent: '#4ade80' },
                  { key: 'blk',   label: 'BLK',   color: 'text-purple-400',  accent: '#c084fc' },
                  { key: 'fgPct', label: 'FG%',   color: 'text-teal-400',    accent: '#2dd4bf' },
                  { key: 'ftm',   label: 'FTM',   color: 'text-pink-400',    accent: '#f472b6' },
                ].filter(i => ch[i.key])
                return (
                  <div className="grid grid-cols-2 gap-2">
                    {items.map(({ key, label, color }) => {
                      const e = ch[key]!
                      return (
                        <div key={key} className="bg-gray-900/60 border border-gray-800/50 rounded-xl p-3">
                          <div className="flex items-baseline gap-1.5 mb-1">
                            <span className={`text-2xl font-black leading-none ${color}`}>{key === 'fgPct' ? `${e.value}%` : e.value}</span>
                            <span className="text-[10px] text-gray-600 font-bold">{label}</span>
                          </div>
                          {e.extra && <p className="text-[10px] text-gray-500 mb-1.5">{e.extra}</p>}
                          {e.date && <p className="text-[10px] text-gray-700">{e.date}</p>}
                          {e.opponent && (
                            <p className="text-[11px] text-gray-400">
                              vs {e.opponent}{e.round_num != null ? ` [R${e.round_num}]` : ''}
                            </p>
                          )}
                          {e.result && (
                            <span className={`inline-block mt-1 text-[10px] font-black px-1.5 py-0.5 rounded ${e.result === 'W' ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400'}`}>
                              {e.result} {e.score}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          )}

          {/* ── 최근 5경기 ─────────────────────────────────────── */}
          {detail && detail.recent_games.length > 0 && (
            <div className="px-6 py-4 border-t border-gray-800/60">
              <p className="text-[10px] text-gray-600 uppercase tracking-widest font-bold mb-3">최근 5경기</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-800/60">
                      {['날짜','상대','결과','PTS','REB','AST','FG'].map(h => (
                        <th key={h} className="pb-1.5 text-[10px] text-gray-600 font-bold text-left first:text-left text-right first:pr-2">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.recent_games.map((g, i) => (
                      <tr key={i} className="border-b border-gray-800/30 last:border-0">
                        <td className="py-1.5 pr-2 text-gray-600 text-[10px] whitespace-nowrap">{g.date?.slice(5) ?? '—'}</td>
                        <td className="py-1.5 pr-2 text-gray-300 text-[11px] whitespace-nowrap">
                          vs {g.opponent ?? '—'}{g.round_num != null ? ` [R${g.round_num}]` : ''}
                        </td>
                        <td className="py-1.5 pr-2">
                          {g.result ? (
                            <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${g.result === 'W' ? 'text-green-400 bg-green-900/40' : 'text-red-400 bg-red-900/40'}`}>
                              {g.result} {g.score}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-1.5 text-right text-white font-bold">{g.pts}</td>
                        <td className="py-1.5 text-right text-gray-300">{g.reb}</td>
                        <td className="py-1.5 text-right text-gray-300">{g.ast}</td>
                        <td className="py-1.5 text-right text-gray-500 text-[10px]">{g.fgm}/{g.fga}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── 편집 영역 ─────────────────────────────────────── */}
          <div className="px-6 py-4 border-t border-gray-800/60 space-y-3">
            {isEditMode && showEdit && (
              <div className="bg-gray-900/60 border border-blue-500/20 rounded-xl p-4 space-y-3">
                <h3 className="text-sm font-semibold text-white">선수 정보 수정</h3>
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-500">이름</label>
                  <Input
                    autoFocus value={editForm.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="이름" className="bg-gray-800 border-gray-700 text-white text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-500">생년월일</label>
                  <BirthDateInput value={editForm.birth_date} onChange={v => setEditForm(f => ({ ...f, birth_date: v }))} />
                </div>
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-500">포지션 (복수 선택)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {POSITIONS.map(pos => (
                      <button key={pos} type="button" onClick={() => togglePos(pos)}
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                          editForm.position.includes(pos)
                            ? 'bg-blue-600 border-blue-500 text-white'
                            : 'bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-500'
                        }`}
                      >{pos}</button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    {saving ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}저장
                  </button>
                  <button onClick={() => setShowEdit(false)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs cursor-pointer transition-colors"
                  >
                    <X size={11} />취소
                  </button>
                </div>
              </div>
            )}

            {isEditMode && !showEdit && (
              <div className="flex gap-2">
                <button onClick={() => setShowEdit(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white text-xs font-medium cursor-pointer transition-colors border border-gray-700"
                >
                  <Pencil size={12} />정보 수정
                </button>
                <button onClick={handleDelete} disabled={deleting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-900/20 hover:bg-red-900/40 text-red-400 hover:text-red-300 text-xs font-medium cursor-pointer transition-colors border border-red-800/40 disabled:opacity-50"
                >
                  {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}삭제
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function LeagueRosterPage() {
  const params = useParams<{ leagueId: string }>()
  const { leagueId } = params
  const { isEditMode, leagueHeaders, openPinModal } = useLeagueEditMode()

  const [players, setPlayers] = useState<LeaguePlayer[]>([])
  const [teams, setTeams] = useState<LeagueTeam[]>([])
  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [plusOneAge, setPlusOneAge] = useState<number | null>(null)
  const [membershipMap, setMembershipMap] = useState<PlayerQuarterMap>({})
  const [leaderMap, setLeaderMap] = useState<LeaderMap>({})
  const [loading, setLoading] = useState(true)

  // Add form
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: '', position: [] as string[], birth_date: '' })

  // Bulk
  const [bulkUploading, setBulkUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Delete (카드 인라인)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // 수정 3: 선수 상세 모달
  const [selectedPlayer, setSelectedPlayer] = useState<LeaguePlayer | null>(null)

  // Quarter cell edit
  const [editingCell, setEditingCell] = useState<{ playerId: string; quarterId: string } | null>(null)
  const [savingCell, setSavingCell] = useState<string | null>(null)

  // Quarter form
  const [showQForm, setShowQForm] = useState(false)
  const [qYear, setQYear] = useState(new Date().getFullYear())
  const [qQuarter, setQQuarter] = useState(1)
  const [savingQ, setSavingQ] = useState(false)

  // 수정 2: 정렬/필터 state
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [filterPosition, setFilterPosition] = useState<string>('ALL')

  const currentYear = new Date().getFullYear()
  const displayQuarters = quarters.filter(q => q.year === currentYear).length > 0
    ? quarters.filter(q => q.year === currentYear)
    : quarters

  async function load() {
    setLoading(true)
    const [pRes, tRes, qRes, lRes] = await Promise.all([
      fetch(`/api/leagues/${leagueId}/players`),
      fetch(`/api/leagues/${leagueId}/teams`),
      fetch(`/api/leagues/${leagueId}/quarters`),
      fetch(`/api/leagues/${leagueId}`),
    ])

    if (lRes.ok) { const ld = await lRes.json(); setPlusOneAge(ld.plus_one_age ?? null) }
    const playersData: LeaguePlayer[] = pRes.ok ? await pRes.json() : []
    const teamsData: LeagueTeam[] = tRes.ok ? (await tRes.json()).map((t: LeagueTeam & { players?: unknown[] }) => {
      const { players: _, ...rest } = t as LeagueTeam & { players?: unknown[] }
      void _
      return rest
    }) : []
    const quartersData: Quarter[] = qRes.ok ? await qRes.json() : []

    setPlayers(playersData)
    setTeams(teamsData)
    setQuarters(quartersData)

    if (quartersData.length > 0) {
      const results = await Promise.all(quartersData.map(q =>
        Promise.all([
          fetch(`/api/leagues/${leagueId}/quarters/${q.id}/players`),
          fetch(`/api/leagues/${leagueId}/quarters/${q.id}/leaders`),
        ])
      ))

      const newMembership: PlayerQuarterMap = {}
      const newLeader: LeaderMap = {}

      for (let i = 0; i < quartersData.length; i++) {
        const q = quartersData[i]
        const [mRes, lRes] = results[i]
        newMembership[q.id] = {}
        newLeader[q.id] = {}
        if (mRes.ok) {
          const rows = await mRes.json() as Array<{ id: string; team_id: string | null; is_regular: boolean | null }>
          for (const r of rows) {
            newMembership[q.id][r.id] = { team_id: r.team_id, is_regular: r.is_regular }
          }
        }
        if (lRes.ok) {
          const rows = await lRes.json() as Array<{ team_id: string; leader_player_id: string | null }>
          for (const r of rows) {
            newLeader[q.id][r.team_id] = r.leader_player_id
          }
        }
      }

      setMembershipMap(newMembership)
      setLeaderMap(newLeader)
    }

    setLoading(false)
  }

  useEffect(() => { load() }, [leagueId])

  async function addPlayer() {
    if (!form.name.trim()) { toast.error('이름을 입력하세요'); return }
    setSaving(true)
    const res = await fetch(`/api/leagues/${leagueId}/players`, {
      method: 'POST',
      headers: leagueHeaders,
      body: JSON.stringify({
        name: form.name.trim(),
        position: form.position.length > 0 ? form.position.join(',') : null,
        birth_date: form.birth_date || null,
      }),
    })
    setSaving(false)
    if (res.ok) {
      toast.success('선수 추가 완료')
      setForm({ name: '', position: [], birth_date: '' })
      setShowForm(false)
      load()
    } else {
      const d = await res.json()
      toast.error(d.error ?? '추가 실패')
    }
  }

  function togglePosition(pos: string, arr: string[], setArr: (v: string[]) => void) {
    setArr(arr.includes(pos) ? arr.filter(p => p !== pos) : [...arr, pos])
  }

  async function downloadTemplate() {
    const xlsx = await import('xlsx')
    const ws = xlsx.utils.aoa_to_sheet([
      ['이름', '포지션', '생년월일'],
      ['홍길동', 'PG', '1995-03-15'],
      ['김철수', 'SF,PF', '1998-07-22'],
    ])
    ws['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 14 }]
    const wb = xlsx.utils.book_new()
    xlsx.utils.book_append_sheet(wb, ws, '선수명단')
    xlsx.writeFile(wb, '선수명단_템플릿.xlsx')
  }

  async function handleBulkUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setBulkUploading(true)
    try {
      const xlsx = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = xlsx.read(buf)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = xlsx.utils.sheet_to_json<Record<string, string | number>>(ws, { defval: '' })

      const uploadPlayers = rows
        .filter(r => String(r['이름'] ?? '').trim())
        .map(r => ({
          name: String(r['이름']).trim(),
          position: String(r['포지션'] ?? '').trim() || null,
          birth_date: String(r['생년월일'] ?? '').trim() || null,
          number: null as number | null,
        }))

      if (uploadPlayers.length === 0) { toast.error('유효한 선수 데이터가 없습니다'); setBulkUploading(false); return }

      const res = await fetch(`/api/leagues/${leagueId}/players/bulk`, {
        method: 'POST',
        headers: leagueHeaders,
        body: JSON.stringify({ players: uploadPlayers }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success(`${data.inserted}명 등록 완료`)
        load()
      } else {
        toast.error(data.error ?? '등록 실패')
      }
    } catch {
      toast.error('파일 처리 중 오류가 발생했습니다')
    }
    setBulkUploading(false)
  }

  async function deletePlayer(id: string) {
    if (!confirm('이 선수를 삭제하시겠습니까?')) return
    setDeletingId(id)
    const res = await fetch(`/api/leagues/${leagueId}/players?playerId=${id}`, {
      method: 'DELETE',
      headers: leagueHeaders,
    })
    setDeletingId(null)
    if (res.ok) { toast.success('삭제 완료'); load() }
    else toast.error('삭제 실패')
  }

  async function togglePlusOne(playerId: string, currentVal: boolean) {
    const newVal = !currentVal
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, plus_one: newVal } : p))
    const res = await fetch(`/api/leagues/${leagueId}/players?playerId=${playerId}`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ plus_one: newVal }),
    })
    if (!res.ok) {
      setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, plus_one: currentVal } : p))
      toast.error('+1 업데이트 실패')
    }
  }

  async function createQuarter() {
    setSavingQ(true)
    const res = await fetch(`/api/leagues/${leagueId}/quarters`, {
      method: 'POST',
      headers: leagueHeaders,
      body: JSON.stringify({ year: qYear, quarter: qQuarter, is_current: false }),
    })
    setSavingQ(false)
    if (res.ok) {
      toast.success(`${qYear % 100}.${qQuarter}Q 생성 완료`)
      setShowQForm(false)
      load()
    } else {
      const d = await res.json()
      toast.error(d.error ?? '생성 실패')
    }
  }

  async function updateMembership(quarterId: string, playerId: string, teamId: string | null, isRegular: boolean) {
    const cellKey = `${quarterId}:${playerId}`
    setSavingCell(cellKey)
    const res = await fetch(`/api/leagues/${leagueId}/quarters/${quarterId}/players`, {
      method: 'PATCH',
      headers: leagueHeaders,
      body: JSON.stringify({ league_player_id: playerId, team_id: teamId, is_regular: isRegular }),
    })
    setSavingCell(null)
    if (res.ok) {
      setMembershipMap(prev => ({
        ...prev,
        [quarterId]: { ...(prev[quarterId] ?? {}), [playerId]: { team_id: teamId, is_regular: isRegular } },
      }))
      setEditingCell(null)
    } else {
      toast.error('저장 실패')
    }
  }

  async function toggleLeader(quarterId: string, teamId: string, playerId: string) {
    const current = leaderMap[quarterId]?.[teamId]
    const newLeader = current === playerId ? null : playerId
    const res = await fetch(`/api/leagues/${leagueId}/quarters/${quarterId}/leaders`, {
      method: 'PUT',
      headers: leagueHeaders,
      body: JSON.stringify({ team_id: teamId, leader_player_id: newLeader }),
    })
    if (res.ok) {
      setLeaderMap(prev => ({
        ...prev,
        [quarterId]: { ...(prev[quarterId] ?? {}), [teamId]: newLeader },
      }))
    } else {
      toast.error('리더 변경 실패')
    }
  }

  function getCellLabel(quarterId: string, playerId: string): string {
    const m = membershipMap[quarterId]?.[playerId]
    if (!m || m.is_regular === null) return '—'
    if (!m.is_regular) return '비정규'
    const team = teams.find(t => t.id === m.team_id)
    return team?.name ?? '—'
  }

  function getCellTeamColor(quarterId: string, playerId: string): string | null {
    const m = membershipMap[quarterId]?.[playerId]
    if (!m || !m.is_regular || !m.team_id) return null
    const team = teams.find(t => t.id === m.team_id)
    return team?.color ?? null
  }

  function getCellTeamId(quarterId: string, playerId: string): string | null {
    return membershipMap[quarterId]?.[playerId]?.team_id ?? null
  }

  function isLeader(quarterId: string, teamId: string | null, playerId: string): boolean {
    if (!teamId) return false
    return leaderMap[quarterId]?.[teamId] === playerId
  }

  function getCellIsRegular(quarterId: string, playerId: string): boolean | null {
    return membershipMap[quarterId]?.[playerId]?.is_regular ?? null
  }

  // 수정 2: 정렬 + 필터 적용
  const filteredAndSortedPlayers = players
    .filter(p => {
      if (filterPosition === 'ALL') return true
      return parsePositions(p.position).includes(filterPosition)
    })
    .sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'ko')
      if (sortKey === 'age_asc') return calcAgeNum(a.birth_date) - calcAgeNum(b.birth_date)
      if (sortKey === 'age_desc') return calcAgeNum(b.birth_date) - calcAgeNum(a.birth_date)
      return 0
    })

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-white">선수단</h2>
          <p className="text-gray-500 text-sm">{players.length}명 등록</p>
        </div>
        {isEditMode ? (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer"
              title="엑셀 템플릿 다운로드"
            >
              <Download size={12} />템플릿
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={bulkUploading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
              title="엑셀 파일로 대량 등록"
            >
              {bulkUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}대량 등록
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleBulkUpload} />
            <Button
              onClick={() => setShowForm(v => !v)}
              className="bg-blue-600 hover:bg-blue-500 cursor-pointer"
              size="sm"
            >
              <Plus size={14} className="mr-1" />선수 추가
            </Button>
          </div>
        ) : (
          <button
            onClick={openPinModal}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white transition-colors cursor-pointer"
          >
            <Lock size={12} />편집 모드
          </button>
        )}
      </div>

      {/* 선수 추가 폼 */}
      {showForm && isEditMode && (
        <div className="bg-gray-900 border border-blue-500/30 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold text-white">새 선수 추가</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              placeholder="이름 *"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addPlayer()}
              className="bg-gray-800 border-gray-700 text-white"
            />
            <BirthDateInput
              value={form.birth_date}
              onChange={v => setForm(f => ({ ...f, birth_date: v }))}
            />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-2">포지션 (복수 선택 가능)</p>
            <div className="flex flex-wrap gap-2">
              {POSITIONS.map(pos => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => togglePosition(pos, form.position, v => setForm(f => ({ ...f, position: v })))}
                  className={`px-3 py-1 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                    form.position.includes(pos)
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={addPlayer} disabled={saving} className="bg-blue-600 hover:bg-blue-500 cursor-pointer" size="sm">
              {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : null}추가
            </Button>
            <Button onClick={() => setShowForm(false)} variant="outline" size="sm" className="border-gray-700 text-gray-300 cursor-pointer">
              취소
            </Button>
          </div>
        </div>
      )}

      {/* 수정 2: 정렬/필터 컨트롤 */}
      {!loading && players.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          {/* 정렬 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-600">정렬</span>
            <div className="flex gap-1">
              {([
                { key: 'name', label: '이름' },
                { key: 'age_asc', label: '나이↑' },
                { key: 'age_desc', label: '나이↓' },
              ] as { key: SortKey; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSortKey(key)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    sortKey === key
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 포지션 필터 */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-600">포지션</span>
            <div className="flex flex-wrap gap-1">
              {POSITION_FILTER_OPTIONS.map(pos => (
                <button
                  key={pos}
                  onClick={() => setFilterPosition(pos)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    filterPosition === pos
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white border border-gray-700'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 선수 카드 그리드 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={24} className="animate-spin text-gray-500" />
        </div>
      ) : players.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">등록된 선수가 없습니다</p>
          {isEditMode && <p className="text-xs mt-1">위 버튼으로 선수를 추가하세요</p>}
        </div>
      ) : filteredAndSortedPlayers.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">조건에 맞는 선수가 없습니다</p>
          <button
            onClick={() => { setFilterPosition('ALL'); setSortKey('name') }}
            className="text-xs text-blue-400 hover:text-blue-300 mt-2 cursor-pointer transition-colors"
          >
            필터 초기화
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredAndSortedPlayers.map(p => {
            const positions = parsePositions(p.position)
            const isAnyLeader = displayQuarters.some(q => {
              const teamId = getCellTeamId(q.id, p.id)
              return teamId ? isLeader(q.id, teamId, p.id) : false
            })
            // 현재 분기 팀 컬러 → 카드 왼쪽 스트립
            const curQ = displayQuarters.find(q => q.is_current)
            const cardAccent = curQ ? getCellTeamColor(curQ.id, p.id) : null

            return (
              <div
                key={p.id}
                className="relative bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden hover:border-gray-700 transition-all cursor-pointer group"
                onClick={() => setSelectedPlayer(p)}
              >
                {/* 팀 컬러 왼쪽 스트립 */}
                {cardAccent && (
                  <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: cardAccent }} />
                )}

                <div className="p-4 pl-5">
                  {/* 헤더: 등번호 + 이름 + +1 + 삭제 */}
                  <div className="flex items-center gap-2 mb-2">
                    {p.number !== null && (
                      <span className="text-xs font-mono font-bold text-gray-600 w-8 shrink-0">#{p.number}</span>
                    )}
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {isAnyLeader && <Crown size={12} className="text-yellow-400 shrink-0" />}
                      <span className="text-base font-bold text-white truncate">{p.name}</span>
                    </div>
                    {/* +1 배지/토글 */}
                    {isEditMode ? (
                      <button
                        onClick={e => { e.stopPropagation(); togglePlusOne(p.id, p.plus_one) }}
                        className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-black border transition-all cursor-pointer ${
                          p.plus_one
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                            : 'bg-gray-800 text-gray-700 border-gray-700 hover:border-gray-500 hover:text-gray-500'
                        }`}
                        title={p.plus_one ? '+1 해제' : '+1 활성화'}
                      >
                        +1
                      </button>
                    ) : p.plus_one ? (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        +1
                      </span>
                    ) : null}
                    {isEditMode && (
                      <button
                        onClick={e => { e.stopPropagation(); deletePlayer(p.id) }}
                        disabled={deletingId === p.id}
                        className="text-gray-600 hover:text-red-400 transition-colors cursor-pointer disabled:opacity-40 p-1 shrink-0"
                        title="선수 삭제"
                      >
                        {deletingId === p.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    )}
                  </div>

                  {/* 포지션 배지 */}
                  <div className="flex flex-wrap gap-1 mb-2 min-h-[22px]">
                    {positions.length > 0
                      ? positions.map(pos => <PositionBadge key={pos} pos={pos} />)
                      : <span className="text-xs text-gray-700">포지션 미지정</span>
                    }
                  </div>

                  {/* 생년월일 */}
                  {p.birth_date ? (
                    <p className="text-xs text-gray-500 mb-3">
                      {formatBirthDate(p.birth_date)}
                      <span className="ml-1.5 text-gray-600">({calcAge(p.birth_date)})</span>
                    </p>
                  ) : (
                    <p className="text-xs text-gray-700 mb-2">생년월일 미입력</p>
                  )}

                  {/* 분기별 팀 배정 */}
                  {displayQuarters.length > 0 && (
                    <div className="border-t border-gray-800 pt-2.5 mt-1 space-y-1.5">
                      {displayQuarters.map(q => {
                        const cellKey = `${q.id}:${p.id}`
                        const isSaving = savingCell === cellKey
                        const isEditingCell = editingCell?.quarterId === q.id && editingCell?.playerId === p.id
                        const label = getCellLabel(q.id, p.id)
                        const teamId = getCellTeamId(q.id, p.id)
                        const teamColor = getCellTeamColor(q.id, p.id)
                        const isRegular = getCellIsRegular(q.id, p.id)
                        const isPlayerLeader = isLeader(q.id, teamId, p.id)
                        return (
                          <div key={q.id} className="flex items-center justify-between gap-2">
                            <span className={`text-xs font-mono shrink-0 ${q.is_current ? 'text-blue-400' : 'text-gray-600'}`}>
                              {String(q.year).slice(2)}.{q.quarter}Q
                            </span>
                            {isSaving ? (
                              <Loader2 size={11} className="animate-spin text-gray-500 ml-auto" />
                            ) : isEditingCell && isEditMode ? (
                              <select
                                autoFocus defaultValue={teamId ?? ''}
                                onClick={e => e.stopPropagation()}
                                onBlur={e => {
                                  const val = e.target.value
                                  if (val === '__irregular') updateMembership(q.id, p.id, null, false)
                                  else if (val === '') setEditingCell(null)
                                  else updateMembership(q.id, p.id, val, true)
                                }}
                                onChange={e => {
                                  const val = e.target.value
                                  if (val === '__irregular') updateMembership(q.id, p.id, null, false)
                                  else if (val !== '') updateMembership(q.id, p.id, val, true)
                                }}
                                className="flex-1 bg-gray-800 border border-blue-500 text-white rounded px-2 py-0.5 text-xs cursor-pointer"
                              >
                                <option value="">미배정</option>
                                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                <option value="__irregular">비정규</option>
                              </select>
                            ) : (
                              <div className="flex items-center gap-1.5 ml-auto">
                                {isRegular && teamId && (
                                  <>
                                    {isEditMode ? (
                                      <button
                                        onClick={e => { e.stopPropagation(); toggleLeader(q.id, teamId, p.id) }}
                                        className={`transition-colors cursor-pointer ${isPlayerLeader ? 'text-yellow-400' : 'text-gray-700 hover:text-yellow-600'}`}
                                      ><Crown size={10} /></button>
                                    ) : isPlayerLeader ? (
                                      <Crown size={10} className="text-yellow-400" />
                                    ) : null}
                                  </>
                                )}
                                <button
                                  onClick={e => { e.stopPropagation(); if (isEditMode) setEditingCell({ playerId: p.id, quarterId: q.id }) }}
                                  className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded transition-colors ${isEditMode ? 'cursor-pointer hover:bg-gray-800' : 'cursor-default'}`}
                                >
                                  {label !== '—' && label !== '비정규' && teamColor
                                    ? <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: teamColor }} />
                                    : null}
                                  <span className={label === '비정규' ? 'text-gray-600' : label === '—' ? 'text-gray-700' : 'text-white font-medium'}>
                                    {label}
                                  </span>
                                  {isEditMode && <ChevronDown size={9} className="text-gray-600" />}
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* 카드 클릭 힌트 */}
                  <p className="mt-2 pt-2 border-t border-gray-800/40 text-[11px] text-gray-700 group-hover:text-gray-600 transition-colors">
                    클릭하여 프로필 보기
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 분기 관리 */}
      {isEditMode && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">분기 관리</h3>
            <button
              onClick={() => setShowQForm(v => !v)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white cursor-pointer transition-colors"
            >
              <Plus size={12} />분기 추가
            </button>
          </div>
          {quarters.length === 0 && !showQForm && (
            <p className="text-xs text-gray-600">아직 등록된 분기가 없습니다. 분기를 추가해 팀 구성을 관리하세요.</p>
          )}
          {quarters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quarters.map(q => (
                <span key={q.id} className={`text-xs px-2.5 py-1 rounded-full border ${q.is_current ? 'border-blue-500 bg-blue-500/10 text-blue-300' : 'border-gray-700 text-gray-400'}`}>
                  {String(q.year).slice(2)}.{q.quarter}Q{q.is_current ? ' ●' : ''}
                </span>
              ))}
            </div>
          )}
          {showQForm && (
            <div className="flex items-center gap-2 pt-1">
              <select
                value={qYear}
                onChange={e => setQYear(Number(e.target.value))}
                className="bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2 text-sm cursor-pointer"
              >
                {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <select
                value={qQuarter}
                onChange={e => setQQuarter(Number(e.target.value))}
                className="bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2 text-sm cursor-pointer"
              >
                {[1, 2, 3, 4].map(q => <option key={q} value={q}>{q}Q</option>)}
              </select>
              <Button onClick={createQuarter} disabled={savingQ} size="sm" className="bg-blue-600 hover:bg-blue-500 cursor-pointer">
                {savingQ ? <Loader2 size={13} className="animate-spin" /> : '생성'}
              </Button>
              <Button onClick={() => setShowQForm(false)} variant="outline" size="sm" className="border-gray-700 text-gray-400 cursor-pointer">취소</Button>
            </div>
          )}
        </div>
      )}

      {/* 수정 3: 선수 상세 모달 */}
      {selectedPlayer && (
        <PlayerModal
          player={selectedPlayer}
          isEditMode={isEditMode}
          leagueHeaders={leagueHeaders}
          leagueId={leagueId}
          membershipMap={membershipMap}
          displayQuarters={displayQuarters}
          teams={teams}
          leaderMap={leaderMap}
          onClose={() => setSelectedPlayer(null)}
          onSaved={() => load()}
          onDeleted={() => load()}
        />
      )}
    </div>
  )
}
