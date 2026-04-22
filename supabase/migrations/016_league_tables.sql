CREATE TABLE IF NOT EXISTS leagues (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug      TEXT NOT NULL,
  name          TEXT NOT NULL,
  season_year   INT NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  start_date    DATE NOT NULL,
  match_day     TEXT DEFAULT 'saturday',
  total_rounds  INT NOT NULL DEFAULT 8,
  status        TEXT DEFAULT 'upcoming',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS league_teams (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id  UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT DEFAULT '#3b82f6'
);

CREATE TABLE IF NOT EXISTS league_team_players (
  league_team_id  UUID NOT NULL REFERENCES league_teams(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (league_team_id, player_id)
);

CREATE TABLE IF NOT EXISTS league_games (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id      UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  home_team_id   UUID NOT NULL REFERENCES league_teams(id),
  away_team_id   UUID NOT NULL REFERENCES league_teams(id),
  date           DATE NOT NULL,
  round_num      INT NOT NULL,
  home_score     INT DEFAULT 0,
  away_score     INT DEFAULT 0,
  is_complete    BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);
