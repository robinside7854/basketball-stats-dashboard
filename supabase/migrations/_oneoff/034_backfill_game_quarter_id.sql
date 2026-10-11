-- ─────────────────────────────────────────────────────────────────
-- 분기 규칙: 1~3월 = 1분기, 4~6월 = 2분기, 7~9월 = 3분기, 10~12월 = 4분기 (매년 동일)
-- date의 연도 + CEIL(month/3) 으로 league_quarters를 직접 매핑
-- ─────────────────────────────────────────────────────────────────

-- 1. 모든 게임 quarter_id 재설정 (NULL + 기존 값 모두)
UPDATE league_games lg
SET quarter_id = lq.id
FROM league_quarters lq
WHERE lq.league_id = lg.league_id
  AND lq.year      = EXTRACT(YEAR FROM lg.date)::INT
  AND lq.quarter   = CEIL(EXTRACT(MONTH FROM lg.date)::NUMERIC / 3)::INT
  AND lg.date IS NOT NULL;

-- 2. 확인용 (실행 후 결과 보기)
-- SELECT lg.date, lq.year, lq.quarter, lg.quarter_id
-- FROM league_games lg
-- LEFT JOIN league_quarters lq ON lg.quarter_id = lq.id
-- WHERE lg.is_started = true
-- ORDER BY lg.date DESC LIMIT 20;
