-- 027: per-player plus_one flag (replaces age-based league setting)
ALTER TABLE league_players
  ADD COLUMN IF NOT EXISTS plus_one BOOLEAN NOT NULL DEFAULT false;
