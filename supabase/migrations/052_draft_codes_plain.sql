-- 드래프트 코드 평문 보존
--
-- 사용자 정책: 드래프트 코드는 API 키 수준의 보안이 아니어서, 어드민이 발급 후
-- 언제든 평문을 다시 볼 수 있어야 한다 (재전송·복사 편의). bcrypt 해시는 인증
-- 비교용으로 유지하되 평문도 같이 저장.
--
-- 보안 모델:
-- - league_draft_codes 테이블은 service role 만 접근 가능 (RLS ON, no policies)
-- - 어드민(NextAuth) 또는 PIN/감독관 코드 가진 사람만 GET 호출 가능 (라우트 가드)
-- - 평문 노출 위험은 어드민 콘솔 화면 자체의 ACL 만큼만 노출
--
-- 기존 행은 plain_code = NULL (해시만 있음, 복원 불가). UI 에서 NULL 인 경우
-- "재발급 필요" 또는 "수정에서 새 코드 설정" 안내.

ALTER TABLE league_draft_codes
  ADD COLUMN IF NOT EXISTS plain_code TEXT;

COMMENT ON COLUMN league_draft_codes.plain_code IS
  '평문 코드 — 어드민에게 항상 노출. bcrypt(code_hash) 와 같은 값.';
