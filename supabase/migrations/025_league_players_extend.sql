-- league_players 테이블에 birth_date 컬럼 추가
-- position은 TEXT 유지 (멀티포지션은 쉼표 구분 문자열로 저장, 예: "PG,SF")
ALTER TABLE league_players
  ADD COLUMN IF NOT EXISTS birth_date DATE;
