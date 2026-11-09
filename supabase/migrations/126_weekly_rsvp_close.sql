-- =============================================
-- 126_weekly_rsvp_close.sql
-- 참가신청 마감 (2026-11-09 운영진)
-- =============================================
-- 규칙
--   · 어드민이 그 주 참가신청을 「마감」할 수 있다. 토요일(경기일)이 되면 저절로 마감된 것으로 친다.
--   · 마감되면 홈 맨 위 카드가 사라지고, 회원은 더 이상 참/불을 바꾸지 못한다.
--   · 마감되는 순간 그 날짜가 일정(league_schedule_dates)에 들어가고 빈 경기 칸이 깔린다.
--     ⚠ 밤마다 도는 「영상으로 일정 맞추기」는 영상 없는 앞날 일정을 지우는데, 이 표에 행이 있는 날짜는 지우지 않는다.
--   · 마감 뒤 명단 고치기는 일정 탭에서 어드민이 한다. 그날 기록이 시작되면 명단은 잠긴다(코드에서 판정).
-- RLS 켜고 정책 없음 — 서버(Service Role)만 읽고 쓴다.
-- =============================================

CREATE TABLE IF NOT EXISTS weekly_rsvp_closures (
  league_id        UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  game_date        DATE NOT NULL,
  closed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_by_label  TEXT,
  PRIMARY KEY (league_id, game_date)
);

ALTER TABLE weekly_rsvp_closures ENABLE ROW LEVEL SECURITY;
