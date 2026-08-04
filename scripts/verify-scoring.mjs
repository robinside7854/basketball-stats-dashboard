// 득점 채점 검증 — 실제 모듈(src/lib/stats/scoring.ts)을 그대로 임포트해 DB 이벤트 전량 대조.
//
//   node scripts/verify-scoring.mjs
//
// Node 24 는 .ts 를 네이티브로 타입 스트리핑해 실행하므로 로직을 복제하지 않는다.
// scoring.ts 에 값 import 가 생기면 이 스크립트가 깨진다 — 그게 의도된 제약이다.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { query } from './lib/supabase-admin.mjs'
import { scorePoints, STANDARD_SCORING, fetchScoringRules } from '../src/lib/stats/scoring.ts'

let failed = 0
function check(name, fn) {
  let r
  try { r = fn() } catch (e) { console.log(`✖ ${name}\n    예외: ${e.message}`); failed++; return }
  if (r === true) console.log(`✔ ${name}`)
  else { console.log(`✖ ${name}\n    ${r}`); failed++ }
}

// ── 순수 함수 단위 검증 (미라클 룰) ──────────────────
const MIRACLE = {
  event_points: {
    shot_3p: 3, shot_2p_mid: 2, shot_layup: 2, shot_post: 2,
    ft_2pt: 2, ft_3pt_1: 2, ft_3pt_2: 1, free_throw: 1, and_one: 1,
  },
  plus_one_bonus: { amount: 1, applies_to: ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post'] },
}

check('실패한 슛은 0점', () =>
  scorePoints('shot_3p', 'missed', false, MIRACLE) === 0 || `기대 0, 실제 ${scorePoints('shot_3p', 'missed', false, MIRACLE)}`)

check('result 가 null 이면 0점 (교체·파울 등)', () =>
  scorePoints('shot_3p', null, false, MIRACLE) === 0 || '실패')

check('3점 = 3점, 플러스원이면 4점', () =>
  (scorePoints('shot_3p', 'made', false, MIRACLE) === 3 && scorePoints('shot_3p', 'made', true, MIRACLE) === 4)
  || `실제 ${scorePoints('shot_3p', 'made', false, MIRACLE)} / ${scorePoints('shot_3p', 'made', true, MIRACLE)}`)

check('2점 야투 3종 = 2점, 플러스원이면 3점', () =>
  ['shot_2p_mid', 'shot_layup', 'shot_post'].every(t =>
    scorePoints(t, 'made', false, MIRACLE) === 2 && scorePoints(t, 'made', true, MIRACLE) === 3) || '실패')

check('자유투에는 플러스원 보너스가 붙지 않는다', () =>
  (scorePoints('ft_2pt', 'made', true, MIRACLE) === 2 && scorePoints('free_throw', 'made', true, MIRACLE) === 1)
  || `실제 ft_2pt=${scorePoints('ft_2pt', 'made', true, MIRACLE)}, free_throw=${scorePoints('free_throw', 'made', true, MIRACLE)}`)

check('앤드원에도 보너스가 붙지 않는다', () =>
  scorePoints('and_one', 'made', true, MIRACLE) === 1 || `실제 ${scorePoints('and_one', 'made', true, MIRACLE)}`)

check('모르는 타입은 0점 (리바운드·스틸 등)', () =>
  (scorePoints('oreb', 'made', true, MIRACLE) === 0 && scorePoints('steal', null, false, MIRACLE) === 0) || '실패')

check('표준 룰에는 플러스원 보너스가 없고 자유투가 1점', () =>
  (scorePoints('shot_3p', 'made', true, STANDARD_SCORING) === 3 && scorePoints('ft_2pt', 'made', false, STANDARD_SCORING) === 1)
  || `실제 ${scorePoints('shot_3p', 'made', true, STANDARD_SCORING)} / ${scorePoints('ft_2pt', 'made', false, STANDARD_SCORING)}`)

// ── DB 이벤트 전량 대조 ─────────────────────────────
// 미라클 이벤트를 전부 읽어 모듈 계산 합계를 구한다.
// 저장값(7,108)이 아니라 룰 계산값(7,114)이 정본이다 — 저장값 6건이 잘못됐고
// 사용자 확인으로 룰이 맞다고 확정됐다(2026-08-04). Task 7 에서 저장값을 백필한다.
const rows = await query(`
  SELECT e.type, e.result,
         ((g.plus_one_player_id IS NOT NULL AND e.league_player_id = g.plus_one_player_id)
          OR (g.plus_one_player_id IS NULL AND p.plus_one)) AS is_p1
    FROM league_game_events e
    JOIN league_games   g ON g.id = e.league_game_id
    JOIN league_players p ON p.id = e.league_player_id
   WHERE g.league_id = (SELECT id FROM leagues WHERE org_slug = 'miracle')`)

const total = rows.reduce((sum, r) => sum + scorePoints(r.type, r.result, r.is_p1, MIRACLE), 0)

check(`미라클 시즌 총득점 = 7114 (룰 계산 기준)`, () =>
  total === 7114 || `기대 7114, 실제 ${total}. 경기가 추가로 기록됐다면 이 숫자를 갱신할 것`)

// ── fetchScoringRules DB 매핑 검증 ───────────────────
// scorePoints 는 순수 함수라 위에서 충분히 검증됐지만, fetchScoringRules 는
// JSON(leagues.rules) → ScoringRules 매핑을 실제 DB 값으로 한 번도 통과한 적이 없었다.
// 매핑이 깨지면(예: 필드명 오타) 표준 룰로 조용히 폴백해 미라클 커스텀 룰이 무시되는데,
// 그게 Finding 1 에서 막으려던 것과 같은 부류의 실패라 여기서 직접 찍어본다.
// repair-announcement-markdown.mjs 와 동일한 방식으로 .env.local 을 직접 읽어 client 구성
// (Management API query() 는 Supabase 클라이언트가 아니라 fetchScoringRules 에 넘길 수 없다).
const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)
const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const [{ id: miracleLeagueId } = {}] = await query(
  `SELECT id FROM leagues WHERE org_slug = 'miracle'`)

