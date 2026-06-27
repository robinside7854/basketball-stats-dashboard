-- 드래프트 픽 시간을 세션별로 동적 변경 가능하게 — 기본 80초.
-- 감독관이 채팅으로 단장들과 합의한 후 방(/draft/[token]) 내에서 변경한다.
--
-- 기존 PICK_SECONDS 상수(src/lib/draftTimer.ts)는 newPickDeadline 호출 시
-- 폴백 기본값으로만 사용. 동작 중인 세션의 픽 데드라인 계산엔 이 컬럼 사용.

ALTER TABLE league_drafts
  ADD COLUMN IF NOT EXISTS pick_seconds INT NOT NULL DEFAULT 80;

COMMENT ON COLUMN league_drafts.pick_seconds IS
  '픽당 제한 시간(초). 감독관이 방 내에서 합의에 따라 동적으로 변경.';
