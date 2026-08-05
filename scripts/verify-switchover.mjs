#!/usr/bin/env node
// 전환 게이트 — 옛 화면(대회형 레거시 API)과 새 화면(리그형 API)이 같은 숫자를 보여주는가.
//
// 단계 B(migrate-legacy.mjs)는 "데이터가 원본과 정확히 같은가"를 대조했다(원본 대비 전수
// 대조, verify-migration.mjs). 이 스크립트는 그것과 다른 질문을 묻는다 — "복사된 데이터를
// 두 화면의 실제 코드 경로(API 라우트)에 흘렸을 때 사용자에게 같은 숫자가 나오는가."
// 복사가 완벽해도 집계 코드가 opp_score·foul 같은 낯선 이벤트 타입이나 "하루에 경기가
// 여러 번 열리는" 대회 특유의 상황을 다르게 처리하면 화면 숫자가 갈라질 수 있다.
//
// 반드시 실제 API 를 호출한다 — DB 를 두 번 쿼리해서 비교하면 그건 결국 내가 짠 SQL과
// 내가 짠 SQL을 비교하는 것일 뿐 화면이 실제로 무엇을 보여주는지는 증명하지 못한다.
// DB 조회는 두 시스템의 기본키가 다른 데이터를 매칭하기 위한 id 크로스워크(레거시 id ↔
// 리그 id)와, 스탯 API 게이팅을 통과할 편집 PIN 을 읽는 데에만 쓴다 — 비교 대상인 점수·
// 득점·경기수 자체는 전부 아래 두 실행 중인 서버의 API 응답에서 나온다.
//
// 실행 전제: 이 프로젝트의 dev 서버가 떠 있어야 한다(`npm run dev -- -p <포트>`).
//   기본 포트는 3033 — 다르면 VERIFY_BASE_URL 로 지정.
//
//   VERIFY_BASE_URL=http://localhost:3033 node scripts/verify-switchover.mjs
//
// 인증 처리 — 브리프 지시대로 "가드를 우회하는 코드를 프로덕션 경로에 넣지 않는다":
//   · 레거시 /api/games, /api/stats/season 는 실제로 어떤 인증도 요구하지 않는다(코드 확인 —
//     PIN 체크가 아예 없다). 그대로 인증 없이 호출한다.
//   · 리그 /api/leagues/{id}/games 는 canViewLeague — 두 팀 모두 is_public=true 라 인증 불필요.
//   · 리그 /api/leagues/{id}/stats 는 canViewStats(승인회원 세션 또는 canEditLeague) 로 항상
//     막혀 있다(공개 여부와 무관). DB 의 leagues.edit_pin 을 읽어 X-League-Pin 헤더로 통과시킨다
//     — 이건 프로덕션이 이미 지원하는 "리그 편집 PIN" 경로(canEditLeague, 전환기 OR 게이트)를
//     정상적으로 쓰는 것이지, 가드를 약화시키거나 우회 코드를 추가하는 게 아니다.
import { query } from './lib/supabase-admin.mjs'

const BASE = process.env.VERIFY_BASE_URL ?? 'http://localhost:3033'

let failed = 0
let compared = 0
const notes = []

function record(ok, label, detail) {
  compared += 1
  console.log(`${ok ? '✔' : '✖'} ${label}`)
  if (!ok) {
    failed += 1
    console.log(`   ${detail}`)
  }
}

function note(text) {
  notes.push(text)
  console.log(`ℹ ${text}`)
}

