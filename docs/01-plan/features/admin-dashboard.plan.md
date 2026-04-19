---
template: plan
version: 1.2
feature: admin-dashboard
date: 2026-04-20
author: Robin (PM)
project: basketball-stats-dashboard
---

# Admin Dashboard Planning Document

> **Summary**: 농구 스탯 대시보드 SaaS 화를 위한 슈퍼 어드민 운영 콘솔 및 기존 프로젝트의 multi-org URL 리팩토링 플랜
>
> **Project**: basketball-stats-dashboard (+ 신규 admin 프로젝트)
> **Author**: Robin
> **Date**: 2026-04-20
> **Status**: Draft (CTO 승인 대기)

---

## 1. Overview

### 1.1 Purpose

현재 `basketball-stats-dashboard`는 단일 조직(`paranalgae`)을 하드코딩한 상태로 운영 중이다. 이를 **멀티 조직(multi-tenant) SaaS 구조**로 확장하기 위해:

1. 기존 서비스 URL을 `/[team]/...` → `/[org]/[team]/...` 로 리팩토링
2. 슈퍼 어드민(운영자) 전용 별도 어드민 대시보드를 신규 구축
3. org/팀/PIN을 DB에서 중앙 관리

### 1.2 Background

- 타 농구 클럽 유치를 위해서는 org 단위로 팀을 동적으로 추가/관리할 수 있어야 함
- 현재 편집 PIN이 환경변수 기반이라 org별 분리가 불가능
- 현황(등록된 팀, 선수 수, 경기 수 등)을 한눈에 보는 운영자 전용 콘솔 필요

### 1.3 Related Documents

- 기존 Memory: `C:/Users/N_399/.claude/projects/c--Users-N-399-Desktop-ai-rob/memory/MEMORY.md` (basketball-stats-dashboard 섹션)
- GitHub: https://github.com/robinside7854/basketball-stats-dashboard.git

---

## 2. Scope

### 2.1 In Scope

- [ ] 어드민 전용 별도 Next.js 프로젝트 신설 (`basketball-stats-admin`, port 3010)
- [ ] 슈퍼 어드민 단일 계정 로그인 (env credentials 기반)
- [ ] Org CRUD: 생성/조회/수정/삭제
- [ ] Org별 youth/senior 팀 활성화 토글, 팀명/accent_color 편집
- [ ] Org별 `edit_pin` 발급/변경/조회
- [ ] 현황 대시보드: 등록 org 수, org별 선수/대회/경기 수 카드
- [ ] 기존 프로젝트 URL 구조 리팩토링: `/[team]/...` → `/[org]/[team]/...`
- [ ] 레거시 경로(`/youth`, `/senior`) → `/paranalgae/...` 301 리다이렉트
- [ ] `teams` 테이블에 `edit_pin` 컬럼 추가 및 PIN 검증 로직 DB 기반 전환
- [ ] 동일 Supabase 프로젝트 공유 (service_role은 admin 전용)

### 2.2 Out of Scope

- 다중 어드민 계정, 역할(role) 시스템 (향후 확장)
- org별 요금제/결제 연동
- org 가입 신청 셀프 서비스 (현재는 운영자 수동 생성만)
- 통계/분석 고급 리포팅 (별도 Phase)
- 이메일 초대, 비밀번호 재설정 흐름

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 슈퍼 어드민 로그인 (env 기반 email+password, NextAuth Credentials) | Must | Pending |
| FR-02 | 로그인 후 대시보드 진입, 전체 org 목록/KPI 카드 표시 | Must | Pending |
| FR-03 | Org 생성 (org_slug 유니크 검증, 이름, 기본 accent_color) | Must | Pending |
| FR-04 | Org 상세: youth/senior 팀 활성화, 팀명/accent_color 수정 | Must | Pending |
| FR-05 | Org 삭제 (cascade 경고 모달, 관련 데이터 확인 후 삭제) | Should | Pending |
| FR-06 | Org별 PIN 자동 생성(6자리), 수동 재발급, 평문 1회 노출 + 이후 마스킹 | Must | Pending |
| FR-07 | Org별 현황 카드: 선수/대회/경기 수 count 쿼리 | Must | Pending |
| FR-08 | `teams` 테이블에 `edit_pin TEXT NOT NULL DEFAULT random` 컬럼 추가 | Must | Pending |
| FR-09 | 기존 프로젝트: `[org]/[team]` 동적 라우팅으로 전환 | Must | Pending |
| FR-10 | 기존 `/youth`, `/senior` → `/paranalgae/youth`, `/paranalgae/senior` 301 리다이렉트 | Must | Pending |
| FR-11 | 편집 PIN 검증 로직을 env → Supabase `teams.edit_pin` 조회로 변경 | Must | Pending |
| FR-12 | 어드민 미들웨어: 비로그인 시 `/login` 리다이렉트 | Must | Pending |
| FR-13 | 잘못된 `org_slug` 접근 시 404 페이지 | Should | Pending |
| FR-14 | 비활성화된 팀 접근 시 안내 페이지 | Could | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 보안 | 어드민 credentials env only, service_role key는 admin 서버사이드만 사용 | 코드 리뷰 + git-secret scan |
| 보안 | PIN은 bcrypt 해시로 저장 또는 평문 저장 (결정 필요 — NFR 참고) | 구현 결정 |
| 성능 | 어드민 대시보드 LCP < 2.5s (org 100개 기준) | Lighthouse |
| 가용성 | 기존 사용자 서비스 무중단 마이그레이션 | blue-green/순차 배포 |
| SEO | 기존 공개 페이지 리다이렉트 301로 랭킹 유지 | 배포 후 Search Console 확인 |

