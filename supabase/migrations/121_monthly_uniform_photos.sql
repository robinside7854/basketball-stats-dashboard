-- =============================================
-- 121_monthly_uniform_photos.sql
-- 달마다 팀 유니폼 색 → 선수 프로필 사진도 그 색으로 (2026-11-08 운영진 요청)
-- =============================================
-- 배경
--   미라클은 달마다 팀 유니폼 색(노랑·흰색·검정)을 정한다. 프로필 사진도 그 달 유니폼을 입은
--   모습으로 바뀌면 좋겠다는 요청 — 선수마다 같은 사진을 네 벌(노랑·흰색·검정·회색=비정규)
--   만들어 두고, 그 달 그 선수 팀의 색에 맞는 것을 photo_url 로 고른다.
--
-- 표 셋
--   1) league_players.uniform_photos  — {"yellow": url, "white": url, "black": url, "gray": url}
--   2) league_team_month_uniforms      — 그 달 그 팀의 유니폼 색
--   3) league_upload_tokens            — 운영진 대신 사진을 올리는 1회용 비밀번호(해시만 저장, 기한 있음)
--
-- ⚠ photo_url 은 그대로 쓴다 — 고르는 일(applyMonthlyPhotos)이 photo_url 을 그 달 사진으로 바꿔 둔다.
--   화면 코드는 하나도 안 바뀌어도 모든 화면이 같은 사진을 본다.
-- ⚠ RLS 는 켜고 정책은 두지 않는다 — 서버(Service Role)만 읽고 쓴다.
-- =============================================

ALTER TABLE league_players ADD COLUMN IF NOT EXISTS uniform_photos JSONB;

COMMENT ON COLUMN league_players.uniform_photos IS
  '유니폼 색별 프로필 사진 {yellow, white, black, gray}. 그 달 팀 색에 맞는 것을 photo_url 로 옮겨 쓴다(gray = 비정규).';

CREATE TABLE IF NOT EXISTS league_team_month_uniforms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id   UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  month       DATE NOT NULL CHECK (EXTRACT(DAY FROM month) = 1),
  team_id     UUID NOT NULL REFERENCES league_teams(id) ON DELETE CASCADE,
  uniform     TEXT NOT NULL CHECK (uniform IN ('yellow', 'white', 'black')),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (league_id, month, team_id)
);

ALTER TABLE league_team_month_uniforms ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS league_upload_tokens (
  token_hash  TEXT PRIMARY KEY,
  league_id   UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE league_upload_tokens ENABLE ROW LEVEL SECURITY;
