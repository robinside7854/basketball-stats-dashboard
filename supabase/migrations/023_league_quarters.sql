-- 023_league_quarters.sql
-- 분기별 팀 구성, 정규/비정규 선수, 팀 리더

-- 1. leagues에 YouTube 채널 저장
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS youtube_channel TEXT;

-- 2. 분기 테이블 (26.1Q, 26.2Q ...)
CREATE TABLE IF NOT EXISTS league_quarters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id   UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  year        INT NOT NULL,
  quarter     INT NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  is_current  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, year, quarter)
);

CREATE INDEX IF NOT EXISTS idx_league_quarters ON league_quarters(league_id, year, quarter);

-- 3. 분기별 선수 소속 (정규/비정규 + 팀 배정)
CREATE TABLE IF NOT EXISTS league_player_quarters (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id         UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  quarter_id        UUID NOT NULL REFERENCES league_quarters(id) ON DELETE CASCADE,
  league_player_id  UUID NOT NULL REFERENCES league_players(id) ON DELETE CASCADE,
  team_id           UUID REFERENCES league_teams(id) ON DELETE SET NULL,
  is_regular        BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE(quarter_id, league_player_id)
);

CREATE INDEX IF NOT EXISTS idx_lpq_quarter ON league_player_quarters(quarter_id);
CREATE INDEX IF NOT EXISTS idx_lpq_player  ON league_player_quarters(league_player_id);

-- 4. 분기별 팀 리더
CREATE TABLE IF NOT EXISTS league_team_quarter_leaders (
  quarter_id        UUID NOT NULL REFERENCES league_quarters(id) ON DELETE CASCADE,
  team_id           UUID NOT NULL REFERENCES league_teams(id) ON DELETE CASCADE,
  leader_player_id  UUID REFERENCES league_players(id) ON DELETE SET NULL,
  updated_at        TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (quarter_id, team_id)
);