async function fetchJson(url, headers = {}) {
  const res = await fetch(url, { headers })
  const text = await res.text()
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}\n${text.slice(0, 300)}`)
  try { return JSON.parse(text) } catch {
    throw new Error(`GET ${url} → JSON 파싱 실패\n${text.slice(0, 300)}`)
  }
}

// ── 레거시 판정 함수 그대로 옮김 (재구현 아님) ────────────────────────────
// 출처: src/app/(main)/[org]/[team]/tournaments/page.tsx:17-54
// Task 3 가 이미 같은 함수를 src/components/league/TournamentSummary.tsx 로 이식했고
// (그쪽은 필드명만 home_score/away_score/round_label 로 바뀜, ROUND_ORDER 의 '준결승' 누락
// 버그까지 의도적으로 동일하게 재현), 이 스크립트는 "두 화면이 같은 숫자를 보여주는가"를
// 보는 것이 목적이므로 원본 두 파일의 로직을 각각 그대로 복사해 실제 API 응답에 적용한다.
const ROUND_ORDER = { '결승': 5, '4강': 4, '8강': 3, '16강': 2, '조별예선': 1 }

function getTournamentSummary(games) {
  const played = games.filter(g => g.our_score > 0 || g.opponent_score > 0)
  if (played.length === 0) return null
  const wins = played.filter(g => g.our_score > g.opponent_score).length
  const losses = played.filter(g => g.our_score < g.opponent_score).length
  const record = `${wins}승 ${losses}패`
  const roundGames = played.filter(g => g.round).sort((a, b) =>
    (ROUND_ORDER[b.round] ?? 0) - (ROUND_ORDER[a.round] ?? 0))
  if (roundGames.length === 0) return { record, placement: '' }
  const topGame = roundGames[0]
  const won = topGame.our_score > topGame.opponent_score
  let placement = ''
  if (topGame.round === '결승') placement = won ? '🏆 우승' : '준우승'
  else if (!won) placement = `${topGame.round} 탈락`
  return { record, placement }
}

// 출처: src/components/league/TournamentSummary.tsx:18-54 (computePlacement)
function computePlacement(games) {
  const played = games.filter(g => g.home_score > 0 || g.away_score > 0)
  if (played.length === 0) return null
  const wins = played.filter(g => g.home_score > g.away_score).length
  const losses = played.filter(g => g.home_score < g.away_score).length
  const record = `${wins}승 ${losses}패`
  const roundGames = played.filter(g => g.round_label).sort((a, b) =>
    (ROUND_ORDER[b.round_label] ?? 0) - (ROUND_ORDER[a.round_label] ?? 0))
  if (roundGames.length === 0) return { record, placement: '' }
  const topGame = roundGames[0]
  const won = topGame.home_score > topGame.away_score
  let placement = ''
  if (topGame.round_label === '결승') placement = won ? '🏆 우승' : '준우승'
  else if (!won) placement = `${topGame.round_label} 탈락`
  return { record, placement }
}

async function main() {
  // ── id 크로스워크 (매칭 전용 — 비교값 자체는 아래 API 호출에서만 얻는다) ──
  const teams = await query(`
    SELECT t.id AS legacy_team_id, t.sub_slug, l.id AS league_id, l.slug AS league_slug, l.edit_pin
      FROM teams t JOIN leagues l ON l.team_id = t.id
     WHERE t.org_slug = 'paranalgae' AND l.mode = 'tournament'
     ORDER BY t.sub_slug
  `)
  if (teams.length !== 2) throw new Error(`대회형 리그 2개를 기대했으나 ${teams.length}개 — 크로스워크 쿼리 확인 필요`)

  console.log(`대상 서버: ${BASE}\n대상 팀: ${teams.map(t => t.sub_slug).join(', ')}\n`)

  for (const team of teams) {
    console.log(`\n════ ${team.sub_slug} (league=${team.league_slug}) ════`)
    const pinHeaders = { 'X-League-Pin': team.edit_pin }

    // ── 1) 선수별 시즌 총득점 · 경기 수 ──────────────────────────────
    console.log('\n-- 선수별 시즌 총득점 · 경기 수 --')
    const playerCrosswalk = await query(`
      SELECT p.id AS legacy_id, p.name AS legacy_name, lp.id AS league_id
        FROM players p JOIN league_players lp ON lp.legacy_id = p.id
       WHERE p.team_id = '${team.legacy_team_id}'
    `)

    const legacySeason = await fetchJson(`${BASE}/api/stats/season?team=${team.sub_slug}`)
    // (a) 명시적 unit=game — 방법론을 맞춘 1차 비교 기준
    const leagueSeasonGame = await fetchJson(`${BASE}/api/leagues/${team.league_id}/stats?unit=game`, pinHeaders)
    // (b) unit 생략 — 실제 화면(라커룸 등)이 부르는 방식과 동일. 이 스크립트가 이 태스크에서
    //     발견해 고친 mode-aware 기본값(route.ts)이 실제로 game 을 돌려주는지 회귀 확인.
    const leagueSeasonDefault = await fetchJson(`${BASE}/api/leagues/${team.league_id}/stats`, pinHeaders)
    // (c) 참고용 — 예전 기본값(round). 실패로 세지 않고 정보로만 남긴다.
    const leagueSeasonRound = await fetchJson(`${BASE}/api/leagues/${team.league_id}/stats?unit=round`, pinHeaders)

    const legacyByPid = new Map(legacySeason.players.map(p => [p.player_id, p]))
    const leagueGameByPid = new Map(leagueSeasonGame.players.map(p => [p.player_id, p]))
    const leagueDefaultByPid = new Map(leagueSeasonDefault.players.map(p => [p.player_id, p]))
    const leagueRoundByPid = new Map(leagueSeasonRound.players.map(p => [p.player_id, p]))

    for (const cw of playerCrosswalk) {
      const legacy = legacyByPid.get(cw.legacy_id)
      const leagueGame = leagueGameByPid.get(cw.league_id)
      const leagueDefault = leagueDefaultByPid.get(cw.league_id)
      const leagueRound = leagueRoundByPid.get(cw.league_id)

      if (!legacy && !leagueGame) continue // 양쪽 다 시즌 중 무기록 — 비교 대상 아님

      if (!legacy || !leagueGame) {
        record(false, `${cw.legacy_name} — 출전 기록 존재 여부 불일치`,
          `레거시: ${legacy ? '있음(pts=' + legacy.pts + ')' : '없음'} / 리그: ${leagueGame ? '있음(pts=' + leagueGame.pts + ')' : '없음'}`)
        continue
      }

      record(legacy.pts === leagueGame.pts,
        `${cw.legacy_name} — 시즌 총득점`,
        `레거시 pts=${legacy.pts} / 리그(unit=game) pts=${leagueGame.pts}`)

      record(legacy.games_played === leagueGame.gp,
        `${cw.legacy_name} — 경기 수 (unit=game 명시)`,
        `레거시 games_played=${legacy.games_played} / 리그 gp=${leagueGame.gp}`)

      // 실제 화면이 부르는 방식(unit 생략)도 unit=game 과 같은 값을 내야 한다 — 이 태스크가
      // route.ts 에 넣은 mode-aware 기본값이 실제로 동작하는지 회귀 확인.
      record(leagueDefault?.gp === leagueGame.gp,
        `${cw.legacy_name} — 경기 수 (unit 생략 = 실제 화면 기본값)`,
        `unit 생략 gp=${leagueDefault?.gp ?? '(무기록)'} / unit=game gp=${leagueGame.gp}`)

      if (leagueRound && leagueRound.gp !== leagueGame.gp) {
        note(`${cw.legacy_name} — unit=round(참고용) gp=${leagueRound.gp} vs unit=game gp=${leagueGame.gp} · ROUND 는 같은 날 여러 경기를 1로 묶어 대회형에선 항상 적거나 같다(정상, 실패 아님)`)
      }
    }

    // ── 2) 경기별 우리/상대 점수 · 3) 대회별 전적(승-패) + 최종 성적 ──
    console.log('\n-- 경기별 점수 · 대회 전적 --')
    const tournamentCrosswalk = await query(`
      SELECT tr.id AS legacy_id, tr.name, lq.id AS quarter_id
        FROM tournaments tr JOIN league_quarters lq ON lq.legacy_id = tr.id
       WHERE tr.team_id = '${team.legacy_team_id}'
       ORDER BY lq.ord
    `)

    for (const t of tournamentCrosswalk) {
      const legacyGames = await fetchJson(`${BASE}/api/games?tournamentId=${t.legacy_id}`)
      const leagueGames = await fetchJson(`${BASE}/api/leagues/${team.league_id}/games?quarterId=${t.quarter_id}`, pinHeaders)
      const leagueByLegacyId = new Map(leagueGames.map(g => [g.legacy_id, g]))

      for (const lg of legacyGames) {
        const match = leagueByLegacyId.get(lg.id)
        if (!match) {
          record(false, `[${t.name}] ${lg.date} vs ${lg.opponent} — 이관된 경기를 찾을 수 없음`, `legacy game id=${lg.id}`)
          continue
        }
        const legacyOur = lg.our_score ?? 0
        const legacyOpp = lg.opponent_score ?? 0
        record(legacyOur === match.home_score && legacyOpp === match.away_score,
          `[${t.name}] ${lg.date} vs ${lg.opponent} — 경기 점수`,
          `레거시 ${legacyOur}-${legacyOpp} / 리그 ${match.home_score}-${match.away_score}`
          + (lg.our_score === null || lg.opponent_score === null ? ' (레거시 점수 NULL → 0 취급)' : ''))
      }

      const legacySummary = getTournamentSummary(legacyGames)
      const leagueSummary = computePlacement(leagueGames)
      const legacyStr = legacySummary ? `${legacySummary.record} · ${legacySummary.placement || '(배지없음)'}` : '(경기없음)'
      const leagueStr = leagueSummary ? `${leagueSummary.record} · ${leagueSummary.placement || '(배지없음)'}` : '(경기없음)'
      record(legacyStr === leagueStr,
        `[${t.name}] 대회 전적 · 최종 성적`,
        `레거시: ${legacyStr} / 리그: ${leagueStr}`)
    }
  }

  console.log(`\n════════════════════════════════════`)
  console.log(`총 ${compared}건 대조, 실패 ${failed}건`)
  if (notes.length > 0) console.log(`참고(실패 아님) ${notes.length}건 — 위 ℹ 표시 참고`)
  if (failed > 0) {
    console.log('\n전환 게이트: 실패 — 위 ✖ 항목을 해소하기 전엔 Task 5(리다이렉트)를 시작하지 않는다.')
    process.exitCode = 1
  } else {
    console.log('\n전환 게이트: 통과')
  }
}

main().catch(e => { console.error(e); process.exitCode = 1 })
