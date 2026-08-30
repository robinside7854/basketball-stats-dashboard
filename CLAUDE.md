# basketball-stats-dashboard

> **⚠ 세션을 새로 시작했다면 `docs/onball-current-state.md` 를 먼저 읽을 것.**
> 지금 구조·역할·진행 중인 일·다음 할 일·이미 당한 함정이 거기 정리돼 있다.
> 작업을 마칠 때마다 그 문서의 "다음에 할 일"과 "최근 결정"을 갱신한다.


농구 통계 대시보드 — 멀티테넌트 + 리그 시스템 포함.

## Stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript
- **DB / Auth**: Supabase (PostgreSQL, RLS, Service Role)
- **AI**: Anthropic SDK (`claude-sonnet-4-6`) — MVP / X-Factor 자동 선정
- **UI**: Tailwind 4 + shadcn/ui 패턴 + lucide-react + sonner (toast)
- **State**: Zustand
- **Charts**: recharts
- **Admin Auth**: NextAuth v5 beta
- **Deploy**: Vercel (master push → 자동 배포)
- **GitHub**: https://github.com/robinside7854/basketball-stats-dashboard.git

## Commands

```bash
npm run dev              # 개발 서버 (port 3000)
npm run build            # 프로덕션 빌드
npm run lint             # ESLint
npx tsc --noEmit         # 타입 체크 (테스트 없으므로 필수 안전망)
```

## Workflow 규칙

- **모든 코드 변경 후 `npx tsc --noEmit` 통과 확인** (CI 없음 — 로컬이 마지막 게이트)
- **수정 후 자동 `git commit + push`** (master 브랜치) → Vercel 자동 배포
- ⚠ **프론트엔드 작업은 "배포 완료"까지가 1건의 작업이다**
  - 작업 브랜치에서 개발했더라도 **반드시 master 에 병합 + push 해서 Vercel 배포까지 끝낼 것**
  - 브랜치에 커밋만 하고 끝내면 미완료 — 사용자가 따로 배포를 요청하게 만들지 말 것
  - 순서: `tsc --noEmit` 통과 → 커밋 → master rebase/병합 → `git push origin master`
- **Supabase 마이그레이션**: `supabase/migrations/NNN_*.sql` 파일로 작성
  - Supabase MCP가 설치되어 있으면 클로드가 직접 실행 가능 (단, 아래 가드레일 준수)
  - MCP가 없거나 실패 시 사용자가 SQL Editor에서 수동 실행 (채팅에 SQL 붙여넣기 금지 — 파일 경로만 안내)
- **`.env.local` 직접 편집 금지** (PreToolUse hook으로 차단됨 — 사용자가 직접 수정)

## Supabase MCP 사용 규칙 ⚠

- **이 프로젝트의 Supabase project_ref**: `.env.local`의 `NEXT_PUBLIC_SUPABASE_URL` 에서 추출 (`https://<REF>.supabase.co`)
- Supabase MCP는 unscoped 등록 상태 → **여러 프로젝트에 접근 가능**
- **Write SQL 실행 전 필수**:
  1. 작업 대상 `project_ref`를 명시적으로 출력
  2. 실행할 SQL 전문을 사용자에게 보여주기
  3. 사용자 명시적 확인 후 실행 (자동 진행 금지)
- **위험 키워드**(`DROP`, `TRUNCATE`, `DELETE FROM` without WHERE, `ALTER TABLE ... DROP`) 포함 시:
  - 추가 확인 단계 1번 더 거치기
  - 백업 권장 안내
- **읽기 작업**(SELECT, list_tables, list_projects)은 가드레일 면제 — 자유롭게 사용
- 마이그레이션 파일은 `supabase/migrations/NNN_*.sql`에 먼저 저장 → 사용자 확인 후 MCP로 실행 → 실패 시 SQL Editor 수동 fallback

## Architecture

### URL 구조
- 메인: `/[org]/[team]/...` — 예: `/paranalgae/youth`, `/paranalgae/senior`
- 리그: `/league/[orgSlug]/[leagueId]/...` — record / schedule / stats / roster / teams / settings
- 구 URL `/youth`, `/senior` → `src/middleware.ts` 301 리다이렉트

