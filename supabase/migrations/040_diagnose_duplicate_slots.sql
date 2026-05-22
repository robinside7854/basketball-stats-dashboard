-- 진단용 (읽기 전용 / 실행해도 데이터 변경 없음)
-- 같은 (league_id, date, slot_num) 조합으로 중복된 게임 확인
--
-- 1) 날짜별 슬롯 중복 카운트
SELECT
  date,
  slot_num,
  COUNT(*) AS cnt,
  ARRAY_AGG(id) AS game_ids,
  ARRAY_AGG(is_complete) AS completes,
  ARRAY_AGG(is_started)  AS starteds
FROM league_games
WHERE date >= '2026-02-01'  -- 필요 시 범위 조정
GROUP BY date, slot_num
HAVING COUNT(*) > 1
ORDER BY date DESC, slot_num NULLS FIRST;

-- 2) 특정 날짜(예: 2026-02-14) 의 모든 슬롯 상세
SELECT
  id, slot_num, round_num,
  home_team_id, away_team_id,
  home_score, away_score,
  is_complete, is_started, is_exhibition,
  (SELECT COUNT(*) FROM league_game_events e WHERE e.league_game_id = g.id) AS event_count,
  created_at
FROM league_games g
WHERE date = '2026-02-14'
ORDER BY slot_num NULLS FIRST, created_at;
