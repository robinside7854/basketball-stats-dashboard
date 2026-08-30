-- =============================================
-- 111_league_game_quarter_videos.sql
-- 경기 하나에 쿼터별 영상 여러 개
-- =============================================
-- 배경
--   지금까지 영상은 league_games.youtube_url **한 칸**이었다. 촬영본이 쿼터별로
--   쪼개져 올라오는 대회(미라클 대회 묶음: 2경기 × 4쿼터 = 영상 8개)에서는 담을 자리가 없다.
--
--   2026-08-23 에는 이걸 "슬롯 하나 = 쿼터 하나"로 우회했다(8/22 친선전, 슬롯 10개).
--   대회에서는 그 우회를 쓸 수 없다 — 대회 보드의 전적 판정(getTournamentSummary)이
--   경기 행을 세므로 4쿼터짜리 2경기가 "4승 4패"로 읽힌다. 경기는 2행으로 두고
--   영상만 쿼터로 쪼개는 게 맞다.
--
-- ⚠ league_games.youtube_url 은 **지우지 않는다.**
--   하이라이트·명경기·마일스톤·박스스코어가 전부 이 컬럼을 읽고, 여러 곳이
--   `.not('youtube_url','is',null)` 로 "영상 있는 경기"를 거른다. 비우는 순간 대회 경기가
--   그 화면들에서 통째로 사라진다. 앞으로도 **대표(가장 이른 쿼터) 영상**을 여기에 함께 쓴다.
--   → 쿼터 영상이 없는 기존 경기 271건은 이 마이그레이션 전후로 동작이 100% 동일하다.
-- =============================================

CREATE TABLE IF NOT EXISTS league_game_videos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_game_id UUID NOT NULL REFERENCES league_games(id) ON DELETE CASCADE,

  -- league_game_events.quarter 와 같은 축이다(1~4쿼터 · 5~6 연장).
  --   같은 CHECK 범위를 쓴다 — 어긋나면 5쿼터 이벤트에 붙일 영상을 만들 수 없다.
  quarter        INT  NOT NULL CHECK (quarter BETWEEN 1 AND 6),

  youtube_url    TEXT NOT NULL,
  -- 영상 시작이 경기 시작보다 앞설 때의 보정(초). league_games.youtube_start_offset 과 같은 뜻.
  start_offset   INT  NOT NULL DEFAULT 0,

  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 한 쿼터에 영상은 하나. 두 개가 붙으면 그 쿼터 클립이 회차마다 다른 영상을 가리킨다.
  CONSTRAINT league_game_videos_game_quarter_uniq UNIQUE (league_game_id, quarter)
);

-- 조회는 항상 "이 경기들의 쿼터 영상 전부" 형태다(클립 조립이 이벤트 수백 건을 한 번에 푼다).
CREATE INDEX IF NOT EXISTS idx_league_game_videos_game
  ON league_game_videos(league_game_id, quarter);

COMMENT ON TABLE  league_game_videos            IS '경기의 쿼터별 유튜브 영상. 없으면 league_games.youtube_url 로 폴백한다(정본 판정: src/lib/youtube/gameVideo.ts).';
COMMENT ON COLUMN league_game_videos.quarter    IS '1~4쿼터 · 5~6 연장. league_game_events.quarter 와 같은 축.';
COMMENT ON COLUMN league_game_videos.start_offset IS '영상 시작 보정(초). 이 쿼터 영상 안에서의 video_timestamp 기준점.';

-- RLS — 다른 리그 표와 같은 정책을 따른다. 쓰기는 전부 service_role(API 라우트)이고
--   읽기는 서버에서만 일어나므로 anon 에는 아무 권한도 주지 않는다.
ALTER TABLE league_game_videos ENABLE ROW LEVEL SECURITY;
