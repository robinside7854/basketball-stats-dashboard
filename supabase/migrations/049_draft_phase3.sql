-- ─────────────────────────────────────────────────────────────────
-- 드래프트 Phase 3 — 실시간 진행 (감독관 + 준비체크 + 승률 가중 추첨 + 선수 풀)
--
-- 변경 사항:
--   1) league_draft_codes  — 감독관(supervisor) 역할 지원 (team_id NULL 허용)
--   2) league_drafts        — ready_state / lottery / status='ready_check'
--   3) league_draft_pool    — 드래프트 대상(정규선수) 풀 (사전 선별, 팀장 제외)
--
-- 멱등성: IF NOT EXISTS / DROP CONSTRAINT IF EXISTS — 안전 재실행
-- ─────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1) league_draft_codes: 감독관 코드 ────────────────────────────
-- role='manager'(팀 단장) | 'supervisor'(총무·감독관, 팀 없음)
ALTER TABLE league_draft_codes
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'manager';

ALTER TABLE league_draft_codes
  DROP CONSTRAINT IF EXISTS league_draft_codes_role_check;
ALTER TABLE league_draft_codes
  ADD CONSTRAINT league_draft_codes_role_check
  CHECK (role IN ('manager','supervisor'));

-- 감독관은 팀에 속하지 않으므로 team_id NULL 허용
ALTER TABLE league_draft_codes
  ALTER COLUMN team_id DROP NOT NULL;

-- 분기당 감독관 코드 1개만 허용 (team_id NULL 이라 기존 UNIQUE 로는 안 막힘)
CREATE UNIQUE INDEX IF NOT EXISTS league_draft_codes_supervisor_unique
  ON league_draft_codes(quarter_id) WHERE role = 'supervisor';

-- ── 2) league_drafts: 준비체크 + 추첨 ─────────────────────────────
-- status 흐름: setup → ready_check → in_progress → completed
ALTER TABLE league_drafts DROP CONSTRAINT IF EXISTS league_drafts_status_check;
ALTER TABLE league_drafts ADD CONSTRAINT league_drafts_status_check
  CHECK (status IN ('setup','ready_check','in_progress','completed'));

ALTER TABLE league_drafts
  -- 준비 상태: { "<team_id>": true, "supervisor": true }
  ADD COLUMN IF NOT EXISTS ready_state  JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- 추첨 확률(1픽 당첨 확률) 기록: { "<team_id>": 0.45, ... }
  ADD COLUMN IF NOT EXISTS lottery_odds JSONB,
  -- 추첨 완료 여부 (draft_order 가 추첨으로 확정됨)
  ADD COLUMN IF NOT EXISTS lottery_done BOOLEAN NOT NULL DEFAULT false;

-- ── 3) league_draft_pool: 드래프트 대상 풀 ────────────────────────
-- 어드민이 사전 선별한 "정규선수" 후보. 팀장(leader)은 미포함.
CREATE TABLE IF NOT EXISTS league_draft_pool (
  draft_id          UUID NOT NULL REFERENCES league_drafts(id) ON DELETE CASCADE,
  league_player_id  UUID NOT NULL REFERENCES league_players(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (draft_id, league_player_id)
);
CREATE INDEX IF NOT EXISTS idx_draft_pool_draft ON league_draft_pool(draft_id);

-- RLS — 기존 draft 테이블과 동일 (service role 전용)
ALTER TABLE league_draft_pool ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ── 검증 ──
SELECT
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name='league_draft_codes' AND column_name='role')        AS codes_role,
  (SELECT COUNT(*) FROM information_schema.columns
     WHERE table_name='league_drafts' AND column_name='ready_state')      AS drafts_ready,
  (SELECT COUNT(*) FROM information_schema.tables
     WHERE table_name='league_draft_pool')                                AS pool_table;
