-- 공지사항 댓글 · 로그인 없음. 비밀번호 4자리로 본인만 수정/삭제 가능.
-- 비번은 salt + PBKDF2-SHA256 해시로 저장 (평문 저장 금지).
CREATE TABLE public.league_announcement_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.league_announcements(id) ON DELETE CASCADE,
  nickname text NOT NULL CHECK (char_length(nickname) BETWEEN 1 AND 20),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  password_salt text NOT NULL,     -- 16 bytes hex
  password_hash text NOT NULL,     -- PBKDF2-SHA256 hex
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,           -- soft delete (어드민 삭제 시)
  deleted_by_admin boolean NOT NULL DEFAULT false
);

CREATE INDEX league_announcement_comments_ann_created_idx
  ON public.league_announcement_comments (announcement_id, created_at ASC);

COMMENT ON TABLE public.league_announcement_comments IS
  '공지사항 댓글. nickname 자유, 비번 4자리 salted PBKDF2 해시 저장. 어드민(리그 PIN)은 모두 삭제 가능.';
