# 레거시 이관 기록 — 단계 B-1 (리그·대회·팀)

대회형(파란날개) → 리그형 통일 계획의 단계 B 중, `scripts/migrate-legacy.mjs --commit` 로
2026-08-05 실제 적용한 내용의 판단 기록이다. 레거시 원본(`teams`/`tournaments`/`games`/`game_events`/
`players`)은 이 단계에서 전혀 쓰지 않았다 — 전부 읽기만 했다.

## 신규 `leagues` 2행

| 팀 | league id | org_slug | slug | mode | edit_pin | 대회 수 |
|---|---|---|---|---|---|---|
| 파란날개 청년부 | `25a02732-26b1-41b0-b070-fd9cd84c4fe9` | `paranalgae` | `youth-2026` | `tournament` | 레거시 `teams.edit_pin` 승계 | 8 |
| 파란날개 장년부 | `ffe7a9df-9b1c-4686-81ef-22d8212c36a6` | `paranalgae` | `senior-2026` | `tournament` | 레거시 `teams.edit_pin` 승계 | 4 |

단계 C(화면 전환)가 `/league/paranalgae/youth-2026`, `/league/paranalgae/senior-2026` 로
리다이렉트를 걸 때 이 두 id·slug 가 필요하다.

## 외부 상대팀 실제 생성 수

- 청년부: `games.opponent` 고유값 31개 → `league_teams(is_external=true)` 31행 신규 생성 (0건 기존 매칭).
- 장년부: `games.opponent` 고유값 12개 → 12행 신규 생성.
- 합계 43행. 이름 중복이 있어도 리그가 다르면 별개 행이다(`(league_id, name)` 단위 유일성) —
  예를 들어 "김포다조은병원"·"닥터바스켓"은 청년부·장년부 양쪽 리그에 각각 존재한다.

## `pana-basket-senior` 스텁을 건드리지 않은 이유

`leagues` 에 이미 `id=76f91f2f-b2bb-441f-ba04-0e666b2c7090`, `org_slug='pana-basket-senior'`,
`slug='2026'`, `status='upcoming'`, `mode='league'` 인 행이 있다. 이번에 실측해 보니 이 행의
`team_id` 가 **바로 이번에 만든 장년부 리그(`senior-2026`)와 같은 레거시 팀
(`194b30d8-d7da-4d5f-8c70-750edbfb563b`, 파란날개 장년부)을 가리킨다.**

건드리지 않은 이유:
1. 이번 태스크(`migrate-legacy.mjs`)의 대상은 `TEAMS` 배열에 하드코딩된 두 레거시 `teams.id`
   뿐이다 — `pana-basket-senior` 는 애초에 `tournaments`/`games` 를 읽어 만든 행이 아니라
   075 마이그레이션이 FK 를 채우려고 미리 만들어 둔 빈 껍데기(하위 데이터 0건, 설계서에
   이미 "스텁"이라 기록됨)라 이관 스크립트의 멱등 판정(`legacy_id`, `(league_id, slug)`)
   대상 자체가 아니다.
2. 이 행을 지우거나 재활용하는 결정은 "리그를 두 벌 만들지 말고 하나로 합칠지, 스텁을
   버릴지"를 정하는 것인데 그건 화면 라우팅(어느 주소가 어느 리그를 가리키는가)과 묶여
   있다 — 스키마/데이터 이관 범위인 이 태스크에서 결정할 사안이 아니라 단계 C(화면 전환)
   에서 리다이렉트 설계와 함께 정할 문제다. 지금 지우면 (혹시 어딘가 이 id 를 참조하는
   코드가 생겼을 경우) 되돌릴 방법이 없어진다 — 이 계획 전체의 원칙("각 단계는 앞 단계를
   되돌리지 않고도 멈출 수 있다")과 어긋난다.
3. 하위 데이터가 0건이라 지금 방치해도 화면·집계 어디에도 영향이 없다(`verify-schema.mjs`
   의 `leagues 가 올바른 팀에 배치됨` 체크가 이 행을 그대로 포함해 통과시키는 것으로 확인됨).

## `/league/paranalgae` 모호성이 단계 C 로 이월됨

위 발견 때문에 파란날개 장년부 팀(`194b30d8-…`) 아래에는 이제 **리그가 2개** 있다:

- `pana-basket-senior` / `2026` — `mode='league'`, `status='upcoming'`, 데이터 0건 (스텁)
- `paranalgae` / `senior-2026` — `mode='tournament'`, `status='active'`, 대회 4·외부팀 12 (이번에 채움)

같은 팀을 두 리그가 가리키므로, 단계 C 가 "레거시 `/paranalgae/senior/*` 주소를 어느 리그로
리다이렉트할지"를 정할 때 자동으로 하나를 고를 수 없다 — 사람이 판단해서 스텁을 지우거나
`mode`/`status` 를 바꾸는 등의 정리가 필요하다. 이 판단을 이번 단계에서 미리 하지 않은
이유는 위 항목과 같다(레거시 원본을 옮기는 것과 화면이 무엇을 보여줄지 정하는 것은 다른
단계다). 청년부는 이런 충돌이 없다 — 기존에 `paranalgae` org_slug 로 청년부를 가리키는
다른 리그가 없었다.

## 멱등성 확인

`--commit` 을 두 번 연달아 실행해 두 번째 실행이 전부 "이미 있음"으로 건너뛰고
(`leagues` 2건, `league_quarters` 12건, `league_teams` 45건 — 우리팀 2 + 외부 43),
`verify-migration.mjs` 가 두 번 다 10건 전부 통과했음을 확인했다(자세한 명령·출력은
`.superpowers/sdd/task-1-report.md` 참고).

## 스키마 보정: `league_quarters_quarter_check` (마이그레이션 084)

이 태스크 도중 실제로 걸린 문제라 함께 기록한다. `--commit` 첫 실행에서 청년부 5번째
대회를 넣다가 `CHECK (quarter BETWEEN 1 AND 4)` 위반으로 멈췄다 — 청년부는 대회가
8개라 한 해(연도 2026 고정)에 4개를 넘는다. `quarter` 컬럼은 076 마이그레이션 주석대로
"미라클 리그의 특이점이지 표준이 아닌" 값이라 대회형에는 실질 의미가 없지만, `NOT NULL` +
`CHECK` + `UNIQUE(league_id, year, quarter)` 는 kind 와 무관하게 테이블 전체에 걸려 있었다.

`supabase/migrations/084_tournament_quarter_check.sql` 로 CHECK 를
`kind <> 'quarter' OR (quarter BETWEEN 1 AND 4)` 로 좁혀, 미라클(`kind='quarter'`)의
1~4 제약은 그대로 두고 대회형(`kind='tournament'`)만 풀었다. `UNIQUE(league_id, year, quarter)`
는 그대로 뒀다 — 대회별 `quarter` 값을 이미 `ord`(대회 시작일 순서, 1~8) 로 서로 다르게
채우므로 유니크 제약과는 애초에 충돌하지 않는다. 프런트엔드 조사 결과 `kind` 로 분기하는
코드가 아직 하나도 없고(단계 C 에서 생길 예정) `quarter` 는 현재 미라클 세그먼트의 정렬·
"N.MQ" 표시·업서트 식별키로만 쓰이므로, 대회형 리그의 `quarter` 값을 완화해도 기존 화면에
영향이 없음을 확인했다.
