-- 106 · 파괴적 운영 행위 공용 감사 로그 (2026-08-15)
--
-- 왜 필요한가
--   공동관리자가 둘 이상이 된 시점(097)부터, "누가 무엇을 지웠는지" 를 사후에 알 방법이
--   전혀 없다. 지금 기록이 안 남는 것들:
--     · 리그 삭제 · 팀 삭제 · 경기 초기화
--     · 이벤트 수정·삭제 · 일정 재생성
--     · 회원 어드민 승격 · 편집 PIN 재발급
--     · 드래프트 생성·삭제·초기화
--   이미 남는 것은 공동관리자 로그인(platform_admins.last_login_at)과 접근 요청 처리
--   (platform_access_requests.handled_by) 둘뿐이다.
--
--   리그 스탯은 league_game_events 재집계로만 만들어지므로(021), 이벤트가 사라지면
--   시즌 기록이 통째로 소멸한다. 되돌릴 수 없는 행위인데 행위자가 안 남는 상태였다.
--
-- 행위자 종류(actor_kind)를 왜 컬럼으로 따로 두는가 — 이 표의 핵심
--   기존에 유일하게 행위자를 남기던 곳(league_drafts.created_by)은 CEO 세션일 때만
--   이메일이 찍히고, 리그 PIN·감독관 코드로 만들면 NULL 이 된다. "기록이 있는 것처럼
--   보이지만 비어 있는" 최악의 형태다. 원인은 인증 경로가 다섯 갈래인데 기록 칸이
--   이메일 하나뿐이었다는 것이다:
--     ceo             — 부트스트랩 소유자 계정(ADMIN_EMAIL)
--     platform_admin  — 초대로 만들어진 공동관리자(platform_admins)
--     league_admin    — 팀 어드민 회원 세션(league_user_accounts.role='admin')
--     league_pin      — 리그 편집 PIN (4자리 공유 비밀)
--     manager_code    — 드래프트 단장 코드
--     supervisor_code — 드래프트 감독관 코드
--     team_pin        — 팀 편집 PIN (대회 전용 팀)
--   그래서 종류를 명시적으로 남기고, PIN 으로 들어온 행위도 NULL 이 아니라
--   actor_kind='league_pin' + actor_label='리그 PIN (미라클)' 로 기록한다.
--   "누구인지 특정 못 함" 과 "PIN 이라 특정할 수 없는 게 정상" 은 다른 사실이다.
--
-- ⚠ 비밀값은 절대 넣지 않는다
--   PIN 원문·비밀번호·드래프트 코드 평문·share_token 원문은 어떤 컬럼에도 저장하지 않는다.
--   PIN 계열 행위자는 "PIN 으로 인증됐다" 는 사실과 그 PIN 이 속한 리그/팀만 남긴다.
--   detail(JSONB) 에 무엇을 담을지는 호출부(src/lib/audit.ts)가 정하며, 그쪽에도 같은
--   금지 규칙을 주석으로 못 박아 두었다.
--
-- FK 를 걸지 않는 이유
--   이 표가 기록하는 행위의 대부분이 **삭제**다. league_id/team_id/target_id 에 FK 를 걸면
--   "리그를 지웠다" 는 기록이 리그와 함께 캐스케이드로 사라지거나, 삭제 자체가 막힌다.
--   감사 로그는 대상보다 오래 살아남아야 한다 — 097 이 platform_admins.invited_by 를
--   FK 가 아닌 문자열로 둔 것과 같은 판단이다.
--
-- RLS
--   이 저장소 관행 그대로 — RLS 를 켜고 정책은 하나도 만들지 않는다(= service_role 전용).
--   platform_admins / league_user_accounts 와 같은 방식이다. anon/authenticated 키로는
--   한 행도 읽히지 않는다. 여기엔 "언제 누가 무엇을 지웠는지" 가 들어가므로,
--   공격자에게 넘겨주면 운영 구조와 관리자 신원이 그대로 노출된다.
--
--   ⚠ RLS 만으로는 부족하다. 089 주석대로 Postgres 의 컬럼/테이블 GRANT 는 RLS 와 별개라
--   Supabase 가 새 테이블마다 자동으로 주는 anon/authenticated GRANT 를 명시적으로 회수한다.
--
-- 추가만 되고 수정·삭제되지 않는다 (append-only)
--   고칠 수 있는 감사 로그는 감사 로그가 아니다. 두 겹으로 막는다.
--     1) service_role 에서 UPDATE/DELETE 권한 자체를 회수 — 앱 코드는 어떤 실수를 해도
--        기존 행을 건드릴 수 없다(앱은 service_role 로만 DB 에 붙는다).
--     2) BEFORE UPDATE/DELETE 트리거로 예외 — 나중에 누군가 GRANT 를 되돌려도 막힌다.
--   테이블 소유자(postgres)는 여전히 트리거를 끄고 정리할 수 있다. 보존기간 정책이
--   필요해지면 그 경로로 한다(의도적 관리 작업만 가능하게 만드는 것이 목적이다).
--
-- ⚠️ 이 파일은 작성만 하고 실행하지 않는다 (Write SQL = 사용자 명시 확인 후에만 실행,
--    CLAUDE.md 규칙). 사용자 확인 후 `scripts/db-migrate.mjs` 또는 Supabase SQL Editor 로 적용.
--
--    실행 전(미적용 상태)에도 앱은 정상 동작한다 — src/lib/audit.ts 가 "테이블 없음"
--    응답을 감지하면 서버 콘솔에 한 번만 경고를 남기고 이후 조용히 건너뛴다.
--    즉 이 마이그레이션은 "기록이 시작되는" 스위치일 뿐, 기능의 전제 조건이 아니다.
--
-- ── 롤백 (필요 시 이 블록만 실행) ───────────────────────────────────────
--   DROP TRIGGER IF EXISTS admin_audit_log_append_only ON public.admin_audit_log;
--   DROP FUNCTION IF EXISTS public.admin_audit_log_reject_mutation();
--   DROP TABLE IF EXISTS public.admin_audit_log;
--   -- (표를 남긴 채 append-only 만 풀려면 위 트리거 2줄 + 아래 GRANT 만)
--   -- GRANT UPDATE, DELETE ON public.admin_audit_log TO service_role;
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 누가 ─────────────────────────────────────────────────────────────
  -- 인증 경로의 종류. CHECK 로 고정한다 — 오타로 새 종류가 생기면 집계가 조용히 갈라진다.
  actor_kind     TEXT NOT NULL CHECK (actor_kind IN (
                   'ceo', 'platform_admin', 'league_admin',
                   'league_pin', 'manager_code', 'supervisor_code', 'team_pin',
                   'unknown'
                 )),
  -- 종류별 식별자. ceo/platform_admin=이메일, league_admin=계정 UUID,
  -- manager_code/supervisor_code=league_draft_codes.id, PIN 계열=리그/팀 UUID.
  -- ⚠ 어떤 경우에도 비밀값(PIN·코드·비밀번호 원문)이 들어오면 안 된다.
  actor_id       TEXT,
  -- 사람이 읽는 표시. 목록 화면에서 actor_kind 를 매번 번역하지 않아도 되게 미리 만들어 둔다.
  -- 예: '공동관리자 a@b.com' · '리그 PIN (미라클)' · '드래프트 감독관 코드 (총무)'
  actor_label    TEXT,

  -- 무엇을 ───────────────────────────────────────────────────────────
  -- '<대상>.<행위>' 규칙. 예: league.delete · game.reset · event.update · draft.reset
  action         TEXT NOT NULL,
  target_table   TEXT,   -- 'leagues' · 'league_games' · 'league_game_events' …
  target_id      TEXT,   -- UUID 가 아닌 대상(날짜 등)도 있어 TEXT

  -- 어느 범위에서 ────────────────────────────────────────────────────
  -- 사후 조사는 거의 항상 "이 리그에 무슨 일이 있었나" 로 시작한다. 대상이 이벤트든
  -- 경기든 팀이든, 소속 리그를 함께 남겨야 한 번의 조회로 시간순 재구성이 된다.
  league_id      UUID,
  team_id        UUID,

  -- 결과 ─────────────────────────────────────────────────────────────
  -- 실패도 남긴다. "지우려다 실패한 흔적" 은 그 자체로 신호다(권한 대입·오조작).
  result         TEXT NOT NULL DEFAULT 'success'
                 CHECK (result IN ('success', 'failure', 'denied')),
  -- 부가 정보. 삭제된 행 수, 수정된 필드 이름, 거절 사유 등.
  -- ⚠ 비밀값·개인정보 원문 금지 (PIN·비밀번호·토큰·코드 평문).
  detail         JSONB,

  -- 요청 ─────────────────────────────────────────────────────────────
  -- IP 는 097 의 접근 요청(ip_hash)과 달리 원문으로 둔다. 저 표는 익명 제출자의 남용
  -- 대조용이라 해시로 충분했지만, 여기는 이미 인증된 운영자의 파괴 행위 조사용이라
  -- "어느 회선에서 들어왔나" 를 사람이 읽어야 한다. 표 자체가 service_role 전용이다.
  request_ip     TEXT,
  request_method TEXT,
  request_path   TEXT
);

