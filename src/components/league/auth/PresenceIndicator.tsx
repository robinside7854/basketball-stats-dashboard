'use client'
// 접속 현황 인디케이터 — 상단 헤더에 상시 노출(모든 페이지). 전체 공개.
//   버튼: 🟢 온라인 인원수. 클릭 → 접속자 목록 팝오버(고정 위치, 헤더 클리핑 회피).
//   60초 폴링(가시 탭일 때만). 계정(로그인) 회원이 없으면 렌더 안 함.
import { useState, useEffect, useCallback, useRef } from 'react'
import { Radio, User as UserIcon, X } from 'lucide-react'

interface Member {
  player_id: string
  name: string | null
  number: number | null
  photo_url: string | null
  online: boolean
  last_seen_at: string | null
}
interface PresenceData { online: number; total: number; members: Member[] }

function relTime(iso: string | null): string {
  if (!iso) return '기록 없음'
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return ''
  const diff = Date.now() - t
  const min = 60 * 1000, hr = 60 * min, day = 24 * hr
  if (diff < min) return '방금 전'
  if (diff < hr) return `${Math.floor(diff / min)}분 전`
  if (diff < day) return `${Math.floor(diff / hr)}시간 전`
  if (diff < 7 * day) return `${Math.floor(diff / day)}일 전`
  const d = new Date(iso)
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

export default function PresenceIndicator({ leagueId }: { leagueId: string }) {
  const [data, setData] = useState<PresenceData | null>(null)
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/leagues/${leagueId}/auth/presence`, { cache: 'no-store' })
      if (r.ok) setData(await r.json())
    } catch { /* 무시 */ }
  }, [leagueId])

  useEffect(() => {
    load()
    const beat = () => { if (document.visibilityState === 'visible') load() }
    const id = window.setInterval(beat, 60_000)
    document.addEventListener('visibilitychange', beat)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', beat) }
  }, [load])

  // 팝오버 열릴 때 최신화
  useEffect(() => { if (open) load() }, [open, load])

  // Esc 로 닫기
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open])

  // 로그인 회원 계정이 하나도 없으면 숨김
  if (!data || data.total === 0) return null

  const online = data.online

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-label={`접속 현황 · ${online}명 접속 중`}
        title={`${online}명 접속 중`}
        className="relative inline-flex items-center gap-1 px-2 rounded-md border transition-colors cursor-pointer min-h-[44px] min-w-[44px] justify-center btn-press"
        style={{
          background: online > 0 ? 'rgba(16,185,129,0.12)' : 'var(--mm-panel-alt)',
          borderColor: online > 0 ? 'rgba(16,185,129,0.5)' : 'var(--mm-rule)',
          color: online > 0 ? '#059669' : 'var(--mm-muted)',
        }}
      >
        <span className="relative inline-flex" aria-hidden>
          <Radio size={16} />
          {online > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 rounded-full"
              style={{ width: 7, height: 7, background: '#10B981', border: '1.5px solid var(--mm-ground)' }}
            />
          )}
        </span>
        <span className="text-xs font-black tabular-nums">{online}</span>
      </button>

      {open && (
        <>
          {/* 클릭 캐처 (배경) */}
          <div
            className="fixed inset-0 z-[59]"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* 팝오버 · 고정 위치(헤더 오버플로 클리핑 회피) */}
          <div
            role="dialog"
            aria-label="접속 현황"
            className="fixed z-[60] right-2 sm:right-3 top-[calc(56px+env(safe-area-inset-top,0px))] w-[min(320px,calc(100vw-16px))] max-h-[70vh] flex flex-col rounded-lg overflow-hidden shadow-[0_16px_48px_-12px_rgba(0,0,0,0.45)]"
            style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)' }}
          >
            <header
              className="flex items-center gap-2 px-3.5 py-2.5 shrink-0"
              style={{ borderBottom: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}
            >
              <Radio size={15} style={{ color: online > 0 ? '#10B981' : 'var(--mm-muted)' }} aria-hidden />
              <span className="font-jersey font-black uppercase text-sm tracking-[0.10em]" style={{ color: 'var(--mm-ink)' }}>
                접속 현황
              </span>
              <span
                className="ml-1 inline-flex items-center text-[10px] font-black uppercase tracking-[0.10em] px-1.5 py-0.5 rounded-sm"
                style={{ background: online > 0 ? '#10B981' : 'var(--mm-panel)', color: online > 0 ? '#fff' : 'var(--mm-muted)', border: online > 0 ? 'none' : '1px solid var(--mm-rule)' }}
              >
                {online}명 접속 중
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                className="ml-auto min-w-[32px] min-h-[32px] inline-flex items-center justify-center rounded cursor-pointer"
                style={{ color: 'var(--mm-muted)' }}
              >
                <X size={16} />
              </button>
            </header>

            <ul className="overflow-y-auto divide-y divide-[color:var(--mm-rule)]">
              {data.members.map(m => (
                <li key={m.player_id} className="flex items-center gap-2.5 px-3.5 py-2">
                  <div className="relative shrink-0">
                    <div
                      className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center"
                      style={{ background: 'var(--mm-panel-alt)', border: `2px solid ${m.online ? '#10B981' : 'var(--mm-rule)'}` }}
                      aria-hidden
                    >
                      {m.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.photo_url} alt="" className="w-full h-full object-cover" style={{ opacity: m.online ? 1 : 0.65 }} />
                      ) : (
                        <UserIcon size={15} style={{ color: 'var(--mm-muted)' }} />
                      )}
                    </div>
                    {m.online && (
                      <span
                        aria-hidden
                        className="absolute -bottom-0.5 -right-0.5 rounded-full"
                        style={{ width: 10, height: 10, background: '#10B981', border: '2px solid var(--mm-panel)' }}
                      />
                    )}
                  </div>
                  <span className="flex-1 min-w-0 text-[13px] font-bold truncate" style={{ color: 'var(--mm-ink)' }}>
                    {m.number != null ? `#${m.number} ` : ''}{m.name ?? '(이름 없음)'}
                  </span>
                  <span
                    className="shrink-0 text-[11px] font-bold uppercase tracking-[0.06em]"
                    style={{ color: m.online ? '#10B981' : 'var(--mm-muted)' }}
                  >
                    {m.online ? '온라인' : relTime(m.last_seen_at)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  )
}
