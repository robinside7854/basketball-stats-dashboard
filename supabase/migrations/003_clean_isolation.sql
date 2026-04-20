-- =============================================
-- 003_clean_isolation.sql
-- DB 격리 정리: team_id 단일 기준, team_type 제거
-- =============================================
-- 실행 전 조건:
--   002_multi_tenant.sql 이 이미 적용되어 있어야 함
--   (players.team_id, tournaments.team_id, teams 테이블 존재)
-- =============================================


-- ─────────────────────────────────────────────
-- STEP 1. teams 테이블 보완
-- ─────────────────────────────────────────────

-- sub_slug 인덱스 (org_slug, sub_slug 복합 조회 최적화)
CREATE INDEX IF NOT EXISTS idx_teams_org_sub ON teams(org_slug, sub_slug);

-- edit_pin 컬럼 (PIN이 env가 아닌 DB에 저장되어야 함)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS edit_pin TEXT;

-- 파란날개 기존 PIN 설정 (실제 값으로 교체 후 실행)
-- UPDATE teams SET edit_pin = 'YOUR_PIN' WHERE org_slug = 'paranalgae';


-- ─────────────────────────────────────────────
-- STEP 2. players — team_type 컬럼 제거
-- (team_id → teams(org_slug, sub_slug) 로 완전 대체)
-- ─────────────────────────────────────────────
ALTER TABLE players DROP COLUMN IF EXISTS team_type;


-- ─────────────────────────────────────────────
-- STEP 3. tournaments — team_type 컬럼 제거
-- ─────────────────────────────────────────────
ALTER TABLE tournaments DROP COLUMN IF EXISTS team_type;


-- ─────────────────────────────────────────────
-- STEP 4. 격리 확인 쿼리 (실행 후 검증)
-- ─────────────────────────────────────────────
-- -- 팀별 선수 수
-- SELECT t.org_slug, t.sub_slug, t.name, COUNT(p.id) AS player_count
-- FROM teams t
-- LEFT JOIN players p ON p.team_id = t.id
-- GROUP BY t.id, t.org_slug, t.sub_slug, t.name;
--
-- -- 팀별 대회 수
-- SELECT t.org_slug, t.sub_slug, COUNT(tn.id) AS tournament_count
-- FROM teams t
-- LEFT JOIN tournaments tn ON tn.team_id = t.id
-- GROUP BY t.id, t.org_slug, t.sub_slug;
