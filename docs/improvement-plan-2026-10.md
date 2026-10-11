# 온볼 대시보드 전체 점검 · 개선 플랜 (2026-10-11)

코드 91,000줄 · 화면 53개 · API 132개 · 마이그레이션 113개를 세 갈래(죽은 코드 / 중복·비효율 / 레거시)로
조사한 결과다. 비개발자도 읽을 수 있게 "무엇이, 왜 문제이고, 고치면 무엇이 좋아지는지"로 적는다.
항목마다 **난이도**(쉬움·보통·어려움)와 **위험**(낮음·보통·높음)을 달았다. 위험은 "고치다가 다른 게 깨질 가능성"이다.

> 정정: 처음엔 `gsap`·`html-to-image`·`xlsx` 세 패키지가 안 쓰인다고 봤으나, 셋 다 "버튼을 누를 때만 불러오는"
> 방식으로 실제 사용 중이다. **패키지 쪽은 정리할 것이 없다.**

---

## 0. 한눈에 보기

| 등급 | 내용 | 건수 |
|---|---|---|
| 🔴 **지금 틀리고 있는 것** | 숫자가 빠지거나 어긋나는 실제 버그 | 4 |
| 🟠 **돈·한도를 새고 있는 것** | Vercel 무료 한도(CPU 4h/월) · Supabase 호출을 불필요하게 쓰는 곳 | 6 |
| 🟡 **지우면 되는 것** | 아무도 안 부르는 코드·화면·API·자산 | 12 |
| 🔵 **같은 일을 여러 벌로 하는 것** | 한 곳을 고치면 다른 곳이 조용히 어긋나는 중복 | 5 |
| ⚪ **운영진 결정이 필요한 것** | 기술이 아니라 운영 방침의 문제 | 5 |

---

## 1. 🔴 지금 틀리고 있는 것 (먼저 고친다)

### 1-1. 날짜별 박스스코어가 하루 이벤트를 1,000건까지만 읽는다
- 어디: `api/leagues/[leagueId]/daily-boxscore/route.ts:64`
- 왜 문제: Supabase 는 한 번에 최대 1,000행만 준다. 하루 9경기면 이벤트가 1,000건을 넘길 수 있다.
  넘치면 **에러 없이** 뒤쪽 경기 기록이 박스스코어·팀별 비교에서 빠진다. 10/10(9경기)이 첫 위험일이다.
- 같은 병: `quarters/[quarterId]/players/route.ts:68` (분기 명단 삭제 가드 — 넘치면 "뛴 선수"를 지울 수 있게 됨),
  `lib/social/weeklyData.ts:142`, `players/[playerId]/badges/route.ts:72` (`.limit(2000)` 은 1,000에서 잘린다).
- 고치면: 하루 경기 수와 무관하게 전부 집계된다. **쉬움 / 낮음** — 이미 있는 페이징 루프(`leagueStats.ts:147`)를 붙이면 된다.

### 1-2. 리더 배지가 저장된 점수(`points`)를 그대로 더한다
- 어디: `leader-badges/route.ts:113`, `leader-badges/dates/route.ts:101`, `lib/badges/traitData.ts:108`
- 왜 문제: CLAUDE.md 에 적혀 있듯 `league_game_events.points` 는 기록 시점 값으로 굳어서, +1 지정을 나중에 바꾸면
  옛 점수로 남는다. 다른 화면은 전부 `scorePoints()` 로 다시 계산하는데 이 세 곳만 옛 값을 쓴다 → 배지와 스탯 표의
  득점이 다를 수 있다.
- 고치면: 모든 화면이 같은 득점을 보여 준다. **쉬움 / 낮음**

### 1-3. 팀 인사이트가 분기 팀명을 무시한다
- 어디: `teams/[teamId]/insights/route.ts:103`
- 왜 문제: `league_teams.name` 을 직접 읽어서, 3분기 이후 상대 팀명이 옛 이름(락다운 등)으로 나온다.
  CLAUDE.md "`league_teams` 에서 이름을 직접 읽지 말 것" 위반. **쉬움 / 낮음**

### 1-4. 페이징에 정렬이 없어 줄이 빠지거나 겹칠 수 있다
- 어디: `attendance/route.ts:44`, `auth/dashboard/route.ts:113`
- 왜 문제: 1,000건씩 나눠 읽을 때 정렬 기준이 없으면 같은 줄이 두 번 오거나 한 줄이 빠질 수 있다. **쉬움 / 낮음**

---

## 2. 🟠 돈·한도를 새고 있는 것 (Vercel 무료 CPU 4h/월 · 10/5 에 이미 초과)

