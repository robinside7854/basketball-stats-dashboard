# 정보구조 정리 실행 계획 (온볼)

근거: 아티팩트 「온볼 정보구조 점검」(2026-08-07). 사용자 지시 4건을 태스크 4개로 분해.
브랜치: `feat/ia-cleanup` → 완료 후 master 병합 + push.

## 컨트롤러가 자율로 내린 판단 (사용자 부재 · 반드시 보고서에 남길 것)

1. **라커룸은 "네비게이션에서만" 제거하고 `/roster`·`/teams` 라우트는 살려 둔다.**
   선수 명단은 공개 정보이고 다른 화면 다수가 링크한다. 라우트를 지우면 되돌리기 어렵다.
   진입점은 "내 기록" 페이지의 바로가기와 홈으로 옮긴다.
2. **다른 선수 기록 조회 기능은 삭제하지 않는다.** 사용자 문장("조회하지 않을 것으로 예상")은
   예측이지 삭제 지시가 아니다. 리더보드·QuickView 모달은 그대로 두고 **메뉴에서 앞세우지 않을 뿐**이다.
3. **`/social`(주간 매거진)은 지우지 않는다.** 편집 권한자 전용 도구로 보이므로 은닉을 유지하되
   `docs/onball-current-state.md` 에 "의도된 은닉"으로 명시한다.
4. **CompetitionSwitcher 를 상단 좌측에 병합하는 건 이번 범위 밖**이다. 이번엔 좌측에
   리그/팀 이름(홈 링크)만 놓는다. 병합은 이월.

## Global Constraints (전 태스크 공통 · 위반 시 리뷰 실패)

1. **데이터 로직 금지.** fetch / useState / useEffect / 계산식 / API 라우트의 쿼리를 바꾸지 않는다.
   이번 작업은 네비게이션·표현 계층이다. (T4 의 신규 페이지가 기존 컴포넌트를 재사용하며
   불가피하게 fetch 를 호출하는 것은 예외 — 새 쿼리를 작성하지 말고 기존 것을 그대로 쓴다.)
2. **스탯 테이블·박스스코어의 밀도 불변** — 열 개수·행 높이·`tabular-nums`·sticky 첫 열·가로 스크롤.
3. **하드코딩 hex 금지.** 색은 `--mm-*` 토큰 경유. 라디우스는 `--mm-radius-*`.
4. **이모지를 UI 아이콘으로 쓰지 않는다.** 아이콘은 lucide-react.
5. **테마 반전 토큰 위에 고정색(`#fff`/`#000`/`text-white`) 금지** — 한쪽 테마에서 글씨가 사라진다.
6. **44×44px 터치 타깃 유지.** 새로 만드는 인터랙티브 요소도 동일.
7. **기존 URL 을 깨지 않는다.** 라우트를 옮길 때는 리다이렉트를 남긴다.
8. 작업 후 `npx tsc --noEmit` · `npm run build` 통과. `node scripts/verify-schema.mjs` ·
   `node scripts/verify-scoring.mjs` exit 0.

---

## Task 1 — 클릭 오인 정리

**규칙(이번에 확정): 카드가 호버로 떠오르면 카드 전체가 링크여야 한다. 카드 전체가 링크가
아니면 떠오르지 않아야 한다.**

### 1-A. `hover:shadow` 가 붙은 비클릭 요소 정리 (19파일)
각 지점을 **직접 읽고 둘 중 하나로** 판정한다:
- 카드 전체가 어딘가로 갈 자연스러운 목적지가 있다 → `<Link>` 로 감싸고 리프트 유지
- 목적지가 없다(순수 지표 표시) → **리프트 제거**

특히:
- `src/app/(main)/[org]/[team]/page.tsx:176–202` — KPI 카드 11곳. 승/패/득점/실점/FG% 는
  목적지가 없으므로 **전부 리프트 제거**.
- `src/components/league/nba/NbaRoundsSummary.tsx:70` · `nba/NbaLeaders.tsx:151` —
  카드 전체가 뜨는데 클릭은 안쪽 버튼만. **카드의 리프트를 제거**하고 안쪽 버튼/링크의
  자체 호버는 유지한다(그쪽이 진짜 타깃이므로).
- 나머지 파일(`TeamInsights` 5곳, `schedule/page.tsx` 3곳, `LeaderBadgePanel` 2곳,
  `awards`·`roster`·`teams`·`record`·`highlights`·`BestShotsGallery`·`HighlightsHome`·
  `LeagueSchedule`·`NbaSeasonHighs`·`PlayerBadgeStrip`·`TopFiveSlot`·`TournamentBoard`
  각 1곳)도 같은 기준으로 판정. **전수 처리하고 파일별 판정을 보고서에 표로 남긴다.**

### 1-B. 키보드 접근 불가 정리
- `src/app/(main)/[org]/[team]/tournaments/page.tsx:148` — 아코디언 토글이 `<div onClick>`.
  `<button type="button">` 으로 바꾸고 `aria-expanded` 를 붙인다. 레이아웃이 깨지면
  `display:contents` 대신 버튼에 기존 클래스를 옮겨 붙이는 방식으로 해결한다.
