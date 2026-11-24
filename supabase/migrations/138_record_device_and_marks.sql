-- 2026-11-24 운영진: 기록한 기기(PC·폰)를 남기고, 기록 중 「숏폼으로 만들 장면」을 저장한다.
ALTER TABLE league_game_events ADD COLUMN IF NOT EXISTS device text;  -- 'pc' | 'mobile'

CREATE TABLE IF NOT EXISTS league_game_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  league_game_id uuid NOT NULL REFERENCES league_games(id) ON DELETE CASCADE,
  quarter int,
  video_timestamp numeric,
  youtube_url text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS league_game_marks_league_idx ON league_game_marks(league_id, created_at);
ALTER TABLE league_game_marks ENABLE ROW LEVEL SECURITY;
