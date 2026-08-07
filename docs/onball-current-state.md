# 온볼 현재 상태 — 이어서 작업할 때 먼저 읽는 문서

최종 갱신 2026-08-06. 세션이 바뀌어도 여기만 읽으면 이어갈 수 있게 유지한다.
**작업을 마칠 때마다 "다음에 할 일"과 "최근 결정"을 갱신할 것.**

---

## 1. 이 서비스가 무엇인가

**온볼(OnBall)** — 농구 동호회에 경기 기록·통계를 제공하는 플랫폼. 각 동호회가 고객이다.
미라클모닝은 서비스를 만들며 테스트한 팀이고, 파란날개가 두 번째 고객이다.

대문(`/`)은 온볼 소개만 보여준다. **동호회 목록을 절대 노출하지 않는다** — 한 동호회
회원이 다른 동호회의 존재를 링크 없이 알게 되면 안 된다는 것이 이 제품의 원칙이다.

## 2. 구조 — 팀이 최상위

```
팀 (teams)
 ├─ 리그  (leagues.mode='league')      내부 인원을 팀으로 나눠 치르는 시즌
 └─ 대회  (leagues.mode='tournament')  외부 동호회와 붙는 대회 묶음
```

- **조직(org) 개념은 폐기했다**(2026-08-06). `orgs` 테이블은 남아 있지만 **읽는 코드가 한
  줄도 없다.** `teams.org_id` 가 NOT NULL 이라 온보딩이 FK만 채운다.
- ⚠ **`org_slug` 하나로 팀을 특정할 수 없다.** 파란날개는 그 값 하나에 팀이 둘이다.
  팀을 다룰 땐 반드시 `teams.id` 를 쓴다. 예전 어드민 API 가 `.eq('org_slug', …)` 로
  수정·삭제해서 두 팀이 한 번에 지워질 뻔했다.
- 명단(`league_players`)과 회원 계정(`league_user_accounts`)은 **팀**에 매달려 있다
  (`team_id`). 그래서 리그↔대회를 오가도 같은 사람·같은 로그인이 유지된다.
- 대회 참가 인원은 `league_player_quarters` 로 대회마다 등록한다(파란날개 방식과 동일).

## 3. 화면 트리가 두 벌이다 (의도된 것)

| | 리그 트리 (현행) | 대회 트리 (레거시) |
|---|---|---|
| 주소 | `/league/[orgSlug]/[leagueSlug]/*` | `/[org]/[team]/*` |
| 테이블 | `leagues` · `league_*` | `teams` · `tournaments` · `games` · `game_events` · `players` |
| 쓰는 곳 | 미라클모닝 | 파란날개 청년부·장년부 |

**합치려다 되돌렸다.** 근거는 `docs/superpowers/specs/2026-08-05-tournament-league-unification-design.md`
상단 메모와 `docs/legacy-migration-notes.md`. 결론: 두 트리는 중복 구현이 아니라 **구조가
다른 별개 제품**이다. **공유하는 것은 용어와 시각 디자인뿐**이다.

- 탭 이름 통일: 하이라이트 · 스탯 · 라커룸 (레거시의 영상·통계·선수를 여기 맞춤)
- 디자인: `mm-*` CSS 토큰. 하드코딩 hex 금지(테마가 뒤집히면 대비가 깨진다)
- 용어: 회원 화면 기준 **리그 / 대회**. "시즌/토너먼트"를 사용자 문구에 쓰지 않는다

**최근 결정 (2026-08-06):** 디자인을 방송 그래픽 톤(900 굵기·대문자·순백)에서 캐주얼 톤(700 굵기·
대소문자 유지·웜 아이보리)으로 전환했다. 데이터 밀도·레이아웃 구조는 무변경, 표면·서체 중량감만
바뀌었다. 정본은 `DESIGN.md`(라이트) / `DESIGN.dark.md`(다크). 전환 전 클래식 버전은 `DESIGN.classic.md`
와 git 태그 `design-classic`(커밋 `b125c284`)로 복원 가능 — 사용자가 원복을 요청하면
`git checkout design-classic -- <경로>` 또는 태그 전체 복원.

## 4. 역할 — CEO와 어드민은 다른 층

| 역할 | 누구 | 어디서 | 인증 |
|---|---|---|---|
| **CEO** | 플랫폼 운영자 = 사용자 본인 | `/admin/*` | NextAuth |
| **어드민** | **각 팀의 운영진**(동호회 총무) | 자기 팀 화면 편집 모드 · 설정 탭 | `league_user_accounts.role='admin'` 또는 팀 PIN |

화면 문구에 "관리자"라고만 쓰지 않는다. 어느 쪽인지 드러나게 쓴다.

## 5. 현재 데이터 (2026-08-06 실측)

| 팀 | 주소 | 리그 | 대회 | 비고 |
|---|---|---|---|---|
| 미라클모닝농구단 | `miracle/main` | 1 (`2026`) | 1 (`2026-tournament`, **비어 있음**) | 리그 트리 |
| 파란날개 청년부 | `paranalgae/youth` | 0 | 8 | 레거시 트리 |
| 파란날개 장년부 | `paranalgae/senior` | 0 | 4 | 레거시 트리 |

- 미라클 기준선: 득점 **7114** · 선수 **45** · `league_teams` **3** · 경기 271(`date <= '2026-08-04'`)
- 파란날개 레거시: 경기 **50** · 이벤트 **5993** · 선수 **68** · 대회 **12**

