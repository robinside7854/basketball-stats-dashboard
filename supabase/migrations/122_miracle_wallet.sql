-- =============================================
-- 122_miracle_wallet.sql
-- 포인트 지갑 「미라클 월렛」 (2026-11-09 운영진 — 미모바스켓 흡수 1단계, docs/mimo-onboarding-plan.md)
-- =============================================
-- 흐름
--   회원이 카카오뱅크에 입금 → 앱에서 「충전 요청」(금액·입금자명) → 팀 어드민 누구나 통장 확인 후 승인
--   → 포인트가 들어온다. 회원은 자기 잔액·충전 요청·사용 내역을 본다.
--
-- 단위 = 팀(teams.id). 계정·선수와 같다 — 같은 팀의 리그↔대회를 오가도 지갑은 하나.
--
-- 정본은 장부(wallet_ledger)다. 잔액(wallet_balances)은 장부를 따라가는 캐시이고,
--   둘은 반드시 wallet_apply() 안에서 같이 바뀐다(잠금 + 한 트랜잭션). 화면·라우트에서
--   잔액을 직접 UPDATE 하지 말 것 — 미모바스켓은 비정규 티켓을 「읽고 → 빼고 → 쓰기」로
--   바꿔 동시에 누르면 숫자가 어긋났다.
--   장부 행은 지우거나 고치지 않는다. 되돌리기는 반대 부호의 행을 하나 더 쓴다.
--
-- 포인트 유효기간 없음(운영진). 잔액은 0 아래로 내려가지 않는다.
-- RLS 켜고 정책 없음 — 서버(Service Role)만 읽고 쓴다.
-- =============================================

-- 팀마다 켜는 기능 — wallet_name 이 있는 팀에만 월렛이 보인다.
ALTER TABLE teams ADD COLUMN IF NOT EXISTS wallet_name TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS wallet_bank TEXT;   -- 입금 안내 문구(은행 · 계좌 · 예금주)

