-- 드래프트 공유 토큰 — 어드민 사이트 밖 별도 공개 페이지로 단장/감독관·시청자
-- 모두를 같은 짧은 URL(/draft/[token]) 로 진입시키기 위한 unguessable 토큰.
--
-- 토큰 자체는 진입 권한만 부여 (시청 가능). 단장/감독관의 실제 액션은 여전히
-- 기존 X-Draft-Code 헤더(bcrypt) 검증이 필요하므로 토큰 노출이 데이터를 위협하지
-- 않음. nanoid 16자 정도면 충돌·추측 모두 사실상 불가능.
--
-- 단, 누구나 토큰만 알면 진행 상황(픽 보드·완료된 픽)은 볼 수 있게 됨 → 의도된 동작.

ALTER TABLE league_drafts
  ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;

CREATE INDEX IF NOT EXISTS league_drafts_share_token_idx
  ON league_drafts (share_token)
  WHERE share_token IS NOT NULL;

COMMENT ON COLUMN league_drafts.share_token IS
  '공개 공유 페이지(/draft/[token]) 진입용 unguessable 토큰. NULL = 아직 공유 안 됨.';
