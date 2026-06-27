'use client'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2, Copy, Check, ToggleLeft, ToggleRight, ShieldCheck, Pencil, Plus, X, AlertCircle } from 'lucide-react'

function PlainCodeLine({ plain }: { plain: string | null }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    if (!plain) return
    navigator.clipboard.writeText(plain).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }
  if (!plain) {
    return (
      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-400">
        <AlertCircle size={10} />
        <span>이전 발급(평문 없음) — 수정에서 새 코드 설정 필요</span>
      </div>
    )
  }
  return (
    <div className="mt-1.5 flex items-center gap-1.5 bg-gray-900/80 border border-gray-700 rounded-md px-2 py-1">
      <code className="font-mono text-sm text-amber-300 tracking-wider flex-1 select-all">{plain}</code>
      <button
        type="button"
        onClick={copy}
        className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer flex items-center gap-0.5 transition-colors ${copied ? 'bg-emerald-600 text-white' : 'bg-amber-700 hover:bg-amber-600 text-white'}`}
        title="복사"
      >
        {copied ? <Check size={10} /> : <Copy size={10} />}
        {copied ? '복사됨' : '복사'}
      </button>
    </div>
  )
}

interface Team { id: string; name: string; color: string }
interface DraftCode {
  id: string
  quarter_id: string
  team_id: string | null
  role: 'manager' | 'supervisor'
  label: string
  is_active: boolean
  last_used_at: string | null
  created_at: string
  plain_code: string | null
}

interface Props {
  leagueId: string
  quarterId: string
  teams: Team[]
  /** 인증 헤더 — 어드민은 {} (쿠키), 리그 페이지는 X-League-Pin */
  authHeaders?: Record<string, string>
  /** 팀 정보 갱신 콜백 — 팀명·색상 수정 시 부모 페이지가 다시 fetch 하도록 */
  onTeamsChanged?: () => void
}

export default function DraftCodeManager({ leagueId, quarterId, teams, authHeaders = {}, onTeamsChanged }: Props) {
  const [codes, setCodes] = useState<DraftCode[]>([])
  const [drafting, setDrafting] = useState<Record<string, { label: string; code: string }>>({})
  const [supDraft, setSupDraft] = useState<{ open: boolean; label: string; code: string }>({ open: false, label: '', code: '' })
  // 인라인 수정 상태 — 단장 코드 행 또는 팀 행 단위
  const [editingCode, setEditingCode] = useState<{ id: string; label: string; plain_code: string } | null>(null)
  const [editingTeam, setEditingTeam] = useState<{ id: string; name: string; color: string } | null>(null)
  const [editingSup, setEditingSup] = useState<{ id: string; label: string; plain_code: string } | null>(null)

  const jsonHeaders = { 'Content-Type': 'application/json', ...authHeaders }

  const fetchCodes = useCallback(() => {
    if (!quarterId) return
    fetch(`/api/admin/leagues/${leagueId}/draft-codes?quarterId=${quarterId}`, { headers: authHeaders })
      .then(r => r.json())
      .then(d => setCodes(Array.isArray(d) ? d : []))
      .catch(() => null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, quarterId])

  useEffect(() => { fetchCodes() }, [fetchCodes])

  // ───── 단장 코드 발급
  async function issueManager(teamId: string) {
    const form = drafting[teamId]
    if (!form || !form.label.trim() || !form.code.trim()) { toast.error('레이블과 코드를 모두 입력하세요'); return }
    if (form.code.trim().length < 3) { toast.error('코드는 최소 3자 이상이어야 합니다'); return }
    const res = await fetch(`/api/admin/leagues/${leagueId}/draft-codes`, {
      method: 'POST', headers: jsonHeaders,
      body: JSON.stringify({ quarter_id: quarterId, team_id: teamId, plain_code: form.code.trim(), label: form.label.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? '코드 발급 실패'); return }
    toast.success('단장 코드 발급 완료 — 카드에 평문이 표시됩니다')
    setDrafting(d => ({ ...d, [teamId]: { label: '', code: '' } }))
    fetchCodes()
  }

  async function issueSupervisor() {
    if (!supDraft.label.trim() || !supDraft.code.trim()) { toast.error('레이블과 코드를 모두 입력하세요'); return }
    if (supDraft.code.trim().length < 3) { toast.error('코드는 최소 3자 이상이어야 합니다'); return }
    const res = await fetch(`/api/admin/leagues/${leagueId}/draft-codes`, {
      method: 'POST', headers: jsonHeaders,
      body: JSON.stringify({ quarter_id: quarterId, role: 'supervisor', plain_code: supDraft.code.trim(), label: supDraft.label.trim() }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? '코드 발급 실패'); return }
    toast.success(`감독관 "${supDraft.label.trim()}" 코드 발급 완료`)
    setSupDraft({ open: false, label: '', code: '' })
    fetchCodes()
  }

  // ───── 코드 PATCH (label / plain_code / is_active)
  async function patchCode(id: string, payload: { label?: string; plain_code?: string; is_active?: boolean }) {
    const res = await fetch(`/api/admin/leagues/${leagueId}/draft-codes/${id}`, {
      method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error ?? '수정 실패'); return false }
    return true
  }

  async function saveCodeEdit(prevCode: DraftCode, isSupervisor: boolean) {
    const state = isSupervisor ? editingSup : editingCode
    if (!state) return
    const payload: { label?: string; plain_code?: string } = {}
    if (state.label.trim() !== prevCode.label) payload.label = state.label.trim()
    if (state.plain_code.trim().length > 0) payload.plain_code = state.plain_code.trim()
    if (Object.keys(payload).length === 0) {
      isSupervisor ? setEditingSup(null) : setEditingCode(null)
      return
    }
    const ok = await patchCode(prevCode.id, payload)
    if (!ok) return
    toast.success(payload.plain_code ? '코드가 재설정되었습니다 — 카드에 새 평문이 표시됩니다' : '레이블이 변경되었습니다')
    isSupervisor ? setEditingSup(null) : setEditingCode(null)
    fetchCodes()
  }

  async function toggleActive(c: DraftCode) {
    const ok = await patchCode(c.id, { is_active: !c.is_active })
    if (ok) { toast.success(c.is_active ? '비활성화' : '활성화'); fetchCodes() }
  }

  async function deleteCode(c: DraftCode) {
    const who = c.role === 'supervisor' ? `감독관 "${c.label}"` : (teams.find(t => t.id === c.team_id)?.name ?? '?') + ` 단장`
    if (!confirm(`${who} 코드 "${c.label}" 를 삭제하시겠습니까?`)) return
    const res = await fetch(`/api/admin/leagues/${leagueId}/draft-codes/${c.id}`, { method: 'DELETE', headers: authHeaders })
    if (res.ok) { toast.success('삭제 완료'); fetchCodes() } else toast.error('삭제 실패')
  }

  // ───── 팀명·색상 인라인 수정
  async function saveTeamEdit() {
    if (!editingTeam) return
    const name = editingTeam.name.trim()
    if (name.length < 1) { toast.error('팀명은 비울 수 없습니다'); return }
    const res = await fetch(`/api/leagues/${leagueId}/teams/${editingTeam.id}`, {
      method: 'PATCH', headers: jsonHeaders,
      body: JSON.stringify({ name, color: editingTeam.color }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { toast.error(data.error ?? '팀 정보 수정 실패'); return }
    toast.success('팀 정보가 변경되었습니다')
    setEditingTeam(null)
    onTeamsChanged?.()
  }

  const codesByTeam = Object.fromEntries(codes.filter(c => c.role !== 'supervisor' && c.team_id).map(c => [c.team_id as string, c]))
  const supervisorCodes = codes.filter(c => c.role === 'supervisor')

  return (
    <div className="space-y-4">
      {/* 단장 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {teams.map(t => {
          const existing = codesByTeam[t.id]
          const form = drafting[t.id] ?? { label: '', code: '' }
          const teamEditing = editingTeam?.id === t.id
          const codeEditing = existing && editingCode?.id === existing.id
          return (
            <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3" style={{ borderTopColor: t.color, borderTopWidth: 3 }}>
              {/* 팀 헤더 — 인라인 수정 가능 */}
              {teamEditing ? (
                <div className="space-y-2 -mt-1">
                  <div className="flex items-center gap-2">
                    <input type="color" value={editingTeam.color} onChange={e => setEditingTeam(s => s ? { ...s, color: e.target.value } : s)} className="w-8 h-8 rounded border border-gray-700 bg-transparent cursor-pointer" />
                    <Input value={editingTeam.name} onChange={e => setEditingTeam(s => s ? { ...s, name: e.target.value } : s)} placeholder="팀명" className="bg-gray-800 border-gray-700 text-white h-8 text-sm font-bold" onKeyDown={e => e.key === 'Enter' && saveTeamEdit()} autoFocus />
                  </div>
                  <div className="flex gap-1.5">
                    <Button onClick={saveTeamEdit} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white h-7 text-xs">저장</Button>
                    <Button onClick={() => setEditingTeam(null)} variant="outline" className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 h-7 text-xs">취소</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                  <span className="font-bold text-white text-base flex-1">{t.name}</span>
                  <button onClick={() => setEditingTeam({ id: t.id, name: t.name, color: t.color })} className="opacity-0 group-hover:opacity-100 p-1 rounded text-gray-500 hover:text-blue-400 cursor-pointer transition" title="팀 정보 수정">
                    <Pencil size={12} />
                  </button>
                </div>
              )}

              {/* 단장 코드 영역 */}
              {existing ? (
                codeEditing ? (
                  <div className="space-y-2">
                    <Input value={editingCode.label} onChange={e => setEditingCode(s => s ? { ...s, label: e.target.value } : s)} placeholder="레이블 (단장명)" className="bg-gray-800 border-gray-700 text-white h-8 text-sm" />
                    <Input value={editingCode.plain_code} onChange={e => setEditingCode(s => s ? { ...s, plain_code: e.target.value } : s)} placeholder="새 코드 (변경 시에만 입력)" maxLength={32} className="bg-gray-800 border-gray-700 text-white h-8 text-sm font-mono" />
                    <p className="text-[10px] text-gray-500">코드를 비워두면 레이블만 변경됩니다.</p>
                    <div className="flex gap-1.5">
                      <Button onClick={() => saveCodeEdit(existing, false)} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white h-7 text-xs">저장</Button>
                      <Button onClick={() => setEditingCode(null)} variant="outline" className="bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 h-7 text-xs">취소</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className={`px-3 py-2 rounded-lg border ${existing.is_active ? 'bg-emerald-950/40 border-emerald-700/50' : 'bg-gray-800/60 border-gray-700/50 opacity-60'}`}>
                      <p className="text-xs text-gray-500 font-bold uppercase tracking-wider">단장</p>
                      <p className="text-sm text-white font-bold">{existing.label}</p>
                      <PlainCodeLine plain={existing.plain_code} />
                      <p className="text-[10px] text-gray-500 mt-1">{existing.last_used_at ? `마지막 사용: ${new Date(existing.last_used_at).toLocaleString('ko-KR')}` : '아직 사용 안 됨'}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => setEditingCode({ id: existing.id, label: existing.label, plain_code: '' })} className="px-2.5 py-1.5 rounded-md bg-blue-900/40 hover:bg-blue-800 text-blue-300 text-xs font-bold cursor-pointer flex items-center gap-1" title="수정"><Pencil size={12} /></button>
                      <button onClick={() => toggleActive(existing)} className={`flex-1 py-1.5 rounded-md text-xs font-bold cursor-pointer flex items-center justify-center gap-1 ${existing.is_active ? 'bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300' : 'bg-gray-800 hover:bg-gray-700 text-gray-400'}`}>
                        {existing.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}{existing.is_active ? '활성' : '비활성'}
                      </button>
                      <button onClick={() => deleteCode(existing)} className="px-2.5 py-1.5 rounded-md bg-red-900/40 hover:bg-red-800 text-red-300 text-xs font-bold cursor-pointer flex items-center gap-1" title="삭제"><Trash2 size={12} /></button>
                    </div>
                  </div>
                )
              ) : (
                <div className="space-y-2">
                  <Input value={form.label} onChange={e => setDrafting(d => ({ ...d, [t.id]: { ...form, label: e.target.value } }))} placeholder="레이블 (예: 구범준 단장)" className="bg-gray-800 border-gray-700 text-white h-8 text-sm" />
                  <Input value={form.code} onChange={e => setDrafting(d => ({ ...d, [t.id]: { ...form, code: e.target.value } }))} placeholder="코드 (영문 3자, 예: LAK)" maxLength={32} className="bg-gray-800 border-gray-700 text-white h-8 text-sm font-mono" onKeyDown={e => e.key === 'Enter' && issueManager(t.id)} />
                  <Button onClick={() => issueManager(t.id)} className="w-full bg-amber-600 hover:bg-amber-500 text-white text-xs h-8">코드 발급</Button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 감독관(총무) 코드 영역 — 무제한 발급 가능 */}
      <div className="bg-gray-900 border border-amber-800/40 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={16} className="text-amber-400" />
          <span className="font-bold text-white text-sm">감독관(총무) 코드</span>
          <span className="text-[10px] text-gray-500">준비·추첨 진행 제어 — 복수 발급 가능</span>
        </div>

        {/* 발급된 감독관 카드 그리드 */}
        {supervisorCodes.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {supervisorCodes.map(c => {
              const isEditing = editingSup?.id === c.id
              return isEditing ? (
                <div key={c.id} className="bg-gray-800 border border-blue-700/50 rounded-lg p-3 space-y-2">
                  <Input value={editingSup.label} onChange={e => setEditingSup(s => s ? { ...s, label: e.target.value } : s)} placeholder="레이블" className="bg-gray-900 border-gray-700 text-white h-8 text-sm" />
                  <Input value={editingSup.plain_code} onChange={e => setEditingSup(s => s ? { ...s, plain_code: e.target.value } : s)} placeholder="새 코드 (변경 시에만)" maxLength={32} className="bg-gray-900 border-gray-700 text-white h-8 text-sm font-mono" />
                  <div className="flex gap-1.5">
                    <Button onClick={() => saveCodeEdit(c, true)} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white h-7 text-xs">저장</Button>
                    <Button onClick={() => setEditingSup(null)} variant="outline" className="bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800 h-7 text-xs">취소</Button>
                  </div>
                </div>
              ) : (
                <div key={c.id} className={`rounded-lg border p-3 space-y-2 ${c.is_active ? 'bg-emerald-950/40 border-emerald-700/50' : 'bg-gray-800/60 border-gray-700/50 opacity-60'}`}>
                  <p className="text-sm text-white font-bold">{c.label}</p>
                  <PlainCodeLine plain={c.plain_code} />
                  <p className="text-[10px] text-gray-500">{c.last_used_at ? `사용: ${new Date(c.last_used_at).toLocaleString('ko-KR')}` : '아직 사용 안 됨'}</p>
                  <div className="flex gap-1.5 pt-1">
                    <button onClick={() => setEditingSup({ id: c.id, label: c.label, plain_code: '' })} className="px-2 py-1 rounded-md bg-blue-900/40 hover:bg-blue-800 text-blue-300 text-[11px] font-bold cursor-pointer flex items-center gap-1" title="수정"><Pencil size={11} /></button>
                    <button onClick={() => toggleActive(c)} className={`flex-1 py-1 rounded-md text-[11px] font-bold cursor-pointer flex items-center justify-center gap-1 ${c.is_active ? 'bg-emerald-900/60 hover:bg-emerald-800 text-emerald-300' : 'bg-gray-800 hover:bg-gray-700 text-gray-400'}`}>
                      {c.is_active ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}{c.is_active ? '활성' : '비활성'}
                    </button>
                    <button onClick={() => deleteCode(c)} className="px-2 py-1 rounded-md bg-red-900/40 hover:bg-red-800 text-red-300 text-[11px] font-bold cursor-pointer flex items-center gap-1" title="삭제"><Trash2 size={11} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 신규 발급 폼 */}
        {supDraft.open ? (
          <div className="bg-gray-800 border border-amber-700/50 rounded-lg p-3 space-y-2 max-w-md">
            <Input value={supDraft.label} onChange={e => setSupDraft(s => ({ ...s, label: e.target.value }))} placeholder="레이블 (예: 홍길동 총무)" className="bg-gray-900 border-gray-700 text-white h-8 text-sm" autoFocus />
            <Input value={supDraft.code} onChange={e => setSupDraft(s => ({ ...s, code: e.target.value }))} placeholder="코드 (영문 3자, 예: ADM)" maxLength={32} className="bg-gray-900 border-gray-700 text-white h-8 text-sm font-mono" onKeyDown={e => e.key === 'Enter' && issueSupervisor()} />
            <div className="flex gap-1.5">
              <Button onClick={issueSupervisor} className="flex-1 bg-amber-600 hover:bg-amber-500 text-white text-xs h-8">발급</Button>
              <Button onClick={() => setSupDraft({ open: false, label: '', code: '' })} variant="outline" className="bg-gray-900 border-gray-700 text-gray-300 hover:bg-gray-800 h-8 text-xs"><X size={14} /></Button>
            </div>
          </div>
        ) : (
          <button onClick={() => setSupDraft({ open: true, label: '', code: '' })} className="w-full sm:w-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-900/30 hover:bg-amber-900/50 border border-amber-700/50 text-amber-300 text-xs font-bold cursor-pointer transition">
            <Plus size={14} /> 감독관 코드 추가 발급
          </button>
        )}
      </div>
    </div>
  )
}