- 코드베이스 전체에서 `<div onClick>` / `<span onClick>` 을 재점검한다. **모달 배경
  `onClose` 는 정상 패턴이므로 건드리지 않는다.** 실제 동작을 수행하는 것만 대상.

### 1-C. 규칙 명문화
`DESIGN.md` 의 Do's and Don'ts 에 한 줄 추가:
> 카드가 호버로 떠오르면 카드 전체가 링크여야 한다. 카드 전체가 링크가 아니면 떠오르지 않는다.
> 리프트는 "누를 수 있다"는 신호이지 장식이 아니다.

---

## Task 2 — 우산 · 고아 라우트 정리

### 2-A. 공지를 하이라이트 우산에서 홈 우산으로
- `src/app/league/[orgSlug]/[leagueId]/_components/LeagueLayoutClient.tsx:55` 의
  하이라이트 탭 `match` 에서 `${base}/archive` 를 뺀다.
- 홈 탭이 `/archive` 도 활성으로 잡도록 홈 탭 판정을 고친다. 홈 탭은 현재
  `pathname === base` 완전일치라, `${base}/archive` 로 시작하면 홈이 활성이 되게 한다.
- `src/app/league/[orgSlug]/[leagueId]/archive/announcements/page.tsx:41–44` 의
  `groupTabs` 에서 "하이라이트" 항목을 빼고, 홈으로 돌아가는 항목으로 교체한다.
  (지금은 하이라이트↔공지 편도 연결이라 비대칭이다.)

### 2-B. 스탯 우산의 URL 방식 통일 — 전부 경로 방식
`src/app/league/[orgSlug]/[leagueId]/stats/page.tsx:469–472` 의 서브탭 4개 중
셋이 `?tab=` 쿼리, 어워즈만 경로다. **쿼리 방식을 유지하고 어워즈를 맞추는 것이 아니라,
현재 구조를 최소 변경으로 일관되게** 만든다:
- `?tab=seasonHigh` / `?tab=playmap` 은 이미 `useSearchParams` 로 동작 중이고 상태가
  페이지 안에 있다. 이걸 경로로 바꾸면 페이지 분해가 필요해 범위가 커진다.
- **따라서 이번엔 "같은 바 안에서 뒤로가기 동작이 다르다"는 문제만 해소한다**:
  어워즈 링크에 `scroll={false}` 같은 눈속임을 넣지 말고, 서브탭 바에서 **어워즈를
  시각적으로 구분**한다(구분선 + 화살표 아이콘). 같은 층이 아니라 "옆 페이지로 나간다"는
  것이 읽히면 기대 불일치가 사라진다.
- 완전한 URL 통일은 이월 항목으로 `progress.md` 에 기록한다.

### 2-C. 항목 하나짜리 서브탭 바 제거
- `src/components/layout/subTabs.ts` 의 `STATS_SUB_TABS` 는 항목이 1개다.
- `src/app/(main)/[org]/[team]/stats/page.tsx:264` 의 `<SubTabNav tabs={STATS_SUB_TABS} />`
  렌더를 제거하고, `STATS_SUB_TABS` 상수와 import 도 정리한다.
- `SubTabNav` 컴포넌트 자체는 게임 서브탭이 계속 쓰므로 남긴다.

### 2-D. 고아 라우트
- `src/app/todo/page.tsx` — 내용을 **직접 읽고** 개발 잔재인지 확인한 뒤 잔재면 삭제한다.
  제품 기능으로 보이면 삭제하지 말고 보고서에 근거와 함께 남긴다.
- `/social` — **삭제하지 않는다.** `docs/onball-current-state.md` 에
  "편집 권한자 전용 · 공개 nav 진입점 없음(의도된 은닉)" 한 줄을 추가한다.

---

## Task 3 — 뎁스 단축: 박스스코어를 경기 우산으로

현재 박스스코어는 `/boxscore/[date]` 만 있어 일정 카드에서만 닿는다(D4).

- **신규 라우트 `src/app/league/[orgSlug]/[leagueId]/boxscore/page.tsx`** 를 만든다.
  가장 최근 **완료된**(`is_complete=true`, `is_exhibition=false`) 경기 날짜를 찾아
  `/boxscore/<date>` 로 `redirect()` 한다. 경기가 하나도 없으면 빈 상태 안내를 렌더한다.
  - 서버 컴포넌트로 만들고, 비공개 리그 게이트(`isLeaguePrivateGated`)를 **맨 위에서**
    확인한다. 이 저장소에서 반복해서 난 누수 사고다 — 형제 `page.tsx` 들의 패턴을 그대로 따른다.
- `src/components/league/LeagueSubTabs.tsx` 의 `games` 그룹에 박스스코어를 추가한다:
  `일정(/schedule) · 박스스코어(/boxscore) · 경기 기록(/record)`
- 이렇게 하면 대회 트리(박스스코어가 서브탭 1급)와 구조가 같아진다.

