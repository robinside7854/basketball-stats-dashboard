-- =============================================
-- 029: Shot Zones
-- =============================================
-- Add shot_zone column to game_events for zone-based shot location tracking.
-- Values:
--   'paint'             — restricted area / paint (auto-inferred for layup/post/drive)
--   'mid_baseline_l'    — left baseline midrange
--   'mid_elbow_l'       — left elbow
--   'mid_top'           — free throw line area (mid)
--   'mid_elbow_r'       — right elbow
--   'mid_baseline_r'    — right baseline midrange
--   '3p_corner_l'       — left corner three
--   '3p_wing_l'         — left wing three
--   '3p_top'            — top of key three
--   '3p_wing_r'         — right wing three
--   '3p_corner_r'       — right corner three
-- NULL = unknown (legacy events or recorder skipped picker)

ALTER TABLE game_events
  ADD COLUMN IF NOT EXISTS shot_zone TEXT;

CREATE INDEX IF NOT EXISTS idx_events_shot_zone ON game_events(shot_zone);

-- 리그 이벤트도 동일 스키마
ALTER TABLE league_game_events
  ADD COLUMN IF NOT EXISTS shot_zone TEXT;

CREATE INDEX IF NOT EXISTS idx_league_events_shot_zone ON league_game_events(shot_zone);
