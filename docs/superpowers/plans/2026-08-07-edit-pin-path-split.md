# 편집 PIN 조회·변경 경로 분리 (보안)

발단: 정보구조 정리(Phase L) 최종 리뷰가 잡은 선재 결함.
브랜치: `fix/edit-pin-path-split` → 완료 후 master 병합 + push.

## 문제

`GET /api/leagues/[leagueId]` 가 `select('*')` 라 응답에 **`leagues.edit_pin`** 이 실린다.
가드가 `canViewLeague` 라서 **공개 리그면 비로그인 익명 방문자도 200 을 받는다.**
그 PIN 을 상단 "편집" 버튼에 넣으면 편집 모드(쓰기 권한)가 열린다.

**PIN 검증 자체는 안전하다** — `lib/leaguePinAuth.ts`·`/api/auth/league-pin` 이 서버에서
`.eq('edit_pin', pin)` 로 대조한다. 클라이언트 비교가 아니다. 문제는 **값이 새어 나가는 것** 하나다.

## 사실 관계 (실측)

`GET /api/leagues/[leagueId]` 호출자 6곳 중 **응답에서 `edit_pin` 을 읽는 곳은 2곳뿐**이다:
- `src/app/league/[orgSlug]/[leagueId]/settings/page.tsx:92` — 팀 어드민이 현재 PIN 을 보는 자리
- `src/app/admin/(dashboard)/leagues/[leagueId]/page.tsx:43` — CEO 콘솔 (NextAuth)

나머지 4곳(`record`·`roster`·`admin/manage`·settings 의 다른 필드)은 PIN 을 쓰지 않는다.

`leagues` 컬럼 전체:
`id, org_slug, name, season_year, start_date, match_day, total_rounds, status, created_at,
season_type, games_per_round, edit_pin, youtube_channel, plus_one_age, slug, team_id, mode, rules`

## Global Constraints

1. **PIN 을 새 경로로도 익명에게 노출하지 않는다.** 신규 엔드포인트의 가드를 반드시 검증할 것.
2. **기존 화면이 깨지지 않아야 한다** — 호출자 6곳 전부 확인.
3. 데이터·계산 로직 변경 금지. 인증/권한과 응답 필드만 다룬다.
4. `.single()` 대신 `.maybeSingle()`. 쿼리 error 를 빈 결과로 삼키지 않는다.
5. 에러 응답에 DB 원문 메시지를 그대로 싣지 않는다(정보 노출).
6. 작업 후 `npx tsc --noEmit` · `npm run build` 통과, `verify-schema` · `verify-scoring` exit 0.

---

## Task 1 — 공개 GET 에서 `edit_pin` 제거

`src/app/api/leagues/[leagueId]/route.ts` 의 `GET`:
- `select('*')` → **명시 컬럼 목록**으로 교체. `edit_pin` 만 뺀다:
  `id, org_slug, name, season_year, start_date, match_day, total_rounds, status, created_at,
  season_type, games_per_round, youtube_channel, plus_one_age, slug, team_id, mode, rules`
- `.single()` → `.maybeSingle()`. 데이터가 없으면 404, 쿼리 error 는 500 + **일반 메시지**
  (DB 원문 노출 금지). 없음과 장애를 구분할 것.
- `src/types/league.ts` 의 `edit_pin?: string` 은 **옵셔널이므로 그대로 둔다** — 신규
  엔드포인트 응답 타입으로 계속 쓰인다.

## Task 2 — 전용 PIN 엔드포인트 신설

**신규 파일** `src/app/api/leagues/[leagueId]/edit-pin/route.ts`

### GET — 현재 PIN 조회
가드는 **둘 중 하나라도 통과하면 허용**:
- `canEditLeague(req, leagueId)` — 팀 어드민 세션 또는 `X-League-Pin` 헤더 (`src/lib/auth/leagueAdmin.ts`)
- `auth()` — CEO NextAuth 세션 (`src/lib/auth.ts`)

통과 못 하면 **403**(존재 여부를 흘리지 않도록 401 이 아니라 403 이 적절한지 판단해서 고르고,
고른 이유를 보고서에 쓸 것). 응답은 `{ edit_pin: string }` 만.

### PATCH — PIN 변경
같은 가드. body `{ edit_pin }` 을 받아 **`edit_pin` 컬럼 하나만** 업데이트한다.
- **숫자 4자리 검증 필수** (`/^\d{4}$/`). 서버에서 검증한다 — 클라이언트 검증은 우회된다.
- `.update({ edit_pin })` 로 **명시 필드만** 쓴다. `body` 를 통째로 넘기지 말 것(mass assignment).
- 성공 시 `{ success: true }`. **응답에 PIN 을 되돌려주지 않는다.**