**PIN 저장 방식 결정 사항 (CTO 승인 필요)**:
- 옵션 A: 평문 저장 — 어드민이 PIN 조회 가능 (현재 운영 방식 유지, 편의 ↑)
- 옵션 B: bcrypt 해시 저장 — PIN 생성 시 1회 노출, 이후 조회 불가 (보안 ↑)
- **권장**: 옵션 A (운영자가 분실 시 클럽에 재안내해야 하므로 조회 가능해야 실무상 편리). 단 Supabase RLS로 `edit_pin` 컬럼은 service_role만 읽도록 제한.

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] 어드민 `basketball-stats-admin` 프로젝트 배포 및 로그인 성공
- [ ] Org 생성 → 해당 org URL로 기존 서비스 접속 가능 (end-to-end)
- [ ] PIN 발급 → 해당 PIN으로 편집 모드 진입 성공
- [ ] `paranalgae` 데이터 마이그레이션 및 기존 URL 리다이렉트 동작
- [ ] 코드 리뷰 + Vercel 배포 완료
- [ ] Memory 업데이트 (admin 프로젝트 등록)

### 4.2 Quality Criteria

- [ ] 기존 기능(박스스코어, AI MVP, 선수카드) 모두 정상 동작
- [ ] `/[org]/[team]` 404 처리 정확
- [ ] Lighthouse 어드민 대시보드 Performance > 85
- [ ] 타입스크립트 에러 0, lint 에러 0

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| URL 구조 변경으로 기존 북마크/SNS 링크 깨짐 | High | High | 301 리다이렉트로 모두 보존, 배포 전 테스트 경로 리스트업 |
| Supabase RLS 정책 누락으로 타 org 데이터 노출 | High | Medium | 모든 테이블에 `org_id` FK 점검 + RLS `auth.team_id` 정책 추가 |
| service_role key가 admin 프로젝트에 노출 | High | Low | env only, 클라이언트 번들에 포함되지 않도록 서버 라우트만 사용 |
| 기존 하드코딩된 `paranalgae` 참조 누락 | Medium | Medium | grep으로 전수 조사, 상수화 후 제거 |
| PIN 평문 저장 시 DB dump 유출 위험 | Medium | Low | RLS + service_role 전용 컬럼 읽기 제한 |
| 어드민 로그인 단일 계정 분실/탈취 | High | Low | env 관리, 2FA 없는 점 인지 — 향후 고도화 항목 |

---

## 6. Architecture Considerations

### 6.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| Starter | 단순 구조 | 랜딩/포트폴리오 | ☐ |
| **Dynamic** | Feature-based, BaaS | 어드민 SaaS 콘솔 | ☑ |
| Enterprise | Strict layer separation | 대규모 시스템 | ☐ |

### 6.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 어드민 프로젝트 분리 | 모노레포 / 별도 프로젝트 / 동일 프로젝트 내 `/admin` | **별도 Next.js 프로젝트** | 도메인 분리(admin.xxx.com), 배포/보안 독립성, 번들 분리 |
| Framework | Next.js 16 (App Router) | Next.js 16 | 기존 프로젝트와 동일 스택 |
| 인증 | NextAuth Credentials / 커스텀 JWT / Supabase Auth | **NextAuth Credentials** | 단일 계정이라 env 비교 + 세션쿠키면 충분, 커스텀 복잡도 회피 |
| Styling | Tailwind CSS 4 | Tailwind | 기존과 일치 |
| DB Client | Supabase (service_role, 서버사이드만) | Supabase admin client | 기존 DB 공유, RLS 우회 필요 |
| Form | react-hook-form + zod | 동일 | 검증 일관성 |
| 배포 | Vercel | Vercel | 기존과 동일 |