### 멀티테넌트 모델
- `teams` 테이블: 복합키 `org_slug + sub_slug` (예: paranalgae/youth, paranalgae/senior)
- `players.team_type` (youth / senior) — **절대 삭제 금지** (youth 35명, senior 32명)
- `teams.edit_pin TEXT NOT NULL` — 게임 기록 PIN을 DB 기반으로 저장 (env 아님)

### 역할 정의 (2026-08-06 확정) ⚠

용어가 두 층에서 겹치므로 반드시 구분한다.

| 역할 | 누구 | 어디서 | 인증 |
|------|------|--------|------|
| **CEO** | 이 플랫폼(온볼)의 제작자·운영자 = 사용자 본인 | `/admin/*` (플랫폼 콘솔) | NextAuth (`src/lib/auth.ts`) |
| **어드민** | **각 팀의 운영진** (동호회 총무 등) | 자기 팀 화면의 편집 모드 · `/league/.../settings` | `league_user_accounts.role='admin'` 또는 팀 PIN |

- `/admin` 은 **CEO 전용**이다. 동호회 운영진이 들어올 자리가 아니다 — 화면 문구도 그렇게 읽히게 둔다.
- 코드의 `league_user_accounts.role='admin'` 은 **팀 어드민**을 뜻한다. CEO 권한이 아니다.
- 새 화면·문구를 쓸 때 "관리자"라고만 쓰지 말 것. 어느 쪽인지 드러나게 쓴다.

### 리그 편집 권한 (2026-08-04 전환)
- **`canEditLeague(req, leagueId)`** (`src/lib/auth/leagueAdmin.ts`) — 모든 리그 mutation API의 필수 가드
  - `league_user_accounts.role='admin'` 회원 세션(쿠키 `mm_auth`) **또는** 리그 PIN
  - PIN은 **전환기 폴백** — 어드민 지정이 자리잡으면 제거 예정 (`verifyLeaguePin`은 내부 전용으로 격하)
- ⚠ **role은 세션 토큰에 넣지 않는다** — 쿠키가 30일 만료라 권한 회수가 지연됨.
  매 요청 DB 재조회 (`guard.ts`가 status를 재확인하는 것과 동일 철학) → 강등 즉시 반영
- 어드민 지정: 어드민 대시보드 `/admin/leagues/[leagueId]` → "어드민 권한 관리",
  또는 리그 `/settings` → 회원 승인 패널
- 프론트: `useLeagueEditMode()`의 `isEditMode`(= 어드민 role ∥ PIN) / `isAdminSession`(어드민 role만)
  - `LeagueAuthProvider`가 `LeagueEditModeProvider`보다 **바깥**이어야 함 (role을 읽어야 하므로)

### PIN 폐지 방향 (2026-08-10 확정) ⚠

**편집 PIN은 폐지한다. 모든 운영은 어드민 권한으로 한다.** 새 기능에 PIN 가드를 추가하지 말 것 —
어드민 role 가드를 쓰고, PIN이 필요하면 기존 폴백에 얹지 말고 별도로 상의한다.

이미 끊어낸 것(2026-08-10): PIN으로는 **어드민 지정·비밀번호 초기화·어드민 계정 변경**을 할 수 없다.
PIN은 단톡방을 떠도는 4자리 공유 비밀이라, 그걸로 **영구 권한**을 만들면 되돌릴 수 없다.
`isIdentifiedAdmin()`(어드민 세션 ∥ CEO)이 그 경계다. 일반 회원 승인·반려는 아직 PIN으로도 가능 —
어드민이 없는 동호회의 온보딩 경로를 막지 않기 위해서다.

**폐지 선결 조건**: 모든 팀에 어드민이 최소 1명(권장 2명). 지금 막혀 있는 곳 → 아래.

### ⚠ 대회(팀) 전용 팀에는 계정 체계가 없다

`league_user_accounts`는 `league_id`·`league_player_id`가 **NOT NULL**이고 `league_players`(리그 명단)를
참조한다. 그런데 대회 전용 팀은 리그가 0개이고 명단이 `players`(팀 명단)에 있다.

⇒ **파란날개 청년부/장년부는 계정을 만들 수 없고, 따라서 어드민도 지정할 수 없다.** 편집 수단이
편집 PIN 하나뿐이다. 대회 쪽 화면에는 회원 로그인 UI 자체가 없다(PIN 모달만 있음).

