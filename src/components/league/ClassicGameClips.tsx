'use client'
// 명경기 모음집 — 그 경기의 득점 클립을 순서대로 본다.
//
// '풀경기 보기'(유튜브 원본 링크)는 2026-08-14 제거했다. 명경기 카드에서 원하는 건
// "그 경기가 왜 명경기였나"이고, 그건 득점 장면이 답한다. 40분짜리 원본은 여기서 눌릴 일이 없다.
//
// 왜 클립을 미리 안 싣는가: 명경기 목록은 서버 컴포넌트가 그린다. 거기에 클립까지 담으면
//   7~8경기 × 십수 개 클립이 전부 첫 페이로드에 실린다. 대부분의 방문자는 목록만 훑고 나간다.
//   그래서 카드를 열 때 그 경기 것만 가져온다.
//
// 데이터는 기존 라운드 API(`/highlights/{date}`)를 그대로 쓴다. 그 날의 클립을 받아
//   game_id 로 걸러낸다 — 명경기 전용 엔드포인트를 새로 만들면 같은 로딩 로직이 둘로 갈린다.
import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Play, Loader2, Table2 } from 'lucide-react'
import type { HighlightClip } from '@/lib/highlights/types'
import type { ClassicGame } from '@/lib/stats/classicGames'

// 둘 다 무겁고(YouTube iframe · 표 + 조회) 실제로 여는 사람만 필요하다.
const HighlightsClipModal = dynamic(() => import('@/components/highlights/HighlightsClipModal'), { ssr: false })
const ClassicBoxscoreModal = dynamic(() => import('@/components/league/ClassicBoxscoreModal'), { ssr: false })

interface Props {
  leagueId: string
  game: ClassicGame
}

// 카드 하단 액션 — 클립 모음집과 박스스코어. 클라이언트 경계를 하나로 유지하려고
// 두 버튼을 한 컴포넌트에 둔다(카드 자체는 서버 컴포넌트다).
export default function ClassicGameClips({ leagueId, game }: Props) {
  const { gameId, date } = game
  const title = `${game.homeName} ${game.homeScore} : ${game.awayScore} ${game.awayName}`
  const [boxOpen, setBoxOpen] = useState(false)
  const [clips, setClips] = useState<HighlightClip[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function openCollection() {
    // 한 번 받아온 뒤에는 다시 부르지 않는다 — 닫았다 여는 게 흔한 동작이다.
    if (clips) { setOpen(true); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/leagues/${leagueId}/highlights/${date}`)
      if (!res.ok) throw new Error(res.status === 401 ? '회원 전용입니다' : '클립을 불러오지 못했습니다')
      const detail = await res.json() as { clips?: HighlightClip[] }
      const mine = (detail.clips ?? []).filter(c => c.game_id === gameId)
      setClips(mine)
      // 빈 결과와 실패를 구분한다 — 둘 다 "아무것도 안 뜸"으로 보이면 원인을 못 찾는다.
      if (mine.length === 0) setError('이 경기에는 등록된 클립이 없습니다')
      else setOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : '클립을 불러오지 못했습니다')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="px-4 py-3 flex items-center gap-2 flex-wrap" style={{ borderTop: '1px solid var(--mm-rule)' }}>
        <button
          type="button"
          onClick={openCollection}
          disabled={loading}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 text-[12px] font-black uppercase tracking-[0.1em] cursor-pointer transition-colors disabled:opacity-50"
          style={{
            background: 'var(--mm-yellow)', color: 'var(--mm-black)',
            borderRadius: 'var(--mm-radius-ctl)',
            transitionDuration: 'var(--mm-motion-fast)', transitionTimingFunction: 'var(--mm-ease-out)',
          }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Play size={14} aria-hidden />}
          득점 장면 모아보기
          {clips && clips.length > 0 && (
            <span className="tabular-nums font-black">{clips.length}</span>
          )}
        </button>

        {/* 박스스코어 — 페이지로 나가지 않는다. 명경기는 훑어보는 목록이라
            나갔다 돌아오면 자리를 잃는다. */}
        <button
          type="button"
          onClick={() => setBoxOpen(true)}
          className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 text-[12px] font-bold uppercase tracking-[0.1em] cursor-pointer transition-colors"
          style={{
            border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)',
            borderRadius: 'var(--mm-radius-ctl)',
            transitionDuration: 'var(--mm-motion-fast)', transitionTimingFunction: 'var(--mm-ease-out)',
          }}
        >
          <Table2 size={14} aria-hidden />
          박스스코어
        </button>

        {error && (
          <span className="text-[12px]" style={{ color: 'var(--mm-muted)' }} role="status">
            {error}
          </span>
        )}
      </div>

      {boxOpen && (
        <ClassicBoxscoreModal leagueId={leagueId} game={game} onClose={() => setBoxOpen(false)} />
      )}

      {open && clips && clips.length > 0 && (
        <HighlightsClipModal
          clips={clips}
          title={title}
          icon={<Play size={16} aria-hidden />}
          onClose={() => setOpen(false)}
          ariaLabel={`${title} 득점 장면 모음`}
        />
      )}
    </>
  )
}
