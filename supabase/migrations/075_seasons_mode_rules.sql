-- =============================================
-- 075_seasons_mode_rules.sql
-- 멀티테넌트 표준화 단계 1-b — 시즌 계층
-- =============================================
-- leagues 를 "시즌"으로 확장한다. 시즌 = 연도 1개.
--   · team_id : 어느 팀의 시즌인지 (조직이 아니라 팀에 매단다 — 청년부/장년부 격리)
--   · mode    : league | tournament — 운영 방식 분기점
--   · rules   : 팀별로 달라지는 운영 룰. 통계·배지·어워즈는 여기 넣지 않는다(전 팀 동일).
--
-- rules 키는 단계 2 집계 로직이 그대로 참조하므로 여기서 확정한다.
--   event_points     : 이벤트 타입 → 득점. 현재 하드코딩된 switch 문을 대체한다.
--   plus_one_bonus   : plus_one 선수의 야투 성공에 더할 점수 (미라클 1, 표준 0)
--   round_unit       : 'day' = 경기일 1개가 1라운드 (미라클), 'game' = 경기 슬롯 1개가 1라운드
--   qualification    : 리더보드 최소 출전 자격 — 기간 내 열린 라운드 대비 비율
--   period / tracking: 아직 소비처가 없다. 단계 2 이후 사용 (지금은 데이터만 보관)
--
-- 순수 추가다. org_slug · season_year · slug 는 그대로 둔다.
-- =============================================

ALTER TABLE leagues ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id);
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS mode    TEXT NOT NULL DEFAULT 'league';
ALTER TABLE leagues ADD COLUMN IF NOT EXISTS rules   JSONB;

ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_mode_check;
ALTER TABLE leagues ADD  CONSTRAINT leagues_mode_check CHECK (mode IN ('league', 'tournament'));

-- 배치
--   miracle            → miracle/main       (미라클모닝 자체 리그)
--   pana-basket-senior → paranalgae/senior  (파란날개 장년부 자체전 · 현재 데이터 0건인 스텁)
UPDATE leagues l
   SET team_id = t.id
  FROM teams t
  JOIN orgs  o ON o.id = t.org_id
 WHERE l.team_id IS NULL
   AND (
        (l.org_slug = 'miracle'            AND o.slug = 'miracle'    AND t.sub_slug = 'main')
     OR (l.org_slug = 'pana-basket-senior' AND o.slug = 'paranalgae' AND t.sub_slug = 'senior')
   );

ALTER TABLE leagues ALTER COLUMN team_id SET NOT NULL;

-- 표준 아마추어 농구 룰 (기본값) — 신규 동호회는 아무 설정 없이 이 값으로 동작한다
ALTER TABLE leagues ALTER COLUMN rules SET DEFAULT '{
  "event_points": {
    "shot_3p": 3, "shot_2p_mid": 2, "shot_layup": 2, "shot_post": 2,
    "ft_2pt": 1, "ft_3pt_1": 1, "ft_3pt_2": 1, "free_throw": 1,
    "and_one": 1
  },
  "plus_one_bonus": 0,
  "round_unit": "game",
  "qualification": { "min_round_ratio": 0.3 },
  "period": { "count": 4, "minutes": 10 },
  "tracking": { "fouls": true, "minutes": true }
}'::jsonb;

-- 기존 행에도 같은 기본값을 채운다.
-- (information_schema.column_default 를 읽어 캐스팅하면 '{...}'::jsonb 문자열이라 파싱에 실패한다 —
--  리터럴을 그대로 반복하는 편이 안전하다)
UPDATE leagues
   SET rules = '{
  "event_points": {
    "shot_3p": 3, "shot_2p_mid": 2, "shot_layup": 2, "shot_post": 2,
    "ft_2pt": 1, "ft_3pt_1": 1, "ft_3pt_2": 1, "free_throw": 1,
    "and_one": 1
  },
  "plus_one_bonus": 0,
  "round_unit": "game",
  "qualification": { "min_round_ratio": 0.3 },
  "period": { "count": 4, "minutes": 10 },
  "tracking": { "fouls": true, "minutes": true }
}'::jsonb
 WHERE rules IS NULL;

-- 미라클모닝 예외 룰
--   · plus_one 선수는 야투 성공 시 +1 (3점→4점, 2점→3점)
--   · 2점슛 파울 자유투 1구가 2점(ft_2pt), 3점슛 파울은 2점+1점(ft_3pt_1 + ft_3pt_2)
--   · 하루에 여러 경기를 치르므로 라운드 단위가 '경기일'
--   · 쿼터 7분 4쿼터
UPDATE leagues
   SET rules = rules
     || '{"plus_one_bonus": 1}'::jsonb
     || '{"round_unit": "day"}'::jsonb
     || '{"event_points": {
            "shot_3p": 3, "shot_2p_mid": 2, "shot_layup": 2, "shot_post": 2,
            "ft_2pt": 2, "ft_3pt_1": 2, "ft_3pt_2": 1, "free_throw": 1,
            "and_one": 1
          }}'::jsonb
     || '{"period": {"count": 4, "minutes": 7}}'::jsonb
 WHERE org_slug = 'miracle';

ALTER TABLE leagues ALTER COLUMN rules SET NOT NULL;

-- 시즌 신원 = (팀, 연도, 슬러그).
--   보통 팀당 연도당 1개다. 같은 해에 내부 리그와 외부 대회를 병행하면 slug 로 구분해 2개를 둔다.
--   기존 UNIQUE(org_slug, slug) 는 org_slug 를 제거할 때까지 함께 둔다.
ALTER TABLE leagues DROP CONSTRAINT IF EXISTS leagues_team_season_unique;
ALTER TABLE leagues ADD  CONSTRAINT leagues_team_season_unique UNIQUE (team_id, season_year, slug);

CREATE INDEX IF NOT EXISTS idx_leagues_team_id ON leagues(team_id);
