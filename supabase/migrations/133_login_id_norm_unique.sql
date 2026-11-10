-- 133: 아이디 겹침을 앱과 같은 규칙으로 DB 도 막는다 (2026-11-10 코드 리뷰)
--   앱은 NFC · 띄어쓰기 무시 · 소문자로 비교하는데(lib/auth/loginId.ts normLoginId), DB 유일 규칙은 글자 그대로였다.
--   그래서 거의 동시에 「Robin」·「robin」으로 가입하면 둘 다 들어갈 수 있었다. 적용 전 실측: 겹침 0건.
CREATE UNIQUE INDEX IF NOT EXISTS league_user_accounts_team_login_norm_uniq
  ON league_user_accounts (team_id, lower(regexp_replace(normalize(login_id, NFC), '\s', '', 'g')))
  WHERE team_id IS NOT NULL;
