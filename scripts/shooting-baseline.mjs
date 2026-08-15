#!/usr/bin/env node
/**
 * 슈팅 성공률 기준선 재산출 — `src/lib/stats/shootingBaseline.ts` 의 근거를 다시 뽑는다.
 *
 *   node scripts/shooting-baseline.mjs
 *
 * 왜 스크립트로 남기는가
 *   기준선은 "언젠가 정한 숫자"가 아니라 **그 시점 리그의 실측 평균**이다. 시즌이 쌓이면
 *   분포가 움직이므로, 값이 어디서 나왔는지 재현할 수 없으면 다시 근거 없는 상수가 된다.
 *   출력값을 shootingBaseline.ts 의 주석·상수와 대조해서 갱신하면 된다.
 *
 * 집계 규칙은 `src/lib/stats/leagueStats.ts` 의 switch 문과 정확히 일치시킨다 —
 * 특히 `and_one` 은 FGA/FTA 어디에도 넣지 않는다(득점만 가산되는 이벤트).
 */
import { query } from './lib/supabase-admin.mjs'

const FGA = `('shot_3p','shot_post','shot_layup','shot_2p_mid')`
const FTA = `('ft_2pt','ft_3pt_1','ft_3pt_2','free_throw')`

const rate = (m, a) => (a > 0 ? +((m / a) * 100).toFixed(1) : 0)

function report(label, source, rows) {
  const by = Object.fromEntries(rows.map(r => [r.type, r]))
  const pick = types => types.reduce(
    (acc, t) => ({ a: acc.a + (by[t]?.a ?? 0), m: acc.m + (by[t]?.m ?? 0) }),
    { a: 0, m: 0 },
  )

  const fg = pick(['shot_3p', 'shot_post', 'shot_layup', 'shot_2p_mid'])
  const fg3 = pick(['shot_3p'])
  const ft = pick(['ft_2pt', 'ft_3pt_1', 'ft_3pt_2', 'free_throw'])
  const post = pick(['shot_post'])
  const layup = pick(['shot_layup'])
  const mid = pick(['shot_2p_mid'])

  console.log(`\n── ${label}  (${source})`)
  for (const [k, v] of Object.entries({ FG: fg, '3P': fg3, FT: ft, 골밑: post, 레이업: layup, 미들: mid })) {
    const warn = v.a < 100 ? '  ⚠ 표본 부족' : ''
    console.log(`  ${k.padEnd(5)} ${String(rate(v.m, v.a)).padStart(5)}%   (${v.m}/${v.a})${warn}`)
  }
  console.log(`  → { fg: ${Math.round(rate(fg.m, fg.a))}, fg3: ${Math.round(rate(fg3.m, fg3.a))}, ft: ${Math.round(rate(ft.m, ft.a))}, ` +
    `zone: { post: ${Math.round(rate(post.m, post.a))}, layup: ${Math.round(rate(layup.m, layup.a))}, ` +
    `mid: ${Math.round(rate(mid.m, mid.a))}, three: ${Math.round(rate(fg3.m, fg3.a))} } }`)
}

// game_events.type 은 enum(event_type)이라 리그에만 있는 ft_2pt 같은 값과 직접 비교하면
// 22P02 로 죽는다 — 양쪽 다 text 로 캐스팅해서 비교한다.
const shotFilter = col => `(${col}::text in ${FGA} or ${col}::text in ${FTA})`

const club = await query(`
  select type, count(*)::int a, count(*) filter (where result='made')::int m
  from game_events where ${shotFilter('type')} group by 1
`)
report('CLUB_BASELINE', 'game_events · /[org]/[team]/*', club)

const league = await query(`
  select e.type, count(*)::int a, count(*) filter (where e.result='made')::int m
  from league_game_events e
  join league_games g on g.id = e.league_game_id
  join leagues l on l.id = g.league_id
  where l.org_slug = 'miracle' and ${shotFilter('e.type')}
  group by 1
`)
report('LEAGUE_BASELINE', 'league_game_events · /league/*', league)

console.log('\n⚠ 자유투는 리그 쪽 표본이 작고 ft_2pt(1구 2점) 합성 이벤트가 섞여 있다.')
console.log('  값이 크게 튀면 상수를 바꾸기 전에 원인부터 확인할 것.\n')
