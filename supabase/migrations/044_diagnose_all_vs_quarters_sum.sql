-- ─────────────────────────────────────────────────────────────────
-- 진단: 팀 구성 페이지에서 "전체" 스탯이 분기별 합계와 일치하는지 검증
--
-- 가설:
--   1) league_games.quarter_id = NULL 인 게임이 있으면
--      → 전체 모드에는 포함되지만 어떤 분기에도 포함 안 됨 → 전체 > 분기합
--   2) league_game_events.team_id 가 NULL이면
--      → 팀별 스탯에는 안 잡히지만 전체(no teamId) 스탯엔 잡힘
--   3) 두 조건이 동시에 발생하면 팀 카드별/전체 모드 모두 어긋남
--
-- ── 출력 해석 ────────────────────────────────────────────────────
--   Q1: quarter_id 가 NULL 인 게임이 있는가?
--   Q2: 그 게임들에 어떤 선수의 어떤 이벤트가 들어있는가?
--   Q3: team_id 가 NULL 인 이벤트 통계
--   Q4: 선수 한 명을 골라 전체 vs 분기별 합 비교
-- ─────────────────────────────────────────────────────────────────

-- ===== Q1: quarter_id 가 NULL 인 게임 =====
-- 결과: 0행이면 모든 게임이 분기에 귀속됨 → 가설 1 기각
SELECT
  '⚠ NULL quarter_id 게임' AS section,
  COUNT(*)                  AS null_quarter_games,
  COUNT(*) FILTER (WHERE is_started = true)  AS null_q_started,
  COUNT(*) FILTER (WHERE is_complete = true) AS null_q_complete,
  COUNT(*) FILTER (WHERE is_exhibition = true) AS null_q_exhibition,
  MIN(date)::text AS earliest,
  MAX(date)::text AS latest
FROM league_games
WHERE quarter_id IS NULL;

-- 만약 위가 0이 아니면 → 세부 목록
SELECT
  id, date, slot_num, round_num,
  is_started, is_complete, is_exhibition,
  home_score || '-' || away_score AS score
FROM league_games
WHERE quarter_id IS NULL
ORDER BY date DESC, slot_num
LIMIT 50;

-- ===== Q2: NULL quarter_id 게임에 기록된 선수 이벤트 =====
-- 이 이벤트들은 전체 모드에는 포함되지만 분기별 모드엔 누락됨
SELECT
  '⚠ NULL quarter 게임에 기록된 이벤트' AS section,
  COUNT(DISTINCT e.league_player_id) AS affected_players,
  COUNT(*) AS event_count,
  COUNT(*) FILTER (WHERE e.team_id IS NOT NULL) AS with_team_id,
  COUNT(*) FILTER (WHERE e.team_id IS NULL)     AS without_team_id
FROM league_game_events e
JOIN league_games g ON g.id = e.league_game_id
WHERE g.quarter_id IS NULL
  AND e.league_player_id IS NOT NULL
  AND e.type NOT IN ('sub_in','sub_out');

-- ===== Q3: team_id NULL 이벤트 통계 (started 게임 한정) =====
-- 이 이벤트들은 팀 카드(teamId 필터)엔 안 잡히고
-- 전체 모드(no teamId)엔 잡힘 → 같은 분기 안에서도 팀별합 ≠ 분기 전체
SELECT
  '⚠ team_id NULL 이벤트 (started 게임)' AS section,
  COUNT(*) AS null_team_events,
  COUNT(DISTINCT e.league_player_id) AS affected_players,
  COUNT(DISTINCT e.league_game_id)    AS affected_games
FROM league_game_events e
JOIN league_games g ON g.id = e.league_game_id
WHERE g.is_started = true
  AND e.team_id IS NULL
  AND e.league_player_id IS NOT NULL
  AND e.type NOT IN ('sub_in','sub_out');

-- 어떤 선수가 가장 많이 영향받는지
SELECT
  lp.name AS player,
  COUNT(*) AS null_team_events,
  COUNT(DISTINCT e.league_game_id) AS affected_games
FROM league_game_events e
JOIN league_games g ON g.id = e.league_game_id
JOIN league_players lp ON lp.id = e.league_player_id
WHERE g.is_started = true
  AND e.team_id IS NULL
  AND e.type NOT IN ('sub_in','sub_out')
GROUP BY lp.name
ORDER BY null_team_events DESC
LIMIT 20;

-- ===== Q4: 임의 선수 검증 — 전체 PTS vs 분기 PTS 합 =====
-- 선수 한 명에 대해, 전체 모드 집계와 분기별 합을 동시에 산출
-- (단, GP·평균이 아닌 누적 합으로 비교 → 분기 합산 가능한 지표만)
WITH player_events AS (
  SELECT
    e.league_player_id,
    e.league_game_id,
    e.type,
    e.result,
    e.team_id,
    g.quarter_id,
    g.is_started
  FROM league_game_events e
  JOIN league_games g ON g.id = e.league_game_id
  WHERE g.is_started = true
    AND e.league_player_id IS NOT NULL
    AND e.type NOT IN ('sub_in','sub_out')
),
agg AS (
  SELECT
    lp.name AS player,
    -- 전체 (모든 분기 + NULL quarter)
    SUM(CASE WHEN pe.type LIKE 'shot_%' THEN 1 ELSE 0 END) AS total_fga,
    SUM(CASE WHEN pe.type LIKE 'shot_%' AND pe.result = 'made' THEN 1 ELSE 0 END) AS total_fgm,
    -- 분기에 귀속된 것만
    SUM(CASE WHEN pe.type LIKE 'shot_%' AND pe.quarter_id IS NOT NULL THEN 1 ELSE 0 END) AS quartered_fga,
    SUM(CASE WHEN pe.type LIKE 'shot_%' AND pe.result = 'made' AND pe.quarter_id IS NOT NULL THEN 1 ELSE 0 END) AS quartered_fgm
  FROM player_events pe
  JOIN league_players lp ON lp.id = pe.league_player_id
  GROUP BY lp.name
)
SELECT
  player,
  total_fga, quartered_fga, (total_fga - quartered_fga) AS missing_from_quarters_fga,
  total_fgm, quartered_fgm, (total_fgm - quartered_fgm) AS missing_from_quarters_fgm
FROM agg
WHERE total_fga <> quartered_fga
   OR total_fgm <> quartered_fgm
ORDER BY (total_fga - quartered_fga) DESC, player
LIMIT 30;

-- ===== Q5: 같은 분기 안에서 — 팀별 합 vs 분기 전체 =====
-- team_id NULL 이벤트 때문에 [팀A 합 + 팀B 합 + 팀C 합] < 분기 전체
SELECT
  lq.year || '.' || lq.quarter || 'Q' AS quarter_label,
  COUNT(*) FILTER (WHERE e.team_id IS NOT NULL AND e.type LIKE 'shot_%') AS team_fga_sum,
  COUNT(*) FILTER (WHERE e.type LIKE 'shot_%')                            AS all_fga,
  COUNT(*) FILTER (WHERE e.team_id IS NULL AND e.type LIKE 'shot_%')      AS unattributed_fga
FROM league_game_events e
JOIN league_games g ON g.id = e.league_game_id
JOIN league_quarters lq ON lq.id = g.quarter_id
WHERE g.is_started = true
  AND e.league_player_id IS NOT NULL
  AND e.type NOT IN ('sub_in','sub_out')
GROUP BY lq.year, lq.quarter
ORDER BY lq.year, lq.quarter;
