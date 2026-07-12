'use client'
// Amateur Stathead — 커스텀 스탯 쿼리 페이지
//
// 특징:
//   - stat 조건 여러 개 조합 (예: PPG≥15 AND 3P%≥30 AND GP≥5)
//   - 정렬 (asc/desc)
//   - URL state: 필터·정렬이 쿼리스트링에 인코딩되어 링크 공유 가능
//   - 결과 테이블: 조건 만족 선수 목록
//
// URL 예시:
//   /league/miracle/{id}/stathead?filters=ppg_gte_15,fg3_pct_gte_30&sort=ppg_desc&minGp=5

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import PlayerQuickViewModal from '@/components/league/PlayerQuickViewModal'
import { Plus, X, Sparkles, RotateCcw, ArrowDown, ArrowUp } from 'lucide-react'

type Quarter = { id: string; year: number; quarter: number; is_current: boolean }

type StatDef = { key: string; label: string; format: 'num' | 'pct' | 'avg'; group: 'basic' | 'shoot' | 'total' }
const STATS: StatDef[] = [
  { key: 'gp',       label: 'GP',    format: 'num', group: 'basic' },
  { key: 'ppg',      label: 'PPG',   format: 'avg', group: 'basic' },
  { key: 'rpg',      label: 'RPG',   format: 'avg', group: 'basic' },
  { key: 'apg',      label: 'APG',   format: 'avg', group: 'basic' },
  { key: 'spg',      label: 'SPG',   format: 'avg', group: 'basic' },
  { key: 'bpg',      label: 'BPG',   format: 'avg', group: 'basic' },
  { key: 'topg',     label: 'TOPG',  format: 'avg', group: 'basic' },
  { key: 'fg_pct',   label: 'FG%',   format: 'pct', group: 'shoot' },
  { key: 'fg3_pct',  label: '3P%',   format: 'pct', group: 'shoot' },
  { key: 'ft_pct',   label: 'FT%',   format: 'pct', group: 'shoot' },
  { key: 'efg_pct',  label: 'eFG%',  format: 'pct', group: 'shoot' },
  { key: 'pts',      label: 'PTS',   format: 'num', group: 'total' },
  { key: 'reb',      label: 'REB',   format: 'num', group: 'total' },
  { key: 'ast',      label: 'AST',   format: 'num', group: 'total' },
  { key: 'stl',      label: 'STL',   format: 'num', group: 'total' },
  { key: 'blk',      label: 'BLK',   format: 'num', group: 'total' },
  { key: 'tov',      label: 'TOV',   format: 'num', group: 'total' },
  { key: 'fgm',      label: 'FGM',   format: 'num', group: 'total' },
  { key: 'fga',      label: 'FGA',   format: 'num', group: 'total' },
  { key: 'fg3m',     label: '3PM',   format: 'num', group: 'total' },
  { key: 'fg3a',     label: '3PA',   format: 'num', group: 'total' },
  { key: 'ftm',      label: 'FTM',   format: 'num', group: 'total' },
  { key: 'fta',      label: 'FTA',   format: 'num', group: 'total' },
]
const STAT_LABEL = Object.fromEntries(STATS.map(s => [s.key, s.label]))
const STAT_FORMAT = Object.fromEntries(STATS.map(s => [s.key, s.format])) as Record<string, StatDef['format']>

const OPS = [
  { op: 'gte', label: '≥' },
  { op: 'gt',  label: '>' },
  { op: 'lte', label: '≤' },
  { op: 'lt',  label: '<' },
  { op: 'eq',  label: '=' },
]

type FilterCond = { stat: string; op: string; value: string }

type PlayerRow = Record<string, string | number | null | undefined>

