-- 135: 동호회 운영 설정 · 기능 스위치 (2026-11-10 온볼 플랫폼화 2단계 — docs/onball-platform-design.md)
--   동호회(teams 한 줄)마다 다른 점을 한 칸에 모은다. 비어 있으면 코드 기본값(= 지금 미라클 동작)으로 돈다.
--   읽는 곳은 lib/club/settings.ts 의 loadClub() 하나.
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 미라클: 로고를 코드 표(leagueLogo.ts)에서 동호회 칸으로 옮긴다. 설정·기능은 지금 값 그대로 적어 둔다(화면에서 보이게).
UPDATE teams SET
  logo_url = COALESCE(logo_url, '/leagues/miracle-logo.png'),
  settings = '{"game_weekday":6,"capacity":18,"team_count":3,"rotation":"winner_stays","record_fouls":false,"roster_mode":["quarter_draft","monthly_regular"],"bank_reserved_words":["모임통장"]}'::jsonb,
  features = '{"wallet":true,"rsvp":true,"draft":true,"youtube":true,"tournament":true,"uniform_photos":true,"bank_auto":true,"monthly_roster":true}'::jsonb
WHERE org_slug = 'miracle' AND sub_slug = 'main';
