# 리그 모드 (League Mode)

## 개요
동호회(org) 단위로 자체 내부 리그를 운영하는 기능.
회원을 2~3개 팀으로 나눠 매주 토요일 정기 경기를 진행하고,
어드민이 리그 구조를 설정·관리하며 공개 페이지에서 순위표·일정·통계를 확인한다.

*작성일: 2026-04-22*

---

## 배경 및 목표

| 현재 (토너먼트 모드) | 리그 모드 |
|---|---|
| 외부 대회 참가 기록 | 동호회 내부 자체 리그 |
| 상대 = 외부팀 텍스트 | 상대 = 등록된 내부 리그팀 |
| 집계 없음 (수동 확인) | 자동 순위표 (승점/득실차) |
| 일정 수동 입력 | 라운드로빈 자동 생성 지원 |

---

## 사용자 흐름

### 어드민 (서비스 운영자)
1. org 선택 → 리그 생성 (이름·시즌·시작일·총 라운드 수)
2. 리그팀 구성 (2~3팀, 이름·대표색)
3. 동호회 선수 → 각 팀 배정 (드래프트 UI)
4. 일정 자동 생성 (라운드로빈, 매주 토요일 기준)
5. 매주 결과 입력 + 기록 완료 처리

### 일반 사용자 (동호회 회원)
- `/[org]/league` 접속 → 현재 시즌 순위표·일정 확인
- 개인 통계 리더보드 확인
- 경기 결과 히스토리 조회

---

## DB 스키마

### 신규 테이블 4개

```sql
-- 1. 리그 시즌
CREATE TABLE leagues (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug      TEXT NOT NULL,
  name          TEXT NOT NULL,          -- "2025 봄 시즌"
  season_year   INT NOT NULL,
  start_date    DATE NOT NULL,
  match_day     TEXT DEFAULT 'saturday',
  total_rounds  INT NOT NULL DEFAULT 8,
  status        TEXT DEFAULT 'upcoming', -- upcoming | active | completed
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 2. 리그 내 팀 (2~3개)
CREATE TABLE league_teams (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id  UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,   -- "레드팀"
  color      TEXT DEFAULT '#3b82f6'
);

-- 3. 팀-선수 배정
CREATE TABLE league_team_players (
  league_team_id  UUID NOT NULL REFERENCES league_teams(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (league_team_id, player_id)
);

-- 4. 리그 경기
CREATE TABLE league_games (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id      UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  home_team_id   UUID NOT NULL REFERENCES league_teams(id),
  away_team_id   UUID NOT NULL REFERENCES league_teams(id),
  date           DATE NOT NULL,
  round_num      INT NOT NULL,
  home_score     INT DEFAULT 0,
  away_score     INT DEFAULT 0,
  is_complete    BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);
```

> **기록 연동**: `game_events`, `player_minutes` 테이블에 `league_game_id` 컬럼 추가하여
> 기존 통계 계산 파이프라인(`calculateBoxScore`) 그대로 재활용.

---

## URL 구조

```
공개 페이지:
  /[org]/league                          리그 홈 (현재 active 시즌 자동)
  /[org]/league/[leagueId]               시즌 홈 (순위표 + 최근 결과)
  /[org]/league/[leagueId]/schedule      전체 일정
  /[org]/league/[leagueId]/stats         개인 통계 리더보드

어드민:
  /admin/orgs/[orgSlug]/leagues          리그 목록
  /admin/orgs/[orgSlug]/leagues/new      리그 생성
  /admin/orgs/[orgSlug]/leagues/[id]     리그 관리 (탭: 팀구성·드래프트·일정·결과입력)
```

---

## 순위표 계산 규칙 (기본값, 리그별 커스텀 가능)

| 항목 | 값 |
|------|---|
| 승 | +3점 |
| 무 | +1점 |
| 패 | +0점 |
| 동률 기준 1 | 승점 |
| 동률 기준 2 | 득실차 |
| 동률 기준 3 | 총 득점 |

---

## 구현 파일 목록

### DB
- `supabase/migrations/016_league_tables.sql`

