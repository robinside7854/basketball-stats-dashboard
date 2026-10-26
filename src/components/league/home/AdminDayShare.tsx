'use client'
// 어드민 「경기 결과 단톡방에 공유」 (2026-10-26 점검 MVP 1) — 회원이 앱에 다시 들어올 「계기」.
//   운영진 결정으로 푸시 알림은 넣지 않는다. 대신 기록을 마감한 어드민이 한 번 눌러 단톡방에 결과 요약 + 링크를 던진다.
//   리그는 비공개라 링크는 회원만 열린다 — 요약 글 자체가 단톡방에서 읽히도록 팀 성적·득점 상위를 글로 담는다.
//   득점 상위는 그날 박스스코어(서버 캐시)를 누를 때 한 번 받는다. 실패해도 팀 성적만으로 공유한다.
import { useState } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import type { RoundSummary } from './roundTypes'

type DailyRow = { name: string; pts: number; reb: number; ast: number }

export default function AdminDayShare({ round, leagueId, base }: { round: RoundSummary; leagueId: string; base: string }) {
  const { isEditMode } = useLeagueEditMode()
  const [busy, setBusy] = useState(false)
  if (!isEditMode) return null

  async function share() {
    if (busy) return
    setBusy(true)
    try {
      let top: DailyRow[] = []
      try {
        const r = await fetch(`/api/leagues/${leagueId}/daily-boxscore?date=${round.date}`)
        if (r.ok) top = ((await r.json()).daily_stats ?? []).slice(0, 3)
      } catch { /* 득점 상위 없이 공유 */ }

      const url = `${window.location.origin}${base}/boxscore/${round.date}`
      const lines = [
        `${round.weekLabel} 경기 결과 (${round.gamesCount}경기)`,
        ...round.teams.map((t, i) => {
          const diff = t.ptsFor - t.ptsAgainst
          return `${i + 1}. ${t.name} ${t.wins}승 ${t.losses}패${t.draws ? ` ${t.draws}무` : ''} (${diff > 0 ? '+' : ''}${diff})`
        }),
        ...(top.length > 0 ? ['', '득점 상위', ...top.map((p, i) => `${i + 1}. ${p.name} ${p.pts}점 ${p.reb}리바 ${p.ast}어시`)] : []),
        '',
        '내 기록·영상 보기',
        url,
      ]
      const text = lines.join('\n')

      if (navigator.share) {
        try {
          await navigator.share({ text })
          return
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') return
        }
      }
      await navigator.clipboard.writeText(text)
      toast.success('결과 요약을 복사했어요 — 단톡방에 붙여 넣으세요')
    } catch {
      toast.error('공유하지 못했어요')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      disabled={busy}
      className="mm-press w-full inline-flex items-center justify-center gap-2 px-4 min-h-[44px] text-sm font-black cursor-pointer disabled:opacity-60"
      style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink)', border: '1px dashed var(--mm-yellow-strong)', borderRadius: 'var(--mm-radius-ctl)' }}
    >
      {busy ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Send size={16} aria-hidden />}
      {round.weekLabel} 결과 단톡방에 공유 <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>(운영진)</span>
    </button>
  )
}
