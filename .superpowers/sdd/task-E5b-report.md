# E-Task 5b — 기록·로스터 컴포넌트 mm 토큰 전환 리포트

## 대상
- `src/components/record/EventInputPad.tsx`, `LiveStatsPanel.tsx`, `SubstitutionPanel.tsx`, `YouTubePlayer.tsx`
- `src/components/roster/PlayerDetailModal.tsx`, `BadgeMasterbook.tsx`, `PlayerCard.tsx`, `PlayerCompareModal.tsx`, `PlayerMergeModal.tsx`, `HalfCourtChart.tsx`

(스코프 밖: `OpponentYouTubePlayer.tsx` — Task 3에서 이미 처리됨. `league/*` 컴포넌트는 참고만 하고 손대지 않음)

## 선례 확인
직전 커밋 `6d119f49`(Task 5a, `record/roster/gamelog` **페이지** 레벨)와 그 리포트를 먼저 확인해 관례를 재사용:
- 주요 버튼 `bg-blue-600` → `bg-[var(--mm-ink)] text-[var(--mm-panel)]`
- 토글류: 활성 `bg-[var(--mm-ink)] text-[var(--mm-panel)]` / 비활성 `bg-[var(--mm-panel-alt)] text-[var(--mm-muted)] hover:text-[var(--mm-ink)]`
- `text-blue-400`류 액센트 → `text-[var(--mm-yellow-strong)]`
- **이벤트 유형별 고정 색코드(STL/BLK/TOV, 슛 타입 버튼 등)는 SPEC 스코프(gray/blue/slate + yellow-text) 밖이라 유지** — Task 2·5a 선례 그대로 적용
- `league/PlayerQuickViewModal.tsx`의 "mm-brand: 포지션 뱃지도 통일 톤(뮤트 배경 + 잉크 라벨)" 관례를 발견 → PG/SG/SF/PF/C 무지개색 배지를 전부 이 통일 톤으로 교체(PlayerCard, PlayerDetailModal)

## 파일별 변경 요약

### EventInputPad.tsx
- 헤더 "Q{n} 기록 중" 배지(`bg-blue-600/30`) → 노랑 강조(`bg-[var(--mm-yellow-soft)]` 등, gamelog 안내배너 관례)
- "차트 ON/OFF" 토글 → ink/panel-alt 토글 관례, 🎯 → `Target`
- Undo 버튼 → `Undo2` 아이콘 + mm 토큰, 위치피커·어시스트피커 박스 mm 토큰화
- **EVENT_GROUPS의 슛/이벤트 타입별 고정 색(노랑/파랑/보라/청록/초록/보라/남색/빨강)은 그대로 유지** — 라이브 기록 중 유형 구분용 고정 팔레트(Task 5a 선례)

### LiveStatsPanel.tsx / SubstitutionPanel.tsx / YouTubePlayer.tsx
- `bg-gray-900/800` → `mm-panel`/`mm-panel-alt`, `text-gray-*` → `mm-muted`/`mm-ink`, `border-gray-*` → `mm-rule`
- PTS 노랑(`text-yellow-400`) → `mm-yellow-strong` 유지, TOV 빨강은 고정 유지
- SubstitutionPanel: 코트=빨강/벤치=초록 고정 색 그대로, 드래그오버 강조(`bg-blue-600`)만 `mm-ink`로, 교체 확인 모달 mm 토큰화
- YouTubePlayer: URL 미인식 안내의 노랑/파랑 텍스트 → `mm-yellow-strong`

### PlayerCard.tsx / PlayerDetailModal.tsx (포지션 배지)
- `POSITION_COLORS`(PG=파랑/SG=초록/SF=노랑/PF=보라/C=빨강 무지개) → `POSITION_BADGE_CLASS`(뮤트 배경+잉크 텍스트) 단일 톤으로 통일 — league 관례 재사용
- "선출" 배지(`bg-yellow-500 text-black`) → `bg-[var(--mm-yellow)] text-[var(--mm-black)]`

### BadgeMasterbook.tsx
- 전체 진행 바(금/은/동 3구간, `transition-all` + `style={{width}}`) → 트랙에 `relative`, 각 구간을 `absolute` + `translateX`(누적 위치) + `scaleX`(구간 길이) + `transition-transform`으로 전환
- 🥇🥈🥉 → `Medal`(lucide), 색은 `MEDAL_COLOR`(금=`--mm-yellow-strong`, 은=`--mm-muted`, 동=`--color-hoop-orange-600`)로 지정
- 카테고리 헤더 색(공격=orange/슈팅=blue/수비=green/플레이메이킹=purple) 중 **blue만** mm 스코프라 `mm-yellow-strong`으로 전환, 나머지는 고정 유지
- 모달 채도/배경/텍스트 전반 mm 토큰화

### PlayerMergeModal.tsx / PlayerCompareModal.tsx
- 모달 chrome(배경/테두리/텍스트) 전면 mm 토큰화, 파랑 액센트(선택된 카드 강조, 헤더 아이콘, APG 값)는 `mm-yellow-strong`/`mm-yellow-soft`로
- 통합 실행 버튼(빨강, 파괴적 동작)은 고정 유지

