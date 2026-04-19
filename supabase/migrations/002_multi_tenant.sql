-- =============================================
-- 002_multi_tenant.sql
-- 멀티팀 지원: teams 테이블 + 데이터 격리
-- =============================================
-- 실행 순서: Supabase Dashboard → SQL Editor → 이 파일 전체 붙여넣기 후 Run
-- 기존 서비스(파란날개) 중단 없이 적용 가능
-- =============================================


-- ─────────────────────────────────────────────
-- STEP 1. teams 테이블 생성
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug      TEXT NOT NULL,          -- 조직 식별자  예) paranalgae
  sub_slug      TEXT NOT NULL,          -- 서브팀 식별자 예) youth, senior
  name          TEXT NOT NULL,          -- 표시 이름    예) 파란날개 청년부
  accent_color  TEXT DEFAULT 'blue',    -- UI 강조색
  logo_url      TEXT,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE(org_slug, sub_slug)
);

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams_public_read" ON teams FOR SELECT USING (true);
CREATE POLICY "teams_public_insert" ON teams FOR INSERT WITH CHECK (true);
CREATE POLICY "teams_public_update" ON teams FOR UPDATE USING (true);


-- ─────────────────────────────────────────────
-- STEP 2. players / tournaments 에 team_id 추가
-- ─────────────────────────────────────────────
ALTER TABLE players
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

-- 인덱스 (쿼리 속도)
CREATE INDEX IF NOT EXISTS idx_players_team_id     ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_tournaments_team_id ON tournaments(team_id);


-- ─────────────────────────────────────────────
-- STEP 3. 파란날개 팀 시드 데이터
-- ─────────────────────────────────────────────
INSERT INTO teams (org_slug, sub_slug, name, accent_color)
VALUES
  ('paranalgae', 'youth',  '파란날개 청년부', 'blue'),
  ('paranalgae', 'senior', '파란날개 장년부', 'orange')
ON CONFLICT (org_slug, sub_slug) DO NOTHING;


-- ─────────────────────────────────────────────
-- STEP 4. 기존 데이터 마이그레이션
-- 현재 DB는 youth/senior 구분 없이 통합 저장되어 있음
-- → 일단 전체를 youth 팀으로 할당
-- → 장년부 선수는 이후 Supabase Dashboard에서 수동 재할당
-- ─────────────────────────────────────────────

-- players 마이그레이션
UPDATE players
SET team_id = (
  SELECT id FROM teams
  WHERE org_slug = 'paranalgae' AND sub_slug = 'youth'
)
WHERE team_id IS NULL;

-- tournaments 마이그레이션
UPDATE tournaments
SET team_id = (
  SELECT id FROM teams
  WHERE org_slug = 'paranalgae' AND sub_slug = 'youth'
)
WHERE team_id IS NULL;


-- ─────────────────────────────────────────────
-- STEP 5. NOT NULL 제약 (기존 데이터 채운 후 적용)
-- ─────────────────────────────────────────────
ALTER TABLE players     ALTER COLUMN team_id SET NOT NULL;
ALTER TABLE tournaments ALTER COLUMN team_id SET NOT NULL;


-- ─────────────────────────────────────────────
-- STEP 6. RLS 정책 유지 (인증 도입 전까지 open)
-- 현재: URL 기반 운영 → 앱 레이어에서 team_id 필터링
-- 추후: 인증 시스템 추가 시 USING (team_id = auth_team_id()) 로 교체
-- ─────────────────────────────────────────────
-- (기존 allow_all 정책 그대로 유지, 별도 변경 없음)


-- ─────────────────────────────────────────────
-- 확인 쿼리 (실행 후 결과 확인용)
-- ─────────────────────────────────────────────
-- SELECT org_slug, sub_slug, name, id FROM teams;
-- SELECT COUNT(*), team_id FROM players GROUP BY team_id;
-- SELECT COUNT(*), team_id FROM tournaments GROUP BY team_id;
