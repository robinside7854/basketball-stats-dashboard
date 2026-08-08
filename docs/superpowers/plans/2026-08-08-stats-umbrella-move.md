# 명단·팀순위를 스탯 우산으로 이동

사용자 지시 2건. 브랜치 `feat/stats-umbrella` → 완료 후 master 병합 + push.

## 지시

1. **"팀 구성"(`/teams`)을 스탯 우산으로 옮기고 이름을 "팀 순위"로**
2. **"팀 명단"(`/roster`)을 "선수 명단"으로 바꾸고 스탯 우산으로**

## 컨트롤러 자율 판단 (보고서에 남길 것)

1. **"팀/경기" 탭을 "경기"로 되돌린다.** 팀 항목 둘이 다 빠지면 남는 것은
   `일정 · 박스스코어 · 경기 기록` 뿐이라 "팀/" 이 가리키는 대상이 사라진다.
   (직전 커밋에서 "경기"→"팀/경기" 로 바꾼 것을 되돌리는 것)
2. **`/teams` 페이지의 h2 "팀 구성" → "팀 순위"** 로 함께 바꾼다.
   탭 라벨과 페이지 제목이 어긋나면 직전 리뷰가 지적했던 불일치(M7)가 그대로 재발한다.
   `/roster` 는 페이지 h2 가 이미 "선수 명단" 이라 탭만 바꾸면 일치한다.
3. **스탯 우산 서브탭 배열을 공유 헬퍼로 뽑는다.** 지금은 `stats/page.tsx` 와
   `awards/page.tsx` 에 배열이 복제돼 있는데, 여기에 `roster`·`teams` 까지 더하면
   **같은 5개 배열이 4벌**이 된다. 한 곳이 빠지면 그 화면만 탭이 다르게 보인다.

## Global Constraints

1. **데이터·계산 로직 수정 금지.** 네비게이션·라벨 작업이다.
2. **스탯 테이블·박스스코어의 밀도 불변** — 열 개수·행 높이·`tabular-nums`·sticky 첫 열·가로 스크롤.
   `/teams` 와 `/roster` 는 테이블이 큰 화면이므로 특히 주의.
3. **활성 탭 판정은 `pathname` 기준** — 미들웨어가 slug→UUID internal rewrite 를 한다.
   `deriveLeagueBase()` 를 쓸 것. `params` 로 판정하면 인디케이터가 항상 꺼진다.
4. **어떤 경로에서도 하단 탭이 최소 하나는 켜져야 한다.** 전부 꺼지면 사용자가 위치를 잃는다.
   상단·하단 **양쪽** 판정을 다 고칠 것.
5. 하드코딩 hex 금지(`--mm-*`) · 라디우스 `--mm-radius-*` · 이모지 금지(lucide-react) · 44px 터치 타깃.
6. 테마 반전 토큰 위 `#fff`/`#000`/`text-white` 고정색 금지.
7. **기존 URL 을 깨지 않는다.** `/roster`·`/teams` 경로는 그대로 살아 있어야 한다.
8. `npx tsc --noEmit` · `npm run build` 통과, `verify-schema` · `verify-scoring` exit 0.

---

## 할 일

### A. 스탯 우산 서브탭 공유 헬퍼 신설
현재 스탯 우산 탭은 `LeagueGroupTabs` 에 **페이지마다 배열을 직접 써서** 넘긴다
(`stats/page.tsx:468-472`, `awards/page.tsx:211-215`).

- 공유 헬퍼를 하나 만든다. 배치는 판단해서 정하고 근거를 보고서에 쓸 것
  (`src/components/league/statsTabs.ts` 같은 곳, 기존 `components/layout/subTabs.ts` 선례 참고).
- 항목: `리더보드(/stats) · 시즌하이(/stats?tab=seasonHigh) · 어워즈(/awards) ·
  선수 명단(/roster) · 팀 순위(/teams)` — **5개**
- 활성 판정을 인자로 받아 각 페이지가 자기 것만 켜게 한다.
- **`stats` 페이지의 `?tab=` 방식은 그대로 둔다** — 경로 방식으로 통일하는 건 이월 항목이다(범위 밖).

### B. 네 페이지가 그 헬퍼를 쓰게
- `stats/page.tsx` · `awards/page.tsx` — 기존 인라인 배열을 헬퍼 호출로 교체
- `roster/page.tsx:595` · `teams/page.tsx:1059` — `<LeagueSubTabs group="games" />` 를
  **`<LeagueGroupTabs tabs={...} />`(스탯 우산)** 로 교체
- 서브탭이 5개라 좁은 화면에서 넘친다 → `LeagueGroupTabs` 가 이미 가로 스크롤을 하는지 확인하고,
  안 하면 추가한다. **페이지 본문은 가로로 밀리면 안 된다.**

### C. `LeagueSubTabs` 의 games 그룹에서 두 항목 제거
`src/components/league/LeagueSubTabs.tsx`
- `games` 그룹을 `일정(/schedule) · 박스스코어(/boxscore) · 경기 기록(/record)` 로 되돌린다.
- `squad` 그룹은 직전 작업에서 이미 없어졌다. 되살리지 말 것.
- 그룹이 `games` 하나만 남으면 `GROUPS` 맵이 과한지 판단하되, **구조를 크게 바꾸지 말고**
  최소 변경으로 둘 것.

### D. 상단·하단 탭 판정 갱신
`src/app/league/[orgSlug]/[leagueId]/_components/LeagueLayoutClient.tsx`
- 탭 라벨 **"팀/경기" → "경기"** (상단·하단 both)
- **경기 탭 match 에서 `/roster`·`/teams` 제거**
- **스탯 탭 match 에 `/roster`·`/teams` 추가** (스탯은 지금 `/stats`·`/awards` 를 잡고 있다)
- 상단(`tabActive`)·하단(`isActive`) **양쪽** 다 고칠 것. 한쪽만 고치면 화면 크기에 따라 다르게 보인다.

### E. 페이지 제목
- `teams/page.tsx` 의 h2 **"팀 구성" → "팀 순위"**
- `roster/page.tsx` 의 h2 는 이미 "선수 명단" — 확인만 하고 그대로 둘 것

---

## 완료 기준
- 스탯 서브탭이 `리더보드 · 시즌하이 · 어워즈 · 선수 명단 · 팀 순위`
- 경기 서브탭이 `일정 · 박스스코어 · 경기 기록`
- `/roster`·`/teams` 에서 **스탯 탭 하나만** 켜짐 (경기·홈과 동시 점등 없음)
- `/stats`·`/awards` 에서도 스탯 탭이 그대로 켜짐
- 네 페이지의 서브탭 바가 **동일한 5개**를 보여줌(복제 배열 없음)
- 375px 에서 서브탭 5개가 페이지 본문을 가로로 밀지 않음
- master 병합 + push
