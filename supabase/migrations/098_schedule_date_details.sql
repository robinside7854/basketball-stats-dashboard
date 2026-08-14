-- 098: 일정에 시간·장소·정원·신청마감 추가 (참여신청 선행 작업)
--
-- 지금 league_schedule_dates 에는 date 하나뿐이라 "몇 시, 어디서, 몇 명까지"를 적을 곳이 없다.
-- 참여신청은 이 정보가 있어야 성립한다.
--
-- ⚠ 전부 nullable 이다. 이미 쌓인 과거 날짜 32개에 소급 입력을 요구하지 않기 위해서다.
--   과거 경기에 시간·장소는 이제 와서 알 수도 없고, 알 필요도 없다.
--
--   start_time     null = 미정 (화면에서 시간 줄을 아예 안 그린다)
--   capacity       null = 무제한
--   rsvp_closes_at null = 마감 없음 (경기 시작 전까지 언제든 변경)

ALTER TABLE league_schedule_dates
  ADD COLUMN IF NOT EXISTS start_time     time,
  ADD COLUMN IF NOT EXISTS place          text,
  ADD COLUMN IF NOT EXISTS capacity       int,
  ADD COLUMN IF NOT EXISTS rsvp_closes_at timestamptz;

-- 정원은 있으면 1명 이상이어야 한다. 0 이나 음수는 입력 실수지 의도가 아니다
-- (무제한은 null 로 표현한다).
ALTER TABLE league_schedule_dates
  DROP CONSTRAINT IF EXISTS league_schedule_dates_capacity_positive;
ALTER TABLE league_schedule_dates
  ADD CONSTRAINT league_schedule_dates_capacity_positive
  CHECK (capacity IS NULL OR capacity > 0);
