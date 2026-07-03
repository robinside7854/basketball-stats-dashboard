-- 058_league_players_original_photo.sql
--
-- 원본 사진 URL 별도 컬럼 추가
--
-- 배경:
--   AI 프로필 생성/재생성 시 이전 결과물 (photo_url) 을 다시 입력으로 사용하면
--   품질이 계속 저하됨 (오차 누적). 사용자가 업로드한 실제 원본을 별도 보관해
--   생성/재생성 시 항상 원본을 입력으로 사용.
--
-- 정책:
--   - 업로드 시: photo_url + original_photo_url 양쪽에 저장
--   - AI 생성 시: original_photo_url 을 입력으로 사용, photo_url 만 결과로 갱신
--   - 재생성 시: 동일하게 original_photo_url 을 사용 → 동일 원본에서 새 결과

ALTER TABLE league_players
  ADD COLUMN IF NOT EXISTS original_photo_url TEXT;

COMMENT ON COLUMN league_players.original_photo_url IS
  '사용자가 업로드한 원본 사진 URL. AI 프로필 생성/재생성 시 항상 이 값을 입력으로 사용해 반복 재생성 시 품질 저하 방지.';
