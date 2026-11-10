'use client'
// CEO 콘솔 동호회 목록 (2026-11-10 온볼 플랫폼화 1단계)
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plus, Users, ShieldCheck, Clock } from 'lucide-react'
import { swatchEdge } from '@/lib/util/contrastColor'
import { FEATURE_KEYS, FEATURE_LABELS, type ClubFeatures } from '@/lib/club/features'

type ClubItem = {
  id: string; name: string; org_slug: string; sub_slug: string | null; logo_url: string | null; accent_color: string | null
  is_public: boolean | null; is_active: boolean | null; system: 'league' | 'legacy'; features: ClubFeatures
  members: number; accounts: number; admins: number; pending: number
  seasons: Array<{ id: string; name: string; mode: string | null; season_year: number | null; status: string | null }>
  legacy_tournaments: number
}

export default function ClubList() {
  const [clubs, setClubs] = useState<ClubItem[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/admin/clubs', { cache: 'no-store' })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error ?? '불러오지 못했어요'); setClubs(j.clubs) })
      .catch(e => setErr(e instanceof Error ? e.message : '불러오지 못했어요'))
  }, [])

  if (err) return <p role="alert" className="text-sm text-[var(--mm-negative)] break-keep">동호회를 불러오지 못했어요. 목록이 빈 것이 아니라 조회가 실패한 거예요. ({err})</p>
  if (!clubs) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[var(--mm-muted)]" /></div>

  const total = { clubs: clubs.length, members: clubs.reduce((s, c) => s + c.members, 0), accounts: clubs.reduce((s, c) => s + c.accounts, 0) }
  return (
    <section className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[['동호회', total.clubs], ['회원(명단)', total.members], ['가입 계정', total.accounts]].map(([l, v]) => (
          <div key={l as string} className="rounded-xl border border-[var(--mm-rule)] bg-[var(--mm-panel)] p-4">
            <p className="text-xs text-[var(--mm-muted)]">{l}</p>
            <p className="text-2xl font-black text-[var(--mm-ink)] tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <div className="flex justify-end">
        <Link href="/admin/clubs/new" className="inline-flex items-center gap-1 text-sm px-3 min-h-11 rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] font-semibold">
          <Plus size={16} aria-hidden /> 새 동호회
        </Link>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {clubs.map(c => (
          <Link key={c.id} href={`/admin/clubs/${c.id}`} className="block p-4 rounded-xl border border-[var(--mm-rule)] bg-[var(--mm-panel)] hover:border-[var(--mm-muted)] transition-colors space-y-3">
            <div className="flex items-center gap-3">
              {c.logo_url
                ? <img src={c.logo_url} alt="" className="w-10 h-10 rounded-lg object-contain bg-[var(--mm-panel-alt)]" />
                : <span className="w-10 h-10 rounded-lg shrink-0" style={{ backgroundColor: c.accent_color ?? '#3b82f6', boxShadow: swatchEdge(c.accent_color ?? '#3b82f6') }} />}
              <div className="min-w-0 flex-1">
                <p className="font-bold text-[var(--mm-ink)] break-keep">{c.name}</p>
                <p className="text-xs text-[var(--mm-muted)]">{c.org_slug}{c.sub_slug && c.sub_slug !== 'main' ? ` / ${c.sub_slug}` : ''} · {c.is_public ? '공개' : '비공개'}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-semibold whitespace-nowrap ${c.system === 'league' ? 'bg-[var(--mm-positive)]/10 text-[var(--mm-positive)]' : 'bg-[var(--mm-panel-alt)] text-[var(--mm-muted)]'}`}>
                {c.system === 'league' ? '리그 시스템' : '옛 팀 시스템'}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--mm-ink-soft)]">
              <span className="inline-flex items-center gap-1"><Users size={14} aria-hidden /> 회원 {c.members}</span>
              {c.system === 'league' && <span className="inline-flex items-center gap-1"><ShieldCheck size={14} aria-hidden /> 어드민 {c.admins}</span>}
              {c.pending > 0 && <span className="inline-flex items-center gap-1 text-[var(--mm-negative)]"><Clock size={14} aria-hidden /> 가입 대기 {c.pending}</span>}
              <span>{c.system === 'league' ? `시즌 ${c.seasons.length}` : `대회 ${c.legacy_tournaments}`}</span>
            </div>
            {c.system === 'league' && (
              <div className="flex flex-wrap gap-1.5">
                {FEATURE_KEYS.filter(k => c.features[k]).map(k => (
                  <span key={k} className="text-xs px-2 py-0.5 rounded-md border border-[var(--mm-rule)] text-[var(--mm-ink-soft)]">{FEATURE_LABELS[k].label}</span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </section>
  )
}
