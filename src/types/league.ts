export interface League {
  id: string
  org_slug: string
  name: string
  season_year: number
  start_date: string
  match_day: string
  season_type: 'annual' | 'quarterly'
  total_rounds?: number
  games_per_round: number
  edit_pin?: string
  youtube_channel?: string | null
  plus_one_age?: number | null
  status: 'upcoming' | 'active' | 'completed'
  created_at: string
}

export interface LeagueTeam {
  id: string
  league_id: string
  name: string
  color: string
  // [임시·단계D에서 제거] 이관 원본 teams.id 또는 외부팀 생성 근거 (083)
  legacy_id: string | null
}

export interface LeaguePlayer {
  id: string
  league_id: string
  name: string
  number: number | null
  position: string | null
  birth_date: string | null
  plus_one: boolean
  is_guest?: boolean
  photo_url?: string | null
  original_photo_url?: string | null
  // 로그인 계정을 등록·승인(인증)받은 회원 여부 — 라커룸 인증 뱃지용 (players API에서 조인해 주입)
  has_account?: boolean
  created_at: string
  height_cm: number | null
  // 선출(선수 출신) 여부 — 명단 화면 배지 (083)
  is_pro: boolean
  // false 면 명단에서 내리되 과거 기록은 유지 (083)
  is_active: boolean
  // [임시·단계D에서 제거] 이관 원본 players.id (083)
  legacy_id: string | null
}

export interface LeagueTeamWithPlayers extends LeagueTeam {
  players: { league_player_id: string; player_name: string; player_number: number | null; position: string | null }[]
}

export interface LeagueGame {
  id: string
  league_id: string
  home_team_id: string | null
  away_team_id: string | null
  home_team?: LeagueTeam | null
  away_team?: LeagueTeam | null
  date: string
  round_num: number
  slot_num?: number
  home_score: number
  away_score: number
  is_complete: boolean
  is_started?: boolean
  is_exhibition?: boolean
  quarter_id?: string | null
  youtube_url?: string | null
  youtube_start_offset?: number
  // 대회형에서 쓰는 필드 — 리그형은 홈코트 고정이라 대개 비어 있다 (083)
  venue: string | null
  // 토너먼트 라운드 표기(8강·결승). 일정 슬롯 번호인 round_num 과 다른 개념 (083)
  round_label: string | null
  // AI 가 쓴 경기 MVP 코멘트 (083)
  ai_mvp: unknown | null
  // [임시·단계D에서 제거] 이관 원본 games.id (083)
  legacy_id: string | null
}

export interface LeagueScheduleDate {
  id: string
  league_id: string
  date: string
  created_at: string
}

export interface LeagueStanding {
  team: LeagueTeam
  played: number
  wins: number
  draws: number
  losses: number
  points: number
  goals_for: number
  goals_against: number
  goal_diff: number
  // 현재 진행 중인 streak — 최신 경기부터 역방향 walk, 같은 결과 연속 길이
  streak?: { type: 'W' | 'L' | 'D'; count: number } | null
}

export type Quarter = {
  id: string
  year: number
  quarter: number
  is_current: boolean
  start_date?: string | null
  end_date?: string | null
  // kind='tournament' 일 때만 의미가 있다 ('pro'|'amateur') (083)
  tournament_type: string | null
  description: string | null
  // [임시·단계D에서 제거] 이관 원본 tournaments.id (083)
  legacy_id: string | null
}

export type PlayerStat = {
  player_id: string
  name: string
  number: number | null
  position: string | null
  photo_url?: string | null
  gp: number
  pts: number; ppg: number
  reb: number; rpg: number
  oreb: number; orp: number
  dreb: number; drp: number
  ast: number; apg: number
  stl: number; spg: number
  blk: number; bpg: number
  tov: number; topg: number
  pf: number
  fgm: number; fga: number; fg_pct: number
  fg2m: number; fg2a: number; fg2_pct: number  // 2점 야투 (계산값)
  fg3m: number; fg3a: number; fg3_pct: number
  ftm: number; fta: number; ft_pct: number
  efg_pct: number
  and_one: number  // 성공한 앤드원 횟수
  // 슛 분포 (존별 made/attempted)
  ds_a: number; ds_m: number   // 골밑슛 (Dunk Spot, shot_post)
  lu_a: number; lu_m: number   // 레이업 (shot_layup)
  md_a: number; md_m: number   // 미드레인지 (shot_2p_mid)
  // TRB% 계산용
  team_reb_in_games: number    // 본인 출전 경기의 본인 팀 총 리바운드
  // USG% 계산용
  team_poss_in_games: number   // 본인 출전 경기의 본인 팀 총 소유권 (FGA + 0.44×FTA + TOV)
  // Per-40 계산용
  minutes_played: number       // 본인 총 출전 시간 (분) — 교체(in/out)가 둘 다 찍힌 경기만
  // 교체 기록이 없는 경기를 이벤트 시각으로 메운 출전 시간(분).
  // 실측 in/out 이 있는 경기는 그 값을 그대로 쓰고, 없는 경기만 추정으로 채운다.
  // ⚠ 운영 DB 실측(2026-08-10) 기준 교체 기록의 98.7%가 out_time NULL 이라
  //    minutes_played 는 사실상 0 이다 — 화면에 보여줄 값은 이쪽이다.
  minutes_est: number
  minutes_est_used: boolean    // 추정분이 섞였는가 (화면에 "추정" 표기)
  // PIE (Player Impact Estimate · NBA 공식 지표) 재료 · Advanced 탭에서 pie_num/pie_denom×100 로 사용
  //   numerator: PTS+FGM+FTM−FGA−FTA+DREB+ORB/2+AST+STL+BLK/2−PF−TO
  //   denominator: 본인 출전 게임의 리그 전체(양팀) 총합
  pie_num: number
  pie_denom: number
}

export type QuarterPlayer = {
  id: string
  name: string
  number: number | null
  position: string | null
  is_regular: boolean
  team_id: string | null
  plus_one: boolean
}

export type Leader = {
  team_id: string
  leader_player_id: string | null
}
