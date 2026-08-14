# 참여신청 + 회비 관리 — 설계

2026-08-14. 사용자 결정: **참여신청 먼저** · 계정 미보유자는 **가입 독려로 해결**(대리 신청 안 함) ·
회비는 **월 정규회원 + 회차별 차등 단가**(단 동호회마다 구조가 다름).

---

## 0. 착수 전에 걸리는 것 — 실측

조사에서 나온 제약이다. 설계보다 이게 먼저다.

| # | 사실 | 영향 |
|---|---|---|
| 1 | **미래 일정이 0개** (마지막 날짜 2026-08-08). `schedule-dates/sync` 가 `while (cursor <= today)` 로 **오늘까지만** 만든다 | 신청을 붙일 대상이 없다. **선행 작업** |
| 2 | 일정 테이블에 `date` 만 있다 (시간·장소·정원 없음) | "몇 시, 어디, 몇 명까지"를 못 적는다 |
| 3 | 출석은 **사후 계산** — 그날 이벤트가 있으면 참여로 인정 (`/attendance`) | 사전 신청은 별개 개념. 기존 출석 로직을 건드리지 않는다 |
| 4 | **푸시 알림 폐지됨** (테이블·컴포넌트 모두 없음) | 마감 리마인더를 보낼 수단이 없다 |
| 5 | 계정 **21명 / 정회원 37명 (57%)** | 사용자 결정: 가입 독려 선행 |

---

## 1. 참여신청 (Phase 1)

### 1-1. 선행 — 미래 일정 생성

`schedule-dates/sync` 에 **앞으로 N주** 생성을 추가한다.

- 현재는 `start_date ~ 오늘`. `오늘 ~ +8주` 를 함께 만든다.
- ⚠ **미실시 자동 판정과 충돌하지 않게** 한다. 지금 판정은 "영상 0 + 기록 0 + 7일 경과"라
  미래 날짜는 애초에 걸리지 않는다. 그대로 두면 안전하다.
- 생성 범위는 상수 하나로 둔다(`FUTURE_WEEKS = 8`). 늘리고 싶어질 때 한 곳만 고친다.

### 1-2. 일정에 붙일 정보

```sql
ALTER TABLE league_schedule_dates
  ADD COLUMN start_time    time,          -- null = 미정
  ADD COLUMN place         text,
  ADD COLUMN capacity      int,           -- null = 무제한
  ADD COLUMN rsvp_closes_at timestamptz;  -- null = 마감 없음
```

전부 nullable 이다. **과거 32개 날짜에 소급 입력을 요구하지 않기 위해서**다.

### 1-3. 신청 테이블

```sql
CREATE TABLE league_rsvp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,
  schedule_date_id uuid NOT NULL REFERENCES league_schedule_dates(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES league_user_accounts(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('going','not_going','maybe')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (schedule_date_id, account_id)
);
```

**`account_id` 로 잡는 이유** — `league_player_id` 로 잡으면 계정 없는 사람 몫을 아무나 넣을 수 있다.
UNIQUE 로 한 사람 한 응답을 못 박는다(중복 신청은 데이터가 아니라 버그다).

**상태를 3종으로 두는 이유** — `going/not_going` 만 두면 "아직 안 정함"과 "불참"이 구분되지 않아,
총무가 **누구를 더 찔러야 하는지** 알 수 없다. 미응답(행 없음)과 `maybe` 도 다른 상태다.

### 1-4. 화면

| 위치 | 내용 |
|---|---|
| **홈 상단 카드** | "다음 경기 · 8/15 (금) 20:00 · 참석 12명" + `참석 / 불참` 버튼 |
| **경기 > 일정** | 날짜별 신청 현황 · 참석 명단 · 내 응답 변경 |
| **총무(어드민)** | 미응답자 목록 |

⚠ **홈 상단에 둔다.** 탭 안에 숨기면 아무도 안 누른다 — 이 기능은 매주 전원이 눌러야 값이 생긴다.

### 1-5. 정해야 할 것 (구현 전)

- **정원 초과** — 선착순 자르기 / 대기 명단 / 표시만
- **마감 후 변경** — 당일 취소가 잦은 게 동호회 현실이다. 막으면 데이터가 실제와 어긋난다
- **알림** — 푸시가 없다. 앱 내 배지로 시작하고, 필요하면 푸시 재도입을 별건으로 판단

### 1-6. 가입 독려 (선행 과제)

사용자가 대리 신청 대신 이 길을 택했다. **참여신청의 성패가 여기 달려 있다.**

- `SignupRateCard` 가 이미 있다 — 가입률 표시 자산을 재사용한다
- 총무 화면에 **미가입 회원 목록 + 가입 링크 공유** 버튼
- ⚠ **체크포인트**: 가입률이 오르지 않으면 총무가 단톡방을 병행하게 되고, 그러면 앱 명단이
  틀린 채 남는다. 출시 전 가입률을 확인하고, 낮으면 대리 신청을 다시 논의한다

---

## 2. 회비 (Phase 2)

### 2-1. 실제 통장 연결 — 하지 않는다

기술 문제가 아니라 **법·책임 문제**다.