여기에 어드민을 도입하려면 네 가지가 같이 필요하다:
1. 계정이 `players`(팀 명단)도 참조할 수 있게 — `league_player_id` NOT NULL 완화 + 팀 명단 FK
2. 팀 스코프 가입·로그인 라우트 (`/api/leagues/[leagueId]/auth/*` 는 리그 전용)
3. 대회 화면의 로그인 UI
4. `canEditTeam()` — `canEditLeague`의 팀판. `verifyTeamPinForTeam`을 폴백으로 격하

### 사진 업로드는 무인증 개방 (2026-08-10 결정)

`/api/players/upload-photo`는 **의도적으로 누구나** 업로드할 수 있게 둔다. 보안 점검에서 제기했으나
사용자가 개방을 선택했다. 인증을 추가하지 말 것.
(별개 축인 파일 형식·용량 검증은 아직 없음 — 필요해지면 그때 상의한다.)

### 리그 시스템 핵심 테이블
- `league_games`: `is_started`, `is_complete`, `is_exhibition`, `quarter_id`, `home/away_team_id`, `slot_num`, `round_num`
  - UNIQUE INDEX `league_games_slot_unique` ON (league_id, date, slot_num) WHERE slot_num IS NOT NULL
- `league_game_events`: `league_game_id`, `league_player_id`, **`team_id`** (이벤트 발생 시 선수 소속 팀), `type`, `result`, `points`, `related_player_id` (어시스트·STL-TOV 페어), `video_timestamp`
- `league_player_quarters`: 분기별 정규 소속 (team_id)
- `league_game_players`: **이 경기 한정 배정** (비정규/타팀 임시 출전) — `quarters`보다 **우선** 적용
- `league_teams`: 팀명 + 색상 + `is_external`(대회 상대팀) + `exhibition_date`(친선 임시팀, 109)

### 친선전 (`is_exhibition = true`)

- **집계에서 전량 제외** — 리그 순위·개인 스탯·배지·마일스톤 전부. 박스스코어·하이라이트에는 남는다.
  제외 지점(2026-08-24 기준 15곳): 시즌스탯 · 스트릭 · 마일스톤 · 배지(2) · 클러치 · 어워즈 ·
  시즌최고 · 명경기 · 주간카드 · 팀인사이트 · 홈 최근결과 · **개인상세** · **perDayStats** ·
  **드래프트 점수(`lib/leagueStats.ts`)**. 뒤 세 곳은 8/24 에 누락이 발견돼 추가됐다 —
  친선 경기가 1~2건이던 시절엔 증상이 없다가, 10경기짜리 친선일이 생기자 드러났다.
  (예전 이 문서에 "개인 스탯 포함"이라 적혀 있었으나 코드와 어긋난 서술이었다)
- **지정 경로**: 기록 화면(`/league/.../record`)에서 날짜 → 슬롯 선택 → "친선전으로 표시" 토글.
  ~~`/api/leagues/[leagueId]/exhibition/init`~~ 과 스케줄 페이지의 "친선전 추가" 버튼은 **더 이상 없다.**
- **명단은 스팟 구성** — 분기 소속(`league_player_quarters`)을 아예 보지 않고, 이 경기에서 직접 배정한
  것(`league_game_players`)만 명단으로 친다. 같은 날짜 비정규 상속도 끈다.
- **팀도 스팟 구성 (2026-08-22, 마이그레이션 109)** — 친선전 팀은 상시 3팀이 아니라
  `league_teams.exhibition_date` 가 그 날짜인 **임시팀**에서 고른다.
  - `exhibition_date IS NULL` = 상시팀 / 값이 있으면 그 날짜 친선전 전용
  - 임시팀은 **팀 목록 API 기본 응답에서 빠진다** — `GET /teams` 는 상시팀만,
    `GET /teams?exhibitionDate=YYYY-MM-DD` 가 그 날짜 임시팀만 준다.
  - ⚠ **`league_teams` 를 직접 열거하는 새 코드에는 `.is('exhibition_date', null)` 를 붙일 것.**
    안 붙이면 순위표·명단·드래프트·일정 편성에 "8/23 흰팀" 같은 유령 팀이 등장한다.
    (id → 이름 매핑용 조회는 반대로 **붙이면 안 된다** — 박스스코어에서 임시팀 이름이 사라진다)
  - 서버 불변식(`games` PATCH): 임시팀은 ① 친선 경기에만 ② 자기 날짜 경기에만 붙는다.
    임시팀이 배정된 경기는 정규전으로 되돌릴 수 없다(409).

