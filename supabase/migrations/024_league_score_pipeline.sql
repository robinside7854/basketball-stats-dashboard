-- 024_league_score_pipeline.sql
-- 분기별 날짜 범위 + 게임-분기 연결 + 이벤트 team_id + 점수 자동계산 트리거

-- ─────────────────────────────────────────────────────────────────
-- 1. league_quarters 에 날짜 범위 추가
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE league_quarters
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date   DATE;

CREATE INDEX IF NOT EXISTS idx_league_quarters_range
  ON league_quarters(league_id, start_date, end_date);

-- ─────────────────────────────────────────────────────────────────
-- 2. league_games 에 quarter_id 추가 (날짜→분기 연결)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE league_games
  ADD COLUMN IF NOT EXISTS quarter_id UUID REFERENCES league_quarters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_league_games_quarter ON league_games(quarter_id);

-- ─────────────────────────────────────────────────────────────────
-- 3. league_game_events 에 team_id 추가 (선수→팀 비정규화)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE league_game_events
  ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES league_teams(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_league_game_events_team
  ON league_game_events(league_game_id, team_id);

-- ─────────────────────────────────────────────────────────────────
-- 4. 날짜 → 분기 해결 헬퍼 함수
--    우선순위 1: start_date~end_date 범위 매칭
--    우선순위 2: 달력 분기 폴백 (Q1=1~3월, Q2=4~6월, Q3=7~9월, Q4=10~12월)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION resolve_league_quarter(p_league_id UUID, p_date DATE)
RETURNS UUID AS $$
DECLARE
  q_id UUID;
BEGIN
  -- 우선순위 1: 명시적 날짜 범위
  SELECT id INTO q_id
    FROM league_quarters
   WHERE league_id  = p_league_id
     AND start_date IS NOT NULL
     AND p_date BETWEEN start_date AND COALESCE(end_date, '9999-12-31'::date)
   ORDER BY start_date DESC
   LIMIT 1;
  IF q_id IS NOT NULL THEN RETURN q_id; END IF;

  -- 우선순위 2: is_current 플래그
  SELECT id INTO q_id
    FROM league_quarters
   WHERE league_id = p_league_id
     AND is_current = true
   LIMIT 1;
  IF q_id IS NOT NULL THEN RETURN q_id; END IF;

  -- 우선순위 3: 달력 분기 폴백
  SELECT id INTO q_id
    FROM league_quarters
   WHERE league_id = p_league_id
     AND year      = EXTRACT(YEAR FROM p_date)::INT
     AND quarter   = CEIL(EXTRACT(MONTH FROM p_date)::NUMERIC / 3)::INT
   LIMIT 1;
  RETURN q_id;
END;
$$ LANGUAGE plpgsql STABLE;

-- ─────────────────────────────────────────────────────────────────
-- 5. league_games INSERT/UPDATE → quarter_id 자동 설정
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION league_games_set_quarter()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.quarter_id IS NULL
     OR (TG_OP = 'UPDATE' AND OLD.date IS DISTINCT FROM NEW.date)
  THEN
    NEW.quarter_id := resolve_league_quarter(NEW.league_id, NEW.date);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_league_games_set_quarter ON league_games;
CREATE TRIGGER trg_league_games_set_quarter
  BEFORE INSERT OR UPDATE OF date, quarter_id ON league_games
  FOR EACH ROW EXECUTE FUNCTION league_games_set_quarter();

-- ─────────────────────────────────────────────────────────────────
-- 6. league_game_events INSERT → team_id 자동 설정
--    선수 → 분기 팀 배정 역추적
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION league_events_set_team()
RETURNS TRIGGER AS $$
DECLARE
  v_quarter_id UUID;
BEGIN
  IF NEW.team_id IS NULL AND NEW.league_player_id IS NOT NULL THEN
    SELECT g.quarter_id INTO v_quarter_id
      FROM league_games g
     WHERE g.id = NEW.league_game_id;

    IF v_quarter_id IS NOT NULL THEN
      SELECT lpq.team_id INTO NEW.team_id
        FROM league_player_quarters lpq
       WHERE lpq.quarter_id        = v_quarter_id
         AND lpq.league_player_id  = NEW.league_player_id
       LIMIT 1;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_league_events_set_team ON league_game_events;
CREATE TRIGGER trg_league_events_set_team
  BEFORE INSERT ON league_game_events
  FOR EACH ROW EXECUTE FUNCTION league_events_set_team();

-- ─────────────────────────────────────────────────────────────────
-- 7. 게임 점수 재계산 함수
--    home_score = 홈팀 선수 events.points 합산
--    away_score = 어웨이팀 선수 events.points 합산
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION recompute_league_game_score(p_game_id UUID)
RETURNS TABLE(home_score INT, away_score INT) AS $$
DECLARE
  v_home_team_id UUID;
  v_away_team_id UUID;
  v_hs INT;
  v_as INT;
BEGIN
  SELECT home_team_id, away_team_id
    INTO v_home_team_id, v_away_team_id
    FROM league_games
   WHERE id = p_game_id;

  SELECT
    COALESCE(SUM(CASE WHEN e.team_id = v_home_team_id THEN e.points ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN e.team_id = v_away_team_id THEN e.points ELSE 0 END), 0)
  INTO v_hs, v_as
  FROM league_game_events e
  WHERE e.league_game_id = p_game_id
    AND e.points > 0;

  UPDATE league_games
     SET home_score = v_hs,
         away_score = v_as
   WHERE id = p_game_id;

  RETURN QUERY SELECT v_hs, v_as;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────
-- 8. 이벤트 변경 → 점수 자동 재계산 트리거
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trg_fn_recompute_score()
RETURNS TRIGGER AS $$
DECLARE
  v_game_id UUID;
BEGIN
  v_game_id := COALESCE(NEW.league_game_id, OLD.league_game_id);
  PERFORM recompute_league_game_score(v_game_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_events_recompute_score ON league_game_events;
CREATE TRIGGER trg_events_recompute_score
  AFTER INSERT OR UPDATE OF points, team_id OR DELETE ON league_game_events
  FOR EACH ROW EXECUTE FUNCTION trg_fn_recompute_score();

-- ─────────────────────────────────────────────────────────────────
-- 9. 기존 데이터 백필
-- ─────────────────────────────────────────────────────────────────

-- 9-1. 기존 league_games → quarter_id 채우기
UPDATE league_games
   SET quarter_id = resolve_league_quarter(league_id, date)
 WHERE quarter_id IS NULL
   AND date IS NOT NULL;

-- 9-2. 기존 league_game_events → team_id 채우기
UPDATE league_game_events e
   SET team_id = lpq.team_id
  FROM league_games g
  JOIN league_player_quarters lpq
    ON lpq.quarter_id       = g.quarter_id
   AND lpq.league_player_id = e.league_player_id
 WHERE e.league_game_id = g.id
   AND e.team_id IS NULL
   AND g.quarter_id IS NOT NULL;

-- 9-3. 모든 완료 게임 점수 재계산
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM league_games WHERE is_complete = true
  LOOP
    PERFORM recompute_league_game_score(r.id);
  END LOOP;
END $$;
