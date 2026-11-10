-- 132: 한 팀 안에서 한 선수에게 계정은 하나 (2026-11-10 코드 리뷰)
--   (league_id, league_player_id) 유일은 있지만, 계정은 팀 단위라 리그·대회 묶음에서 동시에 가입하면
--   같은 선수에게 계정이 둘 생길 수 있었다. 적용 전 실측: 중복 0건.
CREATE UNIQUE INDEX IF NOT EXISTS league_user_accounts_team_player_uniq
  ON league_user_accounts (team_id, league_player_id) WHERE team_id IS NOT NULL;
