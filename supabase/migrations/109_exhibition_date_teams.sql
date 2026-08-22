-- 친선전 전용 임시팀 (날짜 스코프)
--
-- 배경
--   league_games.home_team_id / away_team_id 는 league_teams 를 참조한다. 그런데
--   미라클 리그의 league_teams 는 분기 로테이션용 3팀뿐이다(분기마다 이름만 override).
--   친선전은 그날 모인 사람으로 팀을 즉석에서 짜는데, 명단(선수)은 이미 스팟 구성으로
--   동작하지만 팀 껍데기가 3개로 고정돼 있어서 "그날만 존재하는 팀"을 만들 수 없었다.
--   결과적으로 친선전을 기록하려면 실제와 무관한 상시 3팀 중 둘을 억지로 골라야 했다.
--
-- 규칙 (이 컬럼 하나가 전부다)
--   exhibition_date IS NULL   → 상시팀. 순위·명단·드래프트·일정 편성에 등장한다.
--   exhibition_date = 'D'     → D 날짜 친선전 전용 임시팀.
--                               팀 목록 API 기본 응답과 팀 열거 지점에서 전부 제외된다.
--
-- 왜 별도 테이블이 아니라 컬럼인가
--   league_games / league_game_events / league_game_players 가 모두 league_teams(id) 를
--   FK 로 물고 있다. 임시팀을 다른 테이블로 빼면 이 세 곳의 team_id 가 두 출처를 가리키게
--   되어 기록 파이프라인 전체가 분기 처리를 해야 한다. 같은 테이블에 두고 "어디에 노출되는가"
--   만 가르는 쪽이 기존 기록 경로를 하나도 건드리지 않는다.

ALTER TABLE league_teams ADD COLUMN IF NOT EXISTS exhibition_date DATE;

COMMENT ON COLUMN league_teams.exhibition_date IS
  'NULL=상시팀. 값이 있으면 그 날짜 친선전 전용 임시팀 — 순위/명단/드래프트/일정에서 제외된다.';

-- 임시팀 조회는 항상 (league_id, exhibition_date) 로 들어온다. 상시팀 조회는 부분 인덱스
-- 밖이라 영향 없음.
CREATE INDEX IF NOT EXISTS league_teams_exhibition_date_idx
  ON league_teams (league_id, exhibition_date)
  WHERE exhibition_date IS NOT NULL;

-- 같은 날짜에 같은 이름의 임시팀이 둘이면 기록원이 드롭다운에서 구분할 수 없다.
-- (상시팀은 동명 허용 — 기존 데이터를 깨지 않기 위해 부분 인덱스로 임시팀만 건다)
CREATE UNIQUE INDEX IF NOT EXISTS league_teams_exhibition_name_unique
  ON league_teams (league_id, exhibition_date, name)
  WHERE exhibition_date IS NOT NULL;
