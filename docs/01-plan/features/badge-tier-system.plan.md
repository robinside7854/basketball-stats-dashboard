# 뱃지 티어 시스템 (Gold / Silver / Bronze)

## 목표
NBA 2K 방식으로 동일 뱃지를 3등급(금/은/동)으로 나눠 선수 성취도를 더 세밀하게 표현한다.

---

## 1. 핵심 변경 사항

### 1-1. 타입 변경 (`src/lib/stats/badges.ts`)

```ts
// 새 타입
export type BadgeTier = 'gold' | 'silver' | 'bronze' | null

// EvaluatedBadge: earned(boolean) → tier(BadgeTier)
export interface EvaluatedBadge extends BadgeDefinition {
  tier: BadgeTier          // null = 미달성
  achievedValue: number
  tierThresholds: { bronze: number; silver: number; gold: number }
  achievedLabel: string
}
// earned 는 tier !== null 로 계산 (derived)
```

### 1-2. BadgeDefinition 확장

```ts
export interface BadgeDefinition {
  // 기존 필드 유지 ...
  tierThresholds: {
    bronze: number   // 기존 달성 기준
    silver: number
    gold:   number
  }
  tierCriteria?: {  // 단일 threshold가 아닌 복합 조건 배지용 텍스트
    bronze: string
    silver: string
    gold:   string
  }
}
```

---

## 2. 19개 뱃지 티어 기준표

> **기준 원칙**
> - Bronze: 현재 달성 조건 그대로
> - Silver: 기준 대비 약 25~30% 높은 수준
> - Gold: 기준 대비 약 50~70% 높은 수준 (동호회 최상위 1~2명 수준 상정)

### 공격 (5개)

| 코드 | 뱃지명 | 지표 | Bronze | Silver | Gold |
|------|--------|------|--------|--------|------|
| PAINT_BUSTER | 골밑파괴자 | 골밑슛 비중 & 성공률 | 비중≥35% & 성공률≥40% | 비중≥40% & 성공률≥48% | 비중≥45% & 성공률≥55% |
| GLASS_EATER | 로드맨 | OREB/REB% | ≥35% | ≥43% | ≥52% |
| FINISHER | 피니셔 | 레이업 비중 & 성공률 | 비중≥25% & 성공률≥40% | 비중≥30% & 성공률≥50% | 비중≥35% & 성공률≥60% |
| CLUTCH_Q4 | 4쿼터의 사나이 | Q4 margin (Q4avg - max(Q1~Q3)) | margin > 0 | margin ≥ 1.5pts | margin ≥ 3.0pts |
| SCORING_MACHINE | 득점 화신 | PPG / 팀평균 배율 | ≥1.5× | ≥1.8× | ≥2.2× |

### 슈팅 (5개)

| 코드 | 뱃지명 | 지표 | Bronze | Silver | Gold |
|------|--------|------|--------|--------|------|
| JUNG_DAEMAN | 정대만 | 3PA/FGA% | ≥50% | ≥62% | ≥75% |
| DONG_HO_CURRY | 동호회커리 | 3P% | ≥33% | ≥38% | ≥43% |
| ICE_VEINS | 강심장 | FT% | ≥70% | ≥80% | ≥90% |
| MID_MAESTRO | 미드레인지 장인 | 미드 비중 & 성공률 | 비중≥30% & 성공률≥40% | 비중≥33% & 성공률≥46% | 비중≥37% & 성공률≥52% |
| EFFICIENCY_GOD | 효율의 신 | FG% | ≥50% | ≥56% | ≥62% |

### 수비 (4개)

| 코드 | 뱃지명 | 지표 | Bronze | Silver | Gold |
|------|--------|------|--------|--------|------|
| GLASS_CLEANER | 유리청소부 | DREB/REB% | ≥60% | ≥70% | ≥80% |
| PICKPOCKET | 대도 | SPG / 팀평균 배율 | ≥2.0× | ≥2.5× | ≥3.0× |
| SHOT_BLOCKER | 골밑 수문장 | BPG / 팀평균 배율 | ≥2.0× | ≥2.5× | ≥3.0× |
| HUSTLE_KING | 허슬킹 | hustle/G / 팀평균 배율 | ≥1.3× | ≥1.6× | ≥2.0× |

