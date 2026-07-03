-- 057_league_players_is_guest.sql
--
-- 게스트 선수 플래그 컬럼 추가
--
-- 배경: 이름에 '게스트' 가 포함된 단발성 게스트가 로스터 상단·중간에 섞여
-- 정규 선수 스캔을 방해. 이름 문자열 검색 대신 DB flag 로 관리.
--
-- 정책:
--   - is_guest = TRUE → 로스터 페이지 최하단, 스탯 페이지 필터 가능
--   - 스탯 · 이벤트 · 승률 등은 정상 반영 (숨김이 아닌 정렬 순위만 뒤로)
--   - 기존 이름에 '게스트' 포함된 선수는 자동 flag TRUE

ALTER TABLE league_players
  ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT FALSE;

-- 기존 이름에 '게스트' 포함된 선수는 자동 마크
UPDATE league_players
  SET is_guest = TRUE
  WHERE name LIKE '%게스트%'
    AND is_guest = FALSE;

-- 필터 성능 최적화 (리그별 게스트 조회)
CREATE INDEX IF NOT EXISTS idx_league_players_league_guest
  ON league_players (league_id, is_guest);
