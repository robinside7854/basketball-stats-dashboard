# 내 기록 탭 정리 + 네비게이션 재편

사용자 지시 6건. 브랜치 `feat/me-tab-refine` → 완료 후 master 병합 + push.
기준 시안: 아티팩트 「온볼 모바일 현재 구조 — 내 기록 탭」(2026-08-08).

## 컨트롤러 자율 판단 (반드시 보고서에 남길 것)

1. **설정(`/settings`) 진입점**: 지시 5번대로 `/me` 에서 빼면 **모바일 어드민이 설정에 닿을 길이
   없어진다**(현 진입점 = `/me` 바로가기 + 데스크톱 상단 탭, 하단 5탭엔 없음).
   → 상단 바 우측 **편집/어드민 칩 옆에 어드민 전용 설정 아이콘 버튼**을 추가한다.
   "어드민 도구는 어드민 자리에" 라는 지시 취지에 맞고, 일반 회원에게는 보이지 않는다.
2. **팀/경기 서브탭 순서**: `일정 · 박스스코어 · 경기 기록 · 팀 명단 · 팀 구성`.
   랜딩이 `/schedule` 이라 일정이 먼저다. 순서는 조정 가능한 판단.
3. **둘러보기 삭제 범위**: 컴포넌트·스텝 정의·트리거·`?tour=1` 처리·`data-tour` 속성까지 전부.
   `SectionCard` 의 `dataTour` prop 도 소비자가 없어지면 제거한다.

## Global Constraints (전 태스크 공통)

1. **데이터·계산 로직 수정 금지.** 네비게이션·표현 계층 작업이다.
   (Task 2 의 신규 목록 페이지가 조회하는 것은 예외 — 새 쿼리를 발명하지 말고 형제 페이지 패턴을 따른다.)
2. **스탯 테이블·박스스코어의 밀도 불변** — 열 개수·행 높이·`tabular-nums`·sticky 첫 열·가로 스크롤.
3. **하드코딩 hex 금지**(`--mm-*` 경유) · 라디우스 `--mm-radius-*` · **이모지 금지**(lucide-react) · 44px 터치 타깃.
4. **테마 반전 토큰 위 고정색 금지** — `#fff`/`#000`/`text-white` 가 남으면 한쪽 테마에서 글씨가 사라진다.
5. **비공개 리그 게이트**: 신규 서버 `page.tsx` 는 **데이터 fetch 전에** `isLeaguePrivateGated` 조기 return.
   형제 `page.tsx` 패턴을 그대로 따를 것.
6. **활성 탭 판정은 `pathname` 기준** — 미들웨어가 slug→UUID internal rewrite 를 한다.
   `deriveLeagueBase()` 를 쓸 것. `params` 로 판정하면 인디케이터가 항상 꺼진다.
7. `.single()` 금지 → `.maybeSingle()`. 쿼리 error 를 빈 결과로 삼키지 말 것.
   에러 응답·throw 에 DB 원문을 그대로 노출하지 말 것.
8. **기존 URL 을 깨지 않는다.** 라우트를 옮기면 리다이렉트를 남긴다.
9. **어떤 화면에서도 하단 탭이 최소 하나는 켜져야 한다.** 전부 꺼지면 사용자가 위치를 잃는다.
10. 작업 후 `npx tsc --noEmit` · `npm run build` 통과,
    `node scripts/verify-schema.mjs` · `node scripts/verify-scoring.mjs` exit 0.

---

## Task 1 — 네비게이션 라벨·구조 (지시 1·2·5 일부)

### 1-A. "내 기록" 탭 라벨을 로그인 유저 이름으로 (지시 1)
`src/app/league/[orgSlug]/[leagueId]/_components/LeagueLayoutClient.tsx`
- `BottomNav` 는 이미 `useCurrentUser()` 를 쓰고 있다(167행). `TabNav` 도 `user` 를 갖고 있다(29행).
- **로그인**: 탭 라벨 = `user.name ?? user.login_id`. 아이콘은 사진 있으면 사진, 없으면 lucide `User`.
- **비로그인**: 라벨 = 가입 유도 문구, 아이콘 = lucide `UserPlus`.
  문구는 하단 탭 폭(5분할·11px)에 들어가야 하므로 **짧게**. `가입하기` 정도를 쓰되,
  더 나은 후보가 있으면 판단하고 근거를 보고서에 남길 것.
