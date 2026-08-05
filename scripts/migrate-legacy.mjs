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

// 선수. 레거시 players.number 는 text 이고 league_players.number 는 integer 다.
//   Step 1 에서 비숫자 등번호가 0건임을 확인했으므로 단순 캐스팅으로 충분하지만,
//   방어적으로 한 번 더 거른다 — 데이터가 나중에 늘어날 수 있다.
async function migratePlayers() {
  console.log('\n[4] 선수')
  for (const t of TEAMS) {
    const leagueId = await leagueIdFor(t.legacyTeamId)
    const [ourTeam] = await sql(
      `SELECT id FROM league_teams WHERE league_id = ${q(leagueId)} AND legacy_id = ${q(t.legacyTeamId)}`
    )
    if (!ourTeam) throw new Error(`우리 팀 행이 없다: ${t.name} — migrateTeams 를 먼저 실행했는가`)

    const rows = await sql(`
      SELECT id, name, number, position, birthdate, photo_url, height_cm, is_pro, is_active
        FROM players WHERE team_id = ${q(t.legacyTeamId)} ORDER BY name
    `)
    let made = 0
    for (const p of rows) {
      if (!/^[0-9]+$/.test(String(p.number ?? ''))) {
        throw new Error(`등번호가 숫자가 아니다: ${p.name} (${p.number}) — league_players.number 는 integer`)
      }
      const [existing] = await sql(`SELECT id FROM league_players WHERE legacy_id = ${q(p.id)}`)
      let playerId
      if (existing) {
        playerId = existing.id
      } else {
        // RETURNING 을 쓰지 않는 이유: exec 는 드라이런에서 실행하지 않으므로 id 가 없다.
        //   드라이런에서도 흐름이 끝까지 돌게 하려면 삽입 후 다시 조회하는 편이 단순하다.
        await exec(`
          INSERT INTO league_players (league_id, name, number, position, birth_date, photo_url,
                                      height_cm, is_pro, is_active, plus_one, is_guest, legacy_id)
          VALUES (${q(leagueId)}, ${q(p.name)}, ${Number(p.number)}, ${q(p.position)}, ${q(p.birthdate)},
                  ${q(p.photo_url)}, ${p.height_cm === null ? 'NULL' : Number(p.height_cm)},
                  ${q(p.is_pro)}, ${q(p.is_active)}, false, false, ${q(p.id)})
        `)
        made += 1
        if (!COMMIT) continue   // 드라이런이면 아래 연결 단계는 건너뛴다 (id 가 없다)
        const [created] = await sql(`SELECT id FROM league_players WHERE legacy_id = ${q(p.id)}`)
        playerId = created.id
      }

      // 명단 연결. league_team_players 는 (league_team_id, league_player_id) 복합키다.
      const [linked] = await sql(`
        SELECT 1 FROM league_team_players
         WHERE league_team_id = ${q(ourTeam.id)} AND league_player_id = ${q(playerId)}
      `)
      if (!linked) {
        await exec(`
          INSERT INTO league_team_players (league_team_id, league_player_id)
          VALUES (${q(ourTeam.id)}, ${q(playerId)})
        `)
      }
    }
    console.log(`  ${t.name}: 원본 ${rows.length}명 중 ${made}명 신규`)
  }
}

// 경기. 레거시는 항상 "우리 vs 상대" 이므로 우리 팀을 홈, 상대를 원정으로 고정한다.
//   실제 홈/원정 구분 정보가 원본에 없어서 임의로 정하는 것이고, 이 규칙을 어기면
//   our_score/opponent_score 가 뒤집혀 승패가 반대로 나온다.
//
// ⚠ 팀은 g.team_type 이 아니라 tournament_id → tournaments.team_id 로 유도한다.
//   50경기 전부 team_type='youth' 로 적혀 있으나 실제 장년부 경기가 14건이다.
//
// ⚠ 경기장(venue) 함정: 원본 50건 중 9건은 venue 가 NULL 이 아니라 빈 문자열('') 이다
//   (사전 실측: count(venue)=42 지만 실제 값이 있는 건 33건 — SELECT count(*) FILTER
//   (WHERE venue IS NOT NULL AND btrim(venue)='') 로 9건 확인). 빈 문자열을 그대로
//   복사하면 "채워졌다"고 셀 수 없는 값이 채워진 것처럼 카운트된다. round/ai_mvp 는
//   같은 방식으로 확인한 결과 빈 문자열이 0건이라 그대로 복사해도 안전하다.
function normalizeVenue(v) {
  if (v === null || v === undefined) return null
  const trimmed = v.trim()
  return trimmed === '' ? null : v
}