### API
| 파일 | 역할 |
|------|------|
| `src/app/api/leagues/route.ts` | org별 리그 목록 조회 |
| `src/app/api/leagues/[leagueId]/route.ts` | 리그 상세 조회/수정 |
| `src/app/api/leagues/[leagueId]/teams/route.ts` | 리그팀 CRUD + 선수 배정 |
| `src/app/api/leagues/[leagueId]/schedule/route.ts` | 일정 자동 생성 (라운드로빈) |
| `src/app/api/leagues/[leagueId]/games/route.ts` | 경기 목록/결과 입력 |
| `src/app/api/leagues/[leagueId]/standings/route.ts` | 순위표 계산 |
| `src/app/api/leagues/[leagueId]/stats/route.ts` | 개인 통계 리더보드 |
| `src/app/api/admin/leagues/route.ts` | 어드민 리그 생성 |

### 공개 페이지
| 파일 | 역할 |
|------|------|
| `src/app/(main)/[org]/league/page.tsx` | 리그 홈 (현재 시즌 리다이렉트) |
| `src/app/(main)/[org]/league/[leagueId]/page.tsx` | 시즌 홈 |
| `src/app/(main)/[org]/league/[leagueId]/schedule/page.tsx` | 일정 |
| `src/app/(main)/[org]/league/[leagueId]/stats/page.tsx` | 통계 |

### 어드민 페이지
| 파일 | 역할 |
|------|------|
| `src/app/admin/(dashboard)/orgs/[orgSlug]/leagues/page.tsx` | 리그 목록 |
| `src/app/admin/(dashboard)/orgs/[orgSlug]/leagues/new/page.tsx` | 리그 생성 폼 |
| `src/app/admin/(dashboard)/orgs/[orgSlug]/leagues/[leagueId]/page.tsx` | 리그 관리 (탭 UI) |

### 컴포넌트
| 파일 | 역할 |
|------|------|
| `src/components/league/LeagueStandings.tsx` | 순위표 테이블 |
| `src/components/league/LeagueSchedule.tsx` | 주차별 일정/결과 |
| `src/components/league/LeagueStatsLeaderboard.tsx` | 개인 통계 리더보드 |
| `src/components/league/DraftBoard.tsx` | 선수 배정 드래그&드롭 UI |
| `src/components/league/LeagueGameResultForm.tsx` | 경기 결과 입력 폼 |

---

## 구현 순서 (Phase)

### Phase 1 — DB + 기본 CRUD (MVP 뼈대)
1. `leagues`, `league_teams`, `league_team_players`, `league_games` 테이블 생성
2. `game_events`, `player_minutes`에 `league_game_id` 컬럼 추가
3. 리그 목록/생성/삭제 API
4. 어드민: 리그 생성 폼 + 팀 구성 UI

### Phase 2 — 드래프트 + 일정 생성
5. 선수 배정 UI (드래프트 보드)
6. 라운드로빈 자동 대진 생성 로직 (start_date + total_rounds 기반 토요일 배치)
7. 일정 확인 + 수동 조정

### Phase 3 — 결과 입력 + 순위표
8. 경기 결과 입력 폼 (어드민)
9. 순위표 계산 API + LeagueStandings 컴포넌트
10. 공개 페이지: `/[org]/league/[leagueId]` 순위표 + 일정

### Phase 4 — 통계 연동
11. `game_events` 기록 연동 (기존 record 페이지 league_game 지원)
12. 개인 통계 리더보드 (PPG·RPG·APG 등 리그 단위 집계)
13. 공개 페이지: `/[org]/league/[leagueId]/stats`

### Phase 5 — 고도화 (후속)
- 순위표 규칙 커스텀 (리그별 승점 설정)
- 다음 라운드 일정 자동 알림 (카카오/슬랙 연동 고려)
- 시즌 아카이브 (이전 시즌 조회)
- 선수 리그 통산 기록

---

## MVP 범위 (Phase 1~3)

Phase 1~3 완료 시:
- 어드민에서 리그 생성 → 팀 구성 → 일정 자동 생성
- 매주 결과 입력
- 공개 순위표·일정 페이지 노출

통계 기록(game_events)은 Phase 4에서 연동.

---

## 기술적 결정사항

| 항목 | 결정 | 이유 |
|------|------|------|
| 기록 파이프라인 | 기존 game_events 재활용 | 통계 계산 로직 중복 없음 |
| 순위표 계산 | API에서 실시간 계산 | 경기 수가 많지 않아 캐싱 불필요 |
| 일정 생성 | 서버 사이드 라운드로빈 알고리즘 | 팀 수 2~3개로 단순 |
| 다중 시즌 | leagueId URL 파라미터로 구분 | 시즌별 독립 관리 |
| 어드민 연동 | 기존 `/admin/orgs/[orgSlug]` 탭 확장 | 신규 라우트 최소화 |
