-- =============================================
-- 130_wallet_pass_sales.sql
-- 정규권 판매 기간 · 정원 · 비정규 티켓 할인 · 입금 알림 「확인함」 (2026-11-10 운영진)
-- =============================================
-- ① 정규권은 인기가 많아 운영진이 달마다 「오픈」을 알리고, 정해진 기간에 정원(18명)까지만 판다.
--    → wallet_pass_sales(팀 · 달 · 여는 때 · 닫는 때 · 정원). 판매가 열려 있을 때만 회원이 정규권을 산다.
--    정원 검사는 판매 행을 잠그고 하는 DB 함수 하나(wallet_buy_regular_pass) — 동시에 눌러도 19번째는 막힌다.
-- ② 남은 비정규 티켓은 정규권을 살 때 할인으로 쓸 수 있다(장당 비정규 가격만큼, 정규권 값을 넘지 않게).
--    쓴 티켓은 'used'(used_note 「정규권 할인 …」) 로 남기고, 정규권 행의 price 는 실제로 낸 포인트.
-- ③ 「짝 없음」 입금 알림을 어드민이 처리했거나 넘겼으면 resolved_at 을 채운다 → 어드민 홈 「입금 매칭 불가 N건」에서 빠진다.
-- =============================================

CREATE TABLE IF NOT EXISTS wallet_pass_sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  month           DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  opens_at        TIMESTAMPTZ NOT NULL,
  closes_at       TIMESTAMPTZ NOT NULL,
  capacity        INTEGER NOT NULL DEFAULT 18 CHECK (capacity BETWEEN 1 AND 200),
  closed_early_at TIMESTAMPTZ,
  opened_by_label TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (closes_at > opens_at),
  UNIQUE (team_id, month)
);
ALTER TABLE wallet_pass_sales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wallet_pass_sales FROM PUBLIC, anon, authenticated;

ALTER TABLE wallet_bank_events ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE wallet_bank_events ADD COLUMN IF NOT EXISTS resolved_by_label TEXT;

-- 정규권 사기 — 판매 기간 · 정원 · 비정규 티켓 할인을 한 트랜잭션에서.
--   p_use_tickets = 할인에 쓰고 싶은 비정규 티켓 수(실제로는 가진 장수 · 정규권 값 안에서만 쓴다).
--   돌려주는 값 = 할인에 쓴 티켓 수.
CREATE OR REPLACE FUNCTION wallet_buy_regular_pass(
  p_team_id UUID, p_player_id UUID, p_month DATE, p_use_tickets INTEGER, p_actor TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_sale wallet_pass_sales;
  v_rules JSONB;
  v_price INTEGER;
  v_unit INTEGER;
  v_sold INTEGER;
  v_have INTEGER;
  v_n INTEGER;
  v_pay INTEGER;
  v_ledger_id UUID;
  v_label TEXT;
  v_memo TEXT;
BEGIN
  SELECT * INTO v_sale FROM wallet_pass_sales WHERE team_id = p_team_id AND month = p_month FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'wallet: 이 달 정규권은 아직 판매하지 않아요'; END IF;
  IF now() < v_sale.opens_at THEN RAISE EXCEPTION 'wallet: 정규권 판매가 아직 열리지 않았어요'; END IF;
  IF now() >= v_sale.closes_at OR v_sale.closed_early_at IS NOT NULL THEN RAISE EXCEPTION 'wallet: 정규권 판매가 마감됐어요'; END IF;

  IF EXISTS (SELECT 1 FROM wallet_tickets WHERE team_id = p_team_id AND league_player_id = p_player_id
              AND kind = 'regular_pass' AND month = p_month AND status <> 'returned') THEN
    RAISE EXCEPTION 'wallet: 이미 그 달 정규권이 있습니다';
  END IF;
  SELECT count(*) INTO v_sold FROM wallet_tickets
   WHERE team_id = p_team_id AND kind = 'regular_pass' AND month = p_month AND status <> 'returned';
  IF v_sold >= v_sale.capacity THEN RAISE EXCEPTION 'wallet: 정규권이 다 팔렸어요(정원 %명)', v_sale.capacity; END IF;

  SELECT wallet_rules INTO v_rules FROM teams WHERE id = p_team_id;
  v_price := (v_rules->>'regular_pass_price')::INTEGER;
  v_unit := COALESCE((v_rules->>'non_regular_price')::INTEGER, 0);
  IF v_price IS NULL OR v_price <= 0 THEN RAISE EXCEPTION 'wallet: 티켓 가격이 정해지지 않았습니다'; END IF;

  -- 할인에 쓸 비정규 티켓: 원하는 장수 · 가진 장수 · 정규권 값 안(넘치는 장은 쓰지 않는다)
  SELECT count(*) INTO v_have FROM wallet_tickets
   WHERE team_id = p_team_id AND league_player_id = p_player_id AND kind = 'non_regular' AND status = 'active';
  v_n := GREATEST(0, LEAST(COALESCE(p_use_tickets, 0), v_have, CASE WHEN v_unit > 0 THEN v_price / v_unit ELSE 0 END));
  v_pay := v_price - v_n * v_unit;
  v_label := TO_CHAR(p_month, 'YYYY"년" FMMM"월"');

  IF v_n > 0 THEN
    UPDATE wallet_tickets SET status = 'used', used_note = '정규권 할인 (' || v_label || ')', actor_label = p_actor, updated_at = now()
     WHERE id IN (SELECT id FROM wallet_tickets
                   WHERE team_id = p_team_id AND league_player_id = p_player_id AND kind = 'non_regular' AND status = 'active'
                   ORDER BY created_at, id LIMIT v_n FOR UPDATE);
  END IF;

  v_memo := '정규권 ' || v_label || CASE WHEN v_n > 0 THEN ' (비정규 티켓 ' || v_n || '장 할인)' ELSE '' END;
  IF v_pay > 0 THEN
    SELECT id INTO v_ledger_id FROM wallet_apply(p_team_id, p_player_id, 'purchase', -v_pay, v_memo, 'ticket', NULL, p_actor);
  END IF;
  INSERT INTO wallet_tickets (team_id, league_player_id, kind, month, price, purchase_ledger_id, actor_label)
  VALUES (p_team_id, p_player_id, 'regular_pass', p_month, v_pay, v_ledger_id, p_actor);
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION wallet_buy_regular_pass(UUID, UUID, DATE, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
