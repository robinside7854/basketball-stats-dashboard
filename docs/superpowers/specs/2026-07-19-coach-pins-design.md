# 코치 핀 (수비 장면 큐레이션) — 설계

작성일: 2026-07-19
상태: 승인됨 (구현 계획 대기)

## 배경

수비 장면 하이라이트를 만들고 싶은데, 단순 스탯 기록으로는 드러나지 않는다.
코치가 경기 영상을 다시 보며 "이 장면은 팀원에게 보여주면 좋겠다"고 판단한 지점을
직접 골라 조명하는 과정이 필요하다.

기존 하이라이트는 `game_events`(성공 슛)에서 자동 생성되므로, 득점으로 이어지지 않은
수비 장면은 원천적으로 잡히지 않는다. 코치의 판단이 개입하는 별도 경로가 필요하다.

## 범위

**파란날개(대회) 전용.** 리그(미라클) 쪽은 이번 범위에서 제외한다.
두 시스템은 이벤트 테이블(`game_events` / `league_game_events`)과 인증 방식이 모두
달라 동시 지원 시 구현량이 크게 늘어난다. 대회에서 검증한 뒤 리그로 확장한다.

## 기존 자산 조사 결과

설계에 영향을 준 사전 조사 내용:

- **기존 "베스트샷 핀"(`league_players.pinned_event_ids`)은 재사용 불가.**
  이벤트 UUID를 북마크하는 구조라, 누군가 이미 스탯을 기록한 순간만 가리킬 수 있다.
  임의 시점에 핀을 꽂는 이번 기능과 맞지 않는다. 또한 리그 전용이다.
- **앱 전체에 태그/라벨 시스템이 없다.** 자동완성 컴포넌트도 없다(datalist·combobox 부재).
  초성 검색도 직접 구현해야 한다.
- **`getClipBounds()`(`src/lib/highlights/clip.ts`)가 타임스탬프에서 재생 구간을 계산한다.**
  핀을 `HighlightClip` 형태로 매핑하면 기존 재생·플레이리스트·필터 UI가 그대로 동작한다.
- **대회 mutation API는 서버 인증이 없다.** 편집모드는 클라이언트에서만 가리고,
  `EditModeContext`는 PIN 검증 후 `sessionStorage['edit_mode']='1'`만 남겨 PIN 자체를
  보관하지 않는다. CLAUDE.md는 "PIN 검증은 모든 mutation API의 필수 가드"라고 규정한다.

## 데이터 모델

마이그레이션: `supabase/migrations/068_coach_pins.sql`
(`064`가 중복 사용되어 다음 번호는 `068`)

```sql
CREATE TABLE public.coach_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  video_timestamp double precision NOT NULL CHECK (video_timestamp >= 0),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 20),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX coach_pins_game_ts_idx ON public.coach_pins (game_id, video_timestamp ASC);
CREATE INDEX coach_pins_team_label_idx ON public.coach_pins (team_id, label);
```

### 설계 근거

- **`team_id` 비정규화**: `games → tournaments → team_id` 2홉 조인을 피한다.
  라벨 집계(`GROUP BY label`)와 팀 전체 모아보기가 모두 팀 단위 조회라,
  이 컬럼이 없으면 두 쿼리 모두 매번 조인을 타야 한다.
- **클립 구간 컬럼 없음**: `video_timestamp` 하나로 앞 12초 / 뒤 6초를 계산한다.
  코치는 장면이 끝나는 순간(막았다/뚫렸다)에 핀을 꽂게 되므로 앞쪽을 길게 잡는다.
  기존 슛 클립(앞 10초 / 뒤 8초)과 다른 값이므로 `clip.ts`에 코치 핀용 상수를 추가한다.
- **`ON DELETE CASCADE`**: 경기가 지워지면 핀도 함께 지운다. 고아 레코드 방지.

## API

모두 신규. 대회 스코프.

| 메서드 | 경로 | 인증 | 설명 |
|---|---|---|---|
| GET | `/api/pins?gameId=` | 없음 | 경기별 핀 목록 (시간순) — 리뷰 페이지 |
| GET | `/api/pins?org=&team=` | 없음 | 팀 전체 핀 — 모아보기 |
| GET | `/api/pins/labels?org=&team=` | 없음 | 라벨 후보 (DISTINCT + 사용횟수 내림차순) |
| POST | `/api/pins` | **팀 PIN** | 핀 생성 `{gameId, videoTimestamp, label}` |
| PATCH | `/api/pins/[id]` | **팀 PIN** | 라벨 수정 `{label}` |
| DELETE | `/api/pins/[id]` | **팀 PIN** | 핀 삭제 |

읽기는 공개(핀은 즉시 공개), 쓰기는 PIN 검증.

## 인증

대회 쪽에 서버 PIN 검증이 없으므로 새로 만든다.

1. **`src/lib/teamPinAuth.ts` 신설** — `verifyTeamPin(req, org, team)`.
   `X-Team-Pin` 헤더를 `teams.edit_pin`과 대조. 리그의 `src/lib/leaguePinAuth.ts`와 같은 구조.
2. **`EditModeContext` 수정** — PIN 검증 성공 시 PIN을 `sessionStorage`에 보관하고,
   `teamHeaders` (`{'X-Team-Pin': pin}`)를 컨텍스트로 노출.
   리그의 `LeagueEditModeContext.leagueHeaders`와 동일한 패턴.

`EditModeContext`는 대회 편집 흐름 전반이 쓰는 공유 컴포넌트다. 수정 후
**기존 편집 진입/해제가 정상 동작하는지 회귀 확인이 필요하다.**

기존 대회 API들(`/api/events` 등)에 PIN 가드를 소급 적용하는 것은 이번 범위 밖이다.
다만 `verifyTeamPin`이 생기면 나중에 붙이기 쉬워진다.

