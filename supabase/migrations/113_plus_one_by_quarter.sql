-- =============================================
-- 113_plus_one_by_quarter.sql
-- +1 을 쿼터 단위로 — 전반과 후반의 +1 선수가 다른 경우
-- =============================================
-- 배경
--   지금까지 +1 지정은 전부 **경기 단위**였다(110 의 plus_one_extra_ids · plus_one_player_id ·
--   league_players.plus_one). 그런데 실제 대회에서는 전반과 후반의 +1 선수가 다른 경우가 있다.
--   경기 단위로는 둘 중 하나만 고를 수 있어서, 어느 쪽으로 정하든 절반이 틀린 점수가 된다.
--
-- 모양
--   { "<league_player_id>": [1, 2] }  — 그 선수의 +1 은 1·2쿼터에서만 붙는다.
--   키가 없으면(또는 컬럼이 NULL) 전 쿼터 적용 = **기존 동작 그대로**.
--   그래서 이 마이그레이션은 기존 경기 273건의 채점을 하나도 바꾸지 않는다.
--
-- 왜 별도 표가 아니라 JSONB 인가
--   집계 코드가 이미 league_games 행을 통째로 읽어 +1 을 판정한다(GamePlusOne).
--   표를 따로 만들면 **집계 26곳이 전부 조회를 하나씩 더 해야** 하고, 하나라도 빠뜨리면
--   그 화면만 조용히 옛 판정으로 돌아간다 — 110 이 이미 남긴 경고다.
--
-- ⚠ league_games 를 새로 select 하는 집계는 plus_one_extra_ids 와 함께
--   **plus_one_quarters 도 반드시 읽어야 한다.** 빠뜨리면 그 화면만 전 쿼터 +1 로 계산된다.
-- =============================================

ALTER TABLE league_games ADD COLUMN IF NOT EXISTS plus_one_quarters JSONB;

COMMENT ON COLUMN league_games.plus_one_quarters IS
  '선수별 +1 유효 쿼터. {"<league_player_id>": [1,2]} — 그 선수의 +1 은 이 쿼터에서만 붙는다. 키가 없거나 컬럼이 NULL 이면 전 쿼터 적용(기존 동작). 판정 정본은 scoring.ts 의 isPlusOneFor().';
