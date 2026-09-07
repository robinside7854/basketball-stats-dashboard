-- =============================================
-- 114_league_team_aliases.sql
-- 영상 제목에 적히는 팀 표기 ↔ 실제 팀
-- =============================================
-- 배경 (2026-09-07)
--   미라클 업로더의 영상 제목 규칙이 `260801 경기 3` → `260905 지피티vs빅현욱 1Q` 로 바뀌었다.
--   제목이 대진을 알려주므로 팀 자동 매핑이 가능해졌는데, **업로더는 팀명을 줄여 쓴다** —
--   실제 팀명은 `챗지피지기` 인데 제목은 `지피티` 다. 부분일치도 초성 일치도 아니라
--   어떤 규칙으로도 안전하게 이어붙일 수 없다.
--
-- ⚠ 유사도로 추측해서 붙이지 않는다. 이 프로젝트가 반복해 당한 사고는 "안 붙는 것"이 아니라
--   "그럴듯하게 틀린 자리에 조용히 붙는 것"이었다(2026-08-22, 쿼터 번호가 경기 번호로 읽힘).
--   그래서 별칭은 **사람이 등록한 것만** 인정한다. 표에 없으면 매핑을 포기하고 이유를 남긴다.
--
--   판정 정본: src/lib/youtube/teamNameIndex.ts
-- =============================================

CREATE TABLE IF NOT EXISTS league_team_aliases (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id  UUID NOT NULL REFERENCES leagues(id)      ON DELETE CASCADE,
  team_id    UUID NOT NULL REFERENCES league_teams(id) ON DELETE CASCADE,

  -- 사람이 입력한 표기 그대로 보관한다. 비교는 앱에서 정규화(NFC·공백/기호 제거·소문자)해서 한다 —
  --   DB 에 정규화본을 따로 두면 두 값이 어긋났을 때 어느 쪽이 진짜인지 알 수 없게 된다.
  alias      TEXT NOT NULL CHECK (length(btrim(alias)) > 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT league_team_aliases_uniq UNIQUE (league_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_league_team_aliases_league
  ON league_team_aliases(league_id);

COMMENT ON TABLE  league_team_aliases       IS '영상 제목의 팀 표기 → 팀. 자동 매핑은 이 표에 있는 별칭만 인정한다(정본: src/lib/youtube/teamNameIndex.ts).';
COMMENT ON COLUMN league_team_aliases.alias IS '업로더가 쓰는 표기. 비교는 앱에서 정규화 후 수행 — 여기엔 입력 그대로 둔다.';

-- RLS — 다른 리그 표와 같다. 쓰기·읽기 모두 서버(service_role)에서만 일어난다.
ALTER TABLE league_team_aliases ENABLE ROW LEVEL SECURITY;

-- 2026-09-05 재생목록에서 확인된 표기 하나를 심는다.
--   `지피티` = `챗지피지기` — 같은 날 영상 10개가 지피티/빅현욱/굿모닝 3팀으로만 이뤄져 있고
--   DB 의 상시 3팀이 챗지피지기/빅현욱/굿모닝 이라 대응이 하나로 확정된다.
INSERT INTO league_team_aliases (league_id, team_id, alias)
SELECT t.league_id, t.id, '지피티'
FROM league_teams t
WHERE t.name = '챗지피지기' AND t.exhibition_date IS NULL
ON CONFLICT (league_id, alias) DO NOTHING;
