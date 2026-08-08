# 레거시(대회 트리) 쓰기 API 가드 적용

발단: PIN 경로 분리(Phase M) 최종 보안 리뷰가 잡은 무가드 라우트군.
브랜치: `fix/legacy-route-guards` → 완료 후 master 병합 + push.

## 문제

레거시(파란날개 대회 트리) API **15개 파일 / 24개 쓰기 메서드에 인증 가드가 하나도 없다.**
주소만 알면 누구나 호출된다. 해당 테이블 RLS 도 `allow_all_* USING(true) WITH CHECK(true)` 라
DB 계층 방어도 0 이다.

가장 위험한 것:
- `DELETE /api/events?gameId=<id>` — **한 경기의 이벤트를 통째로 삭제**
- `DELETE /api/games/[id]` · `DELETE /api/players/[id]` · `DELETE /api/tournaments/[id]`
- `DELETE /api/minutes?gameId=<id>` · `POST /api/players/merge`(선수 병합, 되돌리기 어려움)

## 현재 상태 (실측)

- `src/lib/teamPinAuth.ts` 의 `verifyTeamPin(req, org, team)` 이 **이미 존재하지만 아무 데서도 안 쓴다.**
  `X-Team-Pin` 헤더를 `teams.edit_pin` 과 대조하고 **성공 시 `teams.id` 를 반환**한다
  (소유권 대조에 쓰라고 그렇게 설계돼 있다).
- `src/contexts/EditModeContext.tsx:96` 이 `teamHeaders = { 'X-Team-Pin': pin }` 를 제공하지만
  **소비하는 곳이 0곳**이다.
- 즉 **클라이언트는 지금 PIN 헤더를 전혀 보내지 않는다.** 서버만 잠그면 파란날개의
  기록·명단·대회 관리가 전부 403 으로 죽는다.

## 대상 (이번 범위)

CRUD 라우트 12개 파일. **`ai/mvp` · `players/upload-photo` · `short-url` 은 이번 범위 밖**
(사용자 우선순위 3·4·6번 — 별건으로 처리).

| 라우트 | 쓰기 메서드 |
|---|---|
| `api/events` | DELETE, POST |
| `api/events/[id]` | DELETE |
| `api/events/split-quarter` | POST |
| `api/games` | POST |
| `api/games/[id]` | PUT, DELETE |
| `api/minutes` | DELETE, POST, PATCH |
| `api/players` | POST |
| `api/players/[id]` | PUT, DELETE |
| `api/players/merge` | POST |
| `api/tournaments` | POST |
| `api/tournaments/[id]` | PUT, DELETE |
| `api/tournament-players` | POST |

**GET 은 건드리지 않는다** — 공개 정보이고, 막으면 조회 화면이 깨진다.

## Global Constraints

1. **파란날개 기록 기능을 깨뜨리지 않는다.** 운영 중인 서비스다. 호출부를 하나라도 빠뜨리면
   그 기능이 조용히 403 이 된다.
2. **순서가 중요하다. 클라이언트를 먼저, 서버를 나중에.** 반대로 하면 그 사이에 앱이 죽는다.
   (같은 브랜치에 담더라도 커밋 순서를 지킬 것.)
3. **소유권을 대조한다.** PIN 검증만 하면 A팀 PIN 으로 B팀 데이터를 지울 수 있다.
   `verifyTeamPin` 이 돌려주는 `teams.id` 와 **수정 대상 리소스의 소유 팀이 일치**해야 한다.
4. 데이터·계산 로직 변경 금지. 인증/권한만.
5. `.single()` 금지 → `.maybeSingle()`. 쿼리 error 를 빈 결과로 삼키지 말 것.
6. 에러 응답에 DB 원문 메시지를 싣지 말 것.
7. **리그 트리(미라클) 는 건드리지 않는다.** `canEditLeague`·`mm_auth`·`getApprovedSession` 은
   별개 체계다.
8. `npx tsc --noEmit` · `npm run build` 통과, `verify-schema` · `verify-scoring` exit 0.

---

## Task 1 — 클라이언트가 `X-Team-Pin` 을 보내게 한다 (서버는 아직 안 잠금)

이 단계만으로는 **아무것도 막히지 않는다.** 헤더만 추가로 붙일 뿐이라 무해하다.

- `useEditMode()` 의 `teamHeaders` 를 **위 12개 라우트를 호출하는 모든 쓰기 요청**에 붙인다.
  `Content-Type` 과 함께 스프레드하면 된다: `headers: { 'Content-Type': 'application/json', ...teamHeaders }`
