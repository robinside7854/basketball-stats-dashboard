-- 중복 슬롯 정리 + UNIQUE 제약 추가
--
-- 정책: 데이터(이벤트/스코어/시작·완료 표시)가 있는 슬롯은 절대 삭제하지 않음.
-- 같은 (league_id, date, slot_num) 그룹에서 "완전히 비어있는" 중복 행만 정리.
-- 그래도 데이터 있는 중복이 남는다면 UNIQUE INDEX 생성이 실패하므로
-- 그 경우 수동 검토가 필요함 (실행 결과 메시지로 확인 가능).

BEGIN;

-- 1) 중복 그룹에서 "삭제 안전" 후보 식별 후 제거
--    안전 조건: 이벤트 0개 AND NOT is_started AND NOT is_complete
--    같은 그룹에서 우선 보존 순위: 이벤트 많은 순 → is_complete → is_started → created_at ASC
WITH ranked AS (
  SELECT
    g.id,
    g.is_started,
    g.is_complete,
    (SELECT COUNT(*) FROM league_game_events e WHERE e.league_game_id = g.id) AS event_count,
    ROW_NUMBER() OVER (
      PARTITION BY g.league_id, g.date, g.slot_num
      ORDER BY
        (SELECT COUNT(*) FROM league_game_events e WHERE e.league_game_id = g.id) DESC,
        g.is_complete DESC,
        g.is_started DESC,
        g.created_at ASC
    ) AS rn
  FROM league_games g
  WHERE g.slot_num IS NOT NULL
)
DELETE FROM league_games
WHERE id IN (
  SELECT id FROM ranked
  WHERE rn > 1
    AND event_count = 0
    AND NOT is_started
    AND NOT is_complete
);

-- 2) 정리 후에도 남은 중복 확인 (있으면 UNIQUE 생성 실패하므로 미리 검출)
DO $$
DECLARE
  dup_count INT;
BEGIN
  SELECT COUNT(*) INTO dup_count
  FROM (
    SELECT 1 FROM league_games
    WHERE slot_num IS NOT NULL
    GROUP BY league_id, date, slot_num
    HAVING COUNT(*) > 1
  ) t;
  IF dup_count > 0 THEN
    RAISE EXCEPTION
      '아직 % 그룹에 데이터 있는 중복 슬롯이 남아있습니다. 수동 검토 필요 (migration 040 진단 SQL 참고).', dup_count;
  END IF;
END $$;

-- 3) UNIQUE 제약 추가 (NULL slot_num은 허용 — 자동 스케줄로 생성된 매치업용)
CREATE UNIQUE INDEX IF NOT EXISTS league_games_slot_unique
  ON league_games (league_id, date, slot_num)
  WHERE slot_num IS NOT NULL;

COMMIT;
