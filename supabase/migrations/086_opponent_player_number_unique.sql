-- 상대(외부) 선수 즉석 등록 중복 방지 (2026-08-05)
--
-- opponent-players POST(games/[gameId]/opponent-players)는 "같은 경기·같은 팀에
-- 같은 등번호가 이미 있으면 재사용" 을 애플리케이션 코드에서 체크-후-삽입
-- (check-then-insert) 으로만 하고 있었다. 이를 뒷받침하는 DB 제약이 없어서,
-- 기록 중 같은 버튼을 두 번 누르면(더블탭·통신 재시도로 인한 동시 요청) 두 요청이
-- 동시에 "기존 없음" 을 보고 각자 league_players + league_game_players 를 새로 만들어
-- 등번호가 같은 상대 선수가 두 명 생길 수 있었다.
--
-- 문제: 코드의 중복 판정 키는 (league_game_id, team_id, 등번호) 인데, 등번호(number)는
-- league_players 테이블에 있고 경기·팀 스코프는 league_game_players 테이블에 있어
-- 테이블 하나에 걸린 UNIQUE 로는 표현할 수 없다. 그래서 이 라우트가 실제로 참조하는
-- "이 경기에서 이 팀 소속으로 배정된 등번호" 를 league_game_players 에도 함께
-- 저장(비정규화)하고, 그 위에 부분 UNIQUE 인덱스를 건다.
--
-- number 는 opponent-players 라우트에서만 채운다. irregular-players 라우트(우리 팀
-- 비정규 출전 배정)는 number 를 넘기지 않으므로 그 행들은 NULL 로 남고,
-- WHERE number IS NOT NULL 조건 덕에 이 인덱스의 영향을 받지 않는다.
ALTER TABLE league_game_players ADD COLUMN IF NOT EXISTS number INTEGER;

-- 적용 전 실사용 데이터 기준(코드의 조인 판정 키)으로 기존 중복이 없음을 확인했다
-- (league_game_id, team_id, league_players.number 기준 GROUP BY — 2026-08-05, 0건).
-- number 컬럼 자체는 신규라 전 행이 NULL 이므로 이 인덱스 생성은 항상 성공한다.
CREATE UNIQUE INDEX IF NOT EXISTS league_game_players_team_number_unique
  ON league_game_players (league_game_id, team_id, number)
  WHERE number IS NOT NULL;
