# 프랜차이즈 분리 + 분기 필터 확장 — 자율 작업 보고서

> 작성: 2026-07-05
> 사용자 요청: "락다운의 승패를 굿모닝이 계승" 오류 해결 + Sprint A+B (분기 필터 확장)

---

## 📋 요약

배포 완료 커밋 4개 · master → Vercel 자동 배포 완료

| 커밋 | 내용 |
|-----|------|
| `2e0065c2` | teamIdentity 유틸 + standings/daily-boxscore 프랜차이즈 분리 |
| `1dfdf2fb` | awards API + UI 분기 필터 |
| `6978685c` | LeagueQuarterContext (분기 선택 페이지 간 공유) |

---

## ✅ Phase 별 완료 사항

### Phase 1: 공용 teamIdentity 유틸
`src/lib/stats/teamIdentity.ts` (신규)

- `identityKey = ${team_id}::${display_name}` — 프랜차이즈 유일 식별자
- `makeIdentityResolver(teams, overrides)` — (team_id, quarter_id) → 정체성 반환
- `loadIdentityResolver(supabase, leagueId)` — DB 로드 헬퍼

### Phase A: standings API 프랜차이즈 분리 ⭐ 사용자 핵심 요청
`src/app/api/leagues/[leagueId]/standings/route.ts`

**Before**: `standing[team_id]` → 락다운 (Q1-Q2) + 굿모닝 (Q3+) 이 동일 team_id 라 하나의 행으로 합쳐짐

**After**: `standing[identityKey]` → 각각 별개 프랜차이즈 행

`홈 화면 · 팀 순위 카드에 5개 프랜차이즈 별개 표시`:
- 락다운 (Q1-Q2)
- 굿모닝 (Q3+)
- 빅현욱 (전 분기)
- 런앤건 (Q1-Q2)
- 챗지피지기 (Q3+)

### Phase B: Daily boxscore override 적용 ⭐ 사용자 신고
`src/app/api/leagues/[leagueId]/daily-boxscore/route.ts`

**Before**: base team 이름만 사용 → Q3 게임에 "런앤건" 등 이전 이름 표시 위험

**After**: `identityResolver(team_id, game.quarter_id)` 로 override 반영
- home_team / away_team 표시 정정
- 선수 team_name 도 game quarter 기준으로 정정

### Phase C: Awards API 분기 필터 지원
`src/app/api/leagues/[leagueId]/awards/route.ts`

- `?quarterId=X` 파라미터 지원
- game dates · stats API · clutchStats · perDayStats 모두에 quarterId 전파
- 결과: 분기별 MVP / 득점왕 / DPOY 등 별도 산출

### Phase D: Awards 페이지 분기 필터 UI
`src/app/league/[org]/[id]/awards/page.tsx`

- 헤더 아래 **분기 필터 탭** (시즌 전체 + 각 분기 · amber 강조)
- 분기 변경 시 자동 재조회
- 자격 요건 문구도 선택 분기 반영 (예: "26.3Q 3일 중 2일 이상")

### Phase E: LeagueQuarterContext
`src/contexts/LeagueQuarterContext.tsx` (신규)

- `LeagueQuarterProvider` — leagueId 별로 selectedQuarterId 공유
- `useLeagueQuarter()` — { selectedQuarterId, setSelectedQuarterId }
- **localStorage 백업** — 같은 리그 재방문 시 이전 선택 복원
- Provider 없는 곳에서도 optional 사용 가능

**연결된 페이지**:
- awards (stats 에서 Q3 선택 → awards 진입 시 Q3 유지)
- stats (localStorage 복원 · 없으면 current quarter 자동 설정)

**의도적 미연결**:
- stathead: URL 쿼리 기반 공유 상태 유지 (기존 UX)
- teams / schedule / record: 자체 UX 특수성

---

## ⏸️ 다음 세션으로 이관 (Phase F)

**PlayerQuickView 팀 승률 identity 분리**

- 현재: `win_loss.win_rate` 단일 값 (모든 팀 통합)
- 목표: 락다운 승률 X% / 굿모닝 승률 Y% 분리 표시
- 이유: `players/[id]/detail/route.ts` 913 lines 규모 리팩터 필요 → 리스크 관리 차원 미룸
- 우선순위: 중 (선수 통산 통합 승률은 여전히 정확)

---

## 📊 검증 결과

배포 확인 (curl):
```
GET /league/miracle/2026/awards → 200 OK · slug-rewrite
```

Vercel 자동 배포 정상 완료 확인.

---

## 🧪 사용자 아침 확인 리스트

1. **홈페이지 팀 순위** — 5개 프랜차이즈 별개 표시 확인 (락다운 vs 굿모닝 분리)
2. **7/4 박스스코어** — Q3 이름 (챗지피지기 · 굿모닝) 정상 표시
3. **어워즈 페이지** — 분기 탭 노출 · Q3 선택 시 그 분기만의 MVP 등 산출
4. **분기 유지** — stats 에서 Q3 → awards 이동 → Q3 자동 선택 확인
5. **재방문** — 새로고침 후 이전 분기 선택 복원 확인

---

## 🎯 다음 세션 후보

- PlayerQuickView 팀 승률 identity 분리 (Phase F)
- vs Opponents 프랜차이즈 별개 표시 (락다운·굿모닝 분리)
- 팀 카드에 활동 기간 표시 ("26.1Q ~ 26.2Q" 등)
- 프랜차이즈 별 스타일링 (락다운 색상 · 굿모닝 색상 명확 구분)

---

접속 링크: https://basketball-stats-dashboard.vercel.app/league/miracle/2026