⚠️ 이 PATCH 는 **팀 어드민의 PIN 변경을 새로 가능하게 만든다.** 현재는 설정 페이지가
NextAuth 전용 PATCH 를 호출해 팀 어드민에게 401 이 나고 있다(아래 Task 4 참조).
CLAUDE.md 의 역할 정의상 "어드민 = 각 팀 운영진"이고 설정 탭은 그들의 자리이므로
의도된 권한이다. **PIN 을 아는 사람도 PIN 을 바꿀 수 있다**(비밀번호와 같은 성질) — 정상.

## Task 3 — 소비처 2곳 전환

- `src/app/league/[orgSlug]/[leagueId]/settings/page.tsx`
  - `:92` `setPin(data.edit_pin ?? '0000')` 제거 → 신규 `GET .../edit-pin` 으로 별도 조회.
    **이 페이지는 편집 모드에서만 열리므로** PIN 헤더나 어드민 세션이 이미 있다.
    기존 fetch 가 `X-League-Pin` 헤더를 어떻게 싣는지 **코드를 읽고 같은 방식**을 쓸 것.
    (`src/contexts/LeagueEditModeContext.tsx` 또는 공용 fetch 래퍼를 확인)
  - `savePin()` (`:161`) → 신규 `PATCH .../edit-pin` 으로 교체.
  - PIN 조회에 실패하면 입력란을 비우고 안내를 띄운다. **`'0000'` 같은 가짜 기본값을 넣지 말 것** —
    사용자가 그게 진짜 PIN 인 줄 알고 저장하면 PIN 이 0000 으로 바뀐다.
- `src/app/admin/(dashboard)/leagues/[leagueId]/page.tsx`
  - `:43` 도 신규 `GET .../edit-pin` 으로. CEO 는 NextAuth 세션이 있으므로 통과한다.
  - `:70` 의 PIN PATCH 도 신규 엔드포인트로 옮길지 판단할 것. 기존 PATCH(NextAuth)로도
    동작하지만, "PIN 경로 분리"의 취지상 한 곳으로 모으는 편이 낫다.

## Task 4 — 인접 결함은 **고치지 말고 기록만**

`settings/page.tsx` 의 `save()` (`:148`) 가 `PATCH /api/leagues/[leagueId]` 를 호출하는데
그 PATCH 는 `auth()`(NextAuth) 전용이다. **팀 어드민은 401 을 받아 설정 저장이 전부 실패한다**
(status·match_day·start_date·season_type·games_per_round·youtube_channel·plus_one_age).
CEO 가 같은 브라우저에서 `/admin` 에 로그인해 있으면 우연히 통과하므로 그동안 안 드러났을 수 있다.

또한 그 PATCH 는 `.update(body)` 로 **body 를 통째로** 쓴다(mass assignment). NextAuth 전용이라
현재 위험도는 낮지만, 가드를 넓히면 즉시 위험해진다.

**이번 범위에서 고치지 않는다.** "팀 어드민이 리그 설정의 어느 필드까지 바꿀 수 있는가"는
권한 설계 결정이고 사용자 확인이 필요하다. `docs/onball-current-state.md` 와
`.superpowers/sdd/progress.md` 에 다음 취지로 기록한다:

> `PATCH /api/leagues/[leagueId]` 가 NextAuth 전용이라 팀 어드민의 설정 저장이 401 로 실패한다.
> 또 `.update(body)` 라 mass assignment 위험이 있다. 가드를 넓히려면 **허용 필드 화이트리스트가
> 선행**돼야 한다. PIN 변경만은 전용 엔드포인트로 분리됨(2026-08-07).

## Task 5 — 검증

- **익명 요청으로 PIN 이 안 나오는지 실제 확인**: 개발 서버를 띄우고 쿠키·헤더 없이
  `GET /api/leagues/<id>` 를 호출해 응답 JSON 에 `edit_pin` 키가 **없음**을 확인한다.
- **신규 엔드포인트가 무자격 요청을 막는지 확인**: 쿠키·헤더 없이 `GET .../edit-pin` 이
  403(또는 선택한 코드)을 반환하는지 확인한다.
- 두 결과를 보고서에 **실제 응답과 함께** 남긴다. "코드상 안전해 보인다"는 검증이 아니다.

## 완료 기준
- 익명 `GET /api/leagues/[id]` 응답에 `edit_pin` 없음 (실측)
- 무자격 `GET/PATCH .../edit-pin` 차단됨 (실측)
- 설정 페이지에서 PIN 조회·변경이 동작 (팀 어드민 경로)
- 호출자 6곳 회귀 없음
- `tsc` · `build` · `verify-schema` · `verify-scoring` 전부 통과
- master 병합 + push
