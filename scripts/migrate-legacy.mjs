#!/usr/bin/env node
// 파란날개(대회형) → 리그 구조 이관. 통일 단계 B.
//
// 원칙
//   1. 레거시 원본은 읽기만 한다. games/game_events/players/tournaments 에
//      INSERT·UPDATE·DELETE 를 하지 않는다 — 문제가 생겨도 되돌릴 곳이 남아 있어야 한다.
//   2. legacy_id 로 멱등하다. 두 번 돌려도 중복이 안 생긴다(있으면 갱신).
//   3. 기본은 드라이런. 실제 쓰기는 --commit 을 줘야 한다.
//
// ⚠ games.team_type 을 쓰지 않는다. 50경기 전부 'youth' 로 적혀 있으나
//   실제 장년부 경기가 14건이다. 팀은 tournament_id → tournaments.team_id 로만 유도한다.
//
// 사용:
//   node scripts/migrate-legacy.mjs           # 드라이런 — 무엇을 할지 출력만
//   node scripts/migrate-legacy.mjs --commit  # 실제 적용
//
// db-migrate.mjs 는 runSql 을 export 하지 않는다 — db-migrate.mjs · onboard-club.mjs ·
// verify-schema.mjs 가 전부 공유하는 scripts/lib/supabase-admin.mjs 의 query() 를 그대로
// 재사용한다. 토큰 해석 로직을 복붙하면 두 벌이 되어 한쪽만 고쳐지는 날이 온다.
import { query } from './lib/supabase-admin.mjs'

const COMMIT = process.argv.includes('--commit')

// 파란날개 두 팀 — 레거시 teams.id. 하드코딩하는 이유: 이관은 일회성이고,
//   슬러그로 찾다가 엉뚱한 팀을 잡으면 남의 기록을 옮기게 된다.
const TEAMS = [
  { legacyTeamId: 'cf9bf3ce-6713-470f-ad1d-3ba3de17cc5b', slug: 'youth-2026',  name: '파란날개 청년부' },
  { legacyTeamId: '194b30d8-d7da-4d5f-8c70-750edbfb563b', slug: 'senior-2026', name: '파란날개 장년부' },
]

