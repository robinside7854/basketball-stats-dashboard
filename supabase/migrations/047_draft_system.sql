-- ─────────────────────────────────────────────────────────────────
-- 드래프트 시스템 — 분기별 단장 드래프트
--
-- 3개 테이블:
--   1) league_draft_codes  — 어드민이 발급하는 단장 입장 코드
--   2) league_drafts        — 분기별 드래프트 세션
--   3) league_draft_picks   — 픽 영구 기록 (감사용)
--
-- 권한 흐름:
--   어드민: 코드 발급, 세션 생성/시작/종료/리셋
--   단장(코드 보유자): 자기 차례에 픽 → league_player_quarters 자동 반영
--   모든 사용자: 진행 상황 시청 (SELECT)
--
-- 멱등성: 모두 IF NOT EXISTS 사용, 안전하게 재실행 가능
-- ─────────────────────────────────────────────────────────────────

BEGIN;

-- ── 1) league_draft_codes ────────────────────────────────────────
-- 어드민이 단장에게 발급하는 코드. bcrypt 해시 저장 (평문 금지).
CREATE TABLE IF NOT EXISTS league_draft_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id       UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  quarter_id      UUID NOT NULL REFERENCES league_quarters(id) ON DELETE CASCADE,
  team_id         UUID NOT NULL REFERENCES league_teams(id) ON DELETE CASCADE,
  code_hash       TEXT NOT NULL,
  label           TEXT NOT NULL,                  -- "구범준 단장" 등 어드민이 입력
  is_active       BOOLEAN NOT NULL DEFAULT true,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 분기당 팀당 1개의 활성 코드만 허용
  CONSTRAINT league_draft_codes_quarter_team_unique UNIQUE (quarter_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_draft_codes_quarter ON league_draft_codes(quarter_id);
CREATE INDEX IF NOT EXISTS idx_draft_codes_league  ON league_draft_codes(league_id);

-- ── 2) league_drafts ─────────────────────────────────────────────
-- 분기별 드래프트 세션. UNIQUE(quarter_id) — 분기당 1세션.
CREATE TABLE IF NOT EXISTS league_drafts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id           UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  quarter_id          UUID NOT NULL REFERENCES league_quarters(id) ON DELETE CASCADE,
  status              TEXT NOT NULL DEFAULT 'setup'
                      CHECK (status IN ('setup','in_progress','completed')),
  draft_order         UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],  -- team_id 배열, 픽 순서
  current_pick_index  INT NOT NULL DEFAULT 0,                   -- draft_order 안의 현재 위치 (라운드 내)
  current_round       INT NOT NULL DEFAULT 1,                   -- 현재 라운드 (1, 2, ...)
  total_picks         INT NOT NULL DEFAULT 0,                   -- 픽 완료 카운트 (편의)
  method              TEXT NOT NULL DEFAULT 'snake'
                      CHECK (method IN ('snake','linear')),
  created_by          TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at          TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  CONSTRAINT league_drafts_quarter_unique UNIQUE (quarter_id)
);

CREATE INDEX IF NOT EXISTS idx_drafts_league  ON league_drafts(league_id);
CREATE INDEX IF NOT EXISTS idx_drafts_status  ON league_drafts(status);

-- ── 3) league_draft_picks ────────────────────────────────────────
-- 픽 영구 기록. draft 가 reset 되어도 감사 로그로 보존 가능 (cascade 결정은 비즈니스 정책).
CREATE TABLE IF NOT EXISTS league_draft_picks (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id            UUID NOT NULL REFERENCES league_drafts(id) ON DELETE CASCADE,
  pick_number         INT NOT NULL,           -- 전체 순서 (1, 2, 3, ...)
  round_number        INT NOT NULL,           -- 라운드 (1라운드, 2라운드, ...)
  team_id             UUID NOT NULL REFERENCES league_teams(id) ON DELETE CASCADE,
  league_player_id    UUID NOT NULL REFERENCES league_players(id) ON DELETE CASCADE,
  picked_by_code_id   UUID REFERENCES league_draft_codes(id) ON DELETE SET NULL,
  picked_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT league_draft_picks_number_unique UNIQUE (draft_id, pick_number),
  CONSTRAINT league_draft_picks_player_unique UNIQUE (draft_id, league_player_id)
);

CREATE INDEX IF NOT EXISTS idx_draft_picks_team   ON league_draft_picks(draft_id, team_id);
CREATE INDEX IF NOT EXISTS idx_draft_picks_player ON league_draft_picks(league_player_id);

-- ── 4) RLS — 모든 인증 사용자 SELECT 허용 (시청용), 쓰기는 service role만
--    (기존 다른 테이블이 RLS 없이 운영중인 패턴 따름 — service role이 admin 클라이언트로
--     모든 mutation을 수행하므로 RLS 활성화는 선택 사항)
-- ALTER TABLE league_draft_codes ENABLE ROW LEVEL SECURITY;  -- 필요시 활성화
-- ALTER TABLE league_drafts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE league_draft_picks ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ── 검증 쿼리 ──
SELECT
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'league_draft_codes') AS codes_table,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'league_drafts')       AS drafts_table,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'league_draft_picks')  AS picks_table;
