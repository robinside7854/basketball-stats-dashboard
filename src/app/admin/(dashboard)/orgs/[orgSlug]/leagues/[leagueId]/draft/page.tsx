'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { ArrowLeft, KeyRound, Trash2, Copy, Check, ToggleLeft, ToggleRight } from 'lucide-react'
import Link from 'next/link'
import type { Quarter } from '@/types/league'
import DraftSessionControl from './_components/DraftSessionControl'

interface DraftCode {
  id: string
  quarter_id: string
  team_id: string | null
  role: 'manager' | 'supervisor'
  label: string
  is_active: boolean
  last_used_at: string | null
  created_at: string
}

interface Team {
  id: string
  name: string
  color: string
}

export default function AdminDraftPage() {
  const params = useParams<{ orgSlug: string; leagueId: string }>()
  const { orgSlug, leagueId } = params

  const [quarters, setQuarters] = useState<Quarter[]>([])
  const [selectedQid, setSelectedQid] = useState<string | null>(null)
  const [teams, setTeams] = useState<Team[]>([])
  const [codes, setCodes] = useState<DraftCode[]>([])
  const [loading, setLoading] = useState(true)
  // 신규 발급 폼 (팀별 + 감독관)
  const [drafting, setDrafting] = useState<Record<string, { label: string; code: string }>>({})
  const [supForm, setSupForm] = useState<{ label: string; code: string }>({ label: '', code: '' })
  // 발급 직후 평문 공개 (한 번만)
  const [revealed, setRevealed] = useState<{ codeId: string; plain: string; teamName: string } | null>(null)
  const [copied, setCopied] = useState(false)

  // 초기 로드: 분기 + 팀
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

  // 분기 변경 시 코드 목록 조회
  const fetchCodes = useCallback(() => {
    if (!selectedQid) return
    fetch(`/api/admin/leagues/${leagueId}/draft-codes?quarterId=${selectedQid}`)
      .then(r => r.json())
      .then(d => setCodes(Array.isArray(d) ? d : []))
      .catch(() => null)
  }, [leagueId, selectedQid])

  useEffect(() => { fetchCodes() }, [fetchCodes])

  async function issueCode(teamId: string) {
    const form = drafting[teamId]
    if (!form || !form.label.trim() || !form.code.trim()) {
      toast.error('레이블과 코드를 모두 입력하세요')
      return
    }
    if (form.code.trim().length < 3) {
      toast.error('코드는 최소 3자 이상이어야 합니다')
      return
    }
    const res = await fetch(`/api/admin/leagues/${leagueId}/draft-codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quarter_id: selectedQid,
        team_id: teamId,
        plain_code: form.code.trim(),
        label: form.label.trim(),
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      toast.error(data.error ?? '코드 발급 실패')
      return
    }
    toast.success('코드 발급 완료 — 평문은 한 번만 표시됩니다')
    const team = teams.find(t => t.id === teamId)
    setRevealed({ codeId: data.id, plain: form.code.trim(), teamName: team?.name ?? '' })
    setDrafting(d => ({ ...d, [teamId]: { label: '', code: '' } }))
    fetchCodes()
  }

  async function issueSupervisor() {
    if (!supForm.label.trim() || !supForm.code.trim()) { toast.error('레이블과 코드를 모두 입력하세요'); return }
    if (supForm.code.trim().length < 3) { toast.error('코드는 최소 3자 이상이어야 합니다'); return }
    const res = await fetch(`/api/admin/leagues/${leagueId}/draft-codes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quarter_id: selectedQid, role: 'supervisor', plain_code: supForm.code.trim(), label: supForm.label.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? '코드 발급 실패'); return }
    toast.success('감독관 코드 발급 완료')
    setRevealed({ codeId: data.id, plain: supForm.code.trim(), teamName: '감독관(총무)' })
    setSupForm({ label: '', code: '' })
    fetchCodes()
  }

  async function toggleActive(c: DraftCode) {
    const res = await fetch(`/api/admin/leagues/${leagueId}/draft-codes/${c.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !c.is_active }),
    })
    if (res.ok) { toast.success(c.is_active ? '비활성화' : '활성화'); fetchCodes() }
    else { toast.error('변경 실패') }
  }

  async function deleteCode(c: DraftCode) {
    const who = c.role === 'supervisor' ? '감독관(총무)' : (teams.find(t => t.id === c.team_id)?.name ?? '?')
    if (!confirm(`"${who}" 의 "${c.label}" 코드를 삭제하시겠습니까?\n해당 사용자가 더 이상 입장할 수 없게 됩니다.`)) return
    const res = await fetch(`/api/admin/leagues/${leagueId}/draft-codes/${c.id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('삭제 완료'); fetchCodes() }
    else { toast.error('삭제 실패') }
  }

  function copyRevealed() {
    if (!revealed) return
    navigator.clipboard.writeText(revealed.plain).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const selectedQuarter = quarters.find(q => q.id === selectedQid)
  const codesByTeam = Object.fromEntries(codes.filter(c => c.role !== 'supervisor' && c.team_id).map(c => [c.team_id as string, c]))
  const supervisorCode = codes.find(c => c.role === 'supervisor') ?? null

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/admin/orgs/${orgSlug}/leagues/${leagueId}`}
            className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-md hover:bg-gray-800"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <KeyRound size={20} className="text-amber-400" />
              드래프트 관리
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">단장·감독관 코드 발급 · 팀장 지정 · 풀 선별 · 승률 가중 추첨</p>
          </div>
        </div>
      </div>

      {/* 분기 선택 */}
      <div className="flex gap-2 flex-wrap">
        {quarters.map(q => (
          <button
            key={q.id}
            onClick={() => setSelectedQid(q.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-bold border transition-colors cursor-pointer ${
              selectedQid === q.id
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            {String(q.year).slice(2)}.{q.quarter}Q
            {q.is_current && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}
          </button>
        ))}
      </div>

      {/* 평문 코드 공개 모달 */}
      {revealed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setRevealed(null)}>
          <div className="bg-gray-900 border border-amber-700/60 rounded-2xl p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="text-amber-400 font-black text-lg mb-2">⚠ 코드는 한 번만 표시됩니다</h3>
            <p className="text-sm text-gray-400 mb-4">
              <strong className="text-white">{revealed.teamName}</strong> 단장에게 아래 코드를 전달하세요. 이 창을 닫으면 다시 볼 수 없습니다.
            </p>
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center justify-between gap-2 mb-4">
              <code className="font-mono text-xl text-amber-300 tracking-wider">{revealed.plain}</code>
              <button onClick={copyRevealed} className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold flex items-center gap-1.5 cursor-pointer transition-colors">
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? '복사됨' : '복사'}
              </button>
            </div>
            <Button onClick={() => setRevealed(null)} className="w-full bg-blue-600 hover:bg-blue-500 text-white">
              확인 (창 닫기)
            </Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-12">로딩 중...</div>
      ) : !selectedQid ? (
        <div className="text-center text-gray-500 py-12">분기를 선택하세요</div>
      ) : (
        <>
          {/* 단장 코드 발급 섹션 */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">단장 코드</h2>
              {selectedQuarter && (
                <span className="text-xs text-gray-500">
                  {selectedQuarter.year}.{selectedQuarter.quarter}Q · 팀당 1개씩 발급
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {teams.map(t => {
                const existing = codesByTeam[t.id]
                const form = drafting[t.id] ?? { label: '', code: '' }
                return (
                  <div
                    key={t.id}
                    className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3"
                    style={{ borderTopColor: t.color, borderTopWidth: 3 }}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                      <span className="font-bold text-white text-base">{t.name}</span>
                    </div>

                    {existing ? (
                      // 발급된 코드: 라벨, 사용기록, 액션
                      <div className="space-y-2">
                        <div className={`px-3 py-2 rounded-lg border ${existing.is_active ? 'bg-emerald-950/40 border-emerald-700/50' : 'bg-gray-800/60 border-gray-700/50 opacity-60'}`}>
                          <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">레이블</p>
                          <p className="text-sm text-white font-bold">{existing.label}</p>
                          <p className="text-[10px] text-gray-500 mt-1">
                            {existing.last_used_at
                              ? `마지막 사용: ${new Date(existing.last_used_at).toLocaleString('ko-KR')}`
                              : '아직 사용 안 됨'}
                          </p>
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            onClick={() => toggleActive(existing)}
                            className={`flex-1 py-1.5 rounded-md text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-1 ${
                              existing.is_active
                                ? 'bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300'
                                : 'bg-gray-800 hover:bg-gray-700 text-gray-400'
                            }`}
                          >
                            {existing.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                            {existing.is_active ? '활성' : '비활성'}
                          </button>
                          <button
                            onClick={() => deleteCode(existing)}
                            className="px-2.5 py-1.5 rounded-md bg-red-900/40 hover:bg-red-800 text-red-300 text-xs font-bold cursor-pointer transition-colors flex items-center gap-1"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      // 미발급: 발급 폼
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-1">레이블</label>
                          <Input
                            value={form.label}
                            onChange={e => setDrafting(d => ({ ...d, [t.id]: { ...form, label: e.target.value } }))}
                            placeholder="구범준 단장"
                            className="bg-gray-800 border-gray-700 text-white h-8 text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-1">코드 (영문 3자)</label>
                          <Input
                            value={form.code}
                            onChange={e => setDrafting(d => ({ ...d, [t.id]: { ...form, code: e.target.value } }))}
                            placeholder="예: LAK"
                            maxLength={32}
                            className="bg-gray-800 border-gray-700 text-white h-8 text-sm font-mono"
                            onKeyDown={e => e.key === 'Enter' && issueCode(t.id)}
                          />
                        </div>
                        <Button
                          onClick={() => issueCode(t.id)}
                          className="w-full bg-amber-600 hover:bg-amber-500 text-white text-xs h-8"
                        >
                          코드 발급
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* 감독관(총무) 코드 */}
            <div className="mt-4">
              <div className="flex items-center gap-2 mb-2">
                <h3 className="text-xs font-bold text-amber-400 uppercase tracking-widest">감독관(총무) 코드</h3>
                <span className="text-[10px] text-gray-500">준비 체크 · 추첨 진행 제어 (선수 픽 불가)</span>
              </div>
              <div className="bg-gray-900 border border-amber-800/40 rounded-xl p-4 max-w-md" style={{ borderTopColor: '#f59e0b', borderTopWidth: 3 }}>
                {supervisorCode ? (
                  <div className="space-y-2">
                    <div className={`px-3 py-2 rounded-lg border ${supervisorCode.is_active ? 'bg-emerald-950/40 border-emerald-700/50' : 'bg-gray-800/60 border-gray-700/50 opacity-60'}`}>
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">레이블</p>
                      <p className="text-sm text-white font-bold">{supervisorCode.label}</p>
                      <p className="text-[10px] text-gray-500 mt-1">
                        {supervisorCode.last_used_at ? `마지막 사용: ${new Date(supervisorCode.last_used_at).toLocaleString('ko-KR')}` : '아직 사용 안 됨'}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => toggleActive(supervisorCode)}
                        className={`flex-1 py-1.5 rounded-md text-xs font-bold cursor-pointer transition-colors flex items-center justify-center gap-1 ${
                          supervisorCode.is_active ? 'bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300' : 'bg-gray-800 hover:bg-gray-700 text-gray-400'
                        }`}>
                        {supervisorCode.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        {supervisorCode.is_active ? '활성' : '비활성'}
                      </button>
                      <button onClick={() => deleteCode(supervisorCode)}
                        className="px-2.5 py-1.5 rounded-md bg-red-900/40 hover:bg-red-800 text-red-300 text-xs font-bold cursor-pointer transition-colors flex items-center gap-1">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-1">레이블</label>
                      <Input value={supForm.label} onChange={e => setSupForm(f => ({ ...f, label: e.target.value }))}
                        placeholder="홍길동 총무" className="bg-gray-800 border-gray-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wider block mb-1">코드 (영문 3자)</label>
                      <Input value={supForm.code} onChange={e => setSupForm(f => ({ ...f, code: e.target.value }))}
                        placeholder="예: ADM" maxLength={32} className="bg-gray-800 border-gray-700 text-white h-8 text-sm font-mono"
                        onKeyDown={e => e.key === 'Enter' && issueSupervisor()} />
                    </div>
                    <Button onClick={issueSupervisor} className="w-full bg-amber-600 hover:bg-amber-500 text-white text-xs h-8">감독관 코드 발급</Button>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* 드래프트 세션 관리 */}
          <section className="space-y-3 mt-8">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-widest">드래프트 세션</h2>
            <DraftSessionControl leagueId={leagueId} quarterId={selectedQid} teams={teams} />
          </section>
        </>
      )}
    </div>
  )
}
