'use client'
import LeagueSubTabs from '@/components/league/LeagueSubTabs'
import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Plus, Trash2, Loader2, Lock, Download, Upload, Crown, X, Users, ShieldCheck } from 'lucide-react'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import EmptyState from '@/components/league/EmptyState'
import SectionCard from '@/components/league/ui/SectionCard'

const PlayerQuickViewModal = dynamic(() => import('@/components/league/PlayerQuickViewModal'), { ssr: false })
import SignupRateCard from '@/components/league/auth/SignupRateCard'
import { LeaderBadgeInline } from '@/components/league/LeaderBadgePanel'
import type { LeaguePlayer, LeagueTeam } from '@/types/league'

const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C']
const POSITION_FILTER_OPTIONS = ['ALL', 'PG', 'SG', 'SF', 'PF', 'C']

type Quarter = { id: string; year: number; quarter: number; is_current: boolean }
type PlayerQuarterMap = Record<string, Record<string, { team_id: string | null; is_regular: boolean | null }>>
type LeaderMap = Record<string, Record<string, string | null>>
type SortKey = 'name' | 'attendance_desc'

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

  const base = `bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] text-[var(--mm-ink)] text-center focus:outline-none focus:border-[var(--color-hoop-orange-500)] ${className ?? ''}`
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
      <span className="text-[var(--mm-muted)] text-xs">/</span>
      <input
        type="number" placeholder="월" min={1} max={12}
        value={Number(m) || ''}
        onChange={handleMonthChange}
        className={`${base} w-12 px-1 py-1.5 text-xs`}
      />
      <span className="text-[var(--mm-muted)] text-xs">/</span>
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
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-black uppercase tracking-[0.12em] border bg-[var(--mm-panel-alt)] text-[var(--mm-ink)] border-[var(--mm-rule)]"
    >
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
  const [leaderBadges, setLeaderBadges] = useState<Record<string, import('@/components/league/LeaderBadgePanel').LeaderBadgeCounts>>({})
  // (quarter_id → team_id → {name, color}) 분기별 팀명/색상 override 룩업
  const [teamOverrides, setTeamOverrides] = useState<Record<string, Record<string, { name: string | null; color: string | null }>>>({})
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
  const [qStart, setQStart] = useState('')
  const [qEnd, setQEnd] = useState('')
  const [savingQ, setSavingQ] = useState(false)

  // 수정 2: 정렬/필터 state
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [filterPosition, setFilterPosition] = useState<string>('ALL')
  // 참석율(라운드 참여율) — 참석율 정렬 · 카드 표시용
  const [attendance, setAttendance] = useState<{ totalRounds: number; perPlayer: Record<string, { rounds: number; rate: number }> }>({ totalRounds: 0, perPlayer: {} })
  useEffect(() => {
    fetch(`/api/leagues/${leagueId}/attendance`)
      .then(r => r.ok ? r.json() : { totalRounds: 0, perPlayer: {} })
      .then(setAttendance)
      .catch(() => { /* ignore */ })
  }, [leagueId])
  // 게스트 숨김 토글 — localStorage 로 세션 간 유지
  const [hideGuests, setHideGuests] = useState<boolean>(false)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`roster:hideGuests:${leagueId}`)
      if (saved === '1') setHideGuests(true)
    } catch { /* SSR 등 접근 실패 무시 */ }
  }, [leagueId])
  useEffect(() => {
    try {
      localStorage.setItem(`roster:hideGuests:${leagueId}`, hideGuests ? '1' : '0')
    } catch { /* ignore */ }
  }, [leagueId, hideGuests])

  // 인증회원(로그인 계정 등록·승인)만 보기 토글 — localStorage 로 세션 간 유지
  const [onlyVerified, setOnlyVerified] = useState<boolean>(false)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`roster:onlyVerified:${leagueId}`)
      if (saved === '1') setOnlyVerified(true)
    } catch { /* SSR 등 접근 실패 무시 */ }
  }, [leagueId])
  useEffect(() => {
    try {
      localStorage.setItem(`roster:onlyVerified:${leagueId}`, onlyVerified ? '1' : '0')
    } catch { /* ignore */ }
  }, [leagueId, onlyVerified])

  const currentYear = new Date().getFullYear()

  // 분기별 기본 기간 (Q1: 1~3월, Q2: 4~6월, Q3: 7~9월, Q4: 10~12월)
  const defaultQuarterDates = (year: number, quarter: number) => {
    const startMonth = (quarter - 1) * 3 + 1            // 1, 4, 7, 10
    const endMonth = startMonth + 2                      // 3, 6, 9, 12
    const lastDay = new Date(year, endMonth, 0).getDate()
    const mm = (m: number) => String(m).padStart(2, '0')
    return {
      start: `${year}-${mm(startMonth)}-01`,
      end: `${year}-${mm(endMonth)}-${lastDay}`,
    }
  }

  // 연도/분기 변경 시 기본 기간 자동 채움
  useEffect(() => {
    const { start, end } = defaultQuarterDates(qYear, qQuarter)
    setQStart(start)
    setQEnd(end)
  }, [qYear, qQuarter])

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

    // 리더 뱃지 (경기일 부문별 1등 카운트) — 실패해도 UI 나머지는 그대로
    fetch(`/api/leagues/${leagueId}/leader-badges`)
      .then(r => r.ok ? r.json() : {})
      .then(data => setLeaderBadges(data ?? {}))
      .catch(() => null)

    // 분기별 팀명/색상 override 룩업 — 각 셀 표시에 사용
    fetch(`/api/leagues/${leagueId}/team-overrides`)
      .then(r => r.ok ? r.json() : [])
      .then((rows: { quarter_id: string; team_id: string; name: string | null; color: string | null }[]) => {
        const map: Record<string, Record<string, { name: string | null; color: string | null }>> = {}
        for (const r of rows) {
          (map[r.quarter_id] ||= {})[r.team_id] = { name: r.name, color: r.color }
        }
        setTeamOverrides(map)
      })
      .catch(() => null)

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
    if (res.ok) {
      const newPlayer = await res.json()
      // 모든 분기에 비정규로 자동 등록
      if (newPlayer?.id && quarters.length > 0) {
        await Promise.all(quarters.map(q =>
          fetch(`/api/leagues/${leagueId}/quarters/${q.id}/players`, {
            method: 'PATCH',
            headers: leagueHeaders,
            body: JSON.stringify({ league_player_id: newPlayer.id, team_id: null, is_regular: false }),
          })
        ))
      }
      toast.success('선수 추가 완료 (비정규 등록)')
      setForm({ name: '', position: [], birth_date: '' })
      setShowForm(false)
      load()
    } else {
      const d = await res.json()
      toast.error(d.error ?? '추가 실패')
    }
    setSaving(false)
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
      body: JSON.stringify({ year: qYear, quarter: qQuarter, is_current: false, start_date: qStart || null, end_date: qEnd || null }),
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
    // 팀 소속이 없는 분기는 모두 비정규로 분류 (미가입/멤버십없음/team_id null 통합)
    if (!m || !m.team_id) return '비정규'
    if (!m.is_regular) return '비정규'
    // 분기별 override 우선, 없으면 base team 이름
    const ov = teamOverrides[quarterId]?.[m.team_id]
    if (ov?.name) return ov.name
    const team = teams.find(t => t.id === m.team_id)
    return team?.name ?? '비정규'
  }

  function getCellTeamColor(quarterId: string, playerId: string): string | null {
    const m = membershipMap[quarterId]?.[playerId]
    if (!m || !m.is_regular || !m.team_id) return null
    const ov = teamOverrides[quarterId]?.[m.team_id]
    if (ov?.color) return ov.color
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
  // - 포지션 필터
  // - 게스트 숨김 필터 (is_guest=true 인 선수 완전 제외)
  // - 정렬: is_guest 인 선수는 정렬 종류 무관하게 항상 최하단
  //   (게스트 flag 없는 이전 버전 호환 위해 name.includes('게스트') 도 폴백)
  const isPlayerGuest = (p: LeaguePlayer) => Boolean(p.is_guest) || p.name.includes('게스트')
  const filteredAndSortedPlayers = players
    .filter(p => {
      if (hideGuests && isPlayerGuest(p)) return false
      if (onlyVerified && !p.has_account) return false
      if (filterPosition === 'ALL') return true
      return parsePositions(p.position).includes(filterPosition)
    })
    .sort((a, b) => {
      const aIsGuest = isPlayerGuest(a)
      const bIsGuest = isPlayerGuest(b)
      if (aIsGuest !== bIsGuest) return aIsGuest ? 1 : -1
      if (sortKey === 'name') return a.name.localeCompare(b.name, 'ko')
      if (sortKey === 'attendance_desc') {
        const ra = attendance.perPlayer[a.id]?.rounds ?? 0
        const rb = attendance.perPlayer[b.id]?.rounds ?? 0
        if (ra !== rb) return rb - ra
        return a.name.localeCompare(b.name, 'ko')
      }
      return 0
    })
  const guestCount = players.filter(isPlayerGuest).length
  const verifiedCount = players.filter(p => p.has_account).length

  return (
    <div className="space-y-4 lg:space-y-5">
      <LeagueSubTabs group="squad" />
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-jersey font-black uppercase text-[28px] lg:text-[40px] leading-none text-[var(--mm-ink)] tracking-tight">선수 명단</h2>
          <p className="text-[var(--mm-muted)] text-sm lg:text-base mt-1 font-bold tracking-[0.12em] uppercase">{players.length}명 등록</p>
        </div>
        {isEditMode ? (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] hover:border-[var(--mm-ink-soft)] transition-colors cursor-pointer font-bold uppercase tracking-[0.1em]"
              title="엑셀 템플릿 다운로드"
            >
              <Download size={12} />템플릿
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={bulkUploading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] hover:border-[var(--mm-ink-soft)] transition-colors cursor-pointer disabled:opacity-40 font-bold uppercase tracking-[0.1em]"
              title="엑셀 파일로 대량 등록"
            >
              {bulkUploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}대량 등록
            </button>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleBulkUpload} />
            <button
              onClick={() => setShowForm(v => !v)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-black uppercase tracking-[0.14em] bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:brightness-95 transition-all cursor-pointer"
            >
              <Plus size={14} className="mr-0.5" />선수 추가
            </button>
          </div>
        ) : (
          <button
            onClick={openPinModal}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] hover:border-[var(--mm-ink-soft)] transition-colors cursor-pointer font-bold uppercase tracking-[0.1em]"
          >
            <Lock size={12} />편집 모드
          </button>
        )}
      </div>

      {/* 회원 가입율 — 게스트 제외 등록 회원 중 로그인 계정 승인 비율 */}
      <SignupRateCard leagueId={leagueId} leagueHeaders={leagueHeaders} isEditMode={isEditMode} />

      {/* 선수 추가 폼 */}
      {showForm && isEditMode && (
        <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-md p-4 space-y-3" style={{ borderLeftWidth: '3px', borderLeftColor: 'var(--mm-yellow-soft)' }}>
          <h3 className="font-jersey font-black uppercase text-[20px] text-[var(--mm-ink)] tracking-tight">새 선수 추가</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              placeholder="이름 *"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && addPlayer()}
              className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]"
            />
            <BirthDateInput
              value={form.birth_date}
              onChange={v => setForm(f => ({ ...f, birth_date: v }))}
            />
          </div>
          <div>
            <p className="text-xs text-[var(--mm-muted)] mb-2 font-bold uppercase tracking-[0.14em]">포지션 (복수 선택 가능)</p>
            <div className="flex flex-wrap gap-2">
              {POSITIONS.map(pos => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => togglePosition(pos, form.position, v => setForm(f => ({ ...f, position: v })))}
                  className={`px-3 py-1 rounded-md text-xs font-black uppercase tracking-[0.12em] border transition-all cursor-pointer ${
                    form.position.includes(pos)
                      ? 'bg-[var(--mm-ink)] border-[var(--mm-ink)] text-[var(--mm-panel)]'
                      : 'bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:border-[var(--mm-ink-soft)]'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={addPlayer}
              disabled={saving}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-black uppercase tracking-[0.14em] bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:brightness-95 disabled:opacity-50 transition-all cursor-pointer"
            >
              {saving ? <Loader2 size={13} className="animate-spin mr-1" /> : null}추가
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-[0.12em] border border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] transition-colors cursor-pointer"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 수정 2: 정렬/필터 컨트롤 */}
      {!loading && players.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 lg:gap-4">
          {/* 정렬 */}
          <div className="flex items-center gap-1.5 lg:gap-2">
            <span className="text-xs lg:text-sm text-[var(--mm-muted)] font-bold uppercase tracking-[0.14em]">정렬</span>
            <div className="flex gap-1">
              {([
                { key: 'name', label: '이름' },
                { key: 'attendance_desc', label: '참석율↓' },
              ] as { key: SortKey; label: string }[]).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setSortKey(key)}
                  className={`px-2.5 py-1 lg:px-3 lg:py-1.5 rounded-md text-xs lg:text-sm font-black uppercase tracking-[0.1em] transition-all cursor-pointer ${
                    sortKey === key
                      ? 'bg-[var(--mm-ink)] text-[var(--mm-panel)] border border-[var(--mm-ink)]'
                      : 'bg-[var(--mm-panel)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] hover:border-[var(--mm-ink-soft)] border border-[var(--mm-rule)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 포지션 필터 */}
          <div className="flex items-center gap-1.5 lg:gap-2 flex-wrap">
            <span className="text-xs lg:text-sm text-[var(--mm-muted)] font-bold uppercase tracking-[0.14em]">포지션</span>
            <div className="flex flex-wrap gap-1">
              {POSITION_FILTER_OPTIONS.map(pos => (
                <button
                  key={pos}
                  onClick={() => setFilterPosition(pos)}
                  className={`px-2.5 py-1 lg:px-3 lg:py-1.5 rounded-md text-xs lg:text-sm font-black uppercase tracking-[0.1em] transition-all cursor-pointer ${
                    filterPosition === pos
                      ? 'bg-[var(--mm-panel)] text-[var(--mm-ink)] border border-[color:var(--color-hoop-orange-500)]'
                      : 'bg-[var(--mm-panel)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] hover:border-[var(--mm-ink-soft)] border border-[var(--mm-rule)]'
                  }`}
                >
                  {pos}
                </button>
              ))}
            </div>
          </div>

          {/* 게스트 숨김 토글 — 이름에 '게스트' 포함되거나 is_guest=true 인 선수를 완전 제외 */}
          {guestCount > 0 && (
            <div className="flex items-center gap-1.5 lg:gap-2 flex-wrap">
              <span className="text-xs lg:text-sm text-[var(--mm-muted)] font-bold uppercase tracking-[0.14em]">게스트</span>
              <button
                onClick={() => setHideGuests(v => !v)}
                aria-pressed={hideGuests}
                className={`px-2.5 py-1 lg:px-3 lg:py-1.5 rounded-md text-xs lg:text-sm font-black uppercase tracking-[0.1em] transition-all cursor-pointer flex items-center gap-1.5 ${
                  hideGuests
                    ? 'bg-[var(--mm-panel)] text-[var(--mm-ink)] border border-[color:var(--color-hoop-orange-500)]'
                    : 'bg-[var(--mm-panel)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] hover:border-[var(--mm-ink-soft)] border border-[var(--mm-rule)]'
                }`}
                title="이름에 '게스트' 가 포함된 단발성 선수 숨기기"
              >
                <span
                  className="inline-block w-3 h-3 rounded-full border"
                  style={{
                    background: hideGuests ? 'var(--color-hoop-orange-500)' : 'transparent',
                    borderColor: hideGuests ? 'var(--color-hoop-orange-500)' : 'var(--mm-muted)',
                  }}
                />
                <span>{hideGuests ? '숨김' : '표시'}</span>
                <span
                  className="text-[10px] lg:text-xs"
                  style={{ color: hideGuests ? 'var(--mm-ink)' : 'var(--mm-muted)' }}
                >({guestCount})</span>
              </button>
            </div>
          )}

          {/* 인증회원만 보기 토글 — has_account(로그인 계정 등록·승인) 인 회원만 노출 */}
          {verifiedCount > 0 && (
            <div className="flex items-center gap-1.5 lg:gap-2 flex-wrap">
              <span className="text-xs lg:text-sm text-[var(--mm-muted)] font-bold uppercase tracking-[0.14em]">인증</span>
              <button
                onClick={() => setOnlyVerified(v => !v)}
                aria-pressed={onlyVerified}
                className={`px-2.5 py-1 lg:px-3 lg:py-1.5 rounded-md text-xs lg:text-sm font-black uppercase tracking-[0.1em] transition-all cursor-pointer flex items-center gap-1.5 ${
                  onlyVerified
                    ? 'bg-[var(--mm-panel)] text-[var(--mm-ink)] border border-[color:var(--color-hoop-orange-500)]'
                    : 'bg-[var(--mm-panel)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] hover:border-[var(--mm-ink-soft)] border border-[var(--mm-rule)]'
                }`}
                title="로그인 계정을 등록·인증한 회원만 표시"
              >
                <ShieldCheck
                  size={13}
                  aria-hidden
                  className="shrink-0"
                  style={{ color: onlyVerified ? 'var(--color-hoop-orange-500)' : 'var(--mm-muted)' }}
                />
                <span>{onlyVerified ? '인증회원만' : '전체'}</span>
                <span
                  className="text-[10px] lg:text-xs"
                  style={{ color: onlyVerified ? 'var(--mm-ink)' : 'var(--mm-muted)' }}
                >({verifiedCount})</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* 선수 카드 그리드 */}
      {loading ? (
        <div className="flex justify-center py-12">
          <BasketballLoader size={32} />
        </div>
      ) : players.length === 0 ? (
        <EmptyState
          Icon={Users}
          title="등록된 선수가 없습니다"
          description="리그에 선수를 등록하면 명단·스탯·리더보드에 자동 반영됩니다."
          isEditMode={isEditMode}
          editorHint="위의 '선수 추가' 버튼 또는 CSV 업로드로 시작하세요"
        />
      ) : filteredAndSortedPlayers.length === 0 ? (
        <EmptyState
          Icon={Users}
          title="조건에 맞는 선수가 없습니다"
          description="포지션 · 정렬 필터를 조절하거나 초기화해 보세요."
          size="sm"
        >
          <button
            onClick={() => { setFilterPosition('ALL'); setSortKey('name'); setOnlyVerified(false); setHideGuests(false) }}
            className="text-xs font-black uppercase tracking-[0.14em] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] cursor-pointer transition-colors underline underline-offset-4 decoration-[var(--mm-ink-soft)]"
          >
            필터 초기화
          </button>
        </EmptyState>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-2.5 lg:gap-3">
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
                className="relative bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-md overflow-hidden hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] hover:-translate-y-0.5 transition-all duration-200 cursor-pointer group"
                onClick={() => setSelectedPlayer(p)}
              >
                {/* 팀 컬러 왼쪽 스트립 (팀 컬러 유지 — 팀 식별 데이터) · hover 시 노랑 accent 폴백 */}
                {cardAccent ? (
                  <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: cardAccent }} />
                ) : (
                  <span
                    aria-hidden
                    className="absolute left-0 top-0 bottom-0 w-[3px] opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    style={{ background: 'var(--mm-yellow-soft)' }}
                  />
                )}

                <div className="p-2.5 pl-3.5 lg:p-3 lg:pl-4 flex gap-2.5 lg:gap-3">
                  {/* 4:5 썸네일 — 프로 선수 프로필처럼 크게 (모바일에선 이름 여유 확보를 위해 축소) */}
                  <div className="shrink-0 w-24 h-[120px] sm:w-32 sm:h-[160px] lg:w-40 lg:h-[200px] rounded-md overflow-hidden border border-[var(--mm-rule)] flex items-center justify-center bg-[var(--mm-panel-alt)] relative">
                    {p.photo_url ? (
                      // next/image · 로스터 그리드는 대량(30+명) → 기본 lazy · sizes 반응형
                      <Image
                        src={p.photo_url}
                        alt={p.name}
                        fill
                        sizes="(max-width: 640px) 96px, (max-width: 1024px) 128px, 160px"
                        className="object-cover object-top"
                      />
                    ) : (
                      <span className="font-jersey text-2xl lg:text-3xl font-black text-[var(--mm-muted)] leading-none text-center px-0.5 uppercase">
                        {p.name.length > 1 ? p.name.slice(1) : p.name}
                      </span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                  {/* 헤더: 이름 + +1 + 삭제 */}
                  <div className="flex items-start gap-2 mb-1.5 lg:mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {isAnyLeader && <Crown size={12} className="lg:w-3.5 lg:h-3.5 text-[var(--mm-ink)] shrink-0" />}
                        <span className="font-jersey text-[20px] lg:text-[26px] font-black uppercase text-[var(--mm-ink)] break-keep min-w-0 tracking-tight group-hover:underline underline-offset-4 decoration-[3px] decoration-[var(--mm-yellow-soft)]" style={{ lineHeight: 1.15, wordBreak: 'break-word', overflowWrap: 'anywhere' }}>{p.name}</span>
                      </div>
                      {p.number !== null && (
                        <span className="font-jersey text-xs tabular-nums text-[var(--mm-muted)] font-black tracking-wider">#{p.number}</span>
                      )}
                    </div>
                    {/* +1 배지/토글 */}
                    {isEditMode ? (
                      <button
                        onClick={e => { e.stopPropagation(); togglePlusOne(p.id, p.plus_one) }}
                        className={`shrink-0 inline-flex items-center justify-center min-h-[44px] min-w-[44px] px-2 rounded-md text-xs font-black tracking-wider border transition-all cursor-pointer ${
                          p.plus_one
                            ? 'bg-[var(--mm-panel-alt)] text-[var(--mm-ink)] border-[var(--mm-ink-soft)] hover:brightness-95'
                            : 'bg-[var(--mm-panel-alt)] text-[var(--mm-muted)] border-[var(--mm-rule)] hover:border-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)]'
                        }`}
                        title={p.plus_one ? '+1 해제' : '+1 활성화'}
                      >
                        +1
                      </button>
                    ) : p.plus_one ? (
                      <span className="shrink-0 px-2 py-0.5 rounded-md text-xs font-black tracking-wider bg-[var(--mm-panel-alt)] text-[var(--mm-ink)] border border-[var(--mm-rule)]">
                        +1
                      </span>
                    ) : null}
                    {isEditMode && (
                      <button
                        onClick={e => { e.stopPropagation(); deletePlayer(p.id) }}
                        disabled={deletingId === p.id}
                        className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] text-[var(--mm-muted)] hover:text-[var(--mm-live)] transition-colors cursor-pointer disabled:opacity-40 shrink-0"
                        title="선수 삭제"
                        aria-label="선수 삭제"
                      >
                        {deletingId === p.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    )}
                  </div>

                  {/* 포지션 배지 (한 줄) + 게스트 뱃지 */}
                  <div className="flex flex-wrap items-center gap-1 lg:gap-1.5 mb-1.5 lg:mb-2 min-h-[22px]">
                    {positions.length > 0
                      ? positions.map(pos => <PositionBadge key={pos} pos={pos} />)
                      : <span className="text-xs text-[var(--mm-muted)] uppercase tracking-[0.12em] font-bold">포지션 미지정</span>
                    }
                    {isPlayerGuest(p) && (
                      <span
                        className="px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-[0.12em] border bg-[var(--mm-panel-alt)] text-[var(--mm-muted)] border-[var(--mm-rule)]"
                        title="단발성 게스트 선수 — 로스터 하단으로 정렬됩니다"
                      >
                        게스트
                      </span>
                    )}
                    {/* 인증 뱃지 — 로그인 계정을 등록·승인받은 회원 (브랜드 옐로 채움으로 중립 뱃지와 구분) */}
                    {p.has_account && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-[0.12em] bg-[var(--mm-yellow)] text-[var(--mm-black)]"
                        title="로그인 계정을 등록·인증한 회원"
                      >
                        <ShieldCheck size={11} aria-hidden className="shrink-0" />
                        인증
                      </span>
                    )}
                    {/* 참석율 (R 라운드 기준) — 참여 이력 있는 선수만 노출 */}
                    {attendance.perPlayer[p.id] && attendance.totalRounds > 0 && (
                      <span
                        className="px-1.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-[0.12em] border bg-[var(--mm-panel-alt)] text-[var(--mm-ink-soft)] border-[var(--mm-rule)] tabular-nums"
                        title={`참석율 · ${attendance.perPlayer[p.id].rounds}/${attendance.totalRounds} 라운드`}
                      >
                        참석 {attendance.perPlayer[p.id].rate}%
                        <span className="ml-1 text-[var(--mm-muted)]">
                          ({attendance.perPlayer[p.id].rounds}R)
                        </span>
                      </span>
                    )}
                  </div>

                  {/* 리더 뱃지 요약 (경기일 부문별 1등 카운트) */}
                  {leaderBadges[p.id] && (
                    <LeaderBadgeInline badges={leaderBadges[p.id]} className="mb-2" />
                  )}

                  {/* 분기별 팀 배정 — 팀명을 버튼(chip) 형태로 */}
                  {displayQuarters.length > 0 && (
                    <div className="border-t border-[var(--mm-rule)] pt-2 mt-1 space-y-1.5">
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
                          <div key={q.id} className="flex items-center gap-2">
                            <span
                              className="font-jersey text-xs lg:text-sm tabular-nums font-black shrink-0 tracking-wider"
                              style={{ color: q.is_current ? 'var(--mm-ink)' : 'var(--mm-muted)' }}
                            >
                              {String(q.year).slice(2)}.{q.quarter}Q
                            </span>
                            {isSaving ? (
                              <Loader2 size={12} className="animate-spin text-[var(--mm-muted)] ml-auto" />
                            ) : isEditingCell && isEditMode ? (
                              /* 인라인 chip 팝오버 — 팀 선택 */
                              <div
                                className="flex flex-wrap items-center gap-1 ml-auto"
                                onClick={e => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => updateMembership(q.id, p.id, null, false)}
                                  className={`text-xs font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                                    isRegular === false
                                      ? 'bg-[var(--mm-ink)] border-[var(--mm-ink)] text-[var(--mm-panel)]'
                                      : 'bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-muted)] hover:border-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)]'
                                  }`}
                                >
                                  비정규
                                </button>
                                {teams.map(t => {
                                  const ov = teamOverrides[q.id]?.[t.id]
                                  const displayName = ov?.name ?? t.name
                                  const displayColor = ov?.color ?? t.color
                                  const active = isRegular && teamId === t.id
                                  return (
                                    <button
                                      key={t.id}
                                      onClick={() => updateMembership(q.id, p.id, t.id, true)}
                                      className={`flex items-center gap-1 text-xs font-black uppercase tracking-[0.1em] px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                                        active
                                          ? 'text-[var(--mm-ink)]'
                                          : 'border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:border-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)]'
                                      }`}
                                      style={active ? { backgroundColor: `${displayColor}20`, borderColor: displayColor } : undefined}
                                    >
                                      <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: displayColor }} />
                                      {displayName}
                                    </button>
                                  )
                                })}
                                <button
                                  onClick={() => setEditingCell(null)}
                                  className="text-[var(--mm-muted)] hover:text-[var(--mm-ink)] p-0.5 cursor-pointer"
                                  title="닫기"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 ml-auto">
                                {isRegular && teamId && (
                                  <>
                                    {isEditMode ? (
                                      <button
                                        onClick={e => { e.stopPropagation(); toggleLeader(q.id, teamId, p.id) }}
                                        className="transition-colors cursor-pointer"
                                        style={{ color: isPlayerLeader ? 'var(--mm-ink)' : 'var(--mm-muted)' }}
                                      ><Crown size={12} /></button>
                                    ) : isPlayerLeader ? (
                                      <Crown size={12} style={{ color: 'var(--mm-ink)' }} />
                                    ) : null}
                                  </>
                                )}
                                <button
                                  onClick={e => { e.stopPropagation(); if (isEditMode) setEditingCell({ playerId: p.id, quarterId: q.id }) }}
                                  className={`inline-flex items-center gap-1.5 text-xs lg:text-sm font-black uppercase tracking-[0.1em] px-2.5 py-1 rounded-md border transition-all ${
                                    label === '—' ? 'border-[var(--mm-rule)] text-[var(--mm-muted)]' :
                                    label === '비정규' ? 'border-[var(--mm-rule)] text-[var(--mm-muted)]' :
                                    'border-[var(--mm-rule)] text-[var(--mm-ink)]'
                                  } ${isEditMode ? 'cursor-pointer hover:border-[var(--mm-ink-soft)]' : 'cursor-default'}`}
                                  style={label !== '—' && label !== '비정규' && teamColor && !isEditMode ? { borderColor: `${teamColor}70` } : undefined}
                                >
                                  {label !== '—' && label !== '비정규' && teamColor
                                    ? <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: teamColor }} />
                                    : null}
                                  <span>{label}</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* 카드 클릭 힌트 */}
                  <p className="mt-2 pt-2 border-t border-[var(--mm-rule)] text-[11px] uppercase tracking-[0.14em] font-bold text-[var(--mm-muted)] group-hover:text-[var(--mm-ink)] transition-colors">
                    카드 열기 →
                  </p>
                  </div>{/* flex-1 end */}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 분기 관리 */}
      {isEditMode && (
        <SectionCard variant="standalone" className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-jersey font-black uppercase text-[20px] text-[var(--mm-ink)] tracking-tight">분기 관리</h3>
            <button
              onClick={() => setShowQForm(v => !v)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] hover:border-[var(--mm-ink-soft)] cursor-pointer transition-colors font-bold uppercase tracking-[0.1em]"
            >
              <Plus size={12} />분기 추가
            </button>
          </div>
          {quarters.length === 0 && !showQForm && (
            <p className="text-xs text-[var(--mm-muted)]">아직 등록된 분기가 없습니다. 분기를 추가해 팀 구성을 관리하세요.</p>
          )}
          {quarters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {quarters.map(q => (
                <span
                  key={q.id}
                  className={`font-jersey text-xs tabular-nums px-2.5 py-1 rounded-md border font-black tracking-wider ${
                    q.is_current
                      ? 'border-[var(--mm-ink)] bg-[var(--mm-ink)] text-[var(--mm-panel)]'
                      : 'border-[var(--mm-rule)] text-[var(--mm-ink-soft)]'
                  }`}
                >
                  {String(q.year).slice(2)}.{q.quarter}Q{q.is_current ? ' ●' : ''}
                </span>
              ))}
            </div>
          )}
          {showQForm && (
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={qYear}
                  onChange={e => setQYear(Number(e.target.value))}
                  className="bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] text-[var(--mm-ink)] rounded-md px-3 py-2 text-sm cursor-pointer"
                >
                  {[currentYear - 1, currentYear, currentYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <select
                  value={qQuarter}
                  onChange={e => setQQuarter(Number(e.target.value))}
                  className="bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] text-[var(--mm-ink)] rounded-md px-3 py-2 text-sm cursor-pointer"
                >
                  {[1, 2, 3, 4].map(q => <option key={q} value={q}>{q}Q</option>)}
                </select>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs text-[var(--mm-muted)] font-bold uppercase tracking-[0.14em]">시작일</label>
                  <input type="date" value={qStart} onChange={e => setQStart(e.target.value)}
                    className="bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] text-[var(--mm-ink)] rounded-md px-3 py-2 text-sm cursor-pointer" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <label className="text-xs text-[var(--mm-muted)] font-bold uppercase tracking-[0.14em]">종료일</label>
                  <input type="date" value={qEnd} onChange={e => setQEnd(e.target.value)}
                    className="bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] text-[var(--mm-ink)] rounded-md px-3 py-2 text-sm cursor-pointer" />
                </div>
              </div>
              <p className="text-xs text-[var(--mm-muted)]">기간은 분기 선택 시 자동 입력됩니다 (Q3 = 7~9월, Q4 = 10~12월). 필요 시 직접 수정하세요.</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={createQuarter}
                  disabled={savingQ}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-black uppercase tracking-[0.14em] bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:brightness-95 disabled:opacity-50 transition-all cursor-pointer"
                >
                  {savingQ ? <Loader2 size={13} className="animate-spin" /> : '생성'}
                </button>
                <button
                  onClick={() => setShowQForm(false)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-[0.12em] border border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] transition-colors cursor-pointer"
                >
                  취소
                </button>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {/* 수정 3: 선수 상세 모달 */}
      {selectedPlayer && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={selectedPlayer.id}
          playerName={selectedPlayer.name}
          isEditMode={isEditMode}
          leagueHeaders={leagueHeaders}
          onSaved={() => load()}
          onDeleted={() => { setSelectedPlayer(null); load() }}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

    </div>
  )
}
