-- 코치 핀 — 코치가 경기 영상의 임의 지점을 골라 라벨을 붙인 수비 장면 큐레이션.
-- 기존 하이라이트는 game_events(성공 슛)에서 자동 생성되므로 득점으로 이어지지 않은
-- 수비 장면은 잡히지 않는다. 이 테이블이 그 공백을 메운다.
--
-- 클립 구간은 저장하지 않는다. video_timestamp 하나로 앞 12초/뒤 6초를 계산한다
-- (코치는 장면이 끝나는 순간에 핀을 꽂으므로 앞쪽을 길게 잡음).
-- team_id 는 games -> tournaments -> team_id 2홉 조인을 피하려는 비정규화.
-- 라벨 집계와 팀 전체 모아보기가 모두 팀 단위 조회라 이 컬럼이 없으면 매번 조인을 탄다.
CREATE TABLE public.coach_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  video_timestamp double precision NOT NULL CHECK (video_timestamp >= 0),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 20),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX coach_pins_game_ts_idx ON public.coach_pins (game_id, video_timestamp ASC);
CREATE INDEX coach_pins_team_label_idx ON public.coach_pins (team_id, label);

COMMENT ON TABLE public.coach_pins IS
  '코치가 경기 영상에 직접 꽂은 핀. 라벨은 자유 텍스트(초성 자동완성), 꽂는 즉시 공개.';
