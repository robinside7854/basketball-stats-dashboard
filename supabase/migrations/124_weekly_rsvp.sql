-- =============================================
-- 124_weekly_rsvp.sql
-- 주간 참가신청 (2026-11-09 운영진 — 미모바스켓 흡수 3단계, docs/mimo-onboarding-plan.md)
-- =============================================
-- 규칙
--   · 그 주 토요일 경기에 대해 월요일 00:00 ~ 금요일 23:59(KST) 동안 회원이 「참 / 불」을 누른다.
--     열고 닫는 것은 시각 계산으로만 한다(lib/rsvp/weekly.ts) — 따로 「열기」 버튼이 없다.
--   · 정원 18명은 안내만 한다. 넘치면 팀장·총무가 회의해 정한다(자동으로 자르지 않는다).
--   · 정규(그 달 정규권 있음) / 비정규 / 게스트(league_players.is_guest)는 화면이 그때그때 판정한다.
--   · 비정규·게스트는 어드민 「승인」, 정규는 「참」을 누르면 바로 승인.
--   · 어드민이 팀에 배치하는 순간 비정규 티켓 한 장을 쓴다(wallet_use_ticket) → ticket_id 에 남긴다.
--     팀을 옮겨도 다시 빠지지 않는다. 배치를 취소할 때 티켓을 돌려줄지는 어드민이 고른다(돌려주면 ticket_id 비움).
--
-- ⚠ 예전 참여신청 표 league_rsvp(10/11 폐지, 0행)는 쓰지 않는다 — 일정 날짜(league_schedule_dates)에 묶여 있는데,
--   앞날의 빈 일정은 밤마다 「영상으로 일정 맞추기」가 지운다. 이 표는 날짜(game_date)로만 묶는다.
-- RLS 켜고 정책 없음 — 서버(Service Role)만 읽고 쓴다.
-- =============================================

-- 리그마다 켜는 기능 — rsvp_rules 가 있는 리그에만 참가신청이 보인다.
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS rsvp_rules JSONB;

CREATE TABLE IF NOT EXISTS weekly_rsvp (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id         UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  game_date         DATE NOT NULL,
  league_player_id  UUID NOT NULL REFERENCES league_players(id) ON DELETE RESTRICT,
  answer            TEXT NOT NULL CHECK (answer IN ('yes', 'no')),
  approved          BOOLEAN NOT NULL DEFAULT false,
  placed_team_id    UUID REFERENCES league_teams(id) ON DELETE SET NULL,
  ticket_id         UUID REFERENCES wallet_tickets(id),
  guest_paid        BOOLEAN NOT NULL DEFAULT false,
  answered_by_label TEXT,          -- 본인 · 또는 대신 눌러 준 어드민
  placed_by_label   TEXT,
  answered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (league_id, game_date, league_player_id)
);
CREATE INDEX IF NOT EXISTS weekly_rsvp_league_date_idx ON weekly_rsvp (league_id, game_date);

ALTER TABLE weekly_rsvp ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON weekly_rsvp FROM PUBLIC, anon, authenticated;

-- 미라클(리그 2026)에 켠다 — 토요일(6) 경기 · 정원 18.
UPDATE leagues SET rsvp_rules = '{"game_weekday": 6, "capacity": 18}'::jsonb
 WHERE id = '8eda8257-8907-4bf3-a7de-e5e7fde54a89';
