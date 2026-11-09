-- =============================================
-- 128_wallet_bank_auto.sql
-- 카카오뱅크 입금 알림 → 충전 요청 자동 승인 (2026-11-09 운영진)
-- =============================================
-- 흐름
--   · 통장 주인 폰(안드로이드)의 알림 자동화 앱이 카카오뱅크 입금 알림 글을 그대로 온볼에 보낸다.
--   · 온볼은 알림 글에서 「입금 N원」을 읽고, 기다리는 충전 요청 중 금액이 같고 입금자명이 글에 들어 있는
--     요청이 **딱 하나**면 자동 승인한다(보너스 포함 — 승인은 지금처럼 wallet_review_charge).
--   · 못 짝지은 알림도 남긴다 — 회원이 입금 먼저 하고 요청을 나중에 보내면, 요청을 만들 때 다시 짝짓는다.
-- 표 두 개. RLS 켜고 정책 없음 — 서버(Service Role)만 읽고 쓴다.
-- =============================================

-- 연결 비밀번호(해시만 보관 — 원문은 발급 때 한 번만 보인다). 팀당 하나, 새로 발급하면 바뀐다.
CREATE TABLE IF NOT EXISTS wallet_bank_hooks (
  team_id       UUID PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    TEXT,
  last_used_at  TIMESTAMPTZ
);
ALTER TABLE wallet_bank_hooks ENABLE ROW LEVEL SECURITY;

-- 받은 알림 기록(자동 승인 근거 · 못 짝지은 입금 확인용)
CREATE TABLE IF NOT EXISTS wallet_bank_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  raw_text      TEXT NOT NULL,
  amount        INTEGER,
  status        TEXT NOT NULL CHECK (status IN ('matched', 'unmatched', 'ambiguous', 'ignored')),
  request_id    UUID REFERENCES wallet_charge_requests(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_bank_events_team_idx ON wallet_bank_events (team_id, created_at DESC);
ALTER TABLE wallet_bank_events ENABLE ROW LEVEL SECURITY;
