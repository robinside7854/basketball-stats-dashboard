# 미모바스켓 → 온볼 미라클 흡수 계획 (2026-11-09 초안)

원본: `mskim0691/mimobasket-2` (Next.js 16 + Supabase, 자체 이메일 로그인). 이번 달(2026-11) 안에 넘긴다.
**가장 중요한 것 = 포인트 잔액을 1원도 틀리지 않고 옮기기.**

## 1. 운영 규칙 (운영진 확인 2026-11-09)

1. 참가신청은 매주 **월~금** — 경기마다 「참 / 불」 투표.
2. **정규회원도 매주 「참」을 눌러야** 한다(자동 참가 아님).
3. 정원 18명. 정규가 먼저, 남는 자리에 비정규·게스트.
4. **18명을 넘으면 팀장·총무가 회의해서** 7명 이상 팀을 만들지 정한다 → **자동 배정 규칙을 만들지 않는다.** 화면은 「몇 명이 신청했고 그중 정규 몇 · 비정규 몇」을 보여 주고 결정은 사람이 한다.
5. 한 달에 **2회 이상 참가하는 비정규에게 정규회원 신청을 권한다**(정규가 회당 더 싸다: 정규 28,000P/월 · 비정규 12,000P/회).
6. 돈: 카카오뱅크 입금 → 회원이 충전 요청 → 총무(팀 어드민)가 확인·승인 → 포인트 → 정규권/비정규 티켓 구매.

## 2. 미모바스켓 현재 구조 요약

| 미모 표 | 내용 | 온볼로 |
|---|---|---|
| `users` | 이메일 로그인, `point_balance`, `non_regular_ticket_count`, 소개자 | 계정은 `league_user_accounts`, 잔액·티켓은 새 지갑 표 |
| `charge_requests` | 충전 요청(대기/승인/거절) + 텔레그램 알림 | 새 표 |
| `point_transactions` | 충전·차감·환불 장부(잔액 기록) | 새 장부 표 |
| `products` · `purchases` | 월별 정규권 · 비정규 티켓, 취소·환불·무료 지급 | 새 표 |
| `tickets` · `ticket_plans` | 포인트 이전 옛 회원권 | 이관 시 `purchases` 로 합친다 |
| `games` · `game_participants` | 경기, 참가자(누르면 즉시 확정) | `league_schedule_dates` + `league_rsvp`(아래) |
| `game_attendance` | 출석·지각·조퇴·결석 | 새 칸(나중) |
| `month_teams` | 달별 팀·유니폼 색 | **이미 있음**(120·121) |
| 스탯·AI 챗봇·관계도 | — | 가져오지 않음 |

미모 코드에서 **고쳐서 가져올 것**:
- 비정규 티켓 차감이 「읽고 → 빼고 → 쓰기」라 동시에 누르면 덜 빠진다. 취소 복구도 같다. → DB 함수 하나에서 잠금 걸고 처리.
- 비정규 티켓은 숫자 하나뿐이라 언제 썼는지 기록이 없다. → 사용도 장부에 남긴다.
- 회원권 판정이 옛 `tickets` + 새 `purchases` 두 곳. → 하나로.
- 정원·신청 기간·정규 우선이 코드에 없다(총무가 손으로 맞춰 왔다).
- 카카오뱅크 계좌번호가 화면 코드에 박혀 있다. → 리그 설정 값으로.

## 3. 온볼에 이미 있는 재료 (실측 2026-11-09)

- `league_schedule_dates` 에 **`capacity`·`rsvp_closes_at` 칸이 이미 있다**(10/11 폐지한 참여신청의 흔적, 값은 전부 비어 있음).
- **`league_rsvp` 표가 남아 있다** — `schedule_date_id`·`account_id`·`status`·`assigned_team_id`·`note`, 0행. 그대로 다시 쓸 수 있다.
  ⚠ CLAUDE.md 「폐지된 기능」에 참여신청(RSVP)이 있다 — 이번에 **운영진 결정으로 되살리는 것**이므로 그 줄을 같이 고친다.
- 계정 `league_user_accounts`(가입 → 어드민 승인), 게스트 `league_players.is_guest`, 달별 정규 `league_player_months`.

## 4. 새로 만들 것 (설계)

### 4-1. 포인트 지갑 — 장부가 정본
- `league_point_ledger(league_id, account_id, kind, amount, balance_after, memo, ref_type, ref_id, created_by, created_at)`
  `kind` = `opening`(이관 시작 잔액) · `charge` · `purchase` · `refund` · `adjust`(총무 수동 보정)
