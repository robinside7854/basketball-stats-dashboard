-- =============================================
-- 129_wallet_bank_auto_charge.sql
-- 충전 요청 없이 「입금만 해도」 자동 충전 (2026-11-10 운영진)
-- =============================================
-- 알림의 보낸 사람 이름이 명단(게스트 아님)의 한 사람과 같으면 그 사람 포인트로 충전한다.
-- 게스트비(통장 입금)를 기다리는 게스트가 있으면 먼저 「게스트비 입금 확인」으로 처리한다.
-- 받은 알림 기록의 상태에 두 가지를 더한다:
--   charged   = 요청 없이 이름으로 자동 충전(충전 요청 행을 만들고 승인 — request_id 에 남는다)
--   guest_fee = 게스트비 통장 입금 확인으로 처리
-- =============================================
ALTER TABLE wallet_bank_events DROP CONSTRAINT IF EXISTS wallet_bank_events_status_check;
ALTER TABLE wallet_bank_events ADD CONSTRAINT wallet_bank_events_status_check
  CHECK (status IN ('matched', 'unmatched', 'ambiguous', 'ignored', 'charged', 'guest_fee'));
ALTER TABLE wallet_bank_events ADD COLUMN IF NOT EXISTS note TEXT;
