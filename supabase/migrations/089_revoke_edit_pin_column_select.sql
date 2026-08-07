-- 089 · edit_pin 컬럼 SELECT 권한 회수 (anon / authenticated)
--
-- 배경: 059_leagues_public_read.sql (`leagues_public_read`) 과 002_multi_tenant.sql
--       (`teams_public_read`) 이 각각 `FOR SELECT USING (true)` 로 열려있다. Postgres RLS 는
--       "행" 단위 필터라 컬럼을 가리지 못한다 — 브라우저 번들에 그대로 실리는
--       NEXT_PUBLIC_SUPABASE_ANON_KEY 로 PostgREST 에 직접 붙으면
--       (예: GET {SUPABASE_URL}/rest/v1/leagues?select=edit_pin) edit_pin 이 평문으로 나온다.
--       실측으로 확인됨 (fix/edit-pin-path-split 브랜치 최종 보안 리뷰, 2026-08-07).
--
--       API 계층(엔드포인트별 canEditLeague/canViewLeague 가드)은 이 경로를 막지 못한다 —
--       PostgREST 는 API 라우트를 거치지 않고 DB 에 직결되는 별도 경로이기 때문이다.
--
-- 방식: "REVOKE 테이블 SELECT 후 필요한 컬럼만 재-GRANT".
--       Postgres 권한은 "테이블 레벨 grant ∪ 컬럼 레벨 grant" 로 합산된다 — 컬럼 하나만
--       콕 집어 REVOKE 해도 테이블 레벨 SELECT(Supabase 가 매 테이블 생성 시 자동으로
--       anon/authenticated 에 부여하는 `GRANT ALL ON ALL TABLES ...`)가 남아있으면 그 컬럼은
--       여전히 읽힌다. 그래서 테이블 SELECT 자체를 먼저 걷어내고, edit_pin 을 뺀 나머지
--       컬럼만 명시적으로 다시 준다 — 이래야 REVOKE 가 실제로 유효하다.
--       (아래 확인 쿼리로 현재 이 두 테이블의 grant 가 테이블 레벨임을 실측 확인함:
--        information_schema.column_privileges 에 anon/authenticated 로 두 테이블 전 컬럼이
--        SELECT/INSERT/UPDATE/REFERENCES 로 잡혀 있었음 — Supabase 기본 프로비저닝.)
--
-- 컬럼 목록은 마이그레이션 시점 실제 스키마를 그대로 조회해 확정함
--   (information_schema.columns, 2026-08-07 조회) — leagues 18개, teams 11개 컬럼, edit_pin
--   각 1개씩 제외.
--
-- 영향 없음 확인 (코드 감사 완료, 2026-08-07):
--   1) edit_pin 을 실제로 읽고/쓰는 경로는 전부 service_role 뿐이다:
--        - src/lib/leaguePinAuth.ts, src/lib/teamPinAuth.ts        → @/lib/supabase/admin (service_role)
--        - src/app/api/auth/league-pin/route.ts                    → @/lib/supabase/admin (service_role)
--        - src/app/api/auth/pin/route.ts                           → @/lib/supabase/server
--            createServerClient() 는 `SUPABASE_SERVICE_ROLE_KEY ?? NEXT_PUBLIC_SUPABASE_ANON_KEY`.
--            이 프로젝트는 다른 서버 경로(admin.ts 등)도 SUPABASE_SERVICE_ROLE_KEY 를 무조건
--            전제하므로 실질적으로 항상 service_role 이 쓰인다 — 단, 그 env 변수가 배포 환경에
--            없으면 이 한 경로만 anon 키로 조용히 폴백해 edit_pin 조회가 막힌다(권한 오류로
--            드러나므로 "노출"이 아니라 "이 경로만 기능 정지" 방향의 실패 — 안전 방향 폴백).
--        - src/app/api/leagues/[leagueId]/edit-pin/route.ts (GET/PATCH 전용 분리 경로) → admin (service_role)
--        - src/app/api/admin/teams/[teamId]/route.ts (PATCH, CEO 세션 전용)            → admin (service_role)
--      service_role 은 RLS 뿐 아니라 이런 컬럼 GRANT/REVOKE 자체도 우회한다 — 영향 없음.
--   2) 이 두 테이블에 SELECT 를 실제로 anon 키(브라우저)로 쿼리하는 유일한 경로는
--      src/middleware.ts 의 slug↔UUID 리졸브다: `leagues?select=id,slug` 로 org_slug/id/slug
--      만 쓴다 — teams 는 미들웨어가 아예 건드리지 않는다. id/org_slug/slug 모두 아래
--      재-GRANT 목록에 포함되어 있어 계속 동작한다.
--   3. 코드 전체에서 `.from('leagues')` / `.from('teams')` 를 쓰는 다른 모든 곳은
--      @/lib/supabase/admin(service_role) 아니면 명시적 컬럼 목록(edit_pin 미포함, resolve.ts /
--      scoring.ts 등 공용 헬퍼 포함)만 select 한다 — grep 감사 완료, edit_pin 을 select 하는
--      비-service_role 경로 없음.
--   4. 현재 pg_policies 에는 leagues/teams 모두 SELECT 정책(USING true)만 존재하고
--      INSERT/UPDATE 정책은 없다 (002 의 teams_public_insert/update 는 이미 사라짐) — 즉
--      anon/authenticated 는 애초에 이 두 테이블에 쓰기가 불가능하다. 이 마이그레이션은
--      SELECT 컬럼만 다룬다(요청 범위) — INSERT/UPDATE 컬럼 grant 는 이미 RLS 로 막혀있어
--      손대지 않았다.
--
-- ⚠️ 이 파일은 작성만 하고 실행하지 않는다 (Write SQL = 사용자 명시 확인 후에만 실행,
--    CLAUDE.md 규칙). 사용자 확인 후 `scripts/db-migrate.mjs` 또는 Supabase SQL Editor 로 적용.
--
-- ── 롤백 (필요 시 이 블록만 실행) ─────────────────────────────────────────
--   GRANT SELECT ON public.leagues TO anon, authenticated;
--   GRANT SELECT ON public.teams   TO anon, authenticated;
-- ─────────────────────────────────────────────────────────────────────────

-- leagues: 테이블 SELECT 회수 후 edit_pin 제외 17개 컬럼만 재-GRANT
REVOKE SELECT ON public.leagues FROM anon, authenticated;
GRANT SELECT (
  id, org_slug, name, season_year, start_date, match_day, total_rounds,
  status, created_at, season_type, games_per_round, youtube_channel,
  plus_one_age, slug, team_id, mode, rules
) ON public.leagues TO anon, authenticated;

-- teams: 테이블 SELECT 회수 후 edit_pin 제외 10개 컬럼만 재-GRANT
REVOKE SELECT ON public.teams FROM anon, authenticated;
GRANT SELECT (
  id, org_slug, name, accent_color, logo_url, is_active,
  created_at, sub_slug, org_id, is_public
) ON public.teams TO anon, authenticated;
