# 미라클모닝 브랜드 스타일 시스템 (E안)

전 페이지 통일 이식용 규칙집. 홈 랜딩(`page.tsx`, `NbaHero`, `NbaRoundsSummary`, `NbaLeaders`)이 레퍼런스 구현.

## 1. 팔레트 — CSS 변수 (`mm-*`)

`globals.css`에 정의됨. `.dark` 클래스 스위칭. 절대 다른 값 사용 금지.

| 변수 | Light | Dark | 용도 |
|---|---|---|---|
| `--mm-ground` | `#FFFEF7` (아이보리) | `#0A0A0A` (검정) | 페이지 배경 |
| `--mm-panel` | `#FFFFFF` | `#171717` | 카드 배경 |
| `--mm-panel-alt` | `#FAF9F5` | `#0F0F0F` | 서브 카드 · 리스트 안 |
| `--mm-ink` | `#0A0A0A` | `#FAFAFA` | 주 텍스트 |
| `--mm-ink-soft` | `#3F3F46` | `#D4D4D4` | 서브 텍스트 |
| `--mm-muted` | `#6B7280` | `#A1A1AA` | 라벨 · 뮤트 텍스트 |
| `--mm-rule` | `#E5E7EB` | `#262626` | 라인 · 카드 border |
| `--mm-yellow` | `#EAB308` | `#FDE047` | 노랑 accent · 강조 배경 |
| `--mm-yellow-strong` | `#A16207` | `#FACC15` | 노랑 accent 텍스트 (검정/흰 배경 위에만) |
| `--mm-yellow-soft` | `#FEF3C7` | rgba(253,224,71,.10) | 노랑 tint · hover |
| `--mm-black` | `#0A0A0A` | `#000000` | 노랑 배경 위 텍스트용 검정 |
| `--mm-live` | `#DC2626` | `#EF4444` | 라이브 · 위험 상태 |

## 2. 색 대비 절대 규칙

**반드시 지킬 것 (위반 시 즉시 수정)**:

- 노랑(`--mm-yellow`) 배경 위 텍스트 = `--mm-black` 또는 `rgba(0,0,0,0.6~1)` **만**
- `--mm-yellow-strong` 은 **검정/흰 배경 위 accent 텍스트로만** 사용. 노랑 배경 위 금지
- 흰(`--mm-panel`) 배경 위 주 텍스트 = `--mm-ink`
- 검정 배경 위 주 텍스트 = `--mm-ink` (자동 흰색 처리됨)
- 뮤트 라벨 최소 대비 4.5:1 확보

## 3. 폰트

`globals.css`에 이미 로드됨:
- `Pretendard Variable` → `--font-sans` 최상위 (본문·UI 기본)
- `Bebas Neue` → `.font-display` 유틸 (스코어보드 큰 숫자)
- `Barlow Condensed` → `.font-jersey` 유틸 (헤드라인 · 대문자 · 저지)

### 사용 규칙
- 본문 · UI · 라벨: 기본 `font-sans` (Pretendard 자동)
- 헤드라인 · 카드 타이틀 · 큰 이름: `font-jersey font-black uppercase`
- 스코어 · 큰 숫자: `font-jersey font-black tabular-nums` 또는 `font-display tabular-nums`
- 작은 uppercase 라벨: `font-bold` 또는 `font-black`, `tracking-[0.16em~0.22em]`

### 사이즈 스케일
- 페이지 헤드라인 h1: `clamp(40px, 6.5vw, 68px)` `font-jersey`
- 섹션 헤드 h3: 28px `font-jersey`
- 카드 타이틀 h4: 22px `font-jersey` uppercase
- 카테고리/서브 라벨: 12~13px `font-bold` uppercase `tracking-[0.16~0.22em]`
- 본문: 15px `leading-relaxed`
- 스탯 큰 값: 32~44px `font-jersey` tabular-nums
- 히어로 킹숫자: `clamp(88px, 15vw, 140px)`

