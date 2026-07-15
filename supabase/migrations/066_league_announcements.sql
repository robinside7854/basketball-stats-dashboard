-- 리그 공지사항 (업데이트 노트) — 리그 홈에 시간순 노출.
-- 편집은 리그 PIN(edit_pin) 기반 · 로그인 없음.
CREATE TABLE public.league_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  title text NOT NULL,
  body_markdown text NOT NULL DEFAULT '',
  pinned boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_by text,      -- 작성자 표시명 (선택 · PIN 이 있어야 편집 가능하니 신원 검증 아님)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX league_announcements_league_pub_idx
  ON public.league_announcements (league_id, pinned DESC, published_at DESC);

COMMENT ON TABLE public.league_announcements IS
  '리그 공지/업데이트 노트. 편집은 leagues.edit_pin 인증. body_markdown 에는 이미지 링크(Supabase Storage) 포함 가능.';
