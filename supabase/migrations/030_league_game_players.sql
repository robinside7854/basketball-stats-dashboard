-- league_game_players: 비정규 선수의 경기별 팀 배정 (날짜에만 유효)
-- 기존 league_player_quarters에 team_id를 영구 저장하던 방식을 대체
CREATE TABLE IF NOT EXISTS league_game_players (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id         UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  league_game_id    UUID NOT NULL REFERENCES league_games(id) ON DELETE CASCADE,
  league_player_id  UUID NOT NULL REFERENCES league_players(id) ON DELETE CASCADE,
  team_id           UUID NOT NULL REFERENCES league_teams(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_game_id, league_player_id)
);

ALTER TABLE league_game_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read"  ON league_game_players FOR SELECT USING (true);
CREATE POLICY "Admin write"  ON league_game_players FOR ALL    USING (true);
