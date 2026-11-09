-- =============================================
-- 125_grant_nov_regular_passes.sql — 데이터 작업(표 구조 변경 없음)
-- 2026-11-09 운영진: 「11월 기준 팀 배정이 된 선수들에게 모두 11월 정규권을 지급」
-- =============================================
-- 왜: 정규권은 미모바스켓에서 샀는데 그 기록이 아직 넘어오지 않아, 참가신청이 모두를 「비정규」로 봤다.
-- 누구: 11월 정규 소속이 있는 활동 선수(게스트 제외) — 홈 「11월 우리 팀」과 같은 규칙
--       (4분기 정규 소속 위에 11월 달별 정규가 먼저). 실행 전 조회: 락다운 6 · 빅현욱 6 · 챗지피지기 6 = 18명.
-- 어떻게: wallet_tickets 에 정규권 2026-11 한 장씩, 가격 0(포인트 안 빠짐) · actor_label 로 「어드민 지급」을 남긴다.
--        이미 11월 정규권이 있는 사람은 건너뛴다(두 번 실행해도 안전).
-- =============================================
WITH q AS (
  SELECT id FROM league_quarters
   WHERE league_id = '8eda8257-8907-4bf3-a7de-e5e7fde54a89' AND year = 2026 AND quarter = 4
), base AS (
  SELECT lpq.league_player_id AS pid, lpq.team_id FROM league_player_quarters lpq, q
   WHERE lpq.quarter_id = q.id AND lpq.team_id IS NOT NULL AND COALESCE(lpq.is_regular, true)
), mon AS (
  SELECT league_player_id AS pid, team_id, is_regular FROM league_player_months
   WHERE league_id = '8eda8257-8907-4bf3-a7de-e5e7fde54a89' AND month = '2026-11-01'
), final AS (
  SELECT pid FROM base WHERE pid NOT IN (SELECT pid FROM mon)
  UNION SELECT pid FROM mon WHERE is_regular AND team_id IS NOT NULL
)
INSERT INTO wallet_tickets (team_id, league_player_id, kind, month, price, status, actor_label)
SELECT 'ec4b250b-e3ab-4f7e-a83d-9d9cb6816981', f.pid, 'regular_pass', '2026-11-01', 0, 'active',
       '어드민 지급 (11월 팀 배정 · 미모바스켓 정규권)'
  FROM final f
  JOIN league_players p ON p.id = f.pid AND COALESCE(p.is_active, true) AND NOT COALESCE(p.is_guest, false)
 WHERE NOT EXISTS (
   SELECT 1 FROM wallet_tickets t
    WHERE t.league_player_id = f.pid AND t.kind = 'regular_pass' AND t.month = '2026-11-01' AND t.status <> 'returned'
 );
