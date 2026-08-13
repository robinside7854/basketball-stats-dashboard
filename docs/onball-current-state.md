# 온볼 현재 상태 — 이어서 작업할 때 먼저 읽는 문서

최종 갱신 2026-08-07. 세션이 바뀌어도 여기만 읽으면 이어갈 수 있게 유지한다.
**작업을 마칠 때마다 "다음에 할 일"과 "최근 결정"을 갱신할 것.**

**최근 결정 (2026-08-13, 리그별 PWA 매니페스트 — 아이폰 설치본이 대문에서 멈추던 문제, `master 05355d17`+`09fbd4eb`):**
- ⚠ **iOS 의 "홈 화면에 추가" 웹앱은 사파리와 저장소 파티션이 분리된다**(localStorage·쿠키·SW 별도
  컨테이너). 그래서 `src/lib/lastLeague.ts` + `LastLeagueRedirect`(마지막으로 본 동호회를
  localStorage 에 기억했다가 대문에서 되돌려보내기)는 **iOS 에서 원리적으로 동작할 수 없다** —
  설치본의 첫 실행은 항상 빈 저장소다. 안드로이드 Chrome 은 설치본↔브라우저가 저장소를 공유해
  같은 코드가 동작한다. "안드로이드는 되는데 아이폰만 안 된다"가 정확히 이 차이다.
  **클라이언트 저장소로 이 문제를 다시 풀려고 하지 말 것.**
- 근본 해결: **리그별 매니페스트**. `GET /league/[orgSlug]/[leagueId]/manifest.webmanifest`
  (신규 라우트)를 리그 `layout.tsx` 의 `generateMetadata` 가 `metadata.manifest` 로 링크해 루트
  매니페스트를 덮어쓴다. 설치 시점에 `start_url` 이 그 동호회로 박히므로 iOS·안드로이드 모두 해결.
- **`LastLeagueRedirect` 는 남겨 뒀다** — 대문으로 직접 들어온 사용자에겐 여전히 유효하다.
- 이름 정책: `name='온볼 — <동호회명>'` / `short_name='<동호회명>'` — "앱 정체성은 온볼 하나"는
  유지하고 홈 화면 라벨만 동호회명. iOS 가 `apple-mobile-web-app-title` 과 `short_name` 중 무엇을
  쓰는지 버전마다 달라 리그 레이아웃에서 `appleWebApp.title` 도 같은 값으로 맞췄다.
  ⚠ **Next 는 `appleWebApp` 을 필드 단위로 통째 덮어쓴다** → 반드시 `appleWebAppMetadata()`
  (`src/lib/pwa/appShell.ts`)로 전체를 재구성할 것. 직접 객체를 쓰면 iOS 런치 스플래시가 조용히 사라진다.
- ⚠ **`start_url` 에 UUID 를 박지 말 것.** 미들웨어가 slug→UUID 로 internal rewrite 하므로
  `params.leagueId` 는 UUID 지만 주소창은 slug 다 → DB 의 `leagues.org_slug`/`slug` 로 주소창과
  같은 경로를 만든다(`resolveLeagueAppIdentity`).
- `scope: '/'` 명시 — 기본값(start_url 의 디렉터리)이면 리그 밖 링크에서 설치본을 벗어나 브라우저로 튕긴다.
- 비공개 리그는 이름을 '온볼' 로 중립화(매니페스트는 쿠키 없이 요청될 수 있다). start_url 은 요청자가
  이미 아는 경로라 새는 정보가 없다.
- 프로덕션 실측: 리그 매니페스트 **200** (`start_url=/league/miracle/2026`), 리그 페이지의
  `<link rel="manifest">` **1개**(리그 매니페스트만), 루트 `/` 는 여전히 `/manifest.webmanifest`,
  없는 리그는 **404**, iOS 런치 이미지 24개 유지.
- **아이폰 사용자 안내: 기존 바로가기는 지우고 다시 추가해야 한다.** start_url 은 설치 시점에
  복사되므로 이미 설치된 바로가기는 계속 대문으로 열린다.

**최근 결정 (2026-08-11, 구조 정리 — 스플래시·공지·미사용 코드 제거, `master b70f8a5d`):**
- **앱 진입 스플래시 삭제.** 세션당 **2.57초** 동안 화면을 덮고 있었다(애니메이션 1.75s + 대기 0.3s
  + 페이드 0.52s). 데이터가 준비돼도 그만큼 기다려야 했다 — 체감 속도의 가장 큰 원인이었다.
  ⚠ `src/lib/pwa/appShell.ts` 의 iOS OS 런치 스크린은 **별개 기능이라 살아 있다**. 혼동 금지.
