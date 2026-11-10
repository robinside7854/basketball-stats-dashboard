'use client'
// 하이라이트 첫 화면 맨 위 「지난 경기 하이라이트」 — 누르면 바로 전체화면 연속 재생 (2026-11-10 운영진).
//   종전엔 날짜 → 클립 목록 → 재생으로 세 번 들어가야 해서 클립 화면까지 간 사람이 드물었다(2주 9명).
//   · 클립 정의는 피드와 같다 — `GET /highlights/[date]`(loadRoundDetail). 새 정의를 만들지 않는다.
//   · 그날 클립 중 볼 만한 것 REEL_MAX 개만 고른다(클러치 · 앤드원 · 3점 · 어시스트 순으로 점수) — 순서는 경기 흐름 그대로.
//   · 재생기는 DayHighlightsLauncher 와 같은 방식 — 화면 밖에 미리 띄워 두고, 버튼 탭 안에서 openImmersive() 를 동기로 부른다
//     (iPhone 은 사용자 탭 안에서만 전체화면·재생이 열린다).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { Play } from 'lucide-react'
import { track } from '@vercel/analytics'
import HighlightsPlayer, { type HighlightsPlayerHandle } from '@/components/highlights/HighlightsPlayer'
import type { HighlightClip } from '@/lib/highlights/types'
import { formatFeedDate } from './feedFormat'

const REEL_MAX = 12

function score(c: HighlightClip): number {
  return (c.is_clutch ? 4 : 0) + (c.has_and_one ? 2 : 0) + (c.shot_type === 'shot_3p' ? 2 : 0) + (c.assist_player_id ? 1 : 0)
}

export default function WeekReel({ leagueId, date, href, thumbVideoId }: { leagueId: string; date: string; href: string; thumbVideoId: string | null }) {
  const [clips, setClips] = useState<HighlightClip[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [key, setKey] = useState(0)
  const ref = useRef<HighlightsPlayerHandle | null>(null)

  useEffect(() => {
    let off = false
    fetch(`/api/leagues/${leagueId}/highlights/${date}`)
      .then(r => r.ok ? r.json() : null)
      .then((d: { clips?: HighlightClip[] } | null) => { if (!off) setClips(d?.clips ?? []) })
      .catch(() => { if (!off) setClips([]) })
    return () => { off = true }
  }, [leagueId, date])

  const reel = useMemo(() => {
    const playable = (clips ?? []).filter(c => !!c.video_id && !c.shot_type.startsWith('ft_') && c.shot_type !== 'free_throw').map((c, i) => ({ c, i }))
    const picked = [...playable].sort((a, b) => score(b.c) - score(a.c) || a.i - b.i).slice(0, REEL_MAX)
    return picked.sort((a, b) => a.i - b.i).map(x => x.c)
  }, [clips])

  const onImmersiveChange = useCallback((open: boolean) => { if (!open) { setIdx(0); setKey(k => k + 1) } }, [])

  if (clips && reel.length === 0) return null

  return (
    <div className="overflow-hidden flex flex-col sm:flex-row" style={{ background: 'var(--mm-black)', color: '#fff', borderRadius: 'var(--mm-radius-card)' }}>
      <div className="relative aspect-video sm:w-72 shrink-0 bg-black">
        {thumbVideoId && (
          // eslint-disable-next-line @next/next/no-img-element -- YouTube 썸네일(외부 호스트)
          <img src={`https://i.ytimg.com/vi/${thumbVideoId}/mqdefault.jpg`} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />
        )}
      </div>
      <div className="p-4 flex flex-col justify-center gap-3 flex-1 min-w-0">
        <div>
          <p className="text-xs font-bold" style={{ color: 'var(--mm-yellow)' }}>지난 경기 하이라이트</p>
          <p className="text-lg font-black break-keep">{formatFeedDate(date, true)}</p>
          <p className="text-xs break-keep" style={{ color: 'rgba(255,255,255,0.7)' }}>
            {clips ? `골라 둔 장면 ${reel.length}개를 이어서 틀어요.` : '장면을 고르는 중이에요.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!clips || reel.length === 0}
            // ⚠ 동기 호출 — 전체화면은 이 탭 안에서만 열린다
            onClick={() => { ref.current?.openImmersive(); track('highlight_reel', { clips: reel.length }) }}
            className="mm-press inline-flex items-center justify-center gap-2 min-h-12 px-5 text-base font-black cursor-pointer active:scale-[0.96] transition-transform disabled:opacity-40 disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#fff]"
            style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: 'var(--mm-radius-chip)' }}
          >
            <Play size={18} fill="currentColor" aria-hidden />
            바로 재생
          </button>
          <Link href={href} className="inline-flex items-center min-h-12 px-3 text-sm font-bold underline-offset-4 hover:underline" style={{ color: 'rgba(255,255,255,0.85)' }}>
            그날 전체 보기
          </Link>
        </div>
      </div>
      {reel.length > 0 && createPortal(
        <HighlightsPlayer key={key} ref={ref} clips={reel} currentIdx={Math.min(idx, reel.length - 1)} onIndexChange={setIdx} onImmersiveChange={onImmersiveChange} immersiveOnly />,
        document.body,
      )}
    </div>
  )
}