### 6.3 Project Layout

```
basketball-stats-admin/       # 신규 프로젝트 (port 3010)
├── src/
│   ├── app/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx            # 인증 가드 + 사이드바
│   │   │   ├── page.tsx              # 대시보드 홈 (KPI)
│   │   │   ├── orgs/
│   │   │   │   ├── page.tsx          # org 목록
│   │   │   │   ├── new/page.tsx      # org 생성
│   │   │   │   └── [orgSlug]/
│   │   │   │       ├── page.tsx      # org 상세(팀 편집)
│   │   │   │       └── pin/page.tsx  # PIN 관리
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── orgs/route.ts
│   │       ├── orgs/[orgSlug]/route.ts
│   │       ├── orgs/[orgSlug]/pin/route.ts
│   │       └── stats/route.ts
│   ├── components/
│   │   ├── OrgCard.tsx
│   │   ├── OrgForm.tsx
│   │   ├── PinManager.tsx
│   │   └── StatsCards.tsx
│   ├── lib/
│   │   ├── supabase/admin.ts         # service_role 클라이언트 (서버 전용)
│   │   ├── auth.ts                   # NextAuth config
│   │   └── pin.ts                    # PIN 생성 유틸
│   └── middleware.ts                 # 인증 미들웨어
├── .env.local                        # ADMIN_EMAIL, ADMIN_PASSWORD, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NEXTAUTH_SECRET
└── package.json
```

```
basketball-stats-dashboard/   # 기존 프로젝트 (리팩토링 대상)
├── src/app/
│   ├── [org]/                        # 신설 (구 [team] 상위로 이동)
│   │   └── [team]/
│   │       ├── page.tsx              # 기존 [team]/page.tsx 이동
│   │       ├── boxscore/page.tsx
│   │       ├── roster/page.tsx
│   │       ├── tournaments/page.tsx
│   │       └── ...
│   ├── youth/page.tsx                # 삭제 → 리다이렉트
│   ├── senior/page.tsx               # 삭제 → 리다이렉트
│   └── middleware.ts                 # /youth, /senior → /paranalgae/... 리다이렉트
└── src/lib/teams.ts                  # org+team 조회 헬퍼 (신설)
```

---

## 7. Convention Prerequisites

### 7.1 Existing Project Conventions

- [x] 기존 Next.js 16 App Router 컨벤션 준수
- [x] Tailwind CSS 4 사용
- [x] Supabase admin client 패턴(`src/lib/supabase/admin.ts`) 재활용
- [ ] 어드민 프로젝트 `CLAUDE.md` 신규 작성 필요

### 7.2 Environment Variables Needed

**basketball-stats-admin (신규)**:

| Variable | Purpose | Scope | To Be Created |
|----------|---------|-------|:-------------:|
| `ADMIN_EMAIL` | 슈퍼 어드민 로그인 이메일 | Server | ☑ |
| `ADMIN_PASSWORD` | 슈퍼 어드민 비밀번호 (bcrypt 해시 권장) | Server | ☑ |
| `NEXTAUTH_SECRET` | NextAuth 세션 시크릿 | Server | ☑ |
| `NEXTAUTH_URL` | 어드민 도메인 URL | Server | ☑ |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | Client | ☑ |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role (RLS 우회) | Server | ☑ |

**basketball-stats-dashboard (기존, 변경 없음)**: 기존 env 유지, `EDIT_PIN` env 제거 가능.

---

## 8. 구현 Phase 및 순서

### Phase 0: DB Migration (사전 작업)

**마이그레이션 SQL** (`supabase/migrations/020_multi_org_support.sql`):

```sql
-- 1. teams 테이블에 edit_pin 컬럼 추가
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS edit_pin TEXT;

-- 2. 기존 paranalgae 팀에 기본 PIN 부여 (현재 env 값으로 세팅)
UPDATE teams
  SET edit_pin = '0000'  -- 실제 현재 운영 PIN으로 교체
  WHERE org_slug = 'paranalgae' AND edit_pin IS NULL;

-- 3. NOT NULL 강제 (모든 팀 PIN 보유 후)
ALTER TABLE teams
  ALTER COLUMN edit_pin SET NOT NULL;

-- 4. is_active 컬럼 추가 (youth/senior 활성화 토글용)
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 5. org_slug 인덱스 (조회 최적화)
CREATE INDEX IF NOT EXISTS idx_teams_org_slug ON teams(org_slug);
CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_org_team ON teams(org_slug, name);

-- 6. RLS: edit_pin 컬럼은 service_role만 접근
-- (teams 테이블 자체에 기존 RLS가 있다면 column-level은 뷰로 처리)
CREATE OR REPLACE VIEW teams_public AS
  SELECT id, org_slug, name, accent_color, is_active
  FROM teams;

-- 어플리케이션 코드는 teams_public을 사용, admin만 teams 원본 접근
```

