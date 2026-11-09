# 리뉴얼 되돌리기 장부 (2026-10-31~)

운영진 결정(2026-10-31): 리뉴얼은 제안대로 전부 진행하되, **마음에 안 드는 것은 나중에 원래대로 되돌릴 수 있게** 한다.
그래서 단계마다 커밋을 하나로 묶고 여기에 적는다. 되돌릴 때는 그 단계의 커밋을 `git revert <커밋>` 하면 된다
(뒤 단계가 같은 파일을 고쳤으면 충돌이 날 수 있다 — 그때는 이 표의 「바뀐 것」을 보고 손으로 되살린다).

- **기준점(리뉴얼 전 마지막 상태)**: `d74d34c` — 이 커밋의 화면이 「원래」다.
  특정 파일 하나만 원래대로: `git checkout d74d34c -- <파일 경로>`
- 지운 화면은 처음엔 **지우지 않고 메뉴에서만 뺀다**(주소로는 열린다). 실제 파일 삭제는 R5 에서 한 번에 한다.

| 단계 | 커밋 | 바뀐 것 | 되돌리면 |
|---|---|---|---|
| R0 | `2bd3016` | 박스스코어 PC 표 열 이름 한글(득점·리바·…·파울), 팀 비교 막대 영어(FG%·3P%·FT%·오펜스/디펜스) → 한글, 팀 비교는 핵심 4줄 + 「N개 항목 더 보기」 | 영어 열 이름 · 12줄 전부 |
| R1 | `6d9d69d` | 홈: 「나」 카드에 득점 순위 고리 + 승패 막대(스틸·블록·3점·야투 글자 줄 삭제) · 그날 팀 결과 글자 → 승패 막대 + 득실 · 순위표의 상대전적 칩 줄 삭제 · 리그 리더 = 부문당 1위 사진 6칸 격자(부문 칩·3줄 목록 삭제, 「최소 N일」은 ⓘ). 박스스코어: 탭 4 → 2(경기결과 · 선수 기록), 팀 비교는 경기결과 아래 막대로, 어시스트는 그 아래 접힘 · 폰 정렬 칩 6개 → 「정렬 ▾」 하나(`ui/SortSelect.tsx`) | 위 각 항목의 이전 모습 |
| R2 | `f7f9890` | 하단·상단 탭 6 → 5: 「스탯」 탭 삭제(선수 탭이 /stats·/teams·/records 에서 켜짐), 「하이라이트」 → 「영상」. 선수 탭 = 명단 + 순위: 「순위 ▾」(득점·리바·어시·스틸·블록·3점·출석·이름) 하나, 사진에 순위 배지, 숫자 하나 크게(자격 밖은 흐리게). 포지션·가입 회원 칩 삭제. PC 에 「표로 보기 →」(옛 스탯 표). API `roster-cards` 에 `line`(하루 평균 6개 + 자격) 추가. 옛 스탯·팀·기록실 화면은 **지우지 않았다**(주소로 열림) | 스탯 탭 되살리기 = `LeagueLayoutClient.tsx` 의 tabs·mainTabs 두 배열 |
| R3 | `9c14b1a` | 선수 카드: 요약 첫 화면 = 6각 능력치 레이더(종전 「더 보기」 안) + 숫자 3칸(득점·리바·어시). 출전일·스틸·블록 칸과 커리어 하이는 요약 「더 보기」 안으로. 탭 4 → 3(「커리어 하이」 탭 삭제 — `PlayerMiniTabs.tsx` 의 목록) | 6칸 숫자 + 레이더는 더 보기 + 커리어 하이 탭 |
| R4 | `f6eb5e3` | 영상 탭: 칩 10 → 5(전체 · 내 클립 · 날짜 ▾ · 선수 ▾ · 더 보기 ▾). 최근 날짜 바로가기 칩 3개 삭제(날짜 시트 안에 있음), 베스트샷·명경기·마일스톤은 「더 보기」 시트로. 명경기 「뽑는 방법」 문단 → ⓘ. 경기 탭: 회원에게 분기 칩·안내 문장·「고정 대관」 숨김, 지난 날짜 카드의 시간·장소·정원 숨김(앞날만) — 운영진 화면은 그대로 | `HighlightsFeedChips.tsx` 의 quickDays·칩 3개, `ScheduleClient.tsx` 의 isEditMode 조건 4곳 |
| R4+ | `778125d` | 운영진 피드백: 선수 탭 기간 「이번 분기/전체」 2칩 → 「기간 ▾」(전체 + 분기마다, `roster-cards?quarterId=`). 홈 리그 리더 6칸 = 득점·리바·**어시·3점 성공(하루 평균 개수)**·스틸·블록(공격 리바운드 뺌) | `NbaLeaders.tsx` 의 CATEGORIES 두 줄 |
| R4++ | `20071ee` | 옛 스탯·팀·기록실 화면 서브탭 맨 앞에 「← 선수」(선수 탭 「표로 보기」로 들어온 뒤 돌아갈 길이 없었다) | `statsTabs.ts` 첫 줄 |
| R4+++ | `5c5f14a` | 선수 탭 순위: 「순위 ▾」 드롭다운 → 필터 칩 12개(출석·득점·리바운드·공격 리바운드·수비 리바운드·어시스트·스틸·블록·턴오버(적을수록 위)·야투율·3점 성공·자유투). 야투율·자유투는 % + 성공/시도, 3점 성공은 하루 평균 개수 + 3점률·성공/시도. 성공률 순위는 스탯 탭과 같은 최소 시도(`roster-cards` 의 fg_ok·ft_ok). 「이름」 정렬은 뺐다 | `PlayersPageClient.tsx` 의 METRICS·CHIP_ORDER |
| R4++++ | `60d8eab` | 선수 탭: 같은 칩 한 번 더 → 정렬 방향 반대(↓/↑ 표시, 순위 번호는 늘 잘한 순, 순위 밖은 늘 뒤) · 「하루 평균 / 누적」 전환(`roster-cards` line 에 누적 합계 추가) · 옛 스탯 표 누적 보기의 야투·3점·자유투 칸 아래에 성공률 % | `PlayersPageClient.tsx` 의 dir·mode, `StatsPageClient.tsx` basicRow 의 % 줄 |
| R4+5 | `1e2c2c3` | 하단·상단 「선수」 → **「기록」**, 서브탭 **리더보드(/stats) · 선수(/players) · 팀(/teams)** (`statsTabs.ts`). 「← 선수」·「표로 보기」 링크는 서브탭이 대신해 뺐다. **기록실(/records)은 운영진 전용** — 「영상」 탭 안 서브탭(`VideoAdminTabs.tsx`, 하이라이트 · 기록실), 회원이 주소로 열면 「운영진 전용」 안내 | `statsTabs.ts`·`LeagueLayoutClient.tsx` 두 배열·`records/page.tsx` 의 isEditMode 분기 |
| R4+6 | `0b6ecd4` | 박스스코어 「경기별 스코어」: 세로로 늘어선 카드 → **3열 바둑판(3×3)** 작은 칸(경기 번호 · 두 팀 색 점·이름·점수, 이긴 쪽 굵게). 칸을 누르면 그 경기 박스스코어가 바둑판 **아래에** 펼쳐지고 그리로 스크롤 | `BoxscoreContent.tsx` 의 `<ol className="grid grid-cols-3">` 블록 삭제 + `games.filter(g => g.id === expandedGame)` → `games` |
| R6 | (이 커밋) | **운영진 삭제 목록 10개(2026-11-02)** — 디자인은 유지(레퍼런스는 운영진이 가져오기로). ① 홈 순위표(`NbaTeamStandings` 렌더) 삭제 — 팀 순위는 「기록 → 팀」 ② 박스스코어 「누가 누구를 도왔나 · 어시스트」 연결 그림(`AssistNetwork`) 삭제 ③ 박스스코어 「이미지 공유」 버튼(`ShareableBoxscore`+html-to-image) 삭제 ④ 선수 비교 기능 전부(스탯 표 체크박스·「선수 비교」 버튼·`PlayerCompareModal` 호출) 삭제 ⑤ 스탯 표 「기본 / 슈팅 / 고급」 세 칸 → 기본에 야투율·3점률·자유투율 열 합침(공리·수리·턴오버도 접지 않고 바로 — 11/3 운영진), TS%·eFG%·2점률은 「고급」으로, 고급은 버튼 하나(「고급 지표」) ⑥ 「숫자 읽는 법」 용어 시트(`StatsGlossarySheet`) 삭제 ⑦ 베스트샷 핀 상한 3개 → **무제한**(서버 폭주 방지 200, 농구공 아이콘에 개수) ⑨ 선수 카드 요약 더 보기의 「리그 통산」 블록 삭제(대회 기록 블록은 그대로) ⑩ 마일스톤 전부 — 영상 탭 「마일스톤」 보기(`?f=milestones` 는 피드 첫 화면으로), /me 「마일스톤 체이서」, 홈 「하이라이트 · 마일스톤 모아 보기」 글자. ⑧ 커리어 하이는 이미 한 곳(요약 더 보기)뿐이라 그대로. 컴포넌트 파일(`AssistNetwork`·`ShareableBoxscore`·`PlayerCompareModal`·`StatsGlossarySheet`·`PlayerMilestoneChart`·`MilestoneFeed`·`NbaTeamStandings`)과 API(`/milestones`·대시보드 `milestoneChasers`)는 **지우지 않았다** | 각 파일에서 「2026-11-02」 주석 자리의 호출을 되살림. 핀 상한은 `pins/route.ts`·`PinBestShotToolbar.tsx` 의 `MAX_PINS` |
| D1 | (이 커밋) | **스킨 교체 「밝고 담백하게」**(운영진 2026-11-03 — 기능·배치 그대로, 겉모양만, 강조색은 노랑 유지): ① 기본 테마 다크 → **밝은 화면**(`layout.tsx` defaultTheme, storageKey `mm-theme-v2` 로 예전 다크 선택 초기화 — 토글로 다시 고를 수 있음, 파란날개도 함께 밝아짐) ② 바탕 웜 아이보리 → 차가운 연회색 #F4F5F7, 글자 무채색 ③ 종이 질감·노란 빛 끔, 그림자 옅게 ④ 모서리 카드 14→16 · 칩 알약→8px ⑤ 좁은 유니폼 글꼴(Barlow·Bebas) → 본문 글꼴 하나 ⑥ 노랑 줄이기: 리더보드 표 머리 노란 바탕 → 연회색, 홈 「이번 분기」 제목의 노란 세로 막대 삭제. 전부 `globals.css` 맨 끝 「스킨 교체 D1」 블록 하나 + 위 두 군데 | 그 블록을 지우고 defaultTheme 을 'dark' 로 · 또는 `git revert <이 커밋>` |
| M1 | (이 커밋) | **폰 화면 개선(2026-11-04 운영진)** — 박스스코어: 누적 순위 줄 두 줄 쌓기·「기록 칸을 누르면 바뀌어요」 안내·DD/TD → 「더블더블」「트리플더블」 칩(불꽃 아이콘). 선수 탭: **폰(640px 미만)은 순위를 목록으로**(순위 · 얼굴 56 · 이름 · 숫자, 사진 카드는 태블릿·PC 그대로), 폰에서 칩 한 단계 작게, 칩 「더블더블」「트리플더블」 추가(하루 합계 기준 날 수). 선수 카드 요약에 더블더블·트리플더블 횟수 칸(0이면 숨김). 리더보드 「고급 지표」에 두 열 | 선수 탭 목록은 `PlayersPageClient.tsx` 의 `isPhone ?` 분기를 지우면 카드로 돌아감 |
| M2 | (이 커밋) | **팀 탭 폰 화면(2026-11-04 운영진)** — 팀별 선수: 정렬 칩 여러 줄 → 「정렬 ▾」 + 높은 순/낮은 순 버튼, 선수마다 카드 한 장(사진 40 · 순위 1~3 금은동), 폰에서는 「선수단 보기」 사진 상자 숨김(줄마다 사진이 있음). 팀 전적 카드 아래 줄 「승률 · N경기」 → 「승률 · N승 N패」, 폰에서 팀 카드를 누르면 상세로 스크롤. 「숫자 읽는 법」 시트 삭제(R6 과 같게) | `teams/page.tsx` 의 StatsTable `md:hidden` 블록 |
| M3 | (이 커밋) | **명단 / 순위 나누기(2026-11-04 운영진)** — 「기록」 서브탭 순서 리더보드·선수·팀 → **명단(맨 왼쪽)·리더보드·팀·기록실(운영진)**. 선수 탭 이름 「명단」, 순위 칩 15개·「하루 평균/누적」 삭제 → 정렬 「이름순·출석순」 + 「기록 순위는 리더보드에서」 링크. 리더보드 기본 표에 「속공」 열(하루 평균·누적). 기록실은 「영상」 탭 서브탭에서 「기록」 탭으로(`VideoAdminTabs.tsx` 삭제) | 순위 칩은 커밋 `bf30f66` 의 `PlayersPageClient.tsx` METRICS·CHIP_ORDER. 탭 순서는 `statsTabs.ts` 한 곳 |
| M4 | (이 커밋) | **리더보드 누적 표 겹침 수정(2026-11-04 운영진 캡처)** — 성공/시도 세 칸 넓게 · 공리·수리는 1280px↑, 「시간」(추정 출전)은 1536px↑ 에서만 · `/` 뒤 줄바꿈 자리 · 모든 `mm-fit` 표에 「넘치면 칸 안에서 접기」 안전장치 | `StatsPageClient.tsx` 의 `colHide`·`slashBreak`, `globals.css` 의 mm-fit 안전장치 한 줄 |
| M5 | (이 커밋) | **경기 탭 폰 화면 + 리더보드 「시간」 열 삭제(2026-11-04 운영진)** — 날짜 카드: 폰은 연도 뺀 짧은 날짜 · 박스스코어 버튼을 카드 맨 아래 꽉 찬 버튼으로 · 팀 줄에 그날 순위 배지(금·은·동) · 「경기별 결과」 펼치기를 버튼 모양으로 · 카드 사이 간격 줄임. 리더보드 누적의 「시간」(추정 출전 분) 열 삭제 | `ScheduleClient.tsx` 의 `formatDateShort`·`DayRankBadge`, 「시간」은 `StatsPageClient.tsx` TOTAL_COLS 한 줄 |
| M6 | (이 커밋) | **영상 탭 폰 화면(2026-11-04 운영진)** — 날짜 카드·「내 클립」 카드: 폰은 왼쪽 작은 썸네일(112px) + 오른쪽 날짜·팀 승패(종전 위에 큰 썸네일 → 한 화면 1~2장), 「경기 영상 N/M」 진행 막대 삭제(숫자만, 폰은 빠진 영상이 있을 때만), 상태 설명 문장은 sm↑ 만. 「NEW」 → 「새 클립」, 베스트샷 빈 화면 문구의 옛 「슬롯(1/2/3)」 → 「농구공 버튼」(핀 무제한) | `highlights/page.tsx` DayCards 의 `flex sm:block`·`w-28`, `MyClipsCard.tsx` 같은 두 곳 |
| M7 | (이 커밋) | **홈 · 나 탭 폰 화면(2026-11-04 운영진)** — 홈: 「이번 분기 리더」 사진 칸 폰은 정사각형(종전 세로 4:5 — 6칸이 화면 세 장), 그날 팀 성적에 1·2·3위 배지(종전 1위 트로피만). 나: 「내 베스트샷 N / 3」 → 「N개」, 「(최대 3개)」 삭제(핀 무제한), 폰 베스트샷 2칸 | `NbaLeaders.tsx` 의 `aspect-square sm:aspect-[4/5]`, `LastRound.tsx` 의 `dayRank`, `PersonalDashboard.tsx` BestShotsCard |
| M8 | (이 커밋) | **팀 탭 「팀 상세 보기」 표시(2026-11-04 운영진 — 누르면 열린다는 걸 모른다)** — 팀 전적 카드 맨 아래 「팀 상세 보기 ▾ / 상세 닫기 ▴」 줄, 「팀 전적」 제목 옆 「팀을 누르면 상세 기록이 열려요」 | `teams/page.tsx` 팀 카드의 마지막 `<button>` · 제목 옆 `<span>` |
| M9 | (이 커밋) | **기록 화면 영상 조작 버튼(2026-11-07 운영진)** — 폰·태블릿(1024px 미만)은 −10·−5·재생·+5·+10 과 재생 속도를 영상 **아래** 두 줄로(종전 영상 위에 떠서 화면을 가림). PC 는 영상 위 그대로, 글자를 진짜 흰색으로(밝은 스킨에서 어둡게 보였다) | `record/_components/VideoColumn.tsx` 의 `lg:contents` 래퍼와 `max-lg:`/`lg:` 클래스 |
| M10 | (이 커밋) | 기록 화면 영상 위 점수판 — 폰·태블릿에서 숨김(같은 점수가 영상 아래 점수줄에 있다) | `VideoColumn.tsx` 스코어보드 `<div>` 의 `hidden lg:block` |
| M11 | (이 커밋) | **기록 화면 선발 고르기 폰(2026-11-07 운영진 캡처)** — 선수 카드: 이름·「게스트」 세로 묶음, 「→ 팀이름」 → 「⇄」 아이콘, 체크칸·글자 키움, 칸 여백 줄임. 영상 아래 재생 속도 4칸 → 폰은 「1×」 한 버튼(누를 때마다 다음 속도)으로 넘기기 줄에 합침 | `StarterSelect.tsx` renderStarterCard, `VideoColumn.tsx` 의 `lg:hidden` 속도 버튼 |
| M12 | (이 커밋) | **흰 팀 색이 안 보이던 문제(2026-11-07 운영진 캡처)** — 팀 비교 막대·대진 선택 점 + 팀 색 점 28곳에 `swatchEdge` 테두리(바탕과 같은 색일 때만) | `lib/util/contrastColor.ts` 의 `swatchEdge` 가 `undefined` 를 돌려주게 하면 전부 원래대로 |
| M13 | (이 커밋) | **말줄임 「…」 전역 금지(2026-11-07 운영진)** — `truncate`·`line-clamp` 를 다음 줄 넘기기로(globals.css 끝 블록), 선수 상세 대회 이름 자르기 삭제, 파란날개 「...」 → 「추가 중」 | globals.css 끝 「말줄임(「…」) 금지」 블록을 지우면 원래대로 |
| M14 | (이 커밋) | **달별 정규 멤버(2026-11-07 운영진 「분기 말고 월 단위로」)** — 표 `league_player_months`(120) · `lib/league/monthlyRoster.ts` · 분기 명단 API `?month=`/`?date=`·PATCH `month`·DELETE `month` · 경기 명단 API 가 경기 달 덮어쓰기 적용 · 기록 화면이 날짜를 넘김 · 명단 편집 「달별 정규 멤버」 패널 | 패널(`MonthlyRosterPanel`)만 빼면 화면에서 사라진다. 표 행을 지우면 분기 소속 그대로로 돌아간다(표가 없어도 코드는 분기 소속으로 동작) |
| M15 | (이 커밋) | **속공에 「상대 득점 뒤 7초」 추가(2026-11-08 운영진)** — `lib/stats/fastBreak.ts`(`isScoreTrigger`·`lastScore`), 캐시 키 리그 스탯 v4 · 박스스코어 v5 · 맞대결 v3 | `fastBreakIds` 의 `afterScore` 줄을 빼면 옛 정의(수비 리바운드·스틸만) |
| M16 | (이 커밋) | **달별 정규 멤버 = 달 칩 + 이름 끌어 옮기기(2026-11-08 운영진)** — `MonthlyRosterPanel.tsx` 다시 씀(분기 고르기·팀 드롭다운 삭제) | 이 파일을 M14 커밋 판으로 되돌리면 드롭다운 화면 |
| M17 | (이 커밋) | **명단 편집 카드 = 「지금 소속」 한 줄(2026-11-08 운영진)** — `RosterEditor.tsx` 분기 칩 줄·분기 칸 팀 고르기(`updateMembership` 등) 삭제, `todayAffiliation` · 이름 줄 flex-wrap | 이 파일을 M16 커밋 판으로 되돌리면 분기 칸 |
| M18 | (이 커밋) | **명단 편집 = 달별 패널 위 · 카드 목록 접음 · 팀장 왕관은 패널에서(2026-11-08 운영진)** — `RosterEditor.tsx`(카드 구역 `<details>`·카드 왕관 표시만) · `MonthlyRosterPanel.tsx`(`leaders`·`onToggleLeader`) | `<details>` 를 벗기고 패널을 카드 아래로 옮기면 이전 배치 |
| M19 | (이 커밋) | **명단 탭 소속팀·+1 · 출석순 기본 · 팀/포지션 필터(2026-11-08 운영진)** — `PlayersPageClient.tsx`(`TeamBadge`·`teamSel`·`posSel`) · `roster-cards` 응답 `team`·`plus_one`·`teams` | 화면 쪽 `TeamBadge` 두 곳과 필터 줄을 빼고 `ORDERS`·기본값을 이름순으로 |
| M20 | (이 커밋) | **리더보드 팀 필터(2026-11-08 운영진)** — `StatsPageClient.tsx` `teamSel`·`teamOptions` | 팀 칩 줄과 `rankPlayers` 의 팀 조건을 빼면 원래대로 |
| M21 | (이 커밋) | **달마다 유니폼 색 · 프로필 사진 네 벌(2026-11-08 운영진)** — 121 · `lib/league/uniformPhoto.ts` · `month-uniforms`·`uniform-photos` 라우트 · 달별 패널 유니폼 고르기 · cron 연결 | 사진을 되돌리려면 `league_players.photo_url` 을 `..._ai.png` 옛 주소로(그대로 보관됨). `applyMonthlyPhotos` 호출 4곳을 빼면 더 바뀌지 않는다 |
| M22 | (이 커밋) | **홈 폰 점검: 승패 막대 무승부 잘림 · 흰 팀 색 막대(2026-11-08)** — `LastRound.tsx`(칸 폭·swatchEdge) · `viz.tsx RecordBar`(최소 폭) | 두 파일의 해당 줄을 이전 커밋 판으로 |
| M23 | (이 커밋) | **리더보드 따라다니는 정렬 줄 + 표로 스크롤(2026-11-08 운영진)** — `StatsPageClient.tsx` `sortBar`·`scrollToList`·`scopeSelect` | `{sortBar}` 를 빼고 `topFiveFooter` 를 이전 판(정렬·범위 고르기)으로 |
| M24 | (이 커밋) | **리더보드 TOP 5 숫자만 · 내 기록 고정은 5위 밖만 · 테두리 강조(2026-11-08 운영진)** — `TopFiveSlot.tsx` · `StatsPageClient.tsx`(`pinBasic`·`pinAdv`·`MINE_OUTLINE`) | 두 파일을 M23 판으로 |
| M25 | (이 커밋) | **턴오버율을 리더보드·팀 탭에 바로(2026-11-08 운영진)** — `advanced.ts tovPct` · `leagueStats.ts tov_pct`(캐시 v5) · `StatsPageClient.tsx` 열·정렬 · `teams/page.tsx` 열·팀 칸 · `glossary.ts` 이름 | 화면의 `tov_pct` 열·칸을 빼면 원래대로(계산 필드는 남아도 무해) |
| M26 | (이 커밋) | **선수 카드 턴오버율·분기별 그림(2026-11-08 운영진)** — detail 라우트 `tov_pct`(값·순위) · `PlayerQuickViewModal.tsx` 요약 한 줄·분기별 막대 · `QuarterTable`/`MonthTable` 폰 줄바꿈 | 요약의 턴오버율 블록과 분기별 `MonthlyStatsChart` 를 빼면 원래대로 |
| M27 | (이 커밋) | **선수 카드 폰 점검(2026-11-08)** — `PlayerTeamLine.tsx` 「지금」 줄바꿈·흰색 팀 띠 · 턴오버율 설명 keep-all · `MonthTable` 폰은 왕관만 | 각 파일 이 커밋 이전으로 |
| M28 | (이 커밋) | **팀 탭 폰 점검(2026-11-08)** — `HeadToHeadBars.tsx` 성공률 두 줄 · `teams/page.tsx` 팀 내 1위 값 줄바꿈 · 폰 카드 지표 이름 keep-all | 각 파일 이 커밋 이전으로 |
| M29 | (이 커밋) | **일정 탭 폰 점검(2026-11-08)** — `ScheduleClient.tsx` 회원 화면에서 기록 없는 날 박스스코어 자리 숨김 | `datesWithStats.has(sd.date) &&` 두 곳을 빼면 원래대로 |
| M30 | (이 커밋) | **영상 탭 폰 점검(2026-11-08)** — `highlights/page.tsx` 날짜 한 줄 · `HighlightsPlaylist`·`PlayerHighlightsPlaylist` 팀 이름 keep-all·「A.」→「어시」·vs 중복 | 각 파일 이 커밋 이전으로 |
| M31 | (이 커밋) | **나 탭 폰 점검(2026-11-08)** — `PersonalDashboard.tsx` 하이라이트 설명·비로그인 안내 keep-all·띄어쓰기 | 이 커밋 이전으로 |
| M32 | (이 커밋) | **리더보드·명단 폰 점검(2026-11-08)** — `StatsPageClient.tsx` 누적 전환 시 정렬 열 옮김·폰 카드 4칸·흰 팀 점 · `TopFiveSlot.tsx` 괄호 중복 · `PlayersPageClient.tsx` 구분선 | 각 파일 이 커밋 이전으로 |
| M33 | (이 커밋) | **박스스코어 폰 점검(2026-11-08)** — `BoxscoreContent.tsx` 주인공 줄·리더 라벨·내 기록 줄·팀 점·「6G」→「6경기」 · `DayHighlightsLauncher.tsx` 다시 시도 | 각 파일 이 커밋 이전으로 |
| M34 | (이 커밋) | **박스스코어 내 줄 테두리만(2026-11-08 운영진)** — `BoxscoreContent.tsx` 표 줄·폰 카드 `MINE_OUTLINE` | 표 줄 style 을 `background: MY_ROW_BG` 로, 카드 바탕을 `isMe ? MY_ROW_BG` 로 되돌리면 원래대로 |
| M35 | (이 커밋) | **박스스코어 맨 위 「나」 줄도 테두리만(2026-11-08 운영진)** — `BoxscoreContent.tsx` 내 기록 버튼 | 그 버튼 style 을 옅은 노랑 바탕(`color-mix(in srgb, var(--mm-yellow) 22%, var(--mm-panel))`) + 왼쪽 3px 띠로 되돌리면 원래대로 |
| M36 | (이 커밋) | **경기별 스코어 폰 2칸(2026-11-08 운영진)** — `BoxscoreContent.tsx` `grid-cols-2 sm:grid-cols-3` | `grid-cols-3` 으로 되돌리면 원래대로 |
| M37 | (이 커밋) | **로고 · 박스스코어 정리 · 홈 내 기록 5개(2026-11-08 운영진)** — 홈 `page.tsx` 로고 줄 + `lib/league/leagueLogo.ts` · `BoxscoreContent.tsx` 주인공 삭제·리더 칩 제거·속공 칸·접기 · `MyLastDay.tsx` 스틸·블록 | 로고: `leagueLogoOf` 가 null 이면 종전 화면. 박스스코어·MyLastDay 는 이 커밋 이전으로 |
| M38 | (이 커밋) | **홈 리그 리더 → 「이번 달 우리 팀」(2026-11-08 운영진)** — `home/HomeMonthTeams.tsx` · `api/leagues/[leagueId]/month-teams` · 홈 `page.tsx`(NbaLeaders 빼고 묶음 캐시 v2) | 홈 `page.tsx` 에 NbaLeaders 블록과 묶음 캐시의 `getCachedLeaderStats`·`getCachedPhotoMap`(함수는 남아 있음)을 되살리면 원래대로 |
| M39 | (이 커밋) | **표 값 꺾임 전역 수정 · 공유 그림 로고(2026-11-08)** — `globals.css` mm-fit 칸·머리 keep-all · `StatHeader` · `BoxscoreContent` `<wbr>` · 팀 탭 표 lg↑ · `opengraph-image.tsx` 로고(공개 리그만) | globals.css 두 줄을 `overflow-wrap: anywhere` 로 되돌리면 종전 줄바꿈 |
| M40 | (이 커밋) | **비공개 리그 공유 그림에 로고만(2026-11-09)** — 공용 카드를 `lib/og/onballCard.tsx` 로 옮김 · 리그 `opengraph-image.tsx` 비공개 폴백이 로고를 넘김 | 리그 파일의 `renderOnballCard(await loadLogoDataUri(leagueId))` 를 `renderOnballCard()` 로 바꾸면 로고 없는 종전 카드 |
| M41 | (이 커밋) | **달별 정규 멤버에서 게스트 제외(2026-11-09)** — `quarters/[quarterId]/players` select 에 `is_guest` · `MonthlyRosterPanel` 거르기 | 패널의 `&& !r.is_guest` 를 지우면 종전대로 보임 |
| M42 | (이 커밋) | **팀 카드 분기 표기(2026-11-09)** — `lib/format/quarterSpan.ts` · 팀 탭 카드·표 | `quarterSpanLabel(...)` 를 `quarterLabels.join(' · ')` 로 되돌리면 종전 표기 |
| M43 | (이 커밋) | **팀 상세 패널 점검(2026-11-09)** — `teams/page.tsx` TeamDetailPanel(break-keep·팀 내 1위 칸) · `TeamInsights.tsx` 4요소 막대 테두리 | 각 줄을 되돌리면 종전 모습 |
| M44 | (이 커밋) | **팀 탭 흐름 줄·팀 특성 비교·선수 표 열(2026-11-09)** — `TeamFormLine`·`standings.ts last10` · `teams/_lib/teamTraits.ts`·`TraitCompare` · `AVG_COLS`/`TOTAL_COLS`·PC 순위 칸 | 이 커밋을 되돌리면 종전(점·승차, 고리, 열 9개) |
| M45 | (이 커밋) | **리더보드 머리 칸 전환 효과 제거 · 야투 시도 표시(2026-11-09)** — `StatsPageClient.tsx`(th·shotMadeAtt·bigSub) · `teams/page.tsx` th | 각 줄을 되돌리면 종전 |
| M46 | (이 커밋) | **팀 탭 선수 표 머리 두 줄 틀·턴오버율/속공 열 제거(2026-11-09)** — `teams/page.tsx` StatsTable thead · AVG/TOTAL_COLS | 이 커밋 되돌리기 |
| M47 | (이 커밋) | **박스스코어 표 머리 높이 통일(2026-11-09)** — `BoxscoreContent.tsx` thead | 이 커밋 되돌리기 |
| M48 | ba519ba | **파울 표시 전역 제거(2026-11-09)** — `LeagueEventInputPad`·`ScoreStrip`·`HeadToHeadBars`·`GameLogModal` | 이 커밋 되돌리기 |
| M49 | 061a2ec | **리그 설정 세로 줄이기(2026-11-09)** — `settings/page.tsx` 카드 합치기 · `AccountApprovalPanel` 재구성(어드민 지정 버튼·초기 비밀번호·최근 접속 순) · accounts API 에 `password_changed_at` | 이 커밋 되돌리기 |
| M50 | 0bd7c8f | **월렛 화면 점검(2026-11-09)** — `WalletPageClient`(계좌 줄·보너스 문구·빠른 금액·쉼표) · `walletParts`(6개 + 더 보기) · `WalletAdminPanel`(확인 줄·찾기 줄) | 이 커밋 되돌리기 |
| M51 | 52240f7 | **숫자 겹침 · 흰색 팀 칩(2026-11-09)** — `MyLastDay`(cqw 글자 크기) · `HighlightsFilterBar`·`PlayerHighlightsBrowser`(팀 칩 글자색·테두리) | 이 커밋 되돌리기 |
| M52 | 2ab438d | **홈 「지난 토요일 나」 출전 칸 · 공유 버튼 삭제 · 배치된 게스트 표시(2026-11-09)** — `MyLastDay` · 홈 `page.tsx`(AdminDayShare 제거) · `RsvpTeamBoard` | 이 커밋 되돌리기 |
| M53 | (이 커밋) | **홈 「지난 토요일 나」를 「지난 토요일」 카드 안으로(2026-11-09)** — `MyLastDay`(embedded) · `LastRound.tsx` · 홈 `page.tsx` | 이 커밋 되돌리기 |

## R5 (걷어내기)는 미뤘다

보고서의 R5 는 「팀 탭·기록실·옛 스탯 화면 파일 삭제」였는데, **운영진이 「마음에 안 들면 원복」을 조건으로 걸어서 지우지 않았다.**
(2026-11 갱신) 옛 스탯 표·팀 화면은 「기록」 탭의 리더보드·팀 서브탭으로 다시 쓰이게 됐다 — R5 삭제 대상에서 빠진다. 기록실은 운영진 전용 「영상」 서브탭.
일주일쯤 Analytics 로 쓰임을 보고 운영진이 「이대로 간다」고 하면 그때 지운다.

## 계획했지만 이번에 안 한 것 (손이 더 필요해 남김)

- 경기 탭 「세로 타임라인 + 썸네일」 — 카드 정리만 했다(R4).
- 선수 카드 기록 탭 「최근 10일 / 전체」 범위 칩(일별·월별·분기별 세그먼트는 그대로), 플레이스타일 코트/도넛 토글 → 코트 하나.
- 박스스코어 「이날의 주인공」 큰 사진 + 클립.
- 스탯 탭 「순위 범위(전체/같은 포지션)」를 ⓘ 로 — 선수 카드 안 토글은 그대로.
