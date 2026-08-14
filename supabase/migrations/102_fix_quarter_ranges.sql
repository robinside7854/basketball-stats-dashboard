-- 102: 분기 기간·현재분기 보정 (데이터 수정, 2026-08-14 정기 점검)
--
-- ── 무엇이 비어 있었나 ─────────────────────────────────────────────────────
--   1·2분기: start_date / end_date 가 **둘 다 null**
--   1·2·3분기: is_current 가 **전부 false** — "지금이 몇 분기인가"에 답할 수 있는 행이 없었다
--
-- ── 왜 문제인가 ────────────────────────────────────────────────────────────
-- 경기에 quarter_id 가 없을 때 코드는 (1) 날짜 범위 → (2) is_current → (3) 포기 순으로 푼다.
--   (`games/[gameId]/roster/route.ts` · `lib/rsvp/nextGame.ts` 의 resolveQuarterForDate)
-- 1·2분기에 범위가 없고 is_current 도 없으면 **두 단계가 다 비어** 곧장 (3)으로 떨어진다.
-- 그 경우 명단이 홈/원정 구분 없이 전원 미배정으로 나오는데 **화면상으로는 정상처럼 보인다**
-- (roster 라우트 주석이 이미 경고하고 있던 상황이다).
--
-- ── 값의 근거 ──────────────────────────────────────────────────────────────
-- 실제 경기 날짜 범위와 대조해 정했다. 임의로 고른 값이 아니다:
--   1분기 경기 117개 · 2026-01-03 ~ 03-28  → 2026-01-01 ~ 03-31
--   2분기 경기 111개 · 2026-04-04 ~ 06-27  → 2026-04-01 ~ 06-30
--   3분기 경기  54개 · 2026-07-04 ~ 08-08  → 기존 07-01 ~ 09-30 유지
-- 보정 후 검증: 분기가 겹치는 쌍 0건, 기존 quarter_id 와 날짜가 어긋나는 경기 0건.
--
-- ⚠ is_current 는 수동 값이라 4분기가 시작되면 손으로 옮겨야 한다. 범위를 채워 둔 이유가
--   그것이다 — 평소에는 (1) 범위에서 풀리고, is_current 는 범위 밖 날짜의 폴백으로만 쓰인다.

UPDATE league_quarters SET start_date = '2026-01-01', end_date = '2026-03-31'
  WHERE year = 2026 AND quarter = 1 AND start_date IS NULL;

UPDATE league_quarters SET start_date = '2026-04-01', end_date = '2026-06-30'
  WHERE year = 2026 AND quarter = 2 AND start_date IS NULL;

-- 현재 분기는 리그당 하나뿐이어야 한다 — 먼저 전부 내리고 하나만 올린다.
UPDATE league_quarters SET is_current = false WHERE is_current;
UPDATE league_quarters SET is_current = true  WHERE year = 2026 AND quarter = 3;