### 플레이메이킹 (5개)

| 코드 | 뱃지명 | 지표 | Bronze | Silver | Gold |
|------|--------|------|--------|--------|------|
| CLEAN_HANDS | 안전운반 | AST/TOV | ≥2.0 | ≥3.0 | ≥4.5 |
| KICKOUT | 킥아웃 전도사 | 3P연결AST% | ≥50% | ≥62% | ≥75% |
| FLOOR_GENERAL | 지휘자 | APG / 팀평균 배율 | ≥1.5× | ≥2.0× | ≥2.5× |
| POCKET_PASSER | 포켓패서 | 골밑연결AST% | ≥50% | ≥62% | ≥75% |
| ALL_ROUNDER | 올라운더 | PPG & RPG & APG / 팀평균 | 모두≥1.0× | 모두≥1.2× | 모두≥1.5× |

---

## 3. 평가 함수 변경

```ts
// 기존
function ok(cond: boolean): boolean

// 변경 후: 복합 조건 없는 단순 지표용
function calcTier(value: number, b: number, s: number, g: number): BadgeTier {
  if (value >= g) return 'gold'
  if (value >= s) return 'silver'
  if (value >= b) return 'bronze'
  return null
}

// 복합 조건(비중+성공률) 배지용
function calcDualTier(
  [v1, v2]: [number, number],
  [b1, b2]: [number, number],
  [s1, s2]: [number, number],
  [g1, g2]: [number, number]
): BadgeTier { ... }
```

---

## 4. UI 변경 목록

### 4-1. BadgeMasterbook 요약 섹션
```
획득 요약: 🥇 2개  🥈 5개  🥉 4개  (총 11/19)
```

### 4-2. 뱃지 카드 티어 스타일
| 티어 | 배경 | 테두리 | 아이콘 뱃지 색상 | 글로우 |
|------|------|--------|-----------------|--------|
| Gold | amber-950/70 | amber-400/80 | 🥇 gold gradient | shadow amber-500/40 |
| Silver | slate-800/70 | slate-400/70 | 🥈 silver gradient | shadow slate-400/30 |
| Bronze | orange-950/60 | orange-700/60 | 🥉 bronze gradient | shadow orange-600/20 |
| 미달성 | gray-900/40 | gray-800/40 | — | 없음, opacity-45 |

### 4-3. 뱃지 아이콘 영역
- SVG 육각형 배지 쉐이프 (이모지 제거)
- 내부: Lucide 아이콘 (카테고리별 매핑)
- 테두리: 티어 색상 stroke
- 획득 시: 티어별 glowing drop-shadow

### 4-4. PlayerDetailModal 뱃지 섹션
- 현재: 이모지 아이콘 나열
- 변경: 작은 육각형 뱃지 + 티어 색상 + 호버 시 툴팁

### 4-5. 카테고리별 획득 바
- 현재: 단순 X/Y 획득
- 변경: gold/silver/bronze 색상 스택 바

---

## 5. 구현 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `src/lib/stats/badges.ts` | BadgeTier 타입, tierThresholds 추가, evaluateAllBadges 로직 변경 |
| `src/components/roster/BadgeMasterbook.tsx` | 티어 요약, 카드 스타일, 육각형 SVG |
| `src/components/roster/PlayerDetailModal.tsx` | 뱃지 표시 티어화 |
| `src/components/badges/BadgeIcon.tsx` | 신규: SVG 육각형 + Lucide 아이콘 컴포넌트 |

---

## 6. 구현 순서

1. `badges.ts` — 타입 + 티어 기준 + 평가 함수
2. `BadgeIcon.tsx` — SVG 컴포넌트 신규 생성
3. `BadgeMasterbook.tsx` — UI 전면 개편
4. `PlayerDetailModal.tsx` — 뱃지 표시 업데이트
5. 호환성 확인 (earned 참조 코드 일괄 교체)

---

## 7. 하위 호환성 주의

`earned: boolean`을 참조하는 곳:
- `BadgeMasterbook.tsx` — 개편 대상이므로 함께 처리
- `PlayerDetailModal.tsx` — 함께 처리
- `src/app/api/ai/mvp/route.ts` — `tier !== null`로 교체 필요

---

*작성일: 2026-04-21*
