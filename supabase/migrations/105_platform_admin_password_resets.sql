-- 105 · 공동관리자 비밀번호 재설정 토큰 (2026-08-15)
--
-- 왜 필요한가
--   지금 공동관리자(platform_admins)가 비밀번호를 잊으면 복구 경로가 **하나도 없다**.
--     · 재초대 → 이미 계정이 있어 acceptInvite() 가 already_admin 으로 튕긴다
--     · 비활성화 후 재활성화 → disabled_at 만 지울 뿐 password_hash 는 그대로다
--   즉 DB 를 사람 손으로 고치는 것 외에 답이 없었다(어드민 콘솔 감사 2026-08-15, 03 항목).
--   CEO 가 콘솔에서 재설정 링크를 발급하고, 받은 사람이 새 비밀번호를 정하는 경로를 연다.
--
-- 왜 platform_admin_invites 를 재사용하지 않고 표를 새로 두는가
--   초대 표에 purpose 컬럼을 더해 겸용하는 방법을 먼저 검토했고, 두 가지 이유로 접었다.
--   1) fail-open 위험. checkInvite() 는 token_hash 하나로만 행을 찾는다. 겸용 표가 되면
--      재설정 토큰이 /admin/invite/[token] 에서도 조회에 걸리고, 그 화면이 accepted_at 을
--      찍어 **재설정 토큰을 엉뚱한 자리에서 태워버린다**. 이걸 막으려면 기존 초대 쿼리
--      3곳(checkInvite·listOpenInvites·createInvite)에 purpose 필터를 넣어야 한다.
--   2) 그 필터를 넣는 순간, 이 마이그레이션을 적용하기 전 배포에서는 존재하지 않는 컬럼을
--      조회하게 되어 PostgREST 42703 → **초대 기능 전체가 죽는다.** 마이그레이션 미적용
--      상태에서도 기존 기능은 살아 있어야 한다.
--   표를 나누면 097 이 세운 원칙("표에 행이 있다 = 그것이다 가 항상 참")이 그대로 유지되고,
--   미적용 배포에서는 재설정 기능만 조용히 안 될 뿐 초대·로그인은 전혀 영향받지 않는다.
--   토큰 형식·수명·1회용·sha256-only 저장은 097 초대와 완전히 같은 방식을 쓴다.
--
-- RLS
--   097 과 같다 — 켜고 정책은 만들지 않는다. 그러면 anon/authenticated 로는 한 행도 안 읽히고
--   service_role 로만 접근된다. 여기엔 재설정 토큰 해시가 들어가므로 특히 중요하다.
--
-- ⚠️ 이 파일은 작성만 하고 실행하지 않는다 (Write SQL = 사용자 명시 확인 후에만 실행,
--    CLAUDE.md 규칙). 사용자 확인 후 `scripts/db-migrate.mjs` 또는 Supabase SQL Editor 로 적용.
--
-- ── 롤백 (필요 시 이 블록만 실행) ─────────────────────────────────────────
--   DROP TABLE IF EXISTS public.platform_admin_password_resets;
--   ALTER TABLE public.platform_admins DROP COLUMN IF EXISTS password_changed_at;
--   -- 롤백해도 계정·초대는 그대로다. 재설정 기능만 사라진다.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. 재설정 토큰 ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS platform_admin_password_resets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 대상 계정. 계정을 지우면 남은 링크도 함께 죽어야 한다 → CASCADE.
  -- (platform_admins 는 삭제 대신 비활성화가 원칙이라 실제로 타는 일은 거의 없다)
  admin_id     UUID NOT NULL REFERENCES platform_admins(id) ON DELETE CASCADE,
  -- 이메일을 함께 박아두는 이유: 사후에 "누구의 링크였나"를 계정 행 없이도 읽기 위해서다.
  -- 판정은 언제나 admin_id 로 한다 — 이 컬럼은 기록용이다.
  email        TEXT NOT NULL,
  -- 토큰 원문은 저장하지 않는다. 링크에만 담기고 DB 엔 sha256 해시만 남는다.
  -- DB 가 통째로 새도 유효한 재설정 링크를 만들어낼 수 없다. (097 초대와 동일)
  token_hash   TEXT NOT NULL UNIQUE,
  -- 누가 발급했는지. FK 로 걸면 발급자를 지울 때 흔적까지 사라지므로 이메일 문자열로 남긴다.
  issued_by    TEXT,
  expires_at   TIMESTAMPTZ NOT NULL,
  used_at      TIMESTAMPTZ,   -- 1회용. 쓰이면 다시 못 쓴다
  -- 사용자의 원본 IP 대신 해시만 — 사후 추적에는 충분하고 남겨두는 개인정보는 줄인다.
  -- (097 platform_access_requests.ip_hash 와 같은 판단)
  used_ip_hash TEXT,
  revoked_at   TIMESTAMPTZ,   -- 발급하고 나서 회수한 경우
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 화면이 "이 계정에 살아 있는 링크가 있나"를 계정별로 묻는다.
CREATE INDEX IF NOT EXISTS platform_admin_password_resets_admin_idx
  ON platform_admin_password_resets (admin_id, created_at DESC);
-- 열린 링크 목록 조회 전용 부분 인덱스.
CREATE INDEX IF NOT EXISTS platform_admin_password_resets_open_idx
  ON platform_admin_password_resets (expires_at DESC)
  WHERE used_at IS NULL AND revoked_at IS NULL;

ALTER TABLE platform_admin_password_resets ENABLE ROW LEVEL SECURITY;

-- ── 2. 세션 무효화용 시각 ─────────────────────────────────────────
-- 비밀번호를 바꿔도 이미 발급된 JWT 는 최대 30일 살아 있다. 비밀번호 분실이 "누가 내 계정에
-- 들어와 있다" 는 상황과 겹칠 수 있으므로, 재설정은 옛 세션을 끊을 수 있어야 한다.
-- 세션에 심긴 로그인 시각(token.loginAt)이 이 값보다 이르면 그 세션은 죽은 것으로 본다
-- (src/lib/auth/ceo.ts requireCeoSession).
--
-- NULL 을 허용하는 이유: 기존 계정에 소급해 값을 박으면 지금 로그인해 있는 사람이 전부
-- 튕긴다. NULL = "판정 근거 없음" → 기존 동작 그대로 통과. 재설정을 한 번 하면 그때부터 켜진다.
ALTER TABLE platform_admins
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
