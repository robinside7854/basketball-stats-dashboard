-- ─────────────────────────────────────────────────────────────────
-- 드래프트 실시간 동기화 — anon SELECT 정책으로 Supabase Realtime
-- postgres_changes 이벤트가 모든 클라이언트에게 전달되도록 한다.
--
-- 배경:
--   - league_drafts / league_draft_picks / league_draft_chat 은 RLS 활성 + 정책 없음 상태.
--   - 모든 mutation API 가 service role 로 동작하므로 데이터 무결성은 그대로 유지.
--   - 그러나 anon 키로 입장한 단장/감독관 클라이언트가 Realtime 채널을 구독해도
--     RLS 가 SELECT 를 막아 postgres_changes 가 발화되지 않는다.
--   - 우리는 Realtime 이벤트를 단지 "다시 fetch 하라"는 트리거로만 사용하며
--     실제 데이터는 여전히 서버 API(service role) 가 권한 검증 후 반환한다.
--   - 따라서 SELECT 만 허용하는 것은 안전: 단장 코드 해시 같은 민감 필드는
--     payload 에 포함되더라도 이미 bcrypt 처리되어 있고, 코드 평문(plain)은
--     별도 테이블(league_draft_codes_plain)에 있어 노출되지 않는다.
--
-- 적용:
--   3개 테이블에 allow_all_select_for_realtime 정책 추가 + Supabase Realtime publication 등록.
-- ─────────────────────────────────────────────────────────────────

BEGIN;

-- league_drafts: 상태/픽 카운트/추첨 결과 등 — anon SELECT 허용
CREATE POLICY allow_select_drafts_for_realtime ON league_drafts
  FOR SELECT USING (true);

-- league_draft_picks: 픽 발생 알림
CREATE POLICY allow_select_picks_for_realtime ON league_draft_picks
  FOR SELECT USING (true);

-- league_draft_chat: 채팅 메시지 알림
CREATE POLICY allow_select_chat_for_realtime ON league_draft_chat
  FOR SELECT USING (true);

-- supabase_realtime publication 에 테이블 추가 (이미 추가되어 있으면 무시)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE league_drafts;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE league_draft_picks;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE league_draft_chat;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
  END IF;
END $$;

COMMIT;