## 4. 카드 · 인터랙션 규칙

### 카드
- 배경 `--mm-panel`
- border 1px solid `--mm-rule`
- padding 넉넉히 (16~20px 이상)
- rounded 최소 (border-radius 0 또는 4px). 지나친 rounded 금지
- hover: `box-shadow: 0 10px 36px -8px rgba(0,0,0,0.20~0.25)` (라이트는 얕게, 다크는 진하게)

### 1위 · 강조 카드
- 배경 `--mm-yellow`
- 텍스트 `--mm-black`
- border 없거나 검정 얇게

### 클릭 가능 요소
- `cursor-pointer`
- hover:
  - 좌측 4px 노랑 accent bar fade-in, 또는
  - 배경 subtle 하이라이트, 또는
  - 텍스트 아래 노랑 underline decoration
- 항상 시각적 힌트 (`→` 화살표 등)

### 상태 배지
- 라이브: `bg-[color:var(--mm-live)] text-white` + `animate-pulse-red` (globals.css)
- 완료: 뮤트 텍스트
- 강조: `bg-[color:var(--mm-yellow)] text-[color:var(--mm-black)]` 작은 padding

## 5. 데이터 강조 톤

- 승자/1위/최고 값: 노랑 배경 카드 또는 노랑 텍스트
- 뮤트 데이터 (2·3위, 참고값): 자연스러운 muted 색
- 양수 차이 (득실차 등): `#059669` (emerald)
- 음수 차이: `#DC2626` (red)
- 무승부/제로: muted

## 6. 실제 사용 예시 (레퍼런스 파일)

- 페이지 컨테이너: `src/app/league/[orgSlug]/[leagueId]/page.tsx`
- 헤로 (좌 검정 · 우 노랑): `src/components/league/nba/NbaHero.tsx`
- 카드 반복 (흰 카드 4개): `src/components/league/nba/NbaRoundsSummary.tsx`
- 리스트 (아바타 + 이름 + 값): `src/components/league/nba/NbaLeaders.tsx`

## 7. 이식 시 원칙

**작업 순서**:
1. 페이지의 최상위 컨테이너 (`<div className="...">`) 를 mm-* 배경으로
2. 헤더 (h1, h2) 를 `font-jersey font-black uppercase` 로
3. 카드 배경/border를 mm-panel/mm-rule 로 통일
4. 라벨 · 서브 텍스트 색을 mm-muted / mm-ink-soft 로
5. 큰 숫자 · 데이터를 `font-jersey tabular-nums` 로
6. 노랑 accent 는 아껴서 사용 (강조가 흩어지지 않게)
7. 클릭 가능 요소에 mm-yellow hover 힌트

**절대 하지 말 것**:
- 팔레트 변수 외 hex/rgb 직접 사용 (예외: 데이터 강조 color emerald/red)
- 노랑 배경 위 노랑 텍스트
- 데이터 로직 · fetch · state · handler 손대기 (스타일만 손댈 것)
- `rounded-2xl`, `rounded-3xl` 남발 (0 or 4px)
- 그라디언트 · 다층 shadow · glow (앞서 걷어낸 AI 티 요소)
- 신규 컴포넌트 · 파일 추가 (기존 파일 스타일만 수정)

**보존할 것**:
- 기존 데이터 fetch, useState, useEffect, onClick, submit 로직
- 기존 접근성 속성 (aria-*, role)
- 기존 반응형 breakpoint (sm:, md:, lg:)
- 로딩 스켈레톤 · 빈 상태 컴포넌트 자체 (스타일만 변경)

## 8. 다크 모드

프로젝트는 next-themes로 `.dark` 클래스 스위칭. `mm-*` 변수가 자동으로 대응하므로 별도 조건 분기 불필요. 다크에 특정 스타일 필요 시 `dark:` prefix 사용.
