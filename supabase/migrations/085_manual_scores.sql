-- =============================================
-- 085_manual_scores.sql
-- 수기 입력 점수 보호 — 이벤트에서 유도하면 안 되는 경기를 표시한다
-- =============================================
-- 배경
--   trg_events_recompute_score 가 이벤트가 바뀔 때마다 league_games 의
--   home_score/away_score 를 이벤트 합으로 다시 계산한다. 리그형에서는 맞다 —
--   양 팀 득점이 전부 이벤트로 기록되기 때문이다.
--
--   그런데 이관된 대회형 경기는 다르다. 레거시는 상대 득점을 opp_score 이벤트로
--   177건(322점)만 남겼고, 진짜 상대 점수는 games.opponent_score 에 수기로
--   들어 있었다. 이벤트에서 유도하면 상대 점수가 실제보다 훨씬 작아진다.
--   실제로 단계 B 에서 43경기의 상대 점수가 깎였다(복구함).
--
--   → "이 경기의 점수는 사람이 적은 것" 이라고 표시하고, 재계산이 그걸 존중하게 한다.
--
-- 왜 legacy_id 로 판별하지 않나: legacy_id 는 단계 D 에서 제거되는 임시 컬럼이다.
--   그때 이 보호가 같이 사라지면 안 된다. 또 "수기 점수" 는 이관 여부와 무관한
--   영구 개념이다 — 앞으로도 이벤트 없이 스코어만 적는 경기가 있을 수 있다.
-- =============================================

ALTER TABLE league_games ADD COLUMN IF NOT EXISTS scores_manual BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN league_games.scores_manual IS
  '점수를 사람이 직접 적은 경기. true 면 이벤트 합으로 재계산하지 않는다(이벤트가 경기의 일부만 담고 있을 때).';

-- 이관된 경기는 전부 수기 점수다. 상대 득점이 이벤트에 완전히 담겨 있지 않다.
UPDATE league_games SET scores_manual = true WHERE legacy_id IS NOT NULL;

-- 재계산 함수가 플래그를 존중하게 한다.
--   RETURN QUERY 로 현재 값을 그대로 돌려주는 이유: 호출부가 반환값을 쓰고 있을 수 있어
--   "아무것도 안 함" 과 "0을 돌려줌" 은 다르다.
CREATE OR REPLACE FUNCTION public.recompute_league_game_score(p_game_id uuid)
 RETURNS TABLE(home_score integer, away_score integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_home_team_id UUID;
  v_away_team_id UUID;
  v_manual BOOLEAN;
  v_hs INT;
  v_as INT;
BEGIN
  SELECT g.home_team_id, g.away_team_id, g.scores_manual
    INTO v_home_team_id, v_away_team_id, v_manual
    FROM league_games g
   WHERE g.id = p_game_id;

  -- 수기 점수 경기는 건드리지 않고 저장된 값을 그대로 돌려준다.
  IF v_manual THEN
    RETURN QUERY SELECT g.home_score, g.away_score FROM league_games g WHERE g.id = p_game_id;
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN e.team_id = v_home_team_id THEN e.points ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN e.team_id = v_away_team_id THEN e.points ELSE 0 END), 0)
  INTO v_hs, v_as
  FROM league_game_events e
  WHERE e.league_game_id = p_game_id
    AND e.points > 0;

  UPDATE league_games
     SET home_score = v_hs,
         away_score = v_as
   WHERE id = p_game_id;

  RETURN QUERY SELECT v_hs, v_as;
END;
$function$;
