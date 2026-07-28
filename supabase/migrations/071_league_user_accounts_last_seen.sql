-- 접속 현황(presence)용 — 마지막 활동 시각.
-- last_login_at(로그인 시각)과 별개로, 로그인 세션이 앱을 열어둔 동안 주기적으로 갱신.
-- '온라인' 판정 = last_seen_at 이 최근 N분 이내.
ALTER TABLE public.league_user_accounts
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

COMMENT ON COLUMN public.league_user_accounts.last_seen_at IS
  '마지막 활동 시각(하트비트). 접속 현황 온라인 판정에 사용.';
