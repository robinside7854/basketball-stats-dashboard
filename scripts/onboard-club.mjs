// 신규 동호회 온보딩 — 조직 → 팀 → 시즌을 올바른 순서로 생성
//
//   node scripts/onboard-club.mjs <설정파일.json>            검증만 (기본 · dry-run)
//   node scripts/onboard-club.mjs <설정파일.json> --commit    실제 생성
//
// 예) node scripts/onboard-club.mjs scripts/onboard-samples/example-club.json
//
// 왜 스크립트인가
//   어드민의 "조직 만들기"/"리그 만들기" 버튼은 필수 항목을 빠뜨려 실패한다.
//   조직과 팀이 별개 계층이 되면서 개념 자체가 어긋났기 때문에, 패치가 아니라
//   재설계가 필요하다(단계 7 온보딩 마법사). 그때까지 운영자가 쓰는 도구가 이것이다.
//
// 계층
//   orgs(조직: 파란날개)  →  teams(팀: 청년부/장년부)  →  leagues(시즌: 2026)
//   같은 조직에 팀을 추가하는 경우 org 는 재사용된다(새로 만들지 않음).
import { readFileSync } from 'node:fs'
import { query } from './lib/supabase-admin.mjs'

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/
const MODES = ['league', 'tournament']

// leagues.rules 컬럼 기본값과 동일한 표준 룰 (마이그레이션 075/077 과 같은 값).
// 설정에서 일부만 덮어쓸 때의 베이스.
const STANDARD_RULES = {
  event_points: {
    shot_3p: 3, shot_2p_mid: 2, shot_layup: 2, shot_post: 2,
    ft_2pt: 2, ft_3pt_1: 2, ft_3pt_2: 1, free_throw: 1, and_one: 1,
  },
  plus_one_bonus: { amount: 0, applies_to: ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post'] },
  round_unit: 'game',
  qualification: { min_round_ratio: 0.3 },
  period: { count: 4, minutes: 10 },
  tracking: { fouls: true, minutes: true },
}

/**
 * 룰 병합 — 최상위 키 단위로 덮어쓴다.
 * event_points 처럼 하위 키가 많은 블록은 일부만 주면 나머지가 사라지므로,
 * 객체인 경우 한 단계 더 들어가 병합한다(배열은 통째 교체).
 */
function mergeRules(base, override) {
  const out = { ...base }
  for (const [k, v] of Object.entries(override)) {
    out[k] = (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]))
      ? { ...base[k], ...v }
      : v
  }
  return out
}

function fail(msg) {
  throw new Error(msg)
}

/** SQL 문자열 리터럴 이스케이프 — 값은 전부 이 함수를 거친다 */
function lit(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  return `'${String(v).replace(/'/g, "''")}'`
}

function validate(cfg) {
  const errors = []
  const need = (obj, path, keys) => {
    if (!obj) { errors.push(`${path} 블록이 없습니다`); return }
    for (const k of keys) if (obj[k] === undefined || obj[k] === '') errors.push(`${path}.${k} 가 비어 있습니다`)
  }

  need(cfg.org, 'org', ['slug', 'name'])
  need(cfg.team, 'team', ['slug', 'name', 'edit_pin'])
  need(cfg.season, 'season', ['slug', 'name', 'year', 'mode', 'start_date'])

  for (const [path, slug] of [['org.slug', cfg.org?.slug], ['team.slug', cfg.team?.slug], ['season.slug', cfg.season?.slug]]) {
    if (slug && !SLUG_RE.test(slug)) errors.push(`${path} '${slug}' — 영문 소문자·숫자·하이픈만 쓸 수 있습니다`)
  }
  if (cfg.season?.mode && !MODES.includes(cfg.season.mode)) {
    errors.push(`season.mode 는 ${MODES.join(' 또는 ')} 여야 합니다 (받은 값: ${cfg.season.mode})`)
  }
  if (cfg.team?.edit_pin && !/^\d{4}$/.test(String(cfg.team.edit_pin))) {
    errors.push('team.edit_pin 은 숫자 4자리여야 합니다')
  }
  if (cfg.season?.year && !/^\d{4}$/.test(String(cfg.season.year))) {
    errors.push('season.year 는 4자리 연도여야 합니다')
  }
  if (cfg.season?.start_date && !/^\d{4}-\d{2}-\d{2}$/.test(cfg.season.start_date)) {
    errors.push('season.start_date 는 YYYY-MM-DD 형식이어야 합니다')
  }
  // 대회형은 우리 팀 1개만 관리한다 — 내부 경기팀 목록은 리그형 전용
  if (cfg.season?.mode === 'tournament' && (cfg.matchTeams ?? []).length > 0) {
    errors.push('대회형(tournament)에서는 matchTeams 를 쓰지 않습니다. 상대팀은 경기 기록 중에 추가됩니다')
  }
  if (errors.length) fail('설정 오류\n  · ' + errors.join('\n  · '))
}

async function inspectExisting(cfg) {
  const [org] = await query(`SELECT id, name FROM orgs WHERE slug = ${lit(cfg.org.slug)}`)
  const [team] = org
    ? await query(`SELECT id, name FROM teams WHERE org_id = ${lit(org.id)} AND sub_slug = ${lit(cfg.team.slug)}`)
    : []
  const [season] = team
    ? await query(`SELECT id, name FROM leagues WHERE team_id = ${lit(team.id)} AND season_year = ${cfg.season.year} AND slug = ${lit(cfg.season.slug)}`)
    : []
  return { org, team, season }
}