### 2-1. 작업 브랜치 push 가 master 와 똑같은 배포를 한 번 더 만든다
- 어디: `vercel.json` — `claude/**` 브랜치만 빌드 제외. 지금 작업 브랜치는 `ccr-…` 이라 걸리지 않는다.
- 실측: 10/10 하루에 작업 브랜치 push 5번 = 낭비 빌드 5번(10/5 에 잡았던 문제가 브랜치 이름이 바뀌며 되살아남).
- 고치면: 빌드 횟수 절반. **쉬움 / 낮음** — `"ccr-*": false` 한 줄.

### 2-2. 배지 cron 이 매일 "시즌 전체 경기"를 다시 계산한다
- 어디: `api/cron/badges-recompute` (매일 05:00 KST), `vercel.json`
- 왜 문제: 마감된 경기 전부(300경기 이상)를 하나씩 다시 센다. 경기는 토요일에만 있는데 매일 돌고, 경기가
  쌓일수록 무한히 늘어난다. 마감 시점에 이미 배지를 계산하므로 이 cron 은 "안전망"일 뿐이다.
- 고치면: 최근 14일 경기만 다시 세거나 주 1회(일요일)로 바꾸면 CPU 가 1/20 이하. **쉬움 / 낮음**

### 2-3. 선수 카드 한 번 열면 서버 요청 6개, 그중 2개는 리그 전체 이벤트를 훑는다
- 어디: `PlayerQuickViewModal.tsx:263-271` → `/players`(전체 명단), `/stats`, `/detail`(1,012줄·전체 이벤트 2회 스캔),
  `/quarters`, `/leader-badges`(전체 이벤트 스캔), `/career`. **전부 캐시 없음.**
- 덤: `/detail` 이 `evaluateAllBadges()` 로 배지를 계산해 내려보내는데 **화면이 그 값을 쓰지 않는다**(계산만 하고 버림).
- 고치면: 사용자가 가장 자주 누르는 동작의 서버 비용이 가장 크다. 캐시(60초)만 붙여도 큰 차이, 하나의 묶음 API 로
  합치면 더 좋다. **보통 / 보통**

### 2-4. 기록 중 이벤트 하나 저장할 때마다 서버 호출 3번 + 홈 캐시 전체 무효화
- 어디: `record/page.tsx:3349` (`handleEventSaved` + `fetchLiveScore` → `POST recompute`), `events/route.ts:105-108`,
  `recompute/route.ts:172`
- 왜 문제: 하루 9경기 × 경기당 100여 건 = 1,000번 가까운 저장마다 재계산과 캐시 무효화가 돈다. 토요일 오전에
  홈·스탯 캐시가 1초마다 비워진다.
- 고치면: 점수는 화면이 이미 가진 이벤트로 계산하고, 재계산·무효화는 마감 때 한 번. **보통 / 보통**

### 2-5. 드래프트 화면이 실시간 연결을 켜 둔 채 1.5초마다 또 묻는다
- 어디: `draft/[token]/DraftPortalClient.tsx:189`(1.5초) + Realtime(:198), `DraftChat.tsx:149`(2.5초) + Realtime(:156),
  `league/.../draft/page.tsx:184`(1.5초)
- 왜 문제: 실시간 연결이 이미 변화를 알려주는데 폴링도 같이 돈다. 탭 하나당 분당 40회. 드래프트 당일만의 문제지만 그날 집중된다.
- 고치면: 실시간이 살아 있으면 폴링을 10~15초로. **쉬움 / 낮음**

### 2-6. 「내 기록」이 열릴 때마다 리그 전체 스탯을 캐시 없이 다시 계산한다
- 어디: `auth/dashboard/route.ts:46` — `computeLeagueStats` + `computeStreaks` 를 매 요청. 같은 계산이 `stats` 라우트에는
  캐시돼 있다(키 `api-league-stats`). 자기 한 명을 보려고 전체를 돈다.
- 고치면: 캐시된 결과에서 "나"만 꺼내 쓰기. **쉬움 / 낮음**

---

## 3. 🟡 지우면 되는 것 (호출하는 곳이 0개)