**선수 하이라이트(D5)는 Task 4 의 "내 기록" 페이지가 해소한다** — 홈(D1) → 내 기록(D2) →
내 하이라이트(D3). 기존 QuickView 모달 안의 링크는 지름길로 그대로 둔다.

---

## Task 4 — "내 기록" 탭 신설 · 라커룸 하차 · 셸 재편

### 4-A. 신규 페이지 `/league/[orgSlug]/[leagueId]/me`
- 서버 `page.tsx` 는 비공개 리그 게이트만 확인하고 클라이언트 컴포넌트를 렌더한다.
- **비로그인**: 로그인 유도 카드(기존 `LoginTeaser` 재사용). 로그인 모달은
  `window.dispatchEvent(new CustomEvent('mm-open-login'))` 로 연다 (기존 배선 존재).
- **로그인**: `PersonalDashboard` 를 그대로 재사용한다. **컴포넌트를 새로 만들지 말 것** —
  이미 시즌 요약·스탯 카드·랭크·스트릭·마일스톤·하이라이트 CTA 를 전부 갖고 있다.
- 그 아래 **"바로가기" 섹션** 을 만든다 (SectionCard standalone, 44px 타깃):
  - 내 하이라이트 → `/highlights/player/<내 player_id>` ← **이것이 D5→D3 해소 지점**
  - 팀 명단 → `/roster`
  - 팀 구성 → `/teams`
  - 드래프트 → `/draft` (진행 중일 때만 · 기존 `showDraft` 판정 재사용)
  - 설정 → `/settings` (편집 모드일 때만)
- 그 아래 **계정 섹션**: 라이트/다크 전환 · 둘러보기 다시 실행 · 로그아웃.
  상단 바에서 내려오는 항목들이다.

### 4-B. `LeagueLayoutClient` 상단 바 정리
- **좌측(신규)**: 리그/팀 이름을 표시하고 홈으로 링크. 현재 모바일에서 "현재 페이지 제목"만
  나오던 자리를 대체한다. 데스크톱에서도 탭 바 왼쪽에 놓는다.
- **우측: 6개 → 2개.** 남기는 것은
  ① 로그인 버튼(미로그인 시에만) ② 편집/어드민 버튼.
  **내리는 것**: 유저 칩·아바타, 로그아웃, `PresenceIndicator`, 테마 토글, 둘러보기(HelpCircle).
  → 전부 `/me` 페이지로 이동. `PresenceIndicator` 는 `/me` 상단에 배치한다.
- 상단 탭 목록에서 **라커룸을 제거**하고 **내 기록**을 **맨 오른쪽**에 추가한다:
  `홈 · 경기 · 스탯 · 하이라이트 · 내 기록` (+ 드래프트/설정 조건부는 기존대로 유지)

### 4-C. `BottomNav` 재편 — 5탭 고정, 더보기 제거
- `홈 · 경기 · 스탯 · 하이라이트 · 내 기록` 5개. **더보기 버튼과 오버레이를 삭제**한다.
- 내 기록 탭 아이콘: 로그인 상태면 유저 사진(있으면), 없으면 lucide `User`.
  인스타그램의 프로필 탭과 같은 자리·같은 처리다.
- 활성 판정: 스탯 우산(`/stats`·`/awards`), 하이라이트 우산(`/highlights`),
  홈 우산(`/` 및 `/archive`), 경기 우산(`/schedule`·`/boxscore`·`/record`), 내 기록(`/me`).
  **라커룸(`/roster`·`/teams`)은 어느 탭도 활성이 되지 않으므로 홈 활성으로 처리**한다
  (탭이 하나도 안 켜지면 사용자가 자기 위치를 잃는다).
- 드래프트·설정은 하단에서 빠지고 `/me` 바로가기로만 닿는다.

### 4-D. 라커룸 진입점 보강
라커룸이 1급 탭에서 빠지므로 진입 경로가 `/me` 하나만 남으면 안 된다.
- 리그 홈(`/league/[orgSlug]/[leagueId]/page.tsx`)의 팀 승률 카드 헤더 우측에
  "팀 명단 →" 링크를 추가한다. (팀 승률 카드는 팀 이야기를 하는 자리라 문맥이 맞는다.)
- `/roster` · `/teams` 는 계속 `LeagueSubTabs group="squad"` 를 렌더하므로
  두 화면 사이 이동은 그대로 동작한다.

### 4-E. 문서
- `docs/onball-current-state.md` 에 "최근 결정" 추가: 라커룸 하차·내 기록 신설·상단 6→2.
- `DESIGN.md` 는 색·형태 문서이므로 건드리지 않는다(네비게이션은 그 문서의 관할이 아니다).

---

## 완료 기준
- `npx tsc --noEmit` · `npm run build` 통과
- `node scripts/verify-schema.mjs` · `node scripts/verify-scoring.mjs` exit 0
- 라커룸·드래프트·설정·공지·박스스코어·선수 하이라이트가 **모두 3뎁스 이내로 도달 가능**
- master 병합 + push (Vercel 자동 배포)
