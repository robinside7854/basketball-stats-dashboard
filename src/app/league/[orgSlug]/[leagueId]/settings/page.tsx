'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Loader2, Lock, Eye, EyeOff, RefreshCw, Youtube, Calendar } from 'lucide-react'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import AccountApprovalPanel from '@/components/league/auth/AccountApprovalPanel'
import type { League } from '@/types/league'

type Quarter = { id: string; year: number; quarter: number; is_current: boolean; start_date: string | null; end_date: string | null }

const DOW_OPTIONS = [
  { value: 'monday', label: '월요일' }, { value: 'tuesday', label: '화요일' },
  { value: 'wednesday', label: '수요일' }, { value: 'thursday', label: '목요일' },
  { value: 'friday', label: '금요일' }, { value: 'saturday', label: '토요일' },
  { value: 'sunday', label: '일요일' },
]
const STATUS_OPTIONS = [
  { value: 'upcoming', label: '예정', color: 'text-[color:var(--mm-yellow-strong)]' },
  { value: 'active', label: '진행 중', color: 'text-[#059669]' },
  { value: 'completed', label: '완료', color: 'text-[color:var(--mm-muted)]' },
]

export default function LeagueSettingsPage() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params
  const router = useRouter()
  const { isEditMode, isInitialized, leagueHeaders, openPinModal } = useLeagueEditMode()

  // 서버 가드 대체 — 편집 모드 확인 후 미인증이면 리그 홈으로 리다이렉트.
  //   PIN 이 sessionStorage 기반이라 middleware 로는 검증 불가 → 클라이언트 마운트 시점 가드.
  //   isInitialized=true 이후에만 판단 (초기 렌더 flash 방지).
  useEffect(() => {
    if (isInitialized && !isEditMode) {
      router.replace(`/league/${orgSlug}/${leagueId}`)
    }
  }, [isInitialized, isEditMode, orgSlug, leagueId, router])

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

  if (loading) return <div className="flex justify-center py-12"><BasketballLoader size={32} /></div>
  if (!league) return null

  if (!isEditMode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
        <Lock size={28} className="text-[color:var(--mm-muted)]" />
        <div>
          <div className="font-jersey font-black uppercase text-xl text-[color:var(--mm-ink)]">편집 모드에서 설정 가능합니다</div>
          <p className="text-[color:var(--mm-muted)] text-sm mt-1">PIN을 입력해 편집 모드를 활성화하세요</p>
        </div>
        <button
          onClick={openPinModal}
          className="px-6 py-2.5 bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)] text-sm font-bold uppercase tracking-[0.16em] cursor-pointer transition-colors hover:brightness-95"
        >
          PIN 입력
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-5 max-w-lg">
      <h2 className="font-jersey font-black uppercase text-3xl tracking-tight text-[color:var(--mm-ink)]">리그 설정</h2>

      {/* 회원 가입 · 계정 관리 (2026-07-20 신규) */}
      <AccountApprovalPanel leagueId={leagueId} leagueHeaders={leagueHeaders} />

      {/* 리그 상태 */}
      <div className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] p-5 space-y-3">
        <h3 className="font-jersey font-black uppercase text-lg text-[color:var(--mm-ink)]">리그 상태</h3>
        <div className="flex gap-2">
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => setStatus(opt.value)}
              className={`flex-1 py-2.5 border text-sm font-bold uppercase tracking-[0.12em] transition-colors cursor-pointer ${
                status === opt.value
                  ? 'border-[color:var(--mm-ink)] bg-[color:var(--mm-yellow-soft)] text-[color:var(--mm-ink)]'
                  : 'border-[color:var(--mm-rule)] bg-[color:var(--mm-panel-alt)] text-[color:var(--mm-muted)] hover:border-[color:var(--mm-ink-soft)]'
              }`}
            >
              <span className={status === opt.value ? opt.color : ''}>{opt.label}</span>
            </button>
          ))}
        </div>
        <Button
          onClick={() => save('status', { status })}
          disabled={saving === 'status' || status === league.status}
          className="w-full bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)] hover:brightness-95 hover:bg-[color:var(--mm-yellow)] cursor-pointer font-bold uppercase tracking-[0.14em] rounded-none"
          size="sm"
        >
          {saving === 'status' ? <Loader2 size={13} className="animate-spin mr-1" /> : null}상태 저장
        </Button>
      </div>

      {/* 정기 일정 설정 */}
      <div className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] p-5 space-y-4">
        <h3 className="font-jersey font-black uppercase text-lg text-[color:var(--mm-ink)]">정기 일정 설정</h3>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--mm-muted)]">정기 경기 요일</label>
          <select
            value={matchDay}
            onChange={e => setMatchDay(e.target.value)}
            className="w-full bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] text-[color:var(--mm-ink)] rounded-none px-3 py-2 text-sm cursor-pointer focus:outline-none focus:border-[color:var(--mm-ink)]"
          >
            {DOW_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--mm-muted)]">첫 정기 일정 날짜</label>
          <Input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="bg-[color:var(--mm-panel)] border-[color:var(--mm-rule)] text-[color:var(--mm-ink)] rounded-none"
          />
        </div>

        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--mm-muted)]">시즌 구분</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'annual', label: '연간 (1년)' },
              { value: 'quarterly', label: '분기별 (3개월)' },
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setSeasonType(opt.value as 'annual' | 'quarterly')}
                className={`py-2.5 px-3 border text-sm font-bold uppercase tracking-[0.12em] transition-colors cursor-pointer ${
                  seasonType === opt.value
                    ? 'border-[color:var(--mm-ink)] bg-[color:var(--mm-yellow-soft)] text-[color:var(--mm-ink)]'
                    : 'border-[color:var(--mm-rule)] bg-[color:var(--mm-panel-alt)] text-[color:var(--mm-muted)] hover:border-[color:var(--mm-ink-soft)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--mm-muted)]">정규일정 당 경기 수</label>
          <Input
            type="number" min={1} max={10}
            value={gamesPerRound}
            onChange={e => setGamesPerRound(Number(e.target.value))}
            className="bg-[color:var(--mm-panel)] border-[color:var(--mm-rule)] text-[color:var(--mm-ink)] rounded-none"
          />
        </div>

        <Button
          onClick={() => save('schedule-settings', { match_day: matchDay, start_date: startDate, season_type: seasonType, games_per_round: gamesPerRound })}
          disabled={saving === 'schedule-settings'}
          className="w-full bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)] hover:brightness-95 hover:bg-[color:var(--mm-yellow)] cursor-pointer font-bold uppercase tracking-[0.14em] rounded-none"
          size="sm"
        >
          {saving === 'schedule-settings' ? <Loader2 size={13} className="animate-spin mr-1" /> : null}설정 저장
        </Button>
      </div>

      {/* 일정 자동 생성은 '경기 > 일정' 페이지로 이동했습니다 */}

      {/* YouTube 채널 설정 */}
      <div className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Youtube size={16} className="text-[color:var(--mm-live)]" />
          <h3 className="font-jersey font-black uppercase text-lg text-[color:var(--mm-ink)]">YouTube 채널 설정</h3>
        </div>
        <p className="text-xs text-[color:var(--mm-muted)] leading-relaxed">
          경기 기록 탭에서 날짜별 YouTube 자동 연동에 사용됩니다.<br />
          영상 제목 형식: <span className="font-mono text-[color:var(--mm-ink-soft)]">260418 경기 9</span>
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="@채널핸들 (예: @미라클모닝농구단)"
            value={ytChannel}
            onChange={e => setYtChannel(e.target.value)}
            className="bg-[color:var(--mm-panel)] border-[color:var(--mm-rule)] text-[color:var(--mm-ink)] rounded-none flex-1"
          />
          <Button
            onClick={() => save('youtube', { youtube_channel: ytChannel.trim() || null })}
            disabled={saving === 'youtube'}
            className="bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)] hover:brightness-95 hover:bg-[color:var(--mm-yellow)] cursor-pointer shrink-0 font-bold uppercase tracking-[0.14em] rounded-none"
            size="sm"
          >
            {saving === 'youtube' ? <Loader2 size={13} className="animate-spin" /> : '저장'}
          </Button>
        </div>
        {league.youtube_channel && (
          <p className="text-xs text-[color:var(--mm-muted)]">현재: <span className="text-[color:var(--mm-yellow-strong)] font-mono">{league.youtube_channel}</span></p>
        )}
      </div>

      {/* 플러스원(+1) 나이 기준 */}
      <div className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-black bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)] px-2 py-0.5 tracking-tight">+1</span>
          <h3 className="font-jersey font-black uppercase text-lg text-[color:var(--mm-ink)]">플러스원 나이 기준</h3>
        </div>
        <p className="text-xs text-[color:var(--mm-muted)] leading-relaxed">
          해당 만 나이 이상 선수에게 자유투 제외 득점 +1이 가산됩니다.<br />
          비워두면 플러스원 제도 미사용.
        </p>
        <div className="flex items-center gap-2">
          <Input
            type="number" min={1} max={99} placeholder="예: 40"
            value={plusOneAge}
            onChange={e => setPlusOneAge(e.target.value)}
            className="bg-[color:var(--mm-panel)] border-[color:var(--mm-rule)] text-[color:var(--mm-ink)] rounded-none w-24"
          />
          <span className="text-sm text-[color:var(--mm-muted)]">세 이상</span>
          <Button
            onClick={() => save('plus_one_age', { plus_one_age: plusOneAge ? Number(plusOneAge) : null })}
            disabled={saving === 'plus_one_age'}
            className="bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)] hover:brightness-95 hover:bg-[color:var(--mm-yellow)] cursor-pointer shrink-0 font-bold uppercase tracking-[0.14em] rounded-none"
            size="sm"
          >
            {saving === 'plus_one_age' ? <Loader2 size={13} className="animate-spin" /> : '저장'}
          </Button>
        </div>
        {league.plus_one_age && (
          <p className="text-xs text-[color:var(--mm-muted)]">현재 기준: <span className="text-[color:var(--mm-yellow-strong)] font-mono">만 {league.plus_one_age}세</span> 이상</p>
        )}
      </div>

      {/* PIN 변경 */}
      <div className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] p-5 space-y-3">
        <h3 className="font-jersey font-black uppercase text-lg text-[color:var(--mm-ink)]">편집 PIN 변경</h3>
        <div className="flex items-center gap-2">
          <Input
            type={pinVisible ? 'text' : 'password'}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            maxLength={4}
            placeholder="4자리 PIN"
            className="bg-[color:var(--mm-panel)] border-[color:var(--mm-rule)] text-[color:var(--mm-ink)] font-mono text-xl tracking-[0.5em] flex-1 rounded-none"
          />
          <button
            onClick={() => setPinVisible(v => !v)}
            className="p-2.5 border border-[color:var(--mm-rule)] text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)] hover:border-[color:var(--mm-ink-soft)] cursor-pointer shrink-0 transition-colors"
          >
            {pinVisible ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
          <button
            onClick={() => { setPin(String(Math.floor(1000 + Math.random() * 9000))); setPinVisible(true) }}
            className="p-2.5 border border-[color:var(--mm-rule)] text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)] hover:border-[color:var(--mm-ink-soft)] cursor-pointer shrink-0 transition-colors"
            title="랜덤 재발급"
          >
            <RefreshCw size={14} />
          </button>
          <Button
            onClick={savePin}
            disabled={saving === 'pin'}
            className="bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)] hover:brightness-95 hover:bg-[color:var(--mm-yellow)] cursor-pointer shrink-0 font-bold uppercase tracking-[0.14em] rounded-none"
            size="sm"
          >
            저장
          </Button>
        </div>
        <p className="text-xs text-[color:var(--mm-muted)]">PIN 변경 후 현재 세션은 유지되며 다음 접속 시 새 PIN이 적용됩니다</p>
      </div>

      {/* 분기 날짜 범위 설정 */}
      {quarters.length > 0 && (
        <div className="bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-[color:var(--mm-muted)]" />
            <h3 className="font-jersey font-black uppercase text-lg text-[color:var(--mm-ink)]">분기별 날짜 범위</h3>
          </div>
          <p className="text-xs text-[color:var(--mm-muted)] leading-relaxed">
            각 분기의 시작일/종료일을 지정하면 경기 날짜 → 분기 자동 매핑, 분기별 스탯 집계에 사용됩니다.
          </p>
          <div className="space-y-2">
            {quarters.map(q => (
              <div key={q.id} className="bg-[color:var(--mm-panel-alt)] border border-[color:var(--mm-rule)] p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className={`font-jersey font-black uppercase text-sm tracking-tight tabular-nums ${q.is_current ? 'text-[color:var(--mm-yellow-strong)]' : 'text-[color:var(--mm-ink)]'}`}>
                    {String(q.year).slice(2)}.{q.quarter}Q {q.is_current ? '● 현재' : ''}
                  </span>
                  {editingQuarter !== q.id && (
                    <button
                      onClick={() => {
                        setEditingQuarter(q.id)
                        setQStartDate(q.start_date ?? '')
                        setQEndDate(q.end_date ?? '')
                      }}
                      className="text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--mm-muted)] hover:text-[color:var(--mm-ink)] cursor-pointer"
                    >편집</button>
                  )}
                </div>
                {editingQuarter === q.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--mm-muted)]">시작일</label>
                        <Input type="date" value={qStartDate} onChange={e => setQStartDate(e.target.value)}
                          className="bg-[color:var(--mm-panel)] border-[color:var(--mm-rule)] text-[color:var(--mm-ink)] text-xs mt-0.5 rounded-none" />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--mm-muted)]">종료일</label>
                        <Input type="date" value={qEndDate} onChange={e => setQEndDate(e.target.value)}
                          className="bg-[color:var(--mm-panel)] border-[color:var(--mm-rule)] text-[color:var(--mm-ink)] text-xs mt-0.5 rounded-none" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => saveQuarterDates(q.id)}
                        disabled={savingQuarter === q.id}
                        className="bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)] hover:brightness-95 hover:bg-[color:var(--mm-yellow)] cursor-pointer text-xs font-bold uppercase tracking-[0.14em] rounded-none">
                        {savingQuarter === q.id ? <Loader2 size={11} className="animate-spin" /> : '저장'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingQuarter(null)}
                        className="border-[color:var(--mm-rule)] bg-transparent text-[color:var(--mm-ink)] hover:bg-[color:var(--mm-panel)] hover:text-[color:var(--mm-ink)] cursor-pointer text-xs font-bold uppercase tracking-[0.14em] rounded-none">취소</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[color:var(--mm-muted)]">
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
