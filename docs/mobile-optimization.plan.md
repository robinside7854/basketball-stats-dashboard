# 모바일 UX 최적화 플랜 (자율 진행)

> 작성: 2026-07-03
> 목적: 웹/PWA 환경에서 클릭 외 스크롤·제스처 액션 도입, 전반적인 모바일 최적화
> 배경: 사용자 요청 "웹이나 앱에서 화면 이동을 클릭 외의 스크롤 액션을 추가"

## 현재 상태 (리서치 결과)

### 네비게이션
- **PC 상단 탭**: 홈 / 선수·팀 / 경기 / 스탯 / 어워즈 / Stathead / 드래프트 / 설정
- **모바일 하단 탭**: 홈 · 선수·팀 · 경기 · 스탯 · 더보기(=오버레이)
- **서브탭**:
  - `squad` = 선수 명단(roster) ↔ 팀 구성(teams)
  - `games` = 일정(schedule) ↔ 경기 기록(record)

### 부재한 것
- swipe / gesture 유틸 훅 없음 (`onTouchStart`, framer-motion drag 미사용)
- pull-to-refresh 없음
- `touch-action` CSS 없음 → 300ms 탭 지연 가능성
- `env(safe-area-inset-*)` 미적용 → iOS 노치·홈바 영역 겹칠 가능성
- 모달 총 7개 (`fixed inset-0`) — 클릭·ESC 로만 닫힘, swipe-to-dismiss 없음

## 설계 우선순위

### 🥇 Tier 1 — 즉시 체감 개선 (오늘 밤 구현)

**1. Global touch-action + safe-area CSS**
- `body { touch-action: manipulation }` — 300ms 탭 지연 제거
- Bottom nav / sticky headers → `padding-bottom: env(safe-area-inset-bottom)` 등
- 파일: `src/app/globals.css`

**2. `useSwipe` 공용 훅 + PlayerQuickViewModal 스와이프-투-디스미스**
- 신규: `src/hooks/useSwipe.ts` — 터치 시작/이동/종료 감지, 방향 임계값 반환
- 모달 헤더에 drag 감지 → 아래로 100px+ 드래그 시 close
- **가장 자주 열리는 모달 (PlayerQuickViewModal)** 부터 적용
- 다른 모달은 다음 세션에 확산

**3. 서브탭 간 좌우 스와이프**
- `LeagueSubTabs` 그룹 내에서만: roster ↔ teams / schedule ↔ record
- 좌우 스와이프 감지 시 다음/이전 탭으로 `router.push`
- **엣지 20px 제외** (브라우저 뒤로가기 스와이프와 충돌 회피)
- 컨텐츠 영역에서만 감지 (헤더/탭바 제외)

### 🥈 Tier 2 — 이번 세션 여유 시 (선택)

**4. Pull-to-refresh (opt-in)**
- 기본 비활성 (실수 새로고침 방지)
- 특정 목록 페이지 (stats, roster) 에서만 옵트인
- 구현 어려움 중간, 다음 세션 후보

**5. Long-press 컨텍스트 메뉴**
- 선수 카드 길게 누르면 액션 시트 (즐겨찾기 / 공유 / …)
- 새 UX 패턴 도입 필요, 다음 세션 후보

### 🥉 Tier 3 — 참고 (다음 세션)

**6. Haptic feedback** (`navigator.vibrate(10)`) — 중요 확인 액션에만
**7. Skeleton loading** — 이미 부분 적용, 통일 필요
**8. `inputmode` 최적화** — 숫자 입력에 `inputmode='numeric'` 확인

## 스와이프 규칙 (UX 가이드 반영)

### 회피
- ❌ 메인 컨텐츠 전체에 좌우 스와이프 (브라우저 뒤로가기 제스처 충돌)
- ❌ Pull-to-refresh 기본 활성 (실수 유발)
- ❌ 44×44px 미만 터치 타겟

### 준수
- ✅ 서브탭 간 스와이프 (같은 그룹 내에서만)
- ✅ 엣지 20px 제외
- ✅ 세로 스크롤 우선 (`touch-action: pan-y`)
- ✅ 50px 이하 이동은 무시 (오작동 방지)
- ✅ 45도 이상 세로 방향은 세로 스크롤로 판정 (수평 스와이프 오작동 방지)

## 구현 순서 (오늘 밤)

1. **Foundation** — globals.css 에 touch-action + safe-area 추가
2. **useSwipe 훅** — 방향 감지 + 임계값 처리 유틸
3. **Modal 스와이프-투-디스미스** — PlayerQuickViewModal 헤더에 적용
4. **서브탭 스와이프** — `LeagueSubTabs` 컨테이너에 적용
5. **타입체크 + 커밋 + 배포**
6. **상세 보고서** — 아침에 사용자가 볼 문서 남기기

## 이후 세션 후보 (사용자 확인 후 진행)

- 다른 모달들에 swipe-to-dismiss 확산
- Pull-to-refresh 특정 페이지 적용
- Long-press 컨텍스트 메뉴
- Haptic feedback
- Bottom sheet 컴포넌트

## 사용자 승인 없이 진행 가능한 것

사용자 승인 없이 진행 요청됨. Tier 1 (1-3번) 은 리버시블한 UX 개선이라 부작용 낮음.
Tier 2 (pull-to-refresh, long-press) 는 UX 패턴 도입이라 사용자 검토 필요 → 보류.
