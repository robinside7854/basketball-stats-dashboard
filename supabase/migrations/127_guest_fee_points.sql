-- =============================================
-- 127_guest_fee_points.sql
-- 게스트비를 부른 회원의 포인트로 내기 (2026-11-09 운영진)
-- =============================================
-- 규칙
--   · 게스트비 12,000P. 게스트를 신청할 때 부른 회원이 「통장 입금」 / 「내 포인트」 중 고른다.
--   · 포인트로 고르면 게스트가 팀에 「배치되는 순간」 부른 회원 잔액에서 빠진다(비정규 티켓과 같은 때).
--     포인트가 모자라면 배치를 막는다(신청은 받는다).
--   · 배치가 풀리거나 게스트 신청이 취소되면 자동으로 돌려준다(장부에 반대 부호 행 — 지우지 않는다).
--   · 잔액은 지금처럼 wallet_apply 로만 바꾼다.
-- =============================================

ALTER TABLE weekly_rsvp
  ADD COLUMN IF NOT EXISTS guest_pay TEXT NOT NULL DEFAULT 'bank' CHECK (guest_pay IN ('bank', 'points')),
  ADD COLUMN IF NOT EXISTS guest_payer_id UUID REFERENCES league_players(id),
  ADD COLUMN IF NOT EXISTS guest_fee_ledger_id UUID REFERENCES wallet_ledger(id);

-- 게스트비 가격(팀 규칙) — 미라클 12,000P
UPDATE teams
   SET wallet_rules = COALESCE(wallet_rules, '{}'::jsonb) || '{"guest_price": 12000}'::jsonb
 WHERE id = 'ec4b250b-e3ab-4f7e-a83d-9d9cb6816981';