- ⚠ **긴 이름이 탭을 깨뜨리지 않게** 할 것. 5탭이 폭을 나눠 쓰므로 `truncate` + `min-w-0` 등으로
  넘침을 막고, 실제로 375px 에서 확인하라. 데스크톱 상단 탭도 동일 규칙.
- `aria-label` 은 "내 기록" 의미가 유지되도록 쓸 것 (라벨이 사람 이름이 되면 스크린리더가 목적지를 못 읽는다).

### 1-B. '경기' → '팀/경기', 명단·팀구성 흡수 (지시 2)
- `LeagueLayoutClient` 의 상단 탭·하단 탭 라벨 `경기` → **`팀/경기`**.
- `match` 배열에 `/roster` · `/teams` 추가. **그리고 홈 탭의 활성 판정에서 `/roster`·`/teams` 를 빼라**
  — 지금은 홈이 흡수하고 있다(58~64행 주석 참조). 안 빼면 두 탭이 동시에 켜진다.
- `src/components/league/LeagueSubTabs.tsx` 의 `GROUPS` 에서 **`squad` 그룹을 없애고 `games` 로 합친다**:
  `일정(/schedule) · 박스스코어(/boxscore) · 경기 기록(/record) · 팀 명단(/roster) · 팀 구성(/teams)`
  - 5개라 좁은 화면에서 넘친다 → **가로 스크롤 컨테이너**로 감싸되 **페이지 본문은 가로로 밀리지 않게** 할 것.
- `roster/page.tsx:595` · `teams/page.tsx:1059` 의 `group="squad"` → `group="games"`.
  다른 `group="squad"` 사용처가 있는지 grep 으로 확인할 것.

### 1-C. 어드민 설정 진입점 (자율 판단 1)
- 상단 바 우측, 편집/어드민 칩 **옆에** `Settings` 아이콘 버튼을 추가한다. **`isEditMode` 일 때만** 노출.
- `aria-label="리그 설정"`, 44×44px, `--mm-*` 토큰만 사용.
- 데스크톱 상단 탭의 `설정` 항목은 **그대로 둔다**(중복이 아니라 데스크톱 편의).

---

## Task 2 — 박스스코어를 일자 목록으로 (지시 3)

현재 `/boxscore` 는 최근 완료 경기로 **즉시 redirect** 한다. 이걸 **일자 목록 페이지**로 바꾼다.

`src/app/league/[orgSlug]/[leagueId]/boxscore/page.tsx` 재작성:
- **일자별 목록**. 각 행: 날짜 · 그날 경기 수 · (가능하면 그날 맞붙은 팀 요약). 클릭 → `/boxscore/[date]`.
- **최근 5경기(=5일)씩 페이지네이션**. `?page=` 쿼리로 서버에서 처리(클라이언트 상태 아님).
  이전/다음 버튼은 경계에서 비활성 처리하고 `disabled` 를 시각·의미 양쪽으로 표현할 것.
- **분기별 필터 칩**: `league_quarters` 를 조회해 칩으로. `?quarter=<id>` 쿼리.
  "전체" 칩을 기본값으로 두고, 선택 시 해당 분기 경기만. 칩은 44px 터치 타깃.
- 대상 경기: 기존과 동일하게 `is_complete = true`, `is_exhibition = false`.
- 완료 경기 0건이면 지금처럼 빈 상태 안내(서브탭 바는 유지 — 없으면 사용자가 갇힌다).
- **`/boxscore/[date]` 는 건드리지 않는다.** 기존 URL 이 그대로 살아야 한다.
- ⚠ 게이트(`isLeaguePrivateGated`)를 **데이터 fetch 전에** 확인할 것.
- ⚠ 분기 조회·경기 조회 모두 error 를 삼키지 말 것. 0건(정상)과 조회 실패(장애)를 구분한다.
- 페이지네이션 total 계산 시 **PostgREST 1000행 상한**에 주의 — count 는 `head: true` + `count: 'exact'` 로
  받거나 날짜 distinct 를 서버에서 집계할 것. 전체 행을 받아 세지 말 것.

