// 팀 카드 아래 「흐름」 한 줄 — 지금 연승·연패 · 최근 10경기 성적 (2026-11-09 운영진).
// 종전(2026-10-14)엔 최근 5경기 점 · 연승 딱지 · 최근 경기일 성적 · 승차를 다 넣어 연패 딱지 때문에 줄이 꺾였다 →
// 두 가지만 글자로. 승차는 뺐다. 계산은 lib/stats/standings.ts(computeTeamForm).
// 홈 「팀 승률」(NbaTeamStandings) 과 팀 탭 「팀 전적」 카드가 같이 쓴다.

import { type TeamForm } from '@/lib/stats/standings'

type Props = {
  form: TeamForm
  /** 예전 호출부 호환 — 더 쓰지 않는다(승차 삭제 2026-11-09) */
  gamesBehind?: number | null
  /** 어두운 바탕(팀 탭 1위 카드) 위 — 보조 글자색을 패널색으로 */
  onDark?: boolean
}

export default function TeamFormLine({ form, onDark = false }: Props) {
  const muted = onDark ? 'color-mix(in srgb, var(--mm-panel) 70%, transparent)' : 'var(--mm-muted)'
  const ink = onDark ? 'var(--mm-panel)' : 'var(--mm-ink)'
  // 옛 캐시 항목엔 last10 이 없다 — 그땐 최근 5경기로 대신 센다
  const ten = form.last10 ?? {
    wins: form.last5.filter(r => r === 'W').length,
    losses: form.last5.filter(r => r === 'L').length,
    draws: form.last5.filter(r => r === 'D').length,
    games: form.last5.length,
  }
  const streak = form.streakKind && form.streakCount > 0
    ? { label: `${form.streakCount}${form.streakKind === 'W' ? '연승' : '연패'}`, color: form.streakKind === 'W' ? 'var(--mm-positive)' : 'var(--mm-negative)' }
    : null
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs tabular-nums" style={{ color: muted }}>
      <span className="whitespace-nowrap">
        <span className="font-bold">현재</span>{' '}
        {streak
          ? <span className="font-black" style={{ color: onDark ? ink : streak.color }}>{streak.label}</span>
          : <span className="font-bold" style={{ color: ink }}>{ten.games > 0 ? '직전 무승부' : '—'}</span>}
      </span>
      {ten.games > 0 && (
        <span className="whitespace-nowrap">
          <span className="font-bold">최근 {ten.games}경기</span>{' '}
          <span className="font-bold" style={{ color: ink }}>{ten.wins}승 {ten.losses}패{ten.draws > 0 ? ` ${ten.draws}무` : ''}</span>
        </span>
      )}
    </div>
  )
}