### 경기 슬롯 (`league_games.slot_num`)

- 날짜를 열면 `POST /games {date}` 가 `leagues.games_per_round`(기본 9) 만큼 슬롯을 만든다.
  **친선 슬롯이 하나라도 있으면 이 일괄 생성은 돌지 않는다.**
- **한 칸만 추가**: `POST /games { date, addSlot: true }` → `max(slot_num)+1`. 기록 화면 그리드 끝의
  점선 `+ 추가` 타일. `games_per_round` 는 시즌 설정이라 그걸 바꾸면 **모든 날짜가 같이 늘어난다** —
  특정 날짜만 늘릴 때는 반드시 이 경로를 쓴다. 하루 상한 30칸.
- ⚠ **새 슬롯은 그 날짜의 `is_exhibition` 을 상속한다.** 친선 날짜에 정규전 슬롯이 끼면 거기 기록한 게
  순위·개인 스탯에 섞인다. `league_games.is_exhibition` 은 DB 기본값이 false 라, 슬롯을 만드는 코드가
  이 값을 안 넘기면 조용히 정규전이 된다(2026-08-22 에 실제로 발생).
- **삭제**: `DELETE /games?gameId=` — 이벤트가 하나라도 있으면 409. 삭제는 `league_game_events` 로
  캐스케이드되고 리그 스탯은 그 이벤트 재집계로만 만들어지므로, 지우면 기록이 영구 소멸한다.
- **번호는 다시 매기지 않는다.** 중간 슬롯을 지워 번호가 비어도 그대로 둔다.
- 슬롯 = 경기가 기본이지만 **쿼터 단위로 쓰기도 한다** — 8/22 친선전은 영상이 쿼터별로 쪼개져 있어
  슬롯 하나에 쿼터 하나를 넣었다(슬롯 10개). 슬롯 개수로 경기 수를 추정하지 말 것.

### 기록된 경기의 팀 교체

- 기록 전 팀 저장은 `PATCH /games`. **기록이 시작·마감된 경기는 `POST /games/[gameId]/reassign-teams`.**
- ⚠ 경기의 `home_team_id`/`away_team_id` 만 바꾸면 `league_game_events.team_id` 가 이 경기와 무관한
  팀을 가리켜 **그 선수들이 박스스코어에서 통째로 사라진다.** 팀 교체는 반드시
  `league_game_events` + `league_game_players` 의 `team_id` 이관과 한 묶음이어야 한다.
- ⚠ 이관 대상 id 는 **UPDATE 전에** 모은다. 좌우 스왑이면 순차 UPDATE 가 서로를 덮어쓴다.
- 순수 좌우 스왑이면 저장된 스코어도 함께 뒤집는다.

### 자유투는 한 날짜 안에서도 룰이 갈릴 수 있다

`leagues.rules` 는 **시즌 단위**라 경기·쿼터별 자유투 룰 차이는 **이벤트 타입으로만** 표현된다.

| 타입 | 점수 | 뜻 |
|---|---|---|
| `free_throw` | 1 | 정식 1구 1점 |
| `ft_2pt` | 2 | 2점슛 파울 → 1구 2점 (국내 동호회 자체전 관행) |
| `ft_3pt_1` + `ft_3pt_2` | 2 + 1 | 3점슛 파울 |
| `and_one` | 1 | 앤드원 |

⚠ **한 날짜에 `free_throw` 와 `ft_2pt` 가 섞여 있어도 버그가 아니다.** 2026-08-22 친선전에서
대회 연습 목적으로 **같은 경기의 1~2쿼터는 1구 1점, 3~4쿼터는 시즌 룰**로 진행했다.
"룰이 혼용됐다"고 판단해 일괄 교정하지 말 것 — 반드시 운영진에게 의도를 먼저 확인한다.

### 플러스원 (+1) 판정 — 정본은 `scoring.ts` 의 `isPlusOneFor()` 하나뿐