---

## Task 3 — 스탯: 플레이 맵 삭제, 어워즈를 서브탭으로 (지시 4)

`src/app/league/[orgSlug]/[leagueId]/stats/page.tsx`
- `StatMode` 에서 `'playmap'` 제거. `?tab=playmap` 처리 분기(142·205·209행), 렌더 분기(526~) 제거.
- 서브탭 목록(472~475행): `플레이 맵` 삭제.
  `어워즈` 는 지금 `external: true`(구분선 + 화살표)로 "옆 페이지" 표시가 붙어 있는데,
  **정식 서브탭으로 승격**한다 → `external` 플래그 제거.
  결과: `리더보드 · 시즌하이 · 어워즈`
- `src/components/league/charts/PlayMapChart.tsx` **삭제**. 다른 소비자가 없는지 grep 으로 확인.
- `?tab=playmap` 으로 들어온 옛 링크는 **리더보드로 폴백**되게 둘 것(깨진 화면 대신).
- `LeagueGroupTabs` 의 `external` prop 은 다른 사용처가 남아 있으면 유지, 0곳이면 제거 판단.

---

## Task 4 — 둘러보기 전면 삭제 + `/me` 정리 (지시 5·6)

### 4-A. 둘러보기 삭제 (지시 6)
삭제 대상:
- `src/components/league/LeagueTour.tsx` · `src/components/league/LeagueTourTrigger.tsx`
- `src/components/league/tour/tourSteps.ts` (디렉터리째)
- `league/[orgSlug]/[leagueId]/page.tsx` 의 `LeagueTourTrigger` 렌더 + Suspense 래퍼
- `LeagueLayoutClient` 의 `?tour=1` 관련 잔재 · `mm-tour-open` 이벤트
- `MePageClient` 의 "둘러보기 다시 보기" 버튼
- **`data-tour` 속성 8곳** 과 `SectionCard` 의 `dataTour` prop (소비자 0 이 되면 prop 도 제거)
- `InternalLinkPicker` 에 투어 관련 항목이 있으면 함께 정리
- 투어 1회 실행 여부를 저장하던 localStorage 키가 있으면 **읽는 코드만 제거**한다(기존 값은 방치해도 무해).

### 4-B. `/me` 정리 (지시 2·5)
`src/app/league/[orgSlug]/[leagueId]/me/MePageClient.tsx`
- **팀 명단 · 팀 구성 바로가기 제거** — Task 1-B 로 팀/경기 탭으로 옮겨졌다.
- **설정 바로가기 제거** — Task 1-C 가 상단 바에 어드민 전용 버튼을 만든다.
- 남는 바로가기: **내 하이라이트**(로그인 시) · **드래프트**(진행 중일 때).
  둘 다 없으면 바로가기 카드 자체를 렌더하지 않는다(빈 카드 금지).
- 계정 카드에서 **둘러보기 버튼 제거** → 남는 것은 다크/라이트 전환 · 로그아웃.

---

## 완료 기준
- 하단 탭이 로그인 시 이름, 비로그인 시 가입 유도로 바뀌고 **375px 에서 5탭이 안 깨진다**
- `/roster`·`/teams` 에서 **팀/경기 탭 하나만** 켜진다 (홈과 동시 점등 없음)
- `/boxscore` 가 일자 목록 + 5개씩 페이지네이션 + 분기 칩으로 동작하고, `/boxscore/[date]` 는 그대로
- 스탯 서브탭이 `리더보드 · 시즌하이 · 어워즈` 이고 `?tab=playmap` 이 리더보드로 폴백
- 둘러보기 흔적이 코드에 남지 않음(`grep -rn "LeagueTour\|tourSteps\|data-tour" src` 0건)
- 모바일 어드민이 설정에 닿을 수 있음
- master 병합 + push
