'use client'
// 새 동호회 만들기 마법사 (2026-11-10 온볼 플랫폼화 4단계)
//   ① 이름·주소 → ② 견본 → ③ 팀·명단 → ④ 어드민 → 만들기 → 가입 링크
//   저장은 마지막에 한 번(POST /api/admin/clubs) — 중간에 나가도 아무것도 안 생긴다.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, Copy, Loader2, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import { CLUB_TEMPLATES, FEATURE_KEYS, FEATURE_LABELS, type ClubTemplateKey } from '@/lib/club/features'
import { parseRosterPaste } from '@/lib/club/rosterPaste'

const STEPS = ['이름', '견본', '명단', '어드민'] as const
const box = 'rounded-xl border border-[var(--mm-rule)] bg-[var(--mm-panel)] p-4 space-y-3'
const input = 'w-full min-h-11 px-3 rounded-lg border border-[var(--mm-rule)] bg-[var(--mm-paper,transparent)] text-[var(--mm-ink)] text-base'
const label = 'block text-sm font-semibold text-[var(--mm-ink)] break-keep'
const hint = 'text-xs text-[var(--mm-muted)] break-keep'

export default function ClubWizard() {
  const [step, setStep] = useState(0)
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [template, setTemplate] = useState<ClubTemplateKey | null>(null)
  const [teams, setTeams] = useState<string[]>(['', '', ''])
  const [rosterText, setRosterText] = useState('')
  const [admins, setAdmins] = useState<Array<{ name: string; birth6: string }>>([{ name: '', birth6: '' }])
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<{ team_id: string; path: string } | null>(null)

  const roster = useMemo(() => parseRosterPaste(rosterText), [rosterText])
  const slugOk = /^[a-z][a-z0-9-]{1,29}$/.test(slug)
  const teamNames = teams.map(t => t.trim()).filter(Boolean)
  const norm = (s: string) => s.replace(/\s+/g, '')
  const adminOk = admins.some(a => a.name.trim()) && admins.every(a => !a.name.trim() || (/^\d{6}$/.test(a.birth6) && roster.rows.some(r => norm(r.name) === norm(a.name))))
  const canNext = [
    !!name.trim() && slugOk,
    !!template,
    teamNames.length >= 2 && new Set(teamNames).size === teamNames.length && roster.problems.length === 0 && roster.rows.length > 0,
    adminOk,
  ][step]

  async function create() {
    setBusy(true)
    try {
      const r = await fetch('/api/admin/clubs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, org_slug: slug, is_public: isPublic, template, team_names: teamNames, roster_text: rosterText, admins: admins.filter(a => a.name.trim()) }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error ?? '만들지 못했어요')
      setDone(j)
    } catch (e) { toast.error(e instanceof Error ? e.message : '만들지 못했어요') }
    finally { setBusy(false) }
  }

  if (done) {
    const url = typeof window !== 'undefined' ? `${window.location.origin}${done.path}` : done.path
    const copy = (t: string) => navigator.clipboard.writeText(t).then(() => toast.success('복사했어요'), () => toast.error('복사하지 못했어요'))
    const msg = `${name} 기록 앱이 열렸어요.\n아래 주소에서 가입해 주세요.\n${url}\n이용 방법은 ${url}/guide 에 있어요.`
    return (
      <section className="max-w-xl space-y-4">
        <div className={box}>
          <p className="text-lg font-black text-[var(--mm-ink)] break-keep flex items-center gap-2"><Check size={20} className="text-[var(--mm-positive)]" /><span>동호회를 만들었어요</span></p>
          <p className="text-sm font-semibold text-[var(--mm-ink)] break-keep">{name}</p>
          <p className={hint}>어드민 아이디는 이름이에요.</p>
          <p className={hint}>비밀번호는 생년월일 6자리예요.</p>
          <p className={hint}>회원은 아래 주소에서 가입해요.</p>
          <p className={hint}>명단에 있는 이름이면 바로 승인돼요.</p>
          <div className="flex items-center gap-2 rounded-lg border border-[var(--mm-rule)] p-2">
            <span className="flex-1 text-sm text-[var(--mm-ink)] [overflow-wrap:anywhere]">{url}</span>
            <button onClick={() => copy(url)} className="mm-press shrink-0 min-h-11 px-3 rounded-lg border border-[var(--mm-rule)] text-sm inline-flex items-center gap-1"><Copy size={14} />주소</button>
          </div>
          <button onClick={() => copy(msg)} className="mm-press w-full min-h-11 rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] text-sm font-semibold inline-flex items-center justify-center gap-1"><Copy size={14} />단톡방 안내 복사</button>
        </div>
        <div className="flex gap-2">
          <Link href={`/admin/clubs/${done.team_id}`} className="flex-1 text-center min-h-11 leading-[2.75rem] rounded-lg border border-[var(--mm-rule)] text-sm text-[var(--mm-ink)]">설정 고치기</Link>
          <a href={done.path} target="_blank" rel="noreferrer" className="flex-1 text-center min-h-11 leading-[2.75rem] rounded-lg border border-[var(--mm-rule)] text-sm text-[var(--mm-ink)]">동호회 화면 열기</a>
        </div>
      </section>
    )
  }

  return (
    <section className="max-w-xl space-y-4">
      <Link href="/admin" className="inline-flex items-center gap-1 text-sm text-[var(--mm-muted)] min-h-11"><ArrowLeft size={16} />동호회 목록</Link>
      <h1 className="text-xl font-black text-[var(--mm-ink)]">새 동호회 만들기</h1>
      <ol className="grid grid-cols-4 gap-1">
        {STEPS.map((s, i) => (
          <li key={s} className={`text-center text-xs py-2 rounded-lg border ${i === step ? 'border-[var(--mm-ink)] text-[var(--mm-ink)] font-bold' : i < step ? 'border-[var(--mm-rule)] text-[var(--mm-ink)]' : 'border-[var(--mm-rule)] text-[var(--mm-muted)]'}`}>
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className={box}>
          <div className="space-y-1">
            <label className={label} htmlFor="cw-name">동호회 이름</label>
            <input id="cw-name" className={input} value={name} onChange={e => setName(e.target.value)} placeholder="예: 새벽농구회" maxLength={40} />
          </div>
          <div className="space-y-1">
            <label className={label} htmlFor="cw-slug">주소</label>
            <input id="cw-slug" className={input} value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} placeholder="예: dawn" maxLength={30} />
            <p className={hint}>영문 소문자로 시작해요. 영문·숫자·하이픈만 써요.</p>
            {slug && !slugOk && <p className="text-xs text-[var(--mm-negative)] break-keep">두 글자 이상, 영문 소문자로 시작해야 해요.</p>}
          </div>
          <label className="flex items-center gap-2 min-h-11 text-sm text-[var(--mm-ink)] break-keep">
            <input type="checkbox" checked={!isPublic} onChange={e => setIsPublic(!e.target.checked)} className="size-5" />
            회원만 보기
          </label>
          <p className={hint}>켜 두면 가입한 회원만 기록을 봐요.</p>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          {(Object.keys(CLUB_TEMPLATES) as ClubTemplateKey[]).map(k => {
            const t = CLUB_TEMPLATES[k]
            const on = template === k
            return (
              <button key={k} onClick={() => setTemplate(k)} className={`mm-press w-full text-left ${box} ${on ? '!border-[var(--mm-ink)] ring-1 ring-[var(--mm-ink)]' : ''}`}>
                <p className="font-bold text-[var(--mm-ink)] flex items-center gap-2">{on && <Check size={16} />}<span>{t.label}</span></p>
                <p className={hint}>{t.desc}</p>
                <div className="flex flex-wrap gap-1">
                  {FEATURE_KEYS.map(f => (
                    <span key={f} className={`text-xs px-2 py-0.5 rounded-full border ${t.features[f] ? 'border-[var(--mm-ink)] text-[var(--mm-ink)]' : 'border-[var(--mm-rule)] text-[var(--mm-muted)] line-through'}`}>{FEATURE_LABELS[f].label}</span>
                  ))}
                </div>
              </button>
            )
          })}
          <p className={hint}>만든 뒤에도 기능을 하나씩 켜고 끌 수 있어요.</p>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <div className={box}>
            <p className={label}>경기 팀</p>
            {teams.map((t, i) => (
              <div key={i} className="flex gap-2">
                <input aria-label={`${i + 1}번 팀 이름`} className={input} value={t} onChange={e => setTeams(ts => ts.map((x, j) => j === i ? e.target.value : x))} placeholder={`${i + 1}번 팀 이름`} maxLength={20} />
                {teams.length > 2 && <button aria-label="팀 빼기" onClick={() => setTeams(ts => ts.filter((_, j) => j !== i))} className="mm-press shrink-0 size-11 rounded-lg border border-[var(--mm-rule)] inline-flex items-center justify-center"><X size={16} /></button>}
              </div>
            ))}
            {teams.length < 6 && <button onClick={() => setTeams(ts => [...ts, ''])} className="mm-press min-h-11 px-3 rounded-lg border border-dashed border-[var(--mm-rule)] text-sm inline-flex items-center gap-1"><Plus size={14} />팀 더하기</button>}
            <p className={hint}>팀 이름은 나중에 분기마다 바꿀 수 있어요.</p>
          </div>
          <div className={box}>
            <label className={label} htmlFor="cw-roster">명단</label>
            <p className={hint}>한 줄에 한 사람씩 넣어요.</p>
            <p className={hint}>순서는 이름 · 포지션 · 생년월일이에요.</p>
            <p className={hint}>엑셀 열을 그대로 붙여 넣어도 돼요.</p>
            <textarea id="cw-roster" className={`${input} min-h-48 py-2`} value={rosterText} onChange={e => setRosterText(e.target.value)} placeholder={'김철수\tG\t900101\n이영희\tF\n박민수'} />
            <p className="text-sm text-[var(--mm-ink)]">읽은 사람 <b className="tabular-nums">{roster.rows.length}</b>명</p>
            {roster.problems.map(p => <p key={p} className="text-xs text-[var(--mm-negative)] break-keep">{p}</p>)}
            {roster.rows.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {roster.rows.slice(0, 60).map(r => <span key={r.name} className="text-xs px-2 py-0.5 rounded-full border border-[var(--mm-rule)] text-[var(--mm-ink)]">{r.name}{r.position ? ` · ${r.position}` : ''}</span>)}
              </div>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className={box}>
          <p className={label}>어드민</p>
          <p className={hint}>동호회 운영진이에요. 명단에 있는 이름이어야 해요.</p>
          <p className={hint}>처음 비밀번호는 생년월일 6자리예요.</p>
          {admins.map((a, i) => {
            const inRoster = !a.name.trim() || roster.rows.some(r => norm(r.name) === norm(a.name))
            return (
              <div key={i} className="space-y-1">
                <div className="flex gap-2">
                  <input aria-label="어드민 이름" list="cw-names" className={input} value={a.name} onChange={e => setAdmins(as => as.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} placeholder="이름" />
                  <input aria-label="생년월일 6자리" inputMode="numeric" className={`${input} !w-32 shrink-0`} value={a.birth6} onChange={e => setAdmins(as => as.map((x, j) => j === i ? { ...x, birth6: e.target.value.replace(/\D/g, '').slice(0, 6) } : x))} placeholder="900101" />
                  {admins.length > 1 && <button aria-label="어드민 빼기" onClick={() => setAdmins(as => as.filter((_, j) => j !== i))} className="mm-press shrink-0 size-11 rounded-lg border border-[var(--mm-rule)] inline-flex items-center justify-center"><X size={16} /></button>}
                </div>
                {!inRoster && <p className="text-xs text-[var(--mm-negative)] break-keep">명단에 없는 이름이에요.</p>}
              </div>
            )
          })}
          <datalist id="cw-names">{roster.rows.map(r => <option key={r.name} value={r.name} />)}</datalist>
          {admins.length < 4 && <button onClick={() => setAdmins(as => [...as, { name: '', birth6: '' }])} className="mm-press min-h-11 px-3 rounded-lg border border-dashed border-[var(--mm-rule)] text-sm inline-flex items-center gap-1"><Plus size={14} />어드민 더하기</button>}
          <p className={hint}>두 명을 권해요.</p>
          <p className={hint}>한 명이 빠져도 운영이 이어져요.</p>
        </div>
      )}

      <div className="flex gap-2">
        {step > 0 && <button onClick={() => setStep(s => s - 1)} className="mm-press flex-1 min-h-11 rounded-lg border border-[var(--mm-rule)] text-sm text-[var(--mm-ink)]">이전</button>}
        {step < 3
          ? <button disabled={!canNext} onClick={() => setStep(s => s + 1)} className="mm-press flex-1 min-h-11 rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] text-sm font-semibold disabled:opacity-40">다음</button>
          : <button disabled={!canNext || busy} onClick={create} className="mm-press flex-1 min-h-11 rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] text-sm font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-1">{busy && <Loader2 size={14} className="animate-spin" />}동호회 만들기</button>}
      </div>
    </section>
  )
}
