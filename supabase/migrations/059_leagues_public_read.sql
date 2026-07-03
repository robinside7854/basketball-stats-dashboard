-- 059_leagues_public_read.sql
--
-- leagues 테이블 공개 READ 정책
--
-- 배경:
--   미들웨어 (Edge runtime) 에서 URL slug ↔ UUID 리솔브 시
--   anon key 로 Supabase REST API 를 호출.
--   RLS 는 켜져있지만 policy 가 없으면 anon key 는 어떤 행도 못 읽음.
--   결과: 미들웨어의 slug rewrite / UUID redirect 가 모두 실패 (조회 결과 0건)
--
-- 정책:
--   leagues 는 리그 목록 · 시즌 정보 · slug 만 담고 있어 민감 정보 아님.
--   전체 공개 read 허용 안전.

CREATE POLICY "leagues_public_read"
  ON leagues
  FOR SELECT
  USING (true);
