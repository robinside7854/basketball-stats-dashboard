-- =============================================
-- 076_segments_and_external.sql
-- 멀티테넌트 표준화 단계 1-c — 세그먼트 · 외부 팀
-- =============================================
-- 1) league_quarters 를 "시즌 내 구분(세그먼트)"으로 일반화한다.
--    분기(quarter)는 미라클모닝 리그의 특이점이지 표준이 아니다.
--    대회형은 kind='tournament' 로 개별 대회를 담는다.
--    세그먼트가 0개면 시즌 전체가 하나의 구간이다 — 신규 동호회의 기본 상태.
--
--    year 컬럼은 시즌(leagues)으로 올라갔으나 지금 제거하지 않는다.
--    league_quarters.year 를 읽는 코드가 아직 남아 있다(단계 5 이후 정리).
--
-- 2) league_teams.is_external — 대회형에서 상대팀을 구분한다.
--    집계 제외 판정을 이 컬럼 하나로만 한다. 선수에는 두지 않는다
--    (선수 소속은 팀을 통해 유도되므로 두 곳에 두면 불일치가 생긴다).
-- =============================================

ALTER TABLE league_quarters ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'quarter';
ALTER TABLE league_quarters ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE league_quarters ADD COLUMN IF NOT EXISTS ord  INT;

ALTER TABLE league_quarters DROP CONSTRAINT IF EXISTS league_quarters_kind_check;
ALTER TABLE league_quarters ADD  CONSTRAINT league_quarters_kind_check CHECK (kind IN ('quarter', 'tournament'));

-- 기존 분기에 표시 이름과 정렬 순서 부여 — '26.1Q' 형식은 현재 UI 표기와 동일하게 맞춘다
UPDATE league_quarters
   SET name = COALESCE(name, right(year::text, 2) || '.' || quarter::text || 'Q'),
       ord  = COALESCE(ord, quarter)
 WHERE name IS NULL OR ord IS NULL;

ALTER TABLE league_quarters ALTER COLUMN name SET NOT NULL;
ALTER TABLE league_quarters ALTER COLUMN ord  SET NOT NULL;

ALTER TABLE league_teams ADD COLUMN IF NOT EXISTS is_external BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_league_teams_external ON league_teams(league_id, is_external);
