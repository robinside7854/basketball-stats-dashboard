# basketball-stats-dashboard

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
- **Supabase 마이그레이션**: `supabase/migrations/NNN_*.sql` 파일로 작성, **사용자가 Supabase SQL Editor에서 수동 실행** (채팅에 SQL 붙여넣기 금지 — 파일 경로만 안내)
- **`.env.local` 직접 편집 금지** (PreToolUse hook으로 차단됨 — 사용자가 직접 수정)

## Architecture

### URL 구조
- 메인: `/[org]/[team]/...` — 예: `/paranalgae/youth`, `/paranalgae/senior`
- 리그: `/league/[orgSlug]/[leagueId]/...` — record / schedule / stats / roster / teams / settings
- 구 URL `/youth`, `/senior` → `src/middleware.ts` 301 리다이렉트

### 멀티테넌트 모델
- `teams` 테이블: 복합키 `org_slug + sub_slug` (예: paranalgae/youth, paranalgae/senior)
- `players.team_type` (youth / senior) — **절대 삭제 금지** (youth 35명, senior 32명)
- `teams.edit_pin TEXT NOT NULL` — 게임 기록 PIN을 DB 기반으로 저장 (env 아님)
- PIN 검증: `src/lib/leaguePinAuth.ts` (`verifyLeaguePin`) — 모든 mutation API의 필수 가드

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
