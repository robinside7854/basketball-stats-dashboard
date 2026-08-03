-- 리그 회원 계정에 권한(role) 추가 — 편집 권한을 PIN 에서 로그인 유저로 이관하기 위한 기반.
--
-- 배경: 기존 편집 권한은 leagues.edit_pin(4자리 평문) 하나뿐이라
--   (a) 누가 편집했는지 식별 불가, (b) /api/auth/league-pin 이 rate limit 없어 브루트포스에 무방비,
--   (c) 059_leagues_public_read.sql 의 전체 공개 SELECT 정책 탓에 anon key 로 PIN 조회 가능,
--   (d) sessionStorage 기반이라 middleware/서버 컴포넌트에서 검증 불가.
-- role='admin' 회원은 기존 PIN 과 "동일한" 편집 권한을 갖는다 (권한 세분화는 하지 않음).
--
-- ⚠ role 은 세션 쿠키(mm_auth)에 넣지 않는다. 쿠키가 30일 만료라 토큰에 실으면 권한 회수가
--   최대 30일 지연된다. src/lib/auth/leagueAdmin.ts 가 매 요청 이 컬럼을 재조회한다
--   (guard.ts 가 status 를 재확인하는 것과 같은 방식 — 강등 즉시 반영).
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 참고: league_user_accounts 의 CREATE TABLE 마이그레이션이 이 저장소에 없다
-- (Supabase 대시보드/SQL Editor 에서 직접 생성됨. 071 의 ALTER 만 존재).
-- 코드에서 역추적한 현재 컬럼 구조를 기록해둔다 — 스키마를 코드에서 읽을 수 있도록:
--
--   id                   uuid PK
--   league_id            uuid   -> leagues.id
--   league_player_id     uuid   -> league_players.id
--   login_id             text   (초기값 = 선수 이름)
--   password_hash        text   (pbkdf2 sha512 100k · "salt:hash" 형식)
--   status               text   ('pending' | 'approved' | 'rejected' | 'disabled')
--   requested_at         timestamptz
--   approved_at          timestamptz
--   approved_by          text   ('league_pin' 등 승인 주체 문자열)
--   last_login_at        timestamptz
--   last_seen_at         timestamptz  (071 에서 추가 · presence 하트비트)
--   password_changed_at  timestamptz  (null = 초기 비밀번호 미변경)
--   reset_by_admin_at    timestamptz
--   role                 text   (이 마이그레이션에서 추가)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.league_user_accounts
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'member';

-- ADD CONSTRAINT 는 IF NOT EXISTS 를 지원하지 않으므로 존재 확인 후 추가 (재실행 안전).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.league_user_accounts'::regclass
      AND conname = 'league_user_accounts_role_check'
  ) THEN
    ALTER TABLE public.league_user_accounts
      ADD CONSTRAINT league_user_accounts_role_check
      CHECK (role IN ('member', 'admin'));
  END IF;
END $$;

-- 어드민 조회는 항상 리그 단위 → 부분 인덱스로 충분 (admin 은 리그당 소수).
CREATE INDEX IF NOT EXISTS league_user_accounts_admin_idx
  ON public.league_user_accounts (league_id)
  WHERE role = 'admin';

COMMENT ON COLUMN public.league_user_accounts.role IS
  '리그 편집 권한. member=일반 회원, admin=기존 편집 PIN 과 동일한 편집 권한. '
  '승인(status=approved) 계정만 admin 이 될 수 있다. 검증은 src/lib/auth/leagueAdmin.ts.';
