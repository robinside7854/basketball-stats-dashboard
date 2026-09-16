-- 117: 단장 코드 ↔ 선수 연결 (2026-09-16)
--
-- 단장 코드를 발급할 때 "누가 단장인지"를 선수 행으로 저장한다. 종전엔 자유 텍스트 레이블
-- ("구범준 단장")뿐이라 세션 생성 화면에서 팀장을 다시 손으로 골라야 했다. 이제 세션 생성 시
-- 이 컬럼으로 팀장을 자동 채운다. 감독관 코드는 NULL.
ALTER TABLE league_draft_codes
  ADD COLUMN IF NOT EXISTS league_player_id UUID REFERENCES league_players(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_draft_codes_player ON league_draft_codes(league_player_id);
COMMENT ON COLUMN league_draft_codes.league_player_id IS '단장 코드의 주인(선수). 세션 생성 시 팀장 자동 지정에 쓴다';