이 숫자들이 움직이면 뭔가 잘못된 것이다. `node scripts/verify-schema.mjs` 와
`node scripts/verify-scoring.mjs` 가 지킨다 — **작업 끝마다 둘 다 exit 0 이어야 한다.**

## 6. 진행 중 — 미라클 대회 묶음 시험

한 팀이 리그와 대회를 함께 굴리는 구조를 **미라클에서만** 시험 중이다. 대회 묶음
(`2026-tournament`)을 만들어 뒀고 아직 경기가 0건이라 **일반 회원에게는 숨겨져 있다**
(편집 권한자에게만 전환 UI가 보인다).

시험이 잘 굴러가면 다음 후보: 파란날개를 이 구조로 이관 → 레거시 트리 제거.
이관 절차와 함정은 `docs/legacy-migration-notes.md` 에 남아 있다(한 번 완주해 본 기록).

## 7. 다음에 할 일

| 우선 | 항목 | 메모 |
|---|---|---|
| 사용자 | **도메인 구매** (`onball.app` / `onball.kr`) | 사면 `NEXT_PUBLIC_SITE_URL` 만 바꾸고 재배포. 주소는 이미 `src/lib/siteUrl.ts` 한 곳으로 모아 뒀다. **Vercel 프로젝트 이름은 바꾸지 말 것** — 기존 `.vercel.app` 주소가 죽는다 |
| 중 | 어드민 **계정·접속현황·권한** 화면이 아직 `league_id` 기준 | 형제 대회에서 빈 목록으로 보인다. 회원 기능은 정상 |
| 낮 | 세션 옛 쿠키 호환 갈래 제거 | `src/lib/auth/teamMatch.ts`. 2026-09-05 이후(모든 쿠키 만료 뒤) |
| 낮 | 실제 동호회 온보딩 | 스크립트 준비됨. `docs/onboarding-checklist.md` |

## 8. 온보딩 방법

```bash
node scripts/onboard-club.mjs 설정파일.json          # 검증만 (DB 안 건드림)
node scripts/onboard-club.mjs 설정파일.json --commit  # 실제 생성
```

- 샘플: `scripts/onboard-samples/example-club.json`(리그형) / `example-club-tournament.json`(대회형)
- 절차: `docs/onboarding-checklist.md`
- 첫 질문은 **"내부 자체 리그냐, 외부 대회냐"**. 나중에 바꾸려면 이관 작업이 된다
- 어드민 화면의 "팀 만들기"는 아직 501 — 스크립트로만 가능
- 새 동호회에 **AI 프로필 사진 기능을 안내하지 말 것** — 유니폼 색이 노랑/검정 고정이라
  남의 팀 유니폼이 입혀진다

## 9. 이 저장소에서 지켜온 규칙

- 작업 후 `npx tsc --noEmit` → 커밋 → **master push**(Vercel 자동 배포). 배포까지가 한 건이다
- 쿼리 실패를 빈 결과로 삼키지 않는다 — 문맥과 함께 throw. 화면이 멀쩡해 보이는데 숫자만
  틀린 사고가 이 코드베이스에서 반복해서 났다
- 운영 DB다. 시험 데이터를 만들면 지우고, 원상복구를 쿼리로 증명한다
- 검증은 **실패하는 것을 먼저 확인**한 뒤 통과시킨다. 통과만 하는 검사는 아무것도 안 보고
  있을 수 있다
- 마이그레이션은 `node scripts/db-migrate.mjs up NNN` — **번호를 반드시 붙인다**(생략하면
  옛 파일까지 재실행)

## 10. 함정 모음 (실제로 당한 것들)

- `games.team_type` 은 50경기 전부 `'youth'` — 실제 장년부가 14건. **믿으면 안 된다**
- 이벤트를 넣으면 트리거가 경기 점수를 재계산한다. 이관 경기는 상대 득점이 이벤트에 일부만
  담겨 있어 점수가 깎인다 → `league_games.scores_manual` 로 보호
- `.single()` 은 "행 없음"도 에러로 돌려준다. 없음과 장애를 구분하려면 `.maybeSingle()`
- 명단을 `league_id` 로 찾으면 대회 묶음에서 0명이 나온다 → `team_id` 로 찾을 것
- 비공개 리그는 `layout.tsx` 만 막으면 안 된다. page 가 병렬 렌더돼 RSC 청크로 이름이 샌다
  → 각 `page.tsx` 맨 위에서 `isLeaguePrivateGated` 확인 후 fetch
- **기록 화면의 "초기화"는 하드 DELETE 다**(2026-08-07 사고 — 파란날개 아테네전 이벤트 161건
  유실). 마이그레이션 088 이후로는 `AFTER DELETE` 트리거가 `game_events_archive` ·
  `player_minutes_archive`(리그 트리도 동일)에 원본 행을 남긴다. **되살릴 땐 아카이브를 먼저 본다.**
  아카이브 이전에 지워진 건은 일일 백업(7일치)을 **새 프로젝트로 복원**해서 뽑아야 한다 —
  현재 프로젝트에 덮어쓰는 Restore 는 그 시점 이후 작업이 전부 날아가므로 쓰지 않는다.
  절차: `node scripts/restore-game-events.mjs <cloneRef> <gameId>` (dry-run) → `--commit`
- 사고 시각 특정은 Supabase 로그로 한다 — Management API `analytics/endpoints/logs.all` 에
  `iso_timestamp_start/end` 를 **반드시 넣어야** 결과가 나온다(없으면 빈 배열). 보존 1일