1. `league_games.plus_one_extra_ids` 에 있으면 +1 — **이 경기 한정 추가**(110). *더해지는* 집합.
2. `league_games.plus_one_player_id` 가 있으면 **그 한 명만** +1 (충돌 해소용 **배타** 지정).
3. 아무것도 없으면 `league_players.plus_one` (전역 플래그).

- ⚠ **판정식을 다시 쓰지 말 것.** 2026-08-23 이전에는 이 삼단논법이 **28곳에 복붙**돼 있었다
  (득점 계산이 15곳에 흩어져 `scoring.ts` 를 만든 것과 같은 병). 하나만 빠뜨려도 화면마다 점수가
  갈리는데 숫자가 그럴듯해서 아무도 눈치채지 못한다. `isPlusOneFor(playerId, game, globalSet)` 만 쓴다.
- ⚠ **선수 전역 플래그를 켜면 과거 마감 경기까지 소급된다** — 미라클은 `plus_one_bonus.amount=1`
  이라 그 선수의 과거 야투마다 점수가 올라가 순위·기록이 통째로 바뀐다.
  "이번 경기만" 은 **반드시 1 번(경기 한정 추가)** 으로 한다.
- ⚠ 2 번은 **배타**다. 한 팀에 +1 이 둘이라 하나를 고른 경기에서는, 고르지 않은 쪽이 전역 플래그가
  켜져 있어도 +1 이 아니다. "추가" 는 1 번으로만.
- `league_games` 를 새로 select 하는 집계 코드는 **`plus_one_extra_ids` 도 함께 읽어야 한다**.
  빠뜨리면 그 화면만 조용히 옛 판정으로 돌아간다.
- ⚠ **`league_game_events.points` 는 기록 시점 값으로 굳는다.** +1 지정을 나중에 바꾸면 그 이전
  이벤트의 저장값만 옛 점수로 남는다 — 화면은 `scorePoints()` 재계산이라 맞고 **저장값만 조용히
  어긋난다.** `POST /games/[gameId]/recompute` 가 어긋난 이벤트를 함께 재동기화한다(2026-08-24).
- 회귀 검증: `node scripts/verify-scoring.mjs` — 순수 함수 + **미라클 성공 이벤트 전량 대조**
  (2026-08-04 이전 총득점 7114 불변). 판정 규칙을 바꾸면 이 스크립트의 SQL 도 같이 고친다.

### 박스스코어의 "이 선수는 어느 팀" 판정 (`daily-boxscore`)

후보를 모아 **이 경기의 두 팀 중 하나**를 먼저 고른다. 순서대로 첫 값을 그냥 쓰면 안 된다.

1. `league_game_players` (이 경기 한정 배정)
2. **`league_game_events.team_id`** (기록에 남은 팀 — 가장 확실한 근거)
3. `league_player_quarters` (분기 소속 · 정규전 폴백)

- ⚠ **분기 소속을 검증 없이 쓰면 이 경기와 무관한 팀이 박힌다.** 친선전은 명단 상속이 응답 전용이라
  `league_game_players` 행이 없는 슬롯이 많은데, 그 선수들이 분기 소속(락다운/굿모닝 등)으로 떨어지면
  홈도 어웨이도 아닌 팀이 되어 **박스스코어·팀 비교에서 통째로 사라진다.**
  2026-08-23 에 실제로 발생 — 팀 비교 차트가 한쪽만 그려졌고, 스코어는 멀쩡해서 원인이 안 보였다.
  (스코어는 `league_games.home_score/away_score` 라 이벤트 `team_id` 로 계산되어 정상이었다)
- 기록원은 이벤트마다 팀을 함께 저장한다 — 배정 행이 없어도 **2 번으로 항상 판정할 수 있다.**

### 대진 롤업 (`daily-boxscore`)

- 슬롯을 **쿼터 단위**로 쓴 날은 화면상 경기 수·승패·`gp` 가 전부 쿼터 수가 된다. 그래서
  `daily-boxscore` 가 **같은 대진(팀 조합) + `slot_num` 연속**인 슬롯을 한 경기로 묶어서 준다.
- 응답: `games`(롤업 결과 = 경기) · `slots`(원본) · `rolled_up` · 각 경기의 `slot_nums`/`slot_ids`/`videos[]`.
  **`daily_stats.gp` 는 슬롯 수가 아니라 경기 수**다.
