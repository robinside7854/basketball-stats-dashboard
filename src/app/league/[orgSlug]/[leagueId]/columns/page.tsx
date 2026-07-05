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
    setGenerating(true)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/columns/generate`, {
        method: 'POST',
        headers: { ...leagueHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_type: genPeriod }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('컬럼 생성 완료 (draft)')
        load()
      } else {
        toast.error(`생성 실패: ${data.error ?? res.status}`)
      }
    } catch { toast.error('네트워크 오류') }
    finally { setGenerating(false) }
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

  return (
    <div className="space-y-5 lg:space-y-6">
      {/* 헤더 */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Newspaper size={28} className="text-amber-400 lg:w-9 lg:h-9" />
          <div>
            <h1 className="font-jersey text-2xl lg:text-4xl font-bold text-white tracking-wide uppercase">매거진</h1>
            <p className="text-sm text-gray-500 mt-0.5">주간·월간·분기 리포트</p>
          </div>
        </div>
        {isEditMode && (
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={genPeriod}
              onChange={e => setGenPeriod(e.target.value as 'weekly' | 'monthly' | 'quarterly')}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
            >
              <option value="weekly">주간</option>
              <option value="monthly">월간</option>
              <option value="quarterly">분기</option>
            </select>
            <button
              onClick={generateColumn}
              disabled={generating}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold cursor-pointer bg-amber-600 hover:bg-amber-500 text-white disabled:opacity-50"
            >
              {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              AI 생성
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><BasketballLoader size={32} /></div>
      ) : columns.length === 0 ? (
        <div className="text-center py-20 text-gray-500 bg-gray-900/40 rounded-2xl border border-gray-800">
          <p className="text-base">아직 발행된 매거진이 없습니다</p>
          {isEditMode && <p className="text-xs text-gray-600 mt-1">우측 상단 'AI 생성' 으로 첫 컬럼을 만들어보세요.</p>}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {columns.map(col => {
            const coverPlayer = col.cover_player_id ? playerMap[col.cover_player_id] : null
            const isDraft = col.status === 'draft'
            return (
              <div key={col.id} className={`group relative rounded-2xl overflow-hidden border transition-all ${
                isDraft
                  ? 'bg-amber-950/20 border-amber-700/40'
                  : 'bg-gray-900 border-gray-800 hover:border-gray-700 hover:shadow-lg'
              }`}>
                <Link href={`/league/${orgSlug}/${leagueId}/columns/${col.id}`} className="block">
                  {/* 표지 이미지 영역 */}
                  <div className="relative aspect-[16/9] bg-gradient-to-br from-amber-900/40 via-gray-800 to-orange-900/40 overflow-hidden">
                    {coverPlayer?.photo_url && (
                      <img
                        src={coverPlayer.photo_url}
                        alt={coverPlayer.name}
                        className="absolute inset-0 w-full h-full object-cover object-top opacity-90 group-hover:scale-105 transition-transform duration-500"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                    <div className="absolute bottom-3 left-3 right-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-black text-amber-300 uppercase tracking-widest px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
                          {PERIOD_LABEL[col.period_type]}
                        </span>
                        <span className="text-[10px] text-gray-300">
                          {col.period_start} ~ {col.period_end}
                        </span>
                        {isDraft && (
                          <span className="text-[10px] font-black text-amber-200 uppercase px-1.5 py-0.5 rounded bg-amber-700/60 ml-auto">
                            DRAFT
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* 텍스트 영역 */}
                  <div className="p-4">
                    <h3 className="text-base lg:text-lg font-black text-white leading-tight line-clamp-2">{col.title}</h3>
                    {col.subtitle && (
                      <p className="text-xs text-gray-400 mt-1.5 line-clamp-2">{col.subtitle}</p>
                    )}
                    <p className="text-[11px] text-gray-600 mt-2">
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
                      className="p-1.5 rounded-md bg-blue-600/80 hover:bg-blue-500 text-white cursor-pointer"
                      title="편집"
                    >
                      <Edit3 size={13} />
                    </button>
                    {isDraft && (
                      <button
                        onClick={e => { e.preventDefault(); publishColumn(col.id) }}
                        className="p-1.5 rounded-md bg-emerald-600/80 hover:bg-emerald-500 text-white cursor-pointer"
                        title="발행"
                      >
                        <CheckCircle2 size={13} />
                      </button>
                    )}
                    <button
                      onClick={e => { e.preventDefault(); deleteColumn(col.id) }}
                      className="p-1.5 rounded-md bg-red-600/80 hover:bg-red-500 text-white cursor-pointer"
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