// 파란날개에는 나이 가산 규칙이 없다. amount 를 1로 두면(미라클 규칙) 이관된
//   과거 기록이 재계산될 때 득점이 부풀어 오른다.
const TOURNAMENT_RULES = {
  round_unit: 'tournament',
  event_points: {
    shot_3p: 3, shot_2p_mid: 2, shot_layup: 2, shot_post: 2,
    ft_2pt: 2, ft_3pt_1: 2, ft_3pt_2: 1, free_throw: 1, and_one: 1,
  },
  plus_one_bonus: { amount: 0, applies_to: ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post'] },
  qualification: { min_round_ratio: 0.3 },
}

function q(v) {
  // SQL 문자열 리터럴 이스케이프. 상대팀 이름에 작은따옴표가 들어 있을 수 있다.
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return `'${String(v).replace(/'/g, "''")}'`
}

async function sql(queryText) {
  return query(queryText)
}

async function exec(queryText) {
  if (!COMMIT) {
    console.log('  [dry-run]', queryText.replace(/\s+/g, ' ').slice(0, 200))
    return
  }
  await query(queryText)
}

// 드라이런에서는 리그를 실제로 만들지 않으므로 leagueIdFor 가 DB 에서 찾을 수 없다.
//   그렇다고 뒤 단계(대회·팀)를 건너뛰면 드라이런 출력이 리그 하나로 끝나 버려
//   무엇이 만들어질지 미리 보여준다는 목적을 못 채운다. 실제로 쓰이지 않는(그냥 sql()
//   조회에서 "없음"으로 잡히는) 자리표시자 id 를 프로세스 안에서만 기억해 이어 붙인다.
const dryRunLeagueIds = new Map()

// 리그(시즌) 2행. 대회형이므로 mode='tournament'.
async function migrateLeagues() {
  console.log('\n[1/3] 리그')
  for (const t of TEAMS) {
    const [meta] = await sql(`
      SELECT tm.edit_pin,
             (SELECT count(*)::int FROM tournaments WHERE team_id = tm.id) AS rounds,
             (SELECT min(g.date) FROM games g
                JOIN tournaments tr ON tr.id = g.tournament_id
               WHERE tr.team_id = tm.id) AS first_game
        FROM teams tm WHERE tm.id = ${q(t.legacyTeamId)}
    `)
    if (!meta) throw new Error(`레거시 팀 없음: ${t.legacyTeamId}`)
    if (!meta.edit_pin) throw new Error(`팀 ${t.name} 에 edit_pin 이 없다 — 이관 후 아무도 기록을 못 넣게 된다`)
    if (!meta.first_game) throw new Error(`팀 ${t.name} 에 경기가 없다`)

    // 이미 만든 리그가 있으면 다시 만들지 않는다 — 멱등.
    const [existing] = await sql(
      `SELECT id FROM leagues WHERE team_id = ${q(t.legacyTeamId)} AND slug = ${q(t.slug)}`
    )
    if (existing) {
      console.log(`  이미 있음: ${t.name} → ${existing.id}`)
      continue
    }

    // edit_pin 은 레거시 것을 그대로 쓴다. 새로 발급하면 파란날개 총무가
    //   쓰던 PIN 이 막혀 이관 직후 기록을 못 넣는다.
    await exec(`
      INSERT INTO leagues (org_slug, slug, name, season_year, season_type, status, mode,
                           start_date, total_rounds, edit_pin, team_id, rules)
      VALUES (${q('paranalgae')}, ${q(t.slug)}, ${q(t.name)}, 2026, ${q('annual')},
              ${q('active')}, ${q('tournament')}, ${q(meta.first_game)}, ${meta.rounds},
              ${q(meta.edit_pin)}, ${q(t.legacyTeamId)}, ${q(JSON.stringify(TOURNAMENT_RULES))}::jsonb)
    `)
    // 진짜 UUID 형식이어야 한다 — 뒤 단계 sql() 조회가 league_id(uuid 컬럼)와 비교할 때
    //   문자열 리터럴이 uuid 캐스팅에 실패하면 드라이런인데도 쿼리 에러가 난다.
    //   실제 DB 어디에도 없는 값이라 항상 "없음"으로 조회되고, 그건 드라이런의 실제 상태와 같다.
    if (!COMMIT) dryRunLeagueIds.set(t.legacyTeamId, crypto.randomUUID())
    console.log(`  생성: ${t.name} (대회 ${meta.rounds}개, 시작 ${meta.first_game})`)
  }
}

// 이후 단계가 "이 레거시 팀의 리그 id" 를 자주 필요로 하므로 한 번에 푼다.
async function leagueIdFor(legacyTeamId) {
  const t = TEAMS.find((x) => x.legacyTeamId === legacyTeamId)
  if (!t) throw new Error(`이관 대상 팀이 아니다: ${legacyTeamId}`)
  const [row] = await sql(`SELECT id FROM leagues WHERE team_id = ${q(legacyTeamId)} AND slug = ${q(t.slug)}`)
  if (row) return row.id
  // 드라이런에서는 migrateLeagues 가 실제로 쓰지 않았으므로 DB 에 없는 게 정상이다 —
  //   같은 프로세스에서 방금 만든 자리표시자 id 로 이어간다(위 dryRunLeagueIds 주석 참고).
  if (!COMMIT && dryRunLeagueIds.has(legacyTeamId)) return dryRunLeagueIds.get(legacyTeamId)
  throw new Error(`리그가 아직 없다: ${t.name} — migrateLeagues 를 먼저 --commit 으로 실행했는가`)
}

// 대회를 league_quarters(kind='tournament') 로 담는다. 새 테이블을 만들지 않는 이유는
//   076 이 이미 kind 를 일반화하며 'tournament' 를 값으로 넣어 뒀기 때문이다.
async function migrateQuarters() {
  console.log('\n[2/3] 대회 → 세그먼트')
  for (const t of TEAMS) {
    const leagueId = await leagueIdFor(t.legacyTeamId)
    // ord 는 대회의 첫 경기일 순서로 매긴다 — 화면에서 시간순으로 보이게.
    //   tournaments 에는 날짜가 없고 year 만 있어서 games 를 통해 유도한다.
    const rows = await sql(`
      SELECT tr.id, tr.name, tr.year, tr.type, tr.description,
             (SELECT min(date) FROM games WHERE tournament_id = tr.id) AS start_date,
             (SELECT max(date) FROM games WHERE tournament_id = tr.id) AS end_date
        FROM tournaments tr
       WHERE tr.team_id = ${q(t.legacyTeamId)}
       ORDER BY (SELECT min(date) FROM games WHERE tournament_id = tr.id) NULLS LAST, tr.name
    `)
    let ord = 0
    for (const r of rows) {
      ord += 1
      const [existing] = await sql(`SELECT id FROM league_quarters WHERE legacy_id = ${q(r.id)}`)
      if (existing) {
        console.log(`  이미 있음: ${r.name}`)
        continue
      }
      // quarter 컬럼은 리그형의 분기 번호다. 대회형에는 의미가 없지만 NOT NULL 이 아니므로
      //   ord 와 같은 값을 넣어 정렬 폴백으로만 쓴다.
      // name/ord 를 명시적으로 채우므로 077 의 BEFORE INSERT 트리거(NULL 일 때만 유도)와
      //   충돌하지 않는다 — 트리거는 그냥 건드리지 않고 지나간다.
      await exec(`
        INSERT INTO league_quarters (league_id, year, quarter, kind, name, ord,
                                     start_date, end_date, tournament_type, description,
                                     is_current, legacy_id)
        VALUES (${q(leagueId)}, ${r.year}, ${ord}, ${q('tournament')}, ${q(r.name)}, ${ord},
                ${q(r.start_date)}, ${q(r.end_date)}, ${q(r.type)}, ${q(r.description)},
                false, ${q(r.id)})
      `)
      console.log(`  생성: ${t.name} / ${r.name} (${r.type}, ${r.start_date}~${r.end_date})`)
    }
  }
}

// 팀은 두 종류를 만든다.
//   1) 우리 팀 — 리그당 1행. legacy_id 에 레거시 teams.id 를 남긴다.
//   2) 외부 상대팀 — games.opponent 문자열의 고유값마다 1행, is_external=true.
//      레거시는 상대를 문자열로만 갖는다(구조화된 상대 테이블은 073 에서 이미 삭제됨).
//      따라서 legacy_id 로 짝지을 원본 행이 없어, (league_id, name) 으로 중복을 막는다.
async function migrateTeams() {
  console.log('\n[3/3] 팀')
  for (const t of TEAMS) {
    const leagueId = await leagueIdFor(t.legacyTeamId)

    const [ours] = await sql(
      `SELECT id FROM league_teams WHERE league_id = ${q(leagueId)} AND legacy_id = ${q(t.legacyTeamId)}`
    )
    if (!ours) {
      const [legacy] = await sql(`SELECT name, accent_color FROM teams WHERE id = ${q(t.legacyTeamId)}`)
      await exec(`
        INSERT INTO league_teams (league_id, name, color, is_external, legacy_id)
        VALUES (${q(leagueId)}, ${q(legacy.name)}, ${q(legacy.accent_color)}, false, ${q(t.legacyTeamId)})
      `)
      console.log(`  우리 팀 생성: ${legacy.name}`)
    } else {
      console.log(`  우리 팀 이미 있음: ${t.name}`)
    }

    const opponents = await sql(`
      SELECT DISTINCT g.opponent
        FROM games g JOIN tournaments tr ON tr.id = g.tournament_id
       WHERE tr.team_id = ${q(t.legacyTeamId)} AND g.opponent IS NOT NULL AND btrim(g.opponent) <> ''
       ORDER BY 1
    `)
    let made = 0
    for (const o of opponents) {
      const name = o.opponent.trim()
      const [exists] = await sql(
        `SELECT id FROM league_teams WHERE league_id = ${q(leagueId)} AND name = ${q(name)} AND is_external`
      )
      if (exists) continue
      await exec(`
        INSERT INTO league_teams (league_id, name, color, is_external, legacy_id)
        VALUES (${q(leagueId)}, ${q(name)}, NULL, true, NULL)
      `)
      made += 1
    }
    console.log(`  외부 상대팀: ${opponents.length}팀 중 ${made}팀 신규`)
  }
}

async function main() {
  console.log(COMMIT ? '=== 실제 적용 (--commit) ===' : '=== 드라이런 — 쓰기 없음 ===')
  await migrateLeagues()
  await migrateQuarters()
  await migrateTeams()
  console.log(COMMIT ? '완료' : '드라이런 끝. 적용하려면 --commit')
}

main().catch((e) => { console.error(e); process.exit(1) })
