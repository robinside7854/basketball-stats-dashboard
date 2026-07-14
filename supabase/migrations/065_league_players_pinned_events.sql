-- 선수 프로필카드에 노출할 "내 베스트샷" — 리그 이벤트 UUID 배열 (최대 3개, 클라이언트/API 캡)
-- 로그인 없는 오픈 편집이라 서버측 강한 소유권 검증 없음 (전제 인지됨)
ALTER TABLE public.league_players
  ADD COLUMN pinned_event_ids uuid[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.league_players.pinned_event_ids IS
  '선수 프로필카드에 핀된 하이라이트 이벤트 UUID 목록 (최대 3개). 클라이언트가 순서대로 재생.';
