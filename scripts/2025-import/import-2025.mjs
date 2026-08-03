/**
 * 미라클모닝 2025 시즌 박스스코어 → Supabase 적재기.
 *
 * 원리:
 *   리그 스탯은 전부 league_game_events(play-by-play)에서 계산된다(leagueStats.ts).
 *   따라서 박스스코어를 "그 합계와 정확히 일치하는 이벤트 행"으로 합성해 넣으면
 *   스탯 · 랭킹 · 기록실 · 어워즈가 코드 수정 없이 그대로 동작한다.
 *
 * 사용:
 *   node scripts/2025-import/import-2025.mjs <파일.xlsx>            # 검증만 (기본)
 *   node scripts/2025-import/import-2025.mjs <파일.xlsx> --commit   # 실제 적재
 *
 * 안전장치:
 *   · 기본이 dry-run. --commit 없이는 DB에 아무것도 쓰지 않는다.
 *   · 2025 분기의 기존 경기가 이미 있으면 중단한다(중복 적재 방지). --replace 로 해당 분기만 삭제 후 재적재.
 *   · 2026 데이터는 어떤 경로로도 건드리지 않는다(quarter year=2025 로만 작업).
 */
import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const YEAR = 2025
const ORG_SLUG = 'miracle'

// ─── env ────────────────────────────────────────────────────────────────
function loadEnv() {
  const raw = readFileSync(resolve(ROOT, '.env.local'), 'utf8')
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[m[1]]) process.env[m[1]] = v
  }
}
loadEnv()
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// ─── args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const FILE = args.find(a => !a.startsWith('--'))
const COMMIT = args.includes('--commit')
const REPLACE = args.includes('--replace')
if (!FILE) {
  console.error('사용법: node scripts/2025-import/import-2025.mjs <파일.xlsx> [--commit] [--replace]')
  process.exit(1)
}

const errors = []
const warns = []
const err = (m) => errors.push(m)
const warn = (m) => warns.push(m)

// ─── 시트 파싱 ──────────────────────────────────────────────────────────
// ⚠ xlsx 의 ESM 빌드는 fs 가 주입되지 않아 readFile 이 동작하지 않는다 → 버퍼로 읽는다
const wb = XLSX.read(readFileSync(resolve(FILE)), { cellDates: true })

/** 머리글 행을 찾아 객체 배열로 읽는다. 안내문 몇 줄이 위에 있어도 견딘다. */
function readSheet(name, requiredHeader) {
  const ws = wb.Sheets[name]
  if (!ws) { err(`시트 [${name}] 가 없습니다`); return [] }
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, raw: true })
  const hi = grid.findIndex(r => r && String(r[0] ?? '').trim() === requiredHeader)
  if (hi < 0) { err(`시트 [${name}] 에서 머리글 '${requiredHeader}' 행을 찾지 못했습니다`); return [] }
  const header = grid[hi].map(h => String(h ?? '').trim())
  return grid.slice(hi + 1)
    .filter(r => r && r.some(c => c !== null && c !== undefined && String(c).trim() !== ''))
    .map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])))
}

const S = (v) => (v === null || v === undefined) ? '' : String(v).trim()
const N = (v) => {
  if (v === null || v === undefined || String(v).trim() === '') return 0
  const n = Number(v)
  return Number.isFinite(n) ? n : NaN
}
const isY = (v) => ['y', 'yes', 'o', 'true', '1', 'ㅇ'].includes(S(v).toLowerCase())
const toDate = (v) => {
  if (v instanceof Date) {
    const p = new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()))
    return p.toISOString().slice(0, 10)
  }
  const s = S(v)
  const m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
  if (!m) return null
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
}
const quarterOf = (iso) => Math.ceil(Number(iso.slice(5, 7)) / 3)

const rawPlayers = readSheet('1_선수', '2025선수명')
const rawTeams   = readSheet('2_팀', '분기')
const rawGames   = readSheet('3_경기', '날짜')
const rawBox     = readSheet('4_박스스코어', '날짜')
if (errors.length) { report(); process.exit(1) }

