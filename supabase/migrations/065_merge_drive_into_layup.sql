-- 065_merge_drive_into_layup.sql
-- 드라이브(shot_2p_drive) 이벤트를 레이업(shot_layup)으로 영구 이관
--
-- 배경: 기록 단계에서 드라이브가 레이업으로 통일되어 더 이상 사용하지 않음.
-- ⚠ DELETE 아님 — 과거 득점 기록(2점·FGA·어시스트)은 그대로 보존되고 유형만 변경.
--    두 유형은 모든 집계에서 동일 취급(2점 야투 · LU 지표는 이미 레이업+드라이브 합산)이라
--    시즌 스탯 · MVP · 마일스톤 · 시즌하이 수치에 영향 없음.
-- ⚠ 실행 전 064_check_drive_event_counts.sql 로 건수 확인 + 사용자 확인 필수.
--    (shot zone: 레이업/드라이브 모두 paint 자동 분류라 zone 의미도 동일)

-- 1. 리그 이벤트 로그
UPDATE league_game_events
SET type = 'shot_layup'
WHERE type = 'shot_2p_drive';

-- 2. 구 팀 대시보드 이벤트 로그 (game_events.type 이 event_type ENUM이어도
--    'shot_layup' 값이 이미 ENUM에 존재하므로 UPDATE 가능)
UPDATE game_events
SET type = 'shot_layup'
WHERE type = 'shot_2p_drive';

-- 3. 검증: 0 이어야 함
SELECT
  (SELECT COUNT(*) FROM league_game_events WHERE type = 'shot_2p_drive') AS league_remaining,
  (SELECT COUNT(*) FROM game_events        WHERE type = 'shot_2p_drive') AS team_remaining;

-- 참고: event_type ENUM 자체에서 'shot_2p_drive' 값 제거는 하지 않음.
-- Postgres ENUM 은 값 삭제가 불가(타입 재생성 필요)하고, 미사용 값이 남아있어도 무해함.