// round_num 은 대회 순번(league_quarters.ord)을 쓴다. NOT NULL 이라 비워둘 수 없고,
//   리그 규칙에 round_unit='tournament' 를 넣었으므로 "한 대회 = 한 라운드" 가 일관된 해석이다.
//   total_rounds 도 대회 수(청년 8 · 장년 4)로 맞춰 뒀다 — 출전 자격(min_round_ratio 0.3)이
//   "참가한 대회 비율" 로 계산되게 하려는 것이다. 경기일 단위로 매기면 대회 안의 경기 수가
//   들쭉날쭉해 같은 대회에 다 나온 선수끼리도 자격이 갈린다.
async function migrateGames() {
  console.log('\n[5] 경기')
  const rows = await sql(`
    SELECT g.id, g.tournament_id, g.date, g.opponent, g.venue, g.round, g.ai_mvp,
           g.our_score, g.opponent_score, g.youtube_url, g.youtube_start_offset,
           g.is_complete, tr.team_id AS legacy_team_id
      FROM games g JOIN tournaments tr ON tr.id = g.tournament_id
     ORDER BY g.date, g.id
  `)
  let made = 0
  for (const g of rows) {
    const [existing] = await sql(`SELECT id FROM league_games WHERE legacy_id = ${q(g.id)}`)
    if (existing) continue

    const leagueId = await leagueIdFor(g.legacy_team_id)
    const [ourTeam] = await sql(
      `SELECT id FROM league_teams WHERE league_id = ${q(leagueId)} AND legacy_id = ${q(g.legacy_team_id)}`
    )
    const [quarter] = await sql(`SELECT id, ord FROM league_quarters WHERE legacy_id = ${q(g.tournament_id)}`)
    if (!ourTeam || !quarter) throw new Error(`선행 행이 없다 (경기 ${g.id}) — 앞 단계를 --commit 으로 실행했는가`)

    // 상대팀. 이름이 비어 있는 경기가 있으면 원정 팀을 NULL 로 두고 넘어간다 —
    //   억지로 '미상' 같은 팀을 만들면 순위표에 유령 팀이 생긴다.
    let awayId = null
    const oppName = (g.opponent ?? '').trim()
    if (oppName) {
      const [opp] = await sql(
        `SELECT id FROM league_teams WHERE league_id = ${q(leagueId)} AND name = ${q(oppName)} AND is_external`
      )
      if (!opp) throw new Error(`외부 상대팀이 없다: "${oppName}" — migrateTeams 를 먼저 실행했는가`)
      awayId = opp.id
    }

    // slot_num — (league_id, date, slot_num) 유니크 제약이 있다. 대회는 하루에 여러 경기를
    //   치르므로 슬롯을 나눠야 한다. 메모리 카운터 대신 매번 DB 의 현재 최대값을 읽는 이유:
    //   이관이 중간에 끊겨 일부만 들어간 상태에서 재실행해도 이어서 번호가 매겨진다.
    const [slotRow] = await sql(`
      SELECT coalesce(max(slot_num), 0) + 1 AS slot FROM league_games
       WHERE league_id = ${q(leagueId)} AND date = ${q(g.date)}
    `)

    await exec(`
      INSERT INTO league_games (league_id, quarter_id, home_team_id, away_team_id, date,
                                round_num, slot_num,
                                home_score, away_score, is_complete, is_started, is_exhibition,
                                youtube_url, youtube_start_offset,
                                venue, round_label, ai_mvp, legacy_id)
      VALUES (${q(leagueId)}, ${q(quarter.id)}, ${q(ourTeam.id)}, ${awayId ? q(awayId) : 'NULL'}, ${q(g.date)},
              ${Number(quarter.ord)}, ${Number(slotRow.slot)},
              ${g.our_score === null ? 'NULL' : Number(g.our_score)},
              ${g.opponent_score === null ? 'NULL' : Number(g.opponent_score)},
              ${q(g.is_complete)}, ${q(g.is_complete)}, false,
              ${q(g.youtube_url)}, ${g.youtube_start_offset === null ? 'NULL' : Number(g.youtube_start_offset)},
              ${q(normalizeVenue(g.venue))}, ${q(g.round)},
              ${g.ai_mvp === null ? 'NULL' : `${q(JSON.stringify(g.ai_mvp))}::jsonb`},
              ${q(g.id)})
    `)
    made += 1
  }
  console.log(`  원본 ${rows.length}경기 중 ${made}경기 신규`)
}

