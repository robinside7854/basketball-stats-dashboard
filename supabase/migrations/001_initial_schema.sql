-- =============================================
-- Basketball Stats Dashboard - Initial Schema
-- =============================================

-- 1. 선수 테이블
CREATE TABLE IF NOT EXISTS players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number      INT NOT NULL,
  name        VARCHAR(50) NOT NULL,
  position    VARCHAR(10),
  birthdate   DATE,
  height_cm   INT,
  weight_kg   INT,
  photo_url   TEXT,
  is_active   BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- 2. 대회 테이블
CREATE TABLE IF NOT EXISTS tournaments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(100) NOT NULL,
  year        INT NOT NULL,
  type        VARCHAR(20) DEFAULT 'regular',
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 3. 경기 테이블
CREATE TABLE IF NOT EXISTS games (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id         UUID REFERENCES tournaments(id) ON DELETE CASCADE,
  date                  DATE NOT NULL,
  opponent              VARCHAR(100) NOT NULL,
  venue                 VARCHAR(100),
  youtube_url           TEXT,
  youtube_start_offset  INT DEFAULT 0,
  our_score             INT DEFAULT 0,
  opponent_score        INT DEFAULT 0,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT now()
);

-- 4. 이벤트 로그 테이블
DO $$ BEGIN
  CREATE TYPE event_type AS ENUM (
    'shot_3p',
    'shot_2p_mid',
    'shot_2p_drive',
    'free_throw',
    'oreb',
    'dreb',
    'assist',
    'steal',
    'block',
    'turnover',
    'foul',
    'opp_score',
    'sub_in',
    'sub_out',
    'quarter_start',
    'quarter_end'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE event_result AS ENUM ('made', 'missed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS game_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id           UUID REFERENCES games(id) ON DELETE CASCADE,
  quarter           INT NOT NULL CHECK (quarter BETWEEN 1 AND 6),
  video_timestamp   FLOAT,
  type              event_type NOT NULL,
  player_id         UUID REFERENCES players(id),
  result            event_result,
  related_player_id UUID REFERENCES players(id),
  points            INT DEFAULT 0,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- 5. 출전 시간 테이블
CREATE TABLE IF NOT EXISTS player_minutes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id     UUID REFERENCES games(id) ON DELETE CASCADE,
  player_id   UUID REFERENCES players(id),
  quarter     INT NOT NULL,
  in_time     FLOAT NOT NULL DEFAULT 0,
  out_time    FLOAT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_events_game_id ON game_events(game_id);
CREATE INDEX IF NOT EXISTS idx_events_player_id ON game_events(player_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON game_events(type);
CREATE INDEX IF NOT EXISTS idx_minutes_game_id ON player_minutes(game_id);
CREATE INDEX IF NOT EXISTS idx_minutes_player_id ON player_minutes(player_id);
CREATE INDEX IF NOT EXISTS idx_games_tournament_id ON games(tournament_id);

-- RLS (Row Level Security) - 초기에는 비활성화, 필요 시 활성화
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_minutes ENABLE ROW LEVEL SECURITY;

-- 전체 공개 정책 (팀 내 URL 비공개로 운영)
CREATE POLICY "allow_all_players" ON players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_tournaments" ON tournaments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_games" ON games FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_events" ON game_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_minutes" ON player_minutes FOR ALL USING (true) WITH CHECK (true);
