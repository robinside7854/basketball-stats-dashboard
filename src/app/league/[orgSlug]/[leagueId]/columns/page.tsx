'use client'
// 매거진 목록 페이지 — 발행된 컬럼 카드 그리드 + 관리자 draft 노출

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { Newspaper, Sparkles, Loader2, Trash2, CheckCircle2, Edit3 } from 'lucide-react'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import ColumnEditor from '@/components/league/magazine/ColumnEditor'
import EmptyState from '@/components/league/EmptyState'
import LeagueGroupTabs from '@/components/league/LeagueGroupTabs'

type ColumnMeta = {
  id: string
  period_type: 'weekly' | 'monthly' | 'quarterly'
  period_start: string
  period_end: string
  title: string
  subtitle: string | null
  cover_type: 'player' | 'banner' | 'both'
  cover_player_id: string | null
  cover_banner_url: string | null
  status: 'draft' | 'published' | 'archived'
  published_at: string | null
  created_at: string
}

type PlayerMini = { id: string; name: string; photo_url: string | null }

const PERIOD_LABEL: Record<string, string> = {
  weekly: '주간', monthly: '월간', quarterly: '분기',
}

export default function ColumnsListPage() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { leagueId, orgSlug } = params
  const { isEditMode, leagueHeaders } = useLeagueEditMode()

  const [columns, setColumns] = useState<ColumnMeta[]>([])
  const [playerMap, setPlayerMap] = useState<Record<string, PlayerMini>>({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genPeriod, setGenPeriod] = useState<'weekly' | 'monthly' | 'quarterly'>('weekly')
  // 커스텀 기간 지정 (빈 문자열이면 자동 계산)
  const [genStart, setGenStart] = useState<string>('')
  const [genEnd, setGenEnd] = useState<string>('')
  const [genOptionsOpen, setGenOptionsOpen] = useState(false)
  // 분기 목록 (프리셋 버튼용)
  type QuarterRow = { id: string; year: number; quarter: number; is_current: boolean; start_date: string | null; end_date: string | null }
  const [quarters, setQuarters] = useState<QuarterRow[]>([])
  useEffect(() => {
    fetch(`/api/leagues/${leagueId}/quarters`)
      .then(r => r.ok ? r.json() : [])
      .then((qs: QuarterRow[]) => setQuarters(qs))
      .catch(() => setQuarters([]))
  }, [leagueId])
  // 편집기 상태 — 열려 있을 때만 상세 데이터 로드
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editorData, setEditorData] = useState<{
    column: { id: string; title: string; subtitle: string | null; body_md: string; cover_type: 'player' | 'banner' | 'both'; cover_player_id: string | null; status: string } | null
    allPlayers: PlayerMini[]
    playerNameMap: Record<string, { id: string; name: string; photo_url?: string | null }>
    teamNameMap: Record<string, { name: string; color?: string | null }>
  }>({ column: null, allPlayers: [], playerNameMap: {}, teamNameMap: {} })

  const load = useCallback(async () => {
    setLoading(true)
    const statusParam = isEditMode ? 'all' : 'published'
    const headers: Record<string, string> = {}
    if (isEditMode && leagueHeaders['X-League-Pin']) headers['X-League-Pin'] = leagueHeaders['X-League-Pin']
    const [colsRes, playersRes] = await Promise.all([
      fetch(`/api/leagues/${leagueId}/columns?status=${statusParam}`, { headers }),
      fetch(`/api/leagues/${leagueId}/players`),
    ])
    if (colsRes.ok) {
      const d = await colsRes.json()
      setColumns(d.columns ?? [])
    }
    if (playersRes.ok) {
      const players: PlayerMini[] = await playersRes.json()
      setPlayerMap(Object.fromEntries(players.map(p => [p.id, p])))
    }
    setLoading(false)
  }, [leagueId, isEditMode, leagueHeaders])

  useEffect(() => { load() }, [load])

  async function generateColumn() {
    if (!leagueHeaders['X-League-Pin']) { toast.error('편집 모드에서만 생성 가능'); return }
    // 시작 > 종료 검증
    if (genStart && genEnd && genStart > genEnd) {
      toast.error('시작일이 종료일보다 늦습니다')
      return
    }
    setGenerating(true)
    try {
      const body: Record<string, string> = { period_type: genPeriod }
      if (genStart) body.period_start = genStart
      if (genEnd) body.period_end = genEnd
      const res = await fetch(`/api/leagues/${leagueId}/columns/generate`, {
        method: 'POST',
        headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('컬럼 생성 완료 (draft)')
        setGenOptionsOpen(false)
        load()
      } else {
        toast.error(`생성 실패: ${data.error ?? res.status}`)
      }
    } catch { toast.error('네트워크 오류') }
    finally { setGenerating(false) }
  }

  // 프리셋 헬퍼 — 오늘 기준 계산
  function iso(d: Date): string { return d.toISOString().slice(0, 10) }
  function applyPreset(preset: string) {
    const today = new Date()
    if (preset === 'this-week') {
      const from = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000)
      setGenPeriod('weekly'); setGenStart(iso(from)); setGenEnd(iso(today))
    } else if (preset === 'last-week') {
      const end = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)
      const start = new Date(end.getTime() - 6 * 24 * 60 * 60 * 1000)
      setGenPeriod('weekly'); setGenStart(iso(start)); setGenEnd(iso(end))
    } else if (preset === 'this-month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      setGenPeriod('monthly'); setGenStart(iso(start)); setGenEnd(iso(today))
    } else if (preset === 'last-month') {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const end = new Date(today.getFullYear(), today.getMonth(), 0)
      setGenPeriod('monthly'); setGenStart(iso(start)); setGenEnd(iso(end))
    } else if (preset.startsWith('quarter:')) {
      const qId = preset.slice(8)
      const q = quarters.find(qq => qq.id === qId)
      if (!q) return
      setGenPeriod('quarterly')
      // start_date/end_date 있으면 그대로, 없으면 year+quarter 로 계산
      if (q.start_date && q.end_date) {
        setGenStart(q.start_date); setGenEnd(q.end_date)
      } else {
        const qStartMonth = (q.quarter - 1) * 3
        const s = new Date(q.year, qStartMonth, 1)
        const e = new Date(q.year, qStartMonth + 3, 0)
        setGenStart(iso(s)); setGenEnd(iso(e))
      }
    } else if (preset === 'clear') {
      setGenStart(''); setGenEnd('')
    }
  }

  async function publishColumn(id: string) {
    if (!confirm('이 컬럼을 발행하시겠어요?')) return
    const res = await fetch(`/api/leagues/${leagueId}/columns/${id}/publish`, {
      method: 'POST', headers: leagueHeaders,
    })
    if (res.ok) { toast.success('발행 완료'); load() }
    else { const e = await res.json(); toast.error(`발행 실패: ${e.error}`) }
  }

  async function deleteColumn(id: string) {
    if (!confirm('이 컬럼을 삭제하시겠어요? 되돌릴 수 없습니다.')) return
    const res = await fetch(`/api/leagues/${leagueId}/columns/${id}`, {
      method: 'DELETE', headers: leagueHeaders,
    })
    if (res.ok) { toast.success('삭제 완료'); load() }
    else { const e = await res.json(); toast.error(`삭제 실패: ${e.error}`) }
  }

  async function openEditor(id: string) {
    setEditingId(id)
    // 상세 데이터 병렬 로드 (본문 + 선수/팀 매핑)
    const headers: Record<string, string> = {}
    if (leagueHeaders['X-League-Pin']) headers['X-League-Pin'] = leagueHeaders['X-League-Pin']
    const [colRes, playersRes, identRes] = await Promise.all([
      fetch(`/api/leagues/${leagueId}/columns/${id}`, { headers }),
      fetch(`/api/leagues/${leagueId}/players`),
      fetch(`/api/leagues/${leagueId}/team-identities`),
    ])
    if (!colRes.ok) { toast.error('컬럼 로드 실패'); setEditingId(null); return }
    const colD = await colRes.json()
    const players: PlayerMini[] = playersRes.ok ? await playersRes.json() : []
    const identD = identRes.ok ? await identRes.json() : { identities: [] }
    const pmap: Record<string, { id: string; name: string; photo_url?: string | null }> = {}
    for (const p of players) pmap[p.name] = { id: p.id, name: p.name, photo_url: p.photo_url }
    const tmap: Record<string, { name: string; color?: string | null }> = {}
    for (const t of (identD.identities ?? []) as Array<{ display_name: string; color: string }>) {
      tmap[t.display_name] = { name: t.display_name, color: t.color }
    }
    setEditorData({
      column: colD.column,
      allPlayers: players,
      playerNameMap: pmap,
      teamNameMap: tmap,
    })
  }

  const base = `/league/${orgSlug}/${leagueId}`
  const groupTabs = [
    { href: `${base}/columns`, label: '매거진', active: true },
    { href: `${base}/stathead`, label: 'Stathead', active: false },
    { href: `${base}/highlights`, label: '하이라이트', active: false },
    { href: `${base}/archive/announcements`, label: '공지', active: false },
  ]

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* 아카이브 우산 서브탭 — 매거진 · Stathead */}
      <LeagueGroupTabs tabs={groupTabs} />

      {/* 헤더 */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Newspaper size={28} className="lg:w-9 lg:h-9" style={{ color: 'var(--mm-yellow-strong)' }} />
          <div>
            <h1
              className="font-jersey text-2xl lg:text-4xl font-black tracking-wide uppercase"
              style={{ color: 'var(--mm-ink)' }}
            >
              매거진
            </h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--mm-muted)' }}>주간·월간·분기 리포트</p>
          </div>
        </div>
        {isEditMode && (
          <button
            onClick={() => setGenOptionsOpen(v => !v)}
            className="flex items-center gap-1.5 px-4 py-2 rounded text-sm font-black uppercase tracking-wider cursor-pointer transition-colors"
            style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)' }}
            aria-label="AI 컬럼 생성 옵션 열기"
          >
            <Sparkles size={14} /> AI 생성{genOptionsOpen ? ' ▲' : ' ▼'}
          </button>
        )}
      </div>

      {/* 생성 옵션 패널 (접힘/펼침) */}
      {isEditMode && genOptionsOpen && (
        <div
          className="rounded p-4 lg:p-5 space-y-4 border"
          style={{ background: 'var(--mm-panel-alt)', borderColor: 'var(--mm-rule)' }}
        >
          {/* 1. 기간 유형 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-xs uppercase font-black tracking-[0.18em] w-16"
              style={{ color: 'var(--mm-muted)' }}
            >
              유형
            </span>
            <div className="flex gap-1.5">
              {(['weekly', 'monthly', 'quarterly'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setGenPeriod(p)}
                  className="px-3 py-1.5 rounded text-xs font-black uppercase tracking-wider transition cursor-pointer"
                  style={
                    genPeriod === p
                      ? { background: 'var(--mm-yellow)', color: 'var(--mm-black)' }
                      : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }
                  }
                >
                  {p === 'weekly' ? '주간' : p === 'monthly' ? '월간' : '분기'}
                </button>
              ))}
            </div>
          </div>

          {/* 2. 프리셋 */}
          <div className="flex items-start gap-2 flex-wrap">
            <span
              className="text-xs uppercase font-black tracking-[0.18em] w-16 pt-1.5"
              style={{ color: 'var(--mm-muted)' }}
            >
              프리셋
            </span>
            <div className="flex-1 flex gap-1.5 flex-wrap">
              {genPeriod === 'weekly' && (
                <>
                  <button
                    onClick={() => applyPreset('this-week')}
                    className="px-2.5 py-1.5 rounded text-xs font-bold cursor-pointer transition-colors"
                    style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}
                  >
                    이번 주
                  </button>
                  <button
                    onClick={() => applyPreset('last-week')}
                    className="px-2.5 py-1.5 rounded text-xs font-bold cursor-pointer transition-colors"
                    style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}
                  >
                    지난 주
                  </button>
                </>
              )}
              {genPeriod === 'monthly' && (
                <>
                  <button
                    onClick={() => applyPreset('this-month')}
                    className="px-2.5 py-1.5 rounded text-xs font-bold cursor-pointer transition-colors"
                    style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}
                  >
                    이번 달
                  </button>
                  <button
                    onClick={() => applyPreset('last-month')}
                    className="px-2.5 py-1.5 rounded text-xs font-bold cursor-pointer transition-colors"
                    style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }}
                  >
                    지난 달
                  </button>
                </>
              )}
              {genPeriod === 'quarterly' && (
                quarters.length === 0 ? (
                  <span className="text-xs pt-1" style={{ color: 'var(--mm-muted)' }}>분기 정보 없음</span>
                ) : (
                  quarters.map(q => (
                    <button
                      key={q.id}
                      onClick={() => applyPreset(`quarter:${q.id}`)}
                      className="px-2.5 py-1.5 rounded text-xs font-bold cursor-pointer transition-colors"
                      style={
                        q.is_current
                          ? { background: 'var(--mm-yellow-soft)', color: 'var(--mm-ink)', border: '1px solid var(--mm-yellow)' }
                          : { background: 'var(--mm-panel)', color: 'var(--mm-ink-soft)', border: '1px solid var(--mm-rule)' }
                      }
                    >
                      {String(q.year).slice(2)}.{q.quarter}Q{q.is_current ? ' (현재)' : ''}
                    </button>
                  ))
                )
              )}
              <button
                onClick={() => applyPreset('clear')}
                className="px-2.5 py-1.5 rounded text-xs font-bold cursor-pointer transition-colors"
                style={{ background: 'transparent', color: 'var(--mm-muted)', border: '1px dashed var(--mm-rule)' }}
              >
                자동 (기본)
              </button>
            </div>
          </div>

          {/* 3. 직접 입력 */}
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-xs uppercase font-black tracking-[0.18em] w-16"
              style={{ color: 'var(--mm-muted)' }}
            >
              기간
            </span>
            <input
              type="date"
              value={genStart}
              onChange={e => setGenStart(e.target.value)}
              className="rounded px-2.5 py-1.5 text-xs"
              style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)' }}
              aria-label="시작일"
            />
            <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>~</span>
            <input
              type="date"
              value={genEnd}
              onChange={e => setGenEnd(e.target.value)}
              className="rounded px-2.5 py-1.5 text-xs"
              style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)' }}
              aria-label="종료일"
            />
            {(genStart || genEnd) && (
              <span className="text-xs font-bold" style={{ color: 'var(--mm-yellow-strong)' }}>
                {genStart && genEnd
                  ? `${genStart} ~ ${genEnd} (${Math.ceil((new Date(genEnd).getTime() - new Date(genStart).getTime()) / 86400000) + 1}일)`
                  : '시작/종료일을 모두 지정하세요'}
              </span>
            )}
            {!genStart && !genEnd && (
              <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>
                기간 미지정 시 자동 계산 (최근 7일/이번 달/현재 분기)
              </span>
            )}
          </div>

          {/* 4. 생성 실행 */}
          <div className="flex justify-end pt-2 border-t" style={{ borderColor: 'var(--mm-rule)' }}>
            <button
              onClick={generateColumn}
              disabled={generating}
              className="flex items-center gap-1.5 px-5 py-2 rounded text-sm font-black uppercase tracking-wider cursor-pointer disabled:opacity-50 transition-colors"
              style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)' }}
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {generating ? '생성 중…' : '초안 생성'}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><BasketballLoader size={32} /></div>
      ) : columns.length === 0 ? (
        <EmptyState
          Icon={Newspaper}
          title="아직 발행된 매거진이 없습니다"
          description="AI 가 주간·월간·분기 리포트를 초안으로 만들어주고, 편집자가 검토 후 발행합니다."
          isEditMode={isEditMode}
          editorHint="우측 상단 'AI 생성' 으로 첫 컬럼을 만들어 보세요"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {columns.map(col => {
            const coverPlayer = col.cover_player_id ? playerMap[col.cover_player_id] : null
            const isDraft = col.status === 'draft'
            return (
              <div
                key={col.id}
                className="group relative rounded overflow-hidden border transition-all hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.22)]"
                style={{
                  background: 'var(--mm-panel)',
                  borderColor: isDraft ? 'var(--mm-yellow)' : 'var(--mm-rule)',
                  borderWidth: isDraft ? '1px 1px 1px 4px' : '1px',
                }}
              >
                <Link href={`/league/${orgSlug}/${leagueId}/columns/${col.id}`} className="block">
                  {/* 표지 이미지 영역 */}
                  <div
                    className="relative aspect-[16/9] overflow-hidden"
                    style={{ background: 'var(--mm-panel-alt)' }}
                  >
                    {coverPlayer?.photo_url && (
                      <img
                        src={coverPlayer.photo_url}
                        alt={coverPlayer.name}
                        className="absolute inset-0 w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                      />
                    )}
                    {/* 하단 텍스트 가독성을 위한 최소 그라디언트 (커버 이미지 위) */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-[10px] font-black uppercase tracking-[0.18em] px-1.5 py-0.5"
                          style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)' }}
                        >
                          {PERIOD_LABEL[col.period_type]}
                        </span>
                        <span className="text-[10px] font-bold text-white/90">
                          {col.period_start} ~ {col.period_end}
                        </span>
                        {isDraft && (
                          <span
                            className="text-[10px] font-black uppercase tracking-[0.18em] px-1.5 py-0.5 ml-auto"
                            style={{ background: 'var(--mm-black)', color: 'var(--mm-yellow)' }}
                          >
                            DRAFT
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* 텍스트 영역 */}
                  <div className="p-4">
                    <h3
                      className="font-jersey text-lg lg:text-xl font-black uppercase leading-tight line-clamp-2"
                      style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
                    >
                      {col.title}
                    </h3>
                    {col.subtitle && (
                      <p
                        className="text-xs mt-1.5 line-clamp-2 leading-relaxed"
                        style={{ color: 'var(--mm-ink-soft)' }}
                      >
                        {col.subtitle}
                      </p>
                    )}
                    <p
                      className="text-[11px] font-bold uppercase tracking-[0.14em] mt-2"
                      style={{ color: 'var(--mm-muted)' }}
                    >
                      {isDraft
                        ? `생성 ${new Date(col.created_at).toLocaleDateString('ko-KR')}`
                        : col.published_at
                          ? `발행 ${new Date(col.published_at).toLocaleDateString('ko-KR')}`
                          : ''}
                    </p>
                  </div>
                </Link>
                {isEditMode && (
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    <button
                      onClick={e => { e.preventDefault(); openEditor(col.id) }}
                      className="p-1.5 rounded cursor-pointer transition-colors"
                      style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)' }}
                      title="편집"
                    >
                      <Edit3 size={13} />
                    </button>
                    {isDraft && (
                      <button
                        onClick={e => { e.preventDefault(); publishColumn(col.id) }}
                        className="p-1.5 rounded text-white cursor-pointer transition-colors"
                        style={{ background: '#059669' }}
                        title="발행"
                      >
                        <CheckCircle2 size={13} />
                      </button>
                    )}
                    <button
                      onClick={e => { e.preventDefault(); deleteColumn(col.id) }}
                      className="p-1.5 rounded text-white cursor-pointer transition-colors"
                      style={{ background: 'var(--mm-live)' }}
                      title="삭제"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 편집기 (편집 모드 + 컬럼 로드 완료 시) */}
      {editingId && editorData.column && (
        <ColumnEditor
          leagueId={leagueId}
          column={editorData.column}
          leagueHeaders={leagueHeaders}
          playerNameMap={editorData.playerNameMap}
          teamNameMap={editorData.teamNameMap}
          allPlayers={editorData.allPlayers}
          onClose={() => { setEditingId(null); setEditorData({ column: null, allPlayers: [], playerNameMap: {}, teamNameMap: {} }) }}
          onSaved={() => { load() }}
        />
      )}
    </div>
  )
}
