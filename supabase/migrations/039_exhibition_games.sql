-- 친선 4쿼터·2경기 모드 지원
-- league_games 에 is_exhibition 플래그 추가
-- 이 플래그가 true인 경기는 리그 순위(standings)에서 제외되며,
-- 개인 선수 스탯에는 포함된다.

ALTER TABLE league_games
ADD COLUMN IF NOT EXISTS is_exhibition BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN league_games.is_exhibition IS
  '친선 4쿼터·2경기 (리그 순위 제외 · 개인 스탯 포함). 기본 false';

-- 친선 경기 조회 최적화용 인덱스 (선택)
CREATE INDEX IF NOT EXISTS idx_league_games_is_exhibition
  ON league_games (league_id, is_exhibition) WHERE is_exhibition = true;
