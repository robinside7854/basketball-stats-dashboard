'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Loader2, Lock, Eye, EyeOff, RefreshCw, Youtube, Calendar } from 'lucide-react'
import type { League } from '@/types/league'

type Quarter = { id: string; year: number; quarter: number; is_current: boolean; start_date: string | null; end_date: string | null }

const DOW_OPTIONS = [
  { value: 'monday', label: '월요일' }, { value: 'tuesday', label: '화요일' },
  { value: 'wednesday', label: '수요일' }, { value: 'thursday', label: '목요일' },
  { value: 'friday', label: '금요일' }, { value: 'saturday', label: '토요일' },
  { value: 'sunday', label: '일요일' },
]
const STATUS_OPTIONS = [
  { value: 'upcoming', label: '예정', color: 'text-yellow-400' },
  { value: 'active', label: '진행 중', color: 'text-green-400' },
  { value: 'completed', label: '완료', color: 'text-gray-400' },
]

export default function LeagueSettingsPage() {
  const params = useParams<{ leagueId: string }>()
  const { leagueId } = params
  const { isEditMode, leagueHeaders, openPinModal } = useLeagueEditMode()

  const [league, setLeague] = useState<League | null>(null)
  const [loading, setLoading] = useState(true)

  // editable fields
  const [status, setStatus] = useState('')
  const [matchDay, setMatchDay] = useState('saturday')
  const [startDate, setStartDate] = useState('')
  const [seasonType, setSeasonType] = useState<'annual' | 'quarterly'>('annual')
  const [gamesPerRound, setGamesPerRound] = useState(1)
  const [pin, setPin] = useState('')
  const [pinVisible, setPinVisible] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)

  // YouTube 채널 핸들 (DB 저장)
  const [ytChannel, setYtChannel] = useState('')

  // 플러스원 나이 기준
  const [plusOneAge, setPlusOneAge] = useState<string>('')

  // 분기 날짜 범위 관리
  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [editingQuarter, setEditingQuarter] = useState<string | null>(null)
  const [qStartDate, setQStartDate] = useState('')
  const [qEndDate, setQEndDate] = useState('')
  const [savingQuarter, setSavingQuarter] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [res, qRes] = await Promise.all([
      fetch(`/api/leagues/${leagueId}`),
      fetch(`/api/leagues/${leagueId}/quarters`),
    ])
    if (res.ok) {
      const data: League = await res.json()
      setLeague(data)
      setStatus(data.status)
      setMatchDay(data.match_day)
      setStartDate(data.start_date)
      setSeasonType(data.season_type)
      setGamesPerRound(data.games_per_round)
      setPin(data.edit_pin ?? '0000')
      setYtChannel(data.youtube_channel ?? '')
      setPlusOneAge(data.plus_one_age != null ? String(data.plus_one_age) : '')
    }
    if (qRes.ok) setQuarters(await qRes.json())
    setLoading(false)
  }

  async function saveQuarterDates(quarterId: string) {
    setSavingQuarter(quarterId)
    const res = await fetch(`/api/leagues/${leagueId}/quarters`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...leagueHeaders },
      body: JSON.stringify({ quarterId, start_date: qStartDate || null, end_date: qEndDate || null }),
    })
    setSavingQuarter(null)
    if (res.ok) {
      toast.success('분기 날짜 저장 완료')
      setEditingQuarter(null)
      const qRes = await fetch(`/api/leagues/${leagueId}/quarters`)
      if (qRes.ok) setQuarters(await qRes.json())
    } else {
      toast.error('저장 실패')
    }
  }

  useEffect(() => { load() }, [leagueId])

  async function save(field: string, body: object) {
    setSaving(field)
    const res = await fetch(`/api/leagues/${leagueId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setSaving(null)
    if (res.ok) { toast.success('저장 완료'); load() }
    else toast.error('저장 실패')
  }

  async function savePin() {
    if (!/^\d{4}$/.test(pin)) { toast.error('PIN은 숫자 4자리여야 합니다'); return }
    setSaving('pin')
    const res = await fetch(`/api/leagues/${leagueId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ edit_pin: pin }),
    })
    setSaving(null)
    if (res.ok) toast.success('PIN 변경 완료 — 재로그인이 필요합니다')
    else toast.error('저장 실패')
  }

  async function generateSchedule() {
    if (!confirm('기존 일정이 모두 삭제되고 새로 생성됩니다. 계속하시겠습니까?')) return
    setSaving('schedule')
    const res = await fetch(`/api/leagues/${leagueId}/schedule`, {
      method: 'POST',
      headers: leagueHeaders,
    })
    setSaving(null)
    if (res.ok) {
      const d = await res.json()
      toast.success(`일정 ${d.count}개 생성 완료`)
    } else {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? '생성 실패')
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-500" /></div>
  if (!league) return null

  if (!isEditMode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
        <Lock size={28} className="text-gray-600" />
        <div>
          <div className="text-base font-bold text-white">편집 모드에서 설정 가능합니다</div>
          <p className="text-gray-500 text-sm mt-1">PIN을 입력해 편집 모드를 활성화하세요</p>
        </div>
        <button onClick={openPinModal} className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium cursor-pointer transition-colors">
          PIN 입력
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-lg">
      <h2 className="text-xl font-bold text-white">리그 설정</h2>

      {/* 리그 상태 */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold text-white text-sm">리그 상태</h3>
        <div className="flex gap-2">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-medium transition-colors cursor-pointer ${
                status === opt.value ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
              }`}
            >
              <span className={status === opt.value ? opt.color : ''}>{opt.label}</span>
            </button>
          ))}
        </div>
        <Button
          onClick={() => save('status', { status })}
          disabled={saving === 'status' || status === league.status}
          className="w-full bg-blue-600 hover:bg-blue-500 cursor-pointer"
          size="sm"
        >
          {saving === 'status' ? <Loader2 size={13} className="animate-spin mr-1" /> : null}상태 저장
        </Button>
      </div>

      {/* 정기 일정 설정 */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
        <h3 className="font-semibold text-white text-sm">정기 일정 설정</h3>

        <div className="space-y-1.5">
          <label className="text-xs text-gray-400">정기 경기 요일</label>
          <select
            value={matchDay}
            onChange={e => setMatchDay(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 text-white rounded-md px-3 py-2 text-sm cursor-pointer"
          >
            {DOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-gray-400">첫 정기 일정 날짜</label>
          <Input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="bg-gray-800 border-gray-700 text-white"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs text-gray-400">시즌 구분</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'annual', label: '연간 (1년)' },
              { value: 'quarterly', label: '분기별 (3개월)' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setSeasonType(opt.value as 'annual' | 'quarterly')}
                className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-colors cursor-pointer ${
                  seasonType === opt.value ? 'border-blue-500 bg-blue-500/10 text-white' : 'border-gray-700 bg-gray-800 text-gray-400 hover:border-gray-500'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-gray-400">정규일정 당 경기 수</label>
          <Input
            type="number" min={1} max={10}
            value={gamesPerRound}
            onChange={e => setGamesPerRound(Number(e.target.value))}
            className="bg-gray-800 border-gray-700 text-white"
          />
        </div>

        <Button
          onClick={() => save('schedule-settings', { match_day: matchDay, start_date: startDate, season_type: seasonType, games_per_round: gamesPerRound })}
          disabled={saving === 'schedule-settings'}
          className="w-full bg-blue-600 hover:bg-blue-500 cursor-pointer"
          size="sm"
        >
          {saving === 'schedule-settings' ? <Loader2 size={13} className="animate-spin mr-1" /> : null}설정 저장
        </Button>
      </div>

      {/* 일정 자동 생성 */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold text-white text-sm">일정 자동 생성</h3>
        <p className="text-xs text-gray-500">팀 구성이 완료된 후 위 설정 기준으로 일정을 생성합니다. 기존 일정은 삭제됩니다.</p>
        <Button
          onClick={generateSchedule}
          disabled={saving === 'schedule'}
          variant="outline"
          className="w-full border-gray-700 text-gray-300 hover:text-white cursor-pointer"
          size="sm"
        >
          {saving === 'schedule' ? <Loader2 size={13} className="animate-spin mr-1" /> : null}일정 자동 생성
        </Button>
      </div>

      {/* YouTube 채널 설정 */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Youtube size={16} className="text-red-500" />
          <h3 className="font-semibold text-white text-sm">YouTube 채널 설정</h3>
        </div>
        <p className="text-xs text-gray-500">
          경기 기록 탭에서 날짜별 YouTube 자동 연동에 사용됩니다.<br />
          영상 제목 형식: <span className="font-mono text-gray-400">260418 경기 9</span>
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="@채널핸들 (예: @미라클모닝농구단)"
            value={ytChannel}
            onChange={e => setYtChannel(e.target.value)}
            className="bg-gray-800 border-gray-700 text-white flex-1"
          />
          <Button
            onClick={() => save('youtube', { youtube_channel: ytChannel.trim() || null })}
            disabled={saving === 'youtube'}
            className="bg-red-600 hover:bg-red-500 cursor-pointer shrink-0"
            size="sm"
          >
            {saving === 'youtube' ? <Loader2 size={13} className="animate-spin" /> : '저장'}
          </Button>
        </div>
        {league.youtube_channel && (
          <p className="text-xs text-gray-600">현재: <span className="text-red-400 font-mono">{league.youtube_channel}</span></p>
        )}
      </div>

      {/* 플러스원(+1) 나이 기준 */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full">+1</span>
          <h3 className="font-semibold text-white text-sm">플러스원 나이 기준</h3>
        </div>
        <p className="text-xs text-gray-500">
          해당 만 나이 이상 선수에게 자유투 제외 득점 +1이 가산됩니다.<br />
          비워두면 플러스원 제도 미사용.
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="number" min={1} max={99} placeholder="예: 40"
            value={plusOneAge}
            onChange={e => setPlusOneAge(e.target.value)}
            className="bg-gray-800 border-gray-700 text-white w-24"
          />
          <span className="text-sm text-gray-400">세 이상</span>
          <Button
            onClick={() => save('plus_one_age', { plus_one_age: plusOneAge ? Number(plusOneAge) : null })}
            disabled={saving === 'plus_one_age'}
            className="bg-amber-600 hover:bg-amber-500 cursor-pointer shrink-0"
            size="sm"
          >
            {saving === 'plus_one_age' ? <Loader2 size={13} className="animate-spin" /> : '저장'}
          </Button>
        </div>
        {league.plus_one_age && (
          <p className="text-xs text-gray-600">현재 기준: <span className="text-amber-400 font-mono">만 {league.plus_one_age}세</span> 이상</p>
        )}
      </div>

      {/* PIN 변경 */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
        <h3 className="font-semibold text-white text-sm">편집 PIN 변경</h3>
        <div className="flex items-center gap-2">
          <Input
            type={pinVisible ? 'text' : 'password'}
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            maxLength={4}
            placeholder="4자리 PIN"
            className="bg-gray-800 border-gray-700 text-white font-mono text-xl tracking-[0.5em] flex-1"
          />
          <button onClick={() => setPinVisible(v => !v)} className="p-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white cursor-pointer shrink-0">
            {pinVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            onClick={() => { setPin(String(Math.floor(1000 + Math.random() * 9000))); setPinVisible(true) }}
            className="p-2.5 rounded-lg border border-gray-700 text-gray-400 hover:text-white cursor-pointer shrink-0"
            title="랜덤 재발급"
          >
            <RefreshCw size={14} />
          </button>
          <Button onClick={savePin} disabled={saving === 'pin'} className="bg-blue-600 hover:bg-blue-500 cursor-pointer shrink-0" size="sm">
            저장
          </Button>
        </div>
        <p className="text-xs text-gray-600">PIN 변경 후 현재 세션은 유지되며 다음 접속 시 새 PIN이 적용됩니다</p>
      </div>

      {/* 분기 날짜 범위 설정 */}
      {quarters.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-blue-400" />
            <h3 className="font-semibold text-white text-sm">분기별 날짜 범위</h3>
          </div>
          <p className="text-xs text-gray-500">
            각 분기의 시작일/종료일을 지정하면 경기 날짜 → 분기 자동 매핑, 분기별 스탯 집계에 사용됩니다.
          </p>
          <div className="space-y-2">
            {quarters.map(q => (
              <div key={q.id} className="bg-gray-800 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-semibold ${q.is_current ? 'text-blue-400' : 'text-white'}`}>
                    {String(q.year).slice(2)}.{q.quarter}Q {q.is_current ? '● 현재' : ''}
                  </span>
                  {editingQuarter !== q.id && (
                    <button
                      onClick={() => {
                        setEditingQuarter(q.id)
                        setQStartDate(q.start_date ?? '')
                        setQEndDate(q.end_date ?? '')
                      }}
                      className="text-xs text-gray-400 hover:text-white cursor-pointer"
                    >편집</button>
                  )}
                </div>
                {editingQuarter === q.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-500">시작일</label>
                        <Input type="date" value={qStartDate} onChange={e => setQStartDate(e.target.value)}
                          className="bg-gray-700 border-gray-600 text-white text-xs mt-0.5" />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500">종료일</label>
                        <Input type="date" value={qEndDate} onChange={e => setQEndDate(e.target.value)}
                          className="bg-gray-700 border-gray-600 text-white text-xs mt-0.5" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveQuarterDates(q.id)}
                        disabled={savingQuarter === q.id}
                        className="bg-blue-600 hover:bg-blue-500 cursor-pointer text-xs">
                        {savingQuarter === q.id ? <Loader2 size={11} className="animate-spin" /> : '저장'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingQuarter(null)}
                        className="border-gray-700 text-gray-400 cursor-pointer text-xs">취소</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">
                    {q.start_date ? `${q.start_date} ~ ${q.end_date ?? '미지정'}` : '날짜 미설정 (달력 분기 자동 계산)'}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