### Phase 1: 기존 프로젝트 URL 리팩토링 (1일)

**영향 받는 파일 목록** (grep 기반 전수 조사 대상):

| 경로 | 변경 내용 |
|------|----------|
| `src/app/[team]/` 전체 | `src/app/[org]/[team]/`로 이동 |
| `src/app/youth/page.tsx` | 삭제 또는 redirect |
| `src/app/senior/page.tsx` | 삭제 또는 redirect |
| `src/app/page.tsx` (루트) | `/paranalgae/youth` 기본 진입 or org 선택 |
| `src/middleware.ts` (신설) | `/youth` `/senior` → `/paranalgae/...` 301 |
| `src/lib/teams.ts` (신설) | `getTeam(orgSlug, teamName)` 헬퍼 |
| `src/app/api/**/route.ts` 전체 | `team` 파라미터 → `org+team` 조합 수신 |
| 편집 PIN 검증 로직 | env → Supabase `teams.edit_pin` 조회 |
| 모든 `<Link href="/youth/...">` | `<Link href={`/${orgSlug}/${team}/...`}>` |
| `src/components/**` navigation | orgSlug prop 전달 |

### Phase 2: 어드민 프로젝트 스캐폴딩 (1일)

1. `basketball-stats-admin` Next.js 16 프로젝트 생성 (port 3010)
2. Tailwind 4 + shadcn/ui 세팅
3. NextAuth Credentials Provider 세팅
4. Supabase admin client 추가
5. 로그인 페이지 + middleware 인증 가드

### Phase 3: Org 관리 기능 (1.5일)

1. Org 목록 페이지 + 카드 UI
2. Org 생성 폼 (org_slug 유니크 검증)
3. Org 상세 (youth/senior 토글, 팀명/accent_color 편집)
4. Org 삭제 (cascade 경고 모달)

### Phase 4: PIN 관리 + 현황 대시보드 (1일)

1. PIN 재발급 API + UI (6자리 random)
2. 현황 카드: org별 선수/대회/경기 수 aggregate
3. 대시보드 홈 KPI

### Phase 5: 배포 & 마이그레이션 (0.5일)

1. 어드민 Vercel 배포 (별도 도메인)
2. 기존 프로젝트 리팩토링 배포
3. 기존 URL 리다이렉트 동작 검증
4. 운영 PIN 재설정 + 안내

**총 예상 공수**: 약 5일 (1인 기준)

---

## 9. 주요 컴포넌트/페이지 목록

### basketball-stats-admin

| 경로 | 설명 |
|------|------|
| `/login` | 이메일+비밀번호 로그인 |
| `/` (dashboard) | KPI 4카드 (org 수, 팀 수, 선수 수, 경기 수) + 최근 org |
| `/orgs` | Org 리스트 테이블 |
| `/orgs/new` | Org 생성 폼 |
| `/orgs/[orgSlug]` | Org 상세: 팀 편집, 활성화 토글 |
| `/orgs/[orgSlug]/pin` | PIN 조회/재발급 |

| 컴포넌트 | 용도 |
|----------|------|
| `<OrgCard />` | 대시보드 org 요약 카드 |
| `<OrgForm />` | 생성/수정 공용 폼 |
| `<TeamToggle />` | youth/senior 활성화 스위치 |
| `<PinManager />` | PIN 표시/복사/재발급 |
| `<StatsCards />` | 현황 KPI 카드 그룹 |
| `<ConfirmDialog />` | 삭제 확인 모달 |

---

## 10. Next Steps

1. [ ] CTO 리뷰 & 승인 (특히 PIN 저장 방식 옵션 A/B)
2. [ ] Design 문서 작성 (`/pdca design admin-dashboard`)
   - Supabase RLS 정책 상세
   - NextAuth 세션 구조
   - API 스펙 (request/response)
3. [ ] Phase 0 DB 마이그레이션 실행
4. [ ] 구현 착수

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-04-20 | Initial draft | Robin (PM) |