// ─── 1_선수 ─────────────────────────────────────────────────────────────
const players = []           // { name2025, name2026, position, isGuest, plusOne }
const byName2025 = new Map()
for (const r of rawPlayers) {
  const name2025 = S(r['2025선수명'])
  if (!name2025) continue
  if (byName2025.has(name2025)) { err(`[1_선수] 선수명 중복: ${name2025}`); continue }
  const p = {
    name2025,
    name2026: S(r['2026동일인']) || null,
    position: S(r['포지션']) || null,
    isGuest: isY(r['게스트여부']),
    plusOne: isY(r['플러스원']),
  }
  players.push(p)
  byName2025.set(name2025, p)
}
if (!players.length) err('[1_선수] 에 선수가 한 명도 없습니다')

// ─── 2_팀 ───────────────────────────────────────────────────────────────
const teamsByQuarter = new Map()   // q -> [{ name, color }]
const teamNames = new Set()
for (const r of rawTeams) {
  const q = N(r['분기'])
  const name = S(r['팀명'])
  if (!name) continue
  if (![1, 2, 3, 4].includes(q)) { err(`[2_팀] 분기 값이 1~4 가 아닙니다: ${S(r['분기'])} (팀 ${name})`); continue }
  if (!teamsByQuarter.has(q)) teamsByQuarter.set(q, [])
  if (teamsByQuarter.get(q).some(t => t.name === name)) { err(`[2_팀] ${q}분기에 팀명 중복: ${name}`); continue }
  teamsByQuarter.get(q).push({ name, color: S(r['색상']) || null })
  teamNames.add(name)
}
if (!teamNames.size) err('[2_팀] 에 팀이 한 개도 없습니다')

// ─── 3_경기 ─────────────────────────────────────────────────────────────
const games = new Map()      // key `${date}#${no}`
for (const r of rawGames) {
  const date = toDate(r['날짜'])
  const no = N(r['경기번호'])
  if (!date) { err(`[3_경기] 날짜 형식 오류: ${S(r['날짜'])}`); continue }
  if (!date.startsWith(String(YEAR))) { err(`[3_경기] ${YEAR}년이 아닌 날짜: ${date}`); continue }
  if (!Number.isInteger(no) || no < 1) { err(`[3_경기] 경기번호가 1 이상 정수가 아닙니다: ${date} / ${S(r['경기번호'])}`); continue }
  const key = `${date}#${no}`
  if (games.has(key)) { err(`[3_경기] 같은 날짜+경기번호 중복: ${key}`); continue }
  const home = S(r['홈팀']), away = S(r['원정팀'])
  if (!home || !away) { err(`[3_경기] 홈팀/원정팀 누락: ${key}`); continue }
  if (home === away) { err(`[3_경기] 홈팀과 원정팀이 같습니다: ${key}`); continue }
  for (const t of [home, away]) if (!teamNames.has(t)) err(`[3_경기] [2_팀]에 없는 팀명: '${t}' (${key})`)
  games.set(key, {
    key, date, no, quarter: quarterOf(date), home, away,
    homeScoreSheet: S(r['홈점수']) === '' ? null : N(r['홈점수']),
    awayScoreSheet: S(r['원정점수']) === '' ? null : N(r['원정점수']),
    exhibition: isY(r['친선전']),
    rows: [],
  })
}
if (!games.size) err('[3_경기] 에 경기가 한 개도 없습니다')

// 팀이 그 분기에 등록돼 있는지
for (const g of games.values()) {
  const qTeams = (teamsByQuarter.get(g.quarter) ?? []).map(t => t.name)
  if (!qTeams.length) { err(`[2_팀] ${g.quarter}분기 팀 구성이 없습니다 (경기 ${g.key})`); continue }
  for (const t of [g.home, g.away]) {
    if (!qTeams.includes(t)) err(`[2_팀] ${g.quarter}분기 명단에 '${t}' 가 없습니다 (경기 ${g.key})`)
  }
}

