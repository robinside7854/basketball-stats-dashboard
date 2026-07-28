'use client'
// 접속 현황 (전체 공개) — 라커룸 상단.
//   승인 회원의 온라인 여부(최근 5분 활동) + 마지막 접속. 60초 폴링.
import { useState, useEffect, useCallback } from 'react'
import { Radio, User as UserIcon } from 'lucide-react'
import SectionCard from '@/components/league/ui/SectionCard'

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
  if (!iso) return '접속 기록 없음'
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

export default function PresencePanel({ leagueId }: { leagueId: string }) {
  const [data, setData] = useState<PresenceData | null>(null)
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/leagues/${leagueId}/auth/presence`, { cache: 'no-store' })
      if (r.ok) setData(await r.json())
    } catch { /* 무시 */ } finally { setLoaded(true) }
  }, [leagueId])

  useEffect(() => {
    load()
    const beat = () => { if (document.visibilityState === 'visible') load() }
    const id = window.setInterval(beat, 60_000)
    document.addEventListener('visibilitychange', beat)
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', beat) }
  }, [load])

  // 계정(로그인) 회원이 하나도 없으면 렌더 안 함
  if (loaded && (!data || data.total === 0)) return null
  if (!data) return null

  return (
    <SectionCard variant="standalone" ariaLabel="접속 현황">
      <header
        className="flex items-center gap-2 px-4 sm:px-5 py-3"
        style={{ borderBottom: '1px solid var(--mm-rule)', background: 'var(--mm-panel-alt)' }}
      >
        <Radio size={16} style={{ color: data.online > 0 ? '#10B981' : 'var(--mm-muted)' }} aria-hidden />
        <h2 className="font-jersey font-black uppercase text-base sm:text-lg tracking-[0.10em]" style={{ color: 'var(--mm-ink)' }}>
          접속 현황
        </h2>
        <span
          className="ml-auto inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.10em] px-2 py-0.5 rounded-sm"
          style={{ background: data.online > 0 ? '#10B981' : 'var(--mm-panel)', color: data.online > 0 ? '#fff' : 'var(--mm-muted)', border: data.online > 0 ? 'none' : '1px solid var(--mm-rule)' }}
        >
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: data.online > 0 ? '#fff' : 'var(--mm-muted)', display: 'inline-block' }} />
          {data.online}명 접속 중
        </span>
      </header>

      <ul className="divide-y divide-[color:var(--mm-rule)]">
        {data.members.map(m => (
          <li key={m.player_id} className="flex items-center gap-3 px-4 sm:px-5 py-2.5">
            <div className="relative shrink-0">
              <div
                className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center"
                style={{ background: 'var(--mm-panel-alt)', border: `2px solid ${m.online ? '#10B981' : 'var(--mm-rule)'}` }}
                aria-hidden
              >
                {m.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.photo_url} alt="" className="w-full h-full object-cover" style={{ opacity: m.online ? 1 : 0.7 }} />
                ) : (
                  <UserIcon size={16} style={{ color: 'var(--mm-muted)' }} />
                )}
              </div>
              {m.online && (
                <span
                  aria-hidden
                  className="absolute -bottom-0.5 -right-0.5 rounded-full"
                  style={{ width: 11, height: 11, background: '#10B981', border: '2px solid var(--mm-panel)' }}
                />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-sm font-bold truncate block" style={{ color: 'var(--mm-ink)' }}>
                {m.number != null ? `#${m.number} ` : ''}{m.name ?? '(이름 없음)'}
              </span>
            </div>
            <span
              className="shrink-0 text-[11px] font-bold uppercase tracking-[0.08em]"
              style={{ color: m.online ? '#10B981' : 'var(--mm-muted)' }}
            >
              {m.online ? '온라인' : relTime(m.last_seen_at)}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  )
}
