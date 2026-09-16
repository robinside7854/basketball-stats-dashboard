-- 116: 테스트 세션의 팀장 보관 (2026-09-16)
--
-- is_test 세션은 league_team_quarter_leaders 에 쓰지 않는다(115). 그러면 리허설 중 화면을 다시
-- 열 때 팀장이 비어 버려 풀에서 팀장이 빠지지 않는 문제가 생긴다. 세션 행 안에 jsonb 로 보관한다.
-- 형태: { "<team_id>": "<league_player_id>" } — 실전 세션은 항상 NULL.
ALTER TABLE league_drafts
  ADD COLUMN IF NOT EXISTS test_leaders JSONB;

COMMENT ON COLUMN league_drafts.test_leaders IS '테스트 세션 전용 팀장 { team_id: league_player_id } — 리그 표에는 쓰지 않는다';
