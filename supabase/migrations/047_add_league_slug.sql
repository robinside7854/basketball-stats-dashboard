-- ─────────────────────────────────────────────────────────────────
-- leagues 테이블에 URL slug 컬럼 추가
--
-- 목적: URL 의 UUID (예: 8eda8257-8907-4bf3-a7de-e5e7fde54a89) 를
--      사람이 읽기 좋은 슬러그 (예: 2026, 2026-1q, miracle-2026) 로 대체
--
-- 1) slug 컬럼 추가 (TEXT, nullable 로 시작)
-- 2) 기존 행 백필: season_year 기반. 동일 (org_slug, season_year) 가
--    여러 개면 -2, -3 등의 접미사로 구분
-- 3) UNIQUE (org_slug, slug) 제약
-- 4) NOT NULL 로 전환
--
-- 이후 코드에서는 URL slug → UUID 해석을 통해 양쪽 모두 받아들이도록 함.
-- ─────────────────────────────────────────────────────────────────

BEGIN;

-- 1) 컬럼 추가
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2) 백필 — 행별로 season_year 기반 슬러그, 충돌 시 -2, -3 ...
WITH ranked AS (
  SELECT
    id,
    org_slug,
    season_year,
    ROW_NUMBER() OVER (PARTITION BY org_slug, season_year ORDER BY created_at, id) AS rn,
    COUNT(*) OVER (PARTITION BY org_slug, season_year) AS cnt
  FROM leagues
  WHERE slug IS NULL
)
UPDATE leagues l
SET slug = CASE
  WHEN r.cnt = 1 THEN r.season_year::text
  ELSE r.season_year::text || '-' || r.rn::text
END
FROM ranked r
WHERE l.id = r.id;

-- 3) UNIQUE 제약 — (org_slug, slug) 조합으로 유일
--    같은 org 안에서는 슬러그 중복 불가, 다른 org 끼리는 허용
ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_org_slug_unique;
ALTER TABLE leagues ADD CONSTRAINT leagues_org_slug_unique UNIQUE (org_slug, slug);

-- 4) NOT NULL
ALTER TABLE leagues ALTER COLUMN slug SET NOT NULL;

-- 5) URL 조회용 인덱스 (이미 UNIQUE 제약이 인덱스를 만들지만 명시)
CREATE INDEX IF NOT EXISTS idx_leagues_slug_lookup ON leagues(org_slug, slug);

COMMIT;

-- ── 결과 확인 ──
SELECT org_slug, slug, name, season_year FROM leagues ORDER BY org_slug, slug;
