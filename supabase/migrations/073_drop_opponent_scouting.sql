-- =============================================
-- 073_drop_opponent_scouting.sql
-- 상대팀 정찰(스카우팅) 기능 제거
-- =============================================
-- 배경
--   · 마지막 기록 2026-04-04 · 4개월 미사용 (상대팀 4 / 선수 28 / 경기 7 / 이벤트 357)
--   · 이벤트 스택이 3벌(game_events · league_game_events · opponent_game_events)로
--     중복되어 있어 멀티테넌트 표준화의 최대 걸림돌이었다.
--   · 정찰 선수는 회원이 아니어서 통계 자격·배지·랭킹·인증 게이팅에서 전부 예외 처리가
--     필요했고, 이 예외 덩어리가 통합 스키마 설계를 가장 복잡하게 만들던 요인.
--   · 향후 상대팀 선수 기록이 다시 필요해지면 통합 스키마에서 is_external 팀으로
--     표현한다. 별도 스택을 유지할 이유가 없다.
--
-- 사용자 승인 하에 백업 없이 삭제 (2026-08-04).
--
-- 함께 제거된 코드
--   · API 8종  : /api/opponent-{teams,players,games,events,stats}
--   · 화면 2종 : /(main)/opponent · /(main)/[org]/[team]/opponent
--   · 네비게이션: STATS_SUB_TABS '상대 분석' · TabNav also:['/opponent']
-- =============================================

-- 사전 감사 (2026-08-04):
--   · opponent_* 를 참조하는 외부 FK 없음
--   · opponent 관련 뷰/함수 없음
--   → CASCADE 가 다른 테이블에 파급되지 않음을 확인 후 실행
--
-- FK 의존 순서대로 삭제 (events/minutes → games/players → teams)
DROP TABLE IF EXISTS opponent_game_events    CASCADE;
DROP TABLE IF EXISTS opponent_player_minutes CASCADE;
DROP TABLE IF EXISTS opponent_games          CASCADE;
DROP TABLE IF EXISTS opponent_players        CASCADE;
DROP TABLE IF EXISTS opponent_teams          CASCADE;
