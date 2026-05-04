-- ─────────────────────────────────────────────────────────────────
-- stats API 집계 로직 직접 시뮬레이션
-- 김로빈 player_id: de588497-78ed-472c-b3b0-f2b43c63e506
-- Q1 quarter_id:   38421913-543e-48aa-b169-672a519f4ed5
-- ─────────────────────────────────────────────────────────────────

-- ── 진단 A: stats API 방식으로 직접 GP 계산 ─────────────────────
-- (sub_in/sub_out 제외, Q1 게임 기준)
SELECT
  COUNT(DISTINCT e.league_game_id) AS gp_stats_api_method,
  SUM(CASE WHEN e.type IN ('shot_3p','shot_2p_mid','shot_layup','shot_post','shot_2p_drive') THEN 1 ELSE 0 END) AS fga,
  SUM(CASE WHEN e.type = 'shot_3p' AND e.result = 'made' THEN 1 ELSE 0 END) AS fg3m,
  SUM(CASE WHEN e.type = 'shot_3p' THEN 1 ELSE 0 END) AS fg3a,
  COUNT(*) AS total_events
FROM league_game_events e
WHERE e.league_player_id = 'de588497-78ed-472c-b3b0-f2b43c63e506'
  AND e.type NOT IN ('sub_in', 'sub_out')
  AND e.league_game_id IN (
    SELECT id FROM league_games
    WHERE quarter_id = '38421913-543e-48aa-b169-672a519f4ed5'
      AND is_started = true
  );

-- ── 진단 B: 전체 Q1 이벤트 수 (limit 테스트) ────────────────────
SELECT COUNT(*) AS total_q1_events_no_null_player
FROM league_game_events e
WHERE e.league_game_id IN (
  SELECT id FROM league_games
  WHERE quarter_id = '38421913-543e-48aa-b169-672a519f4ed5'
    AND is_started = true
)
AND e.league_player_id IS NOT NULL;

-- ── 진단 C: LIMIT 20000 걸었을 때 김로빈 이벤트가 포함되는지 ────
-- stats API의 실제 동작 시뮬레이션 (최초 20000행 안에 김로빈 있는지)
SELECT COUNT(*) AS robin_events_in_first_20000
FROM (
  SELECT e.league_player_id
  FROM league_game_events e
  WHERE e.league_game_id IN (
    SELECT id FROM league_games
    WHERE quarter_id = '38421913-543e-48aa-b169-672a519f4ed5'
      AND is_started = true
  )
  AND e.league_player_id IS NOT NULL
  LIMIT 20000
) sub
WHERE sub.league_player_id = 'de588497-78ed-472c-b3b0-f2b43c63e506';

-- ── 진단 D: LIMIT 20000 걸었을 때 김로빈 distinct_games ─────────
SELECT COUNT(DISTINCT sub.league_game_id) AS robin_gp_with_limit_20000
FROM (
  SELECT e.league_player_id, e.league_game_id, e.type
  FROM league_game_events e
  WHERE e.league_game_id IN (
    SELECT id FROM league_games
    WHERE quarter_id = '38421913-543e-48aa-b169-672a519f4ed5'
      AND is_started = true
  )
  AND e.league_player_id IS NOT NULL
  LIMIT 20000
) sub
WHERE sub.league_player_id = 'de588497-78ed-472c-b3b0-f2b43c63e506'
  AND sub.type NOT IN ('sub_in', 'sub_out');
