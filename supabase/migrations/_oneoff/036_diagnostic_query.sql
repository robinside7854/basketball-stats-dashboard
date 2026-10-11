-- ============================================================
-- 036_diagnostic_query.sql
-- 팀 페이지 vs 선수 카드 스탯 불일치 원인 진단용 쿼리 모음
-- (실행 전 :league_id 를 실제 리그 UUID 로 교체)
-- ============================================================

-- 1. 분기별 게임 수 (is_started=true 기준 — stats API / detail API 가 사용하는 필터)
/*
SELECT
  q.year,
  q.quarter,
  g.quarter_id,
  COUNT(*)  AS game_count_is_started
FROM league_games g
JOIN league_quarters q ON q.id = g.quarter_id
WHERE g.league_id = ':league_id'
  AND g.is_started = true
GROUP BY q.year, q.quarter, g.quarter_id
ORDER BY q.year, q.quarter;
*/

-- 2. 분기별 이벤트 수 (게임 조인, is_started=true 기준)
/*
SELECT
  q.year,
  q.quarter,
  g.quarter_id,
  COUNT(e.id) AS event_count
FROM league_game_events e
JOIN league_games g ON g.id = e.league_game_id
JOIN league_quarters q ON q.id = g.quarter_id
WHERE g.league_id = ':league_id'
  AND g.is_started = true
GROUP BY q.year, q.quarter, g.quarter_id
ORDER BY q.year, q.quarter;
*/

-- 3. is_started=true vs is_complete=true 게임 수 비교 (분기별)
--    차이가 있으면 "시작했지만 마감 안 된" 게임이 있다는 의미.
--    teams 페이지 standings은 is_complete=true 기준이므로 W/L 집계에서 해당 경기가 빠짐.
--    stats API는 is_started=true 기준이므로 스탯에는 포함됨 → GP/PTS 불일치 원인.
/*
SELECT
  q.year,
  q.quarter,
  g.quarter_id,
  COUNT(*) FILTER (WHERE g.is_started  = true) AS started_count,
  COUNT(*) FILTER (WHERE g.is_complete = true) AS complete_count,
  COUNT(*) FILTER (WHERE g.is_started = true AND g.is_complete = false) AS started_not_complete
FROM league_games g
JOIN league_quarters q ON q.id = g.quarter_id
WHERE g.league_id = ':league_id'
GROUP BY q.year, q.quarter, g.quarter_id
ORDER BY q.year, q.quarter;
*/

-- 4. 전체 리그 이벤트 수 확인 (1000행 제한 도달 여부 체크)
--    total_events > 1000 이면 detail API 의 allEvents 조회가 잘렸던 것.
/*
SELECT
  COUNT(*) AS total_events
FROM league_game_events e
JOIN league_games g ON g.id = e.league_game_id
WHERE g.league_id = ':league_id'
  AND g.is_started = true
  AND e.league_player_id IS NOT NULL;
*/

-- 5. 특정 분기(quarterId) 의 이벤트 수 확인
/*
SELECT
  COUNT(*) AS events_in_quarter
FROM league_game_events e
JOIN league_games g ON g.id = e.league_game_id
WHERE g.league_id  = ':league_id'
  AND g.quarter_id = ':quarter_id'
  AND g.is_started = true
  AND e.league_player_id IS NOT NULL;
*/
