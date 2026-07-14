-- 064_check_drive_event_counts.sql
-- [진단 · 읽기 전용] shot_2p_drive 잔존 로그 확인
-- 드라이브 → 레이업 통일에 앞서 실제 데이터 규모를 확인하는 용도.
-- ✅ 2026-07-14 실행 결과: 양쪽 테이블 모두 0건 → 데이터 이관 불필요 확정.
--    코드에서 shot_2p_drive 타입 전면 제거로 종결 (이관 마이그레이션 없음).

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