-- 조회 패턴 세 가지에 맞춘 인덱스.
--   1) 최근 무슨 일이 있었나 (콘솔 기본 목록)
CREATE INDEX IF NOT EXISTS admin_audit_log_created_idx
  ON admin_audit_log (created_at DESC);
--   2) 이 리그에 무슨 일이 있었나 (사고 조사의 시작점)
CREATE INDEX IF NOT EXISTS admin_audit_log_league_idx
  ON admin_audit_log (league_id, created_at DESC)
  WHERE league_id IS NOT NULL;
--   3) 이 사람(또는 이 PIN)이 무엇을 했나
CREATE INDEX IF NOT EXISTS admin_audit_log_actor_idx
  ON admin_audit_log (actor_kind, actor_id, created_at DESC);
--   4) 이 대상이 어떤 이력을 거쳤나 (특정 경기/이벤트 추적)
CREATE INDEX IF NOT EXISTS admin_audit_log_target_idx
  ON admin_audit_log (target_table, target_id)
  WHERE target_id IS NOT NULL;

-- ── RLS: 정책 0개 = service_role 전용 ────────────────────────────────
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS 와 별개인 테이블 GRANT 도 회수한다 (089 참조).
REVOKE ALL ON public.admin_audit_log FROM anon, authenticated;

-- ── append-only ─────────────────────────────────────────────────────
-- 1겹: 앱(service_role)은 INSERT/SELECT 만 할 수 있다.
REVOKE UPDATE, DELETE, TRUNCATE ON public.admin_audit_log FROM service_role;
GRANT SELECT, INSERT ON public.admin_audit_log TO service_role;

-- 2겹: 권한이 나중에 되돌아가도 트리거가 막는다.
CREATE OR REPLACE FUNCTION public.admin_audit_log_reject_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '감사 로그는 추가만 가능합니다 (admin_audit_log 는 append-only)';
END;
$$;

DROP TRIGGER IF EXISTS admin_audit_log_append_only ON public.admin_audit_log;
CREATE TRIGGER admin_audit_log_append_only
  BEFORE UPDATE OR DELETE ON public.admin_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_log_reject_mutation();
