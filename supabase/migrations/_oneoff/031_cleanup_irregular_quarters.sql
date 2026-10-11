-- 기존 league_player_quarters에서 비정규(is_regular=false) 선수의 team_id를 NULL로 초기화
-- 비정규 선수 배정은 league_game_players(per-game)로만 관리함
-- 이 스크립트는 030_league_game_players.sql 실행 후 실행할 것

UPDATE league_player_quarters
SET team_id = NULL
WHERE is_regular = false
  AND team_id IS NOT NULL;
