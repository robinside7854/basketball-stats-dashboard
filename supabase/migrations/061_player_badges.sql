-- 061_player_badges.sql
-- 자동 배지 시스템: 퍼펙트게임/더블더블/트리플더블/위닝샷
-- 게임 단위로 계산하여 (game_id, player_id, badge_type) 유일. is_complete=true 게임만.

create table public.player_badges (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues(id) on delete cascade,
  player_id uuid not null references public.league_players(id) on delete cascade,
  game_id uuid not null references public.league_games(id) on delete cascade,
  badge_type text not null check (badge_type in ('perfect_game','double_double','triple_double','winning_shot')),
  earned_at_date date not null,
  meta jsonb,
  created_at timestamptz not null default now(),
  unique (game_id, player_id, badge_type)
);

create index idx_player_badges_league on public.player_badges (league_id);
create index idx_player_badges_player on public.player_badges (player_id);
create index idx_player_badges_date   on public.player_badges (earned_at_date desc);

alter table public.player_badges enable row level security;
create policy "player_badges public read" on public.player_badges
  for select using (true);
