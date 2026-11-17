'use client'
// 미라클 후프스 게임 설정(어드민 전용, 2026-11-16) — 키 · 체형 · 스피드 · 운동능력 · 외모를 선수마다 정한다.
//   값은 league_players.height_cm · appearance 에 저장(lib/game/profile.ts 표). 게임은 game/roster API 로 받아 간다.
//   스피드·운동능력은 「정한 값이 우선」, 「기록대로」면 기록으로 계산한 값.
import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { ChevronLeft, Loader2, Lock, Search } from 'lucide-react'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import { BasketballLoader } from '@/components/league/BasketballIcons'
import { PROFILE_OPTIONS, type GameProfile, type ProfileKey } from '@/lib/game/profile'
import type { LeaguePlayer } from '@/types/league'

type Row = LeaguePlayer & { appearance?: GameProfile | null }
type Draft = { height: string; profile: GameProfile }

const GROUPS: { title: string; keys: ProfileKey[] }[] = [
  { title: '스킬', keys: ['skill'] },
  { title: '몸 · 능력', keys: ['build', 'speed', 'athletic'] },
  { title: '외모', keys: ['hair', 'hairColor', 'skin', 'eyewear', 'facial'] },
]
const LABEL: Record<ProfileKey, string> = {
  build: '체형', speed: '스피드', athletic: '운동능력', hair: '머리 모양', hairColor: '머리 색', skin: '피부', eyewear: '안경', facial: '수염', skill: '고유 스킬',
}
const FIELD = 'w-full min-h-11 rounded-none px-2.5 text-base bg-[color:var(--mm-panel)] border border-[color:var(--mm-rule)] text-[color:var(--mm-ink)] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[color:var(--mm-ink)]'

const draftOf = (p: Row): Draft => ({ height: p.height_cm ? String(p.height_cm) : '', profile: { ...(p.appearance ?? {}) } })
const same = (a: Draft, b: Draft) => a.height === b.height && JSON.stringify(a.profile) === JSON.stringify(b.profile)

