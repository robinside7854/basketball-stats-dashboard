'use client'
import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2, Copy, Check, ToggleLeft, ToggleRight, ShieldCheck, Pencil, Plus, X, AlertCircle } from 'lucide-react'

// 운영자가 카톡으로 그대로 배포해야 하는 값이라, 두 테마 모두에서 확실히 읽혀야 한다.
// 예전에는 gray-900/amber-300 처럼 다크 전용 색을 박아 뒀는데, 라이트 모드에서는
// globals.css 가 gray-900 을 흰색으로 뒤집기 때문에 코드가 흰 배경 위 연노랑(1.44:1)이 되고
// 복사 버튼은 거의 보이지 않았다. mm 토큰만 쓰면 두 테마 모두 4.5:1 이상이 보장된다.
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
      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-[var(--mm-yellow-strong)]">
        <AlertCircle size={10} />
        <span>이전 발급(평문 없음) — 수정에서 새 코드 설정 필요</span>
      </div>
    )
  }
  return (
    <div className="mt-1.5 flex items-center gap-1.5 bg-[var(--mm-yellow-soft)] border border-[var(--mm-rule)] rounded-md px-2 py-1">
      <code className="font-mono text-sm text-[var(--mm-yellow-strong)] font-bold tracking-wider flex-1 select-all break-all">{plain}</code>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? '코드 복사됨' : '코드 복사'}
        className={`shrink-0 px-2 py-1 rounded text-[10px] font-bold cursor-pointer flex items-center gap-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] ${copied ? 'bg-[var(--mm-positive-bg)] text-[var(--mm-positive-fg)]' : 'bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90'}`}
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
            <div key={t.id} className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-4 space-y-3" style={{ borderTopColor: t.color, borderTopWidth: 3 }}>
              {/* 팀 헤더 — 인라인 수정 가능 */}
              {teamEditing ? (
                <div className="space-y-2 -mt-1">
                  <div className="flex items-center gap-2">
                    <input type="color" aria-label="팀 색상" value={editingTeam.color} onChange={e => setEditingTeam(s => s ? { ...s, color: e.target.value } : s)} className="w-9 h-9 shrink-0 rounded border border-[var(--mm-rule)] bg-transparent cursor-pointer" />
                    <Input value={editingTeam.name} onChange={e => setEditingTeam(s => s ? { ...s, name: e.target.value } : s)} placeholder="팀명" className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] h-9 text-sm font-bold" onKeyDown={e => e.key === 'Enter' && saveTeamEdit()} autoFocus />
                  </div>
                  <div className="flex gap-1.5">
                    <Button onClick={saveTeamEdit} className="flex-1 bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 h-9 text-xs cursor-pointer">저장</Button>
                    <Button onClick={() => setEditingTeam(null)} variant="outline" className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] h-9 text-xs cursor-pointer">취소</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 group">
                  <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                  <span className="font-bold text-[var(--mm-ink)] text-base flex-1 min-w-0 truncate">{t.name}</span>
                  {/* 항상 보이는 편집 버튼 — hover 로만 나타나면 터치 기기에서는 존재 자체를 알 수 없다 */}
                  <button onClick={() => setEditingTeam({ id: t.id, name: t.name, color: t.color })} aria-label={`${t.name} 팀 정보 수정`} className="shrink-0 w-11 h-11 -my-2 flex items-center justify-center rounded text-[var(--mm-muted)] hover:text-[var(--mm-ink)] cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)]" title="팀 정보 수정">
                    <Pencil size={14} />
                  </button>
                </div>
              )}

              {/* 단장 코드 영역 */}
              {existing ? (
                codeEditing ? (
                  <div className="space-y-2">
                    <Input value={editingCode.label} onChange={e => setEditingCode(s => s ? { ...s, label: e.target.value } : s)} placeholder="레이블 (단장명)" className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] h-9 text-sm" />
                    <Input value={editingCode.plain_code} onChange={e => setEditingCode(s => s ? { ...s, plain_code: e.target.value } : s)} placeholder="새 코드 (변경 시에만 입력)" maxLength={32} className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] h-9 text-sm font-mono" />
                    <p className="text-[10px] text-[var(--mm-muted)]">코드를 비워두면 레이블만 변경됩니다.</p>
                    <div className="flex gap-1.5">
                      <Button onClick={() => saveCodeEdit(existing, false)} className="flex-1 bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 h-9 text-xs cursor-pointer">저장</Button>
                      <Button onClick={() => setEditingCode(null)} variant="outline" className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] h-9 text-xs cursor-pointer">취소</Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className={`px-3 py-2 rounded-lg border ${existing.is_active ? 'bg-[var(--mm-positive-bg)] border-[var(--mm-positive)]/40' : 'bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] opacity-70'}`}>
                      <p className="text-xs text-[var(--mm-muted)] font-bold uppercase tracking-wider">단장</p>
                      <p className="text-sm text-[var(--mm-ink)] font-bold">{existing.label}</p>
                      <PlainCodeLine plain={existing.plain_code} />
                      <p className="text-[10px] text-[var(--mm-muted)] mt-1">{existing.last_used_at ? `마지막 사용: ${new Date(existing.last_used_at).toLocaleString('ko-KR')}` : '아직 사용 안 됨'}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => setEditingCode({ id: existing.id, label: existing.label, plain_code: '' })} aria-label={`${existing.label} 코드 수정`} className="px-3 min-h-11 rounded-md border border-[var(--mm-rule)] bg-[var(--mm-panel-alt)] hover:border-[var(--mm-muted)] text-[var(--mm-ink-soft)] text-xs font-bold cursor-pointer flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)]" title="수정"><Pencil size={12} /></button>
                      <button onClick={() => toggleActive(existing)} className={`flex-1 min-h-11 rounded-md text-xs font-bold cursor-pointer flex items-center justify-center gap-1 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] ${existing.is_active ? 'bg-[var(--mm-positive-bg)] border-[var(--mm-positive)]/40 text-[var(--mm-positive-fg)]' : 'bg-[var(--mm-neutral-bg)] border-[var(--mm-rule)] text-[var(--mm-neutral-fg)]'}`}>
                        {existing.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}{existing.is_active ? '활성' : '비활성'}
                      </button>
                      {/* 파괴 액션 — 수정·활성 토글과 같은 톤이면 손이 안 멈춘다 */}
                      <button onClick={() => deleteCode(existing)} aria-label={`${existing.label} 코드 삭제`} className="px-3 min-h-11 rounded-md border border-[var(--mm-negative)]/30 bg-[var(--mm-negative-bg)] text-[var(--mm-negative)] hover:border-[var(--mm-negative)]/60 text-xs font-bold cursor-pointer flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-negative)]" title="삭제"><Trash2 size={12} /></button>
                    </div>
                  </div>
                )
              ) : (
                <div className="space-y-2">
                  <Input value={form.label} onChange={e => setDrafting(d => ({ ...d, [t.id]: { ...form, label: e.target.value } }))} placeholder="레이블 (예: 구범준 단장)" className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] h-9 text-sm" />
                  <Input value={form.code} onChange={e => setDrafting(d => ({ ...d, [t.id]: { ...form, code: e.target.value } }))} placeholder="코드 (영문 3자, 예: LAK)" maxLength={32} className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] h-9 text-sm font-mono" onKeyDown={e => e.key === 'Enter' && issueManager(t.id)} />
                  <Button onClick={() => issueManager(t.id)} className="w-full bg-[var(--mm-yellow)] text-[var(--mm-black)] hover:opacity-90 text-xs min-h-11 font-bold cursor-pointer">코드 발급</Button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 감독관(총무) 코드 영역 — 무제한 발급 가능 */}
      <div className="bg-[var(--mm-panel)] border border-[var(--mm-yellow-strong)]/40 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <ShieldCheck size={16} className="text-[var(--mm-yellow-strong)]" />
          <span className="font-bold text-[var(--mm-ink)] text-sm">감독관(총무) 코드</span>
          <span className="text-[10px] text-[var(--mm-muted)]">준비·추첨 진행 제어 — 복수 발급 가능</span>
        </div>

        {/* 발급된 감독관 카드 그리드 */}
        {supervisorCodes.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {supervisorCodes.map(c => {
              const isEditing = editingSup?.id === c.id
              return isEditing ? (
                <div key={c.id} className="bg-[var(--mm-panel-alt)] border border-[var(--mm-rule)] rounded-lg p-3 space-y-2">
                  <Input value={editingSup.label} onChange={e => setEditingSup(s => s ? { ...s, label: e.target.value } : s)} placeholder="레이블" className="bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink)] h-9 text-sm" />
                  <Input value={editingSup.plain_code} onChange={e => setEditingSup(s => s ? { ...s, plain_code: e.target.value } : s)} placeholder="새 코드 (변경 시에만)" maxLength={32} className="bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink)] h-9 text-sm font-mono" />
                  <div className="flex gap-1.5">
                    <Button onClick={() => saveCodeEdit(c, true)} className="flex-1 bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 h-9 text-xs cursor-pointer">저장</Button>
                    <Button onClick={() => setEditingSup(null)} variant="outline" className="bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] h-9 text-xs cursor-pointer">취소</Button>
                  </div>
                </div>
              ) : (
                <div key={c.id} className={`rounded-lg border p-3 space-y-2 ${c.is_active ? 'bg-[var(--mm-positive-bg)] border-[var(--mm-positive)]/40' : 'bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] opacity-70'}`}>
                  <p className="text-sm text-[var(--mm-ink)] font-bold">{c.label}</p>
                  <PlainCodeLine plain={c.plain_code} />
                  <p className="text-[10px] text-[var(--mm-muted)]">{c.last_used_at ? `사용: ${new Date(c.last_used_at).toLocaleString('ko-KR')}` : '아직 사용 안 됨'}</p>
                  <div className="flex gap-1.5 pt-1">
                    <button onClick={() => setEditingSup({ id: c.id, label: c.label, plain_code: '' })} aria-label={`${c.label} 코드 수정`} className="px-3 min-h-11 rounded-md border border-[var(--mm-rule)] bg-[var(--mm-panel)] hover:border-[var(--mm-muted)] text-[var(--mm-ink-soft)] text-[11px] font-bold cursor-pointer flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)]" title="수정"><Pencil size={11} /></button>
                    <button onClick={() => toggleActive(c)} className={`flex-1 min-h-11 rounded-md text-[11px] font-bold cursor-pointer flex items-center justify-center gap-1 border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] ${c.is_active ? 'bg-[var(--mm-positive-bg)] border-[var(--mm-positive)]/40 text-[var(--mm-positive-fg)]' : 'bg-[var(--mm-neutral-bg)] border-[var(--mm-rule)] text-[var(--mm-neutral-fg)]'}`}>
                      {c.is_active ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}{c.is_active ? '활성' : '비활성'}
                    </button>
                    <button onClick={() => deleteCode(c)} aria-label={`${c.label} 코드 삭제`} className="px-3 min-h-11 rounded-md border border-[var(--mm-negative)]/30 bg-[var(--mm-negative-bg)] text-[var(--mm-negative)] hover:border-[var(--mm-negative)]/60 text-[11px] font-bold cursor-pointer flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-negative)]" title="삭제"><Trash2 size={11} /></button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 신규 발급 폼 */}
        {supDraft.open ? (
          <div className="bg-[var(--mm-panel-alt)] border border-[var(--mm-yellow-strong)]/40 rounded-lg p-3 space-y-2 max-w-md">
            <Input value={supDraft.label} onChange={e => setSupDraft(s => ({ ...s, label: e.target.value }))} placeholder="레이블 (예: 홍길동 총무)" className="bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink)] h-9 text-sm" autoFocus />
            <Input value={supDraft.code} onChange={e => setSupDraft(s => ({ ...s, code: e.target.value }))} placeholder="코드 (영문 3자, 예: ADM)" maxLength={32} className="bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink)] h-9 text-sm font-mono" onKeyDown={e => e.key === 'Enter' && issueSupervisor()} />
            <div className="flex gap-1.5">
              <Button onClick={issueSupervisor} className="flex-1 bg-[var(--mm-yellow)] text-[var(--mm-black)] hover:opacity-90 text-xs min-h-11 font-bold cursor-pointer">발급</Button>
              <Button onClick={() => setSupDraft({ open: false, label: '', code: '' })} aria-label="발급 취소" variant="outline" className="bg-[var(--mm-panel)] border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] min-h-11 text-xs cursor-pointer"><X size={14} /></Button>
            </div>
          </div>
        ) : (
          <button onClick={() => setSupDraft({ open: true, label: '', code: '' })} className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 min-h-11 rounded-lg bg-[var(--mm-yellow-soft)] hover:opacity-90 border border-[var(--mm-yellow-strong)]/40 text-[var(--mm-yellow-strong)] text-xs font-bold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)]">
            <Plus size={14} /> 감독관 코드 추가 발급
          </button>
        )}
      </div>
    </div>
  )
}
