-- 093: badge_type CHECK 제약에 커리어 배지를 허용한다
--
-- 092 로 인덱스만 추가하고 배포했더니 커리어 배지가 0건 들어갔다. 원인은 인덱스가 아니라
-- 훨씬 앞단의 CHECK 제약이었다:
--   CHECK (badge_type = ANY (ARRAY['perfect_game','double_double','triple_double','winning_shot']))
-- 새 타입(career_*)이 전부 거부됐고, 재계산 라우트가 커리어 단계를 try/catch 로 감싸 두어
-- (기존 4종 결과까지 무효로 만들지 않으려는 의도) 실패가 조용히 넘어갔다.
-- 응답의 career_badges:0 이 유일한 신호였다.
--
-- 교훈은 그대로 두 가지다:
--   · 열거형을 CHECK 로 못 박으면 타입을 늘릴 때 마이그레이션이 반드시 따라와야 한다.
--   · '부분 실패를 허용하는' catch 는 실패를 눈에 보이게 만들 방법과 함께 있어야 한다.
--
-- 목록을 다시 못 박는 대신 접두사 규칙으로 연다 — 커리어 배지는 앞으로 종류가 늘어날 축이고
-- (누적 임계값 추가 등), 그때마다 마이그레이션을 다시 쓰게 만들 이유가 없다.
-- 기존 4종은 그대로 열거해 오타로 엉뚱한 값이 들어가는 것은 계속 막는다.

ALTER TABLE public.player_badges
  DROP CONSTRAINT IF EXISTS player_badges_badge_type_check;

ALTER TABLE public.player_badges
  ADD CONSTRAINT player_badges_badge_type_check
  CHECK (
    badge_type = ANY (ARRAY['perfect_game'::text, 'double_double'::text, 'triple_double'::text, 'winning_shot'::text])
    OR badge_type LIKE 'career\_%'
  );
