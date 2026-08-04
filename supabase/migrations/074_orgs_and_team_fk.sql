-- =============================================
-- 074_orgs_and_team_fk.sql
-- 멀티테넌트 표준화 단계 1-a — 조직 계층 신설
-- =============================================
-- 지금까지 조직은 테이블이 아니라 org_slug TEXT 관습이었다.
-- teams.org_slug 와 leagues.org_slug 가 서로 다른 네임스페이스로 놀고 있어
-- (teams=paranalgae / leagues=miracle, pana-basket-senior) 조직 단위로
-- 로고·브랜드컬러·상태를 붙일 데가 없었다.
--
-- 순수 추가다. org_slug 컬럼은 그대로 두고 org_id FK 를 나란히 놓는다.
-- 소비처가 전부 옮겨간 뒤(단계 5 이후)에 제거한다.
-- =============================================

CREATE TABLE IF NOT EXISTS orgs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  brand_color  TEXT,                                  -- 없으면 앱 기본 팔레트 사용
  logo_url     TEXT,
  status       TEXT NOT NULL DEFAULT 'active',        -- active | dormant
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orgs_public_read ON orgs;
CREATE POLICY orgs_public_read ON orgs FOR SELECT USING (true);
-- 쓰기는 service_role 전용 (어드민 API 가 admin 클라이언트로 접근)

-- 기존 조직 2개 등록
--   paranalgae : teams.org_slug 에서 유래 (청년부·장년부)
--   miracle    : leagues.org_slug 에서 유래 (teams 행이 없어 아래에서 생성)
INSERT INTO orgs (slug, name, brand_color)
VALUES
  ('paranalgae', '파란날개',       NULL),
  ('miracle',    '미라클모닝농구단', '#EAB308')
ON CONFLICT (slug) DO NOTHING;

-- teams 에 org FK 추가
ALTER TABLE teams ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES orgs(id);

UPDATE teams t
   SET org_id = o.id
  FROM orgs o
 WHERE o.slug = t.org_slug
   AND t.org_id IS NULL;

-- miracle 은 teams 행이 없다 → 생성.
--   sub_slug='main' : 서브팀 구분이 없는 조직의 단일 팀
--   edit_pin        : leagues.edit_pin 을 그대로 승계해 기존 편집 권한과 어긋나지 않게
INSERT INTO teams (org_id, org_slug, sub_slug, name, accent_color, edit_pin, is_active)
SELECT o.id, 'miracle', 'main', '미라클모닝농구단', 'yellow',
       COALESCE((SELECT l.edit_pin FROM leagues l WHERE l.org_slug = 'miracle' LIMIT 1), '0000'),
       true
  FROM orgs o
 WHERE o.slug = 'miracle'
   AND NOT EXISTS (SELECT 1 FROM teams t WHERE t.org_slug = 'miracle');

ALTER TABLE teams ALTER COLUMN org_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_teams_org_id ON teams(org_id);
