-- 홈 페이지 SSR + 자주 쓰는 API 라우트의 쿼리 성능 개선용 인덱스.
--
-- 조사 근거 (파일 · 쿼리 예시):
--   · `src/app/league/[orgSlug]/[leagueId]/page.tsx` — computeRecentRounds/computeWeeklyPOTW/computeCurrentQuarterStandings
--     · `SELECT ... FROM league_games WHERE league_id=? AND is_exhibition=false AND is_complete=true AND date BETWEEN ? AND ? ORDER BY date DESC`
--   · `src/lib/stats/leagueStats.ts`, `src/lib/stats/perDayStats.ts`
--     · `SELECT ... FROM league_games WHERE league_id=? AND is_started=true (AND quarter_id=?)`
--   · `src/app/api/leagues/[leagueId]/players/[playerId]/detail/route.ts`
--     · `SELECT ... FROM league_game_events WHERE league_game_id IN (...) AND related_player_id=? AND result='made'`
--
-- 기존 인덱스:
--   · idx_league_games_quarter (quarter_id)                — 024
--   · idx_league_games_is_exhibition (is_exhibition)       — 039
--   · idx_league_game_events_game (league_game_id)         — 021
--   · idx_league_game_events_player (league_player_id)     — 021
--   · idx_league_game_events_team (league_game_id, team_id) — 024
--   · idx_league_players_league_guest (league_id, is_guest) — 057
--
-- 추가:

-- 1) league_games(league_id, date) — 홈/스탯 라우트 대부분이 (league_id, 날짜 범위) 로 스캔.
--    date 오름차/내림 정렬도 인덱스로 해결.
CREATE INDEX IF NOT EXISTS idx_league_games_league_date
  ON league_games(league_id, date);

-- 2) league_games(league_id, is_started) — computeLeagueStats/computePerDayStats 가 항상 사용.
--    부분 인덱스로 크기 절감 (is_started=true 만 유용).
CREATE INDEX IF NOT EXISTS idx_league_games_league_started
  ON league_games(league_id) WHERE is_started = true;

-- 3) league_games(league_id, is_complete) — computeRecentRounds/computeWeeklyPOTW/badges/recompute.
CREATE INDEX IF NOT EXISTS idx_league_games_league_complete
  ON league_games(league_id) WHERE is_complete = true;

-- 4) league_game_events(related_player_id) — player detail 의 assist 조회.
--    Partial: NULL 이 대부분(어시스트 이벤트만 값 존재) → 파샬 인덱스로 극적 축소.
CREATE INDEX IF NOT EXISTS idx_league_game_events_related_player
  ON league_game_events(related_player_id) WHERE related_player_id IS NOT NULL;

-- 5) league_game_events(league_player_id, league_game_id) — player detail 이 특정 선수 x 게임집합 조회.
--    기존 `idx_league_game_events_player(league_player_id)` 만으로도 커버 가능하나,
--    복합 인덱스가 `IN (...)` 필터 + player 필터를 함께 처리해 seek 횟수 감소.
CREATE INDEX IF NOT EXISTS idx_league_game_events_player_game
  ON league_game_events(league_player_id, league_game_id);
