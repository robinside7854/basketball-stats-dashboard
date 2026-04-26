-- 026_league_plus_one.sql
-- 리그에 플러스원(+1) 선수 나이 기준 추가
-- 해당 나이 이상인 선수는 자유투 제외 득점에 +1 가산

ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS plus_one_age INT DEFAULT NULL;

-- plus_one_age IS NULL → 플러스원 제도 미사용
-- plus_one_age = 40  → 만 40세 이상 선수에게 +1 적용