| 종류 | 대상 | 비고 |
|---|---|---|
| 컴포넌트 | `components/league/LeagueStandings.tsx` (121줄) | 홈 순위표가 `NbaTeamStandings` 로 바뀐 뒤 남은 것 |
| 컴포넌트 | `components/league/LeagueSchedule.tsx` (189줄) | 일정 화면이 자체 구현으로 바뀜 |
| 컴포넌트 | `components/league/MilestonesBrowser.tsx` (416줄) | 마일스톤 페이지가 대체 |
| 컴포넌트 | `components/roster/BadgeMasterbook.tsx` + `components/badges/BadgeIcon.tsx` | 10/5 파란날개 뱃지 삭제 때 남음 |
| 컨텍스트 | `contexts/LeagueIdContext.tsx` | 소비자 0 |
| API | `api/leagues/[leagueId]/classics` | 명경기 페이지가 서버에서 직접 계산 |
| API | `api/leagues/[leagueId]/highlights` (GET 목록) | 하위 경로(`/[date]`, `/clips-by-events`)만 쓰임 |
| API + 컴포넌트 | `api/leagues/[leagueId]/rsvp` + `NextGameRsvp.tsx` | 참여신청 — 08-15 홈에서 내림. **되살릴지 결정 필요(⚪)** |
| 화면 | `(main)/[org]/[team]/roster/[id]/page.tsx` (416줄) | 아무 링크도 안 가리킴. 명단은 모달을 씀 |
| 화면 | 어드민 콘솔 「일정 자동 생성」 (`admin/.../[leagueId]/page.tsx:228`, `manage/page.tsx:305`) | **해롭다** — 「1경기가 늘 빅현욱vs락다운」 의 원인. 기록이 있으면 409 로 막히긴 함 |
| 자산 | `public/rec-src.png` (677KB), `public/push-banner.png` (187KB) | 어디서도 참조 안 함 |
| 함수 12개 | `calculateBadges`, `revokePasswordReset`, `birthDateToPassword`, `CLUTCH_CONFIG`, `isAboveBaseline`, `isSameTournamentName`, `isInGrace`, `graceRemaining`, `resolveFirstGame`, `isMailConfigured`, `positionMeta`, `TEAM_COLORS` | 호출 0 |
| 마이그레이션 17개 | `032_reset_date_*`, `036_diagnostic_*`(2), `037_simulate_*`, `038_diagnose_*`, `040_diagnose_*`, `042_convert_*`, `043_delete_*`, `044_diagnose_*`, `045_backfill_*`, `050_seed_*`, `056_*rename`, `064_check_*`, `079_backfill_*`, `102_fix_*`, `031`, `034` | 일회성 진단·데이터 보정. `_oneoff/` 로 옮기면 "실제 스키마"만 남는다. ⚠ `scripts/db-migrate.mjs` 순서 확인 후 |

전부 합치면 약 **2,000줄** 과 자산 860KB 가 빠진다. **쉬움 / 낮음** (삭제 전 `tsc` + 빌드로 확인).

문서 정정: `docs/onball-current-state.md` 61행의 "`lib/stats/badges.ts` 호출처 없음" 은 틀렸다 — `detail` 라우트가 아직
부른다(위 2-3). 어드민 「팀 만들기 아직 501」 도 이미 구현됨.

---

## 4. 🔵 같은 일을 여러 벌로 하는 것

"한 곳만 고치면 다른 곳이 조용히 어긋난다"는 이 프로젝트가 여러 번 겪은 병이다(`isPlusOneFor` 28벌, 득점 15벌).
이번에 새로 찾은 것:

| 무엇 | 벌 수 | 정본 | 고치는 법 |
|---|---|---|---|
| 이벤트 → 박스스코어 한 줄 누적 (`switch (e.type)`) | **10곳** (`detail`×2, `insights`, `stats/[gameId]`, `season-highs`, `awards`, `career`, `computeBadges`, `clutchStats`, `perDayStats`) | 10/10 에 만든 `lib/stats/boxLine.ts` | 한 곳씩 `applyEventToBoxLine()` 으로 교체. **보통 / 보통** |
| "이 선수는 어느 팀" 판정 | **9곳**, 순서가 제각각(어떤 곳은 분기 소속만, 어떤 곳은 이벤트 다수결만) | `daily-boxscore` 의 3단 판정 | `lib/stats/playerSide.ts` 로 빼서 공용. **보통 / 보통** |
| 분기별 팀명 해석 | **11곳**이 `league_teams.name` 직접 읽음 | `lib/stats/teamIdentity.ts` | 1-3 과 함께. **쉬움 / 낮음** |
| 리그 스탯 집계 자체 | `lib/leagueStats.ts` (드래프트용 옛 복사본) vs `lib/stats/leagueStats.ts` | 후자 | 전자 삭제 후 후자로 연결. **보통 / 보통** |
| 1,000건 페이징 루프 | 26곳 복붙 + `fetchPaged` 2벌 | — | `lib/supabase/paged.ts` 하나로. **쉬움 / 낮음** |
| 고급 스탯 계산(`calcAdv`/`calcShoot`) | 팀 탭·스탯 탭 2벌 | — | `lib/stats/advanced.ts`. **쉬움 / 낮음** |

