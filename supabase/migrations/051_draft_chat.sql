-- ─────────────────────────────────────────────────────────────────
-- 드래프트 실시간 채팅 — 코드를 입력한 단장/감독관 간 메시지
--
-- 코드 보유자(단장·감독관)만 읽기/쓰기 (API에서 draft code 검증).
-- 세션 단위(draft_id)로 메시지 보관, 세션 삭제 시 cascade.
-- ─────────────────────────────────────────────────────────────────

BEGIN;

CREATE TABLE IF NOT EXISTS league_draft_chat (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id      UUID NOT NULL REFERENCES league_drafts(id) ON DELETE CASCADE,
  sender_role   TEXT NOT NULL CHECK (sender_role IN ('manager','supervisor')),
  team_id       UUID REFERENCES league_teams(id) ON DELETE SET NULL,  -- 단장의 팀 (감독관은 NULL)
  sender_label  TEXT NOT NULL,        -- 코드 레이블 (예: "구범준 단장")
  message       TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_draft_chat_draft ON league_draft_chat(draft_id, created_at);

-- RLS — 기존 draft 테이블과 동일 (service role 전용, API가 코드 검증)
ALTER TABLE league_draft_chat ENABLE ROW LEVEL SECURITY;

COMMIT;

SELECT (SELECT COUNT(*) FROM information_schema.tables WHERE table_name='league_draft_chat') AS chat_table;
