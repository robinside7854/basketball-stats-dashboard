-- 미라클모닝 리그 팀 이름/색상 보정
--
-- 배경:
-- - 054 override 로 26.1Q, 26.2Q 는 '락다운' / '런앤건' 으로 원복되어 있으나
--   색상이 이전 그대로 blue(#0011ff)라 사용자 요청 색과 다름.
-- - Q3 팀 이름은 축약("챗지피지기")과 빨강 색상으로 통일.
--
-- 사용자 요청 최종:
-- - 락다운/런앤건: Q1-Q2, 노랑/빨강
-- - 굿모닝/챗지피지기: Q3 이후, 노랑/빨강 (기존 team_id 재사용)
-- - '빅현욱' 은 색상/이름 유지
--
-- 대상 team_id
--   75140c73-204c-47ee-9930-c69d56b20186  → Q1-Q2 '락다운' / Q3+ '굿모닝', 노랑 #ffea00 (변경 없음)
--   0f739dff-4298-4c6a-b36c-646557634b9e  → Q1-Q2 '런앤건' / Q3+ '챗지피지기', 빨강 #ff0000 (변경)
--
-- 참고: league_teams 는 quarter 개념이 없으므로 이곳의 name/color 는 override 가 없는 분기(=Q3+)에서 사용됨.

-- Q3+ 이후 표시(=base) 를 '챗지피지기' / 빨강 으로
UPDATE league_teams
SET name = '챗지피지기',
    color = '#ff0000'
WHERE id = '0f739dff-4298-4c6a-b36c-646557634b9e'
  AND league_id = '8eda8257-8907-4bf3-a7de-e5e7fde54a89';

-- Q1-Q2 override 색상을 빨강으로 보정 (이름은 이미 '런앤건')
UPDATE league_team_quarter_overrides
SET color = '#ff0000',
    updated_at = now()
WHERE team_id = '0f739dff-4298-4c6a-b36c-646557634b9e'
  AND league_id = '8eda8257-8907-4bf3-a7de-e5e7fde54a89';
