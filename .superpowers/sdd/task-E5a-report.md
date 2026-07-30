# E-Task 5a — 기록·로스터·게임로그 페이지 mm 토큰 전환 리포트

## 대상
- `src/app/(main)/record/page.tsx`
- `src/app/(main)/roster/page.tsx`
- `src/app/(main)/gamelog/page.tsx`

(컴포넌트 파일은 스코프 밖 — `YouTubePlayer`/`EventInputPad`/`SubstitutionPanel`/`LiveStatsPanel`/`PlayerCard`/`PlayerForm`/`PlayerDetailModal`/`PlayerCompareModal` 등은 건드리지 않음)

## 변경 요약

### 팔레트 교체 (SPEC 매핑표)
- `bg-gray-900`/`bg-gray-800` → `bg-[var(--mm-panel)]` / `bg-[var(--mm-panel-alt)]`, `border-gray-700/800` → `border-[var(--mm-rule)]`
- `text-white`/`text-gray-300` → `text-[var(--mm-ink)]`, `text-gray-400/500/600` → `text-[var(--mm-muted)]`
- `bg-blue-600/500` 주요 버튼(편집모드 전환, 선수 추가, 업로드 등록, Q1 기록 시작) → `bg-[var(--mm-ink)] text-[var(--mm-panel)]`, hover는 기존 확립된 관례(`hover:brightness-95`, opponent/roster 등 선례) 재사용
- 토글류(쿼터 선택 버튼, 모바일 record/view 탭, 포지션/정렬 필터칩, 선발 5명 선택 그리드) 활성 상태 → `bg-[var(--mm-ink)] text-[var(--mm-panel)]`, 비활성 → `bg-[var(--mm-panel-alt)] text-[var(--mm-muted)] hover:text-[var(--mm-ink)]` (boxscore/stats 뷰모드 토글 관례와 통일)
- `text-blue-400`(참석선수 등록 힌트, 엑셀 미리보기 번호) → `text-[var(--mm-yellow-strong)]`, 팀 점수(`text-amber-400`) → `text-[var(--mm-yellow-strong)]`
- `bg-yellow-500 text-black`(선출 배지) → `bg-[var(--mm-yellow)] text-[var(--mm-black)]`
- gamelog 안내 배너(`bg-blue-950/40 border-blue-800/50 text-blue-300`) → `bg-[var(--mm-yellow-soft)] border-[color:var(--mm-yellow)]/40 text-[var(--mm-yellow-strong)]` (`[org]/[team]/page.tsx`의 이미 반영된 info 배너 관례 재사용)
- gamelog 쿼터 분리 팝오버(`bg-gray-800 border-yellow-600/50`, 옵션칩 `bg-yellow-500 text-black`/`bg-gray-700`) → `bg-[var(--mm-panel-alt)] border-[color:var(--mm-yellow)]/50`, `bg-[var(--mm-yellow)] text-[var(--mm-black)]`/`bg-[var(--mm-panel)] text-[var(--mm-muted)]`
- 초기화 버튼 hover(`hover:text-red-400 hover:border-red-600`) → `hover:text-[var(--mm-negative)] hover:border-[var(--mm-negative)]`
- 승/패 관련 색상은 이 3개 페이지엔 없음(박스스코어/상대분석 스코프)

### 고정 색상으로 유지한 것 (SPEC 예외 · 이전 태스크 선례 재사용)
- "기록 완료" 버튼(`bg-green-700 hover:bg-green-600 text-white`)과 "✓ 기록 완료" 라벨(`text-green-400`) — Task E3에서 확립된 "고정 색상 배경 상태 버튼은 유지" 원칙 그대로 적용(처음엔 mm-positive로 바꿨다가 opponent/page.tsx 선례 확인 후 되돌림)
- 상대팀 득점 버튼(`bg-red-900 hover:bg-red-800 text-red-300`), made/missed 결과 마커(`text-green-400`/`text-red-400`, ✓/✗ 심볼) — 콘텐츠성 결과 표기 및 고정 위험색으로 유지
- gamelog `EVENT_ICONS`의 카테고리 색(`fill-yellow-400`/`fill-blue-400`/`fill-green-400`/`fill-purple-400`/`fill-orange-400`/`fill-red-400`) — 이벤트 유형별 고정 색코드(SHOT_TYPES 계열)로 Task E2~E4에서 유지된 관례와 동일하게 스코프 밖 처리, 다만 이모지 자체는 lucide 아이콘으로 교체

### 이모지 → lucide-react
- record: 🔒 → `Lock`, 📝 → `ClipboardList`, 📹 → `Video`, ✅(완료 안내) → `Check`, "✓ 기록 완료" 텍스트 심볼 → `Check` 아이콘 + 텍스트
- gamelog: `EVENT_ICONS`(🟡🔵⚪🟢💚💜🔴🟠❌⬆️⬇️▶️⏹️) 전체를 `{ Icon: LucideIcon; className }` 맵으로 교체 — `Circle`(색상 dot 계열), `X`(상대 득점), `ArrowUp`/`ArrowDown`(교체 IN/OUT), `Play`/`Square`(쿼터 시작/종료). 안내 배너의 "✂️ 버튼" 텍스트도 `Scissors` 아이콘으로 교체
- made/missed ✓/✗ 심볼은 콘텐츠성 결과 표기로 판단해 유지(Task E3 선례)

### 애니메이션
- 3개 파일 모두 `width`/`height` 트랜지션(진행바) 대상 코드 없음 — 해당 없음

### 접근성
- 아이콘 전용/장식 아이콘에 `aria-hidden="true"` 부여
- 클릭 가능한 버튼 전반에 `cursor-pointer` 보강(토글, 쿼터 분리/삭제, 팝오버 버튼 등)
- 편집모드 전환 버튼에 `focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow)]` 추가
- 모달 백드롭(`gamelog` 쿼터 분리 팝오버의 모바일 딤드 오버레이) `onClick`은 SPEC 예외(표준 백드롭 패턴)로 그대로 유지
- 테이블 `overflow-x-auto` 래퍼(roster 엑셀 업로드 미리보기) 보존 확인

### 데이터/로직
- 변경 없음(표현층 className/아이콘/구조만 수정, fetch/이벤트 핸들러/상태관리/조건 분기 그대로)

## 검증
- `npx tsc --noEmit` → 통과 (에러 0건, EXIT_CODE=0)

## 우려 사항
1. **gamelog 이벤트 로그의 쿼터 분리/삭제 아이콘 버튼**(`p-1`, hover 시에만 노출)이 44×44px 히트영역에 못 미침. 초고밀도 타임라인 레이아웃(행당 여백 최소화가 목적)이라 Task E3의 동일 이슈에서와 같이 레이아웃 보존을 우선해 그대로 두었음 — 엄격 적용하려면 이 로그의 행 간격 자체를 늘리는 별도 지시가 필요.
2. gamelog `EVENT_ICONS`의 색상(yellow-400/blue-400/green-400/purple-400/orange-400/red-400)은 테마 토큰이 아닌 고정 tailwind 색으로 남겨, 라이트/다크 모두에서 시각적으로 동일한 색조를 유지함(의도적 — 이벤트 유형 구분용 고정 팔레트).
3. gamelog 쿼터 구분 pill(`Q{n}`)의 강조색을 기존 파랑에서 중립(`--mm-ink`)으로 낮췄음 — 노랑을 시간 코드·분리 버튼 쪽에 이미 쓰고 있어 과도한 노랑 사용을 피하기 위한 판단이나, 리뷰 시 톤이 밋밋하다고 느껴지면 `--mm-yellow-strong`으로 올릴 수 있음.