async function main() {
  const [configPath, ...flags] = process.argv.slice(2)
  if (!configPath) {
    console.log('사용법: node scripts/onboard-club.mjs <설정파일.json> [--commit]')
    console.log('샘플  : scripts/onboard-samples/example-club.json')
    return
  }
  const commit = flags.includes('--commit')
  const cfg = JSON.parse(readFileSync(configPath, 'utf8'))

  validate(cfg)

  const existing = await inspectExisting(cfg)
  if (existing.season) {
    fail(`이미 존재하는 시즌입니다: ${cfg.org.slug}/${cfg.team.slug} ${cfg.season.year} ${cfg.season.slug}\n` +
         '  같은 시즌을 두 번 만들 수 없습니다. slug 를 바꾸거나 기존 시즌을 쓰세요.')
  }

  const matchTeams = cfg.matchTeams ?? []
  const players = cfg.players ?? []

  console.log(`\n${commit ? '실제 생성' : '검증만 (dry-run)'} — ${cfg.org.name}\n`)
  console.log(`  조직  ${cfg.org.slug.padEnd(20)} ${existing.org ? `기존 재사용 (${existing.org.name})` : '신규 생성'}`)
  console.log(`  팀    ${cfg.team.slug.padEnd(20)} ${existing.team ? `기존 재사용 (${existing.team.name})` : '신규 생성'} · ${cfg.team.name}`)
  console.log(`  시즌  ${String(cfg.season.year + '/' + cfg.season.slug).padEnd(20)} 신규 생성 · ${cfg.season.name} · ${cfg.season.mode === 'league' ? '리그형' : '대회형'}`)
  // 기본값은 공개다 — 막 만든 동호회가 자기 회원에게조차 안 보이는 쪽이 더 나쁘다.
  const isPublic = cfg.team.is_public ?? true
  console.log(`  공개  ${(isPublic ? '공개' : '비공개').padEnd(20)} ${isPublic ? '(기본값)' : '⚠ 로그인 전에는 아무것도 안 보입니다'}`)
  if (matchTeams.length) console.log(`  경기팀 ${matchTeams.length}개 — ${matchTeams.join(', ')}`)
  if (players.length) console.log(`  선수  ${players.length}명`)
  if (cfg.season.rules) console.log(`  룰    표준 룰에 ${Object.keys(cfg.season.rules).join(', ')} 덮어쓰기`)
  else console.log('  룰    표준 아마추어 농구 룰 (기본값)')

  if (!commit) {
    console.log('\n검증 통과. 실제로 만들려면 --commit 을 붙여 다시 실행하세요.')
    return
  }

  // ── 생성 (의존 순서: org → team → season → 경기팀/선수) ──
  let orgId = existing.org?.id
  if (!orgId) {
    const [row] = await query(
      `INSERT INTO orgs (slug, name, brand_color) VALUES (${lit(cfg.org.slug)}, ${lit(cfg.org.name)}, ${lit(cfg.org.brand_color ?? null)}) RETURNING id`
    )
    orgId = row.id
    console.log(`\n  ✔ 조직 생성 ${orgId}`)
  }

  let teamId = existing.team?.id
  if (!teamId) {
    const [row] = await query(
      `INSERT INTO teams (org_id, org_slug, sub_slug, name, accent_color, edit_pin, is_active, is_public)
       VALUES (${lit(orgId)}, ${lit(cfg.org.slug)}, ${lit(cfg.team.slug)}, ${lit(cfg.team.name)},
               ${lit(cfg.team.accent_color ?? '#3b82f6')}, ${lit(String(cfg.team.edit_pin))}, true, ${lit(isPublic)})
       RETURNING id`
    )
    teamId = row.id
    console.log(`  ✔ 팀 생성 ${teamId}`)
  }

  // rules: 설정에 덮어쓰기가 있으면 표준 룰과 병합해 명시 삽입,
  // 없으면 컬럼을 생략해 DB 의 DEFAULT(표준 룰)가 그대로 적용되게 둔다.
  const rulesJson = cfg.season.rules ? mergeRules(STANDARD_RULES, cfg.season.rules) : null

  const [seasonRow] = await query(
    `INSERT INTO leagues (team_id, org_slug, slug, name, season_year, start_date, mode, edit_pin${rulesJson ? ', rules' : ''})
     VALUES (${lit(teamId)}, ${lit(cfg.org.slug)}, ${lit(cfg.season.slug)}, ${lit(cfg.season.name)},
             ${cfg.season.year}, ${lit(cfg.season.start_date)}, ${lit(cfg.season.mode)},
             ${lit(String(cfg.season.edit_pin ?? cfg.team.edit_pin))}${rulesJson ? ', ' + lit(JSON.stringify(rulesJson)) + '::jsonb' : ''})
     RETURNING id`
  )
  const seasonId = seasonRow.id
  console.log(`  ✔ 시즌 생성 ${seasonId}`)

  for (const name of matchTeams) {
    await query(`INSERT INTO league_teams (league_id, name, is_external) VALUES (${lit(seasonId)}, ${lit(name)}, false)`)
  }
  if (matchTeams.length) console.log(`  ✔ 경기팀 ${matchTeams.length}개 생성`)

  for (const p of players) {
    await query(
      `INSERT INTO league_players (league_id, name, number, position)
       VALUES (${lit(seasonId)}, ${lit(p.name)}, ${lit(p.number ?? null)}, ${lit(p.position ?? null)})`
    )
  }
  if (players.length) console.log(`  ✔ 선수 ${players.length}명 생성`)

  console.log(`\n완료. 접속 주소:\n  /league/${cfg.org.slug}/${cfg.season.slug}\n`)
  console.log(`편집 PIN: ${cfg.season.edit_pin ?? cfg.team.edit_pin}`)
}

try {
  await main()
} catch (err) {
  console.error(`\n✖ ${err.message}`)
  process.exitCode = 1
}
