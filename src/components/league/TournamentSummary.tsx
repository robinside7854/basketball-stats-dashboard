// 대회형(파란날개) 홈 요약 — 대회별 전적 + 최종 성적(우승·준우승·N강 탈락)
//
// 배경: 레거시 `/tournaments` 화면(src/app/(main)/[org]/[team]/tournaments/page.tsx)에 있던
// 요약을 리그 홈으로 옮긴 것. 리그형(미라클)에는 대응 개념이 없어 이 컴포넌트는
// mode==='tournament' 인 리그의 홈에서만 렌더링된다 (호출부: [leagueId]/page.tsx).
//
// ⚠ 판정 규칙은 레거시의 getTournamentSummary 를 그대로 옮겼다 — 새로 만들면 같은 대회의
// 성적이 옛 화면과 새 화면에서 달라지고 Task 4 의 대조가 실패한다. ROUND_ORDER 에 '준결승'이
// 빠져 있는 것도 레거시 원본 그대로다(버그가 아니라 재현 대상) — '준결승'이 최고 라운드인
// 대회는 그보다 낮은 라운드가 topGame 으로 잘못 뽑혀 성적 배지가 비는 경우가 실제로 있다
// (예: "2026 하늘배 농구대회 수도권리그" — 준결승 패배가 있어도 8강 승리가 topGame 이 되어
// 성적 배지가 나타나지 않는다). 레거시 화면과 나란히 비교했을 때 숫자가 같아야 하므로 유지한다.
import { createClient } from '@/lib/supabase/admin'
import { Trophy } from 'lucide-react'
import SectionCard from '@/components/league/ui/SectionCard'
import { segmentLabel } from '@/lib/league/mode'

const ROUND_ORDER: Record<string, number> = {
  '결승': 5, '4강': 4, '8강': 3, '16강': 2, '조별예선': 1,
}

type QuarterRow = { id: string; name: string; start_date: string | null; end_date: string | null; ord: number }
type GameRow = { quarter_id: string | null; home_score: number; away_score: number; round_label: string | null }

// 레거시 getTournamentSummary 이식. our_score/opponent_score → home_score/away_score
// (migrate-legacy.mjs 가 이관 시 "우리 팀 = home" 으로 고정해 두었다 — scripts/migrate-legacy.mjs
// "경기. 레거시는 항상 우리 vs 상대이므로 우리 팀을 홈, 상대를 원정으로 고정한다" 참고).
function computePlacement(
  games: Pick<GameRow, 'home_score' | 'away_score' | 'round_label'>[],
): { record: string; placement: string } | null {
  const played = games.filter(g => g.home_score > 0 || g.away_score > 0)
  if (played.length === 0) return null

  const wins = played.filter(g => g.home_score > g.away_score).length
  const losses = played.filter(g => g.home_score < g.away_score).length
  const record = `${wins}승 ${losses}패`

  const roundGames = played
    .filter(g => g.round_label)
    .sort((a, b) => (ROUND_ORDER[b.round_label!] ?? 0) - (ROUND_ORDER[a.round_label!] ?? 0))
  if (roundGames.length === 0) return { record, placement: '' }

  const topGame = roundGames[0]
  const won = topGame.home_score > topGame.away_score

  let placement = ''
  if (topGame.round_label === '결승') {
    placement = won ? '🏆 우승' : '준우승'
  } else if (!won) {
    placement = `${topGame.round_label} 탈락`
  }

  return { record, placement }
}

async function loadTournaments(leagueId: string): Promise<{ quarters: QuarterRow[]; games: GameRow[] }> {
  const sb = createClient()
  const [{ data: quarters }, { data: games }] = await Promise.all([
    sb
      .from('league_quarters')
      .select('id, name, start_date, end_date, ord')
      .eq('league_id', leagueId)
      .eq('kind', 'tournament')
      .order('ord', { ascending: false }),
    sb
      .from('league_games')
      .select('quarter_id, home_score, away_score, round_label')
      .eq('league_id', leagueId),
  ])
  return {
    quarters: (quarters ?? []) as QuarterRow[],
    games: (games ?? []) as GameRow[],
  }
}

function formatPeriod(start: string | null, end: string | null): string {
  if (!start) return ''
  const fmt = (iso: string) => {
    const parts = iso.split('-')
    return parts.length === 3 ? `${parts[1]}.${parts[2]}` : iso
  }
  if (!end || end === start) return fmt(start)
  return `${fmt(start)} ~ ${fmt(end)}`
}

export default async function TournamentSummary({ leagueId }: { leagueId: string }) {
  const { quarters, games } = await loadTournaments(leagueId)
  if (quarters.length === 0) return null

  const gamesByQuarter = new Map<string, GameRow[]>()
  for (const g of games) {
    if (!g.quarter_id) continue
    if (!gamesByQuarter.has(g.quarter_id)) gamesByQuarter.set(g.quarter_id, [])
    gamesByQuarter.get(g.quarter_id)!.push(g)
  }

  const label = segmentLabel('tournament') // '대회'

  return (
    <SectionCard variant="standalone" className="p-4 lg:p-5 space-y-3" ariaLabel={`${label} 성적`}>
      <div className="flex items-center gap-2">
        <Trophy size={20} style={{ color: 'var(--mm-yellow-strong)' }} aria-hidden />
        <h2
          className="font-jersey font-black uppercase text-lg lg:text-xl"
          style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}
        >
          {label} 성적
        </h2>
        <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>
          {quarters.length}개
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {quarters.map(q => {
          const summary = computePlacement(gamesByQuarter.get(q.id) ?? [])
          const isChampion = summary?.placement.startsWith('🏆') ?? false
          const period = formatPeriod(q.start_date, q.end_date)

          return (
            <div
              key={q.id}
              className="p-3.5"
              style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
            >
              <div
                className="font-bold text-sm break-keep"
                style={{ color: 'var(--mm-ink)', lineHeight: 1.35 }}
                title={q.name}
              >
                {q.name}
              </div>
              {period && (
                <div className="text-[11px] mt-1 font-medium" style={{ color: 'var(--mm-muted)' }}>
                  {period}
                </div>
              )}

              {summary ? (
                <div className="mt-2.5 flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>
                    {summary.record}
                  </span>
                  {summary.placement && (
                    <span
                      className="text-[11px] font-black uppercase px-2 py-0.5 rounded"
                      style={{
                        background: isChampion ? 'var(--mm-yellow)' : 'var(--mm-panel)',
                        color: isChampion ? 'var(--mm-black)' : 'var(--mm-muted)',
                        border: `1px solid ${isChampion ? 'var(--mm-black)' : 'var(--mm-rule)'}`,
                        letterSpacing: '0.04em',
                      }}
                    >
                      {summary.placement}
                    </span>
                  )}
                </div>
              ) : (
                <div className="mt-2.5 text-xs" style={{ color: 'var(--mm-muted)' }}>
                  경기 기록 없음
                </div>
              )}
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}
