-- 022_league_schedule_redesign.sql
-- 일정 = 날짜만, 팀 매칭은 기록 시점에 결정

-- 1. 날짜만 저장하는 일정 테이블
CREATE TABLE IF NOT EXISTS league_schedule_dates (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id  UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(league_id, date)
);

CREATE INDEX IF NOT EXISTS idx_league_schedule_dates ON league_schedule_dates(league_id, date ASC);

-- 2. league_games: 팀은 기록 시점에 지정하므로 nullable
ALTER TABLE league_games ALTER COLUMN home_team_id DROP NOT NULL;
ALTER TABLE league_games ALTER COLUMN away_team_id DROP NOT NULL;

-- 3. slot_num: 해당 날짜 내 몇 번째 경기인지 (round_num을 재활용하지 않고 별도 컬럼)
ALTER TABLE league_games ADD COLUMN IF NOT EXISTS slot_num INT DEFAULT 1;
