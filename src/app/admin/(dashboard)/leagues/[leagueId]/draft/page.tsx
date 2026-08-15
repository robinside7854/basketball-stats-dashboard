'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import type { Quarter } from '@/types/league'
import DraftCodeManager from '@/components/league/DraftCodeManager'
import DraftSessionControl from '@/components/league/DraftSessionControl'

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

  const selectedQuarter = quarters.find(q => q.id === selectedQid)

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/admin/leagues/${leagueId}/manage`} className="text-[var(--mm-muted)] hover:text-[var(--mm-ink)] transition-colors p-1.5 rounded-md hover:bg-[var(--mm-panel-alt)] cursor-pointer min-h-11 min-w-11 flex items-center justify-center">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-[var(--mm-ink)] flex items-center gap-2">
            <KeyRound size={20} className="text-[var(--mm-yellow-strong)]" /> 드래프트 관리
          </h1>
          <p className="text-xs text-[var(--mm-muted)] mt-0.5">단장·감독관 코드 발급 · 팀장 지정 · 풀 선별 · 승률 가중 추첨</p>
        </div>
      </div>

      {/* 분기 선택 */}
      <div className="flex gap-2 flex-wrap">
        {quarters.map(q => (
          <button key={q.id} onClick={() => setSelectedQid(q.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors cursor-pointer min-h-11 ${
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
          <p className="mt-1 text-xs opacity-80">분기·팀 정보를 알 수 없어 코드 발급과 세션 생성을 막았습니다.</p>
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
        <>
          {/* 방 모델 안내 — 모든 운영은 방에서 */}
          <div className="rounded-xl border border-[var(--mm-yellow-strong)]/30 bg-[var(--mm-panel-alt)] p-4">
            <div className="flex items-start gap-3">
              <div className="shrink-0 w-9 h-9 rounded-lg bg-[var(--mm-yellow)]/20 border border-[var(--mm-yellow-strong)]/40 flex items-center justify-center">
                <KeyRound size={16} className="text-[var(--mm-yellow-strong)]" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm font-bold text-[var(--mm-ink)]">방(공유 링크) 모델로 전환됨</p>
                <p className="text-xs text-[var(--mm-muted)] leading-relaxed">
                  이제 단장·감독관이 공유 링크로 입장한 후 <strong className="text-[var(--mm-yellow-strong)]">방 안에서 풀·팀장·추첨·시작·픽 시간·채팅</strong> 등 모든 운영을 직접 관리합니다.
                  어드민은 <strong className="text-[var(--mm-yellow-strong)]">코드 발급</strong>과 <strong className="text-[var(--mm-yellow-strong)]">공유 링크 생성</strong>까지만 수행하면 됩니다.
                </p>
              </div>
            </div>
          </div>

          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-[var(--mm-muted)] uppercase tracking-widest">1. 코드 발급</h2>
              {selectedQuarter && <span className="text-xs text-[var(--mm-muted)]">{selectedQuarter.year}.{selectedQuarter.quarter}Q</span>}
            </div>
            <DraftCodeManager leagueId={leagueId} quarterId={selectedQid} teams={teams} onTeamsChanged={fetchTeams} />
          </section>

          <section className="space-y-3 mt-8">
            <h2 className="text-sm font-bold text-[var(--mm-muted)] uppercase tracking-widest">2. 세션 + 공유 링크</h2>
            <p className="text-[11px] text-[var(--mm-muted)] -mt-1">세션 생성 후 <span className="text-[var(--mm-yellow-strong)] font-bold">공유 링크 생성</span> 까지만 여기서. 그 다음은 단장·감독관이 방에 들어와 진행합니다.</p>
            <DraftSessionControl leagueId={leagueId} quarterId={selectedQid} teams={teams} />
          </section>
        </>
      )}
    </div>
  )
}
