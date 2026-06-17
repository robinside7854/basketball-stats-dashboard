-- ─────────────────────────────────────────────────────────────────
-- 드래프트 픽 타이머 — 픽당 100초 제한 + 단장별 15초 추가(드래프트당 3회)
--
-- pick_deadline   : 현재 픽의 마감 시각 (모든 클라이언트가 동기화해 카운트다운)
-- extensions_used : { team_id: 사용횟수 } — 드래프트(세션)당 팀별 추가 사용 누적
-- ─────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE league_drafts
  ADD COLUMN IF NOT EXISTS pick_deadline   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS extensions_used JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMIT;

SELECT
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='league_drafts' AND column_name='pick_deadline')   AS deadline_col,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name='league_drafts' AND column_name='extensions_used') AS ext_col;
