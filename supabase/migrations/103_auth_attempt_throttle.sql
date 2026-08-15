-- 103 · 인증 실패 시도 카운터 — PIN·로그인 무차별 대입 차단 (2026-08-15)
--
-- 왜 필요한가
--   편집 PIN 은 숫자 4자리다. 조합이 10,000개뿐인데 시도 횟수 제한이 어디에도 없었다.
--   2026-08-15 감사에서 프로덕션 실측으로 확인됨 — /api/auth/league-pin 에 연속 오답 6회를
--   보내도 전부 401 이고 429 는 한 번도 나오지 않았다. 응답이 0.27~1.0초라 병렬 없이도
--   한 시간 안에 10,000 조합을 전부 시도할 수 있다.
--
--   "권한 있는 사람의 실수" 가 아니라 외부인의 공격으로 성립한다. 리그 ID 는 브라우저 번들에
--   실린 익명 키(NEXT_PUBLIC_SUPABASE_ANON_KEY)로 `leagues?select=id,name,slug` 를 부르면
--   누구나 얻는다. PIN 하나를 얻으면 canEditLeague 로 가드된 mutation 라우트 약 30개
--   (경기·이벤트·명단·사진·드래프트 초기화)가 통째로 열린다.
--
-- 무엇을 막는가
--   (인증 표면, 대상, 요청자 IP) 조합별로 최근 실패 횟수를 세어, 임계값을 넘으면 잠근다.
--     - league_pin  : 리그 편집 PIN  (/api/auth/league-pin · X-League-Pin 헤더)
--     - team_pin    : 팀 편집 PIN    (/api/auth/pin · X-Team-Pin 헤더)
--     - admin_login : 운영 콘솔(/admin/login) 공동관리자 로그인
--   임계값은 앱 상수다 (src/lib/auth/attemptThrottle.ts — ATTEMPT_MAX · ATTEMPT_WINDOW_MS).
--
-- 왜 DB 인가 (메모리 카운터가 아니라)
--   Vercel 서버리스라 인스턴스가 요청마다 갈리고 수시로 죽는다. 프로세스 메모리에 센 숫자는
--   다음 요청이 다른 인스턴스로 가는 순간 0 이 된다 — 즉 사실상 제한이 없는 것과 같다.
--   Redis 는 이 프로젝트에 없다. 그래서 platform_access_requests 가 이미 쓰고 있는
--   "DB count 로 세는" 방식(마이그레이션 097 · src/app/api/admin/access-requests/route.ts)을
--   그대로 따른다 — 새 방식을 만들지 않는다.
--
-- 왜 (대상, IP) 조합인가 — IP 만으로 세면 안 되는 이유
--   같은 체육관 와이파이에서 여러 운영진이 각자 자기 팀 PIN 을 넣는다. IP 하나만 기준으로
--   잡으면 남이 틀린 횟수 때문에 내가 잠긴다. 반대로 대상(리그)만 기준으로 잡으면 공격자
--   한 명이 그 리그의 정상 운영진 전원을 잠글 수 있다(서비스 거부). 둘을 조합해야 한다.
--
-- 왜 IP 원문이 아니라 해시인가
--   대조에는 해시로 충분하고, 남겨두는 개인정보는 줄이는 게 낫다.
--   platform_access_requests.ip_hash 와 같은 방식(sha256 앞 32자)이다.
--
-- ⚠ PIN 값 자체는 이 표에 절대 저장하지 않는다. 여기 남는 건 "누가 어디에 몇 번 실패했나"
--   뿐이다. 무엇을 입력했는지는 로그에도 남기지 않는다.
--
-- RLS
--   이 저장소 관행대로 "RLS 켜고 정책은 0개" = service_role 전용
--   (마이그레이션 097 platform_admins 와 동일). 익명 키로는 한 행도 읽거나 쓸 수 없다.
--   공격자가 자기 실패 기록을 지워 잠금을 푸는 걸 막으려면 이게 필수다.
--
-- 이 표가 없어도 앱은 죽지 않는다
--   앱 쪽 카운터 조회·기록은 전부 try/catch 로 감싸 실패하면 그냥 건너뛴다
--   (fail-open on counter). 즉 이 마이그레이션 적용 전에도 기존 인증은 그대로 동작하고,
--   적용하는 순간부터 잠금이 켜진다. 인증 판정 자체는 반대로 fail-closed 다.
--
-- ⚠️ 이 파일은 작성만 하고 실행하지 않는다 (Write SQL = 사용자 명시 확인 후에만 실행,
--    CLAUDE.md 규칙). 사용자 확인 후 `scripts/db-migrate.mjs` 또는 Supabase SQL Editor 로 적용.
--
-- ── 롤백 (필요 시 이 블록만 실행) ─────────────────────────────────────────
--   DROP TABLE IF EXISTS public.auth_failed_attempts;
--   -- 표가 사라지면 앱은 자동으로 "카운팅 없음" 상태로 되돌아간다(fail-open on counter).
--   -- 코드 롤백은 따로 필요 없다.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auth_failed_attempts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 인증 표면. 'league_pin' | 'team_pin' | 'admin_login'
  -- CHECK 제약을 걸지 않는 이유: 새 인증 표면을 하나 추가할 때마다 마이그레이션이 필요해지고,
  -- 값이 안 맞으면 INSERT 가 터져 "카운터 때문에 로그인이 막히는" 최악의 실패가 된다.
  scope      TEXT NOT NULL,
  -- 대상 식별자. 리그 UUID · 팀 UUID(또는 org/team 슬러그) · 정규화된 관리자 이메일.
  subject    TEXT NOT NULL,
  -- 요청자 IP 의 sha256 앞 32자 (src/lib/auth/platformAdmin.ts 의 hashIp).
  ip_hash    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 매 인증 시도마다 타는 조회 — (scope, subject, ip_hash) 로 최근 N분 건수를 센다.
-- 컬럼 순서가 곧 필터 순서다. created_at 이 마지막이라 범위 조건이 인덱스 끝에서 잘린다.
CREATE INDEX IF NOT EXISTS auth_failed_attempts_lookup_idx
  ON auth_failed_attempts (scope, subject, ip_hash, created_at DESC);

-- 오래된 기록 정리용. 이 표는 계속 쌓이기만 하므로 주기적으로 지워야 한다.
--   DELETE FROM auth_failed_attempts WHERE created_at < NOW() - INTERVAL '7 days';
-- (지금은 수동. 건수가 문제가 될 규모가 아니라 크론까지 붙이지 않았다.)
CREATE INDEX IF NOT EXISTS auth_failed_attempts_created_idx
  ON auth_failed_attempts (created_at);

-- 정책 0개 = service_role 전용 (097 platform_admins 와 같은 방식)
ALTER TABLE auth_failed_attempts ENABLE ROW LEVEL SECURITY;
