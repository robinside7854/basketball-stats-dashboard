-- =============================================
-- 087_team_scoped_roster_auth.sql
-- 명단과 회원 계정을 경기묶음이 아니라 팀에 매단다
-- =============================================
-- 배경
--   league_players 와 league_user_accounts 가 league_id(경기묶음)에 매여 있다.
--   한 팀이 리그와 대회를 함께 운영하면 같은 사람이 묶음마다 다른 행이 되고,
--   회원은 묶음을 옮길 때마다 로그아웃되고 재가입을 요구받는다.
--
--   팀이 명단과 회원의 주인이다. 대회에 누가 나가는지는 대회마다 등록해서 정한다
--   (league_player_quarters — 이미 있는 개념이라 새로 만들지 않는다).
--
-- 이 마이그레이션은 컬럼 추가 + 백필 + 인덱스만 한다.
--   league_id 는 지우지 않는다 — 39개 파일이 그걸로 읽고 있어서, 한 번에 없애면
--   어디가 깨졌는지 알 수 없다. 읽기 경로를 옮긴 뒤 별도로 정리한다.
-- =============================================

ALTER TABLE league_players       ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE league_user_accounts ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);

COMMENT ON COLUMN league_players.team_id       IS '명단의 주인. 같은 팀의 모든 경기묶음이 이 명단을 공유한다. 대회 참가 인원은 league_player_quarters 로 따로 등록.';
COMMENT ON COLUMN league_user_accounts.team_id IS '계정의 주인. 팀 단위라 리그↔대회를 오가도 로그인이 유지된다.';

-- 백필 — 지금은 묶음마다 명단이 따로이므로 각 행의 league 가 속한 팀을 넣으면 된다.
UPDATE league_players p
   SET team_id = l.team_id
  FROM leagues l
 WHERE l.id = p.league_id AND p.team_id IS NULL;

UPDATE league_user_accounts a
   SET team_id = l.team_id
  FROM leagues l
 WHERE l.id = a.league_id AND a.team_id IS NULL;

-- 팀 기준 조회가 새 주 경로가 되므로 인덱스를 준다.
CREATE INDEX IF NOT EXISTS league_players_team_idx       ON league_players(team_id);
CREATE INDEX IF NOT EXISTS league_user_accounts_team_idx ON league_user_accounts(team_id);

-- 로그인 아이디는 이제 팀 안에서 유일해야 한다.
--   묶음마다 계정이 따로일 때는 같은 아이디가 여러 묶음에 존재할 수 있었지만,
--   팀 단위로 합치면 그건 같은 사람 둘이 된다.
--   ⚠ 기존 데이터에 팀 내 중복이 있으면 이 인덱스 생성이 실패한다 — 그 경우
--     실패를 그대로 보고하고, 중복을 지우지 말 것(어느 쪽이 진짜인지 사람이 판단해야 한다).
CREATE UNIQUE INDEX IF NOT EXISTS league_user_accounts_team_login_uniq
  ON league_user_accounts(team_id, login_id) WHERE team_id IS NOT NULL;
