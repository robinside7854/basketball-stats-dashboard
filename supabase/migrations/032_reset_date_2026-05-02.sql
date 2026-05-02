-- ⚠️ 2026-05-02 날짜 경기 전체 초기화
-- 실행 전 반드시 확인: SELECT id, slot_num, home_score, away_score FROM league_games WHERE date = '2026-05-02';

-- 1. 해당 날짜 게임 ID 확인용
-- SELECT id FROM league_games WHERE date = '2026-05-02';

-- 2. 게임 이벤트 삭제
DELETE FROM league_game_events
WHERE league_game_id IN (
  SELECT id FROM league_games WHERE date = '2026-05-02'
);

-- 3. 출전 시간 기록 삭제
DELETE FROM league_player_minutes
WHERE league_game_id IN (
  SELECT id FROM league_games WHERE date = '2026-05-02'
);

-- 4. 비정규 선수 per-game 배정 삭제
DELETE FROM league_game_players
WHERE league_game_id IN (
  SELECT id FROM league_games WHERE date = '2026-05-02'
);

-- 5. 게임 상태 초기화 (점수, 시작/완료 플래그)
UPDATE league_games
SET
  is_started   = false,
  is_complete  = false,
  home_score   = 0,
  away_score   = 0,
  ai_mvp       = NULL
WHERE date = '2026-05-02';
