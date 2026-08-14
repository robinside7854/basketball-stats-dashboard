-- 100: 고정 대관 — 리그 기본 시간·장소·정원
--
-- 매주 같은 시간, 같은 체육관이 정상이고 예외가 가끔이다. 그런데 지금은 일정 32개 + 예정 8개
-- 전부에 같은 값을 손으로 넣어야 한다. 기본값을 리그에 한 번 두고, 일정에는 **다를 때만** 적는다.
--
-- ⚠ 일정 행에 기본값을 복사해 넣지 않는다.
--    복사하면 "체육관이 바뀌었다"고 리그 기본값을 고쳐도 이미 만들어진 예정 일정은 옛 장소에
--    굳어 있다. league_schedule_dates.start_time/place/capacity 는 null 이면 기본값을 따르고,
--    값이 있으면 그 날만의 예외라는 뜻이다.
--    (league_rsvp.assigned_team_id, league_team_quarter_overrides 와 같은 원칙)

ALTER TABLE leagues
  ADD COLUMN IF NOT EXISTS default_start_time time,
  ADD COLUMN IF NOT EXISTS default_place      text,
  ADD COLUMN IF NOT EXISTS default_capacity   int;

ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_default_capacity_positive;
ALTER TABLE leagues
  ADD CONSTRAINT leagues_default_capacity_positive
  CHECK (default_capacity IS NULL OR default_capacity > 0);