// 이벤트. 5993행이라 왕복을 줄이려고 INSERT…SELECT 로 DB 안에서 옮긴다.
//
// team_id 배정 규칙 (league_game_events.team_id 는 반드시 채운다):
//   · 우리 선수의 이벤트        → 우리 팀(홈)
//   · opp_score (상대 득점)     → 외부 상대팀(원정). 선수는 NULL.
//   · quarter_start/end 마커     → 우리 팀(홈). 선수 NULL, 점수 0 이라 통계에 영향 없음.
//
// ⚠ points 는 저장값을 그대로 복사한다. 재계산하지 않는다 —
//   레거시 하드코딩 값이 STANDARD_SCORING 과 일치함을 실측으로 확인했고(불일치 0건),
//   opp_score 는 규칙 엔진이 모르는 타입이라 재계산하면 322점이 통째로 0이 된다.
async function migrateEvents() {
  console.log('\n[6] 이벤트')
  const [before] = await sql(`SELECT count(*)::int n FROM league_game_events WHERE legacy_id IS NOT NULL`)
  await exec(`
    INSERT INTO league_game_events
      (league_game_id, quarter, video_timestamp, type, league_player_id, result,
       related_player_id, points, team_id, shot_zone, legacy_id)
    SELECT lg.id,
           e.quarter,
           e.video_timestamp,
           e.type::text,
           lp.id,
           e.result::text,
           rp.id,
           e.points,
           CASE WHEN e.type::text = 'opp_score' THEN lg.away_team_id ELSE lg.home_team_id END,
           e.shot_zone,
           e.id
      FROM game_events e
      JOIN league_games lg   ON lg.legacy_id = e.game_id
      LEFT JOIN league_players lp ON lp.legacy_id = e.player_id
      LEFT JOIN league_players rp ON rp.legacy_id = e.related_player_id
     WHERE NOT EXISTS (SELECT 1 FROM league_game_events x WHERE x.legacy_id = e.id)
  `)
  const [after] = await sql(`SELECT count(*)::int n FROM league_game_events WHERE legacy_id IS NOT NULL`)
  console.log(`  ${before.n} → ${after.n}`)
  await restoreGameScores()
}

