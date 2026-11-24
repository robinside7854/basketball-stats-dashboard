-- 2026-11-24 운영진: 숏폼 장면 저장을 기록 화면에서 하이라이트 탭으로 옮겼다 — 장면 = 기록(이벤트) 하나.
ALTER TABLE league_game_marks ADD COLUMN IF NOT EXISTS league_game_event_id uuid REFERENCES league_game_events(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX IF NOT EXISTS league_game_marks_event_uniq ON league_game_marks(league_game_event_id) WHERE league_game_event_id IS NOT NULL;
-- 기록 화면 ★ 버튼 시험으로 쌓인 행(이벤트 없음)은 지운다.
DELETE FROM league_game_marks WHERE league_game_event_id IS NULL;
