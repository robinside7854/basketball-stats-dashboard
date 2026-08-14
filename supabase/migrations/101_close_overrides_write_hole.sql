-- 101: 팀명 override 쓰기 구멍 차단 + 참여신청 테이블 RLS 켜기
--
-- ── 실측(2026-08-14 정기 점검) ──────────────────────────────────────────────
-- 공개 anon 키(브라우저 번들에 들어 있어 누구나 가진다)로 아래가 통했다:
--
--   POST /rest/v1/league_team_quarter_overrides
--   → 23503 (foreign key violation)
--
-- 23503 은 **권한 검사를 통과하고 FK 검사에서 멈췄다**는 뜻이다. 즉 실제 team_id 를 넣으면
-- 들어간다. 비교군인 league_players 는 42501(RLS 차단)로 떨어졌다.
--
-- 원인은 초기 마이그레이션의 `allow_all_team_quarter_overrides` (ALL · USING true · CHECK true).
-- 마이그레이션 090 이 8개 테이블을 잠글 때 이 테이블이 빠졌다.
--
-- 왜 위험한가: 이 테이블은 **분기별 팀 이름의 정본**이다. 미라클 리그는 분기마다 팀을 새로
-- 짜기 때문에 화면 어디서든 팀 이름이 여기서 나온다. 한 행만 바뀌어도 지난 전 경기의
-- 대진 이름이 통째로 달라진다 — 기록이 조용히 틀려지는데 아무도 눈치채지 못한다.
--
-- 안전한가: 이 테이블을 읽고 쓰는 코드 8곳이 **전부 서비스 롤 클라이언트**(@/lib/supabase/admin)를
-- 쓴다. 서비스 롤은 RLS·GRANT 를 우회하므로 앱 기능은 그대로다. 브라우저 supabase 클라이언트를
-- 쓰는 파일 3개(DraftChat · DraftPortalClient · roster 사진)는 이 테이블을 건드리지 않는다.

DROP POLICY IF EXISTS allow_all_team_quarter_overrides ON league_team_quarter_overrides;
REVOKE ALL ON league_team_quarter_overrides FROM anon, authenticated;

-- ── league_rsvp: RLS 켜기 (이중 방어) ──────────────────────────────────────
-- 지금은 GRANT 가 없어서 막힌다(401 확인). 하지만 그건 **한 겹**이다.
-- 나중에 누가 GRANT 를 한 줄 넣는 순간 참여 명단이 통째로 열린다.
-- 정책을 하나도 만들지 않는다 = 서비스 롤 외에는 아무도 못 읽고 못 쓴다.
ALTER TABLE league_rsvp ENABLE ROW LEVEL SECURITY;