- **공지(announcements) 기능 폐지.** 공지 3건·댓글 3건, 마지막 작성 2026-08-03.
  화면 7 · lib 3 · API 5 · 아카이브 페이지 삭제. **패키지 12개가 함께 빠졌다** —
  tiptap 8종(편집기 448KB) · react-markdown+remark-gfm+rehype-raw(320KB) · marked.
  ⚠ 마크다운 처리기가 두 벌(`marked` 서버 · `react-markdown` 화면) 있었는데 **둘 다 공지 전용**이라
  "통합"이 아니라 제거로 끝났다. 다시 마크다운이 필요하면 하나만 새로 고를 것.
  ⚠ **푸시는 유지**했다 — 공지 작성 시 자동 발송 경로는 사라졌고 수동 발송만 남았다(구독자 1명).
- **호출부 0건 정리**: API 6종(standings·highlights/player·schedule-dates/auto·badges/recompute·
  draft-portal·admin drafts/start) · import 0건 파일 13개. ⚠ `api/cron/*` 2개는 vercel.json 이
  시간 맞춰 부르므로 **코드에 호출부가 없어도 삭제 금지**.
- **AI 프로필 사진을 어드민 전용으로.** 무인증이 아니라 `canEditLeague`(= PIN 통과)였다.
  호출당 과금되는 기능을 공유 4자리 PIN 에 맡길 수 없어 `isIdentifiedAdmin`(어드민 세션 ∥ CEO)으로
  좁혔다. 이 함수는 계정 라우트의 로컬 함수였던 것을 `src/lib/auth/identifiedAdmin.ts` 로 올렸다.
  ⚠ **계정 체계가 없는 대회 전용 팀(파란날개)은 이 기능을 못 쓴다** — `canEditTeam()` 도입 때 함께 풀 것.
- 결과: 패키지 36 → 24개 · 번들 6.7MB → 5.9MB · 코드 약 2,900줄 감소.
- ✅ **마이그레이션 094·095 적용 완료**(2026-08-13, 사용자 승인) — `league_columns`(4) ·
  `league_announcements`(3) · `league_announcement_comments`(3) 삭제. 표 35개 남음.
  ⚠ 실행 전 세 표의 전 행을 `supabase/backups/2026-08-11-dropped-tables.json` 에 떠 뒀다.
  Supabase 백업은 **새 프로젝트로만** 복원되므로 되살릴 일이 생기면 이 파일이 가장 빠른 경로다.

**최근 결정 (2026-08-11, 개인특성 배지 14종 재정의 + 리그 화면 노출, `master fa9f6210`):**
- **`src/lib/badges/traitBadges.ts` 가 정본이다.** 옛 `src/lib/stats/badges.ts`(19종)는 **레거시 트리
  전용**으로 남아 있다 — 리그 트리는 새 파일만 쓴다. 두 곳을 같이 고치지 말 것.
- 19종 → **14종**. 삭제 5종: Mr.Clutch(리그가 쿼터를 안 찍어 판정 불가)·동호회커리(기준 3P% 30%
  > 리그 최고 28.3%)·강심장·올라운더·극한의효율충("적게 쏘고 못 넣는 선수"가 동메달을 받는 역전).
- **판정 방식이 바뀌었다: 팀 평균 배수 → 모집단 안 상위 백분율**(금 10%·은 20%·동 30% 누적).
  배수 방식은 팀 평균이 작은 지표에서 사다리가 뒤집혔다(블록 팀평균 0.1 → 골드 5명 > 브론즈 1명).
  ⚠ **순위 기반이라 선수 한 명만 떼어 평가할 수 없다** — `evaluateTraitBadges(전원)` 형태이고
  API 도 리그 전체를 한 번에 계산해 캐시한다.
- ⚠ **"평균"은 경기당이 아니라 라운드(하루)당이다.** 하루 9경기 중 여럿을 뛰므로 값이 크다
  (수비리바 1위 17.24/R). 화면에는 반드시 `/R`·"라운드(하루)당"으로 표기한다.
- 슛 유형 배지(골밑파괴자·피니셔·미드레인지)는 **그 유형 비중 상위 50%** 가 모집단, 순위는 성공률.
- 결과: 배지 보유 29/37 → **33/37명**, 0개 8명 → **4명**(전원 3라운드 이하 = 표본 부족),
  최다 보유 30개 → 10개. 노출 위치는 선수 상세 모달 '배지' 탭과 `/me`.
- 남은 판단은 계획서 `docs/superpowers/plans/2026-08-11-gamification.md` 참조
  (누적·개인기록 축, 팀별 커스터마이징).

**최근 결정 (2026-08-10, 매거진 VOL 자동 채번 + 3팀 대진 자동 편성, `master 771c7479`):**
- **라운드 전수 마감 → 기록 화면에 "VOL.N 카드 준비됨" 안내** + 카드 생성기 바로가기.
  VOL 은 표 없이 완료 라운드 목록에서 계산한다(`src/lib/social/volume.ts`, 마이그레이션 없음).
  ⚠ **완료 라운드는 30회가 넘는데 최신 발행본이 VOL.3** — 매 라운드 발행해 온 게 아니라 최근에
  시작한 것이다. "라운드당 +1"은 앞으로의 규칙이지 소급 규칙이 아니라서, 기준일(2026-08-08=VOL.3)
  이전 라운드와 앞선 라운드가 미완료인 미래 라운드는 **번호를 만들지 않고 빈칸**으로 둔다.
  기준이 어긋나면 `volume.ts` 상단 두 상수만 고친다(화면 입력란도 살아 있음).
