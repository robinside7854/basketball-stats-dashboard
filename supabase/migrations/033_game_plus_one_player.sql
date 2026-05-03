-- 경기별 플러스원 선수 지정 (같은 팀에 2명 이상 플러스원이 있을 때 선택)
ALTER TABLE league_games
  ADD COLUMN IF NOT EXISTS plus_one_player_id UUID REFERENCES league_players(id);