function StatheadContent() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { leagueId } = params

  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [quarterId, setQuarterId] = useState<string>(searchParams.get('quarterId') ?? 'all')
  const [minGp, setMinGp] = useState<string>(searchParams.get('minGp') ?? '3')
  const [includeGuests, setIncludeGuests] = useState<boolean>(searchParams.get('includeGuests') === '1')

  // URL 파라미터에서 filters 파싱
  const parseInitFilters = (): FilterCond[] => {
    const raw = searchParams.get('filters')
    if (!raw) return [{ stat: 'ppg', op: 'gte', value: '15' }]
    return raw.split(',').filter(Boolean).map(tok => {
      const parts = tok.split('_')
      if (parts.length < 3) return null
      const value = parts[parts.length - 1]
      const op = parts[parts.length - 2]
      const stat = parts.slice(0, -2).join('_')
      return { stat, op, value }
    }).filter((x): x is FilterCond => x !== null)
  }
  const [filters, setFilters] = useState<FilterCond[]>(parseInitFilters)

  const parseInitSort = (): { key: string; dir: 'asc' | 'desc' } => {
    const raw = searchParams.get('sort')
    if (!raw) return { key: 'ppg', dir: 'desc' }
    const parts = raw.split('_')
    const dir = parts[parts.length - 1]
    const key = parts.slice(0, -1).join('_')
    return { key, dir: dir === 'asc' ? 'asc' : 'desc' }
  }
  const [sort, setSort] = useState(parseInitSort)

  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [quickPlayer, setQuickPlayer] = useState<{ id: string; name: string } | null>(null)

  // 분기 로드
  useEffect(() => {
    fetch(`/api/leagues/${leagueId}/quarters`)
      .then(r => r.ok ? r.json() : [])
      .then((qs: Quarter[]) => setQuarters(qs))
      .catch(() => setQuarters([]))
  }, [leagueId])

  // 쿼리 실행 + URL 동기화
  const runQuery = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (quarterId && quarterId !== 'all') params.set('quarterId', quarterId)
    if (minGp && Number(minGp) > 0) params.set('minGp', minGp)
    if (includeGuests) params.set('includeGuests', '1')
    const validFilters = filters.filter(f => f.stat && f.op && f.value !== '' && !Number.isNaN(Number(f.value)))
    if (validFilters.length > 0) {
      params.set('filters', validFilters.map(f => `${f.stat}_${f.op}_${f.value}`).join(','))
    }
    params.set('sort', `${sort.key}_${sort.dir}`)

    // URL 업데이트 (뒤로가기 히스토리 오염 방지 위해 replace)
    router.replace(`?${params.toString()}`, { scroll: false })

    fetch(`/api/leagues/${leagueId}/stathead?${params.toString()}`)
      .then(r => r.ok ? r.json() : { players: [], total: 0 })
      .then(d => {
        setPlayers(d.players ?? [])
        setTotal(d.total ?? 0)
      })
      .catch(() => { setPlayers([]); setTotal(0) })
      .finally(() => setLoading(false))
  }, [leagueId, quarterId, minGp, includeGuests, filters, sort, router])

  // 초기 로드 + 파라미터 변경 시 자동 실행
  useEffect(() => {
    const timer = setTimeout(runQuery, 250)  // debounce
    return () => clearTimeout(timer)
  }, [runQuery])

  const addFilter = () => setFilters(prev => [...prev, { stat: 'rpg', op: 'gte', value: '5' }])
  const removeFilter = (idx: number) => setFilters(prev => prev.filter((_, i) => i !== idx))
  const updateFilter = (idx: number, patch: Partial<FilterCond>) =>
    setFilters(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f))

  const reset = () => {
    setQuarterId('all')
    setMinGp('3')
    setIncludeGuests(false)
    setFilters([{ stat: 'ppg', op: 'gte', value: '15' }])
    setSort({ key: 'ppg', dir: 'desc' })
  }

  const formatValue = (val: string | number | null | undefined, key: string): string => {
    if (val == null) return '—'
    const format = STAT_FORMAT[key] ?? 'num'
    if (format === 'pct') return `${val}%`
    return String(val)
  }

  const currentSortLabel = STAT_LABEL[sort.key] ?? sort.key

  return (
    <div className="space-y-5 mm-brand">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <Sparkles size={22} style={{ color: 'var(--mm-yellow-strong)' }} />
          <div>
            <h1
              className="font-jersey font-black uppercase text-3xl lg:text-4xl"
              style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
            >
              Stathead
            </h1>
            <p
              className="text-xs lg:text-sm mt-1 font-bold uppercase"
              style={{ color: 'var(--mm-muted)', letterSpacing: '0.16em' }}
            >
              커스텀 스탯 쿼리 · 조건 조합으로 선수 발굴
            </p>
          </div>
        </div>
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold uppercase transition-colors cursor-pointer min-h-[44px]"
          style={{
            background: 'var(--mm-panel)',
            border: '1px solid var(--mm-rule)',
            color: 'var(--mm-ink-soft)',
            letterSpacing: '0.16em',
          }}
        >
          <RotateCcw size={12} /> 초기화
        </button>
      </div>

      {/* 필터 패널 */}
      <div
        className="p-4 lg:p-5 space-y-4"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
        }}
      >
        {/* 기본 필터 (분기 + 최소 경기 + 게스트 토글) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label
              className="text-xs font-bold uppercase mb-1.5 block"
              style={{ color: 'var(--mm-muted)', letterSpacing: '0.18em' }}
            >
              분기
            </label>
            <select
              value={quarterId}
              onChange={e => setQuarterId(e.target.value)}
              className="w-full px-3 py-2 text-sm cursor-pointer focus:outline-none min-h-[44px]"
              style={{
                background: 'var(--mm-panel-alt)',
                border: '1px solid var(--mm-rule)',
                color: 'var(--mm-ink)',
              }}
            >
              <option value="all">시즌 전체</option>
              {quarters.map(q => (
                <option key={q.id} value={q.id}>{String(q.year).slice(2)}.{q.quarter}Q{q.is_current ? ' (현재)' : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label
              className="text-xs font-bold uppercase mb-1.5 block"
              style={{ color: 'var(--mm-muted)', letterSpacing: '0.18em' }}
            >
              최소 경기 수
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={minGp}
              onChange={e => setMinGp(e.target.value)}
              min={0}
              className="w-full px-3 py-2 text-sm tabular-nums focus:outline-none min-h-[44px]"
              style={{
                background: 'var(--mm-panel-alt)',
                border: '1px solid var(--mm-rule)',
                color: 'var(--mm-ink)',
              }}
            />
          </div>
          <div>
            <label
              className="text-xs font-bold uppercase mb-1.5 block"
              style={{ color: 'var(--mm-muted)', letterSpacing: '0.18em' }}
            >
              게스트 포함
            </label>
            <button
              onClick={() => setIncludeGuests(v => !v)}
              aria-pressed={includeGuests}
              className="w-full text-left px-3 py-2 text-sm font-bold uppercase transition-colors cursor-pointer flex items-center gap-2 min-h-[44px]"
              style={{
                background: includeGuests ? 'var(--mm-yellow)' : 'var(--mm-panel-alt)',
                border: `1px solid ${includeGuests ? 'var(--mm-black)' : 'var(--mm-rule)'}`,
                color: includeGuests ? 'var(--mm-black)' : 'var(--mm-muted)',
                letterSpacing: '0.14em',
              }}
            >
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ background: includeGuests ? 'var(--mm-black)' : 'var(--mm-rule)' }}
              />
              {includeGuests ? '포함' : '제외 (기본)'}
            </button>
          </div>
        </div>

        {/* 조건 필터 목록 */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label
              className="text-xs font-bold uppercase"
              style={{ color: 'var(--mm-muted)', letterSpacing: '0.18em' }}
            >
              스탯 조건 ({filters.length})
            </label>
            <button
              onClick={addFilter}
              className="flex items-center gap-1 px-3 py-2 text-xs font-bold uppercase cursor-pointer transition-colors min-h-[44px]"
              style={{
                background: 'var(--mm-yellow)',
                color: 'var(--mm-black)',
                border: '1px solid var(--mm-black)',
                letterSpacing: '0.14em',
              }}
            >
              <Plus size={11} /> 조건 추가
            </button>
          </div>
          {filters.length === 0 ? (
            <p className="text-xs py-2" style={{ color: 'var(--mm-muted)' }}>
              조건이 없습니다 — 위 &ldquo;조건 추가&rdquo; 로 시작하세요.
            </p>
          ) : (
            <div className="space-y-2">
              {filters.map((f, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 flex-wrap p-2"
                  style={{
                    background: 'var(--mm-panel-alt)',
                    border: '1px solid var(--mm-rule)',
                  }}
                >
                  <select
                    value={f.stat}
                    onChange={e => updateFilter(idx, { stat: e.target.value })}
                    className="px-2 py-2 text-xs cursor-pointer focus:outline-none flex-1 min-w-[110px] max-w-[160px] md:max-w-[130px] min-h-[44px]"
                    style={{
                      background: 'var(--mm-panel)',
                      border: '1px solid var(--mm-rule)',
                      color: 'var(--mm-ink)',
                    }}
                  >
                    <optgroup label="기본">
                      {STATS.filter(s => s.group === 'basic').map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </optgroup>
                    <optgroup label="슈팅">
                      {STATS.filter(s => s.group === 'shoot').map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </optgroup>
                    <optgroup label="누적">
                      {STATS.filter(s => s.group === 'total').map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </optgroup>
                  </select>
                  <select
                    value={f.op}
                    onChange={e => updateFilter(idx, { op: e.target.value })}
                    className="px-2 py-2 text-xs cursor-pointer focus:outline-none min-w-[60px] font-bold min-h-[44px]"
                    style={{
                      background: 'var(--mm-panel)',
                      border: '1px solid var(--mm-rule)',
                      color: 'var(--mm-ink)',
                    }}
                  >
                    {OPS.map(o => <option key={o.op} value={o.op}>{o.label}</option>)}
                  </select>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={f.value}
                    onChange={e => updateFilter(idx, { value: e.target.value })}
                    step="0.1"
                    className="px-2 py-2 text-xs w-20 tabular-nums focus:outline-none font-bold min-h-[44px]"
                    style={{
                      background: 'var(--mm-panel)',
                      border: '1px solid var(--mm-rule)',
                      color: 'var(--mm-ink)',
                    }}
                    placeholder="값"
                  />
                  <button
                    onClick={() => removeFilter(idx)}
                    className="transition-colors cursor-pointer flex items-center justify-center min-w-[44px] min-h-[44px]"
                    style={{ color: 'var(--mm-muted)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--mm-live)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--mm-muted)')}
                    aria-label={`조건 ${idx + 1} 삭제`}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 정렬 */}
        <div
          className="flex items-center gap-2 flex-wrap pt-3"
          style={{ borderTop: '1px solid var(--mm-rule)' }}
        >
          <label
            className="text-xs font-bold uppercase"
            style={{ color: 'var(--mm-muted)', letterSpacing: '0.18em' }}
          >
            정렬
          </label>
          <select
            value={sort.key}
            onChange={e => setSort(s => ({ ...s, key: e.target.value }))}
            className="px-2 py-2 text-xs cursor-pointer focus:outline-none font-bold min-h-[44px]"
            style={{
              background: 'var(--mm-panel-alt)',
              border: '1px solid var(--mm-rule)',
              color: 'var(--mm-ink)',
            }}
          >
            {STATS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <button
            onClick={() => setSort(s => ({ ...s, dir: s.dir === 'desc' ? 'asc' : 'desc' }))}
            className="flex items-center gap-1 px-3 py-2 text-xs font-bold uppercase cursor-pointer transition-colors min-h-[44px]"
            style={{
              background: 'var(--mm-black)',
              color: '#FFFFFF',
              border: '1px solid var(--mm-black)',
              letterSpacing: '0.14em',
            }}
          >
            {sort.dir === 'desc' ? <><ArrowDown size={11} /> 내림</> : <><ArrowUp size={11} /> 오름</>}
          </button>
        </div>
      </div>

      {/* 결과 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs lg:text-sm" style={{ color: 'var(--mm-muted)' }}>
            {loading ? '검색 중…' : (
              <>
                <span className="font-black font-jersey text-lg tabular-nums" style={{ color: 'var(--mm-ink)' }}>{total}명</span>
                <span className="ml-2 uppercase font-bold" style={{ letterSpacing: '0.14em' }}>
                  일치 · 정렬:{' '}
                  <span className="font-black" style={{ color: 'var(--mm-yellow-strong)' }}>
                    {currentSortLabel} {sort.dir === 'desc' ? '↓' : '↑'}
                  </span>
                </span>
                {players.length < total && (
                  <span className="ml-2 text-xs" style={{ color: 'var(--mm-muted)' }}>
                    (상위 {players.length}명 표시)
                  </span>
                )}
              </>
            )}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><BasketballLoader size={32} /></div>
        ) : players.length === 0 ? (
          <div
            className="text-center py-12"
            style={{
              background: 'var(--mm-panel-alt)',
              border: '1px solid var(--mm-rule)',
              color: 'var(--mm-muted)',
            }}
          >
            <p className="text-sm font-bold uppercase" style={{ letterSpacing: '0.14em', color: 'var(--mm-ink-soft)' }}>
              조건에 맞는 선수가 없습니다
            </p>
            <p className="text-xs mt-1.5" style={{ color: 'var(--mm-muted)' }}>필터를 완화해 보세요</p>
          </div>
        ) : (
          <>
          {/* 모바일 카드뷰 (md 미만) */}
          <div className="md:hidden grid gap-2.5">
            {players.map((p, i) => {
              const rankColor = i === 0
                ? 'var(--mm-yellow-strong)'
                : i === 1 || i === 2
                  ? 'var(--mm-ink-soft)'
                  : 'var(--mm-muted)'
              const rankAccent = i === 0
                ? 'var(--mm-yellow)'
                : i === 1 || i === 2
                  ? 'var(--mm-yellow-strong)'
                  : 'transparent'
              // 서브 지표: PPG/RPG/APG (정렬 기준과 겹치면 대체)
              const subKeys = (['ppg', 'rpg', 'apg', 'fg_pct'] as const)
                .filter(k => k !== sort.key)
                .slice(0, 3)
              return (
                <button
                  key={p.player_id as string}
                  onClick={() => setQuickPlayer({ id: p.player_id as string, name: p.name as string })}
                  className="w-full text-left p-3.5 transition-colors cursor-pointer active:opacity-80"
                  style={{
                    background: 'var(--mm-panel)',
                    border: '1px solid var(--mm-rule)',
                    borderLeft: `3px solid ${rankAccent}`,
                  }}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <span
                      className="font-jersey font-black tabular-nums w-6 shrink-0"
                      style={{ color: rankColor, fontSize: '20px' }}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div
                        className="font-jersey font-black uppercase break-keep"
                        style={{ color: 'var(--mm-ink)', fontSize: '16px', letterSpacing: '-0.005em', lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                      >
                        {p.name as string}
                      </div>
                      <div
                        className="text-[11px] font-bold uppercase mt-0.5"
                        style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}
                      >
                        {(p.position as string ?? '—')}
                        {p.number != null ? ` · #${p.number}` : ''}
                        <span className="mx-1">·</span>
                        <span className="tabular-nums">{p.gp as number}GP</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className="font-jersey font-black tabular-nums leading-none"
                        style={{
                          color: 'var(--mm-yellow-strong)',
                          fontSize: 'clamp(24px, 7vw, 32px)',
                          letterSpacing: '-0.015em',
                        }}
                      >
                        {formatValue(p[sort.key] as string | number, sort.key)}
                      </div>
                      <div
                        className="text-[11px] font-black uppercase mt-1"
                        style={{ color: 'var(--mm-yellow-strong)', letterSpacing: '0.16em' }}
                      >
                        {currentSortLabel}
                      </div>
                    </div>
                  </div>
                  <div
                    className="grid grid-cols-3 gap-2 pt-2"
                    style={{ borderTop: '1px solid var(--mm-rule)' }}
                  >
                    {subKeys.map(k => {
                      const label = STAT_LABEL[k] ?? k
                      const value = k === 'fg_pct'
                        ? ((p.fga as number ?? 0) > 0 ? `${p.fg_pct}%` : '—')
                        : (p[k] as number | undefined ?? '—')
                      return (
                        <div key={k} className="text-center">
                          <div
                            className="text-[11px] font-bold uppercase"
                            style={{ color: 'var(--mm-muted)', letterSpacing: '0.10em' }}
                          >
                            {label}
                          </div>
                          <div
                            className="font-jersey font-black tabular-nums mt-0.5"
                            style={{ color: 'var(--mm-ink)', fontSize: '15px' }}
                          >
                            {value}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </button>
              )
            })}
          </div>

          {/* 데스크탑 테이블 (md 이상) */}
          <div
            className="hidden md:block overflow-hidden transition-shadow duration-200 hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)]"
            style={{
              background: 'var(--mm-panel)',
              border: '1px solid var(--mm-rule)',
            }}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}>
                    <th
                      className="py-3 px-3 text-left text-xs font-bold w-8 uppercase"
                      style={{ color: 'var(--mm-muted)', letterSpacing: '0.16em' }}
                    >
                      #
                    </th>
                    <th
                      className="py-3 px-4 text-left text-xs font-bold min-w-[130px] sticky left-0 uppercase"
                      style={{ color: 'var(--mm-muted)', background: 'var(--mm-panel-alt)', letterSpacing: '0.16em' }}
                    >
                      선수
                    </th>
                    <th
                      className="py-3 px-3 text-center text-xs font-bold uppercase"
                      style={{ color: 'var(--mm-muted)', letterSpacing: '0.16em' }}
                    >
                      GP
                    </th>
                    {/* 정렬 기준 컬럼을 강조 표시 */}
                    <th
                      className="py-3 px-3 text-center text-xs font-black uppercase"
                      style={{ color: 'var(--mm-yellow-strong)', letterSpacing: '0.18em' }}
                    >
                      {currentSortLabel}
                    </th>
                    {(['PPG', 'RPG', 'APG', 'FG%', '3P%', 'eFG%']).map(label => (
                      <th
                        key={label}
                        className="py-3 px-3 text-center text-xs font-bold uppercase"
                        style={{ color: 'var(--mm-muted)', letterSpacing: '0.16em' }}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {players.map((p, i) => {
                    const rowBg = i % 2 === 1 ? 'var(--mm-panel-alt)' : 'var(--mm-panel)'
                    const rankColor = i === 0
                      ? 'var(--mm-yellow-strong)'
                      : i === 1 || i === 2
                        ? 'var(--mm-ink-soft)'
                        : 'var(--mm-muted)'
                    return (
                      <tr
                        key={p.player_id as string}
                        className="transition-colors"
                        style={{
                          borderBottom: '1px solid var(--mm-rule)',
                          background: rowBg,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--mm-yellow-soft)')}
                        onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
                      >
                        <td
                          className="py-2.5 px-3 text-base font-jersey font-black tabular-nums"
                          style={{ color: rankColor }}
                        >
                          {i + 1}
                        </td>
                        <td className="py-2.5 px-4 sticky left-0" style={{ background: 'inherit' }}>
                          <button
                            onClick={() => setQuickPlayer({ id: p.player_id as string, name: p.name as string })}
                            className="font-jersey font-black uppercase transition-colors cursor-pointer text-left hover:underline underline-offset-2 break-keep block text-base"
                            style={{ color: 'var(--mm-ink)', maxWidth: '160px', lineHeight: 1.2, wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--mm-yellow-strong)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--mm-ink)')}
                          >
                            {p.name as string}
                          </button>
                          <div className="text-xs mt-0.5" style={{ color: 'var(--mm-muted)' }}>
                            {(p.position as string ?? '')}{p.number != null ? ` #${p.number}` : ''}
                          </div>
                        </td>
                        <td
                          className="py-2.5 px-3 text-center text-sm tabular-nums"
                          style={{ color: 'var(--mm-ink-soft)' }}
                        >
                          {p.gp as number}
                        </td>
                        <td
                          className="py-2.5 px-3 text-center font-jersey font-black tabular-nums text-lg"
                          style={{ color: 'var(--mm-yellow-strong)' }}
                        >
                          {formatValue(p[sort.key] as string | number, sort.key)}
                        </td>
                        <td className="py-2.5 px-3 text-center text-sm tabular-nums" style={{ color: 'var(--mm-ink)' }}>{p.ppg as number}</td>
                        <td className="py-2.5 px-3 text-center text-sm tabular-nums" style={{ color: 'var(--mm-ink)' }}>{p.rpg as number}</td>
                        <td className="py-2.5 px-3 text-center text-sm tabular-nums" style={{ color: 'var(--mm-ink)' }}>{p.apg as number}</td>
                        <td className="py-2.5 px-3 text-center text-sm tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>{p.fg_pct as number}%</td>
                        <td className="py-2.5 px-3 text-center text-sm tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>{p.fg3_pct as number}%</td>
                        <td className="py-2.5 px-3 text-center text-sm tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>{p.efg_pct as number}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          </>
        )}

        <p className="text-xs mt-3" style={{ color: 'var(--mm-muted)' }}>
          <span className="font-black uppercase mr-1.5" style={{ color: 'var(--mm-yellow-strong)', letterSpacing: '0.16em' }}>TIP</span>
          현재 URL 을 공유하면 동일한 쿼리 결과를 재현할 수 있습니다.
        </p>
      </div>

      {quickPlayer && (
        <PlayerQuickViewModal
          leagueId={leagueId}
          playerId={quickPlayer.id}
          playerName={quickPlayer.name}
          onClose={() => setQuickPlayer(null)}
        />
      )}
    </div>
  )
}

export default function StatheadPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><BasketballLoader size={32} /></div>}>
      <StatheadContent />
    </Suspense>
  )
}
