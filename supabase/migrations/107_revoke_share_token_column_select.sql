-- 107 · league_drafts.share_token / league_draft_chat 본문 컬럼 SELECT 권한 회수 (anon / authenticated)
--
-- 배경: 055_draft_realtime_rls.sql 이 Realtime(postgres_changes) 발화를 위해
--       league_drafts / league_draft_picks / league_draft_chat 세 테이블에
--       `FOR SELECT USING (true)` 정책을 걸었고, 090 은 "Realtime 이 깨지면 에러 없이
--       조용히 안 바뀐다"는 이유로 이 세 테이블을 REVOKE 대상에서 일부러 제외했다.
--
--       그 결과 브라우저 번들에 그대로 실리는 NEXT_PUBLIC_SUPABASE_ANON_KEY 로
--       PostgREST 에 직접 붙으면
--         GET {SUPABASE_URL}/rest/v1/league_drafts?select=share_token
--         GET {SUPABASE_URL}/rest/v1/league_draft_chat?select=message,sender_label
--       가 각각 200 을 준다. 드래프트 공유 링크(/draft/<token>)는 "링크를 아는 사람만
--       들어온다"를 유일한 접근 통제로 삼는데, 토큰 원문이 anon 키 한 번으로 전부
--       나오므로 비밀로서의 값이 0이다. 채팅 본문도 같은 경로로 통째로 읽힌다.
--       (어드민 콘솔 감사 02 항목, 프로덕션 실측 2026-08-15)
--
--       API 계층 가드(lookupDraftCode / requireCeoSession 등)는 이 경로를 막지 못한다 —
--       PostgREST 는 API 라우트를 거치지 않고 DB 에 직결되는 별도 경로이기 때문이다.
--       RLS 도 막지 못한다 — RLS 는 "행" 단위 필터라 컬럼을 가리지 못한다.
--
-- 방식: 089_revoke_edit_pin_column_select.sql 과 정확히 같다 —
--       "REVOKE 테이블 SELECT 후 필요한 컬럼만 재-GRANT".
--       Postgres 권한은 "테이블 레벨 grant ∪ 컬럼 레벨 grant" 로 합산된다. 컬럼 하나만
--       콕 집어 REVOKE 해도 테이블 레벨 SELECT(Supabase 가 테이블 생성 시 자동 부여하는
--       `GRANT ALL ON ALL TABLES ...`)가 남아 있으면 그 컬럼은 여전히 읽힌다. 그래서
--       테이블 SELECT 를 먼저 걷어내고 나머지 컬럼만 명시적으로 다시 준다.
--       (실측 확인: information_schema.column_privileges 에 anon/authenticated 로 두 테이블
--        전 컬럼이 SELECT/INSERT/UPDATE/REFERENCES 로 잡혀 있었다 — Supabase 기본 프로비저닝.
--        즉 지금 grant 는 테이블 레벨이 맞다. 2026-08-15 조회.)
--
-- 컬럼 목록은 마이그레이션 시점 실제 스키마를 그대로 조회해 확정함
--   (information_schema.columns, 2026-08-15) — league_drafts 20개 / league_draft_chat 7개.
--
-- ── Realtime 이 계속 도는 이유 (가장 중요한 검증) ──────────────────────
--   1) 이 앱은 Realtime 페이로드의 "내용"을 쓰지 않는다. postgres_changes 이벤트는
--      오직 "다시 fetch 하라"는 트리거일 뿐이고, 실제 데이터는 서버 API(service_role)가
--      권한 검증 후 내려준다.
--        - src/app/draft/[token]/DraftPortalClient.tsx:183-187
--            league_drafts(id=eq.X) · league_draft_picks(draft_id=eq.X) · league_draft_chat(draft_id=eq.X)
--            → 세 구독 전부 콜백이 refetch() 한 줄이다 (payload 미사용)
--        - src/components/league/DraftChat.tsx:158-162
--            league_draft_chat INSERT → fetchMsgs() 한 줄 (payload 미사용)
--      따라서 페이로드에서 컬럼이 빠져도 화면 동작에 차이가 없다.
--   2) Realtime 은 구독 role 이 SELECT 할 수 있는 컬럼만 페이로드에 싣고, 한 컬럼도
--      못 읽으면 그 변경을 아예 안 보낸다. 아래는 두 테이블 모두 대부분의 컬럼을
--      계속 GRANT 하므로 이벤트 자체는 그대로 발화한다.
--   3) 구독 filter 에 쓰이는 컬럼(league_drafts.id, league_draft_chat.draft_id)과
--      PK(id)는 재-GRANT 목록에 반드시 남겨뒀다 — 여기서 빼면 filter 가 매칭되지 않아
--      "에러 없이 조용히 안 바뀌는" 상태가 된다(090 이 경고한 그 실패 형태).
--   4) 설령 Realtime 이 멈춰도 두 화면 모두 폴링 안전망(1.5s / POLL_MS)이 있어
--      기능이 죽지는 않는다 — 체감 지연만 늘어난다. 실패 시 롤백은 아래 참조.
--
-- ── 영향 없음 확인 (코드 감사 2026-08-15) ─────────────────────────────
--   · share_token 을 읽는 유일한 경로는 서버뿐이다:
--       - src/app/draft/[token]/page.tsx:18-22            → @/lib/supabase/admin (service_role)
--       - .../drafts/[draftId]/share-token/route.ts:26-47 → @/lib/supabase/admin (service_role)
--     service_role 은 RLS 뿐 아니라 컬럼 GRANT/REVOKE 자체도 우회한다 — 영향 없음.
--   · 채팅 본문을 읽는 유일한 경로도 서버다:
--       - .../drafts/[draftId]/chat/route.ts → admin(service_role) + X-Draft-Code 인증
--     단장/감독관은 이 API 로 받는다. 즉 참가자는 계속 채팅을 볼 수 있고, 코드가 없는
--     외부인만 못 보게 된다(= 원래 의도된 경계).
--   · 브라우저(anon 키)가 이 두 테이블을 .from() 으로 직접 select 하는 코드는 0건이다
--     (grep 확인). anon 키의 쓰임은 위 Realtime 구독뿐.
--   · league_draft_picks 는 손대지 않는다 — 픽 결과(팀·선수)는 어차피 공유 포털에서
--     모두에게 공개되는 값이라 가릴 실익이 없다. 범위를 넓히지 않는다(090 과 같은 판단).
--   · INSERT/UPDATE 컬럼 grant 도 손대지 않는다 — 두 테이블에 SELECT 정책만 있고
--     INSERT/UPDATE 정책이 없어 RLS 단계에서 이미 전부 막혀 있다(실측 확인).
--     이 마이그레이션은 SELECT 컬럼만 다룬다(089 와 동일 범위).
--
-- ⚠️ 이 파일은 작성만 하고 실행하지 않는다 (Write SQL = 사용자 명시 확인 후에만 실행,
--    CLAUDE.md 규칙). 사용자 확인 후 `scripts/db-migrate.mjs` 또는 Supabase SQL Editor 로 적용.
--
-- ── 롤백 (드래프트 실시간이 멈추면 이 블록만 실행) ────────────────────
--   GRANT SELECT ON public.league_drafts     TO anon, authenticated;
--   GRANT SELECT ON public.league_draft_chat TO anon, authenticated;
-- ─────────────────────────────────────────────────────────────────────

