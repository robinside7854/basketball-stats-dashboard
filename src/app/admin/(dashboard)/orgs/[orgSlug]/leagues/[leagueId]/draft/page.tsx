'use client'
import { useState, useEffect, useCallback } from 'react'
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

  const fetchTeams = useCallback(() => {
    fetch(`/api/leagues/${leagueId}/teams`).then(r => r.json()).then(ts => setTeams(ts ?? [])).catch(() => null)
  }, [leagueId])

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
          {/* 방 모델 안내 — 모든 운영은 방에서 */}
          <div className="rounded-xl border border-blue-800/50 bg-gradient-to-br from-blue-950/40 to-purple-950/30 p-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center">
                <KeyRound size={16} className="text-blue-300" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-bold text-blue-200">방(공유 링크) 모델로 전환됨</p>
                <p className="text-xs text-gray-400 leading-relaxed">
                  이제 단장·감독관이 공유 링크로 입장한 후 <strong className="text-blue-300">방 안에서 풀·팀장·추첨·시작·픽 시간·채팅</strong> 등 모든 운영을 직접 관리합니다.
                  어드민은 <strong className="text-amber-300">코드 발급</strong>과 <strong className="text-amber-300">공유 링크 생성</strong>까지만 수행하면 됩니다.
                </p>
              </div>
            </div>
          </div>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">1. 코드 발급</h2>
              {selectedQuarter && <span className="text-xs text-gray-500">{selectedQuarter.year}.{selectedQuarter.quarter}Q</span>}
            </div>
            <DraftCodeManager leagueId={leagueId} quarterId={selectedQid} teams={teams} onTeamsChanged={fetchTeams} />
          </section>

          <section className="space-y-3 mt-8">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">2. 세션 + 공유 링크</h2>
            <p className="text-[11px] text-gray-500 -mt-1">세션 생성 후 <span className="text-blue-300 font-bold">공유 링크 생성</span> 까지만 여기서. 그 다음은 단장·감독관이 방에 들어와 진행합니다.</p>
            <DraftSessionControl leagueId={leagueId} quarterId={selectedQid} teams={teams} />
          </section>
        </>
      )}
    </div>
  )
}
