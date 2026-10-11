-- ─────────────────────────────────────────────────────────────────
-- 백필: 전체 ≠ 분기합 의 두 원인 해결
--
-- 원인 A: league_games.quarter_id IS NULL → 전체에는 포함, 분기엔 미포함
-- 원인 B: league_game_events.team_id IS NULL → 팀별엔 미포함, 전체엔 포함
--
-- ⚠ 044_diagnose_all_vs_quarters_sum.sql 진단 결과를 먼저 확인 후 실행 권장
-- ─────────────────────────────────────────────────────────────────

BEGIN;

-- ===== 1. quarter_id 백필 =====
-- resolve_league_quarter 함수 (migration 035)를 사용해 date 기반으로 재계산
UPDATE league_games
   SET quarter_id = resolve_league_quarter(league_id, date)
 WHERE quarter_id IS NULL
   AND date IS NOT NULL;

-- 백필 결과 — 여전히 NULL인 게임이 있다면 해당 분기가 league_quarters에 없음
SELECT
  '백필 후 NULL quarter_id 게임' AS section,
  COUNT(*) AS remaining_null,
  ARRAY_AGG(DISTINCT date::text ORDER BY date::text) AS dates_missing_quarter
FROM league_games
WHERE quarter_id IS NULL
  AND date IS NOT NULL;

-- ===== 2. team_id 백필 — 우선순위 ① league_game_players (게임별 배정) =====
-- 비정규/타팀 임시 출전 매핑이 우선 (정규 분기 팀보다 우선 적용 — CLAUDE.md 가드)
UPDATE league_game_events e
   SET team_id = lgp.team_id
  FROM league_game_players lgp
 WHERE e.league_game_id    = lgp.league_game_id
   AND e.league_player_id  = lgp.league_player_id
   AND lgp.team_id IS NOT NULL
   AND e.team_id IS NULL
   AND e.league_player_id IS NOT NULL;

-- ===== 3. team_id 백필 — 우선순위 ② league_player_quarters (정규 분기 팀) =====
UPDATE league_game_events e
   SET team_id = lpq.team_id
  FROM league_games g,
       league_player_quarters lpq
 WHERE e.league_game_id     = g.id
   AND g.quarter_id         = lpq.quarter_id
   AND e.league_player_id   = lpq.league_player_id
   AND lpq.team_id IS NOT NULL
   AND e.team_id IS NULL
   AND e.league_player_id IS NOT NULL
   AND g.quarter_id IS NOT NULL;

-- ===== 4. team_id 백필 — 우선순위 ③ 같은 게임 내 동일 선수의 이미 알려진 team_id =====
-- (한 경기 안에서 같은 선수가 다른 team_id 이벤트를 가지면 그 값을 채택)
UPDATE league_game_events e
   SET team_id = sub.team_id
  FROM (
    SELECT DISTINCT ON (league_game_id, league_player_id)
      league_game_id,
      league_player_id,
      team_id
    FROM league_game_events
    WHERE team_id IS NOT NULL
      AND league_player_id IS NOT NULL
    ORDER BY league_game_id, league_player_id, team_id
  ) sub
 WHERE e.league_game_id   = sub.league_game_id
   AND e.league_player_id = sub.league_player_id
   AND e.team_id IS NULL;

-- ===== 5. 최종 검증 =====
SELECT
  '백필 후 NULL team_id 이벤트' AS section,
  COUNT(*) AS remaining_null,
  COUNT(DISTINCT league_player_id) AS affected_players
FROM league_game_events e
JOIN league_games g ON g.id = e.league_game_id
WHERE g.is_started = true
  AND e.team_id IS NULL
  AND e.league_player_id IS NOT NULL
  AND e.type NOT IN ('sub_in','sub_out');

-- ⚠ 실행 결과 확인 후 COMMIT 또는 ROLLBACK 결정
-- 자동 commit 으로 두되, 결과 보고 문제 발견 시 별도 보정 작업 진행

COMMIT;
