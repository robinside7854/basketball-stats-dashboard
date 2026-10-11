-- ─────────────────────────────────────────────────────────────────
-- 2026년 3분기·4분기 분기(쿼터) 사전 생성
--
-- 드래프트·로스터·순위에서 3Q(7~9월), 4Q(10~12월)를 선택할 수 있도록
-- 분기 레코드를 기간과 함께 미리 등록한다.
--
-- 대상: 이미 2026년 분기를 사용 중인 모든 리그 (분기 시스템 활성 리그).
-- is_current 는 변경하지 않음 (현재 분기 유지 — 미리 준비만).
--
-- 멱등성: ON CONFLICT (league_id, year, quarter) → 기간만 갱신. 안전 재실행.
-- ─────────────────────────────────────────────────────────────────

BEGIN;

-- 3분기 (7~9월)
INSERT INTO league_quarters (league_id, year, quarter, is_current, start_date, end_date)
SELECT DISTINCT lq.league_id, 2026, 3, false, DATE '2026-07-01', DATE '2026-09-30'
FROM league_quarters lq
WHERE lq.year = 2026
ON CONFLICT (league_id, year, quarter)
DO UPDATE SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date;

-- 4분기 (10~12월)
INSERT INTO league_quarters (league_id, year, quarter, is_current, start_date, end_date)
SELECT DISTINCT lq.league_id, 2026, 4, false, DATE '2026-10-01', DATE '2026-12-31'
FROM league_quarters lq
WHERE lq.year = 2026
ON CONFLICT (league_id, year, quarter)
DO UPDATE SET start_date = EXCLUDED.start_date, end_date = EXCLUDED.end_date;

COMMIT;

-- ── 검증 — 리그별 2026 분기 목록 ──
SELECT league_id, year, quarter, start_date, end_date, is_current
FROM league_quarters
WHERE year = 2026
ORDER BY league_id, quarter;
