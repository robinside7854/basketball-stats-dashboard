'use client'
// CEO 콘솔 동호회 상세 (2026-11-10 온볼 플랫폼화 1·2단계, docs/onball-platform-design.md 4장)
//   탭: 기본 정보 · 운영 설정 · 기능 · 시즌 · 사람. 운영 설정·기능은 DB 칸(135)이 있으면 저장, 없으면 지금 값만 보인다.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ArrowLeft, ExternalLink, Loader2, Save } from 'lucide-react'
import { FEATURE_KEYS, FEATURE_LABELS, type ClubFeatures } from '@/lib/club/features'

const WEEKDAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
type Settings = { game_weekday: number; capacity: number | null; team_count: number; rotation: 'winner_stays' | 'none'; record_fouls: boolean; roster_mode: string[]; bank_reserved_words: string[] }
type Season = { id: string; name: string; slug: string | null; org_slug: string; mode: string | null; season_year: number | null; status: string | null; games_per_round: number | null; youtube_channel: string | null }
type Detail = {
  club: { id: string; name: string; org_slug: string; sub_slug: string | null; logo_url: string | null; accent_color: string | null; is_public: boolean | null; wallet_name: string | null; wallet_bank: string | null; wallet_rules: Record<string, number> | null; settings: Settings; features: ClubFeatures; system: 'league' | 'legacy'; configurable: boolean }
  seasons: Season[]
  people: { members: number; accounts: number; pending: number; admins: Array<{ id: string; name: string }> }
  legacy_tournaments: Array<{ id: string; name: string; year: number }>
}
const TABS = [['info', '기본 정보'], ['settings', '운영 설정'], ['features', '기능'], ['seasons', '시즌'], ['people', '사람']] as const
type Tab = typeof TABS[number][0]

const box = 'rounded-xl border border-[var(--mm-rule)] bg-[var(--mm-panel)] p-4 space-y-3'
const input = 'w-full min-h-11 px-3 rounded-lg border border-[var(--mm-rule)] bg-[var(--mm-panel-alt)] text-[var(--mm-ink)]'
const label = 'text-xs font-semibold text-[var(--mm-muted)]'

