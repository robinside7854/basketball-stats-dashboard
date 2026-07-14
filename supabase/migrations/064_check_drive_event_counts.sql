-- 064_check_drive_event_counts.sql
-- [진단 · 읽기 전용] shot_2p_drive 잔존 로그 확인
-- 드라이브 → 레이업 통일(065) 실행 전에 실제 데이터 규모를 확인하는 용도.
-- 결과가 모두 0이면 065는 no-op이며 코드 정리만 진행하면 됨.

-- 1. 리그 이벤트 로그 (league_game_events)
SELECT 'league_game_events' AS source,
       COUNT(*)                                   AS total_drive_events,
       COUNT(*) FILTER (WHERE result = 'made')    AS made,
       COUNT(*) FILTER (WHERE result = 'missed')  AS missed,
       MIN(created_at)                            AS first_logged,
       MAX(created_at)                            AS last_logged
FROM league_game_events
WHERE type = 'shot_2p_drive';

-- 2. 구 팀 대시보드 이벤트 로그 (game_events — youth/senior)
SELECT 'game_events' AS source,
       COUNT(*)                                   AS total_drive_events,
       COUNT(*) FILTER (WHERE result = 'made')    AS made,
       COUNT(*) FILTER (WHERE result = 'missed')  AS missed,
       MIN(created_at)                            AS first_logged,
       MAX(created_at)                            AS last_logged
FROM game_events
WHERE type = 'shot_2p_drive';

-- 3. 리그 쪽 게임별 분포 (어느 경기에 몰려있는지)
SELECT e.league_game_id, g.date, COUNT(*) AS drive_events
FROM league_game_events e
JOIN league_games g ON g.id = e.league_game_id
WHERE e.type = 'shot_2p_drive'
GROUP BY e.league_game_id, g.date
ORDER BY g.date;