- ⚠ **"연속" 조건을 풀지 말 것.** 정규전은 승자 잔류 로테이션이라 같은 대진이 하루에 여러 번 나온다.
  2연속 뛴 팀은 강제 휴식이라 같은 대진이 *연속*될 수는 없어서, 이 조건 아래 정규전은 한 칸도 안 묶인다.
- ⚠ **목록 이웃 ≠ 슬롯 이웃.** 이 API 는 `is_started=true` 만 담으므로 중간 슬롯이 미기록이면
  3경기와 5경기가 목록상 붙는다. 반드시 `slot_num` 이 +1 인지로 판정한다.
- 홈/어웨이가 슬롯마다 뒤집혀 있어도 묶되, 점수·쿼터표는 **첫 슬롯의 좌우 기준**으로 되돌려 합산한다.
- 화면 토글(`경기별 / 슬롯별`)은 **카드 목록만** 바꾼다. 승패표·팀비교·공유이미지·daily_stats 는
  경기 단위 고정 — 같이 뒤집으면 서로 어긋난 화면이 된다.

### YouTube 영상 연동

- **자동 매핑** `syncYoutubeForLeague.ts` — 제목의 `경기 N` 을 읽어 그 날짜 슬롯에 꽂는다.
  수동 실행(`POST /youtube-sync`) · 주간 cron · 경기 시작 시 백그라운드 훅이 모두 이 함수를 쓴다.
- ⚠ **YouTube API 는 한글 제목을 NFD(자모 분리형)로 돌려준다.** `쿼터` 가 U+110F U+116F U+1110 U+1165
  라서 소스에 적은 완성형 `쿼터`(U+CFFC U+D130)와 **문자열 비교가 절대 성립하지 않는다.**
  제목을 만지는 코드는 반드시 **`.normalize('NFC')` 를 먼저** 한다. 정규식이 맞아도 조용히 안 걸리므로
  로그만 봐서는 원인이 안 드러난다(2026-08-23 에 실제로 당함).
- **숫자 폴백 금지 구간**: 제목에 쿼터 표기(`N쿼터`/`NQ`/`quarter`)가 있으면 "첫 한두 자리 숫자 = 경기
  번호" 폴백을 쓰지 않는다. 쿼터 번호가 경기 번호로 읽혀 **엉뚱한 슬롯에 붙는다.**
- **슬롯 신규 생성 금지**: 그 날짜에 슬롯이 하나라도 있으면 영상 때문에 슬롯을 새로 만들지 않는다.
  insert 경로는 `is_exhibition` 을 안 넘겨 기본값 false 로 들어간다 — 친선 날짜에 정규전 슬롯이
  하나 생기고, 거기 기록하면 순위·개인 스탯에 섞인다.
- **수동 연동** (기록 화면) — URL 직접 입력 + "목록에서 고르기".
  후자는 `GET /api/leagues/[leagueId]/youtube-videos?date=YYYY-MM-DD` 로 그 날짜 채널 영상을
  **번호 추측 없이 제목 그대로** 받아 고르게 한다. 제목 규칙이 깨진 날의 유일한 수단이다.
  ⚠ 이 라우트가 `canEditLeague` 게이트인 이유는 권한이 아니라 **쿼터(quota)** 다 —
  search.list 는 호출당 100유닛이라 열람자에게 열면 하루 한도가 조회로 소진된다.
- **리그는 한 슬롯 = 영상 1개.** 쿼터별로 쪼갠 영상은 대표 하나만 저장되고, 기록 중에는 입력칸으로 갈아끼운다.

### 쿼터별 영상 (마이그레이션 111) — 대회에서 쓴다

`league_game_videos(league_game_id, quarter, youtube_url, start_offset)`. 경기는 **1행 그대로**
두고 영상만 쿼터로 쪼갠다.

- **판정 정본은 `src/lib/youtube/gameVideo.ts` 하나뿐이다** — `resolveGameVideo(경기, 쿼터)` =
  그 쿼터 영상이 있으면 그것, 없으면 `league_games.youtube_url`. 클립·핀클립·마일스톤·
  박스스코어가 전부 이걸 쓴다. ⚠ **판정식을 다시 쓰지 말 것** — 한 곳을 빠뜨리면 그 화면 클립만
  조용히 1쿼터 영상의 엉뚱한 지점을 가리킨다(`isPlusOneFor()` 를 만든 것과 같은 병).