| 방식 | 판정 |
|---|---|
| 오픈뱅킹 API | 핀테크 이용기관 등록 필요 — 심사·보증보험·자본요건. 소규모 불가 |
| PG 가상계좌 | **사업자등록증 필수**. 동호회는 대개 미등록 |
| 온볼이 대신 수취 | **전자금융거래법** 자금 수취·보관 이슈. 정산·환불·분쟁 책임이 온볼로 |
| 계좌 스크래핑 | 인증정보 위임 · 약관 위반 · 보안 위험 |

**돈이 플랫폼을 거치는 순간 온볼이 금융 사업자가 된다.** 스탯 앱이 감당할 무게가 아니다.
→ 입금은 **총무 계좌로 직접**, 앱은 **장부**만 맡는다. 지금 하는 포인트 방식의 정식화다.

### 2-2. 요금 구조를 데이터로 둔다

사용자 원문: *"매월 정규회원 신청을 해서 정규회원은 1회당 비용이 조금 더 저렴, 비정규회원은
1회권인 대신 더 비쌈. **다만 대부분의 농구동호회는 월 회비 형태이고 구조는 조금씩 다를 수 있음**"*

⚠ **미라클 방식을 코드에 박으면 다른 동호회를 못 받는다.** 온보딩을 앞두고 있으므로
요금 구조는 반드시 **설정값**이어야 한다.

```sql
CREATE TABLE league_fee_plans (
  id uuid PRIMARY KEY,
  league_id uuid NOT NULL,
  name text NOT NULL,              -- '정규회원' / '1회권' / '월 회비'
  kind text NOT NULL CHECK (kind IN ('monthly','per_session')),
  amount int NOT NULL,             -- 원. 소수 없음
  effective_from date NOT NULL,    -- 금액이 바뀌어도 과거 장부가 흔들리지 않게
  effective_to date
);

CREATE TABLE league_memberships (  -- 월별 정규회원 신청
  league_id uuid, account_id uuid,
  month text NOT NULL,             -- 'YYYY-MM'
  plan_id uuid NOT NULL,
  UNIQUE (account_id, month)
);
```

**`effective_from` 을 두는 이유** — 단가가 오르면 과거 회차 금액까지 바뀐다. 배지 임계값 때와 같은
함정이다. 시점을 남겨야 지난 장부가 고정된다.

### 2-3. 원장

```sql
CREATE TABLE league_ledger (
  id uuid PRIMARY KEY,
  league_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('deposit','charge','expense')),
  account_id uuid,                 -- 입금·차감이면 대상자. 지출이면 null
  amount int NOT NULL,             -- 양수. 방향은 kind 가 정한다
  occurred_on date NOT NULL,
  memo text,
  schedule_date_id uuid,           -- 회차 차감이면 어느 날 경기인지
  created_by uuid NOT NULL,        -- 기록한 어드민. 누가 넣었는지 반드시 남긴다
  created_at timestamptz NOT NULL DEFAULT now()
);
```

**입출금을 한 테이블에 두는 이유** — 투명성의 핵심은 잔액이다. 나뉘어 있으면 "지금 얼마 남았나"를
두 곳을 더해 구해야 하고, 그러면 화면마다 값이 갈린다.

**`balance` 컬럼을 두지 않는다.** 개인 잔액 = 입금 합계 − 차감 합계로 매번 계산한다.
저장하면 언젠가 원장과 어긋나고, 그때 어느 쪽이 맞는지 알 수 없다.

### 2-4. 자동화는 여기까지

총무가 은행 앱 **입금 내역을 붙여넣으면 파싱해 입금자명으로 자동 매칭**한다.
확인·확정은 사람이 한다. 이체 자체는 앱이 하지 않는다.

### 2-5. 두 기능의 연결

참석 확정(`going`) → 회차 차감(`charge`). 단가는 그 사람의 그달 `membership` 이 정한다.
**자동 차감은 기본 끄기**로 둔다 — 취소·노쇼 처리 규칙이 동호회마다 다르고, 돈이 자동으로
빠지면 항의가 온다. 총무가 확정 버튼을 누르는 흐름이 안전하다.

---

## 3. 순서

| 단계 | 내용 | 선행 |
|---|---|---|
| 1 | 미래 일정 생성 + 시간·장소 칼럼 | — |
| 2 | 가입 독려 (미가입 목록 + 링크 공유) | — |
| 3 | 참여신청 (테이블 · 홈 카드 · 일정 상세 · 총무 현황) | 1 |
| 4 | **가입률 확인 후 판단** — 낮으면 대리 신청 재논의 | 2·3 |
| 5 | 회비 요금제 + 원장 | — |
| 6 | 참석 → 차감 연결 | 3·5 |

---

## 4. 자가검토

- **비용**: 신규 테이블 4개(rsvp · fee_plans · memberships · ledger). API 4~5개. 외부 비용 0
- **보안**: 원장은 **돈**이다. 조회는 회원, 기록은 어드민만(`isIdentifiedAdmin`).
  PIN 으로 원장을 쓰게 두면 안 된다 — PIN 폐지 방향과도 맞는다
- **개인정보**: 입금자명은 실명이다. 원장 조회 권한을 회원 전체로 열지, 본인 것만 볼지 정해야 한다
- **위험**: 가입률 57%. 이게 안 오르면 참여신청이 반쪽이 된다 — 4단계 체크포인트가 그래서 있다