// ─── 4_박스스코어 ───────────────────────────────────────────────────────
const NUMCOLS = [
  '2점시도', '2점성공', '3점시도', '3점성공', '자유투시도', '자유투성공', '앤드원',
  '공격리바운드', '수비리바운드', '어시스트', '스틸', '블록', '턴오버',
]
const ZONECOLS = ['레이업시도', '레이업성공', '미드시도', '미드성공', '포스트시도', '포스트성공']

for (const r of rawBox) {
  const date = toDate(r['날짜'])
  const no = N(r['경기번호'])
  if (!date) { err(`[4_박스스코어] 날짜 형식 오류: ${S(r['날짜'])} / ${S(r['선수'])}`); continue }
  const key = `${date}#${no}`
  const g = games.get(key)
  if (!g) { err(`[4_박스스코어] [3_경기]에 없는 경기: ${key} (${S(r['선수'])})`); continue }

  const team = S(r['팀'])
  const name = S(r['선수'])
  if (!byName2025.has(name)) { err(`[4_박스스코어] [1_선수]에 없는 선수: '${name}' (${key})`); continue }
  if (team !== g.home && team !== g.away) {
    err(`[4_박스스코어] 이 경기의 팀이 아닙니다: '${team}' (${key}, ${g.home} vs ${g.away})`); continue
  }
  if (g.rows.some(x => x.name === name)) { err(`[4_박스스코어] 같은 경기에 같은 선수 중복: ${key} / ${name}`); continue }

  const v = {}
  for (const c of NUMCOLS) {
    const n = N(r[c])
    if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) { err(`[4_박스스코어] '${c}' 값이 0 이상 정수가 아닙니다: ${key} / ${name} = ${S(r[c])}`); v[c] = 0 }
    else v[c] = n
  }
  const zone = {}
  let zoneFilled = false
  for (const c of ZONECOLS) {
    const has = S(r[c]) !== ''
    if (has) zoneFilled = true
    zone[c] = N(r[c])
  }

  if (v['2점성공'] > v['2점시도']) err(`[4_박스스코어] 2점 성공 > 시도: ${key} / ${name}`)
  if (v['3점성공'] > v['3점시도']) err(`[4_박스스코어] 3점 성공 > 시도: ${key} / ${name}`)
  if (v['자유투성공'] > v['자유투시도']) err(`[4_박스스코어] 자유투 성공 > 시도: ${key} / ${name}`)
  if (zoneFilled) {
    const za = zone['레이업시도'] + zone['미드시도'] + zone['포스트시도']
    const zm = zone['레이업성공'] + zone['미드성공'] + zone['포스트성공']
    if (za !== v['2점시도']) err(`[4_박스스코어] 슛존 시도 합(${za}) ≠ 2점시도(${v['2점시도']}): ${key} / ${name}`)
    if (zm !== v['2점성공']) err(`[4_박스스코어] 슛존 성공 합(${zm}) ≠ 2점성공(${v['2점성공']}): ${key} / ${name}`)
  }

  // 원본 득점 대조 (플러스원 보정 포함)
  const p = byName2025.get(name)
  const bonus = p.plusOne ? (v['2점성공'] + v['3점성공']) : 0
  const calc = v['2점성공'] * 2 + v['3점성공'] * 3 + v['자유투성공'] * 2 + v['앤드원'] + bonus
  const orig = S(r['득점(원본)']) === '' ? null : N(r['득점(원본)'])
  if (orig !== null && orig !== calc) {
    warn(`득점 불일치: ${key} / ${name} — 원본 ${orig} vs 계산 ${calc}${p.plusOne ? ' (플러스원 +' + bonus + ' 반영)' : ''}`)
  }

  g.rows.push({ name, team, v, zone: zoneFilled ? zone : null, calc })
}

