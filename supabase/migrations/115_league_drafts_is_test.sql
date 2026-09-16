-- 115: 드래프트 테스트 세션 (2026-09-16)
--
-- 4Q 드래프트 리허설을 실제 리그 데이터에 남기지 않기 위한 플래그.
-- is_test = true 인 세션은 픽·팀장 지정이 league_player_quarters / league_team_quarter_leaders 에
-- 기록되지 않는다(픽 기록·풀·채팅·추첨은 세션 안에만 남는다). 화면은 TEST 배지로 구분한다.
-- 세션을 지우면(DELETE) 흔적이 전부 사라지고, 단장·감독관 코드는 분기에 남아 실전에 그대로 쓴다.
ALTER TABLE league_drafts
  ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN league_drafts.is_test IS '리허설용 세션 — 분기 소속·팀장을 리그에 반영하지 않는다';
