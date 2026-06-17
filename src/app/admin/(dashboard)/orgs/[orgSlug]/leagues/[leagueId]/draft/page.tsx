'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, KeyRound } from 'lucide-react'
import Link from 'next/link'
import type { Quarter } from '@/types/league'
import DraftCodeManager from '@/components/league/DraftCodeManager'
import DraftSessionControl from '@/components/league/DraftSessionControl'

interface Team { id: string; name: string; color: string }

export default function AdminDraftPage() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params

  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [selectedQid, setSelectedQid] = useState<string | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch(`/api/leagues/${leagueId}/quarters`).then(r => r.json()),
      fetch(`/api/leagues/${leagueId}/teams`).then(r => r.json()),
    ]).then(([qs, ts]) => {
      setQuarters(qs ?? [])
      setTeams(ts ?? [])
      const current = (qs ?? []).find((q: Quarter) => q.is_current) ?? (qs ?? [])[0]
      if (current) setSelectedQid(current.id)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [leagueId])

  const selectedQuarter = quarters.find(q => q.id === selectedQid)

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center gap-3">
        <Link href={`/admin/orgs/${orgSlug}/leagues/${leagueId}`} className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-md hover:bg-gray-800">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <KeyRound size={20} className="text-amber-400" /> 드래프트 관리
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">단장·감독관 코드 발급 · 팀장 지정 · 풀 선별 · 승률 가중 추첨</p>
        </div>
      </div>

      {/* 분기 선택 */}
      <div className="flex gap-2 flex-wrap">
        {quarters.map(q => (
          <button key={q.id} onClick={() => setSelectedQid(q.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors cursor-pointer ${
              selectedQid === q.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
            }`}>
            {String(q.year).slice(2)}.{q.quarter}Q
            {q.is_current && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">로딩 중...</div>
      ) : !selectedQid ? (
        <div className="text-center text-gray-500 py-12">분기를 선택하세요</div>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">코드 발급</h2>
              {selectedQuarter && <span className="text-xs text-gray-500">{selectedQuarter.year}.{selectedQuarter.quarter}Q</span>}
            </div>
            <DraftCodeManager leagueId={leagueId} quarterId={selectedQid} teams={teams} />
          </section>

          <section className="space-y-3 mt-8">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">드래프트 세션</h2>
            <DraftSessionControl leagueId={leagueId} quarterId={selectedQid} teams={teams} />
          </section>
        </>
      )}
    </div>
  )
}