// 경기 단위 검증
for (const g of games.values()) {
  if (!g.rows.length) { err(`[4_박스스코어] 기록이 하나도 없는 경기: ${g.key}`); continue }
  for (const side of ['home', 'away']) {
    const t = g[side]
    const rows = g.rows.filter(r => r.team === t)
    if (!rows.length) { warn(`${g.key} — '${t}' 팀 선수 기록이 없습니다`); continue }
    const madeFG = rows.reduce((a, r) => a + r.v['2점성공'] + r.v['3점성공'], 0)
    const ast = rows.reduce((a, r) => a + r.v['어시스트'], 0)
    if (ast > madeFG) err(`[4_박스스코어] 팀 어시스트(${ast}) > 팀 야투성공(${madeFG}): ${g.key} / ${t}`)
  }
  g.homeScore = g.rows.filter(r => r.team === g.home).reduce((a, r) => a + r.calc, 0)
  g.awayScore = g.rows.filter(r => r.team === g.away).reduce((a, r) => a + r.calc, 0)
  if (g.homeScoreSheet !== null && g.homeScoreSheet !== g.homeScore) warn(`${g.key} 홈점수 불일치 — 시트 ${g.homeScoreSheet} vs 박스스코어 합 ${g.homeScore}`)
  if (g.awayScoreSheet !== null && g.awayScoreSheet !== g.awayScore) warn(`${g.key} 원정점수 불일치 — 시트 ${g.awayScoreSheet} vs 박스스코어 합 ${g.awayScore}`)
}

// ─── DB 조회 · 매핑 ─────────────────────────────────────────────────────
const { data: league } = await sb.from('leagues').select('id, name, slug').eq('org_slug', ORG_SLUG).order('season_year', { ascending: false }).limit(1).single()
if (!league) { err(`리그를 찾지 못했습니다 (org_slug=${ORG_SLUG})`); report(); process.exit(1) }
const LEAGUE_ID = league.id

const { data: dbPlayers } = await sb.from('league_players').select('id, name, plus_one').eq('league_id', LEAGUE_ID)
const dbPlayerByName = new Map((dbPlayers ?? []).map(p => [p.name, p]))
const { data: dbTeams } = await sb.from('league_teams').select('id, name').eq('league_id', LEAGUE_ID)

// 선수 매핑
const newPlayers = []
for (const p of players) {
  const link = p.name2026 || p.name2025
  const hit = dbPlayerByName.get(link)
  if (hit) { p.dbId = hit.id; p.dbPlusOne = hit.plus_one }
  else { newPlayers.push(p) }
}
// 플러스원 정합성 — 경기별 override 없이 저장하면 현재 league_players.plus_one 이 2025 에도 적용된다
for (const p of players) {
  if (p.dbId && p.plusOne !== p.dbPlusOne) {
    err(`플러스원 불일치: '${p.name2025}' — 시트=${p.plusOne ? 'Y' : 'N'} / DB(2026)=${p.dbPlusOne ? 'Y' : 'N'}. ` +
        `현재 스탯 계산은 경기별 지정이 없으면 DB 값을 그대로 쓰므로 2025 득점이 틀어집니다. 어느 쪽이 맞는지 확인 필요.`)
  }
}

// 팀 매핑 — 2026 과 같은 3개 슬롯을 재사용하고 분기별 이름은 override 로 표시
const quarterList = [...new Set([...games.values()].map(g => g.quarter))].sort()
const teamSlot = new Map()      // `${q}#${name}` -> league_teams.id
const newTeamRows = []
{
  const pool = [...(dbTeams ?? [])]
  for (const q of quarterList) {
    const list = teamsByQuarter.get(q) ?? []
    list.forEach((t, i) => {
      if (dbTeams.some(d => d.name === t.name)) { teamSlot.set(`${q}#${t.name}`, dbTeams.find(d => d.name === t.name).id); return }
      if (pool[i]) teamSlot.set(`${q}#${t.name}`, pool[i].id)
      else newTeamRows.push({ q, name: t.name, color: t.color })
    })
  }
}

