-- 062_player_badges_round.sql
-- 자동 배지 시스템 확장: 더블더블/트리플더블을 라운드(=날짜) 기준으로 부여
--
-- 변경사항:
--   1) player_badges.game_id 제약(NOT NULL) 완화 → 라운드 배지는 NULL 로 저장
--   2) 라운드 배지용 unique 인덱스 추가 (game_id IS NULL 인 rows 대상)
--
-- 배지 저장 규칙:
--   perfect_game, winning_shot : game_id = 해당 게임 UUID
--   double_double, triple_double : game_id = NULL (그 날짜 리그 전 게임 합산)

alter table public.player_badges alter column game_id drop not null;

-- 라운드 배지 유일성 (동일 리그·동일 날짜·동일 선수·동일 배지 타입 중복 방지)
create unique index if not exists uq_player_badges_round
  on public.player_badges (league_id, earned_at_date, player_id, badge_type)
  where game_id is null;

comment on column public.player_badges.game_id is
  '게임 단위 배지(perfect_game, winning_shot)는 게임 UUID. 라운드(=날짜) 단위 배지(double_double, triple_double)는 NULL.';