- **호출부를 직접 전수 조사할 것.** 아래는 조사에서 나온 것이며 **완전한 목록이 아닐 수 있다**:
  - `app/(main)/[org]/[team]/gamelog/page.tsx` (events DELETE, split-quarter)
  - `app/(main)/[org]/[team]/record/page.tsx` (events·minutes·games 다수)
  - `app/(main)/[org]/[team]/roster/page.tsx` · `roster/[id]/page.tsx` (players)
  - `app/(main)/[org]/[team]/tournaments/page.tsx` (tournaments·games DELETE)
  - `components/record/EventInputPad.tsx` · `components/record/SubstitutionPanel.tsx`
  - `components/roster/*` (PlayerForm·PlayerMergeModal·PlayerDetailModal 등)
  - `components/tournaments/*` (GameForm·YoutubeImportModal 등)
  `grep -rn "api/(events|games|minutes|players|tournaments|tournament-players)" src --include=*.tsx`
  로 시작해서 **쓰기 메서드를 쓰는 모든 지점**을 찾아라.
- 서버 컴포넌트나 컨텍스트 밖에서 호출하는 곳이 있으면 어떻게 PIN 을 얻을지 판단하고
  보고서에 근거를 남길 것.
- **이 태스크 끝에 커밋을 따로 만든다.** (순서 보장)

## Task 2 — 서버에 가드 + 소유권 대조

### 2-A. 라우트가 팀을 알아내는 방법
`verifyTeamPin(req, org, team)` 은 `org`·`team` 슬러그가 필요하다. 라우트별로 다르다:
- 리소스 id 가 있는 것(`games/[id]`·`players/[id]`·`tournaments/[id]`·`events/[id]`)은
  **id 로 리소스를 먼저 조회해 소유 팀을 역산**하는 것이 안전하다. 클라이언트가 보낸
  org/team 을 그대로 믿으면 소유권 대조가 무의미해진다.
- `gameId` 쿼리로 동작하는 것(`events` DELETE·`minutes` DELETE)도 `games` 를 조회해 역산한다.
- 생성 계열(`games` POST·`players` POST·`tournaments` POST·`tournament-players` POST)은
  body 에 이미 팀/대회 정보가 있을 가능성이 높다. **body 를 읽고 판단**하되, body 의 팀 값과
  PIN 이 가리키는 팀이 **일치하는지 반드시 확인**한다.
- 역산 경로가 애매한 라우트가 있으면 **멈추고 보고**하라. 추측으로 만들지 말 것.

⚠️ `games.team_type` 은 **믿으면 안 된다** — 50경기 전부 `'youth'` 로 들어가 있고 실제
장년부가 14건이다. `tournament_id → tournaments → team` 경로로 역산해야 한다.
`docs/onball-current-state.md` §10 참조.

### 2-B. 가드 적용
- 실패 시 **403** + 일반 메시지. 성공하면 기존 로직 그대로 실행.
- **GET 은 그대로 둔다.**
- 12개 파일 24개 쓰기 메서드 전부. **하나도 빠뜨리지 말 것** — 빠지면 그 경로는 여전히 열려 있다.

## Task 3 — 검증 (실제로 실행)

`npm run dev` 를 백그라운드로 띄우고 실제 HTTP 요청으로 확인한다. 검증 후 서버 종료.

1. **PIN 없이** `DELETE /api/events?gameId=<실제 게임 id>` → **403**, 그리고 **이벤트가 실제로
   안 지워졌는지 DB 로 확인**한다. (조회는 읽기라 자유롭게 해도 된다)
2. **틀린 PIN** 으로 같은 요청 → 403
3. **맞는 PIN** 으로 → 정상 동작. ⚠️ **실제 데이터를 지우지 말고**, 지우지 않는 메서드
   (예: `PUT /api/games/[id]` 로 무해한 값 수정 후 원복)로 검증하거나, 시험용 행을 만들고
   검증 후 지워라. **운영 DB 다. 원상복구를 쿼리로 증명할 것.**
4. **다른 팀 PIN 으로 남의 팀 리소스** 수정 시도 → 403 (소유권 대조가 실제로 동작하는지)
5. 브라우저에서 파란날개 편집 모드로 **기록 화면이 정상 동작**하는지 (헤더가 실제로 붙는지)

각 결과의 실제 응답과 DB 확인 결과를 보고서에 남긴다.

## 완료 기준
- PIN 없이 12개 라우트의 쓰기 메서드가 **전부** 403
- 올바른 PIN 으로는 기존 기능이 그대로 동작 (파란날개 기록 흐름 무손상)
- 다른 팀 PIN 으로는 남의 리소스를 못 건드림
- 운영 데이터 무변경 (검증용 데이터는 원복 증명)
- master 병합 + push