// ─── 이벤트 합성 ────────────────────────────────────────────────────────
/** 박스스코어 1행 → 이벤트 배열. 어시스트는 나중에 팀 단위로 붙인다. */
function buildEvents(row, plusOne) {
  const v = row.v, out = []
  const push = (type, result, points) => out.push({ type, result, points: points ?? 0 })

  // 2점 — 슛존이 채워져 있으면 그대로, 아니면 전부 미드레인지
  const zonePlan = row.zone
    ? [['shot_layup', row.zone['레이업시도'], row.zone['레이업성공']],
       ['shot_2p_mid', row.zone['미드시도'], row.zone['미드성공']],
       ['shot_post', row.zone['포스트시도'], row.zone['포스트성공']]]
    : [['shot_2p_mid', v['2점시도'], v['2점성공']]]
  for (const [type, a, m] of zonePlan) {
    for (let i = 0; i < m; i++) push(type, 'made', plusOne ? 3 : 2)
    for (let i = 0; i < a - m; i++) push(type, 'missed', 0)
  }
  for (let i = 0; i < v['3점성공']; i++) push('shot_3p', 'made', plusOne ? 4 : 3)
  for (let i = 0; i < v['3점시도'] - v['3점성공']; i++) push('shot_3p', 'missed', 0)
  // 자유투 — 이 리그 룰: 2점슛 파울 자유투 1구 = 2점 (ft_2pt)
  for (let i = 0; i < v['자유투성공']; i++) push('ft_2pt', 'made', 2)
  for (let i = 0; i < v['자유투시도'] - v['자유투성공']; i++) push('ft_2pt', 'missed', 0)
  for (let i = 0; i < v['앤드원']; i++) push('and_one', 'made', 1)

  for (let i = 0; i < v['공격리바운드']; i++) push('oreb', null, 0)
  for (let i = 0; i < v['수비리바운드']; i++) push('dreb', null, 0)
  for (let i = 0; i < v['스틸']; i++) push('steal', null, 0)
  for (let i = 0; i < v['블록']; i++) push('block', null, 0)
  for (let i = 0; i < v['턴오버']; i++) push('turnover', null, 0)
  return out
}

const MADE_SHOT = new Set(['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post'])

/**
 * 경기 1건 → 로스터 행 + 이벤트 행.
 * ctx 로 식별자를 주입해서 dry-run(이름 그대로) 과 적재(UUID) 가 같은 코드를 타게 한다.
 */
function synthGame(g, ctx) {
  const roster = [], events = []
  for (const side of ['home', 'away']) {
    const tName = g[side]
    const tid = ctx.teamId(g.quarter, tName)
    const rows = g.rows.filter(r => r.team === tName)

    const teamEvents = []
    for (const r of rows) {
      roster.push({ league_game_id: ctx.gameId, league_player_id: ctx.playerId(r.name), team_id: tid })
      for (const e of buildEvents(r, plusOneOf(r.name))) {
        teamEvents.push({
          league_game_id: ctx.gameId, quarter: 1, video_timestamp: null,
          type: e.type, result: e.result, points: e.points,
          league_player_id: ctx.playerId(r.name), related_player_id: null, team_id: tid,
        })
      }
    }
    // 어시스트 배분 — 동료의 성공 야투에 related_player_id 로 붙인다 (자기 슛 제외)
    const pool = []
    for (const r of rows) for (let i = 0; i < r.v['어시스트']; i++) pool.push(ctx.playerId(r.name))
    if (pool.length) {
      const targets = teamEvents.filter(e => MADE_SHOT.has(e.type) && e.result === 'made')
      let ti = 0
      for (const asst of pool) {
        let placed = false
        for (let k = 0; k < targets.length; k++) {
          const t = targets[(ti + k) % targets.length]
          if (t.related_player_id === null && t.league_player_id !== asst) {
            t.related_player_id = asst; ti = (ti + k + 1) % targets.length; placed = true; break
          }
        }
        if (!placed) { err(`어시스트를 붙일 동료의 성공 야투가 부족합니다: ${g.key} / ${tName}`); break }
      }
    }
    events.push(...teamEvents)
  }
  return { roster, events }
}

