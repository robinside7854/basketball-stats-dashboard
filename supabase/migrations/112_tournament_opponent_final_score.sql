-- =============================================
-- 112_tournament_opponent_final_score.sql
-- 대회 상대팀 최종 점수 — 마감할 때 한 번에 입력
-- =============================================
-- 배경
--   대회는 상대 선수를 기록하지 않는다(우리 동호회 통계 도구이고 상대 명단도 모른다).
--   그래도 점수는 남아야 승패·전적이 성립한다. 처음에는 기록 중 [+1][+2][+3] 로 상대 득점을
--   하나씩 쌓게 했는데(파란날개의 두 방식 중 하나), 사용자가 **경기 끝에 한 번에 넣는 쪽**을
--   택했다 — 우리 팀 기록만으로도 손이 모자란데 상대 득점까지 실시간으로 따라가기 어렵다.
--
-- 왜 away_score 를 직접 쓰지 않는가
--   home_score/away_score 는 `POST /games/[gameId]/recompute` 가 **이벤트에서 재계산해
--   덮어쓰는** 값이다. 거기 손으로 넣으면 다음 재계산 때 조용히 사라진다.
--   그래서 "사람이 넣은 값"을 따로 두고, 재계산이 그 값을 상대 쪽 점수로 채택한다.
--
-- 우리 팀 점수는 여기 없다 — 항상 이벤트에서 나온다(그게 이 도구의 존재 이유다).
--
-- 마감된 경기 수정
--   마감 해제 → 값 수정 → 다시 마감. 별도 경로를 만들지 않았다.
--   이 컬럼은 is_complete 와 무관하게 언제든 PATCH 로 바뀌고, 마감 때 recompute 가 다시 돈다.
-- =============================================

ALTER TABLE league_games ADD COLUMN IF NOT EXISTS opponent_score_manual INTEGER;

-- 상한 300 은 오타 방어선이다(세 자리를 잘못 눌러 3000 이 들어가는 것 정도만 막는다).
ALTER TABLE league_games DROP CONSTRAINT IF EXISTS league_games_opponent_score_manual_check;
ALTER TABLE league_games ADD  CONSTRAINT league_games_opponent_score_manual_check
  CHECK (opponent_score_manual IS NULL OR (opponent_score_manual >= 0 AND opponent_score_manual <= 300));

COMMENT ON COLUMN league_games.opponent_score_manual IS
  '대회 상대(외부)팀의 최종 점수 — 마감할 때 손으로 넣는다. NULL 이면 이벤트 합산(opp_score_*)을 쓴다. 우리 팀 점수는 항상 이벤트에서 나온다.';
