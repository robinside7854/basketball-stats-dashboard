-- =============================================
-- 077_stage1_review_fixes.sql
-- 멀티테넌트 표준화 단계 1 — 최종 리뷰 수정
-- =============================================
-- 074~076 은 이미 프로덕션에 적용되어 얼려있다 — 절대 그 파일들을 고치지 않는다.
-- 여기서는 그 위에 순수 추가/보강만 한다.
--
--   C1  league_quarters.name/ord 를 NOT NULL 로 만든 076 때문에 분기 생성이 깨졌다.
--       quarters/route.ts 와 import-2025.mjs 모두 name/ord 없이 upsert 한다.
--       BEFORE INSERT OR UPDATE 트리거로 유도값을 채운다 — 코드 변경 없이 불변식 유지.
--   I5  plus_one_bonus 를 { amount, applies_to } 구조로 바꿔 단계 2 룰 엔진이
--       "보너스는 야투에만 붙는다"를 다시 하드코딩하지 않게 한다.
--   M6  orgs.status 에도 leagues.mode / league_quarters.kind 와 동급의 CHECK 를 준다.
--   I3  teams_public_insert / teams_public_update (002 유산) 는 org_id 가 테넌트 경계가
--       된 지금 익명 키로 팀을 다른 조직에 재배치할 수 있는 구멍이다. teams 쓰기 경로를
--       전수 조사한 결과(src/app/api/admin/orgs/**) 전부 service-role 관리자 클라이언트
--       (@/lib/supabase/admin)를 쓴다 — 클라이언트사이드 쓰기 경로 없음 → 정책 제거.
-- =============================================

-- ── C1: league_quarters.name / ord 자동 유도 ──────────────────────
-- '26.1Q' 형식은 UI 14곳이 `${String(year).slice(2)}.${quarter}Q` 로 렌더링하는 것과
-- 동일해야 한다 (076 의 백필 UPDATE 와 같은 식).
CREATE OR REPLACE FUNCTION league_quarters_fill_name_ord()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.name IS NULL THEN
    NEW.name := right(NEW.year::text, 2) || '.' || NEW.quarter::text || 'Q';
  END IF;
  IF NEW.ord IS NULL THEN
    NEW.ord := NEW.quarter;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_league_quarters_fill_name_ord ON league_quarters;
CREATE TRIGGER trg_league_quarters_fill_name_ord
  BEFORE INSERT OR UPDATE ON league_quarters
  FOR EACH ROW EXECUTE FUNCTION league_quarters_fill_name_ord();

-- ── I5: plus_one_bonus 자기서술화 ─────────────────────────────────
-- 적용 범위(applies_to)는 leagueStats.ts / players/[playerId]/detail/route.ts 에서
-- 실측 확인 — shot_3p / shot_2p_mid / shot_layup / shot_post 성공에만 보너스가 붙고
-- and_one · 자유투(ft_2pt 등)에는 붙지 않는다.

-- 신규 시즌 기본값 — amount 0, applies_to 는 표준 룰이든 예외 룰이든 동일한 "야투 4종"
ALTER TABLE leagues ALTER COLUMN rules SET DEFAULT '{
  "event_points": {
    "shot_3p": 3, "shot_2p_mid": 2, "shot_layup": 2, "shot_post": 2,
    "ft_2pt": 1, "ft_3pt_1": 1, "ft_3pt_2": 1, "free_throw": 1,
    "and_one": 1
  },
  "plus_one_bonus": { "amount": 0, "applies_to": ["shot_3p", "shot_2p_mid", "shot_layup", "shot_post"] },
  "round_unit": "game",
  "qualification": { "min_round_ratio": 0.3 },
  "period": { "count": 4, "minutes": 10 },
  "tracking": { "fouls": true, "minutes": true }
}'::jsonb;

-- 기존 행 재구성 — amount 는 있던 값을 그대로 보존, applies_to 만 새로 붙인다.
-- jsonb_typeof 가드로 이미 { amount, applies_to } 구조인 행(재실행)은 건드리지 않는다.
UPDATE leagues
   SET rules = jsonb_set(
         rules,
         '{plus_one_bonus}',
         jsonb_build_object(
           'amount', rules->'plus_one_bonus',
           'applies_to', '["shot_3p", "shot_2p_mid", "shot_layup", "shot_post"]'::jsonb
         )
       )
 WHERE jsonb_typeof(rules->'plus_one_bonus') = 'number';

-- ── M6: orgs.status CHECK ─────────────────────────────────────────
ALTER TABLE orgs DROP CONSTRAINT IF EXISTS orgs_status_check;
ALTER TABLE orgs ADD  CONSTRAINT orgs_status_check CHECK (status IN ('active', 'dormant'));

-- ── I3: teams 공개 쓰기 정책 제거 ──────────────────────────────────
DROP POLICY IF EXISTS teams_public_insert ON teams;
DROP POLICY IF EXISTS teams_public_update ON teams;
