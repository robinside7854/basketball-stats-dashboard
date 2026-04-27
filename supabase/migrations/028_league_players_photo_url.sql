-- 리그 선수 프로필 사진 URL 컬럼 추가
ALTER TABLE league_players
  ADD COLUMN IF NOT EXISTS photo_url TEXT;
