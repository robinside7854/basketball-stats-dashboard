-- resolve_league_quarter 함수 수정:
-- 달력 분기(월 기반)를 최우선으로 사용
-- 1~3월=1Q, 4~6월=2Q, 7~9월=3Q, 10~12월=4Q

CREATE OR REPLACE FUNCTION resolve_league_quarter(p_league_id UUID, p_date DATE)
RETURNS UUID AS $$
DECLARE
  q_id UUID;
BEGIN
  -- 우선순위 1: 연도 + 달력 분기 (월 기반) — 가장 신뢰할 수 있는 기준
  SELECT id INTO q_id
    FROM league_quarters
   WHERE league_id = p_league_id
     AND year      = EXTRACT(YEAR FROM p_date)::INT
     AND quarter   = CEIL(EXTRACT(MONTH FROM p_date)::NUMERIC / 3)::INT
   LIMIT 1;
  IF q_id IS NOT NULL THEN RETURN q_id; END IF;

  -- 우선순위 2: 명시적 날짜 범위 (start_date/end_date)
  SELECT id INTO q_id
    FROM league_quarters
   WHERE league_id  = p_league_id
     AND start_date IS NOT NULL
     AND p_date BETWEEN start_date AND COALESCE(end_date, '9999-12-31'::date)
   ORDER BY start_date DESC
   LIMIT 1;
  IF q_id IS NOT NULL THEN RETURN q_id; END IF;

  -- 우선순위 3: is_current 플래그 (최후 수단)
  SELECT id INTO q_id
    FROM league_quarters
   WHERE league_id = p_league_id
     AND is_current = true
   LIMIT 1;
  RETURN q_id;
END;
$$ LANGUAGE plpgsql STABLE;