- **3팀 대진 자동 편성**(`src/lib/league/rotation.ts` + 기록 화면 "대진 자동 채우기").
  1경기는 현장 가위바위보라 수동, 2~9경기는 **승자 잔류 + 2연속 뛰면 강제 휴식**으로 확정된다.
  매 경기 한 팀만 바뀌므로 2연속에 걸리는 팀이 항상 하나 → **1경기 승자만 알면 나머지 8경기가
  승패와 무관하게 정해진다**(W/R → R/L → L/W 3주기). 이미 기록이 시작된 슬롯은 건드리지 않는다.
- **좌우(홈↔어웨이) 원버튼 교체** — 코트 배치가 현장에서 무작위라 규칙으로 맞출 수 없다.
  기록 시작 전까지만 허용(시작 후엔 저장된 점수·이벤트와 어긋난다).

**최근 결정 (2026-08-10, 기록 자동화 1단계 배포 + 영상 자동화 타당성 판정, `master 9aeaa61d`):**
- **배포함**: ① 기록 누락 자동 점검(`src/lib/stats/recordAudit.ts` + `RecordAuditPanel`) — 실패 슛
  뒤 8초 내 리바운드 없음 / 스틸에 TOV 짝 없음 / 60초 넘는 공백 / 2초 내 중복 탭을 "확인 지점"으로
  띄우고 누르면 영상 그 시각으로 점프. 최근 9경기 실측 경기당 1~6곳. ② 이벤트 기반 출전시간 추정
  (`estimateMinutes.ts`) — `league_player_minutes` 2,724행 중 **2,688행(98.7%)이 out_time NULL**
  이라 MIN 이 사실상 0이었다. 스탯 누적 뷰에 MIN 컬럼 신설(추정 섞이면 `*`). 경기당 5~7.6분으로 검증.
  ③ 어시스트·리바운드 후보 버튼을 실제 빈도순 정렬(`/api/leagues/[id]/tendencies`).
- **`verify-scoring.mjs` 기준선을 `date <= '2026-08-04'` 로 못 박았다.** 전 기간 합계를 7114 와
  비교하던 탓에 새 경기를 기록할 때마다 정상 운영인데도 검사가 깨졌다(측정 시점 7346 = 7114 +
  08-08 신규 9경기 232점). 매번 손으로 숫자를 올리면 진짜 사고도 같이 통과한다.
- ⚠ **영상 자동 이벤트 탐지는 현재 방식으로 안 된다 — 재시도 금지.** 실제 경기 영상 3개(라벨 211개)로
  측정: 오디오 onset recall 78~94%지만 **precision 23~32%**(후보 190개 중 진짜 68개), 임계값을
  올려 후보를 라벨 수만큼 줄이면 recall 51%로 붕괴. "성공 슛 직후 환호" 검출은 recall 25~64% /
  precision 7~28%에 지연 추정이 -0.7~9.9초로 요동 = 신호 자체가 없다는 뜻. 촬영이 **반코트 팬**
  방식이라 스코어보드는 화면 밖(사용자가 "보인다"고 한 전광판은 앵글 밖) — 스코어보드 OCR 경로도 폐기.
  카메라 팬 신호만 precision 42~64%로 쓸 만하나 recall 36~52%.
- ⛔ **"환호 크기로 그날의 명장면 TOP3 자동 선정" — 검토 후 사용자 보류.** 탐지가 아니라 순위
  매기기라 오탐 문제는 없었지만, 성공/실패를 소리로 구분할 확률이 **AUC 54.6%**(50%=정보 없음)라
  소리만으로 뽑은 TOP3 **9건 중 3건이 실패한 슛**이었다. 관중이 거의 없어 잡히는 게 환호가 아니라
  탄식·림 튕김·리바운드 다툼이다. "성공 슛으로 거른 뒤 소리로 순위" 안까지 냈으나 사용자가
  **"객관성이 떨어진다"**며 보류했다 — 되살리려면 왜 그 장면이 뽑혔는지 설명 가능해야 한다.
  참고로 베스트샷은 지금 **사람이 핀으로 직접 지정**하는 방식이라 자동 선정 자리는 비어 있다.
- ✅ **건진 것: 기록 지연 ≈ 3초.** 사람이 버튼을 누른 시각이 실제 플레이보다 늦는 정도를 세 영상에서
  일관되게 측정(2.5 / 2.8 / 3.0초). **아직 반영 안 함** — `src/lib/highlights/clip.ts` 의
  `before: 10 / after: 8` 은 감으로 정한 값이라, 이 3초를 반영하면 클립이 플레이 중앙에 온다.
  아래 "다음에 할 일" 참조.

