-- =============================================
-- 123_wallet_bonus_refund_tickets.sql
-- 미라클 월렛 2단계 (2026-11-09 운영진): 충전 보너스 · 환불 · 정규권/비정규 티켓 구매
-- =============================================
-- ① 충전 보너스 — 5만원 이상 충전하면 10% 를 보너스 포인트로 더 준다(5만원 → 55,000P, 10만원 → 110,000P).
--    장부에 'charge'(입금한 돈) 와 'bonus'(보너스) 를 따로 쓴다 — 환불 계산이 둘을 구분해야 해서.
-- ② 환불 — 「입금한 돈 − 쓴 포인트」만 돌려준다(보너스는 제외, 0 아래면 환불 없음). 운영진 예시:
--    5만원 충전(55,000P) → 12,000P 사용 → 환불 50,000 − 12,000 = 38,000원 (보너스 5,000P 제외)
--    10만원 충전(110,000P) → 105,000P 사용 → 100,000 − 105,000 < 0 → 환불 없음
--    회원이 「환불 요청」(받을 계좌) → 어드민이 송금하고 「송금했어요」 → 장부에 'withdraw'(−환불액) +
--    남은 포인트는 'forfeit'(−나머지, 보너스 등 소멸) 로 잔액 0. 계산은 마지막 환불 이후의 장부만 본다.
--    미모바스켓에서 옮겨 온 시작 잔액('opening')과 어드민 보정('adjust')은 입금한 돈으로 친다.
-- ③ 티켓 — 정규권(그 달, 28,000P) · 비정규 티켓(1회, 12,000P)을 포인트로 산다.
--    한 장 = wallet_tickets 한 행. 비정규 티켓은 팀에 배치될 때 「사용」(다음 단계 참가신청이 부른다 —
--    그때까지는 어드민이 손으로 사용 처리), 어드민 판단으로 「돌려주기」(포인트 환불 · 기록은 남는다).
-- 가격·보너스 기준은 teams.wallet_rules 에 둔다(바뀌면 그 칸만 고친다).
-- =============================================

ALTER TABLE teams ADD COLUMN IF NOT EXISTS wallet_rules JSONB;

-- 장부 종류 추가: bonus(충전 보너스) · withdraw(환불 송금) · forfeit(환불 때 소멸한 포인트)
--   ⚠ 제약을 바꾸려면 지우고 다시 만들어야 한다(값 목록을 넓히는 것뿐 — 기존 행은 그대로 통과한다).
ALTER TABLE wallet_ledger DROP CONSTRAINT IF EXISTS wallet_ledger_kind_check;
ALTER TABLE wallet_ledger ADD CONSTRAINT wallet_ledger_kind_check
  CHECK (kind IN ('opening', 'charge', 'bonus', 'purchase', 'refund', 'adjust', 'withdraw', 'forfeit'));

-- 요청 표에 「환불 요청」도 담는다. 환불은 depositor_name = 받을 계좌 예금주, refund_account = 은행·계좌번호.
--   대기 중 요청은 여전히 한 사람당 하나(충전이든 환불이든).
ALTER TABLE wallet_charge_requests ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'charge'
  CHECK (kind IN ('charge', 'refund'));
ALTER TABLE wallet_charge_requests ADD COLUMN IF NOT EXISTS refund_account TEXT;

