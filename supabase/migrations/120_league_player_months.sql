-- =============================================
-- 120_league_player_months.sql
-- 정규 소속을 「달」 단위로 바꿀 수 있게 한다 (2026-11-07 운영진 요청)
-- =============================================
-- 배경
--   미라클은 달마다 정규 멤버가 정해지기도 한다. 지금까지 정규 소속은
--   league_player_quarters(분기 단위) 하나뿐이라, 한 분기 안에서 달이 바뀌어
--   팀이 달라지면 운영진이 고칠 방법이 없었다.
--
-- 모양
--   분기 소속은 그대로 두고, 그 위에 「이 달만 다르게」 덮어쓰는 층을 하나 얹는다.
--   판정: 그 경기 날짜의 달(month = YYYY-MM-01)에 행이 있으면 그 행, 없으면 분기 소속.
--   행이 하나도 없으면 이 표가 생기기 전과 100% 같게 동작한다.
--
-- ⚠ 이 표는 「누가 그 달에 어느 팀 정규인가」만 바꾼다.
--   순위·팀 이름·스탯은 계속 분기 단위다. 기록(league_game_events)은 이벤트마다 team_id 를
--   저장하므로, 이 표를 바꿔도 이미 기록된 경기의 박스스코어는 달라지지 않는다.
--
-- ⚠ RLS 는 켜고 정책은 두지 않는다 — 서버(Service Role)만 읽고 쓴다.
-- =============================================

CREATE TABLE IF NOT EXISTS league_player_months (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id         UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  month             DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  league_player_id  UUID NOT NULL REFERENCES league_players(id) ON DELETE CASCADE,
  team_id           UUID REFERENCES league_teams(id) ON DELETE SET NULL,
  is_regular        BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (league_id, month, league_player_id)
);

CREATE INDEX IF NOT EXISTS league_player_months_league_month_idx
  ON league_player_months (league_id, month);

ALTER TABLE league_player_months ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE league_player_months IS
  '달 단위 정규 소속 덮어쓰기. 경기 날짜의 달에 행이 있으면 분기 소속(league_player_quarters)보다 우선한다.';
