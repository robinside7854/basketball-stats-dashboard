-- 136 · 운영진(팀 어드민)은 정규권 무료 (2026-11-11 운영진)
--   wallet_buy_regular_pass 에 p_free 를 더한 6인자판. 무료면 값 0 · 할인 티켓 안 씀 · 장부 행 없음(0P) · 티켓 행 price 0.
--   판매 기간 · 정원 · 한 달 한 장 검사는 그대로(운영진 정규권도 정원 18 안에 든다).
--   누가 운영진인지는 서버(라우트)가 매 요청 league_user_accounts.role='admin' 으로 판정해 넘긴다.
--   옛 5인자판은 그대로 둔다(지우지 않음) — 앱은 이제 6인자판만 부른다.
CREATE OR REPLACE FUNCTION wallet_buy_regular_pass(
  p_team_id UUID, p_player_id UUID, p_month DATE, p_use_tickets INTEGER, p_actor TEXT, p_free BOOLEAN
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
  -- 운영진(팀 어드민)은 무료 — 할인 티켓도 쓰지 않는다(2026-11-11 운영진). 판매 기간·정원·중복 검사는 그대로.
  IF COALESCE(p_free, false) THEN v_n := 0; v_pay := 0; END IF;
  v_label := TO_CHAR(p_month, 'YYYY"년" FMMM"월"');

  IF v_n > 0 THEN
    UPDATE wallet_tickets SET status = 'used', used_note = '정규권 할인 (' || v_label || ')', actor_label = p_actor, updated_at = now()
     WHERE id IN (SELECT id FROM wallet_tickets
                   WHERE team_id = p_team_id AND league_player_id = p_player_id AND kind = 'non_regular' AND status = 'active'
                   ORDER BY created_at, id LIMIT v_n FOR UPDATE);
  END IF;

  v_memo := '정규권 ' || v_label || CASE WHEN COALESCE(p_free, false) THEN ' (운영진 무료)' WHEN v_n > 0 THEN ' (비정규 티켓 ' || v_n || '장 할인)' ELSE '' END;
  IF v_pay > 0 THEN
    SELECT id INTO v_ledger_id FROM wallet_apply(p_team_id, p_player_id, 'purchase', -v_pay, v_memo, 'ticket', NULL, p_actor);
  END IF;
  INSERT INTO wallet_tickets (team_id, league_player_id, kind, month, price, purchase_ledger_id, actor_label)
  VALUES (p_team_id, p_player_id, 'regular_pass', p_month, v_pay, v_ledger_id, p_actor);
  RETURN v_n;
END;
$$;
REVOKE ALL ON FUNCTION wallet_buy_regular_pass(UUID, UUID, DATE, INTEGER, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
