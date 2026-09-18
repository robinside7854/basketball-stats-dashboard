-- 118: 추첨 레이스 출발 시각 (2026-09-19)
--
-- 「추첨 시작」(서버가 순서 확정) 과 「출발」(레이스 재생) 을 분리한다. 총무가 출발을 누르면
-- 이 시각이 기록되고, 폴링 중인 모든 화면이 그 순간부터 같은 시드로 레이스를 재생한다.
-- NULL = 아직 출발 전(레이스 화면은 팁오프 대기). 리셋·재추첨 때 NULL 로 되돌린다.
ALTER TABLE league_drafts
  ADD COLUMN IF NOT EXISTS race_started_at TIMESTAMPTZ;

COMMENT ON COLUMN league_drafts.race_started_at IS '추첨 레이스 출발 시각 — 총무가 「출발」을 누른 순간. NULL 이면 대기';
