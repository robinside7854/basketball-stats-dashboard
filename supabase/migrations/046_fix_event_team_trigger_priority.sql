-- ─────────────────────────────────────────────────────────────────
-- league_events_set_team 트리거 수정:
--   비정규/임시 출전(league_game_players) 우선 → 정규(league_player_quarters) 폴백
--
-- 배경:
--   기존 트리거(024 migration)는 league_player_quarters 만 조회 → 정규 멤버십이 없는
--   임시 출전 선수의 이벤트는 team_id 가 NULL 로 남았음.
--   → 팀별 카드 합 ≠ 분기 전체 의 원인 (045 백필 스크립트로 기존 786건 해결)
--
-- 이 마이그레이션:
--   향후 새 이벤트 입력 시 자동으로 league_game_players 를 먼저 조회하여 채움
--
-- ⚠ DDL 이므로 service role REST 로는 실행 불가.
-- ⚠ Supabase Dashboard → SQL Editor 에서 직접 실행.
-- ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION league_events_set_team()
RETURNS TRIGGER AS $$
DECLARE
  v_quarter_id UUID;
BEGIN
  IF NEW.team_id IS NULL AND NEW.league_player_id IS NOT NULL THEN

    -- 우선순위 ① league_game_players (게임별 배정 — 비정규/타팀 임시 출전이 정규보다 우선)
    SELECT lgp.team_id INTO NEW.team_id
      FROM league_game_players lgp
     WHERE lgp.league_game_id   = NEW.league_game_id
       AND lgp.league_player_id = NEW.league_player_id
       AND lgp.team_id IS NOT NULL
     LIMIT 1;

    -- 우선순위 ② league_player_quarters (정규 분기 팀 — 위에서 못 찾은 경우만)
    IF NEW.team_id IS NULL THEN
      SELECT g.quarter_id INTO v_quarter_id
        FROM league_games g
       WHERE g.id = NEW.league_game_id;

      IF v_quarter_id IS NOT NULL THEN
        SELECT lpq.team_id INTO NEW.team_id
          FROM league_player_quarters lpq
         WHERE lpq.quarter_id        = v_quarter_id
           AND lpq.league_player_id  = NEW.league_player_id
         LIMIT 1;
      END IF;
    END IF;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 트리거 자체는 024 에서 생성된 것을 그대로 재사용 (함수만 OR REPLACE)

-- ── 검증 쿼리 (실행 후 확인) ──────────────────────────────────────
-- 함수가 새 정의로 잘 갱신됐는지 확인
SELECT
  proname,
  pg_get_functiondef(oid) AS function_body
FROM pg_proc
WHERE proname = 'league_events_set_team';
