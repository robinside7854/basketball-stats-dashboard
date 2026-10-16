// 선수 카드 머리의 소속팀 (2026-10-16 사용자 피드백 — 「카드 어디에도 소속팀이 없다」).
//   · PlayerTeamLine — 현 소속팀(지금 분기 기준)을 가장 먼저 크게: 팀 색 점 + 팀명, 비정규면 「비정규」.
//   · PlayerTeamHistory — 분기별 소속을 한 줄로 작게: 「26.1Q 락다운 · 26.2Q 락다운 · 26.3Q 굿모닝」.
//   데이터는 detail 라우트의 current_team / team_history — 팀명은 (team_id, quarter_id) 정체성으로 이미 풀려 온다.
import Chip from '@/components/league/ui/Chip'

export interface TeamHistoryEntry {
  quarter_id: string
  /** `26.3Q` */
  label: string
  /** 분기 소속은 있는데 팀이 비어 있으면(비정규) null */
  team_name: string | null
  color: string | null
  is_regular: boolean
}
export type CurrentTeam = TeamHistoryEntry

function Dot({ color, size = 10 }: { color: string | null; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: color ?? 'var(--mm-muted)', border: '1px solid var(--mm-rule)' }}
    />
  )
}

export default function PlayerTeamLine({ team, className = '' }: { team: CurrentTeam; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 flex-wrap min-w-0 ${className}`}>
      <Dot color={team.color} size={12} />
      <span className="font-jersey text-lg sm:text-xl font-black leading-tight break-keep" style={{ color: 'var(--mm-ink)' }}>
        {team.team_name ?? '소속 팀 없음'}
      </span>
      {!team.is_regular && <Chip tone="accent">비정규</Chip>}
      <span className="sr-only">{team.label} 소속</span>
    </div>
  )
}

export function PlayerTeamHistory({
  history, currentQuarterId, className = '',
}: { history: TeamHistoryEntry[]; currentQuarterId: string | null; className?: string }) {
  return (
    <p className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs min-w-0 ${className}`} style={{ color: 'var(--mm-muted)' }}>
      <span className="sr-only">분기별 소속: </span>
      {history.map((h, i) => (
        <span key={h.quarter_id} className="inline-flex items-center gap-1 whitespace-nowrap">
          {i > 0 && <span aria-hidden className="mr-0.5">·</span>}
          <span className="tabular-nums">{h.label}</span>
          <Dot color={h.color} size={7} />
          <span
            className={h.quarter_id === currentQuarterId ? 'font-bold' : 'font-semibold'}
            style={{ color: h.quarter_id === currentQuarterId ? 'var(--mm-ink)' : 'var(--mm-ink-soft)' }}
          >
            {h.team_name ?? '—'}{!h.is_regular && <span className="font-normal" style={{ color: 'var(--mm-muted)' }}>(비정규)</span>}
          </span>
        </span>
      ))}
    </p>
  )
}
