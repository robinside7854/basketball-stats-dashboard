-- 2026-05-09 (토) 미라클모닝농구단 리그 경기 → 친선전 변경
-- 사유: 해당 일자 경기는 4쿼터 × 2경기 형식의 친선전이었으며
-- 리그 순위 집계에서 제외되어야 함.
--
-- 작업: league_games.is_exhibition = true
-- 영향: standings 자동 제외 (standings API에 is_exhibition=false 필터 적용됨)
--       개인 스탯에는 그대로 반영됨 (stats API는 친선 게임 포함)

BEGIN;

-- ── 1) 영향받을 게임 미리보기 (실행 결과 확인용) ───────────────
SELECT
  g.id,
  g.slot_num,
  g.round_num,
  g.date,
  g.is_exhibition AS before_exhibition,
  ht.name AS home_team,
  at.name AS away_team,
  g.home_score,
  g.away_score,
  g.is_started,
  g.is_complete
FROM league_games g
JOIN leagues l ON l.id = g.league_id
LEFT JOIN league_teams ht ON ht.id = g.home_team_id
LEFT JOIN league_teams at ON at.id = g.away_team_id
WHERE g.date = '2026-05-09'
  AND l.name = '미라클모닝농구단'
  AND l.season_year = 2026
ORDER BY g.slot_num NULLS LAST, g.round_num;

-- ── 2) 실제 변경 ──────────────────────────────────────────────
WITH target AS (
  SELECT g.id
  FROM league_games g
  JOIN leagues l ON l.id = g.league_id
  WHERE g.date = '2026-05-09'
    AND l.name = '미라클모닝농구단'
    AND l.season_year = 2026
    AND g.is_exhibition = false  -- 이미 친선전인 행은 건너뜀
)
UPDATE league_games
SET is_exhibition = true
WHERE id IN (SELECT id FROM target);

-- ── 3) 변경 후 확인 ───────────────────────────────────────────
SELECT
  g.slot_num,
  g.date,
  g.is_exhibition AS after_exhibition,
  ht.name AS home_team,
  at.name AS away_team,
  g.home_score || '-' || g.away_score AS score
FROM league_games g
JOIN leagues l ON l.id = g.league_id
LEFT JOIN league_teams ht ON ht.id = g.home_team_id
LEFT JOIN league_teams at ON at.id = g.away_team_id
WHERE g.date = '2026-05-09'
  AND l.name = '미라클모닝농구단'
  AND l.season_year = 2026
ORDER BY g.slot_num NULLS LAST;

COMMIT;
