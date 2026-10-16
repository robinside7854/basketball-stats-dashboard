# 이벤트 로그 내려받기 (기록 자동화 학습용)

`/admin` 맨 아래 「이벤트 로그 내려받기」. CEO 로그인만 받을 수 있다(선수 이름 포함).
API: `GET /api/admin/export/events?source=league|team&format=csv|jsonl`

| source | 범위 | 원본 표 |
|---|---|---|
| `league` | 리그 시스템 전부 (미라클 리그 · 미라클 대회 묶음 등) | `league_game_events` + `league_games` |
| `team` | 팀 시스템 전부 (파란날개 청년부 · 장년부) | `game_events` + `games` + `tournaments` |

한 줄 = 이벤트 하나. 경기 안에서는 쿼터 → 영상 시각 → 입력 시각 순(`seq_in_game`).

## 열

| 열 | 뜻 |
|---|---|
| `system` | `league` / `team` |
| `org_slug`, `group_id`, `group_name`, `group_mode` | 리그(또는 팀) — 리그는 mode `league`/`tournament`, 팀은 `youth`/`senior` |
| `competition_id`, `competition_name` | 리그: 분기·대회(`league_quarters`) / 팀: 대회(`tournaments`) |
| `game_id`, `game_date`, `slot_num`, `round_label` | 경기. 리그는 하루에 여러 칸(slot) |
| `is_exhibition`, `is_started`, `is_complete` | 친선전·진행 상태 — **걸러지지 않은 원본**이니 필요하면 직접 거른다 |
| `home_team`, `away_team`, `home_score`, `away_score` | 리그 경기 팀(그 분기 팀 이름)·점수 |
| `opponent`, `our_score`, `opponent_score` | 팀 시스템 경기 상대·점수 |
| `event_id`, `seq_in_game`, `quarter` | 이벤트 |
| `video_timestamp` | **유튜브 영상 안의 초** — 하이라이트 클립이 이 시각으로 이동한다 |
| `video_url`, `video_id`, `video_start_offset` | 그 장면이 담긴 영상. 리그는 쿼터별 영상이 있으면 그것, 없으면 경기 대표 영상 |
| `type`, `result`, `points` | 이벤트 종류·성공 여부(`made`/`missed`)·**기록 시점 저장 점수**(+1 규칙 재계산 아님) |
| `player_*`, `team_id`, `team_name` | 기록된 선수와 그 순간 소속 팀 |
| `related_player_*` | 어시스트한 선수(슛) · 짝 이벤트(스틸↔턴오버 등) |
| `extra` | 위 열에 없는 원본 칸(JSON) — 슛 위치(`shot_zone` 등)가 여기 있다 |
| `created_at` | 기록원이 입력한 시각(실제 경기 시각 아님) |

## 이벤트 종류(type)

슛: `shot_3p` · `shot_2p_mid` · `shot_layup` · `shot_post` · (옛 팀 기록) `shot_2p_drive`
자유투: `free_throw` · `ft_2pt`(1구 2점) · `ft_3pt_1`/`ft_3pt_2` · `and_one`
그 밖: `oreb` · `dreb` · `assist` · `steal` · `block` · `turnover` · `foul` · 교체 `sub_in`/`sub_out` · 쿼터 `quarter_start`/`quarter_end` · 상대 득점 `opp_score*`

## 학습에 쓸 때 주의

- **`quarter` 가 1 로 고정된 옛 리그 기록이 있다**(약 17,869건, 2026-08-18 이전). 이 구간은 쿼터별 영상 대신 대표 영상으로 연결된다.
- `video_timestamp` 가 비어 있는 이벤트는 영상과 맞출 수 없다(수동 입력·영상 없는 경기).
- 같은 날 `free_throw` 와 `ft_2pt` 가 섞여 있어도 버그가 아니다(쿼터별로 룰을 바꾼 날이 있다).
- 대회 묶음의 상대(외부) 팀 이벤트는 선수가 비어 있다.
- 파일 끝에 `#EXPORT_ERROR` 줄이 있으면 중간에 끊긴 파일이다 — 다시 받는다.
