'use client'
// 참가 명단 단톡방 공유 (2026-11-11 운영진) — 「이미지 복사」(클립보드) · 「글 복사」
//   · 팀 순서 = 그 분기 현재 순위(1·2·3위 순). 순위가 없는 팀(분기 첫 주)은 이름순으로 뒤에.
//   · 팀 이름 아래 = 「N승 N패 N무 · 현재 N위」(정본 lib/stats/quarterStandings — 박스스코어 누적 순위와 같은 숫자).
//   · 사람 = 그 팀에 배치된 「참」만(팀장 먼저 · 정규 → 비정규 → 게스트 · 이름순). 대기명단은 「팀 정하는 중 N명」 한 줄.
//   · 그림은 테마와 무관하게 밝은 고정 색으로 그린다(어두운 화면에서 저장해도 단톡방에서 같은 모양).
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Copy, Image as ImageIcon, Loader2 } from 'lucide-react'
import { positionShortOf } from '@/lib/league/positionGroup'
import { UNIFORM_FILL, dateLabel, type RsvpEntryView, type RsvpRes } from './rsvpTypes'

type Team = NonNullable<RsvpRes['teams']>[number]

const KIND_ORDER = { regular: 0, non_regular: 1, guest: 2 } as const

function buildTeams(teams: Team[], entries: RsvpEntryView[], standings: RsvpRes['standings']) {
  const st = new Map((standings?.teams ?? []).map(s => [s.team_id, s]))
  return teams
    .map(t => {
      const members = entries
        .filter(e => e.answer === 'yes' && e.placed_team_id === t.id)
        .sort((a, b) => {
          const la = a.player_id === t.leader_id ? 0 : 1, lb = b.player_id === t.leader_id ? 0 : 1
          if (la !== lb) return la - lb
          if (KIND_ORDER[a.kind] !== KIND_ORDER[b.kind]) return KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
          return a.name.localeCompare(b.name, 'ko')
        })
      return { ...t, members, standing: st.get(t.id) ?? null }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))   // 순위 순서도 쓰지 않는다(2026-11-26)
}

