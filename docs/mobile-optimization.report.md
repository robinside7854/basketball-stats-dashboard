# 모바일 UX 최적화 — 야간 자율 작업 보고서

> 작성: 2026-07-03 밤 (사용자 취침 전 자율 진행 승인)
> 커밋: `d6f02057`
> 배포: master → Vercel 자동 배포 완료

---

## 📋 요약

**요청**: 클릭 외 스크롤/제스처 액션 도입, 전반적 모바일 최적화 검토
**진행**: 리서치 → 설계 → Tier 1 (즉시 체감) 구현 → 커밋 → 배포
**보류**: Tier 2+ 항목 (Pull-to-refresh, 다른 모달 확산 등) — 사용자 확인 후 진행

---

## ✅ 배포된 변경사항

### 1️⃣ Foundation (모든 페이지 자동 적용)

**파일**: `src/app/globals.css`

| 변경 | 효과 |
|-----|-----|
| `body { touch-action: manipulation }` | 300ms 탭 지연 제거 · 버튼 즉시 반응 |
| `body { overscroll-behavior-y: contain }` | 모달 위에서 배경 스크롤 방지 |
| `html { -webkit-text-size-adjust: 100% }` | iOS 회전 시 텍스트 자동 확대 방지 |

기존 `pt-safe` / `pb-safe-or-3` 유틸은 이미 반영됨 (변경 없음).

### 2️⃣ 공용 useSwipe 훅

**신규 파일**: `src/hooks/useSwipe.ts`

- 4방향 감지 (`up` / `down` / `left` / `right`)
- 임계값 · 45도 방향 판정 · edge guard (브라우저 back 제스처 회피)
- `onDrag` / `onDragEnd` — 실시간 시각 피드백 지원

### 3️⃣ PlayerQuickViewModal 스와이프-투-디스미스

**파일**: `src/components/league/PlayerQuickViewModal.tsx`

- 모달 상단 액션 바에서 **아래로 100px+ 드래그 → 닫힘**
- 드래그 중 모달이 손가락 따라 이동 (translateY)
- 임계값 미달 시 200ms ease-out 로 원위치
- 모바일에만 회색 drag handle 인디케이터 (sm:hidden)

### 4️⃣ 서브탭 좌우 스와이프 네비게이션

**신규 파일**: `src/components/league/SubTabSwipeArea.tsx`
**적용된 페이지**:
- `roster` ↔ `teams` (squad 그룹, 양방향)
- `schedule` → `record` (games 그룹, 단방향)

**Record 페이지 제외 사유**:
- 1830 lines 의 복잡한 스탯 입력·드래그드롭 UI
- 좌우 swipe 가 기존 상호작용과 충돌 위험
- 다음 세션에서 더 정교한 격리 후 도입 검토

---

## 🎯 UX 규칙 준수 (기록용)

리서치 결과 반영한 안전장치:

- ✅ `touch-action: pan-y` 로 세로 스크롤 우선 (수평만 감지)
- ✅ 화면 좌우 엣지 20-24px 제외 (iOS 뒤로가기 제스처 회피)
- ✅ 스와이프 임계값 50-100px (실수 방지)
- ✅ 45도 이상 세로 방향은 수직 스크롤로 판정
- ✅ 44×44px 터치 타겟 유지 (기존 준수)

---

## ⏸️ 미구현 (Tier 2+, 다음 세션 후보)

사용자 확인 후 진행이 안전한 항목들:

### 다른 모달 스와이프-투-디스미스 확산

현재 PlayerQuickViewModal 만 적용. 나머지 후보:
- `GameLogModal` — 게임 로그
- `DailyBoxscoreModal` — 일별 박스스코어
- `AwardDetailModal` — 어워즈 상세
- `PlayerCompareModal` — 선수 비교
- `GlobalSearchModal` — 전역 검색
- `DraftPlayerStatsModal` — 드래프트 선수 스탯

같은 useSwipe 훅으로 각 모달에 5줄 정도로 확산 가능.

### Pull-to-refresh (옵트인)

**보류 이유**: 실수 새로고침 유발 위험
- 특정 목록 페이지 (`/stats`, `/roster`) 에만 옵트인
- iOS 는 기본 pull-to-refresh 이 있어 중복 발생 우려

### Long-press 컨텍스트 메뉴

- 선수 카드 길게 누르면 액션 시트 (즐겨찾기·공유·프로필 편집 등)
- 새 UX 패턴 도입 → 사용자 검토 필요

### Haptic Feedback

- `navigator.vibrate(10)` — 중요 확인 액션에만
- 안드로이드 지원, iOS 는 Vibration API 부분 지원
- 오남용 방지 필요 (매 탭마다 진동 X)

### `record` 페이지 스와이프 도입

- 스탯 입력 UI 와 격리된 상단 영역에만 적용
- 별도 컨테이너 분리 후 진행

---

## 🧪 아침에 확인할 것

1. **로스터 페이지 좌 → 우 스와이프** → 팀 구성으로 이동
2. **팀 구성 페이지 우 → 좌 스와이프** → 로스터로 이동
3. **선수 프로필 모달** 열고 상단 회색 handle 있는지 확인
4. **모달 헤더 아래로 드래그** → 손가락 따라 내려오고 100px+ 에서 닫힘
5. **일정 페이지 좌 → 우 스와이프** → 경기 기록으로 이동
6. **경기 기록 페이지** → 스와이프 없음 확인 (기존 UI 그대로)
7. **어떤 페이지든 버튼 탭** → 이전보다 반응 빠른지 (touch-action 효과)

문제 있으면 알려주세요:
- 스와이프 오작동 (세로 스크롤 방해, 실수 발생 등)
- 모달 드래그가 어색함 (임계값 조정 필요)
- iOS 뒤로가기 제스처 충돌

---

## 💬 결정 요청 (다음 세션)

**A. Tier 2 확산 방향**:
1. 다른 모달들에 swipe-to-dismiss 확산 (권장 · 부작용 낮음)
2. Long-press 컨텍스트 메뉴 도입 (검토 필요)
3. Pull-to-refresh 특정 페이지 옵트인 (검토 필요)

**B. Record 페이지 스와이프**:
- 스탯 입력 UI 와 상단 영역 분리 필요
- 도입 원하시면 리팩터 계획 세우겠습니다

**C. 아침 확인 후 조정 필요 사항 있으면**:
- 임계값 (100px, 60px 등) 조정
- 드래그 애니메이션 스타일 튜닝
- 특정 페이지에서만 활성/비활성

---

접속 링크: https://basketball-stats-dashboard.vercel.app/league/miracle/2026
