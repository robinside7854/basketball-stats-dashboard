'use client'
// 선수 카드 「비슷한 스타일 선수」 — 3줄 목록 (2026-10-14).
// 출처: kbl-stats 선수 상세 「비슷한 시즌」 목록의 배치(사진 · 이름 · 유사도 · 한 줄 이유).
// 계산은 서버(`detail` 라우트 → lib/stats/similarStyle.ts) — 여기서는 그리기만.
// ⚠ 유형 라벨(「슈터」 등)은 붙이지 않는다 — 운영진 결정 대기.
import Avatar from '@/components/league/ui/Avatar'

export interface SimilarPlayersData {
  qualified: boolean
  sample: number
  players: Array<{
    player_id: string
    name: string
    photo_url: string | null
    team: { name: string; color: string } | null
    score: number
    reasons: string[]
    reason_text: string
  }>
}

interface Props {
  data: SimilarPlayersData
  /** 줄을 누르면 그 선수 카드로 — 없으면 줄은 누를 수 없다 */
  onOpen?: (playerId: string, name: string) => void
}

export default function SimilarPlayers({ data, onOpen }: Props) {
  return (
    <section aria-labelledby="similar-players-title" className="mt-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 id="similar-players-title" className="text-sm font-black" style={{ color: 'var(--mm-ink)' }}>비슷한 스타일 선수</h3>
        {data.qualified && (
          <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>
            슛 구성 · 하루 평균 기록의 모양 · 비교 {data.sample}명
          </span>
        )}
      </div>
      {!data.qualified || data.players.length === 0 ? (
        <p
          className="rounded-sm px-3 py-2.5 text-xs font-bold"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-muted)' }}
        >
          비교할 만큼 출전 기록이 쌓이면 보여요
        </p>
      ) : (
        <ul className="overflow-hidden rounded-sm" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}>
          {data.players.map((p, i) => {
            const body = (
              <>
                <Avatar src={p.photo_url} name={p.name} size={40} ringColor={p.team?.color ?? null} decorative />
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-black" style={{ color: 'var(--mm-ink)' }}>{p.name}</span>
                    {p.team && (
                      <span
                        className="inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-bold whitespace-nowrap"
                        style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink-soft)' }}
                      >
                        <span aria-hidden className="inline-block rounded-full" style={{ width: 8, height: 8, background: p.team.color, border: '1px solid var(--mm-rule)' }} />
                        {p.team.name}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs font-bold" style={{ color: 'var(--mm-ink-soft)' }}>{p.reason_text}</span>
                  <span className="mt-1 grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-x-2" aria-hidden>
                    <span className="relative block h-2 overflow-hidden rounded-sm" style={{ background: 'var(--mm-rule)' }}>
                      <span className="absolute inset-y-0 left-0 block rounded-sm" style={{ width: `${Math.max(2, p.score)}%`, background: 'var(--mm-yellow-strong)' }} />
                    </span>
                    <span className="text-right text-xs font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>{p.score}</span>
                  </span>
                </span>
              </>
            )
            const label = `${p.name}${p.team ? ` (${p.team.name})` : ''}, 유사도 ${p.score}, ${p.reason_text}`
            return (
              <li key={p.player_id} style={i > 0 ? { borderTop: '1px solid var(--mm-rule)' } : undefined}>
                {onOpen ? (
                  <button
                    type="button"
                    onClick={() => onOpen(p.player_id, p.name)}
                    className="flex w-full min-h-11 items-center gap-3 px-3 py-2.5 text-left transition-colors duration-200 hover:bg-[var(--mm-panel)]"
                    aria-label={`${label} — 선수 카드 열기`}
                  >
                    {body}
                  </button>
                ) : (
                  <div className="flex items-center gap-3 px-3 py-2.5" aria-label={label}>{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
