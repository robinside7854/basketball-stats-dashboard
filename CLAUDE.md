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
- `league_teams`: 팀명 + 색상

### 친선 4쿼터·2경기 모드
- `is_exhibition = true` 게임은 **리그 순위(standings) 제외, 개인 스탯 포함**
- 미라클 vs 모닝 2팀 자동 생성 + 8개 슬롯 (`/api/leagues/[leagueId]/exhibition/init`)
- 스케줄 페이지 "친선전 추가" 버튼

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
