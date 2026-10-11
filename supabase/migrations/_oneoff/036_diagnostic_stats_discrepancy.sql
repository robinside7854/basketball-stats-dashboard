-- ─────────────────────────────────────────────────────────────────
-- 진단 쿼리: 팀구성 vs 선수카드 스탯 불일치 원인 파악
-- 김로빈 player_id: de588497-78ed-472c-b3b0-f2b43c63e506
-- Q1 quarter_id:   38421913-543e-48aa-b169-672a519f4ed5
-- ─────────────────────────────────────────────────────────────────

-- ── 진단 1: Q1 게임 현황 ──────────────────────────────────────────
-- stats API 방식: is_started=true AND quarter_id=Q1
SELECT
  COUNT(*) AS q1_game_count_stats_api,
  MIN(date)::text AS earliest_date,
  MAX(date)::text AS latest_date
FROM league_games
WHERE quarter_id = '38421913-543e-48aa-b169-672a519f4ed5'
  AND is_started = true;

-- ── 진단 2: 전체 이벤트 행 수 (stats API 기준) ────────────────────
SELECT COUNT(*) AS total_events_in_q1_games
FROM league_game_events e
WHERE e.league_game_id IN (
  SELECT id FROM league_games
  WHERE quarter_id = '38421913-543e-48aa-b169-672a519f4ed5'
    AND is_started = true
)
AND e.league_player_id IS NOT NULL;

-- ── 진단 3: 김로빈 Q1 이벤트 현황 ────────────────────────────────
SELECT
  COUNT(DISTINCT e.league_game_id) AS distinct_games,
  COUNT(*) AS total_events,
  SUM(CASE WHEN e.type IN ('sub_in','sub_out') THEN 1 ELSE 0 END) AS sub_events,
  SUM(CASE WHEN e.type NOT IN ('sub_in','sub_out') THEN 1 ELSE 0 END) AS stat_events,
  SUM(CASE WHEN e.type LIKE 'shot_%' THEN 1 ELSE 0 END) AS shot_attempts,
  SUM(CASE WHEN e.type = 'shot_3p' THEN 1 ELSE 0 END) AS fg3a
FROM league_game_events e
WHERE e.league_player_id = 'de588497-78ed-472c-b3b0-f2b43c63e506'
  AND e.league_game_id IN (
    SELECT id FROM league_games
    WHERE quarter_id = '38421913-543e-48aa-b169-672a519f4ed5'
      AND is_started = true
  );

-- ── 진단 4: 김로빈이 출전했지만 quarter_id가 없는 게임 확인 ─────────
SELECT
  lg.id,
  lg.date,
  lg.is_started,
  lg.quarter_id,
  COUNT(e.id) AS event_count
FROM league_games lg
JOIN league_game_events e ON e.league_game_id = lg.id
WHERE e.league_player_id = 'de588497-78ed-472c-b3b0-f2b43c63e506'
  AND lg.is_started = true
  AND (lg.quarter_id IS NULL OR lg.quarter_id != '38421913-543e-48aa-b169-672a519f4ed5')
GROUP BY lg.id, lg.date, lg.is_started, lg.quarter_id
ORDER BY lg.date;