const miracleRules = miracleLeagueId
  ? await fetchScoringRules(supabase, miracleLeagueId)
  : null

check('fetchScoringRules: 미라클 리그를 찾았다', () =>
  !!miracleLeagueId || 'leagues 에 org_slug=miracle 행이 없음')

check('fetchScoringRules: DB 룰로 3점슛 플러스원 = 4점 (표준 룰 아님)', () =>
  (miracleRules && scorePoints('shot_3p', 'made', true, miracleRules) === 4)
  || `실제 ${miracleRules ? scorePoints('shot_3p', 'made', true, miracleRules) : 'null'} (표준 룰이면 3)`)

check('fetchScoringRules: DB 룰로 자유투(ft_2pt) = 2점 (표준 룰이면 1)', () =>
  (miracleRules && scorePoints('ft_2pt', 'made', false, miracleRules) === 2)
  || `실제 ${miracleRules ? scorePoints('ft_2pt', 'made', false, miracleRules) : 'null'}`)

// check() 는 동기 함수만 받으므로, 비동기 fetchScoringRules 결과는 미리 await 해두고
// 그 결과를 검사하는 동기 클로저를 넘긴다.
const missingIdRules = await fetchScoringRules(supabase, '00000000-0000-0000-0000-000000000000')
check('fetchScoringRules: 존재하지 않는 UUID 는 표준 룰로 폴백한다 (행 없음 = 정상 응답)', () =>
  (missingIdRules.event_points.ft_2pt === STANDARD_SCORING.event_points.ft_2pt) || `실제 ${JSON.stringify(missingIdRules)}`)

let invalidUuidThrew = false
try {
  await fetchScoringRules(supabase, 'not-a-uuid')
} catch {
  invalidUuidThrew = true
}
check('fetchScoringRules: 쿼리 자체가 실패하면(잘못된 UUID 형식) 조용히 폴백하지 않고 던진다', () =>
  invalidUuidThrew || '예외가 발생하지 않음 — 실패를 표준 룰로 조용히 삼켰다')

console.log(failed === 0 ? '\n전부 통과' : `\n${failed}건 실패`)
process.exitCode = failed === 0 ? 0 : 1
