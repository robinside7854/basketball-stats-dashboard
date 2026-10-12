-- 2026-10-12 미라클모닝농구단(리그) 날짜 2개 강제 삭제 — 운영진 요청
--   · 2026-06-06 : 휴무일. 실수로 기록이 시작돼 「영상으로 일정 맞추기」의 자동 정리(흔적 있는 날은 안 지움)가 건너뛰었다.
--   · 2026-05-09 : 친선경기. 기록하지 않기로 함.
--
-- ⚠ 그 날짜의 경기 슬롯 전부 + 거기 딸린 기록(이벤트·출전·쿼터 영상·출전시간)이 함께 지워진다(ON DELETE CASCADE).
--   친선전은 원래 순위·개인 스탯에서 빠지므로 5/9 삭제로 스탯은 바뀌지 않는다.
--   6/6 은 정규전 기록이 있었다면 그만큼 개인 스탯·순위에서 빠진다 — 아래 1) 미리보기로 먼저 확인할 것.
-- 대회 묶음(mode='tournament')은 건드리지 않는다.
--
-- 실행: Supabase SQL Editor 에서 1) 만 먼저 돌려 확인 → 이상 없으면 전체 실행.

-- ── 1) 미리보기 ─────────────────────────────────────────────
SELECT
  g.date, g.slot_num, g.is_exhibition, g.is_started, g.is_complete, g.home_score, g.away_score,
  (SELECT COUNT(*) FROM league_game_events e WHERE e.league_game_id = g.id) AS event_count,
  g.youtube_url IS NOT NULL AS has_video
FROM league_games g
JOIN leagues l ON l.id = g.league_id
WHERE l.name = '미라클모닝농구단'
  AND l.season_year = 2026
  AND COALESCE(l.mode, 'league') <> 'tournament'
  AND g.date IN ('2026-06-06', '2026-05-09')
ORDER BY g.date, g.slot_num NULLS LAST;

-- ── 2) 삭제 ─────────────────────────────────────────────────
BEGIN;

DELETE FROM league_games g
USING leagues l
WHERE g.league_id = l.id
  AND l.name = '미라클모닝농구단'
  AND l.season_year = 2026
  AND COALESCE(l.mode, 'league') <> 'tournament'
  AND g.date IN ('2026-06-06', '2026-05-09');

DELETE FROM league_schedule_dates d
USING leagues l
WHERE d.league_id = l.id
  AND l.name = '미라클모닝농구단'
  AND l.season_year = 2026
  AND COALESCE(l.mode, 'league') <> 'tournament'
  AND d.date IN ('2026-06-06', '2026-05-09');

-- ── 3) 확인 (둘 다 0 기대) ───────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM league_games g JOIN leagues l ON l.id = g.league_id
    WHERE l.name = '미라클모닝농구단' AND l.season_year = 2026 AND COALESCE(l.mode,'league') <> 'tournament'
      AND g.date IN ('2026-06-06','2026-05-09')) AS remaining_games,
  (SELECT COUNT(*) FROM league_schedule_dates d JOIN leagues l ON l.id = d.league_id
    WHERE l.name = '미라클모닝농구단' AND l.season_year = 2026 AND COALESCE(l.mode,'league') <> 'tournament'
      AND d.date IN ('2026-06-06','2026-05-09')) AS remaining_dates;

COMMIT;