const plusOneOf = (name) => byName2025.get(name).plusOne

/**
 * 합성 이벤트를 leagueStats.ts 와 동일한 규칙으로 재집계해 원본 시트와 대조한다.
 * 이게 통과해야 대시보드에 뜨는 숫자가 시트와 같다.
 */
function selfCheck(events) {
  const agg = new Map()
  const get = (k) => {
    if (!agg.has(k)) agg.set(k, { pts: 0, fga: 0, fgm: 0, fg3a: 0, fg3m: 0, fta: 0, ftm: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0 })
    return agg.get(k)
  }
  for (const e of events) {
    const s = get(e.league_player_id)
    const made = e.result === 'made'
    switch (e.type) {
      case 'shot_3p': s.fg3a++; s.fga++; if (made) { s.fg3m++; s.fgm++; s.pts += e.points } break
      case 'shot_2p_mid': case 'shot_layup': case 'shot_post':
        s.fga++; if (made) { s.fgm++; s.pts += e.points } break
      case 'and_one': if (made) s.pts += 1; break
      case 'ft_2pt': s.fta++; if (made) { s.ftm++; s.pts += 2 } break
      case 'oreb': s.oreb++; break
      case 'dreb': s.dreb++; break
      case 'steal': s.stl++; break
      case 'block': s.blk++; break
      case 'turnover': s.tov++; break
    }
    if (made && MADE_SHOT.has(e.type) && e.related_player_id) get(e.related_player_id).ast++
  }

  // 시트 원본 합계
  const sheet = new Map()
  for (const g of games.values()) for (const r of g.rows) {
    if (!sheet.has(r.name)) sheet.set(r.name, { pts: 0, fga: 0, fgm: 0, fg3a: 0, fg3m: 0, fta: 0, ftm: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, tov: 0 })
    const s = sheet.get(r.name), v = r.v
    s.pts += r.calc
    s.fga += v['2점시도'] + v['3점시도']; s.fgm += v['2점성공'] + v['3점성공']
    s.fg3a += v['3점시도']; s.fg3m += v['3점성공']
    s.fta += v['자유투시도']; s.ftm += v['자유투성공']
    s.oreb += v['공격리바운드']; s.dreb += v['수비리바운드']
    s.ast += v['어시스트']; s.stl += v['스틸']; s.blk += v['블록']; s.tov += v['턴오버']
  }

  let bad = 0
  for (const [name, s] of sheet) {
    const a = agg.get(name)
    if (!a) { err(`[정합성] '${name}' 의 이벤트가 생성되지 않았습니다`); bad++; continue }
    for (const k of Object.keys(s)) {
      if (s[k] !== a[k]) { err(`[정합성] '${name}' ${k}: 시트 ${s[k]} ≠ 합성결과 ${a[k]}`); bad++ }
    }
  }
  return bad === 0
}

function report() {
  if (warns.length) {
    console.log(`\n── 경고 ${warns.length}건 (적재는 가능하지만 확인 권장) ──`)
    for (const w of warns.slice(0, 40)) console.log('  ! ' + w)
    if (warns.length > 40) console.log(`  ... 외 ${warns.length - 40}건`)
  }
  if (errors.length) {
    console.log(`\n── 오류 ${errors.length}건 (고쳐야 적재됩니다) ──`)
    for (const e of errors.slice(0, 60)) console.log('  x ' + e)
    if (errors.length > 60) console.log(`  ... 외 ${errors.length - 60}건`)
  }
}

