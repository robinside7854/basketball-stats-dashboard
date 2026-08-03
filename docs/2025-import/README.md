# 미라클모닝 2025 시즌 기록 적재

2026부터만 있는 리그 기록에 2025 시즌을 소급 적재하기 위한 파이프라인.

## 왜 이런 방식인가

리그 스탯은 박스스코어 테이블이 아니라 **`league_game_events`(play-by-play)에서 매번 계산**된다
([`src/lib/stats/leagueStats.ts`](../../src/lib/stats/leagueStats.ts)). 어시스트조차 별도 이벤트가 아니라
"성공한 야투 이벤트의 `related_player_id`"로 저장된다.

따라서 2025 박스스코어를 넣으려면 **그 합계와 정확히 일치하는 이벤트 행으로 합성**해야 한다.
그렇게 하면 스탯 · 랭킹 · 시즌하이 · 어워즈 · 기록실이 **코드 수정 없이** 그대로 동작한다.

## 연동 방식

새 리그를 만들지 않는다. 기존 미라클 리그(`leagues.org_slug='miracle'`) 안에
`league_quarters` **year=2025** 행을 추가한다.

- 분기 탭이 `year, quarter` 순으로 정렬되므로 `25.1Q · 25.2Q · … · 26.1Q …` 로 자연스럽게 붙는다
- 선수 ID가 그대로라 커리어 누적 · 마일스톤 · 뱃지가 2025까지 이어진다
- 팀은 2026과 같은 `league_teams` 슬롯을 재사용하고, 2025 팀명은
  `league_team_quarter_overrides`(분기별 팀명/색상)로 표시한다 — 2026이 이미 쓰는 방식

## 사용 순서

```bash
# 1) 빈 템플릿 생성 (이미 만들어져 있으면 생략)
node scripts/2025-import/build-template.mjs

# 2) 사용자가 채워온 파일 검증 (DB에 아무것도 쓰지 않음)
node scripts/2025-import/import-2025.mjs <채운파일.xlsx>

# 3) 검증 통과 후 실제 적재
node scripts/2025-import/import-2025.mjs <채운파일.xlsx> --commit

# 재적재가 필요하면 (2025 분기 경기만 지우고 다시 넣음)
node scripts/2025-import/import-2025.mjs <채운파일.xlsx> --commit --replace
```

`.env.local` 의 `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` 를 사용한다.

## 검증 항목

임포터는 적재 전에 아래를 전부 확인하고, 하나라도 걸리면 중단한다.

- 시트 간 참조 정합성 — 선수명 · 팀명 · (날짜+경기번호)
- 성공 ≤ 시도, 값이 0 이상 정수
- **팀 어시스트 ≤ 팀 야투성공** (어시스트는 동료의 성공 야투에만 붙일 수 있음)
- 선택 입력한 슛존(레이업/미드/포스트) 합계 = 2점 시도/성공
- **합성 이벤트를 `leagueStats.ts` 와 같은 규칙으로 재집계해 원본 시트와 대조** ← 핵심
- 경고(중단 아님): 원본 득점 대조, 시트 팀점수 vs 박스스코어 합

## 이 리그 특유의 계산 규칙

| 항목 | 규칙 | 근거 |
|---|---|---|
| 자유투 | 2점슛 파울 자유투는 **1구 = 2점** (`ft_2pt`) | `LeagueEventInputPad.tsx` `calcPoints` |
| 앤드원 | 슛 성공 + 1점 (`and_one`) | 동일 |
| 플러스원 | 만 50세 이상은 야투 성공 시 +1점 (2점→3점, 3점→4점) | `leagues.plus_one_age=50` |
| 파울 | **기록하지 않음** — 2026 리그에 `foul` 이벤트가 0건 | 넣으면 PIE에서 2025 선수만 불리해짐 |

### 플러스원 함정

`league_games.plus_one_player_id` 가 NULL이면 스탯 계산이 **현재 `league_players.plus_one`**
값으로 폴백한다(2026 경기 253건 중 247건이 NULL). 즉 2025 경기를 넣을 때
"2025 당시 플러스원 대상"이 지금과 다르면 2025 득점이 조용히 틀어진다.

임포터는 템플릿 `[1_선수]` 의 플러스원 표시와 DB 값이 다르면 **오류로 중단**한다.
실제로 달랐던 경우엔 경기별 `plus_one_player_id` 지정이나 스키마 보완이 필요하다.

## 2025에서 비게 되는 것

영상 기반 기능은 원본이 없으므로 채울 수 없다.

- 하이라이트 클립 / 베스트샷 (`video_timestamp` 없음)
- 쿼터별 · 시간대별 분석, 클러치 (러닝 스코어 없음 → 이벤트는 전부 `quarter=1`)
- 출전 시간(MIN), 교체 기록 (`league_player_minutes`)