export default function HoopsSettingsPage() {
  const { orgSlug, leagueId } = useParams<{ orgSlug: string; leagueId: string }>()
  const router = useRouter()
  const { isEditMode, isInitialized, leagueHeaders, openLogin } = useLeagueEditMode()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [q, setQ] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isInitialized && !isEditMode) router.replace(`/league/${orgSlug}/${leagueId}`)
  }, [isInitialized, isEditMode, orgSlug, leagueId, router])

  useEffect(() => {
    if (!isEditMode) return
    fetch(`/api/leagues/${leagueId}/players`, { headers: leagueHeaders ?? {} })
      .then(r => (r.ok ? r.json() : []))
      .then((list: Row[]) => setRows(list.filter(p => !p.is_guest).sort((a, b) => a.name.localeCompare(b.name, 'ko'))))
      .catch(() => setRows([]))
  }, [leagueId, isEditMode, leagueHeaders])

  const changed = useMemo(() => (rows ?? []).filter(p => drafts[p.id] && !same(drafts[p.id], draftOf(p))), [rows, drafts])
  const shown = (rows ?? []).filter(p => !q.trim() || p.name.includes(q.trim()))

  const cur = (p: Row) => drafts[p.id] ?? draftOf(p)
  const set = (p: Row, next: Partial<Draft>) => setDrafts(d => ({ ...d, [p.id]: { ...cur(p), ...next } }))

  async function save() {
    const bad = changed.find(p => { const h = drafts[p.id].height; return h && !(Number(h) >= 120 && Number(h) <= 230) })
    if (bad) { toast.error(`${bad.name}: 키는 120~230 사이로 넣어 주세요`); return }
    setSaving(true)
    const res = await fetch(`/api/leagues/${leagueId}/players/bulk`, {
      method: 'PUT', headers: { ...(leagueHeaders ?? {}), 'Content-Type': 'application/json' },
      body: JSON.stringify({ profiles: changed.map(p => ({ id: p.id, height_cm: drafts[p.id].height || null, appearance: drafts[p.id].profile })) }),
    }).catch(() => null)
    setSaving(false)
    if (!res?.ok) { toast.error((await res?.json().catch(() => null))?.error ?? '저장 실패'); return }
    const saved = Object.fromEntries(changed.map(p => [p.id, drafts[p.id]]))
    setRows(rs => rs?.map(p => saved[p.id] ? { ...p, height_cm: saved[p.id].height ? Math.round(Number(saved[p.id].height)) : null, appearance: saved[p.id].profile } : p) ?? null)
    setDrafts({})
    toast.success(`${changed.length}명 저장했어요`)
  }

  if (!isInitialized) return <div className="flex justify-center py-12"><BasketballLoader size={24} /></div>
  if (!isEditMode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
        <Lock size={24} className="text-[color:var(--mm-muted)]" aria-hidden />
        <div className="font-bold text-xl text-[color:var(--mm-ink)]">어드민만 설정할 수 있습니다</div>
        <button onClick={openLogin} className="mm-press px-6 min-h-11 bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)] text-sm font-bold cursor-pointer">어드민 로그인</button>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-lg lg:max-w-2xl lg:mx-auto pb-24">
      <Link href={`/league/${orgSlug}/${leagueId}/settings`} className="inline-flex items-center gap-1 min-h-11 text-sm font-bold text-[color:var(--mm-ink-soft)] hover:text-[color:var(--mm-ink)]">
        <ChevronLeft size={16} aria-hidden />리그 설정
      </Link>
      <div className="space-y-1">
        <h2 className="font-black text-3xl tracking-tight text-[color:var(--mm-ink)]">후프스 게임 설정</h2>
        <p className="text-sm text-[color:var(--mm-ink-soft)]">선수마다 키·스킬·체형·스피드·운동능력·외모를 정해요.</p>
        <p className="text-sm text-[color:var(--mm-ink-soft)]">「기록대로」는 경기 기록으로 계산한 값을 써요.</p>
      </div>

      <label className="relative block">
        <span className="sr-only">선수 이름 찾기</span>
        <Search size={16} aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--mm-muted)]" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="이름 찾기" className={`${FIELD} pl-9`} />
      </label>

      {!rows ? <div className="flex justify-center py-12"><BasketballLoader size={24} /></div> : (
        <ul className="space-y-2">
          {shown.map(p => {
            const d = cur(p), dirty = !same(d, draftOf(p))
            const summary = [d.height && `${d.height}cm`, d.profile.build && PROFILE_OPTIONS.build[d.profile.build], d.profile.hair && PROFILE_OPTIONS.hair[d.profile.hair], d.profile.skill && PROFILE_OPTIONS.skill[d.profile.skill]].filter(Boolean).join(' · ')
            return (
              <li key={p.id}>
                <details className="border border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)]">
                  <summary className="flex items-center justify-between gap-2 min-h-12 px-4 cursor-pointer">
                    <span className="font-black text-[color:var(--mm-ink)]">{p.name}{dirty && <span className="ml-2 text-xs font-bold text-[color:var(--mm-yellow-strong)]">바뀜</span>}</span>
                    <span className="text-sm text-[color:var(--mm-ink-soft)] truncate">{summary || '미설정'}</span>
                  </summary>
                  <div className="px-4 pb-4 space-y-3">
                    <label className="block space-y-1">
                      <span className="text-sm font-bold text-[color:var(--mm-ink-soft)]">키 (cm)</span>
                      <input type="number" inputMode="numeric" min={120} max={230} value={d.height} placeholder="예: 178"
                        onChange={e => set(p, { height: e.target.value })} className={FIELD} />
                    </label>
                    {GROUPS.map(g => (
                      <fieldset key={g.title} className="space-y-2">
                        <legend className="text-sm font-black text-[color:var(--mm-ink)]">{g.title}</legend>
                        <div className="grid grid-cols-2 gap-2">
                          {g.keys.map(k => (
                            <label key={k} className="block space-y-1">
                              <span className="text-sm font-bold text-[color:var(--mm-ink-soft)]">{LABEL[k]}</span>
                              <select value={(d.profile[k] as string | undefined) ?? ''} className={FIELD}
                                onChange={e => set(p, { profile: { ...d.profile, [k]: e.target.value || undefined } })}>
                                <option value="">정하지 않음</option>
                                {Object.entries(PROFILE_OPTIONS[k]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                              </select>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                  </div>
                </details>
              </li>
            )
          })}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[color:var(--mm-rule)] bg-[color:var(--mm-panel)] p-3">
        <div className="max-w-lg lg:max-w-2xl mx-auto">
          <button type="button" onClick={save} disabled={saving || changed.length === 0}
            className="mm-press w-full min-h-12 inline-flex items-center justify-center gap-2 font-black bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50">
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {changed.length ? `${changed.length}명 저장` : '바뀐 내용이 없어요'}
          </button>
        </div>
      </div>
    </div>
  )
}