- ⚠ **`league_games.youtube_url` 을 비우지 말 것.** 하이라이트 로더 여러 곳이
  `.not('youtube_url','is',null)` 로 "영상 있는 경기"를 고른다 — 비우면 그 경기가 화면에서
  통째로 사라지고 **데이터가 지워진 것처럼 보인다.** 저장·삭제할 때마다 **가장 이른 쿼터
  영상**으로 다시 맞춘다(`videos` 라우트의 `syncRepresentative`).
- 이벤트에 `quarter` 가 없으면(옛 기록) 대표로 폴백한다 — 쿼터 영상이 0건인 리그 경기는
  이 표가 생기기 전과 100% 같게 동작한다.
- ⚠ 슬롯을 쿼터로 쓰는 우회(8/22 친선전)를 **대회에 쓰지 말 것.** 대회 보드의 전적 판정이
  경기 *행* 을 세므로 4쿼터짜리 2경기가 "4승 4패"로 읽힌다.

### 대회 모드 (`leagues.mode='tournament'`)

한 팀이 리그 묶음과 대회 묶음을 둘 다 갖는다(미라클: `2026` / `2026-tournament`).

- **대회 한 개 = `league_quarters`(kind='tournament') 행 하나.** 새 표를 만들지 않는다(076·083).
  `POST /quarters { kind:'tournament', name, start_date, end_date }` — **`year`/`quarter`/`ord` 는
  서버가 채번한다.** 그 숫자는 UNIQUE 제약을 피하려는 것일 뿐 대회에서는 의미가 없다(084).
- **경기는 `POST /games { mode:'tournament', quarter_id, date, opponent_name, round_label, venue,
  we_are_away }`.** 상대(외부)팀을 **이름으로 찾아 재사용**한다 — 매번 새로 만들면 그 상대와의
  전적이 이름만 같은 여러 팀으로 흩어진다. 경기 날짜를 `league_schedule_dates` 에도 넣는다
  (기록 화면 날짜 목록이 그 표에서 온다 — 안 넣으면 등록해도 기록할 날짜가 안 뜬다).
- ⚠ `round_label` 은 **`조별예선·16강·8강·4강·준결승·결승` 만** 받는다. 대회 보드의 성적 판정
  (`ROUND_ORDER`)이 아는 값이라야 우승·N강 탈락이 표시된다.
- ⚠ **`is_external` 플래그 하나가 통계·어워즈·명단 노출 전체를 가른다.** 우리 팀이 실수로 true 면
  우리 기록이 통계에서 사라지고, 상대가 false 면 상대 선수가 우리 명단에 섞인다.
  `verify-schema.mjs` 가 "외부 팀은 대회 묶음에만 존재한다"로 이 선을 지킨다.
- **「경기」 탭이 묶음 성격으로 갈린다** (`schedule/page.tsx` 의 `GamesTab`):
  리그면 `ScheduleContent`(날짜 목록), 대회면 `TournamentSchedule`(**대회 아코디언 → 경기 목록**).
  후자의 화면 구조는 파란날개 대회 관리를 따랐다 — 사용자가 그 화면에 익숙하다.
- **대회 경기 수정**: `PATCH /games?gameId=` + `mode:'tournament'`.
  ⚠ **기록이 시작된 경기는 라운드·장소만** 고칠 수 있다. 상대·좌우를 바꾸면
  `league_game_events.team_id` 가 무관한 팀을 가리켜 그 선수들이 박스스코어에서 사라진다 —
  그 이관은 `POST /games/[gameId]/reassign-teams` 가 한다.
- ⚠ **기록 화면은 대회에서 빈 슬롯을 만들지 않는다.** 리그의 `selectDate` 는 날짜를 열 때
  `POST /games {date}` 로 `games_per_round` 만큼 슬롯을 까는데, 대회에서 그렇게 생긴 슬롯은
  대회·상대팀에 안 묶인 **미아 경기**가 된다. 대회는 `GET /games?date=` 로 있는 것만 읽는다.
