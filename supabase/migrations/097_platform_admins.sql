-- 온볼 운영 콘솔(/admin) 공동관리자 — 초대 기반 계정 체계 (2026-08-14)
--
-- 왜 필요한가
--   지금까지 CEO 계정은 환경변수 한 쌍(ADMIN_EMAIL/ADMIN_PASSWORD)이 곧 계정이었다.
--   구조적으로 계정이 하나뿐이고, 세션의 id/name 이 '1'/'Admin' 로 고정이라
--   두 사람이 나눠 써도 누가 무엇을 했는지 구분할 방법이 없었다.
--   /admin 은 전 팀의 리그 생성·회원 승인·드래프트 초기화가 가능한 자리라
--   사람이 둘 이상이 되는 순간 신원과 회수 경로가 필요하다.
--
-- 표 셋으로 나눈 이유
--   platform_admins        = 실제 계정
--   platform_admin_invites = 아직 계정이 아닌 초대
--   platform_access_requests = 권한 없는 사람이 남긴 접근 요청
--
--   초대를 platform_admins 에 password_hash IS NULL 인 행으로 두는 방법도 있었지만
--   그러면 "이 사람이 관리자인가?" 를 묻는 모든 쿼리가 accepted_at 확인을 함께 해야 한다.
--   한 곳만 빠뜨려도 수락하지 않은 초대가 관리자로 통과하는 fail-open 이 된다.
--   표를 나누면 platform_admins 에 행이 있다 = 관리자다 가 항상 참이다.
--
-- RLS
--   league_user_accounts 와 같은 정책을 따른다 — RLS 켜고 정책은 만들지 않는다.
--   그러면 anon/authenticated 키로는 한 행도 읽히지 않고 service_role 로만 접근된다.
--   여기엔 비밀번호 해시와 초대 토큰 해시가 들어가므로 특히 중요하다.

-- ── 1. 공동관리자 계정 ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  name          TEXT,
  -- pbkdf2 (src/lib/auth/password.ts 의 hashPassword 형식). 평문을 저장하지 않는다.
  password_hash TEXT NOT NULL,
  -- 초대한 사람의 이메일을 문자열로 남긴다. FK 로 걸면 초대자를 지울 때 흔적까지 사라진다.
  invited_by    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  -- 삭제 대신 비활성화. 과거 행위 기록(created_by 등)이 가리키는 이메일이 사라지면 안 된다.
  disabled_at   TIMESTAMPTZ
);

-- 이메일은 대소문자를 구분하지 않는다. Admin@x.com 과 admin@x.com 이 별개 계정이 되면
-- 회수했다고 생각한 계정이 남아 있는 사고가 난다.
CREATE UNIQUE INDEX IF NOT EXISTS platform_admins_email_lower_key
  ON platform_admins (LOWER(email));

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

-- ── 2. 초대 ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_admin_invites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  -- 토큰 원문은 저장하지 않는다. 링크에만 담기고 DB 엔 sha256 해시만 남는다.
  -- DB 가 통째로 새도 유효한 초대 링크를 만들어낼 수 없다.
  token_hash  TEXT NOT NULL UNIQUE,
  invited_by  TEXT,
  expires_at  TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,   -- 1회용. 수락되면 다시 못 쓴다
  revoked_at  TIMESTAMPTZ,   -- 보내고 나서 취소한 경우
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS platform_admin_invites_email_idx
  ON platform_admin_invites (LOWER(email));
CREATE INDEX IF NOT EXISTS platform_admin_invites_open_idx
  ON platform_admin_invites (expires_at DESC)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;

ALTER TABLE platform_admin_invites ENABLE ROW LEVEL SECURITY;

-- ── 3. 접근 요청 ─────────────────────────────────────────────────
-- 로그인 화면에서 권한 없는 사람이 이메일만 남기는 창구.
-- 메일 알림이 실패해도 이 표에 남아 /admin 에서 확인할 수 있어야 한다 — 알림은 부가 기능이고
-- 요청 자체가 원본이다.
CREATE TABLE IF NOT EXISTS platform_access_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'invited', 'rejected')),
  -- 레이트리밋용. 원본 IP 대신 해시만 — 대조에는 충분하고 남겨두는 개인정보는 줄인다.
  ip_hash     TEXT,
  -- 알림 메일이 실제로 나간 시각. NULL 이면 요청은 접수됐지만 메일은 못 나간 것.
  notified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  handled_at  TIMESTAMPTZ,
  handled_by  TEXT
);

CREATE INDEX IF NOT EXISTS platform_access_requests_status_idx
  ON platform_access_requests (status, created_at DESC);
-- 레이트리밋이 매 요청마다 타는 조회 — 이메일/IP 기준 최근 건수
CREATE INDEX IF NOT EXISTS platform_access_requests_email_recent_idx
  ON platform_access_requests (LOWER(email), created_at DESC);
CREATE INDEX IF NOT EXISTS platform_access_requests_ip_recent_idx
  ON platform_access_requests (ip_hash, created_at DESC);

ALTER TABLE platform_access_requests ENABLE ROW LEVEL SECURITY;
