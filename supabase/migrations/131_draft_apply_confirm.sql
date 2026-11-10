-- 131: 드래프트 결과는 운영진이 「리그에 반영」을 눌러야 분기 소속이 된다 (2026-11-10 운영진)
--   종전엔 픽마다 league_player_quarters 에 바로 썼다. 이제 픽은 league_draft_picks 에만 남고,
--   반영 때 한 번에 쓴다. 반영 시각·누가 했는지를 세션에 남긴다.
ALTER TABLE league_drafts
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS applied_by_label TEXT;
