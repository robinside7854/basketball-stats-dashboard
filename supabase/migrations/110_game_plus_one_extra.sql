-- 경기 한정 플러스원 추가 지정
--
-- 배경
--   +1 판정은 지금까지 두 갈래였다.
--     1) `league_games.plus_one_player_id` — "이 경기의 +1 은 이 사람 하나" (배타 지정).
--        같은 팀에 +1 선수가 둘 이상일 때 하나를 고르는 **충돌 해소용**이라, 한 명 더
--        *추가* 하는 데는 쓸 수 없다. 쓰면 나머지 +1 선수가 전부 빠진다.
--     2) `league_players.plus_one` — 선수 단위 **전역** 플래그.
--        켜는 순간 **과거 마감 경기까지 소급**된다. 미라클은 plus_one_bonus.amount=1 이라
--        그 선수의 과거 야투마다 1점씩 붙어 점수·순위·기록이 통째로 바뀐다.
--
--   즉 "이번 경기만 이 사람도 +1" 을 표현할 방법이 없었다. 대회 연습처럼 그날만 룰이
--   달라지는 경우에 매번 막힌다(2026-08-23, 허승용 — 과거 이벤트 451건이라 전역 플래그 불가).
--
-- 규칙
--   `plus_one_extra_ids` 에 담긴 선수는 **그 경기에서만** +1 이다. 기존 두 갈래에 *더해지는*
--   집합이라 배타 지정(plus_one_player_id)과 달리 다른 +1 선수를 밀어내지 않는다.
--   판정 정본은 `src/lib/stats/scoring.ts` 의 `isPlusOneFor()` — 여기서만 푼다.
--
-- 왜 배열인가
--   +1 판정 지점이 28곳인데 전부 `league_games` 행을 이미 읽고 있다. 별도 테이블로 빼면
--   그 28곳에 조인이 하나씩 늘어난다. 경기당 인원이 한 자릿수라 배열로 충분하다.

ALTER TABLE league_games
  ADD COLUMN IF NOT EXISTS plus_one_extra_ids UUID[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN league_games.plus_one_extra_ids IS
  '이 경기에서만 +1 로 치는 선수들. plus_one_player_id(배타 지정)·league_players.plus_one(전역)에 더해진다. 판정은 scoring.ts isPlusOneFor().';