export default function ClubDetail({ teamId }: { teamId: string }) {
  const [d, setD] = useState<Detail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('info')
  const [saving, setSaving] = useState(false)
  const [info, setInfo] = useState({ name: '', is_public: true, logo_url: '' })
  const [st, setSt] = useState<Settings | null>(null)
  const [ft, setFt] = useState<ClubFeatures | null>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/clubs/${teamId}`, { cache: 'no-store' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error ?? '불러오지 못했어요'); return }
    setD(j); setInfo({ name: j.club.name, is_public: !!j.club.is_public, logo_url: j.club.logo_url ?? '' })
    setSt(j.club.settings); setFt(j.club.features)
  }, [teamId])
  useEffect(() => { void load() }, [load])

  async function save(body: Record<string, unknown>) {
    setSaving(true)
    try {
      const r = await fetch(`/api/admin/clubs/${teamId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { toast.error(j.error ?? '저장하지 못했어요'); return }
      toast.success('저장했어요'); await load()
    } finally { setSaving(false) }
  }

  if (err) return <p role="alert" className="text-sm text-[var(--mm-negative)]">{err}</p>
  if (!d || !st || !ft) return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-[var(--mm-muted)]" /></div>
  const c = d.club
  const isLeague = c.system === 'league'
  const mainSeason = d.seasons.find(s => s.mode !== 'tournament') ?? d.seasons[0]
  const readOnly = !c.configurable

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/admin" aria-label="동호회 목록으로" className="p-2 -ml-2 rounded-lg min-h-11 min-w-11 flex items-center justify-center text-[var(--mm-muted)]"><ArrowLeft size={20} /></Link>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-[var(--mm-ink)] break-keep">{c.name}</h1>
          <p className="text-sm text-[var(--mm-muted)]">{isLeague ? '리그 시스템' : '옛 팀 시스템(편집 PIN)'} · {c.is_public ? '공개' : '비공개'}</p>
        </div>
        {isLeague && mainSeason && (
          <a href={`/league/${mainSeason.org_slug}/${mainSeason.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm min-h-11 px-3 rounded-lg border border-[var(--mm-rule)] text-[var(--mm-ink)]">
            화면 열기 <ExternalLink size={14} aria-hidden />
          </a>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist">
        {TABS.filter(([k]) => isLeague || k === 'info' || k === 'seasons').map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`min-h-11 px-4 rounded-full text-sm font-semibold border ${tab === k ? 'bg-[var(--mm-ink)] text-[var(--mm-panel)] border-[var(--mm-ink)]' : 'border-[var(--mm-rule)] text-[var(--mm-ink-soft)]'}`}>{l}</button>
        ))}
      </div>

      {!isLeague && (
        <p className="text-sm text-[var(--mm-muted)] break-keep">옛 팀 시스템 동호회예요. 운영 설정·기능·어드민은 리그 시스템으로 옮긴 뒤에 쓸 수 있어요(설계 6단계). 지금은 <Link href={`/admin/teams/${c.id}`} className="underline">옛 팀 관리 화면</Link>에서 관리해요.</p>
      )}

      {tab === 'info' && (
        <div className={box}>
          <label className="block space-y-1"><span className={label}>동호회 이름</span>
            <input className={input} value={info.name} onChange={e => setInfo({ ...info, name: e.target.value })} maxLength={40} /></label>
          <label className="block space-y-1"><span className={label}>로고 주소 (비우면 기본 로고)</span>
            <input className={input} value={info.logo_url} onChange={e => setInfo({ ...info, logo_url: e.target.value })} placeholder="/leagues/miracle-logo.png" /></label>
          <label className="flex items-center gap-2 min-h-11"><input type="checkbox" checked={info.is_public} onChange={e => setInfo({ ...info, is_public: e.target.checked })} className="w-5 h-5" />
            <span className="text-sm text-[var(--mm-ink)] break-keep">공개 (끄면 가입한 회원만 안쪽 기록을 봐요)</span></label>
          <p className="text-xs text-[var(--mm-muted)]">주소: {c.org_slug}{c.sub_slug && c.sub_slug !== 'main' ? ` / ${c.sub_slug}` : ''}</p>
          <button disabled={saving} onClick={() => save({ name: info.name, is_public: info.is_public, logo_url: info.logo_url })}
            className="inline-flex items-center gap-1 min-h-11 px-4 rounded-lg bg-[var(--mm-yellow)] text-[var(--mm-black)] font-bold disabled:opacity-50"><Save size={16} aria-hidden /> 저장</button>
        </div>
      )}

      {tab === 'settings' && isLeague && (
        <div className={box}>
          {readOnly && <p className="text-sm text-[var(--mm-negative)] break-keep">DB 준비 전이라 지금 값만 보여요. 저장은 준비 뒤에 돼요.</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1"><span className={label}>경기 요일</span>
              <select className={input} disabled={readOnly} value={st.game_weekday} onChange={e => setSt({ ...st, game_weekday: Number(e.target.value) })}>
                {WEEKDAYS.map((w, i) => <option key={w} value={i}>{w}</option>)}</select></label>
            <label className="block space-y-1"><span className={label}>참가 정원 (비우면 안내 안 함)</span>
              <input className={input} disabled={readOnly} inputMode="numeric" value={st.capacity ?? ''} onChange={e => setSt({ ...st, capacity: e.target.value ? Number(e.target.value) : null })} /></label>
            <label className="block space-y-1"><span className={label}>하루 팀 수</span>
              <input className={input} disabled={readOnly} inputMode="numeric" value={st.team_count} onChange={e => setSt({ ...st, team_count: Number(e.target.value) || 0 })} /></label>
            <label className="block space-y-1"><span className={label}>대진 자동 배정</span>
              <select className={input} disabled={readOnly} value={st.rotation} onChange={e => setSt({ ...st, rotation: e.target.value as Settings['rotation'] })}>
                <option value="winner_stays">승자 잔류 · 2연속 휴식</option><option value="none">손으로 정함</option></select></label>
          </div>
          <label className="flex items-center gap-2 min-h-11"><input type="checkbox" disabled={readOnly} checked={st.record_fouls} onChange={e => setSt({ ...st, record_fouls: e.target.checked })} className="w-5 h-5" />
            <span className="text-sm text-[var(--mm-ink)]">파울 기록</span></label>
          <label className="block space-y-1"><span className={label}>입금자명에 못 쓰는 낱말 (쉼표로)</span>
            <input className={input} disabled={readOnly} value={st.bank_reserved_words.join(', ')} onChange={e => setSt({ ...st, bank_reserved_words: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} /></label>
          <div className="text-xs text-[var(--mm-muted)] space-y-1 break-keep">
            <p>시즌별 값(시즌 화면에서 바꿈): {d.seasons.map(s => `${s.name} 하루 ${s.games_per_round ?? '-'}경기`).join(' · ') || '없음'}</p>
            {c.wallet_rules && <p>월렛 가격: 정규권 {c.wallet_rules.regular_pass_price?.toLocaleString()}P · 비정규 {c.wallet_rules.non_regular_price?.toLocaleString()}P · 게스트 {c.wallet_rules.guest_price?.toLocaleString() ?? '-'}P · {c.wallet_rules.bonus_min?.toLocaleString()}원 이상 {c.wallet_rules.bonus_pct}% 보너스</p>}
          </div>
          {!readOnly && <button disabled={saving} onClick={() => save({ settings: st })} className="inline-flex items-center gap-1 min-h-11 px-4 rounded-lg bg-[var(--mm-yellow)] text-[var(--mm-black)] font-bold disabled:opacity-50"><Save size={16} aria-hidden /> 저장</button>}
        </div>
      )}

      {tab === 'features' && isLeague && (
        <div className={box}>
          {readOnly && <p className="text-sm text-[var(--mm-negative)] break-keep">DB 준비 전이라 지금 상태만 보여요. 저장은 준비 뒤에 돼요.</p>}
          <p className="text-xs text-[var(--mm-muted)] break-keep">끄면 그 기능 메뉴가 화면에서 사라져요. 화면 적용은 다음 단계예요.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {FEATURE_KEYS.map(k => (
              <label key={k} className="flex items-start gap-2 p-3 rounded-lg border border-[var(--mm-rule)] min-h-11">
                <input type="checkbox" disabled={readOnly} checked={ft[k]} onChange={e => setFt({ ...ft, [k]: e.target.checked })} className="w-5 h-5 mt-0.5" />
                <span><span className="block text-sm font-semibold text-[var(--mm-ink)]">{FEATURE_LABELS[k].label}</span><span className="block text-xs text-[var(--mm-muted)]">{FEATURE_LABELS[k].desc}</span></span>
              </label>
            ))}
          </div>
          {!readOnly && <button disabled={saving} onClick={() => save({ features: ft })} className="inline-flex items-center gap-1 min-h-11 px-4 rounded-lg bg-[var(--mm-yellow)] text-[var(--mm-black)] font-bold disabled:opacity-50"><Save size={16} aria-hidden /> 저장</button>}
        </div>
      )}

      {tab === 'seasons' && (
        <div className={box}>
          {isLeague ? (
            <>
              {d.seasons.map(s => (
                <div key={s.id} className="flex items-center gap-2 py-2 border-b border-[var(--mm-rule)] last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-[var(--mm-ink)] break-keep">{s.name}</p>
                    <p className="text-xs text-[var(--mm-muted)]">{s.mode === 'tournament' ? '대회' : '리그'} · {s.season_year} · {s.status ?? ''}</p>
                  </div>
                  <Link href={`/admin/leagues/${s.id}`} className="text-sm min-h-11 px-3 inline-flex items-center rounded-lg border border-[var(--mm-rule)]">관리</Link>
                </div>
              ))}
              <Link href={`/admin/leagues/new?team_id=${c.id}`} className="inline-flex min-h-11 items-center px-3 rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] text-sm font-semibold">+ 새 시즌</Link>
            </>
          ) : (
            d.legacy_tournaments.map(t => <p key={t.id} className="text-sm text-[var(--mm-ink)]">{t.year} · {t.name}</p>)
          )}
        </div>
      )}

      {tab === 'people' && isLeague && (
        <div className={box}>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[['명단', d.people.members], ['가입 계정', d.people.accounts], ['가입 대기', d.people.pending]].map(([l, v]) => (
              <div key={l as string} className="rounded-lg bg-[var(--mm-panel-alt)] p-3"><p className="text-xs text-[var(--mm-muted)]">{l}</p><p className="text-xl font-black text-[var(--mm-ink)]">{v}</p></div>
            ))}
          </div>
          <p className={label}>어드민 {d.people.admins.length}명</p>
          <p className="text-sm text-[var(--mm-ink)] break-keep">{d.people.admins.map(a => a.name).join(', ') || '없음 — 어드민을 최소 1명(권장 2명) 지정해 주세요'}</p>
          {mainSeason && <Link href={`/admin/leagues/${mainSeason.id}`} className="inline-flex min-h-11 items-center px-3 rounded-lg border border-[var(--mm-rule)] text-sm">어드민 지정하러 가기</Link>}
        </div>
      )}
    </div>
  )
}
