-- 130: 게스트를 부른 회원을 이름 글자가 아니라 선수 번호로 기억한다 (2026-11-10 코드 리뷰)
--   종전엔 answered_by_label 「OO 초대」 글자로만 알아봐, 같은 이름의 다른 회원이 그 게스트를 취소할 수 있었다.
--   칸이 비어 있는 옛 줄은 지금처럼 이름표로 확인한다(코드 쪽 폴백).
ALTER TABLE weekly_rsvp
  ADD COLUMN IF NOT EXISTS invited_by_player_id UUID REFERENCES league_players(id) ON DELETE SET NULL;
