-- 분기별 팀명·색상 override
--
-- 배경: league_teams 는 분기와 독립적이라 팀명을 바꾸면 모든 분기에 영향을 줌.
-- 농구 리그 운영상 분기마다 팀 구성이 새로 만들어져야 하므로, 분기 단위로
-- 팀명·색상을 override 할 수 있어야 함.
--
-- 동작:
-- - (quarter_id, team_id) 별로 override row 가 있으면 그 분기 표시 시 사용
-- - 없으면 league_teams 기본값 사용
-- - 게임/멤버십/드래프트의 team_id 는 변경 없음 — 표시 layer 만 영향
--
-- 미라클모닝농구단 복원 데이터:
-- - 26.1Q, 26.2Q 의 75140c73 (현재 굿모닝) → '락다운'
-- - 26.1Q, 26.2Q 의 0f739dff (현재 챗지피지기백전불태) → '런앤건'
-- - 빅현욱(b31ea3b1) 은 1~3Q 모두 빅현욱 그대로 → override 불필요

CREATE TABLE IF NOT EXISTS league_team_quarter_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  quarter_id UUID NOT NULL REFERENCES league_quarters(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES league_teams(id) ON DELETE CASCADE,
  name TEXT,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quarter_id, team_id)
);

CREATE INDEX IF NOT EXISTS league_team_quarter_overrides_quarter_idx
  ON league_team_quarter_overrides (quarter_id);

CREATE INDEX IF NOT EXISTS league_team_quarter_overrides_team_idx
  ON league_team_quarter_overrides (team_id);

-- RLS — 다른 draft 테이블과 동일 패턴
ALTER TABLE league_team_quarter_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY allow_all_team_quarter_overrides
  ON league_team_quarter_overrides FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE league_team_quarter_overrides IS
  '분기별 팀명·색상 override. league_teams 는 그대로 두고 표시 layer 에서만 적용.';

-- 미라클모닝 1~2Q 복원
INSERT INTO league_team_quarter_overrides (league_id, quarter_id, team_id, name, color)
SELECT
  '8eda8257-8907-4bf3-a7de-e5e7fde54a89'::uuid,
  q.id,
  t.team_id,
  t.name,
  t.color
FROM league_quarters q
CROSS JOIN (VALUES
  ('75140c73-204c-47ee-9930-c69d56b20186'::uuid, '락다운', '#ffea00'),
  ('0f739dff-4298-4c6a-b36c-646557634b9e'::uuid, '런앤건', '#0011ff')
) AS t(team_id, name, color)
WHERE q.league_id = '8eda8257-8907-4bf3-a7de-e5e7fde54a89'
  AND q.year = 2026
  AND q.quarter IN (1, 2)
ON CONFLICT (quarter_id, team_id) DO UPDATE
  SET name = EXCLUDED.name, color = EXCLUDED.color, updated_at = now();
