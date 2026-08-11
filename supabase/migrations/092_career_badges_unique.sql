-- 092: 커리어(누적·첫 기록) 배지가 평생 한 번만 남도록 못 박는다
--
-- 기존 유니크 인덱스 두 개로는 부족하다:
--   · player_badges_game_id_player_id_badge_type_key — 게임 단위 배지용 (game_id NOT NULL)
--   · uq_player_badges_round — 라운드 단위 배지용 (league_id, earned_at_date, player_id, badge_type)
--       ⚠ 날짜가 키에 들어 있어, 같은 배지가 날짜마다 새로 쌓인다. 더블더블은 그래야 맞다.
--
-- 그런데 커리어 배지("50라운드 출전", "첫 3점")는 **평생 1회**다. 위 인덱스 아래서는
-- 재계산을 돌릴 때마다 달성일이 조금만 달라져도 같은 배지가 여러 줄 생긴다.
-- 재계산은 앞으로 반복해서 돌릴 물건이라(과거 경기 수정·채점 규칙 변경) 여기서 막아야 한다.
--
-- badge_type 접두사로 구분한다 — 별도 컬럼을 만들면 기존 4종 배지 코드까지 전부 손대야 한다.
--   career_rounds_10 / _25 / _50 / _100   출전 라운드 누적
--   career_pts_100 / _250 / _500 / _1000  누적 득점
--   career_first_three                     첫 3점 성공
--   career_first_dd                        첫 더블더블

CREATE UNIQUE INDEX IF NOT EXISTS uq_player_badges_career
  ON public.player_badges (league_id, player_id, badge_type)
  WHERE game_id IS NULL AND badge_type LIKE 'career\_%';