## 화면

| 경로 | 역할 | 접근 |
|---|---|---|
| `/[org]/[team]/review` | 핀 꽂기 | 편집모드 전용 |
| `/[org]/[team]/pins` | 모아보기 | 공개 |

### 리뷰 페이지 (`/review`)

```
[대회 ▾] [경기 ▾]                          핀 목록 (시간순)
┌────────────────────────┐    ─────────────────
│      YouTube (크게)     │    04:12  필스위치   ✕
└────────────────────────┘    07:33  헬프로테이션 ✕
 ←5초  [핀 꽂기]  5초→          11:08  스위치 미스  ✕
```

- **핀 꽂기** → 영상 자동 일시정지 → 라벨 입력창(초성 자동완성) → 저장 → 재생 재개
- 키보드: `←/→` ±5초, `Shift+←/→` ±10초, `Space` 재생/정지
  (대회 기록 페이지에 이미 적용된 패턴을 그대로 재사용)
- 핀 목록 항목 클릭 → 해당 지점으로 seek
- 편집모드가 아니면 PIN 입력 안내 화면 (기록 페이지와 동일한 게이트 패턴)

### 모아보기 (`/pins`)

핀을 `HighlightClip` 형태로 매핑해 기존 컴포넌트를 재사용한다:
`HighlightsPlayer` / `HighlightsPlaylist` / `HighlightsFilterBar`.

- 필터 축: **라벨**, 경기(상대)
- 직전 작업에서 넣은 교차 필터링(자기 축 제외 개수 계산 + 0개 칩 회색 비활성)이
  그대로 적용된다.
- 매핑 시 `shot_type`에는 라벨을 넣지 않는다. 라벨은 별도 필터 축으로 다룬다.

## 초성 자동완성

라벨 입력창에서 `ㅍ` 입력 → `필스위치` 추천.

### 알고리즘

한글 음절은 유니코드 `AC00`~`D7A3`에 배열되어 있고, 초성 인덱스는
`Math.floor((code - 0xAC00) / 588)`로 구한다.

```
CHOSUNG = [ㄱ ㄲ ㄴ ㄷ ㄸ ㄹ ㅁ ㅂ ㅃ ㅅ ㅆ ㅇ ㅈ ㅉ ㅊ ㅋ ㅌ ㅍ ㅎ]

'필스위치' → 'ㅍㅅㅇㅊ'

query 'ㅍ'    → 초성 문자열 prefix 매칭 → 히트
query 'ㅍㅅ'  → 초성 문자열 prefix 매칭 → 히트
query '스위'  → 일반 부분문자열 매칭   → 히트
```

- 질의가 **전부 초성 문자**면 초성 매칭, 아니면 일반 부분문자열 매칭.
- 한글이 아닌 라벨(영문·숫자)도 일반 매칭으로 자연스럽게 처리된다.

### 후보 출처

별도 라벨 테이블을 두지 않는다.

```sql
SELECT label, count(*) AS n
FROM coach_pins
WHERE team_id = $1
GROUP BY label
ORDER BY n DESC, label ASC
```

많이 쓴 라벨이 위로 온다. 라벨 목록은 페이지 진입 시 한 번 받아 클라이언트에서
필터링한다(라벨 수가 수백 개를 넘길 일이 없다). 타이핑마다 서버를 때리지 않는다.

### 배치

`src/lib/hangul.ts` — 순수 함수 `toChosung(s)`, `matchesLabel(query, label)`.
UI와 분리해 단독 테스트 가능하게 한다.

## 의도적으로 뺀 것 (YAGNI)

| 뺀 것 | 이유 |
|---|---|
| 핀에 선수 연결 | 팀 수비 개념이라 불필요. 필요해지면 nullable 컬럼 하나로 추가 |
| 라벨 외 부연 메모 | 라벨 + 영상이면 교육 목적에 충분 |
| 핀당 라벨 여러 개 | 자동완성 요구가 단일 라벨 전제 |
| 초안/공개 구분 | 핀은 꽂는 즉시 공개로 결정 |
| 클립 시작/끝 직접 지정 | 고정 길이(앞 12초/뒤 6초)로 충분 |
| 리그(미라클) 지원 | 대회에서 검증 후 확장 |

## 검증 방법

이 프로젝트에는 테스트 프레임워크가 없다. CLAUDE.md도 `tsc`를 마지막 안전망으로
규정한다. 이 기능도 대부분 자동 테스트로 보장되지 않는다는 점을 명시해 둔다.

- **`src/lib/hangul.ts`는 예외** — 순수 함수이고 가장 버그가 나기 쉬운 지점이라
  최소한의 테스트를 붙일 가치가 있다. 러너가 없으므로 `node --test`로 실행 가능한
  단일 파일 테스트를 둔다(의존성 추가 없음).
- 그 외: `npx tsc --noEmit` + `npx eslint` + `npm run build` 통과.
- 수동 확인: 핀 생성/수정/삭제, 초성 자동완성, 모아보기 필터,
  **편집모드 진입/해제 회귀**(EditModeContext 수정 때문).
- 모바일 375px에서 리뷰 페이지 레이아웃 확인(가로 스크롤 없음, 터치 타겟 44px).

## 구현 순서 (개략)

1. 마이그레이션 `068_coach_pins.sql`
2. `src/lib/hangul.ts` + 테스트
3. `src/lib/teamPinAuth.ts` + `EditModeContext` 수정 (회귀 확인)
4. API 라우트 (`/api/pins`, `/api/pins/[id]`)
5. 리뷰 페이지 `/[org]/[team]/review`
6. 모아보기 `/[org]/[team]/pins` (핀 → HighlightClip 매핑)
7. 네비게이션 진입점 추가
