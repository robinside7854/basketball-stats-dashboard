'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import type { Quarter } from '@/types/league'
import DraftSetupStepper from '@/components/league/DraftSetupStepper'

// /admin/orgs/[orgSlug]/leagues/[leagueId]/draft 에서 이관 (2026-08-06, 조직 개념 제거).
// orgSlug 는 원래도 뒤로가기 링크 외에는 쓰이지 않았다 — 이 화면의 모든 데이터는
// leagueId 하나로 조회된다.
interface Team { id: string; name: string; color: string }

export default function AdminDraftPage() {
  const params = useParams<{ leagueId: string }>()
  const { leagueId } = params

  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [selectedQid, setSelectedQid] = useState<string | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // 팀 목록만 다시 읽는 경로(코드 발급 후 팀장 변경 등). 조용히 실패하면 화면의 팀 목록이
  // 옛 상태로 남아 "왜 안 바뀌지"가 되므로 최소한 토스트로는 알린다.
  const fetchTeams = useCallback(async () => {
    const res = await fetch(`/api/leagues/${leagueId}/teams`).catch(() => null)
    if (res?.ok) setTeams(await res.json())
    else toast.error('팀 목록을 새로고침하지 못했습니다')
  }, [leagueId])

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    const [qRes, tRes] = await Promise.all([
      fetch(`/api/leagues/${leagueId}/quarters`).catch(() => null),
      fetch(`/api/leagues/${leagueId}/teams`).catch(() => null),
    ])
    if (qRes?.ok && tRes?.ok) {
      const qs: Quarter[] = await qRes.json()
      const ts: Team[] = await tRes.json()
      setQuarters(qs ?? [])
      setTeams(ts ?? [])
      const current = (qs ?? []).find(q => q.is_current) ?? (qs ?? [])[0]
      if (current) setSelectedQid(current.id)
    } else {
      // 조회 실패를 빈 목록처럼 보여주면 "분기가 아직 없구나"로 오인해 엉뚱한 조치를 한다 — 에러로 표시.
      const failed = qRes?.ok ? tRes : qRes
      const d = failed ? await failed.json().catch(() => ({})) : {}
      setLoadError(d.error ?? '드래프트 정보를 불러오지 못했습니다')
      setQuarters([])
      setTeams([])
    }
    setLoading(false)
  }, [leagueId])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/admin/leagues/${leagueId}/manage`} className="text-[var(--mm-muted)] hover:text-[var(--mm-ink)] transition-colors p-1.5 rounded-md hover:bg-[var(--mm-panel-alt)] cursor-pointer min-h-11 min-w-11 flex items-center justify-center">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-[var(--mm-ink)] flex items-center gap-2">
            <KeyRound size={20} className="text-[var(--mm-yellow-strong)]" /> 드래프트 관리
          </h1>
          <p className="text-sm text-[var(--mm-muted)] mt-0.5 break-keep">코드 발급 · 팀장 지정 · 참여 선수 선별 · 공유 링크</p>
        </div>
      </div>

      {/* 분기 선택 */}
      <div className="flex gap-2 flex-wrap">
        {quarters.map(q => (
          <button key={q.id} onClick={() => setSelectedQid(q.id)}
            className={`px-3.5 py-2 rounded-lg text-base font-bold border transition-colors duration-200 cursor-pointer min-h-11 ${
              selectedQid === q.id ? 'bg-[var(--mm-yellow)] border-[var(--mm-yellow-strong)] text-[var(--mm-black)]' : 'bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-muted)] hover:text-[var(--mm-ink)]'
            }`}>
            {String(q.year).slice(2)}.{q.quarter}Q
            {q.is_current && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-[var(--mm-positive)] inline-block" />}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center text-[var(--mm-muted)] py-12">로딩 중...</div>
      ) : loadError ? (
        <div role="alert" className="text-center py-12 border border-dashed border-[var(--mm-negative)]/40 rounded-xl text-[var(--mm-negative)] text-sm">
          <p>{loadError}</p>
          <p className="mt-1 text-sm opacity-90 break-keep">분기·팀 정보를 알 수 없어 코드 발급과 세션 생성을 막았습니다.</p>
          <button
            onClick={load}
            className="mt-3 text-sm underline underline-offset-2 cursor-pointer"
          >
            다시 시도
          </button>
        </div>
      ) : !selectedQid ? (
        <div className="text-center text-[var(--mm-muted)] py-12">분기를 선택하세요</div>
      ) : (
        <DraftSetupStepper
          leagueId={leagueId}
          quarters={quarters}
          selectedQid={selectedQid}
          teams={teams}
          onQuarterCreated={async newId => { await load(); if (newId) setSelectedQid(newId) }}
          onTeamsChanged={fetchTeams}
        />
      )}
    </div>
  )
}
