-- 드래프트 추첨/시작 흐름 2단계화
--
-- 기존: ready_check → (lottery 호출 시 즉시 추첨) → in_progress
-- 변경:
--   ready_check
--     → lottery_waiting   (감독관이 '추첨 대기 화면 열기' 클릭, 모두 대기 화면 시청)
--     → lottery_done      (감독관이 '추첨 시작' 클릭, 추첨 실행 완료)
--     → in_progress       (감독관이 '드래프트 시작' 클릭, 첫 픽 타이머 시작)
--
-- 모든 단계 전환은 감독관 권한 필요. 팀장(단장) 은 시청만 가능.

ALTER TABLE league_drafts DROP CONSTRAINT IF EXISTS league_drafts_status_check;
ALTER TABLE league_drafts ADD CONSTRAINT league_drafts_status_check
  CHECK (status = ANY (ARRAY[
    'setup'::text,
    'ready_check'::text,
    'lottery_waiting'::text,
    'lottery_done'::text,
    'in_progress'::text,
    'completed'::text
  ]));
