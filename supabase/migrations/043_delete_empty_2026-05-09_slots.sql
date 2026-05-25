-- 2026-05-09 미라클모닝농구단 빈 슬롯 9개 삭제
-- 사유: 친선 4쿼터·2경기 모드로 재구성하기 위해 정규 슬롯을 비움
--       이후 스케줄 페이지의 "친선전 추가" 버튼으로 미라클/모닝 + 8슬롯 자동 생성
--
-- 안전장치: is_started=false AND is_complete=false AND home_team_id NULL only.
--           기록 진행된 슬롯은 절대 삭제되지 않음.
-- league_schedule_dates 레코드는 보존됨 (재생성 시 그대로 사용)

BEGIN;

-- ── 1) 삭제 대상 미리보기 ────────────────────────────────────
SELECT
  g.id, g.slot_num, g.date, g.is_started, g.is_complete,
  g.home_team_id, g.away_team_id,
  (SELECT COUNT(*) FROM league_game_events e WHERE e.league_game_id = g.id) AS event_count
FROM league_games g
JOIN leagues l ON l.id = g.league_id
WHERE g.date = '2026-05-09'
  AND l.name = '미라클모닝농구단'
  AND l.season_year = 2026
ORDER BY g.slot_num NULLS LAST;

-- ── 2) 정말 모두 비어있는지 확인 (안전 가드) ──────────────────
DO $$
DECLARE
  unsafe_count INT;
BEGIN
  SELECT COUNT(*) INTO unsafe_count
  FROM league_games g
  JOIN leagues l ON l.id = g.league_id
  WHERE g.date = '2026-05-09'
    AND l.name = '미라클모닝농구단'
    AND l.season_year = 2026
    AND (
      g.is_started = true
      OR g.is_complete = true
      OR EXISTS (SELECT 1 FROM league_game_events e WHERE e.league_game_id = g.id)
    );
  IF unsafe_count > 0 THEN
    RAISE EXCEPTION
      '5/9 슬롯 중 % 개에 기록·시작된 데이터가 있습니다. 삭제를 중단합니다.', unsafe_count;
  END IF;
END $$;

-- ── 3) 안전 삭제 ────────────────────────────────────────────
DELETE FROM league_games g
USING leagues l
WHERE g.league_id = l.id
  AND g.date = '2026-05-09'
  AND l.name = '미라클모닝농구단'
  AND l.season_year = 2026
  AND g.is_started = false
  AND g.is_complete = false;

-- ── 4) 삭제 후 확인 (0 rows 기대) ───────────────────────────
SELECT
  COUNT(*) AS remaining_games,
  (SELECT COUNT(*) FROM league_schedule_dates d
   JOIN leagues l ON l.id = d.league_id
   WHERE d.date = '2026-05-09'
     AND l.name = '미라클모닝농구단'
     AND l.season_year = 2026) AS schedule_date_preserved
FROM league_games g
JOIN leagues l ON l.id = g.league_id
WHERE g.date = '2026-05-09'
  AND l.name = '미라클모닝농구단'
  AND l.season_year = 2026;

COMMIT;
