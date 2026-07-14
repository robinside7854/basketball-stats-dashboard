-- URL 축약 시스템 — 하이라이트/클립 공유용
-- 카카오톡·SNS 공유 편의 (긴 필터 URL → /h/{code} 6자)
--
-- 사용 흐름:
--   1) 클라이언트 POST /api/short-url { target, meta? } → { code, url }
--   2) 사용자가 https://.../h/{code} 공유
--   3) GET /h/{code} → clicks++ → 307 redirect to target
--
-- deduplication: 같은 target 이면 기존 code 재사용 (POST 라우트에서 처리)

CREATE TABLE IF NOT EXISTS public.short_urls (
  code       text PRIMARY KEY,
  target     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  clicks     int  NOT NULL DEFAULT 0,
  meta       jsonb                          -- 예: { league_id, type, source }
);

-- dedup 조회용 — 이미 존재하는 target 이면 기존 code 재사용
CREATE INDEX IF NOT EXISTS idx_short_urls_target
  ON public.short_urls (target);

-- 관리자 대시보드용 (최신순 나열)
CREATE INDEX IF NOT EXISTS idx_short_urls_created
  ON public.short_urls (created_at DESC);

-- 리다이렉트 라우트는 anon 키로 조회할 수도 있어 public read 허용
-- (target 자체가 이미 공개 페이지 URL 이라 노출 리스크 없음)
ALTER TABLE public.short_urls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "short_urls public read" ON public.short_urls;
CREATE POLICY "short_urls public read"
  ON public.short_urls
  FOR SELECT
  USING (true);

-- 쓰기는 service role 로만 (기본 RLS 정책 없으면 anon 쓰기 차단됨)
-- API 라우트는 SUPABASE_SERVICE_ROLE_KEY 사용
