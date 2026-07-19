-- coach_pins RLS — 공개 읽기, 쓰기는 service role 만.
--
-- 068 에서 테이블을 만들 때 RLS 를 빠뜨렸다. 이 프로젝트의 다른 테이블(games, game_events,
-- tournaments)은 RLS 가 켜져 있긴 하나 정책이 `ALL / USING true / WITH CHECK true` 라
-- 사실상 전부 허용이고, anon key 는 브라우저에 노출되므로 실질 보호가 없다.
--
-- coach_pins 는 그 관례를 따르지 않는다. 핀 쓰기는 X-Team-Pin 헤더를 검증하는
-- /api/pins 라우트만 거쳐야 하는데, 테이블이 anon 에게 열려 있으면 그 가드를 우회해
-- 누구나 핀을 만들고 지울 수 있어 인증 설계 자체가 무의미해진다.
--
-- 앱 동작에는 영향이 없다. API 라우트는 src/lib/supabase/admin.ts 의 service role
-- 클라이언트를 쓰고, service role 은 RLS 를 우회한다.
ALTER TABLE public.coach_pins ENABLE ROW LEVEL SECURITY;

-- 핀은 꽂는 즉시 공개 — 모아보기 화면이 anon 으로 읽을 수 있어야 한다.
CREATE POLICY "coach_pins public read"
  ON public.coach_pins
  FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE 정책은 두지 않는다.
-- 정책이 없으면 anon/authenticated 는 거부되고, service role 만 통과한다.