// 정합성 검증 — 이름을 식별자로 써서 미리 합성해보고 시트와 대조한다
const preview = []
for (const g of games.values()) {
  preview.push(...synthGame(g, {
    gameId: g.key,
    teamId: (q, name) => `${q}#${name}`,
    playerId: (name) => name,
  }).events)
}
const consistent = selfCheck(preview)

// 요약
const totalRows = [...games.values()].reduce((a, g) => a + g.rows.length, 0)
console.log('─'.repeat(70))
console.log(`리그: ${league.name} (${LEAGUE_ID})`)
console.log(`분기: ${quarterList.map(q => `${YEAR}.${q}Q`).join(', ')}`)
console.log(`경기: ${games.size}건 · 박스스코어: ${totalRows}행 · 선수: ${players.length}명(신규 ${newPlayers.length}명)`)
console.log(`합성 이벤트: ${preview.length}행 · 박스스코어 대조: ${consistent ? '일치 ✔' : '불일치 ✘'}`)
if (newTeamRows.length) console.log(`신규 팀 생성 필요: ${newTeamRows.map(t => `${t.q}Q ${t.name}`).join(', ')}`)
console.log('─'.repeat(70))

report()
if (errors.length) { console.log('\n적재 중단 — 위 오류를 수정한 뒤 다시 실행하세요.'); process.exit(1) }
if (!COMMIT) {
  console.log('\n검증 통과. 실제 적재하려면 --commit 을 붙여 다시 실행하세요.')
  process.exit(0)
}

// ─── 적재 ───────────────────────────────────────────────────────────────
const chunked = async (rows, fn, size = 500) => {
  for (let i = 0; i < rows.length; i += size) await fn(rows.slice(i, i + size))
}
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data }

// 1) 분기
const quarterId = new Map()
for (const q of quarterList) {
  const { data: ex } = await sb.from('league_quarters').select('id').eq('league_id', LEAGUE_ID).eq('year', YEAR).eq('quarter', q).maybeSingle()
  if (ex) quarterId.set(q, ex.id)
  else {
    const d = must(await sb.from('league_quarters').insert({
      league_id: LEAGUE_ID, year: YEAR, quarter: q, is_current: false,
      start_date: `${YEAR}-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`,
      end_date: `${YEAR}-${String(q * 3).padStart(2, '0')}-${q * 3 === 6 || q * 3 === 9 ? '30' : '31'}`,
    }).select('id').single())
    quarterId.set(q, d.id)
  }
}

// 중복 적재 방지
{
  const qIds = [...quarterId.values()]
  const { count } = await sb.from('league_games').select('id', { count: 'exact', head: true }).eq('league_id', LEAGUE_ID).in('quarter_id', qIds)
  if (count > 0) {
    if (!REPLACE) { console.error(`\n중단: ${YEAR} 분기에 이미 경기 ${count}건이 있습니다. 재적재하려면 --replace 를 붙이세요.`); process.exit(1) }
    const { data: old } = await sb.from('league_games').select('id').eq('league_id', LEAGUE_ID).in('quarter_id', qIds)
    const ids = (old ?? []).map(g => g.id)
    await chunked(ids, async c => { must(await sb.from('league_game_events').delete().in('league_game_id', c)) })
    await chunked(ids, async c => { must(await sb.from('league_game_players').delete().in('league_game_id', c)) })
    await chunked(ids, async c => { must(await sb.from('league_games').delete().in('id', c)) })
    console.log(`기존 ${YEAR} 경기 ${ids.length}건 삭제 후 재적재합니다.`)
  }
}

// 2) 신규 팀
for (const t of newTeamRows) {
  const d = must(await sb.from('league_teams').insert({ league_id: LEAGUE_ID, name: t.name, color: t.color ?? '#3b82f6' }).select('id').single())
  teamSlot.set(`${t.q}#${t.name}`, d.id)
}
// 분기별 팀명/색상 override
for (const q of quarterList) {
  for (const t of (teamsByQuarter.get(q) ?? [])) {
    const tid = teamSlot.get(`${q}#${t.name}`)
    must(await sb.from('league_team_quarter_overrides').upsert({
      league_id: LEAGUE_ID, quarter_id: quarterId.get(q), team_id: tid, name: t.name, color: t.color,
    }, { onConflict: 'quarter_id,team_id' }))
  }
}