CREATE TABLE IF NOT EXISTS wallet_tickets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id            UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  league_player_id   UUID NOT NULL REFERENCES league_players(id) ON DELETE RESTRICT,
  kind               TEXT NOT NULL CHECK (kind IN ('regular_pass', 'non_regular')),
  month              DATE CHECK (month IS NULL OR EXTRACT(DAY FROM month) = 1),   -- 정규권만: 그 달 1일
  price              INTEGER NOT NULL CHECK (price >= 0),
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'returned')),
  used_date          DATE,          -- 비정규: 배치된 경기 날짜
  used_note          TEXT,
  purchase_ledger_id UUID REFERENCES wallet_ledger(id),
  return_ledger_id   UUID REFERENCES wallet_ledger(id),
  actor_label        TEXT,          -- 산 사람(본인) 또는 사용 처리한 어드민
  returned_by_label  TEXT,
  returned_note      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((kind = 'regular_pass') = (month IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS wallet_tickets_player_idx ON wallet_tickets (team_id, league_player_id, created_at DESC);
-- 같은 달 정규권은 한 장(돌려준 것은 제외)
CREATE UNIQUE INDEX IF NOT EXISTS wallet_tickets_one_regular_per_month
  ON wallet_tickets (team_id, league_player_id, month) WHERE kind = 'regular_pass' AND status <> 'returned';

ALTER TABLE wallet_tickets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wallet_tickets FROM PUBLIC, anon, authenticated;

-- 환불 가능 금액 = 마지막 환불 이후 (입금한 돈 − 쓴 포인트), 0 이상 · 잔액 이하.
CREATE OR REPLACE FUNCTION wallet_refundable(p_team_id UUID, p_player_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH since AS (
    SELECT COALESCE(MAX(created_at), '-infinity'::timestamptz) AS t
      FROM wallet_ledger WHERE team_id = p_team_id AND league_player_id = p_player_id AND kind = 'withdraw'
  ), rows AS (
    SELECT kind, amount FROM wallet_ledger, since
     WHERE team_id = p_team_id AND league_player_id = p_player_id AND created_at > since.t
  )
  SELECT GREATEST(0, LEAST(
    COALESCE((SELECT balance FROM wallet_balances WHERE team_id = p_team_id AND league_player_id = p_player_id), 0),
    COALESCE((SELECT SUM(amount) FROM rows WHERE kind IN ('charge', 'opening', 'adjust')), 0)
      + COALESCE((SELECT SUM(amount) FROM rows WHERE kind IN ('purchase', 'refund')), 0)
  ))::INTEGER
$$;

-- 충전 승인 — 보너스 포함으로 다시 정의(122 를 대체). 환불 요청은 여기로 오면 거절한다.
CREATE OR REPLACE FUNCTION wallet_review_charge(
  p_team_id UUID, p_request_id UUID, p_action TEXT, p_note TEXT, p_actor TEXT
) RETURNS wallet_charge_requests
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_req wallet_charge_requests;
  v_rules JSONB;
  v_bonus INTEGER := 0;
BEGIN
  SELECT * INTO v_req FROM wallet_charge_requests
   WHERE id = p_request_id AND team_id = p_team_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet: 충전 요청을 찾을 수 없습니다'; END IF;
  IF v_req.kind <> 'charge' THEN RAISE EXCEPTION 'wallet: 충전 요청이 아닙니다'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'wallet: 이미 처리된 요청입니다'; END IF;

  IF p_action = 'approve' THEN
    PERFORM wallet_apply(v_req.team_id, v_req.league_player_id, 'charge', v_req.amount,
                         '충전 (입금자 ' || v_req.depositor_name || ')', 'charge_request', v_req.id, p_actor);
    SELECT wallet_rules INTO v_rules FROM teams WHERE id = p_team_id;
    IF v_rules IS NOT NULL AND v_req.amount >= COALESCE((v_rules->>'bonus_min')::INTEGER, 2147483647) THEN
      v_bonus := FLOOR(v_req.amount * COALESCE((v_rules->>'bonus_pct')::NUMERIC, 0) / 100);
    END IF;
    IF v_bonus > 0 THEN
      PERFORM wallet_apply(v_req.team_id, v_req.league_player_id, 'bonus', v_bonus,
                           '충전 보너스 ' || COALESCE(v_rules->>'bonus_pct', '0') || '%', 'charge_request', v_req.id, p_actor);
    END IF;
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

-- 환불 요청 처리 — 승인 = 「송금했어요」. 그 순간의 환불 가능 금액으로 다시 계산한다.
CREATE OR REPLACE FUNCTION wallet_review_refund(
  p_team_id UUID, p_request_id UUID, p_action TEXT, p_note TEXT, p_actor TEXT
) RETURNS wallet_charge_requests
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_req wallet_charge_requests;
  v_balance INTEGER;
  v_refund INTEGER;
BEGIN
  SELECT * INTO v_req FROM wallet_charge_requests
   WHERE id = p_request_id AND team_id = p_team_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet: 환불 요청을 찾을 수 없습니다'; END IF;
  IF v_req.kind <> 'refund' THEN RAISE EXCEPTION 'wallet: 환불 요청이 아닙니다'; END IF;
  IF v_req.status <> 'pending' THEN RAISE EXCEPTION 'wallet: 이미 처리된 요청입니다'; END IF;

  IF p_action = 'approve' THEN
    SELECT balance INTO v_balance FROM wallet_balances
     WHERE team_id = v_req.team_id AND league_player_id = v_req.league_player_id
     FOR UPDATE;
    v_balance := COALESCE(v_balance, 0);
    v_refund := wallet_refundable(v_req.team_id, v_req.league_player_id);
    IF v_refund <= 0 THEN RAISE EXCEPTION 'wallet: 지금은 환불할 금액이 없습니다'; END IF;
    PERFORM wallet_apply(v_req.team_id, v_req.league_player_id, 'withdraw', -v_refund,
                         '환불 송금 ' || v_refund || '원 (' || v_req.depositor_name || ' · ' || COALESCE(v_req.refund_account, '') || ')',
                         'refund_request', v_req.id, p_actor);
    IF v_balance - v_refund > 0 THEN
      PERFORM wallet_apply(v_req.team_id, v_req.league_player_id, 'forfeit', -(v_balance - v_refund),
                           '환불하면서 소멸 (보너스 등 환불 제외분)', 'refund_request', v_req.id, p_actor);
    END IF;
    UPDATE wallet_charge_requests SET status = 'approved', amount = v_refund, admin_note = p_note,
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

-- 티켓 사기 — 가격은 팀 규칙에서 읽는다(화면이 보낸 값을 믿지 않는다). 포인트 차감은 장부 한 줄.
CREATE OR REPLACE FUNCTION wallet_buy_ticket(
  p_team_id UUID, p_player_id UUID, p_kind TEXT, p_month DATE, p_qty INTEGER, p_actor TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_rules JSONB;
  v_price INTEGER;
  v_ledger wallet_ledger;
  v_memo TEXT;
BEGIN
  SELECT wallet_rules INTO v_rules FROM teams WHERE id = p_team_id;
  IF p_kind = 'regular_pass' THEN
    v_price := (v_rules->>'regular_pass_price')::INTEGER;
    IF p_month IS NULL OR EXTRACT(DAY FROM p_month) <> 1 THEN RAISE EXCEPTION 'wallet: 정규권 달을 골라 주세요'; END IF;
    IF p_qty <> 1 THEN RAISE EXCEPTION 'wallet: 정규권은 한 달에 한 장입니다'; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(p_team_id::TEXT || p_player_id::TEXT || p_month::TEXT, 0));
    IF EXISTS (SELECT 1 FROM wallet_tickets WHERE team_id = p_team_id AND league_player_id = p_player_id
                AND kind = 'regular_pass' AND month = p_month AND status <> 'returned') THEN
      RAISE EXCEPTION 'wallet: 이미 그 달 정규권이 있습니다';
    END IF;
    v_memo := '정규권 ' || TO_CHAR(p_month, 'YYYY"년" FMMM"월"');
  ELSIF p_kind = 'non_regular' THEN
    v_price := (v_rules->>'non_regular_price')::INTEGER;
    IF p_qty IS NULL OR p_qty < 1 OR p_qty > 10 THEN RAISE EXCEPTION 'wallet: 비정규 티켓은 한 번에 1~10장입니다'; END IF;
    v_memo := '비정규 티켓 ' || p_qty || '장';
  ELSE
    RAISE EXCEPTION 'wallet: 알 수 없는 티켓 %', p_kind;
  END IF;
  IF v_price IS NULL OR v_price <= 0 THEN RAISE EXCEPTION 'wallet: 티켓 가격이 정해지지 않았습니다'; END IF;

  v_ledger := wallet_apply(p_team_id, p_player_id, 'purchase', -(v_price * p_qty), v_memo, 'ticket', NULL, p_actor);
  INSERT INTO wallet_tickets (team_id, league_player_id, kind, month, price, purchase_ledger_id, actor_label)
  SELECT p_team_id, p_player_id, p_kind, CASE WHEN p_kind = 'regular_pass' THEN p_month END, v_price, v_ledger.id, p_actor
    FROM generate_series(1, p_qty);
  RETURN p_qty;
END;
$$;

-- 비정규 티켓 사용 — 가장 먼저 산 미사용 티켓 한 장(다음 단계: 팀 배치 때 부른다).
CREATE OR REPLACE FUNCTION wallet_use_ticket(
  p_team_id UUID, p_player_id UUID, p_date DATE, p_note TEXT, p_actor TEXT
) RETURNS wallet_tickets
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_t wallet_tickets;
BEGIN
  SELECT * INTO v_t FROM wallet_tickets
   WHERE team_id = p_team_id AND league_player_id = p_player_id AND kind = 'non_regular' AND status = 'active'
   ORDER BY created_at, id
   LIMIT 1
   FOR UPDATE SKIP LOCKED;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet: 남은 비정규 티켓이 없습니다'; END IF;
  UPDATE wallet_tickets SET status = 'used', used_date = p_date, used_note = p_note, actor_label = p_actor, updated_at = now()
   WHERE id = v_t.id RETURNING * INTO v_t;
  RETURN v_t;
END;
$$;

-- 티켓 돌려주기(어드민 판단) — 포인트를 되돌려주고 티켓은 'returned' 로 남긴다(지우지 않는다).
CREATE OR REPLACE FUNCTION wallet_return_ticket(
  p_team_id UUID, p_ticket_id UUID, p_note TEXT, p_actor TEXT
) RETURNS wallet_tickets
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_t wallet_tickets;
  v_ledger wallet_ledger;
BEGIN
  SELECT * INTO v_t FROM wallet_tickets WHERE id = p_ticket_id AND team_id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet: 티켓을 찾을 수 없습니다'; END IF;
  IF v_t.status = 'returned' THEN RAISE EXCEPTION 'wallet: 이미 돌려준 티켓입니다'; END IF;
  IF v_t.price > 0 THEN
    v_ledger := wallet_apply(p_team_id, v_t.league_player_id, 'refund', v_t.price,
      CASE WHEN v_t.kind = 'regular_pass' THEN '정규권 ' || TO_CHAR(v_t.month, 'YYYY"년" FMMM"월"') ELSE '비정규 티켓' END
        || ' 돌려줌' || COALESCE(' — ' || NULLIF(p_note, ''), ''),
      'ticket', v_t.id, p_actor);
  END IF;
  UPDATE wallet_tickets SET status = 'returned', return_ledger_id = v_ledger.id, returned_by_label = p_actor,
         returned_note = p_note, updated_at = now()
   WHERE id = v_t.id RETURNING * INTO v_t;
  RETURN v_t;
END;
$$;

REVOKE ALL ON FUNCTION wallet_refundable(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION wallet_review_charge(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION wallet_review_refund(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION wallet_buy_ticket(UUID, UUID, TEXT, DATE, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION wallet_use_ticket(UUID, UUID, DATE, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION wallet_return_ticket(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

UPDATE teams
   SET wallet_rules = '{"bonus_min": 50000, "bonus_pct": 10, "regular_pass_price": 28000, "non_regular_price": 12000}'::jsonb
 WHERE id = 'ec4b250b-e3ab-4f7e-a83d-9d9cb6816981';