번들: `recharts`(차트 라이브러리, 292KB)가 **3벌** 따로 실린다 — `PlayerDetailModal`, `PlayerQuickViewCharts`,
`PlayerCompareCharts` 가 각각 다른 덩어리로 묶여서다. 셋이 한 모듈에서 차트를 가져오게 하면 1벌. **보통 / 낮음**

클라이언트 중복 요청: `/quarters` 를 15개 파일 19곳에서 각자 부른다. 레이아웃이 이미 한 번 부르므로 페이지를 옮길 때마다
최소 2번. 레이아웃 컨텍스트로 내려주면 사라진다. **보통 / 낮음**

---

## 5. ⚪ 운영진 결정이 필요한 것

1. **편집 PIN 폐지 시점** — 리그 API 41개 + 어드민 드래프트 8개가 아직 PIN 을 받는다. CLAUDE.md 방침대로 가려면
   "모든 팀에 어드민 최소 1명" 이 먼저다. 파란날개(대회 전용)는 계정 체계가 없어 PIN 이 유일한 편집 수단 — 그쪽은
   `canEditTeam()` 설계가 선행돼야 한다(CLAUDE.md 에 4단계로 정리돼 있음).
2. **참여신청(RSVP) 되살릴 것인가** — 코드·API·DB 표(099·100)가 남아 있다. 안 쓰면 지우고, 쓰면 홈에 다시 올린다.
3. **어드민 콘솔 `manage` 페이지(660줄)** — 옛 `players` 표를 쓰는 선수 탭, 수동 점수 입력 탭이 리그 화면과 충돌한다.
   통째로 내려도 되는지.
4. **AI 두 종** — Claude(파란날개 MVP 선정만)·Gemini(AI 프로필 사진, 어드민 전용). 둘 다 라우트 하나씩. 유지할지.
5. **파란날개 트리와 리그 트리의 중복 UI** — 박스스코어·선수 상세·기록 화면·명단이 각각 2벌(총 7쌍). 의도된 분리지만
   유지비가 2배다. 파란날개를 리그 체계로 옮길 계획이 있는지에 따라 합칠지 결정.

---

## 6. 실행 순서 제안

| 단계 | 내용 | 예상 작업량 | 효과 |
|---|---|---|---|
| **1단계 (바로)** | 2-1 vercel.json · 2-2 배지 cron 범위 · 1-1 페이징 4곳 · 1-2 득점 3곳 · 1-3 팀명 · 1-4 정렬 | 반나절 | 틀린 숫자 수정 + CPU 즉시 절감 |
| **2단계** | 3 의 죽은 코드·화면·API·자산 삭제 + 문서 정정 + 마이그레이션 정리 | 반나절 | 2,000줄·860KB 감소, 이후 작업 속도 |
| **3단계** | 2-3 선수 카드 캐시/묶음 API · 2-6 내 기록 캐시 · 2-4 기록 중 재계산 디바운스 · 2-5 드래프트 폴링 | 1~2일 | 가장 비싼 사용자 동작들의 서버 비용 절감 |
| **4단계** | 4 의 중복 정리(누적 10곳 → boxLine, 팀 판정 9곳 → 공용, 팀명 11곳 → teamIdentity, 페이징 26곳 → 공용) | 2~3일 | 앞으로 "한 곳만 고쳐서 다른 곳이 어긋나는" 사고 예방 |
| **5단계** | recharts 1벌화 · `/quarters` 컨텍스트 · 큰 파일 분할(record 3,877줄 · DraftPortal 1,967줄 · teams 1,649줄) | 3~5일 | 번들·응답 속도, 유지보수 |
| **결정 후** | 5 의 ⚪ 항목 | — | — |

각 단계는 독립적이라 순서를 바꿔도 되고, 한 단계씩 배포하며 확인할 수 있다. 4·5단계는 화면이 바뀌지 않는
"내부 정리"라 겉으로는 티가 안 나지만, 이 프로젝트가 반복해서 당한 사고(한 곳만 고쳐서 숫자가 갈림)를 막는 일이다.

---

## 7. 조사 방법 (재현용)
- 죽은 코드: 모든 컴포넌트·lib 파일명을 `src/` 전체 import 문자열과 대조, API 경로를 `fetch` 문자열·`vercel.json`·`scripts/` 와 대조.
- 중복: `switch (e.type)` 패턴 · `league_teams.name` 직접 조회 · `.range()` 없는 `league_game_events` 조회를 전수 grep.
- 번들: `next build` 후 `.next/static/chunks` 100KB 이상 덩어리의 내용물 확인.
- 비용: `vercel.json` cron · `unstable_cache` 유무 · 라우트별 이벤트 전량 조회 여부.