BEGIN;

-- league_drafts: 테이블 SELECT 회수 후 share_token 제외 19개 컬럼만 재-GRANT.
-- id 는 DraftPortalClient 의 구독 filter(`id=eq.<draftId>`) 가 쓰므로 반드시 남긴다.
REVOKE SELECT ON public.league_drafts FROM anon, authenticated;
GRANT SELECT (
  id, league_id, quarter_id, status, draft_order, current_pick_index,
  current_round, total_picks, method, created_by, created_at, started_at,
  completed_at, ready_state, lottery_odds, lottery_done, pick_deadline,
  extensions_used, pick_seconds
) ON public.league_drafts TO anon, authenticated;

-- league_draft_chat: 테이블 SELECT 회수 후 본문(message)·발신자 표시명(sender_label)을
-- 뺀 5개 컬럼만 재-GRANT. 이 둘이 감사에서 지적된 "채팅 원문" 그 자체다.
-- draft_id 는 두 곳의 구독 filter(`draft_id=eq.<draftId>`) 가 쓰므로 반드시 남긴다.
-- sender_role/team_id/created_at 은 누가 언제 말했는지 정도의 메타데이터라 남겨두되,
-- 이것들까지 가려도 Realtime 은 동작한다(id·draft_id 만 있으면 충분) — 더 조여야 하면
-- 아래 목록에서 빼면 된다.
REVOKE SELECT ON public.league_draft_chat FROM anon, authenticated;
GRANT SELECT (
  id, draft_id, sender_role, team_id, created_at
) ON public.league_draft_chat TO anon, authenticated;

COMMIT;
