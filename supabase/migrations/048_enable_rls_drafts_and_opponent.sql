-- ─────────────────────────────────────────────────────────────────
-- RLS 보안 조치 — 9개 테이블 활성화
--
-- list_tables advisor 경고 해소.
--
-- 그룹 A — 강력 보호 (RLS 활성, 정책 없음, service role 전용):
--   league_draft_codes, league_drafts, league_draft_picks
--   → 모든 draft API 가 admin client (service role) 로 동작하므로
--     RLS 우회됨. anon key 보유자는 일체 접근 불가.
--   → 단장 코드 bcrypt 해시·라벨 등 민감 정보 보호.
--
-- 그룹 B — RLS 활성 + allow_all (기존 anon API 호환):
--   opponent_teams, opponent_players, opponent_games,
--   opponent_game_events, opponent_player_minutes,
--   tournament_players
--   → 기존 src/app/api/opponent-*, /tournament-players API 가
--     anon client 로 작동하기 때문. 실질 보안은 현재와 동일하지만
--     advisor 경고는 해소.
--   → 추후 해당 API 들을 admin client 로 전환하면 이 정책 삭제로 강화 가능.
--
-- 이미 Supabase MCP 로 적용 완료. 이 파일은 일관성 유지용 기록.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE league_draft_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_drafts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_draft_picks  ENABLE ROW LEVEL SECURITY;

ALTER TABLE opponent_teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_opponent_teams ON opponent_teams
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE opponent_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_opponent_players ON opponent_players
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE opponent_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_opponent_games ON opponent_games
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE opponent_game_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_opponent_game_events ON opponent_game_events
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE opponent_player_minutes ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_opponent_player_minutes ON opponent_player_minutes
  FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE tournament_players ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_tournament_players ON tournament_players
  FOR ALL USING (true) WITH CHECK (true);