// ⚠ 실측으로 발견한 함정 (브리프에 없던 내용): league_game_events 에는 INSERT 마다
//   home_score/away_score 를 이벤트 합으로 재계산해 덮어쓰는 트리거
//   (trg_events_recompute_score → recompute_league_game_score)가 이미 걸려 있다.
//   리그형(미라클)에서는 "이벤트 = 유일한 득점 원천"이라 이 자동 재계산이 맞는 설계다.
//   그런데 레거시 대회형 경기는 opp_score 이벤트가 상대 득점을 전부 담고 있지 않다 —
//   총 5,993건 중 opp_score 는 177건뿐이라, 상대의 개별 득점 장면을 다 기록하지 않고
//   games.opponent_score 에 최종 스코어만 따로 적어 둔 경기가 많다. 그 결과 이벤트를
//   넣는 순간 트리거가 away_score 를 (기록된 opp_score 합) 으로 조용히 깎아내려
//   43경기의 away_score 가 원본 opponent_score 보다 작아지는 걸 실측으로 확인했다
//   (home_score 는 우리 선수 득점 이벤트가 전량 기록돼 있어 우연히 일치했다).
//   그래서 이벤트 이관 직후 league_games 의 점수를 레거시 값으로 되돌린다 —
//   이 UPDATE 는 league_games(우리가 만든 목적지 테이블)만 건드리고 legacy_id 로
//   연결된 행(=이번에 이관한 두 리그)만 좁히므로 미라클에는 영향이 없다.
async function restoreGameScores() {
  console.log('\n[6b] 경기 스코어 복원 (이벤트 삽입 트리거가 자동 재계산해 덮어쓴 값을 원본으로 되돌림)')
  await exec(`
    UPDATE league_games lg
       SET home_score = g.our_score,
           away_score = g.opponent_score
      FROM games g
     WHERE lg.legacy_id = g.id
       AND (lg.home_score IS DISTINCT FROM g.our_score OR lg.away_score IS DISTINCT FROM g.opponent_score)
  `)
}

// 출전 시간. 구조가 1:1 이라 그대로 옮긴다.
async function migrateMinutes() {
  console.log('\n[7] 출전시간')
  await exec(`
    INSERT INTO league_player_minutes (league_game_id, league_player_id, quarter, in_time, out_time)
    SELECT lg.id, lp.id, pm.quarter, pm.in_time, pm.out_time
      FROM player_minutes pm
      JOIN league_games lg   ON lg.legacy_id = pm.game_id
      JOIN league_players lp ON lp.legacy_id = pm.player_id
     WHERE NOT EXISTS (
       SELECT 1 FROM league_player_minutes x
        WHERE x.league_game_id = lg.id AND x.league_player_id = lp.id AND x.quarter = pm.quarter
     )
  `)
  const [n] = await sql(`
    SELECT count(*)::int n FROM league_player_minutes m
     JOIN league_games lg ON lg.id = m.league_game_id WHERE lg.legacy_id IS NOT NULL
  `)
  console.log(`  ${n.n}행`)
}

// 대회 참가 명단 → 세그먼트 명단. is_regular=true 로 둔다 —
//   레거시 tournament_players 는 "이 대회에 등록된 우리 선수" 라는 뜻이고,
//   리그형의 '정규 명단' 과 의미가 같다.
async function migrateTournamentPlayers() {
  console.log('\n[8] 대회 명단')
  await exec(`
    INSERT INTO league_player_quarters (league_id, quarter_id, league_player_id, team_id, is_regular)
    SELECT lq.league_id, lq.id, lp.id, ourteam.id, true
      FROM tournament_players tp
      JOIN league_quarters lq ON lq.legacy_id = tp.tournament_id
      JOIN league_players lp  ON lp.legacy_id = tp.player_id
      JOIN leagues l          ON l.id = lq.league_id
      JOIN league_teams ourteam ON ourteam.league_id = l.id AND ourteam.legacy_id = l.team_id
     WHERE NOT EXISTS (
       SELECT 1 FROM league_player_quarters x
        WHERE x.quarter_id = lq.id AND x.league_player_id = lp.id
     )
  `)
  const [n] = await sql(`
    SELECT count(*)::int n FROM league_player_quarters pq
     JOIN league_quarters lq ON lq.id = pq.quarter_id WHERE lq.legacy_id IS NOT NULL
  `)
  console.log(`  ${n.n}행`)
}

async function main() {
  console.log(COMMIT ? '=== 실제 적용 (--commit) ===' : '=== 드라이런 — 쓰기 없음 ===')
  await migrateLeagues()
  await migrateQuarters()
  await migrateTeams()
  await migratePlayers()
  await migrateGames()
  await migrateEvents()
  await migrateMinutes()
  await migrateTournamentPlayers()
  console.log(COMMIT ? '완료' : '드라이런 끝. 적용하려면 --commit')
}

main().catch((e) => { console.error(e); process.exit(1) })
