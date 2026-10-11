-- ─────────────────────────────────────────────────────────────────
-- 가설: stats API가 is_complete=true 로 실행되고 있는지 확인
-- is_complete=true 인 Q1 게임에서의 김로빈 스탯이 GP=16, FGA=35인지 체크
-- ─────────────────────────────────────────────────────────────────

-- ── 확인 1: is_complete=true 인 Q1 게임 수 ───────────────────────
SELECT COUNT(*) AS q1_complete_games
FROM league_games
WHERE quarter_id = '38421913-543e-48aa-b169-672a519f4ed5'
  AND is_complete = true;

-- ── 확인 2: is_complete=true Q1 게임에서 김로빈 스탯 ────────────────
SELECT
  COUNT(DISTINCT e.league_game_id) AS gp_complete_only,
  SUM(CASE WHEN e.type IN ('shot_3p','shot_2p_mid','shot_layup','shot_post','shot_2p_drive') THEN 1 ELSE 0 END) AS fga,
  SUM(CASE WHEN e.type IN ('shot_3p','shot_2p_mid','shot_layup','shot_post','shot_2p_drive') AND e.result='made' THEN 1 ELSE 0 END) AS fgm
FROM league_game_events e
WHERE e.league_player_id = 'de588497-78ed-472c-b3b0-f2b43c63e506'
  AND e.type NOT IN ('sub_in', 'sub_out')
  AND e.league_game_id IN (
    SELECT id FROM league_games
    WHERE quarter_id = '38421913-543e-48aa-b169-672a519f4ed5'
      AND is_complete = true   -- is_complete 필터 (구버전 stats API 방식)
  );