**최근 결정 (2026-08-07, Phase M — 편집 PIN 경로 분리 · 보안 수정, `fix/edit-pin-path-split`):**
- Phase L5 리뷰가 잡은 선재 결함(`GET /api/leagues/[leagueId]` 의 `select('*')` 가 공개 리그에서
  익명 방문자에게도 `edit_pin` 을 실어 보내던 문제)의 **컬럼 노출은 고쳤다**. 화이트리스트로
  `edit_pin` 제외 + 신규 `GET/PATCH /api/leagues/[leagueId]/edit-pin` 전용 엔드포인트(가드: 어드민
  role·리그 PIN·CEO NextAuth 세션 중 하나, 실패 403) + 소비처 2곳(`settings`·
  `admin/leagues/[leagueId]`) 전환. PIN 조회 실패 시 `'0000'` 가짜 기본값을 넣지 않고 입력란을 비운다.
- ⚠ **그런데 Task 5 실측 중 이 수정과 무관한, 더 급한 구멍 2개를 새로 발견했다 — 아직 안 막혀
  있다.** ① NextAuth `auth()` 가 이 환경에서 쿠키 없는 요청에도 세션을 돌려준다(`.env.local` 에
  `AUTH_SECRET`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` 전무 확인, `/admin` 이 무쿠키로 그대로 렌더됨 —
  **프로덕션 env 확인 최우선**). 신규 PIN 엔드포인트가 `auth()` 를 OR 조건으로 쓰다 보니 이 결함을
  그대로 물려받아 실측 결과가 여전히 "익명에게 PIN 노출"이었다(어드민 role·PIN 가드 자체는 정상).
  ② `GET /api/leagues`(목록) 는 가드가 아예 없어 전체 리그를 `edit_pin` 포함해 익명에게 반환한다 —
  단건보다 심각. 둘 다 계획서 범위 밖이라 이번엔 손대지 않고 기록만 함. §10, 아래 "다음에 할 일" 참조.
  상세 재현: `.superpowers/sdd/task-M1-report.md`.
- 인접 결함(팀 어드민의 리그 설정 저장이 401 로 실패 + mass assignment)도 **고치지 않고 기록만** —
  권한 설계 결정이라 사용자 확인 필요. 위 "다음에 할 일" 표 참조.

**최근 결정 (2026-08-07, Phase M Task M4 — 브랜치 마무리: 세션 회귀 수정 + 컬럼 REVOKE 마이그레이션):**
- **회귀 수정**: PIN 변경(`savePin`) 성공 후 `sessionStorage` 의 PIN 을 그대로 안 갱신해 이후 이
  세션의 모든 `X-League-Pin` 요청이 403 으로 조용히 실패하던 버그. `LeagueEditModeContext` 에
  `updateStoredPin(newPin)` 을 추가(컨텍스트가 `SESSION_KEY`/`pinVerified` 를 이미 캡슐화하고
  있어 페이지에서 `sessionStorage` 를 직접 만지는 것보다 안전) — `savePin()` 성공 시 호출.
  어드민 role 경로는 `pinVerified` 가 애초에 false 라 no-op, 영향 없음. 안내 문구도 실제 동작
  (즉시 적용)에 맞춰 수정(토스트 + `:477` 설명 문구).
- **`edit_pin` 컬럼 REVOKE 마이그레이션 작성** (`089_revoke_edit_pin_column_select.sql`, **미실행**):
  RLS 는 행 단위라 컬럼을 못 가린다는 것을 실측 확인 — anon 키로 PostgREST 에 직결하면 API
  가드와 무관하게 `edit_pin` 이 새어나간다. 테이블 SELECT 를 회수한 뒤 edit_pin 을 뺀 컬럼만
  재-GRANT 하는 방식으로 작성(컬럼 단독 REVOKE 는 테이블 레벨 grant 에 가려 무효함을 확인하고
  택한 방식). 코드 감사로 edit_pin 읽기/쓰기 경로가 전부 service_role 뿐임과, `middleware.ts`
  의 anon 조회(`leagues?select=id,slug`)가 이 REVOKE 이후에도 안 깨짐을 확인 완료. **사용자
  확인 후 적용할 것** — Write SQL 은 사용자 승인 없이 실행 금지.
- **후속 위험 6건 기록만** (이번 범위 밖, 미수정): 레거시 쓰기 API 무가드 6종(RLS 도 `allow_all_*`
  로 0)·service_role+무인증 라우트 4종·공지 댓글 POST 무가드·PIN 무차별대입 방어 없음·
  `PATCH /api/leagues/[leagueId]` 로 여전히 edit_pin 변경·노출 가능. §10, §7 표 참조.
  상세: `.superpowers/sdd/task-M4-report.md`.

**최근 결정 (2026-08-07, IA 정리 Task 4 — 내 기록 신설 · 라커룸 하차 · 셸 재편):**
- 라커룸(선수 명단·팀 구성)을 상단/하단 탭에서 내렸다. **라우트(`/roster`·`/teams`)는 그대로 살아있다**
  — 명단은 공개 정보이고 다른 화면 다수가 링크한다. 진입점은 신규 `/me`("내 기록") 페이지의
  바로가기와 리그 홈의 "팀 승률" 카드 헤더("팀 명단 →")로 옮겼다.
- 신규 `/league/[orgSlug]/[leagueId]/me` — 기존 `PersonalDashboard`(시즌 요약·랭킹·스트릭·
  마일스톤·하이라이트 CTA)를 그대로 재사용. 비로그인은 `LoginTeaser`(홈 위젯과 달리 닫기 없이
  항상 노출). 그 아래 바로가기(내 하이라이트·팀 명단·팀 구성·드래프트·설정)와 계정
  (라이트/다크·둘러보기·로그아웃)을 배치. "내 하이라이트" 링크가 `useCurrentUser().player_id`
  를 바로 쓰면서 선수 개인 하이라이트 도달 뎁스가 5단계(홈→스탯→리더보드→모달→링크)에서
  3단계(홈→내 기록→내 하이라이트)로 줄었다.
- 상단 바 우측 아이콘 6개→2개(로그인·편집모드만 남김). 유저 칩·로그아웃·접속현황
  (`PresenceIndicator`)·테마 토글·둘러보기(HelpCircle)는 전부 `/me` 로 이동. 좌측에는 리그 이름
  (홈 링크)을 신설(`/api/leagues/{id}` 재사용, CompetitionSwitcher 병합은 이번 범위 밖 — 이월).
- 하단 탭바 더보기 삭제, 5탭 고정: 홈·경기·스탯·하이라이트·**내 기록**(맨 오른쪽, 인스타그램
  프로필 탭과 동일 위치·처리 — 로그인 시 유저 사진, 아니면 lucide `User`). 드래프트·설정은
  하단에서 완전히 빠지고 `/me` 바로가기로만 닿는다.
- 활성 탭 판정: `/roster`·`/teams`(라커룸)는 어느 탭도 아니므로 **홈으로 흡수**, `/draft`·
  `/settings`는 하단 탭에 없으므로 **내 기록으로 흡수** — 탭이 하나도 안 켜지는 페이지가 없게
  했다(사용자가 위치를 잃지 않도록). 데스크톱 TabNav 는 드래프트/설정을 여전히 별도 탭으로
  보여준다(하단만 축소, 상단은 유지).
- `/social`(주간 매거진) 삭제 안 함 — 의도된 은닉 유지(Task 2 결정과 동일).

**최근 결정 (2026-08-07, IA 정리 Task 2):**
- 공지 아카이브(`/archive/announcements`)는 하이라이트 우산에서 홈 우산으로 이동. 하이라이트↔공지
  편도 연결(하이라이트에는 공지 입구가 없었음)을 양방향으로 정리. 홈 탭 활성 판정을 `pathname === base`
  완전일치에서 `pathname === base || pathname.startsWith(`${base}/archive`)` 로 변경(`LeagueLayoutClient.tsx`).
- `/social`(주간 매거진, `src/app/league/[orgSlug]/[leagueId]/social/page.tsx`) — **의도된 은닉.**
  편집 권한자 전용 도구로 보이며 공개 nav 진입점이 0개다. 삭제하지 않는다(컨트롤러 자율 판단,
  `docs/superpowers/plans/2026-08-07-ia-cleanup.md` 참조). URL 을 아는 편집자만 접근.
- `src/app/todo/page.tsx` 삭제 — 농구 도메인과 무관한 범용 로컬스토리지 투두 앱(개발 스캐폴딩 잔재).
  하드코딩 hex(`#0D9488` 등)·영문 UI·mm 토큰 미사용, 코드베이스 어디서도 링크되지 않음(grep 확인).

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
| 높음 | **하이라이트 클립에 기록 지연 3초 반영** | `src/lib/highlights/clip.ts` 의 `before/after` 는 감으로 정한 값이다. 2026-08-10 측정으로 라벨이 실제 플레이보다 약 3초 늦는 것이 확인됐으므로(영상 3개 일관), 클립 중심을 `ts − 3` 으로 옮기면 지금보다 정확히 맞는다. 기존 클립 전체의 체감 품질이 걸려 있어 사용자 확인 후 적용 권장 |
| 중 | 리바운드 누락 799건 · STL-TOV 짝 누락 307건 소급 보정 | 새 점검 패널은 앞으로 기록할 경기를 지킨다. 과거분은 경기를 다시 열어 점검 목록을 훑어야 채워진다 — 할지 말지는 사용자 판단 |
| **긴급·사용자** | **Vercel 프로덕션 env 에 `AUTH_SECRET`/`NEXTAUTH_SECRET`·`ADMIN_EMAIL`·`ADMIN_PASSWORD` 실제 설정 확인** | 로컬 `.env.local` 엔 셋 다 없는데, 이 상태로는 NextAuth `auth()` 가 무쿠키 요청에도 세션을 돌려줘 `/admin` CEO 콘솔 전체가 로그인 없이 열린다(2026-08-07 Phase M 실측, dev·prod 빌드 둘 다 재현). 프로덕션에도 없으면 즉시 설정 필요 — 이 환경에선 Vercel 값을 확인할 수 없다 |
| **긴급** | `GET /api/leagues`(목록, `src/app/api/leagues/route.ts`) 가드 전무 | `select('*')` 로 전체 리그를 익명에게 `edit_pin` 포함 반환. 단건(`/api/leagues/[id]`)보다 심각 — 이번 Phase M 은 단건만 고쳤다. 별도 브랜치로 즉시 처리 권장 |
| **긴급·사용자 확인 후 실행** | `089_revoke_edit_pin_column_select.sql` 적용 | RLS 는 컬럼을 못 가려 anon 키로 PostgREST 직결 시 `edit_pin` 이 여전히 새고 있다(API 가드는 전부 우회됨, 실측 확인). 마이그레이션은 작성만 해뒀다 — 사용자 확인 후 `node scripts/db-migrate.mjs up 089` 로 적용할 것(2026-08-07 Phase M Task M4) |
| 높음 | 레거시 쓰기 API 무가드 6종 + RLS `allow_all_*` | `DELETE /api/events`(gameId 하나로 경기 이벤트 전량 삭제)·`DELETE /api/games/[id]`·`DELETE /api/players/[id]`·`POST /api/players/merge`·`DELETE /api/tournaments/[id]`·`POST·PATCH·DELETE /api/minutes`. 대상 5테이블(`game_events`/`games`/`players`/`tournaments`/`player_minutes`) RLS 가 `USING(true) WITH CHECK(true)` 라 DB 방어도 0 (Phase M Task M4 기록, 미수정) |
| 높음 | service_role + 무인증 라우트 4종 | `POST /api/players/upload-photo`(임의 파일 업로드/덮어쓰기)·`POST /api/short-url`(오픈 리다이렉트 가능)·`/api/ai/mvp`(LLM 비용)·`GET /api/debug/player-events`(프로덕션 디버그 노출). service_role 이라 RLS 로 못 막고 라우트 가드가 필요 (Phase M Task M4 기록, 미수정) |
| 중 | PIN 무차별대입 방어 없음 | `POST /api/auth/league-pin`·`POST /api/auth/pin` 에 rate limit·lockout 없음. PIN 4자리(10⁴)라 자동화 공격에 취약 (Phase M Task M4 기록, 미수정) |
| 중 | 공지 댓글 `POST` 무가드 | `/api/leagues/[leagueId]/announcements/[announcementId]/comments` GET 은 `canViewLeague` 인데 POST(댓글 작성)는 가드 없음 (Phase M Task M4 기록, 미수정) |
| 중 | `PATCH /api/leagues/[leagueId]` 로 여전히 `edit_pin` 변경·응답 노출 가능 | 전용 `.../edit-pin` 엔드포인트를 만들었지만 이 범용 PATCH 가 `.update(body)` + `.select().single()` 이라 body 에 `edit_pin` 을 실으면 그대로 바뀌고, 갱신된 행 전체(= edit_pin 포함)가 응답으로 되돌아온다 — PIN 경로 일원화가 반쪽 (Phase M Task M4 기록, 미수정) |
| 사용자 | **도메인 구매** (`onball.app` / `onball.kr`) | 사면 `NEXT_PUBLIC_SITE_URL` 만 바꾸고 재배포. 주소는 이미 `src/lib/siteUrl.ts` 한 곳으로 모아 뒀다. **Vercel 프로젝트 이름은 바꾸지 말 것** — 기존 `.vercel.app` 주소가 죽는다 |
| 중 | 어드민 **계정·접속현황·권한** 화면이 아직 `league_id` 기준 | 형제 대회에서 빈 목록으로 보인다. 회원 기능은 정상 |
| 중 | **팀 어드민의 리그 설정 저장이 401 로 실패** | `PATCH /api/leagues/[leagueId]` 가 NextAuth 전용이라 팀 어드민(회원 role·PIN)은 상태·일정·YouTube·플러스원 나이 저장이 전부 막힌다. 또 `.update(body)` 라 mass assignment 위험. 어느 필드까지 팀 어드민에게 허용할지 사용자 확인 필요(2026-08-07 Phase M Task 4, 기록만 하고 미수정) |
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
  아카이브 이전에 지워진 건은 일일 백업(7일치)으로 되살린다. **어느 복원을 쓸지는 재보고
  정한다** — `created_at` 이 있는 모든 표에서 백업 시각 이후 생긴 행을 세어, 0건이면
  현재 프로젝트 **Restore**(무료·완전·API 키 유지, 수 분 다운타임), 살릴 게 있으면
  **Restore to a new project** 후 `node scripts/restore-game-events.mjs <cloneRef> <gameId>`
  (dry-run) → `--commit` 으로 그 경기만 옮긴다(클론은 시간당 과금이라 끝나면 삭제).
  ⚠ 통째 Restore 는 **백업보다 뒤에 적용한 마이그레이션도 되돌린다** — 복원 후
  `node scripts/db-migrate.mjs status` 로 확인하고 재적용할 것. 실제로 088 이 날아갔다.
- 사고 시각 특정은 Supabase 로그로 한다 — Management API `analytics/endpoints/logs.all` 에
  `iso_timestamp_start/end` 를 **반드시 넣어야** 결과가 나온다(없으면 빈 배열). 보존 1일
- `GET /api/leagues/[leagueId]` 의 `select('*')` 로 `edit_pin` 이 새던 문제는 **컬럼 자체는 고쳤다**
  (2026-08-07 Phase M) — 화이트리스트 컬럼으로 좁혀 `edit_pin` 제외, 신규
  `GET/PATCH /api/leagues/[leagueId]/edit-pin` 전용 엔드포인트로 분리(가드: 어드민 role·리그 PIN
  ·CEO NextAuth 세션 중 하나, 실패 403). 그런데 **실측하다가 이 조치와 무관한 더 큰 구멍 2개를
  발견했다 — 아직 안 막혀 있다:**
  1. **NextAuth `auth()` 가 이 환경에서 쿠키 없는 요청에도 세션을 돌려준다.** `.env.local` 에
     `AUTH_SECRET`/`NEXTAUTH_SECRET`/`ADMIN_EMAIL`/`ADMIN_PASSWORD` 가 전부 없는 상태에서 실측
     (`curl` 무쿠키로 `/admin` 요청) 했더니 CEO 콘솔이 그대로 렌더됐다 — 로그인 없이 `/admin`
     전체가 열려 있다는 뜻. `npm run build && npm run start`(프로덕션 빌드)로도 재현돼 dev 모드만의
     문제가 아니다. 신규 PIN 엔드포인트도 `auth()` 를 OR 조건으로 쓰므로 이 결함을 그대로 물려받아
     **여전히 익명에게 PIN 이 샌다**(단, 어드민 role·PIN 가드 자체는 정상 — 형제 라우트로 확인).
     **Vercel 프로덕션 env 에 이 3개 변수가 실제로 설정돼 있는지 최우선으로 확인할 것** — 로컬에
     없는 것만 확인했고 프로덕션은 이 환경에서 확인 불가하다. 없다면 `/admin` 전체가 지금
     인터넷에 열려 있다는 뜻이라 이 PR 과 별개로 즉시 조치가 필요하다.
  2. **`GET /api/leagues`(목록, `src/app/api/leagues/route.ts`) 는 가드가 아예 없다.**
     `select('*', teams(...))` 로 전체 리그를 익명에게 그대로 반환 — 단건보다 더 심각하다. 계획서
     범위 밖이라 이번엔 손대지 않았다. **별도 보안 수정 필요.**
  상세 재현 로그·curl 응답: `.superpowers/sdd/task-M1-report.md`.
  **이번 범위에서 고치지 않고 기록만 한 인접 결함**: `PATCH /api/leagues/[leagueId]` 가
  `auth()`(NextAuth) 전용이라 팀 어드민(회원 role·PIN)이 리그 설정(상태·일정·YouTube·
  플러스원 나이 등)을 저장하면 401 로 전부 실패한다. 게다가 `.update(body)` 로 body 를
  통째로 써서 mass assignment 위험도 있다(현재는 NextAuth 전용이라 낮지만 가드를 넓히면
  즉시 위험해진다). "팀 어드민이 설정의 어느 필드까지 바꿀 수 있는가"는 권한 설계 결정이라
  사용자 확인이 먼저 필요 — 손대지 않았다.
- **`edit_pin` 은 RLS 로도 못 가린다 — 컬럼 단위 REVOKE 마이그레이션 작성함, 미실행**
  (2026-08-07, Phase M Task M4). `leagues_public_read`/`teams_public_read` 는 `FOR SELECT
  USING (true)` 다 — Postgres RLS 는 행 단위라 컬럼을 못 가리므로, API 가드를 아무리 촘촘히
  깔아도 브라우저 번들의 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 로 PostgREST 에 직결하면
  (`{SUPABASE_URL}/rest/v1/leagues?select=edit_pin`) `edit_pin` 이 그대로 나온다. 이번 브랜치의
  API 계층 차단(select 화이트리스트·전용 엔드포인트)은 전부 우회 가능하다는 뜻 — 실측 확인됨.
  `supabase/migrations/089_revoke_edit_pin_column_select.sql` 에 수정 SQL을 **작성만** 해뒀다
  (테이블 SELECT 회수 후 edit_pin 제외 컬럼만 재-GRANT — 컬럼 단위 REVOKE 단독으로는 테이블
  레벨 grant 에 가려 무효하다는 것까지 실측 확인하고 그 방식을 택함). **아직 실행 안 함** —
  Write SQL 은 사용자 명시 확인 후에만 실행하는 규칙이라, 사용자 부재 중엔 파일만 만들고
  멈췄다. 사용자 확인 후 `scripts/db-migrate.mjs` 또는 SQL Editor 로 적용할 것. edit_pin 을
  읽고/쓰는 모든 서버 경로가 service_role 클라이언트만 쓴다는 것과, `middleware.ts` 의 anon 키
  조회(`leagues?select=id,slug`)가 이 REVOKE 이후에도 그대로 동작한다는 것은 코드 감사로
  확인 완료 — 마이그레이션 파일 상단 주석에 근거를 남겼다.
- **레거시(파란날개) 쓰기 API 가 통째로 무가드다** (2026-08-07, Phase M Task M4 리뷰 발견,
  기록만·미수정). `game_events`/`games`/`players`/`tournaments`/`player_minutes` 5개 테이블
  모두 RLS 정책이 `allow_all_*` `USING (true) WITH CHECK (true)` (전 명령 허용) — DB 계층
  방어가 0 이다. 그 위에서 다음 라우트들이 인증 가드를 아예 안 부른다(코드 감사로 grep 확인):
  `DELETE /api/events`(body 의 `gameId` 하나로 그 경기 이벤트 전량 삭제), `DELETE
  /api/games/[id]`, `DELETE /api/players/[id]`, `POST /api/players/merge`, `DELETE
  /api/tournaments/[id]`, `POST·PATCH·DELETE /api/minutes`. 리그(미라클) 쪽은 088 아카이브
  트리거가 있지만 이 레거시 트리(파란날개)는 `game_events_archive`/`player_minutes_archive`
  로 커버되긴 한다(088 이 두 트리 모두에 건 트리거) — 다만 삭제 자체를 막는 게 아니라 삭제된
  뒤 복구만 가능하다는 뜻이라 근본 해결은 아니다.
- **service_role 을 쓰면서 인증이 없는 라우트 4개** (기록만·미수정): `POST
  /api/players/upload-photo`(임의 파일 업로드·기존 파일 덮어쓰기 가능), `POST
  /api/short-url`(임의 절대 URL 을 단축 — 오픈 리다이렉트로 악용 가능), `GET·POST·DELETE
  /api/ai/mvp`(무제한 호출 시 LLM 비용 소모), `GET /api/debug/player-events`(디버그 엔드포인트가
  프로덕션에 무가드로 노출). service_role 은 RLS 를 우회하므로 이 4개는 RLS 로도 못 막고
  라우트 자체에 가드가 필요하다.
- **공지 댓글 작성이 무가드** (기록만·미수정): `GET
  /api/leagues/[leagueId]/announcements/[announcementId]/comments` 는 `canViewLeague` 로 막혀
  있는데 같은 파일의 `POST`(댓글 작성)는 아무 가드도 안 부른다 — 비공개 리그에서도 댓글을 달 수
  있다는 뜻.
- **PIN 무차별대입 방어 없음** (기록만·미수정): `POST /api/auth/league-pin`, `POST
  /api/auth/pin` 둘 다 rate limit·lockout 이 없다. PIN 이 숫자 4자리(경우의 수 10⁴)라 자동화된
  요청으로 충분히 뚫을 수 있는 범위 — IP/leagueId 단위 시도 횟수 제한이 필요하다.
- **PIN 경로 일원화가 반쪽** (기록만·미수정): 전용 `PATCH /api/leagues/[leagueId]/edit-pin`
  을 새로 만들었지만(Task 2), 기존 범용 `PATCH /api/leagues/[leagueId]` 가 여전히 살아있고
  `.update(body)` 로 body 를 통째로 반영한다 — `body.edit_pin` 을 실어 보내면 그 경로로도
  PIN 이 바뀐다(CEO NextAuth 세션 전용이라 현재 위험도는 낮지만, 의도는 "PIN 은 전용 경로로만"
  이었는데 실제로는 두 경로가 공존한다). 게다가 이 PATCH 는 `.select().single()` 로 갱신된 행
  전체를 응답에 그대로 돌려주므로, `edit_pin` 을 바디에 안 보내도 요청이 성공하면 응답 JSON 에
  현재 `edit_pin` 값이 함께 실려 나온다 — CEO 전용 경로라지만 목적(edit_pin 응답 노출 금지)과
  다시 어긋난다.