export default function RsvpShareCard({ gameDate, teams, entries, standings }: {
  gameDate: string; teams: Team[]; entries: RsvpEntryView[]; standings: RsvpRes['standings']
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const rows = buildTeams(teams, entries, standings)
  const waiting = entries.filter(e => e.answer === 'yes' && !e.placed_team_id).length
  const total = rows.reduce((n, t) => n + t.members.length, 0)
  const title = `${dateLabel(gameDate)} 참가 명단`

  async function copyText() {
    const lines = [`[${title}] 총 ${total}명`]
    for (const t of rows) {
      lines.push('', `TEAM ${t.name} (${t.members.length}명)`)
      for (const m of t.members) {
        const pos = positionShortOf(m.position)
        const tag = m.player_id === t.leader_id ? ' (팀장)' : m.kind === 'guest' ? ' (게스트)' : m.kind === 'non_regular' ? ' (비정규)' : ''
        lines.push(`· ${m.name}${pos ? ` ${pos}` : ''}${tag}`)
      }
    }
    if (waiting > 0) lines.push('', `팀 정하는 중 ${waiting}명`)
    try { await navigator.clipboard.writeText(lines.join('\n')); toast.success('명단 글을 복사했어요. 단톡방에 붙여 넣으세요.') }
    catch { toast.error('복사하지 못했어요') }
  }

  // 그림을 클립보드에 바로 복사(2026-11-26 운영진 — 앨범에 저장하지 않고 카톡에 붙여 넣기).
  //   iOS 사파리는 클릭 순간 ClipboardItem 을 만들어야 해서 그림은 약속(Promise)으로 넘긴다.
  //   클립보드가 안 되는 브라우저만 공유 창 → 내려받기로 물러난다.
  function makeBlob(): Promise<Blob> {
    return import('html-to-image').then(({ toBlob }) => toBlob(ref.current!, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true }))
      .then(b => { if (!b) throw new Error('빈 그림'); return b })
  }
  async function copyImage() {
    if (!ref.current) return
    setBusy(true)
    const blobP = makeBlob()
    try {
      const CI = (window as unknown as { ClipboardItem?: typeof ClipboardItem }).ClipboardItem
      if (CI && navigator.clipboard?.write) {
        try {
          await navigator.clipboard.write([new CI({ 'image/png': blobP })])
          toast.success('명단 그림 복사 완료. 카톡에 붙여 넣기.')
          return
        } catch (e) { console.warn('[rsvp-share] 클립보드 복사 실패 — 다른 방법으로', e) }
      }
      const blob = await blobP
      const name = `참가명단-${gameDate}.png`
      const file = new File([blob], name, { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
      if (nav.canShare?.({ files: [file] }) && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
        try { await nav.share({ files: [file], title }); return }
        catch (e) { if ((e as Error).name === 'AbortError') return }
      }
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = name
      document.body.appendChild(a); a.click(); a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 2000)
      toast.success('복사가 안 되는 브라우저라 그림을 내려받았어요')
    } catch (e) {
      console.error('[rsvp-share] 그림 만들기 실패', e)
      toast.error('그림 만들기 실패. 「글 복사」 사용.')
    } finally { setBusy(false) }
  }

  const btn = 'mm-press inline-flex items-center justify-center gap-1.5 min-h-11 px-3 text-sm font-bold border'
  const btnStyle = { borderColor: 'var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: 'var(--mm-radius-ctl)' }

  return (
    <div className="break-keep">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-black mr-1" style={{ color: 'var(--mm-ink)' }}>단톡방 공유</span>
        <button type="button" onClick={copyImage} disabled={busy || total === 0} className={`${btn} disabled:opacity-50`} style={btnStyle}>
          {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <ImageIcon size={15} aria-hidden />}이미지 복사
        </button>
        <button type="button" onClick={copyText} disabled={total === 0} className={`${btn} disabled:opacity-50`} style={btnStyle}>
          <Copy size={15} aria-hidden />글 복사
        </button>
      </div>

      {/* 그림 원본 — 화면 밖에 그려 두고 저장할 때만 찍는다(고정 폭 720 · 밝은 고정 색) */}
      <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }}>
        <div ref={ref} style={{ width: 720, padding: 28, background: '#ffffff', color: '#111827', fontFamily: 'inherit', wordBreak: 'keep-all' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.02em' }}>{title}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#4b5563' }}>총 {total}명</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, Math.min(3, rows.length))}, 1fr)`, gap: 14, marginTop: 18 }}>
            {rows.map(t => (
              <div key={t.id} style={{ border: '1.5px solid #e5e7eb', borderRadius: 14, padding: 14, display: 'flex', flexDirection: 'column' }}>
                {/* 머리 = 색 점 · 팀 이름 · 순위 메달(2026-11-11 운영진 — 승무패 글줄이 읽기 어려웠다) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 18, height: 18, borderRadius: 999, background: UNIFORM_FILL[t.uniform ?? 'yellow'], boxShadow: 'inset 0 0 0 1.5px #d1d5db', flex: 'none' }} />
                  <span style={{ minWidth: 0, lineHeight: 1.1 }}>
                    <span style={{ display: 'block', fontSize: 10, fontWeight: 900, letterSpacing: '0.12em', color: '#9ca3af' }}>TEAM</span>
                    <span style={{ display: 'block', fontSize: 19, fontWeight: 900, whiteSpace: 'nowrap' }}>{t.name}</span>
                  </span>
                </div>
                {/* 전적·순위는 뺐다(2026-11-26 운영진 — 경쟁을 부추긴다) · 명단만 */}
                <div style={{ height: 1, background: '#e5e7eb', margin: '10px 0' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {t.members.map(m => {
                    const pos = positionShortOf(m.position)
                    return (
                      <div key={m.player_id} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 16 }}>
                        <span style={{ fontWeight: 800 }}>{m.name}</span>
                        {m.player_id === t.leader_id && <span style={{ fontSize: 12, fontWeight: 900, color: '#b45309' }}>팀장</span>}
                        {m.kind === 'guest' && <span style={{ fontSize: 12, fontWeight: 800, color: '#6b7280' }}>게스트</span>}
                        {m.kind === 'non_regular' && <span style={{ fontSize: 12, fontWeight: 800, color: '#6b7280' }}>비정규</span>}
                        {pos && <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: '#6b7280' }}>{pos}</span>}
                      </div>
                    )
                  })}
                  {t.members.length === 0 && <div style={{ fontSize: 14, color: '#9ca3af' }}>아직 없어요</div>}
                </div>
                <div style={{ flex: 1, minHeight: 12 }} />
                {t.members.length > 0 && (
                  <div style={{ marginTop: 0, paddingTop: 8, borderTop: '1px dashed #e5e7eb', textAlign: 'right', fontSize: 12, fontWeight: 800, color: '#6b7280' }}>{t.members.length}명</div>
                )}
              </div>
            ))}
          </div>
          {waiting > 0 && <div style={{ marginTop: 14, fontSize: 14, fontWeight: 700, color: '#4b5563' }}>팀 정하는 중 {waiting}명</div>}
        </div>
      </div>
    </div>
  )
}
