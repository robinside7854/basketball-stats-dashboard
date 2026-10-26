// 선수 카드 머리의 소속팀 (2026-10-16 사용자 피드백 — 「카드 어디에도 소속팀이 없다」).
//   · PlayerTeamLine — 현 소속팀(지금 분기 기준)을 가장 먼저 크게: 팀 색 점 + 팀명, 비정규면 「비정규」.
//   · PlayerTeamHistory — 분기별 소속을 분기마다 한 칸(팀 색 띠 + 분기 + 팀명). 지금 분기는 노란 테두리.
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

// 2026-10-26 운영진: 한 줄 글자 + 작은 색 점은 읽기 어렵다 → 분기마다 한 칸씩 나란히(팀 색 띠 + 분기 + 팀명), 지금 분기는 테두리.
//   같은 팀이 이어지면 같은 색 칸이 붙어 보여 「언제 팀이 바뀌었나」가 한눈에 보인다.
export function PlayerTeamHistory({
  history, currentQuarterId, className = '',
}: { history: TeamHistoryEntry[]; currentQuarterId: string | null; className?: string }) {
  return (
    <ol className={`grid gap-1.5 min-w-0 ${className}`} aria-label="분기별 소속"
      style={{ gridTemplateColumns: `repeat(${Math.min(history.length, 4)}, minmax(0, 1fr))` }}>
      {history.map(h => {
        const now = h.quarter_id === currentQuarterId
        const color = h.color ?? 'var(--mm-muted)'
        return (
          <li key={h.quarter_id} className="min-w-0 px-1.5 pt-1.5 pb-1.5"
            aria-current={now ? 'true' : undefined}
            style={{
              background: `color-mix(in srgb, ${color} 16%, var(--mm-panel))`,
              borderTop: `4px solid ${color}`,
              outline: now ? '1.5px solid var(--mm-yellow-strong)' : undefined,
              outlineOffset: -1,
            }}>
            <span className="flex items-center justify-between gap-1 text-xs font-bold tabular-nums" style={{ color: 'var(--mm-muted)' }}>
              {h.label}
              {now && <span className="font-black" style={{ color: 'var(--mm-yellow-strong)' }}>지금</span>}
            </span>
            <span className="block font-black mt-0.5 leading-tight" style={{ color: 'var(--mm-ink)', fontSize: 13, overflowWrap: 'anywhere' }}>
              {h.team_name ?? '—'}
            </span>
            {!h.is_regular && <span className="block text-xs" style={{ color: 'var(--mm-muted)' }}>비정규</span>}
          </li>
        )
      })}
    </ol>
  )
}
