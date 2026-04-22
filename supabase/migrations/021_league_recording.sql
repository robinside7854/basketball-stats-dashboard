-- 021_league_recording.sql
-- 리그 경기기록 인프라: YouTube 연동 + 이벤트 로그 + 선수 출전 시간

-- 1. league_games에 YouTube 연동 컬럼 추가
ALTER TABLE league_games
  ADD COLUMN IF NOT EXISTS youtube_url TEXT,
  ADD COLUMN IF NOT EXISTS youtube_start_offset INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_started BOOLEAN DEFAULT false;

-- 2. league_game_events (game_events와 동일 구조, league_player 참조)
CREATE TABLE IF NOT EXISTS league_game_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_game_id        UUID NOT NULL REFERENCES league_games(id) ON DELETE CASCADE,
  quarter               INT NOT NULL CHECK (quarter BETWEEN 1 AND 6),
  video_timestamp       FLOAT,
  type                  TEXT NOT NULL,
  league_player_id      UUID REFERENCES league_players(id) ON DELETE SET NULL,
  result                TEXT CHECK (result IN ('made', 'missed')),
  related_player_id     UUID REFERENCES league_players(id) ON DELETE SET NULL,
  points                INT DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_league_game_events_game ON league_game_events(league_game_id);
CREATE INDEX IF NOT EXISTS idx_league_game_events_player ON league_game_events(league_player_id);

-- 3. league_player_minutes (출전 시간 추적)
CREATE TABLE IF NOT EXISTS league_player_minutes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_game_id      UUID NOT NULL REFERENCES league_games(id) ON DELETE CASCADE,
  league_player_id    UUID NOT NULL REFERENCES league_players(id) ON DELETE CASCADE,
  quarter             INT NOT NULL,
  in_time             FLOAT,
  out_time            FLOAT,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_league_player_minutes_game ON league_player_minutes(league_game_id);