- 잔액은 계정 행에 `point_balance` 로 두되 **반드시 DB 함수 안에서 장부와 같이** 바뀐다(미모의 `purchase_product_with_points`·`review_charge_request` 방식 그대로 — 그 부분은 잘 짜여 있다).
- `league_point_charge_requests(account_id, amount, status, depositor_name, admin_note, reviewed_by …)` — 입금자 이름 칸 추가(통장 대조용).
- 권한: 승인·보정은 `canEditLeague`(팀 어드민 ∥ CEO). PIN 없음.

### 4-2. 상품·구매
- `league_products(league_id, kind 'regular_pass'|'non_regular_ticket', month, price, is_active)`
- `league_purchases(account_id, product_id, month, price_paid, status active/used/cancelled, acquisition purchase/admin_grant)`
- 비정규 티켓 = 구매 행 1개 = 1회(숫자 대신 행). 쓰면 `used` + 어느 경기인지 기록.

### 4-3. 주간 참가신청
- 일정(토요일)마다 `rsvp_opens_at`(월 00:00) ~ `rsvp_closes_at`(금 23:59), `capacity = 18`.
- 회원 화면: 「참 / 불」 두 버튼. 정규권 없는 사람이 「참」을 누르면 비정규 티켓 1장이 필요하다고 안내.
- 어드민 화면: 신청 명단을 **정규 → 비정규 → 게스트** 순으로, 18명 선을 눈에 보이게. 넘치면 경고만 하고, 확정은 어드민이 누른다(회의 결과 반영). 게스트는 어드민이 직접 추가.
- 확정하면 그 명단이 기록 화면 명단의 출발점이 된다(나중 단계).

### 4-4. 정규 권유
- 이번 달 비정규 참가 2회째에 「이번 달 이미 24,000P — 정규는 28,000P로 남은 경기 모두」 안내.

## 5. 이관 순서 (잔액이 핵심)

1. **준비**: 미모 쪽 Supabase 를 볼 수 있어야 한다 — 지금 우리 연결에는 미모 프로젝트가 없다.
   미모 주인(mskim0691)에게 ① 우리 Supabase 계정 초대, 또는 ② 아래 표를 CSV 로 받기.
   `users`(id·이름·이메일·포지션·point_balance·non_regular_ticket_count) · `point_transactions` 전부 · `purchases`·`tickets`(이번 달·다음 달 유효분) · `charge_requests`(대기 중) · `game_participants`(이번 달 이후 경기).
2. **사람 짝짓기**: 미모 회원 ↔ 미라클 `league_players` 이름 대조표를 만들어 운영진이 확인(동명이인·별명 주의). 미모에만 있는 사람은 선수 + 계정을 새로 만든다.
3. **검산**: 미모 `users.point_balance` 합계 = `point_transactions` 마지막 `balance_after` 합계인지 먼저 맞춰 본다. 다르면 운영진과 정한 뒤 진행.
4. **동결일**: 미모 충전·구매를 멈추는 날을 정한다(대기 중 충전 요청은 미모에서 다 처리하고 넘어간다).
5. **넣기**: 사람마다 `opening` 장부 1줄(= 동결 시점 잔액) + 남은 비정규 티켓 수만큼 구매 행 + 이번 달 정규권 행.
   옛 거래 내역은 「미모 기록」으로 따로 보관(조회용) — 잔액 계산에는 안 쓴다.
6. **대조표**: 사람별 「미모 잔액 / 온볼 잔액 / 차이」 표를 운영진에게 보여 주고 확인받은 뒤 공개. 차이 0 이 아니면 공개하지 않는다.
7. 회원 안내: 첫 로그인 때 「미모바스켓 잔액 N P가 옮겨졌어요」.

## 6. 만드는 순서 (제안)

1. 지갑·충전 요청·어드민 승인 화면 → 이관(잔액만 먼저 정확히)
2. 상품·구매(정규권·비정규 티켓)
3. 주간 참가신청(참/불 · 18명 선 · 어드민 확정)
4. 정규 권유 · 출석 체크

## 7. 운영진에게 물을 것

- 비정규 티켓은 **「참」을 누를 때** 빠지나, **어드민이 확정할 때** 빠지나? (자리가 없어 못 뛰면 돌려주는지) → 권장: 확정할 때.
- 금요일 마감 뒤 취소하면 티켓·정규 출석은 어떻게 하나?
- 정규권을 사면 「달별 정규 멤버」(팀 배정)에도 자동으로 넣나, 팀 배정은 지금처럼 따로 하나? → 권장: 따로(권만 산 사람을 후보로 보여 줌).
- 충전 승인은 총무 한 명인가, 팀 어드민 누구나인가?
- 게스트 비용은 어떻게 받나(포인트 계정 없이 현장 현금?)
