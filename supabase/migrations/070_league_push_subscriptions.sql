-- 웹 푸시 구독 저장 (공지/알럿 발송용)
-- 브라우저 PushSubscription(endpoint + p256dh + auth 키)을 리그별로 보관.
-- 발송은 서버(service role)에서 web-push 로 수행 · 편집 PIN 인증.
-- 개인정보 최소화: endpoint 자체가 식별자라 익명 구독 허용, 로그인 회원은 라벨만 부가.
CREATE TABLE IF NOT EXISTS public.league_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE,          -- 브라우저 푸시 엔드포인트 (고유)
  p256dh text NOT NULL,                   -- 구독 공개키
  auth text NOT NULL,                     -- 구독 auth 시크릿
  member_label text,                      -- 로그인 회원 표시명(선택) · FK 아님(느슨 연결)
  user_agent text,                        -- 진단용 (기기 구분)
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS league_push_subscriptions_league_idx
  ON public.league_push_subscriptions (league_id);

-- RLS: 활성화하되 공개 정책 없음 → service role(admin client)로만 접근.
-- endpoint 는 준민감 식별자라 anon 노출 차단.
ALTER TABLE public.league_push_subscriptions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.league_push_subscriptions IS
  '리그 웹 푸시 구독. 발송은 서버 web-push · leagues.edit_pin 인증. 만료(410/404) 구독은 발송 시 자동 정리.';
