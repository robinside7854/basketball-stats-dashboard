-- 리그 자체 선수 명단 (기존 players 테이블과 독립)
CREATE TABLE IF NOT EXISTS league_players (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id  UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  number     INT,
  position   TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 기존 league_team_players 삭제 후 league_players 기반으로 재생성
DROP TABLE IF EXISTS league_team_players;

CREATE TABLE league_team_players (
  league_team_id   UUID NOT NULL REFERENCES league_teams(id) ON DELETE CASCADE,
  league_player_id UUID NOT NULL REFERENCES league_players(id) ON DELETE CASCADE,
  PRIMARY KEY (league_team_id, league_player_id)
);