CREATE TABLE IF NOT EXISTS wallet_balances (
  team_id           UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  league_player_id  UUID NOT NULL REFERENCES league_players(id) ON DELETE RESTRICT,
  balance           INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, league_player_id)
);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  league_player_id  UUID NOT NULL REFERENCES league_players(id) ON DELETE RESTRICT,
  -- opening = 미모바스켓에서 옮겨 온 시작 잔액 · charge = 충전 승인 · purchase = 구매 · refund = 환불 · adjust = 어드민 보정
  kind              TEXT NOT NULL CHECK (kind IN ('opening', 'charge', 'purchase', 'refund', 'adjust')),
  amount            INTEGER NOT NULL CHECK (amount <> 0),       -- 들어오면 +, 나가면 −
  balance_after     INTEGER NOT NULL CHECK (balance_after >= 0),
  memo              TEXT,
  ref_type          TEXT,                                        -- 'charge_request' 등
  ref_id            UUID,
  actor_label       TEXT,                                        -- 누가 했나(예: 「팀 어드민 kim」) — 비밀값 금지
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_ledger_player_idx ON wallet_ledger (team_id, league_player_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wallet_charge_requests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id           UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  league_player_id  UUID NOT NULL REFERENCES league_players(id) ON DELETE RESTRICT,
  amount            INTEGER NOT NULL CHECK (amount > 0 AND amount <= 1000000),
  depositor_name    TEXT NOT NULL,                               -- 통장에 찍힌 입금자명(대조용)
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  admin_note        TEXT,
  reviewed_by_label TEXT,
  reviewed_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_charge_requests_team_status_idx ON wallet_charge_requests (team_id, status, created_at DESC);
-- 한 사람당 대기 중 요청은 하나 — 두 번 눌러 이중 충전되는 것을 DB 에서 막는다.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_charge_requests_one_pending
  ON wallet_charge_requests (team_id, league_player_id) WHERE status = 'pending';

ALTER TABLE wallet_balances        ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_ledger          ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_charge_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wallet_balances, wallet_ledger, wallet_charge_requests FROM PUBLIC, anon, authenticated;

-- 잔액을 바꾸는 유일한 길. 잔액 행을 잠그고 → 새 잔액 계산(0 미만이면 거절) → 잔액·장부를 같이 쓴다.
CREATE OR REPLACE FUNCTION wallet_apply(
  p_team_id UUID, p_player_id UUID, p_kind TEXT, p_amount INTEGER,
  p_memo TEXT, p_ref_type TEXT, p_ref_id UUID, p_actor TEXT
) RETURNS wallet_ledger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_balance INTEGER;
  v_row wallet_ledger;
BEGIN
  IF p_amount IS NULL OR p_amount = 0 THEN
    RAISE EXCEPTION 'wallet: 금액이 0 입니다';
  END IF;

  INSERT INTO wallet_balances (team_id, league_player_id) VALUES (p_team_id, p_player_id)
    ON CONFLICT DO NOTHING;
  SELECT balance INTO v_balance FROM wallet_balances
   WHERE team_id = p_team_id AND league_player_id = p_player_id
   FOR UPDATE;

  IF v_balance + p_amount < 0 THEN
    RAISE EXCEPTION 'wallet: 포인트가 부족합니다 (잔액 %, 필요 %)', v_balance, -p_amount;
  END IF;

  UPDATE wallet_balances SET balance = v_balance + p_amount, updated_at = now()
   WHERE team_id = p_team_id AND league_player_id = p_player_id;

  INSERT INTO wallet_ledger (team_id, league_player_id, kind, amount, balance_after, memo, ref_type, ref_id, actor_label)
  VALUES (p_team_id, p_player_id, p_kind, p_amount, v_balance + p_amount, p_memo, p_ref_type, p_ref_id, p_actor)
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- 충전 요청 승인/반려 — 요청을 잠가 두 어드민이 동시에 눌러도 한 번만 들어간다.
CREATE OR REPLACE FUNCTION wallet_review_charge(
  p_team_id UUID, p_request_id UUID, p_action TEXT, p_note TEXT, p_actor TEXT
) RETURNS wallet_charge_requests
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_req wallet_charge_requests;
BEGIN
  SELECT * INTO v_req FROM wallet_charge_requests
   WHERE id = p_request_id AND team_id = p_team_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet: 충전 요청을 찾을 수 없습니다'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'wallet: 이미 처리된 요청입니다'; END IF;

  IF p_action = 'approve' THEN
    PERFORM wallet_apply(v_req.team_id, v_req.league_player_id, 'charge', v_req.amount,
                         '충전 (입금자 ' || v_req.depositor_name || ')', 'charge_request', v_req.id, p_actor);
    UPDATE wallet_charge_requests SET status = 'approved', admin_note = p_note,
           reviewed_by_label = p_actor, reviewed_at = now()
     WHERE id = v_req.id RETURNING * INTO v_req;
  ELSIF p_action = 'reject' THEN
    UPDATE wallet_charge_requests SET status = 'rejected', admin_note = p_note,
           reviewed_by_label = p_actor, reviewed_at = now()
     WHERE id = v_req.id RETURNING * INTO v_req;
  ELSE
    RAISE EXCEPTION 'wallet: 알 수 없는 처리 %', p_action;
  END IF;
  RETURN v_req;
END;
$$;

REVOKE ALL ON FUNCTION wallet_apply(UUID, UUID, TEXT, INTEGER, TEXT, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION wallet_review_charge(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- 미라클모닝농구단에 켠다. 계좌는 미모바스켓 화면에 있던 그대로 — 바뀌면 이 칸만 고친다.
UPDATE teams
   SET wallet_name = '미라클 월렛',
       wallet_bank = '카카오뱅크 3333201582707 (김민수)'
 WHERE id = 'ec4b250b-e3ab-4f7e-a83d-9d9cb6816981';
