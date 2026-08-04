-- =============================================
-- 084_tournament_quarter_check.sql
-- 통일 단계 B — league_quarters.quarter CHECK 를 kind 별로 분리
-- =============================================
-- 076 이 league_quarters.kind 를 일반화하며 주석에 "분기(quarter)는 미라클모닝 리그의
-- 특이점이지 표준이 아니다" 라고 적어 뒀다. 그런데 CHECK(quarter BETWEEN 1 AND 4) 는
-- kind 에 상관없이 테이블 전체에 걸려 있다. 파란날개 청년부는 대회(kind='tournament')가
-- 8개라 한 해(quarter<=4)에 다 못 들어간다 — 이관 스크립트(migrate-legacy.mjs)의 5번째
-- INSERT 에서 실제로 이 제약에 걸려 멈췄다(운영 DB, 083 이후 데이터는 그대로).
--
-- kind='quarter'(미라클) 는 그대로 1~4 로 남긴다 — 화면이 "N분기"로 렌더링하는 실제 의미가
-- 있는 값이라 범위를 넓히면 미라클 쪽 의미가 흔들린다. kind='tournament' 는 076 주석대로
-- quarter 자체에 의미가 없고 실제 정렬·표시는 ord/name 이 담당하므로, 이 kind 에서만
-- 상한을 없앤다. UNIQUE(league_id, year, quarter) 는 그대로 둔다 — 대회별 quarter 값을
-- 이미 서로 다르게(ord 순서로) 채우므로 유니크 제약과는 애초에 충돌하지 않는다.

ALTER TABLE league_quarters DROP CONSTRAINT IF EXISTS league_quarters_quarter_check;
ALTER TABLE league_quarters ADD CONSTRAINT league_quarters_quarter_check
  CHECK (kind <> 'quarter' OR (quarter BETWEEN 1 AND 4));

COMMENT ON COLUMN league_quarters.quarter IS
  '리그형(kind=quarter, 미라클)의 분기 번호 1~4 — 화면에 "N분기"로 노출되는 실제 의미값. '
  '대회형(kind=tournament)에는 의미가 없고 NOT NULL + UNIQUE(league_id, year, quarter) 를 '
  '만족시키기 위한 값일 뿐이다 — 정렬·표시는 ord/name 을 쓴다.';
