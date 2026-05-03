-- quarter_id가 NULL인 기존 게임들을 date 기준으로 분기에 매핑
-- league_quarters에 start_date/end_date 또는 is_current가 설정되어 있어야 동작

-- 1. 현재 quarter_id NULL 게임 현황 확인용
-- SELECT league_id, COUNT(*) FROM league_games WHERE quarter_id IS NULL GROUP BY league_id;

-- 2. NULL인 게임들에 quarter_id 백필 (트리거 함수 재사용)
UPDATE league_games
SET quarter_id = resolve_league_quarter(league_id, date)
WHERE quarter_id IS NULL
  AND date IS NOT NULL;

-- 3. 백필 후 현황 재확인
-- SELECT league_id, quarter_id, COUNT(*) FROM league_games GROUP BY league_id, quarter_id;
