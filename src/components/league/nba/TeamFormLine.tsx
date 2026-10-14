// 팀 순위 줄 아래 「흐름」 한 줄 — 최근 5경기 점 · 연승/연패 · 최근 경기일 성적 · 승차 (2026-10-14).
// 계산은 lib/stats/standings.ts. 홈 「팀 승률」(NbaTeamStandings) 과 팀 탭 「팀 전적」 카드가 같이 쓴다.
// 폰(<sm)에서는 승차를 뺀다 — 한 줄에 다 넣으면 360px 에서 넘친다. PC 는 다 보인다.

import { ResultDots } from '@/components/league/ui/viz'
import Chip from '@/components/league/ui/Chip'
import { dayRecordLabel, gamesBehindLabel, notableStreak, type TeamForm } from '@/lib/stats/standings'

type Props = {
  form: TeamForm
  gamesBehind?: number | null
  /** 어두운 바탕(팀 탭 1위 카드) 위 — 보조 글자색을 패널색으로 */
  onDark?: boolean
}

const shortDate = (iso: string) => {
  const [, m, d] = iso.split('-')
  return `${Number(m)}.${Number(d)}`
}

export default function TeamFormLine({ form, gamesBehind, onDark = false }: Props) {
  const streak = notableStreak(form)
  const muted = onDark ? 'color-mix(in srgb, var(--mm-panel) 70%, transparent)' : 'var(--mm-muted)'
  const ink = onDark ? 'var(--mm-panel)' : 'var(--mm-ink)'
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs tabular-nums" style={{ color: muted }}>
      {form.last5.length > 0 && (
        <span className="inline-flex items-center gap-1.5">
          <span className="font-bold">최근 {form.last5.length}</span>
          <ResultDots results={form.last5} size={8} />
        </span>
      )}
      {streak && (
        <Chip tone={streak.kind === 'W' ? 'positive' : 'negative'}>{streak.label}</Chip>
      )}
      {form.lastDay && (
        <span className="whitespace-nowrap" title="그 팀이 마지막으로 뛴 경기일의 성적">
          <span className="font-bold">최근 경기일 {shortDate(form.lastDay.date)}</span>{' '}
          <span className="font-bold" style={{ color: ink }}>{dayRecordLabel(form.lastDay)}</span>
        </span>
      )}
      {gamesBehind != null && (
        <span className="hidden sm:inline whitespace-nowrap" title="1위와의 승차 — (1위 승 − 승 + 패 − 1위 패) ÷ 2, 무 제외">
          <span className="font-bold">승차</span>{' '}
          <span className="font-bold" style={{ color: ink }}>{gamesBehindLabel(gamesBehind)}</span>
        </span>
      )}
    </div>
  )
}