- **대회에서 돌지 않는 것** — 전부 리그 전용 규칙이라 대회에 적용하면 조용히 틀린다:
  - YouTube **자동 매핑**(`syncYoutubeForLeague` 입구에서 차단). 제목의 `경기 N` 을 그날 slot_num
    N 에 꽂는 방식인데 대회는 슬롯 번호에 의미가 없다. **차단은 그 함수 한 곳에서 한다** —
    수동 버튼·주간 cron·경기시작 훅이 전부 여길 지나므로, 화면에서만 감추면 되살아난다.
  - **주간 일정 자동생성**(`schedule-dates/sync`). 대회는 주최측이 정한 날에만 열린다.
    ⚠ 서버만 막으면 안 된다 — 2026-08-30 에 서버만 막고 화면을 안 고쳐서, 대회 「경기」 탭에
    자동 생성된 토요일 43개와 **눌러도 400 만 나는 버튼**이 그대로 남아 있었다.
  - 화면: 슬롯 추가 · 친선전 토글 · 대진 자동편성 · 대표 영상 제거.
- **선수는 팀 단위로 공유된다**(`league_players.team_id`) — 미라클 명단이 대회에서도 후보로 뜬다.
  참가 등록은 대회 카드의 `참가 등록`(= `league_player_quarters`).
  ⚠ **기록·스탯은 `league_id` 로 완전히 갈린다** — 집계가 전부 경기를 league_id 로 먼저 거르므로
  대회 기록이 리그 순위·배지에 섞이지 않는다. 공유되는 건 이름·사진뿐이다.

### AI 기능
- `src/app/api/ai/mvp/route.ts` — DB 영구 저장 `games.ai_mvp jsonb`
- MVP 공식: `pts × 1.5 + 효율득점보너스 - 비효율페널티`
- X-FACTOR: 허슬 스탯 중심 (rebs, steals, blocks, charges)

## Critical 규칙

- ⚠ **미라클 리그는 분기마다 팀 구성이 바뀐다.** 같은 `team_id` 라도 분기가 다르면 다른 팀이다.
  2026 시즌: 1·2분기 `락다운`·`런앤건`·`빅현욱` / 3분기 `굿모닝`·`챗지피지기`·`빅현욱`.
  경기·기록에 팀명을 붙일 때는 **반드시 `(team_id, quarter_id)` 로 푼다** —
  정본은 `src/lib/stats/teamIdentity.ts` 의 `loadIdentityResolver()`.
  **`league_teams` 에서 이름을 직접 읽지 말 것.** 과거 경기에 현재 팀명이 붙어 있지도 않았던
  대진이 기록으로 남는다. override 를 직접 조회해 다시 구현하는 것도 금지(화면마다 갈라진다).
  (2026-08-14 명경기에서 실제로 당함)
  - ⚠ **`league_team_quarter_overrides` 행 수를 팀 수와 비교해 누락을 판정하지 말 것.**
    override 는 **이름이 바뀐 팀에만** 생긴다. `빅현욱` 처럼 세 분기 내내 같은 이름인 팀은
    행이 없는 게 정상이다(분기당 2행이 맞다). 한 번 이걸 데이터 누락으로 오판한 적 있다.

- ⚠ **선수 데이터 절대 삭제 금지** (youth 35명 + senior 32명 보존)
- ⚠ **`league_game_events`는 `team_id` 컬럼 반드시 저장** (이벤트 POST에서 `team_id: body.team_id ?? null`)
- ⚠ **비정규 출전 팀 매칭 우선순위**: `league_game_players` → `league_player_quarters` (역순 절대 금지)
- ⚠ **타임스탬프 기반 STL-TOV 매칭**: 2초 윈도우 (`STL_TOV_WINDOW = 2`)

## 자동화 설정 (.claude/)

- `settings.json` — PreToolUse(.env 보호) + PostToolUse(tsc 자동 점검) hooks
- `agents/security-reviewer.md` — PIN 인증·RLS·암호화 코드 점검 subagent
- `skills/ui-ux-pro-max/` — UI/UX 디자인 인텔리전스

## 메모리 참조

사용자 글로벌 메모리: `C:\Users\N_399\.claude\projects\c--Users-N-399-Desktop-ai-rob\memory\MEMORY.md`
- 프로젝트 상세: `project_basketball_stats_dashboard.md`
