-- 099: 참여신청(RSVP)
--
-- account_id 로 잡는다. league_player_id 로 잡으면 계정 없는 사람 몫을 아무나 넣을 수 있다.
-- UNIQUE (schedule_date_id, account_id) 로 한 사람 한 응답을 못 박는다 — 중복 신청은
-- 데이터가 아니라 버그다.
--
-- 상태 3종: going / not_going / maybe.
--   going·not_going 만 두면 "아직 안 정함"과 "불참"이 구분되지 않아 총무가 누구를 더
--   찔러야 하는지 알 수 없다. 미응답(행 자체가 없음)과 maybe 도 서로 다른 상태다.
--
-- ⚠ assigned_team_id 는 "기본 배정과 다를 때만" 채운다.
--   정규회원의 소속팀을 신청 시점에 복사해 저장하면, 그 뒤 운영진이 분기 소속을 바꿨을 때
--   아직 치르지도 않은 경기의 배정이 옛 팀에 굳어버린다.
--     null + 분기 소속 있음 → 그 분기 소속팀 (정규회원 자동 배정)
--     null + 분기 소속 없음 → 배정 대기 (비정규회원 · 운영진 회의로 배치)
--     값 있음               → 운영진이 직접 배치 (자동 판정을 덮는다)
--   league_team_quarter_overrides 와 같은 꼴이다: 기본값은 계산하고, 어긋나는 것만 남긴다.

CREATE TABLE IF NOT EXISTS league_rsvp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  schedule_date_id uuid NOT NULL REFERENCES league_schedule_dates(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES league_user_accounts(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('going','not_going','maybe')),
  assigned_team_id uuid REFERENCES league_teams(id) ON DELETE SET NULL,
  assigned_by uuid REFERENCES league_user_accounts(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_date_id, account_id)
);

-- 현황 화면은 항상 "이 날짜의 전원"을 읽는다.
CREATE INDEX IF NOT EXISTS league_rsvp_date_idx ON league_rsvp (schedule_date_id);
-- 내 응답 조회 — 홈 카드가 매 방문마다 친다.
CREATE INDEX IF NOT EXISTS league_rsvp_account_idx ON league_rsvp (account_id);

-- 마이그레이션 090 의 기조를 유지한다: 공개 키로는 아무것도 못 읽고 못 쓴다.
-- 참여 명단은 누가 언제 나오는지를 담는다 — 공개 키로 열려 있으면 안 된다.
REVOKE ALL ON league_rsvp FROM anon, authenticated;
