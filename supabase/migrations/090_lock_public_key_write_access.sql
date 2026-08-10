-- 090: 공개 키(anon)로 열려 있던 테이블 잠그기
--
-- 배경 — 2026-08-10 보안 점검에서 실측한 사실:
--   브라우저에 그대로 노출되는 공개 키(anon)로 아래가 전부 가능했다.
--     · players 68행 읽기 (생년월일 포함) + 수정
--     · game_events 5,993행 · player_minutes 1,525행 읽기 + 수정
--     · league_game_players 849행 · league_announcements · tournaments 읽기 + 수정
--   원인은 001_initial_schema 의 `allow_all_players FOR ALL USING(true)` 등
--   서비스 초기 정책이 남아 있는 것. 앱에서 PIN·로그인을 아무리 검사해도
--   DB 뒷문이 열려 있으면 소용이 없다.
--
--   특히 심각한 조합: 초기 아이디=이름, 초기 비밀번호=생년월일 6자리인데
--   players 테이블에 이름과 생년월일이 같이 들어 있다. 요청 한 번으로 전 회원의
--   로그인 정보가 나온다.
--
-- 왜 정책(POLICY)이 아니라 권한(GRANT)을 회수하는가:
--   정책은 나중에 누가 `USING(true)` 로 다시 만들면 조용히 열린다. 권한 자체를 거두면
--   정책과 무관하게 막힌다. 실제로 이 사고가 그렇게 났다 — 정책 한 줄이 5년 남았다.
--
-- ⚠ 선행 조건: 커밋 bf61e3e5 (서버 라우트 21곳 공개키→서비스키 교체) 가 배포돼 있어야 한다.
--   그 전에 이 마이그레이션을 적용하면 대회(파란날개)의 명단·경기·박스스코어·시즌스탯·
--   기록입력·대회목록이 전부 빈 화면이 되고 기록 저장도 실패한다.
--   2026-08-10 배포 후 프로덕션 API 5종(players/tournaments/dashboard/stats 2종)이
--   정상 응답하는 것을 확인하고 이 파일을 적용한다.
--
-- ⚠ 여기서 건드리지 않는 것 (공개 키가 실제로 필요한 유일한 곳들):
--   · leagues        — 미들웨어가 slug→UUID rewrite 를 하려고 anon 키로 직접 읽는다
--                      (src/middleware.ts 의 fetch). 막으면 리그 주소 전체가 죽는다.
--   · league_drafts / league_draft_picks / league_draft_chat
--                    — 드래프트 화면이 브라우저에서 실시간 신호(postgres_changes)를 받는다.
--                      Realtime 은 anon 의 SELECT 권한을 그대로 따르므로, 막으면 에러 없이
--                      조용히 "화면이 자동으로 안 바뀌는" 상태가 된다. 가장 눈치채기 어렵다.
--   · teams          — 089 에서 이미 비밀 컬럼(edit_pin)을 가렸고 쓰기는 차단돼 있다.
--                      이번 회차의 변경 범위를 넓히지 않는다.
--   · storage        — 선수 사진은 별도 체계다. 점검 3번 항목에서 따로 다룬다.

BEGIN;

-- 대회(파란날개) 계열 — 이제 전부 서비스 키로만 접근한다
REVOKE ALL ON public.players            FROM anon, authenticated;
REVOKE ALL ON public.games              FROM anon, authenticated;
REVOKE ALL ON public.game_events        FROM anon, authenticated;
REVOKE ALL ON public.player_minutes     FROM anon, authenticated;
REVOKE ALL ON public.tournaments        FROM anon, authenticated;
REVOKE ALL ON public.tournament_players FROM anon, authenticated;
-- opponent_players 는 제외한다 — 048 마이그레이션에 정책이 있지만 테이블 자체가 지금은 없다.
-- (점검 프로브에서도 404 였다. 없는 테이블에 REVOKE 를 걸면 트랜잭션 전체가 롤백된다.)

-- 리그 계열 중 공개 키로 읽고 쓸 수 있었으나 소비처가 0곳인 것
REVOKE ALL ON public.league_game_players  FROM anon, authenticated;
REVOKE ALL ON public.league_announcements FROM anon, authenticated;

-- 앞으로 만들어질 테이블이 기본으로 열리지 않게 한다.
-- 이번 사고의 재발 방지책이다 — 새 테이블마다 잠그는 걸 기억할 수는 없다.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;

COMMIT;
