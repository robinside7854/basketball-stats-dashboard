'use client'
// 매거진 상세 페이지 (잡지 스타일)

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, Calendar } from 'lucide-react'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import MagazineRenderer from '@/components/league/magazine/MagazineRenderer'
import { loadIdentityResolver } from '@/lib/stats/teamIdentity'  // used server-side; unused here but kept for reference

type ColumnData = {
  id: string
  period_type: 'weekly' | 'monthly' | 'quarterly'
  period_start: string; period_end: string
  title: string; subtitle: string | null
  cover_type: 'player' | 'banner' | 'both'
  cover_player_id: string | null
  cover_banner_url: string | null
  body_md: string
  meta: Record<string, unknown>
  status: string
  published_at: string | null
}

type PlayerMini = { id: string; name: string; number: number | null; photo_url: string | null }

const PERIOD_LABEL: Record<string, string> = { weekly: '주간', monthly: '월간', quarterly: '분기' }

export default function ColumnDetailPage() {
  const params = useParams<{ orgSlug: string; leagueId: string; columnId: string }>()
  const { leagueId, orgSlug, columnId } = params

  const [column, setColumn] = useState<ColumnData | null>(null)
  const [playerNameMap, setPlayerNameMap] = useState<Record<string, { id: string; name: string; photo_url?: string | null }>>({})
  const [teamNameMap, setTeamNameMap] = useState<Record<string, { name: string; color?: string | null }>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/leagues/${leagueId}/columns/${columnId}`).then(r => r.ok ? r.json() : null),
      fetch(`/api/leagues/${leagueId}/players`).then(r => r.ok ? r.json() : []),
      fetch(`/api/leagues/${leagueId}/team-identities`).then(r => r.ok ? r.json() : { identities: [] }),
    ]).then(([colD, players, identD]) => {
      setColumn(colD?.column ?? null)
      // 선수 이름 → { id, name, photo_url }
      const pmap: Record<string, { id: string; name: string; photo_url?: string | null }> = {}
      for (const p of (players ?? []) as PlayerMini[]) {
        pmap[p.name] = { id: p.id, name: p.name, photo_url: p.photo_url }
      }
      setPlayerNameMap(pmap)
      // 팀 이름 → { color }
      const tmap: Record<string, { name: string; color?: string | null }> = {}
      const identities = (identD?.identities ?? []) as Array<{ display_name: string; color: string }>
      for (const t of identities) {
        tmap[t.display_name] = { name: t.display_name, color: t.color }
      }
      setTeamNameMap(tmap)
      setLoading(false)
    }).catch(() => setLoading(false))
    // teamIdentity import unused warning suppress
    void loadIdentityResolver
  }, [leagueId, columnId])

  if (loading) {
    return <div className="flex justify-center py-20"><BasketballLoader size={32} /></div>
  }
  if (!column) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p>컬럼을 찾을 수 없습니다</p>
        <Link href={`/league/${orgSlug}/${leagueId}/columns`} className="text-amber-400 hover:underline mt-2 inline-block">
          목록으로 돌아가기
        </Link>
      </div>
    )
  }

  const coverPlayer = column.cover_player_id
    ? Object.values(playerNameMap).find(p => p.id === column.cover_player_id)
    : null

  return (
    <div className="space-y-5">
      {/* 상단 뒤로가기 */}
      <Link
        href={`/league/${orgSlug}/${leagueId}/columns`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-white transition-colors"
      >
        <ChevronLeft size={16} /> 매거진 목록
      </Link>

      {/* 커버 헤더 (히어로) */}
      <header className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-amber-900/60 via-gray-900 to-orange-900/40 border border-amber-700/40">
        {/* AI 배너 이미지 (있으면) — 배경 */}
        {column.cover_banner_url && (
          <img
            src={column.cover_banner_url}
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-40"
            aria-hidden
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
        <div className="relative px-6 py-8 lg:px-10 lg:py-12">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-black text-amber-300 uppercase tracking-widest px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/30">
              {PERIOD_LABEL[column.period_type]} 리포트
            </span>
            <span className="text-xs text-gray-300 flex items-center gap-1">
              <Calendar size={12} />
              {column.period_start} ~ {column.period_end}
            </span>
          </div>
          <div className="flex items-end gap-6 flex-wrap">
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl lg:text-5xl font-black text-white leading-tight mb-2">{column.title}</h1>
              {column.subtitle && (
                <p className="text-base lg:text-xl text-gray-300">{column.subtitle}</p>
              )}
            </div>
            {/* 표지 선수 프로필 사진 (원본 그대로, 절대 변형 금지) */}
            {coverPlayer?.photo_url && (
              <div className="shrink-0 w-32 h-40 lg:w-40 lg:h-52 rounded-2xl overflow-hidden border-4 border-amber-500/50 shadow-2xl">
                <img
                  src={coverPlayer.photo_url}
                  alt={coverPlayer.name}
                  className="w-full h-full object-cover object-top"
                />
              </div>
            )}
          </div>
          {column.published_at && (
            <p className="text-xs text-gray-500 mt-4">
              발행일 · {new Date(column.published_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          )}
        </div>
      </header>

      {/* 본문 */}
      <div className="bg-gray-900/60 rounded-2xl border border-gray-800 px-5 py-6 lg:px-10 lg:py-10">
        <MagazineRenderer
          body={column.body_md}
          leagueId={leagueId}
          playerMap={playerNameMap}
          teamMap={teamNameMap}
        />
      </div>

      {/* 하단 페이징 */}
      <div className="flex justify-center pt-2">
        <Link
          href={`/league/${orgSlug}/${leagueId}/columns`}
          className="text-sm text-gray-500 hover:text-white transition-colors flex items-center gap-1"
        >
          <ChevronLeft size={14} /> 매거진 목록
        </Link>
      </div>
    </div>
  )
}
