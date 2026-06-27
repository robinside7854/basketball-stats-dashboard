-- 감독관(supervisor) 코드를 분기당 무제한 발급할 수 있도록 partial unique index 제거.
--
-- 마이그레이션 047 에서 한 분기당 supervisor 1개 강제 인덱스
-- (league_draft_codes_supervisor_unique) 가 추가됐는데, 부총무 등 복수 감독관
-- 운영 요구가 발생해 해제. API 제약(POST /api/admin/.../draft-codes) 은 이미 제거됨.
--
-- 단장(manager) 측 UNIQUE (quarter_id, team_id) 은 그대로 유지 — 팀당 1명 단장 원칙.

DROP INDEX IF EXISTS league_draft_codes_supervisor_unique;