### HalfCourtChart.tsx
- SVG 자체(코트 배경 `#0a0f1a`, zone fill/stroke, 핫=초록/콜드=파랑 오버레이, 성공률 텍스트 `fill-white`/`fill-gray-200`)는 **고정 다크 캔버스 데이터시각화**로 판단해 그대로 유지 — zone 사각형 배경이 항상 고정 hex라, 그 위 텍스트를 반전 토큰으로 바꾸면 오히려 한쪽 테마에서 대비가 깨짐
- 🔥/❄️ 이모지만 `Flame`/`Snowflake`(lucide)로 교체 — SVG 내부는 `foreignObject`로 삽입(색은 그대로, "색+아이콘 의미 중복" 요건 충족), 하단 범례 텍스트는 `Flame`/`Snowflake` 아이콘 + 기존 초록/파랑 유지(핫/콜드 의미색이라 스코프 밖)
- 범례의 임계값 텍스트(`text-gray-500/600/700`)만 `mm-muted`로 전환

### PlayerDetailModal.tsx (가장 큼, 1082줄)
- **"NBA 스타일 배너" 섹션(고정 다크 그라디언트 `#070E1A~#0D1A2E` 배경, Awards/Badges/스탯바 서브섹션 포함)은 내부 텍스트를 건드리지 않음** — 배경 자체가 사이트 테마와 무관하게 항상 어둡게 고정 디자인된 카드라, 내부에 반전 토큰(mm-muted 등)을 적용하면 라이트 모드에서 오히려 대비가 깨지는 것을 확인하고 의도적으로 제외. 외곽 테두리(`border-gray-800`→`mm-rule`)만 전환
  - 이 안의 이모지만 교체: 🏅→`Award`, ⚡→`Zap`, 🔥→`Flame`, 📖→`BookOpen`, 🥇🥈🥉→`Medal`(고정 색 유지)
  - "선출" 배지·포지션 배지는 위 통일 관례 적용(자체 배경 있는 pill이라 반전해도 안전)
- 그 외 모든 카드(커리어 하이/공격 스타일/슛 차트/대회별 추이/스플릿/대회별 성적/최근 경기)는 일반 모달 chrome이라 전면 mm 토큰화
- **AST 컬럼(`text-blue-400`)은 전 테이블에서 `mm-yellow-strong`으로 통일** — Task 2 선례("정렬 강조 blue → yellow-strong")를 그대로 적용. STL/BLK/TOV/GmSc 등 다른 스탯 색(초록/보라/빨강/amber)은 스코프 밖이라 유지
- `ShotStyleChart`의 "개별 비율바"(`transition-all` + `style={{width}}`) → 트랙(부모 고정폭) + `scaleX`(자식) + `transition-transform`. 상단 스택바는 `transition` 클래스가 없는 정적 데이터 시각화라 그대로 둠(애니메이션 대상 아님)
- Recharts 인라인 색(Tooltip/CartesianGrid/XAxis/YAxis)의 하드코딩 헥스(`#1f2937` 등) → `var(--mm-rule)`/`var(--mm-muted)`/`var(--mm-panel)`/`var(--mm-ink)` 문자열로 전환(라이트/다크 툴팁 대응). `SHOT_COLORS`/`METRIC_COLOR`(차트 계열색)는 데이터 시각화 팔레트라 유지
- 로딩 스피너 🏀 → `Loader2`(animate-spin)

## 애니메이션
- `width`+`transition-all` 패턴 2곳(BadgeMasterbook 전체 진행바, PlayerDetailModal `ShotStyleChart` 개별 비율바)을 `transform: scaleX()` + `transition-transform`으로 전환. 그 외 정적 width(스택바류)는 애니메이션 대상이 아니라 그대로 둠.

## 접근성
- 장식용 lucide 아이콘에 `aria-hidden="true"` 부여, 아이콘 전용 버튼(닫기 X 등)에 `aria-label` 추가
- 클릭 가능 요소에 `cursor-pointer`, 신규/전환된 토글·버튼에 `focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow)]` 보강
- 모달 백드롭 `onClick={onClose}`는 SPEC 예외(표준 패턴)로 유지

## 데이터/로직
- 변경 없음 — fetch, 이벤트 핸들러, 상태관리, 조건 분기, props 구조 그대로. className/스타일/아이콘만 교체.

## 검증
- `npx tsc --noEmit` → EXIT_CODE=0 (에러 0건)

## 우려 사항
1. `PlayerDetailModal.tsx`의 "NBA 스타일 배너"와 `HalfCourtChart.tsx`의 SVG 캔버스는 의도적으로 고정 다크 색을 유지했습니다. 라이트 모드에서도 이 두 영역만 어둡게 보이는 것은 의도된 디자인 판단(고정 배경 위 반전 토큰을 쓰면 한쪽 테마에서 대비가 깨짐)이지만, 톤이 이질적으로 느껴지면 별도 지시로 재검토 필요.
2. `BadgeMasterbook.tsx`의 세그먼트 진행 바를 겹친 3개 절대배치 요소로 재구성하면서, 기존에 있던 세그먼트 사이 1px 흰 구분선(`gap-px`)이 사라졌습니다(육안상 미세한 차이).
3. AST 컬럼을 전부 `mm-yellow-strong`으로 통일하면서 PTS(같은 색)와 시각적으로 구분이 약해졌습니다 — Task 2의 "blue 액센트 → yellow-strong" 규칙을 기계적으로 전 테이블에 적용한 결과이며, 더 세분화된 팔레트가 필요하면 후속 지시 요망.