// 3) 신규 선수
for (const p of newPlayers) {
  const d = must(await sb.from('league_players').insert({
    league_id: LEAGUE_ID, name: p.name2025, position: p.position,
    is_guest: p.isGuest, plus_one: p.plusOne,
  }).select('id').single())
  p.dbId = d.id
}
const pid = (name) => byName2025.get(name).dbId

// 4) 경기 · 로스터 · 이벤트
const gameRows = [...games.values()].map(g => ({
  league_id: LEAGUE_ID,
  quarter_id: quarterId.get(g.quarter),
  date: g.date,
  round_num: g.no,          // 코드상 round_num 은 '하루 안의 슬롯 번호'
  slot_num: g.no,
  home_team_id: teamSlot.get(`${g.quarter}#${g.home}`),
  away_team_id: teamSlot.get(`${g.quarter}#${g.away}`),
  home_score: g.homeScore,
  away_score: g.awayScore,
  is_started: true,
  is_complete: true,
  is_exhibition: g.exhibition,
}))
const inserted = []
await chunked(gameRows, async c => { inserted.push(...must(await sb.from('league_games').insert(c).select('id, date, slot_num'))) }, 200)
const gameId = new Map(inserted.map(r => [`${r.date}#${r.slot_num}`, r.id]))

const rosterRows = []
const eventRows = []
for (const g of games.values()) {
  const { roster, events } = synthGame(g, {
    gameId: gameId.get(g.key),
    teamId: (q, name) => teamSlot.get(`${q}#${name}`),
    playerId: pid,
  })
  rosterRows.push(...roster.map(r => ({ league_id: LEAGUE_ID, ...r })))
  eventRows.push(...events)
}
if (errors.length) { report(); throw new Error('적재 도중 정합성 오류 발생 — 중단합니다') }
await chunked(rosterRows, async c => { must(await sb.from('league_game_players').insert(c)) })
await chunked(eventRows, async c => { must(await sb.from('league_game_events').insert(c)) }, 1000)

// 5) 분기별 정규 명단 (선수 → 그 분기 최다 출전 팀)
const memberCount = new Map()   // `${q}#${playerName}#${teamName}` -> n
for (const g of games.values()) {
  for (const r of g.rows) {
    const k = `${g.quarter}#${r.name}#${r.team}`
    memberCount.set(k, (memberCount.get(k) ?? 0) + 1)
  }
}
const best = new Map()          // `${q}#${name}` -> { team, n }
for (const [k, n] of memberCount) {
  const [q, name, team] = k.split('#')
  const kk = `${q}#${name}`
  if (!best.has(kk) || best.get(kk).n < n) best.set(kk, { team, n })
}
const memberRows = [...best.entries()].map(([kk, v]) => {
  const [q, name] = kk.split('#')
  return {
    league_id: LEAGUE_ID, quarter_id: quarterId.get(Number(q)),
    league_player_id: pid(name), team_id: teamSlot.get(`${q}#${v.team}`), is_regular: true,
  }
})
await chunked(memberRows, async c => {
  must(await sb.from('league_player_quarters').upsert(c, { onConflict: 'quarter_id,league_player_id' }))
})

console.log(`\n적재 완료 — 경기 ${inserted.length} · 이벤트 ${eventRows.length} · 로스터 ${rosterRows.length} · 분기명단 ${memberRows.length}`)
console.log('리그 대시보드 분기 탭에서 ' + quarterList.map(q => `${String(YEAR).slice(2)}.${q}Q`).join(' / ') + ' 를 확인하세요.')
