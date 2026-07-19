# 코치 핀 (수비 장면 큐레이션) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 코치가 대회 경기 영상의 임의 지점에 핀을 꽂고 라벨(예: 필스위치)을 달아, 수비 장면 클립 모음을 만들어 팀원에게 보여줄 수 있게 한다.

**Architecture:** 새 테이블 `coach_pins` 하나에 `(game_id, video_timestamp, label)`을 저장한다. 클립 구간은 저장하지 않고 타임스탬프에서 앞 12초/뒤 6초를 계산한다. 화면은 핀을 꽂는 `/review`(편집모드 전용)와 모아보는 `/pins`(공개) 두 개. 영상 재생은 기존 `HighlightsPlayer`에 선택적 prop을 추가해 재사용한다.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase(Postgres) · Tailwind 4 · lucide-react · sonner

## Global Constraints

- 대회(파란날개) 전용. 리그(`league_*` 테이블) 코드는 건드리지 않는다.
- 모든 코드 변경 후 `npx tsc --noEmit` 통과 필수 (CI 없음 — 로컬이 마지막 게이트).
- `.env.local` 직접 편집 금지 (PreToolUse hook 으로 차단됨).
- 쓰기 API 는 반드시 `verifyTeamPin` 가드를 통과해야 한다 (CLAUDE.md 규약).
- 마이그레이션 파일은 `supabase/migrations/NNN_*.sql`. 다음 번호는 `068` (`064`가 중복 사용됨).
- 모바일 필수: 375px 에서 가로 스크롤 없어야 하고, 터치 타겟 최소 44×44px.
- 이모지를 UI 아이콘으로 쓰지 않는다 (lucide-react 사용).
- 클릭 가능한 요소에는 `cursor-pointer`.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- 이 프로젝트는 `master` 브랜치를 쓴다 (`main` 아님).

## File Structure

| 파일 | 책임 |
|---|---|
| `supabase/migrations/068_coach_pins.sql` | 테이블 + 인덱스 |
| `supabase/migrations/069_coach_pins_rls.sql` | RLS — 공개 읽기, 쓰기는 service role 만 |
| `src/lib/hangul.ts` | 초성 추출·매칭 순수 함수 |
| `src/lib/hangul.test.ts` | 위 함수 테스트 (`node --test`) |
| `src/lib/teamPinAuth.ts` | `verifyTeamPin` 서버 가드 |
| `src/contexts/EditModeContext.tsx` | (수정) PIN 보관 + `teamHeaders` 노출 |
| `src/types/coachPin.ts` | `CoachPin` 타입 (서버·클라이언트 공유) |
| `src/app/api/pins/route.ts` | GET(목록) · POST(생성) |
| `src/app/api/pins/[id]/route.ts` | DELETE (소유권 확인 포함) |
| `src/app/api/pins/labels/route.ts` | 라벨 후보 |
| `src/components/pins/LabelInput.tsx` | 초성 자동완성 입력창 |
| `src/components/pins/PinList.tsx` | 핀 목록 (시간순, 클릭 seek) |
| `src/app/(main)/[org]/[team]/review/page.tsx` | 핀 꽂기 화면 |
| `src/app/(main)/[org]/[team]/pins/page.tsx` | 모아보기 화면 |
| `src/components/highlights/HighlightsPlayer.tsx` | (수정) 선택적 caption/scoreboard prop |
| `src/components/layout/TabNav.tsx` | (수정) 진입점 추가 |

---

## Task 1: 마이그레이션 — `coach_pins` 테이블

**Files:**
- Create: `supabase/migrations/068_coach_pins.sql`

**Interfaces:**
- Consumes: 없음
- Produces: 테이블 `public.coach_pins` — 컬럼 `id uuid`, `team_id uuid`, `game_id uuid`, `video_timestamp double precision`, `label text`, `created_at timestamptz`

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/068_coach_pins.sql`:

```sql
-- 코치 핀 — 코치가 경기 영상의 임의 지점을 골라 라벨을 붙인 수비 장면 큐레이션.
-- 기존 하이라이트는 game_events(성공 슛)에서 자동 생성되므로 득점으로 이어지지 않은
-- 수비 장면은 잡히지 않는다. 이 테이블이 그 공백을 메운다.
--
-- 클립 구간은 저장하지 않는다. video_timestamp 하나로 앞 12초/뒤 6초를 계산한다
-- (코치는 장면이 끝나는 순간에 핀을 꽂으므로 앞쪽을 길게 잡음).
-- team_id 는 games -> tournaments -> team_id 2홉 조인을 피하려는 비정규화.
-- 라벨 집계와 팀 전체 모아보기가 모두 팀 단위 조회라 이 컬럼이 없으면 매번 조인을 탄다.
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

COMMENT ON TABLE public.coach_pins IS
  '코치가 경기 영상에 직접 꽂은 핀. 라벨은 자유 텍스트(초성 자동완성), 꽂는 즉시 공개.';
```

- [ ] **Step 2: Supabase MCP 로 적용**

CLAUDE.md 의 Supabase MCP 가드레일을 따른다:
1. `.env.local` 의 `NEXT_PUBLIC_SUPABASE_URL` 에서 `project_ref` 를 추출해 **사용자에게 출력**
2. 위 SQL 전문을 사용자에게 보여주기
3. **사용자 명시적 확인 후** `mcp__supabase__apply_migration` 실행

위험 키워드(`DROP`/`TRUNCATE`/`DELETE FROM`)가 없는 순수 `CREATE` 이므로 추가 확인 단계는 불필요하다.

MCP 가 없거나 실패하면 파일 경로만 안내하고 사용자가 SQL Editor 에서 직접 실행하게 한다.
**채팅에 SQL 을 붙여넣어 실행을 요청하지 않는다.**

- [ ] **Step 3: 적용 확인**

`mcp__supabase__execute_sql` 로 실행:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'coach_pins'
ORDER BY ordinal_position;
```

Expected: 6행 (id, team_id, game_id, video_timestamp, label, created_at)

- [ ] **Step 4: RLS 적용 (실행 중 추가됨)**

068 에는 RLS 가 빠져 있었다. anon key 는 브라우저에 노출되므로 테이블이 열려 있으면
Task 3·4 에서 만들 `X-Team-Pin` 가드를 우회해 누구나 핀을 만들고 지울 수 있다.
`supabase/migrations/069_coach_pins_rls.sql` 로 보완한다:

```sql
ALTER TABLE public.coach_pins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coach_pins public read"
  ON public.coach_pins FOR SELECT USING (true);
```

INSERT/UPDATE/DELETE 정책은 두지 않는다 — 정책이 없으면 anon 은 거부되고
service role 만 통과한다. API 라우트는 `src/lib/supabase/admin.ts` 의 service role
클라이언트를 쓰므로(RLS 우회) 앱 동작에는 영향이 없다.

> 이 프로젝트의 기존 테이블(`games`/`game_events`/`tournaments`)은 RLS 는 켜져 있으나
> 정책이 `ALL / USING true / WITH CHECK true` 라 사실상 전부 허용이다. `coach_pins` 는
> 그 관례를 의도적으로 따르지 않는다.

- [ ] **Step 5: 커밋**

```bash
git add supabase/migrations/068_coach_pins.sql supabase/migrations/069_coach_pins_rls.sql
git commit -m "feat(pins): coach_pins 테이블 마이그레이션 + RLS"
```

---

## Task 2: 초성 매칭 순수 함수

**Files:**
- Create: `src/lib/hangul.ts`
- Test: `src/lib/hangul.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `toChosung(s: string): string` — 한글 음절을 초성으로 변환, 비한글은 그대로
  - `matchesLabel(query: string, label: string): boolean` — 자동완성 매칭 판정

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/hangul.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toChosung, matchesLabel } from './hangul.ts'

test('toChosung: 한글 음절을 초성으로', () => {
  assert.equal(toChosung('필스위치'), 'ㅍㅅㅇㅊ')
  assert.equal(toChosung('헬프로테이션'), 'ㅎㅍㄹㅌㅇㅅ')
})

test('toChosung: 겹자음 초성', () => {
  assert.equal(toChosung('까치'), 'ㄲㅊ')
  assert.equal(toChosung('빵'), 'ㅃ')
})

test('toChosung: 비한글은 그대로 통과', () => {
  assert.equal(toChosung('ABC'), 'ABC')
  assert.equal(toChosung('3점'), '3ㅈ')
  assert.equal(toChosung(''), '')
})

test('matchesLabel: 초성 질의', () => {
  assert.equal(matchesLabel('ㅍ', '필스위치'), true)
  assert.equal(matchesLabel('ㅍㅅ', '필스위치'), true)
  assert.equal(matchesLabel('ㅎ', '필스위치'), false)
})

test('matchesLabel: 초성 질의는 prefix 매칭만 (중간 초성은 불일치)', () => {
  assert.equal(matchesLabel('ㅅㅇ', '필스위치'), false)
})

test('matchesLabel: 일반 질의는 부분문자열 매칭', () => {
  assert.equal(matchesLabel('스위', '필스위치'), true)
  assert.equal(matchesLabel('필', '필스위치'), true)
  assert.equal(matchesLabel('로테', '헬프로테이션'), true)
  assert.equal(matchesLabel('없는말', '필스위치'), false)
})

test('matchesLabel: 대소문자 무시', () => {
  assert.equal(matchesLabel('zone', 'ZONE 2-3'), true)
  assert.equal(matchesLabel('ZO', 'zone press'), true)
})

test('matchesLabel: 빈 질의는 전부 통과', () => {
  assert.equal(matchesLabel('', '필스위치'), true)
  assert.equal(matchesLabel('   ', '필스위치'), true)
})
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `node --test src/lib/hangul.test.ts`
Expected: FAIL — `Cannot find module './hangul.ts'`

- [ ] **Step 3: 구현 작성**

`src/lib/hangul.ts`:

```ts
// 한글 초성 유틸 — 라벨 자동완성용 (예: 'ㅍ' 입력 → '필스위치' 추천)
//
// 한글 음절은 유니코드 AC00~D7A3 에 (초성 19 × 중성 21 × 종성 28) 순서로 배열된다.
// 따라서 초성 인덱스 = floor((code - 0xAC00) / (21 * 28)) = floor((code - 0xAC00) / 588).

const CHOSUNG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
] as const

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3
const CHOSUNG_BLOCK = 588   // 21 중성 × 28 종성

/** 한글 음절을 초성으로 변환. 비한글 문자는 그대로 둔다. */
export function toChosung(s: string): string {
  let out = ''
  for (const ch of s) {
    const code = ch.codePointAt(0)!
    if (code >= HANGUL_START && code <= HANGUL_END) {
      out += CHOSUNG[Math.floor((code - HANGUL_START) / CHOSUNG_BLOCK)]
    } else {
      out += ch
    }
  }
  return out
}

/** 질의가 전부 초성 자모인지 (ㄱ~ㅎ 영역). 'ㅍㅅ' → true, '필' → false */
function isChosungOnly(q: string): boolean {
  if (!q) return false
  for (const ch of q) {
    if (!CHOSUNG.includes(ch as (typeof CHOSUNG)[number])) return false
  }
  return true
}

/**
 * 자동완성 매칭.
 * - 질의가 전부 초성이면 라벨 초성 문자열에 대한 prefix 매칭
 *   ('ㅍㅅ' → '필스위치' 히트, 'ㅅㅇ' → 불히트 — 중간부터 시작하는 초성은 오탐이 많아 제외)
 * - 그 외에는 대소문자 무시 부분문자열 매칭
 * - 빈 질의는 전부 통과
 */
export function matchesLabel(query: string, label: string): boolean {
  const q = query.trim()
  if (!q) return true
  if (isChosungOnly(q)) return toChosung(label).startsWith(q)
  return label.toLowerCase().includes(q.toLowerCase())
}
```

- [ ] **Step 4: 테스트 실행해 통과 확인**

Run: `node --test src/lib/hangul.test.ts`
Expected: PASS — `# pass 8`, `# fail 0`

- [ ] **Step 5: 타입 체크**

Run: `npx tsc --noEmit`
Expected: `src/` 에 에러 0건 (`tempsuperpowers/` 에러는 무관하므로 무시)

- [ ] **Step 6: 커밋**

```bash
git add src/lib/hangul.ts src/lib/hangul.test.ts
git commit -m "feat(pins): 한글 초성 매칭 유틸 + 테스트"
```

---

## Task 3: 팀 PIN 서버 가드 + EditModeContext PIN 보관

⚠️ **이 태스크는 대회 편집 흐름 전반이 쓰는 공유 컴포넌트를 수정한다. Step 5 회귀 확인을 건너뛰지 말 것.**

**Files:**
- Create: `src/lib/teamPinAuth.ts`
- Modify: `src/contexts/EditModeContext.tsx`

**Interfaces:**
- Consumes: 없음
- Produces:
  - `verifyTeamPin(req: Request, org: string, team: string): Promise<string | null>` — 통과 시 `teams.id`, 실패 시 `null`
  - `useEditMode()` 반환값에 `teamHeaders: Record<string, string>` 추가 (기존 `isEditMode`/`openPinModal`/`exitEditMode` 는 그대로 유지)

- [ ] **Step 1: 서버 가드 작성**

`src/lib/teamPinAuth.ts`:

```ts
import { createClient } from '@/lib/supabase/admin'

/**
 * 팀 편집 PIN 검증 — 대회(파란날개) mutation API 가드.
 * 리그의 verifyLeaguePin 과 같은 구조. X-Team-Pin 헤더를 teams.edit_pin 과 대조한다.
 *
 * 불리언 대신 teams.id 를 돌려준다. 호출부가 핀 생성 시 team_id 를 채우거나
 * 리소스 소유권을 대조하는 데 그대로 쓰기 위함이다. 실패 시 null.
 */
export async function verifyTeamPin(req: Request, org: string, team: string): Promise<string | null> {
  const pin = req.headers.get('X-Team-Pin')
  if (!pin) return null
  const supabase = createClient()
  const { data } = await supabase
    .from('teams')
    .select('id')
    .eq('org_slug', org)
    .eq('sub_slug', team)
    .eq('edit_pin', pin)
    .maybeSingle()
  return (data?.id as string) ?? null
}
```

- [ ] **Step 2: EditModeContext 에 PIN 보관 추가**

`src/contexts/EditModeContext.tsx` 를 아래 4곳만 수정한다. 기존 동작은 유지한다.

(a) 상수 추가 — `const SESSION_KEY = 'edit_mode'` 아래:

```ts
const PIN_KEY = 'edit_pin'
```

(b) 인터페이스에 `teamHeaders` 추가:

```ts
interface EditModeCtx {
  isEditMode: boolean
  openPinModal: () => void
  exitEditMode: () => void
  teamHeaders: Record<string, string>   // 쓰기 API 에 붙일 X-Team-Pin 헤더
}

const EditModeContext = createContext<EditModeCtx>({
  isEditMode: false,
  openPinModal: () => {},
  exitEditMode: () => {},
  teamHeaders: {},
})
```

(c) PIN state 추가 + 복원/저장/삭제. `const [isEditMode, setIsEditMode] = useState(false)` 아래에 추가:

```ts
  const [pin, setPin] = useState<string>('')
```

`useEffect` 의 복원 로직을 교체:

```ts
  useEffect(() => {
    setIsEditMode(sessionStorage.getItem(SESSION_KEY) === '1')
    setPin(sessionStorage.getItem(PIN_KEY) ?? '')
  }, [])
```

`exitEditMode` 를 교체:

```ts
  function exitEditMode() {
    sessionStorage.removeItem(SESSION_KEY)
    sessionStorage.removeItem(PIN_KEY)
    setIsEditMode(false)
    setPin('')
  }
```

`handleDigit` 의 성공 분기를 교체 (`if (res.ok) { ... }` 내부):

```ts
      if (res.ok) {
        const entered = next.join('')
        sessionStorage.setItem(SESSION_KEY, '1')
        sessionStorage.setItem(PIN_KEY, entered)
        setPin(entered)
        setIsEditMode(true)
        setShowModal(false)
      } else {
```

(d) Provider value 교체:

```ts
    <EditModeContext.Provider
      value={{ isEditMode, openPinModal, exitEditMode, teamHeaders: pin ? { 'X-Team-Pin': pin } : {} }}
    >
```

- [ ] **Step 3: 타입 체크**

Run: `npx tsc --noEmit`
Expected: `src/` 에러 0건

- [ ] **Step 4: 린트**

Run: `npx eslint src/contexts/EditModeContext.tsx src/lib/teamPinAuth.ts`
Expected: 출력 없음

- [ ] **Step 5: 편집모드 회귀 확인 (수동 — 건너뛰지 말 것)**

`npm run dev -- -p 3021` 실행 후 `http://localhost:3021/paranalgae/youth` 에서:

1. 편집모드 진입 → PIN 4자리 입력 → 모달 닫히고 하단 탭에 "경기 기록" 나타남 → **통과**
2. 브라우저 devtools → Application → Session Storage 에 `edit_mode=1` 과 `edit_pin=<입력한 PIN>` 둘 다 있음 → **통과**
3. 페이지 새로고침 → 편집모드 유지됨 → **통과**
4. 편집모드 해제 → `edit_mode`/`edit_pin` 둘 다 사라짐 → **통과**
5. 틀린 PIN 입력 → 빨간 표시 + 진입 안 됨 → **통과**

하나라도 실패하면 다음 태스크로 넘어가지 말고 고칠 것.

> 참고: `globals.css` 의 Pretendard `@import` 순서 때문에 dev 서버에서 CSS 경고가 뜰 수 있다.
> 이는 기존 이슈이며 프로덕션 빌드는 통과한다. 이 태스크와 무관하므로 무시한다.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/teamPinAuth.ts src/contexts/EditModeContext.tsx
git commit -m "feat(pins): 팀 PIN 서버 가드 + EditModeContext PIN 보관"
```

---

## Task 4: 핀 타입 + API 라우트

**Files:**
- Create: `src/types/coachPin.ts`
- Create: `src/app/api/pins/route.ts`
- Create: `src/app/api/pins/[id]/route.ts`
- Create: `src/app/api/pins/labels/route.ts`

**Interfaces:**
- Consumes: `verifyTeamPin` (Task 3)
- Produces:
  - `CoachPin` = `{ id: string; game_id: string; video_timestamp: number; label: string; created_at: string }`
  - `CoachPinWithGame` = `CoachPin & { game: { id: string; date: string; opponent: string; youtube_url: string | null } }`
  - `LabelOption` = `{ label: string; count: number }`
  - `pinClipBounds(ts: number): { start: number; end: number }`
  - `LABEL_MAX_LEN = 20`
  - `GET /api/pins?gameId=` → `CoachPin[]`
  - `GET /api/pins?org=&team=` → `CoachPinWithGame[]`
  - `GET /api/pins/labels?org=&team=` → `LabelOption[]`
  - `POST /api/pins` body `{ org, team, gameId, videoTimestamp, label }` → `CoachPin`
  - `DELETE /api/pins/[id]?org=&team=` → `{ ok: true }`

- [ ] **Step 1: 타입 정의**

`src/types/coachPin.ts`:

```ts
// 코치 핀 — 코치가 경기 영상 임의 지점에 꽂은 수비 장면 마커
export interface CoachPin {
  id: string
  game_id: string
  video_timestamp: number
  label: string
  created_at: string
}

// 모아보기용 — 경기 정보 조인
export interface CoachPinWithGame extends CoachPin {
  game: {
    id: string
    date: string
    opponent: string
    youtube_url: string | null
  }
}

export interface LabelOption {
  label: string
  count: number
}

// 핀 클립 길이 — 코치는 장면이 끝나는 순간에 핀을 꽂으므로 앞쪽을 길게 잡는다
export const PIN_CLIP_BEFORE = 12
export const PIN_CLIP_AFTER = 6

export function pinClipBounds(ts: number): { start: number; end: number } {
  return { start: Math.max(0, ts - PIN_CLIP_BEFORE), end: ts + PIN_CLIP_AFTER }
}

export const LABEL_MAX_LEN = 20
```

- [ ] **Step 2: 목록/생성 라우트**

`src/app/api/pins/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { verifyTeamPin } from '@/lib/teamPinAuth'
import { LABEL_MAX_LEN } from '@/types/coachPin'

// GET /api/pins?gameId=xxx            → 해당 경기 핀 (시간순)
// GET /api/pins?org=xxx&team=youth    → 팀 전체 핀 + 경기 정보 (모아보기)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const gameId = searchParams.get('gameId')
  const org = searchParams.get('org')
  const team = searchParams.get('team')
  const supabase = createClient()

  if (gameId) {
    const { data, error } = await supabase
      .from('coach_pins')
      .select('id, game_id, video_timestamp, label, created_at')
      .eq('game_id', gameId)
      .order('video_timestamp', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (org && team) {
    const { data: teamRow } = await supabase
      .from('teams').select('id').eq('org_slug', org).eq('sub_slug', team).maybeSingle()
    if (!teamRow) return NextResponse.json([])
    const { data, error } = await supabase
      .from('coach_pins')
      .select('id, game_id, video_timestamp, label, created_at, game:games(id, date, opponent, youtube_url)')
      .eq('team_id', teamRow.id)
      .order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  return NextResponse.json({ error: 'gameId 또는 org+team 이 필요합니다' }, { status: 400 })
}

// POST /api/pins  { org, team, gameId, videoTimestamp, label }
export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })

  const { org, team, gameId, videoTimestamp, label } = body
  if (!org || !team || !gameId) {
    return NextResponse.json({ error: 'org, team, gameId 는 필수입니다' }, { status: 400 })
  }

  const teamId = await verifyTeamPin(req, org, team)
  if (!teamId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const ts = Number(videoTimestamp)
  if (!Number.isFinite(ts) || ts < 0) {
    return NextResponse.json({ error: 'videoTimestamp 가 올바르지 않습니다' }, { status: 400 })
  }
  const trimmed = String(label ?? '').trim()
  if (trimmed.length < 1 || trimmed.length > LABEL_MAX_LEN) {
    return NextResponse.json({ error: `라벨은 1~${LABEL_MAX_LEN}자여야 합니다` }, { status: 400 })
  }

  const supabase = createClient()

  // 이 경기가 정말 이 팀 소속인지 확인 (다른 팀 경기에 핀을 꽂지 못하게)
  const { data: game } = await supabase
    .from('games')
    .select('id, tournament:tournaments(team_id)')
    .eq('id', gameId)
    .maybeSingle()
  const gameTeamId = (game?.tournament as { team_id?: string } | null)?.team_id
  if (!game || gameTeamId !== teamId) {
    return NextResponse.json({ error: '이 팀의 경기가 아닙니다' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('coach_pins')
    .insert({ team_id: teamId, game_id: gameId, video_timestamp: ts, label: trimmed })
    .select('id, game_id, video_timestamp, label, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
```

- [ ] **Step 3: 삭제 라우트**

> 라벨 수정(PATCH)은 넣지 않는다. 어느 화면도 쓰지 않아 죽은 코드가 된다.
> 오타를 고칠 때는 삭제 후 다시 꽂으면 된다. 편집 수요가 실제로 확인되면
> 그때 PATCH 와 인라인 편집 UI 를 함께 추가한다.

`src/app/api/pins/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { verifyTeamPin } from '@/lib/teamPinAuth'

// 핀이 요청자의 팀 소속인지 확인. 통과하면 teamId 반환.
// PIN 만 맞으면 다른 팀 핀까지 지울 수 있는 구멍을 막는다.
async function authorize(req: Request, org: string | null, team: string | null, pinId: string) {
  if (!org || !team) return null
  const teamId = await verifyTeamPin(req, org, team)
  if (!teamId) return null
  const supabase = createClient()
  const { data } = await supabase
    .from('coach_pins').select('id, team_id').eq('id', pinId).maybeSingle()
  if (!data || data.team_id !== teamId) return null
  return teamId
}

// DELETE /api/pins/[id]?org=xxx&team=youth
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { searchParams } = new URL(req.url)

  const ok = await authorize(req, searchParams.get('org'), searchParams.get('team'), id)
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createClient()
  const { error } = await supabase.from('coach_pins').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: 라벨 후보 라우트**

`src/app/api/pins/labels/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import type { LabelOption } from '@/types/coachPin'

// GET /api/pins/labels?org=xxx&team=youth → 많이 쓴 라벨 순
// 자동완성 후보. 페이지 진입 시 한 번만 받아 클라이언트에서 필터링한다.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const org = searchParams.get('org')
  const team = searchParams.get('team')
  if (!org || !team) return NextResponse.json({ error: 'org, team 필요' }, { status: 400 })

  const supabase = createClient()
  const { data: teamRow } = await supabase
    .from('teams').select('id').eq('org_slug', org).eq('sub_slug', team).maybeSingle()
  if (!teamRow) return NextResponse.json([])

  const { data, error } = await supabase
    .from('coach_pins').select('label').eq('team_id', teamRow.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Postgres GROUP BY 를 supabase-js 로 직접 표현하기 번거로워 앱에서 집계한다.
  // 팀당 핀 수는 수백 단위라 문제되지 않는다.
  const counts = new Map<string, number>()
  for (const row of (data ?? []) as { label: string }[]) {
    counts.set(row.label, (counts.get(row.label) ?? 0) + 1)
  }
  const out: LabelOption[] = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  return NextResponse.json(out)
}
```

- [ ] **Step 5: 타입 체크 + 린트**

Run: `npx tsc --noEmit`
Expected: `src/` 에러 0건

Run: `npx eslint src/app/api/pins src/types/coachPin.ts`
Expected: 출력 없음

- [ ] **Step 6: 인증 가드 수동 확인**

dev 서버 실행 후 PIN 헤더 없이 POST 를 던져 401 이 나오는지 확인:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3021/api/pins \
  -H "Content-Type: application/json" \
  -d '{"org":"paranalgae","team":"youth","gameId":"00000000-0000-0000-0000-000000000000","videoTimestamp":10,"label":"테스트"}'
```

Expected: `401`

- [ ] **Step 7: 커밋**

```bash
git add src/types/coachPin.ts src/app/api/pins
git commit -m "feat(pins): 핀 CRUD API + 라벨 후보 라우트"
```

---

## Task 5: 초성 자동완성 입력창

**Files:**
- Create: `src/components/pins/LabelInput.tsx`

**Interfaces:**
- Consumes: `matchesLabel` (Task 2), `LabelOption`, `LABEL_MAX_LEN` (Task 4)
- Produces: `<LabelInput value onChange onSubmit options autoFocus />` — 기본 export

- [ ] **Step 1: 컴포넌트 작성**

`src/components/pins/LabelInput.tsx`:

```tsx
'use client'
// 라벨 입력 + 초성 자동완성 — 'ㅍ' 만 쳐도 '필스위치' 추천
import { useMemo, useState, useRef, useEffect } from 'react'
import { matchesLabel } from '@/lib/hangul'
import { LABEL_MAX_LEN, type LabelOption } from '@/types/coachPin'

interface Props {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  options: LabelOption[]
  autoFocus?: boolean
}

const MAX_SUGGESTIONS = 6

export default function LabelInput({ value, onChange, onSubmit, options, autoFocus }: Props) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo(
    () => options.filter(o => matchesLabel(value, o.label)).slice(0, MAX_SUGGESTIONS),
    [options, value],
  )

  // 목록 밖 클릭 시 닫기
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // 후보가 줄어들면 선택 인덱스를 범위 안으로
  useEffect(() => { setActive(0) }, [value])

  function choose(label: string) {
    onChange(label)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    // 자동완성 목록이 열려 있을 때만 방향키를 가로챈다
    if (open && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % suggestions.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(i => (i - 1 + suggestions.length) % suggestions.length); return }
      if (e.key === 'Enter' && active >= 0) {
        e.preventDefault()
        choose(suggestions[active].label)
        return
      }
    }
    if (e.key === 'Enter') { e.preventDefault(); onSubmit() }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <input
        type="text"
        value={value}
        autoFocus={autoFocus}
        maxLength={LABEL_MAX_LEN}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="라벨 (예: 필스위치)"
        aria-label="핀 라벨"
        aria-autocomplete="list"
        aria-expanded={open && suggestions.length > 0}
        className="w-full min-h-[44px] bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white
                   focus:outline-none focus:border-blue-500"
      />
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg overflow-hidden shadow-xl"
        >
          {suggestions.map((s, i) => (
            <li key={s.label} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(s.label)}
                className={`w-full text-left px-3 py-2 min-h-[44px] text-sm cursor-pointer transition-colors flex items-center justify-between gap-2
                  ${i === active ? 'bg-blue-600 text-white' : 'text-gray-300 hover:bg-gray-700'}`}
              >
                <span className="truncate">{s.label}</span>
                <span className="text-xs opacity-70 tabular-nums shrink-0">{s.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 타입 체크 + 린트**

Run: `npx tsc --noEmit`
Expected: `src/` 에러 0건

Run: `npx eslint src/components/pins/LabelInput.tsx`
Expected: 출력 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/pins/LabelInput.tsx
git commit -m "feat(pins): 초성 자동완성 라벨 입력창"
```

---

## Task 6: 핀 목록 컴포넌트

**Files:**
- Create: `src/components/pins/PinList.tsx`

**Interfaces:**
- Consumes: `CoachPin` (Task 4)
- Produces: `<PinList pins onSeek onDelete editable />` — 기본 export

- [ ] **Step 1: 컴포넌트 작성**

`src/components/pins/PinList.tsx`:

```tsx
'use client'
// 핀 목록 — 시간순. 클릭하면 해당 지점으로 seek.
import { Trash2, MapPin } from 'lucide-react'
import type { CoachPin } from '@/types/coachPin'

interface Props {
  pins: CoachPin[]
  onSeek: (ts: number) => void
  onDelete?: (id: string) => void
  editable?: boolean
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const mm = String(m).padStart(2, '0')
  const sss = String(ss).padStart(2, '0')
  return h > 0 ? `${h}:${mm}:${sss}` : `${mm}:${sss}`
}

export default function PinList({ pins, onSeek, onDelete, editable = false }: Props) {
  if (pins.length === 0) {
    return (
      <div className="text-center py-10 px-4 border border-dashed border-gray-700 rounded-xl">
        <MapPin size={24} className="mx-auto mb-2 text-gray-600" aria-hidden />
        <p className="text-sm text-gray-400">아직 꽂은 핀이 없습니다</p>
        <p className="text-xs text-gray-600 mt-1">영상을 보다가 핀 꽂기 버튼을 누르세요</p>
      </div>
    )
  }

  return (
    <ul className="space-y-1.5">
      {pins.map(p => (
        <li key={p.id} className="flex items-center gap-2 bg-gray-800/50 rounded-lg px-2 py-1.5 group">
          <button
            type="button"
            onClick={() => onSeek(p.video_timestamp)}
            className="flex-1 min-w-0 flex items-center gap-2.5 text-left min-h-[44px] cursor-pointer
                       hover:bg-gray-700/40 rounded px-1.5 transition-colors"
            title="이 지점으로 이동"
          >
            <span className="text-xs font-mono font-bold text-blue-400 tabular-nums shrink-0">
              {fmt(p.video_timestamp)}
            </span>
            <span className="text-sm text-white truncate">{p.label}</span>
          </button>
          {editable && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(p.id)}
              className="shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center
                         text-gray-600 hover:text-red-400 cursor-pointer transition-colors"
              aria-label={`${p.label} 핀 삭제`}
            >
              <Trash2 size={15} />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 2: 타입 체크 + 린트**

Run: `npx tsc --noEmit`
Expected: `src/` 에러 0건

Run: `npx eslint src/components/pins/PinList.tsx`
Expected: 출력 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/pins/PinList.tsx
git commit -m "feat(pins): 핀 목록 컴포넌트"
```

---

## Task 7: 리뷰 페이지 (핀 꽂기)

**Files:**
- Create: `src/app/(main)/[org]/[team]/review/page.tsx`

**Interfaces:**
- Consumes: `LabelInput` (Task 5), `PinList` (Task 6), `CoachPin`/`LabelOption` (Task 4), `useEditMode().teamHeaders` (Task 3), 기존 `YouTubePlayer`(`@/components/record/YouTubePlayer`), `useGameStore`
- Produces: 라우트 `/[org]/[team]/review`

- [ ] **Step 1: 페이지 작성**

`src/app/(main)/[org]/[team]/review/page.tsx`:

```tsx
'use client'
// 영상 리뷰 — 코치가 경기 영상을 보며 수비 장면에 핀을 꽂는 화면 (편집모드 전용)
import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'
import { MapPin, Lock } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import YouTubePlayer from '@/components/record/YouTubePlayer'
import LabelInput from '@/components/pins/LabelInput'
import PinList from '@/components/pins/PinList'
import { useGameStore } from '@/store/gameStore'
import { useEditMode } from '@/contexts/EditModeContext'
import { useTeam } from '@/contexts/TeamContext'
import type { CoachPin, LabelOption } from '@/types/coachPin'
import type { Tournament, Game } from '@/types/database'

export default function ReviewPage() {
  const { isEditMode, openPinModal } = useEditMode()

  if (!isEditMode) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
        <Lock size={32} className="text-gray-600" aria-hidden />
        <div>
          <div className="text-lg font-bold text-white">편집 모드 전용</div>
          <p className="text-gray-400 text-sm mt-1">영상 리뷰는 편집 모드에서만 가능합니다</p>
        </div>
        <button
          onClick={openPinModal}
          className="px-5 py-2 min-h-[44px] rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium cursor-pointer transition-colors"
        >
          PIN 입력
        </button>
      </div>
    )
  }
  return <ReviewInner />
}

function ReviewInner() {
  const team = useTeam()
  const params = useParams<{ org: string }>()
  const org = params.org
  const { teamHeaders } = useEditMode()
  const ytPlayer = useGameStore(s => s.ytPlayer)

  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [selectedTId, setSelectedTId] = useState('')
  const [selectedGId, setSelectedGId] = useState('')
  const [pins, setPins] = useState<CoachPin[]>([])
  const [labelOptions, setLabelOptions] = useState<LabelOption[]>([])

  const [drafting, setDrafting] = useState(false)   // 라벨 입력 중
  const [draftTs, setDraftTs] = useState(0)
  const [draftLabel, setDraftLabel] = useState('')
  const [saving, setSaving] = useState(false)

  const selectedGame = games.find(g => g.id === selectedGId)

  useEffect(() => {
    fetch(`/api/tournaments?team=${team}`).then(r => r.json()).then(setTournaments)
    fetch(`/api/pins/labels?org=${org}&team=${team}`).then(r => r.json()).then(setLabelOptions)
  }, [team, org])

  useEffect(() => {
    if (!selectedTId) { setGames([]); return }
    fetch(`/api/games?tournamentId=${selectedTId}`).then(r => r.json()).then(setGames)
  }, [selectedTId])

  const loadPins = useCallback(() => {
    if (!selectedGId) { setPins([]); return }
    fetch(`/api/pins?gameId=${selectedGId}`).then(r => r.json()).then(setPins)
  }, [selectedGId])

  useEffect(() => { loadPins() }, [loadPins])

  // ── YouTube 원격 제어 (기록 페이지와 동일) ──────────────────
  const seekRelative = useCallback((delta: number) => {
    if (!ytPlayer) return
    try {
      ytPlayer.seekTo((ytPlayer.getCurrentTime() ?? 0) + delta, true)
      ytPlayer.unMute()
    } catch {}
  }, [ytPlayer])

  const seekTo = useCallback((ts: number) => {
    if (!ytPlayer) return
    try { ytPlayer.seekTo(ts, true); ytPlayer.unMute(); ytPlayer.playVideo() } catch {}
  }, [ytPlayer])

  const togglePlay = useCallback(() => {
    if (!ytPlayer) return
    try {
      if (ytPlayer.getPlayerState() === 1) ytPlayer.pauseVideo()
      else { ytPlayer.unMute(); ytPlayer.playVideo() }
    } catch {}
  }, [ytPlayer])

  // 핀 꽂기 — 현재 시각을 잡고 영상을 멈춘 뒤 라벨 입력을 연다
  const startPin = useCallback(() => {
    if (!ytPlayer) { toast.error('영상이 준비되지 않았습니다'); return }
    let ts = 0
    try { ts = ytPlayer.getCurrentTime() ?? 0; ytPlayer.pauseVideo() } catch {}
    setDraftTs(ts)
    setDraftLabel('')
    setDrafting(true)
  }, [ytPlayer])

  // 키보드 — 라벨 입력 중에는 단축키를 비활성화한다 (타이핑과 충돌)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (drafting) return
      if (!ytPlayer) return
      if (e.code === 'Space')           { e.preventDefault(); togglePlay() }
      else if (e.code === 'ArrowLeft')  { e.preventDefault(); seekRelative(e.shiftKey ? -10 : -5) }
      else if (e.code === 'ArrowRight') { e.preventDefault(); seekRelative(e.shiftKey ? 10 : 5) }
      else if (e.code === 'KeyP')       { e.preventDefault(); startPin() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [ytPlayer, drafting, togglePlay, seekRelative, startPin])

  async function savePin() {
    const label = draftLabel.trim()
    if (!label) { toast.error('라벨을 입력하세요'); return }
    if (!selectedGId) return
    setSaving(true)
    try {
      const res = await fetch('/api/pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...teamHeaders },
        body: JSON.stringify({ org, team, gameId: selectedGId, videoTimestamp: draftTs, label }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(res.status === 401 ? '편집 권한이 만료되었습니다. PIN을 다시 입력하세요.' : (d.error ?? '저장 실패'))
        return
      }
      toast.success(`핀 저장됨 · ${label}`)
      setDrafting(false)
      setDraftLabel('')
      loadPins()
      fetch(`/api/pins/labels?org=${org}&team=${team}`).then(r => r.json()).then(setLabelOptions)
      try { ytPlayer?.playVideo() } catch {}
    } finally {
      setSaving(false)
    }
  }

  async function deletePin(id: string) {
    const res = await fetch(`/api/pins/${id}?org=${org}&team=${team}`, {
      method: 'DELETE',
      headers: { ...teamHeaders },
    })
    if (!res.ok) { toast.error('삭제 실패'); return }
    toast.success('핀 삭제됨')
    loadPins()
  }

  function cancelDraft() {
    setDrafting(false)
    setDraftLabel('')
    try { ytPlayer?.playVideo() } catch {}
  }

  return (
    <div className="space-y-3">
      {/* 대회 / 경기 선택 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl px-3 py-2 flex flex-wrap items-center gap-2">
        <Select value={selectedTId} onValueChange={v => { setSelectedTId(v ?? ''); setSelectedGId('') }}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-9 w-full sm:w-52 text-sm">
            <SelectValue placeholder="대회 선택" />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700 text-white">
            {tournaments.map(t => <SelectItem key={t.id} value={t.id}>{t.name} ({t.year})</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={selectedGId} onValueChange={v => setSelectedGId(v ?? '')} disabled={!selectedTId}>
          <SelectTrigger className="bg-gray-800 border-gray-700 text-white h-9 w-full sm:w-56 text-sm">
            <SelectValue placeholder="경기 선택" />
          </SelectTrigger>
          <SelectContent className="bg-gray-800 border-gray-700 text-white">
            {games.map(g => <SelectItem key={g.id} value={g.id}>{g.date} vs {g.opponent}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!selectedGame ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg">대회와 경기를 선택하세요</p>
        </div>
      ) : !selectedGame.youtube_url ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-lg">이 경기에는 연결된 영상이 없습니다</p>
          <p className="text-sm mt-2">대회 관리 탭에서 YouTube 영상을 먼저 연결하세요</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 영상 + 조작 */}
          <div className="lg:col-span-2 space-y-3">
            <YouTubePlayer
              key={selectedGame.id}
              youtubeUrl={selectedGame.youtube_url}
              startOffset={selectedGame.youtube_start_offset}
            />

            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => seekRelative(-5)}
                className="min-h-[44px] px-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-bold cursor-pointer transition-colors"
              >
                ← 5초
              </button>
              <button
                type="button"
                onClick={startPin}
                disabled={drafting}
                className="min-h-[44px] px-5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40
                           text-black text-sm font-black cursor-pointer transition-colors inline-flex items-center gap-1.5"
              >
                <MapPin size={16} aria-hidden />
                핀 꽂기
              </button>
              <button
                type="button"
                onClick={() => seekRelative(5)}
                className="min-h-[44px] px-4 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm font-bold cursor-pointer transition-colors"
              >
                5초 →
              </button>
            </div>
            <p className="text-center text-xs text-gray-600">
              단축키 — P 핀 꽂기 · Space 재생/정지 · ←/→ 5초 (Shift 10초)
            </p>
          </div>

          {/* 핀 목록 + 라벨 입력 */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-bold text-gray-300">핀 목록</h2>
              <span className="text-xs text-gray-600 tabular-nums">{pins.length}개</span>
            </div>

            {drafting && (
              <div className="bg-gray-800 rounded-lg p-3 space-y-2">
                <p className="text-xs text-amber-400 font-bold">
                  {Math.floor(draftTs / 60)}:{String(Math.floor(draftTs % 60)).padStart(2, '0')} 지점에 핀 추가
                </p>
                <LabelInput
                  value={draftLabel}
                  onChange={setDraftLabel}
                  onSubmit={savePin}
                  options={labelOptions}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={savePin}
                    disabled={saving || !draftLabel.trim()}
                    className="flex-1 min-h-[44px] rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40
                               text-white text-sm font-bold cursor-pointer transition-colors"
                  >
                    {saving ? '저장 중…' : '저장'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelDraft}
                    className="px-4 min-h-[44px] rounded-lg border border-gray-600 text-gray-400 hover:bg-gray-700
                               text-sm cursor-pointer transition-colors"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}

            <PinList pins={pins} onSeek={seekTo} onDelete={deletePin} editable />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 타입 체크 + 린트**

Run: `npx tsc --noEmit`
Expected: `src/` 에러 0건

Run: `npx eslint "src/app/(main)/[org]/[team]/review/page.tsx"`
Expected: 출력 없음

- [ ] **Step 3: 수동 확인**

`npm run dev -- -p 3021` 후 `http://localhost:3021/paranalgae/youth/review`:

1. 편집모드 아님 → 잠금 화면 + PIN 입력 버튼 → **통과**
2. PIN 입력 후 → 대회/경기 선택 드롭다운 보임 → **통과**
3. 영상 있는 경기 선택 → 플레이어 로드 → **통과**
4. 재생 중 `P` 또는 핀 꽂기 → 영상 멈추고 라벨 입력창 뜸 → **통과**
5. `ㅍ` 입력 → 기존 라벨 있으면 추천 목록 뜸 (첫 핀이면 목록 없음 — 정상) → **통과**
6. 라벨 입력 후 저장 → 토스트 + 우측 목록에 추가 + 영상 재생 재개 → **통과**
7. 목록의 핀 클릭 → 해당 지점으로 이동 → **통과**
8. 휴지통 클릭 → 삭제 → **통과**
9. 375px 폭에서 가로 스크롤 없음 → **통과**

- [ ] **Step 4: 커밋**

```bash
git add "src/app/(main)/[org]/[team]/review/page.tsx"
git commit -m "feat(pins): 영상 리뷰 페이지 (핀 꽂기)"
```

---

## Task 8: 모아보기 페이지

**Files:**
- Modify: `src/components/highlights/HighlightsPlayer.tsx` (선택적 prop 2개 추가)
- Create: `src/app/(main)/[org]/[team]/pins/page.tsx`

**Interfaces:**
- Consumes: `CoachPinWithGame`, `pinClipBounds` (Task 4), 기존 `HighlightsPlayer`, `extractYouTubeId`
  (`PinList` 는 쓰지 않는다 — 모아보기는 라벨·상대 표기가 달라 전용 목록을 인라인으로 둔다)
- Produces: 라우트 `/[org]/[team]/pins`, `HighlightsPlayer` 의 선택적 prop `captionOverride`·`hideScoreboard`

> **설계 문서와의 차이 (의도적)**
> 스펙은 `HighlightsBrowser`/`HighlightsFilterBar` 재사용을 적었으나, 실제 코드를 확인한 결과
> 그 컴포넌트들은 선수·슛유형·쿼터 축에 강하게 묶여 있다. 핀에는 그 축이 전부 없고 대신 라벨 축이
> 필요하다. 억지로 끼우면 리그·대회 하이라이트 4개 화면을 공유하는 컴포넌트를 또 건드려야 해
> 회귀 위험이 크다. 따라서 **비싼 영상 재생 로직(`HighlightsPlayer`)만 재사용**하고, 라벨 필터와
> 목록은 핀 전용으로 가볍게 만든다. `HighlightsPlayer` 수정은 선택적 prop 2개 추가뿐이라
> 기존 호출부는 동작이 바뀌지 않는다.

- [ ] **Step 1: HighlightsPlayer 에 선택적 prop 추가**

`src/components/highlights/HighlightsPlayer.tsx` 의 Props 인터페이스에 두 줄 추가:

```tsx
  // 코치 핀처럼 선수/슛유형이 없는 클립용 — 하단 캡션을 통째로 대체
  captionOverride?: { primary: string; secondary?: string }
  // 스코어보드 숨김 (핀은 점수 맥락이 없음)
  hideScoreboard?: boolean
```

구조분해에 추가:

```tsx
export default function HighlightsPlayer({ clips, currentIdx, onIndexChange, captionOverride, hideScoreboard }: Props) {
```

스코어보드 조건에 `!hideScoreboard &&` 를 추가 (기존 `{hasScore && (clip.home_team_name || clip.away_team_name) && (` 를 아래로 교체):

```tsx
        {!hideScoreboard && hasScore && (clip.home_team_name || clip.away_team_name) && (
```

하단 캡션 교체. 파일에서 아래 **정확히 이 블록**을 찾는다 (진행 표시 `div` 안의 두 번째 `span`):

```tsx
          <span className="text-xs truncate" style={{ color: 'var(--mm-muted)' }}>
            {clip.player_number ? `#${clip.player_number} ` : ''}{clip.player_name}
            <span className="mx-1.5" aria-hidden>·</span>
            {SHOT_TYPE_LABEL[clip.shot_type] ?? clip.shot_type}
            <span className="mx-1.5" aria-hidden>·</span>
            {formatTimestamp(clip.video_timestamp)}
          </span>
```

이것을 아래로 교체:

```tsx
          <span className="text-xs truncate" style={{ color: 'var(--mm-muted)' }}>
            {captionOverride ? (
              <>
                <span style={{ color: 'var(--mm-ink)', fontWeight: 700 }}>{captionOverride.primary}</span>
                {captionOverride.secondary && (
                  <>
                    <span className="mx-1.5" aria-hidden>·</span>
                    {captionOverride.secondary}
                  </>
                )}
              </>
            ) : (
              <>
                {clip.player_number ? `#${clip.player_number} ` : ''}{clip.player_name}
                <span className="mx-1.5" aria-hidden>·</span>
                {SHOT_TYPE_LABEL[clip.shot_type] ?? clip.shot_type}
              </>
            )}
            <span className="mx-1.5" aria-hidden>·</span>
            {formatTimestamp(clip.video_timestamp)}
          </span>
```

`aria-label` (246행 부근) 도 override 를 반영:

```tsx
        aria-label={captionOverride
          ? `${captionOverride.primary}, ${currentIdx + 1}/${clips.length}`
          : `${clip.player_name} — ${SHOT_TYPE_LABEL[clip.shot_type] ?? clip.shot_type}, ${currentIdx + 1}/${clips.length}`}
```

- [ ] **Step 2: 기존 하이라이트 회귀 확인**

Run: `npx tsc --noEmit`
Expected: `src/` 에러 0건 (새 prop 이 모두 optional 이므로 기존 호출부는 그대로 컴파일된다)

dev 서버에서 `http://localhost:3021/paranalgae/youth/highlights` → 대회 하나 진입:
- 선수명·슛유형 캡션이 예전과 동일하게 보임 → **통과**
- 스코어보드가 예전과 동일하게 보임 → **통과**

- [ ] **Step 3: 모아보기 페이지 작성**

`src/app/(main)/[org]/[team]/pins/page.tsx`:

```tsx
'use client'
// 코치 핀 모아보기 — 라벨/경기로 걸러 이어 보기 (공개)
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { MapPin } from 'lucide-react'
import HighlightsPlayer from '@/components/highlights/HighlightsPlayer'
import { useTeam } from '@/contexts/TeamContext'
import { extractYouTubeId } from '@/lib/youtube/utils'
import { pinClipBounds, type CoachPinWithGame } from '@/types/coachPin'
import type { HighlightClip } from '@/lib/highlights/types'

export default function PinsPage() {
  const team = useTeam()
  const params = useParams<{ org: string }>()
  const org = params.org

  const [pins, setPins] = useState<CoachPinWithGame[]>([])
  const [loading, setLoading] = useState(true)
  const [label, setLabel] = useState<string | null>(null)
  const [gameId, setGameId] = useState<string | null>(null)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    fetch(`/api/pins?org=${org}&team=${team}`)
      .then(r => r.json())
      .then((d: CoachPinWithGame[]) => setPins(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false))
  }, [org, team])

  // 영상 연결된 핀만 재생 가능
  const playable = useMemo(
    () => pins.filter(p => !!p.game?.youtube_url && !!extractYouTubeId(p.game.youtube_url!)),
    [pins],
  )

  const filtered = useMemo(
    () => playable.filter(p => (!label || p.label === label) && (!gameId || p.game_id === gameId)),
    [playable, label, gameId],
  )

  // 교차 필터 — 각 축은 자기 축을 뺀 나머지만 반영
  const labelCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of playable) {
      if (gameId && p.game_id !== gameId) continue
      m.set(p.label, (m.get(p.label) ?? 0) + 1)
    }
    return m
  }, [playable, gameId])

  const gameOptions = useMemo(() => {
    const m = new Map<string, { id: string; name: string; count: number }>()
    for (const p of playable) {
      if (label && p.label !== label) continue
      const prev = m.get(p.game_id)
      if (prev) prev.count++
      else m.set(p.game_id, { id: p.game_id, name: `${p.game.date} vs ${p.game.opponent}`, count: 1 })
    }
    return [...m.values()].sort((a, b) => b.name.localeCompare(a.name))
  }, [playable, label])

  const allLabels = useMemo(
    () => [...new Set(playable.map(p => p.label))].sort((a, b) => a.localeCompare(b)),
    [playable],
  )

  const clips: HighlightClip[] = useMemo(() => filtered.map(p => {
    const { start, end } = pinClipBounds(p.video_timestamp)
    return {
      event_id: p.id,
      video_url: p.game.youtube_url!,
      video_id: extractYouTubeId(p.game.youtube_url!) ?? '',
      video_timestamp: p.video_timestamp,
      clip_start: start,
      clip_end: end,
      player_id: null,
      player_name: '',
      player_number: null,
      player_photo: null,
      team_id: p.game_id,
      team_name: '',
      team_color: '',
      shot_type: 'coach_pin',
      points: 0,
      game_id: p.game_id,
      home_team_name: '',
      away_team_name: '',
      game_date: p.game.date,
      opponent_name: p.game.opponent,
    }
  }), [filtered])

  useEffect(() => { if (idx >= clips.length) setIdx(0) }, [clips.length, idx])

  const current = filtered[idx]

  const chip = (active: boolean, off: boolean): React.CSSProperties => ({
    background: off ? 'var(--mm-panel)' : active ? 'var(--mm-yellow)' : 'var(--mm-panel)',
    color: off ? 'var(--mm-muted)' : active ? 'var(--mm-black)' : 'var(--mm-ink-soft)',
    border: `1px ${off ? 'dashed' : 'solid'} ${active && !off ? 'var(--mm-yellow)' : 'var(--mm-rule)'}`,
    borderRadius: '4px',
    opacity: off ? 0.4 : 1,
    cursor: off ? 'not-allowed' : 'pointer',
  })

  if (loading) return <div className="text-center py-20 text-gray-500">불러오는 중…</div>

  if (playable.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500">
        <MapPin size={32} className="mx-auto mb-3 text-gray-600" aria-hidden />
        <p className="text-lg">아직 모인 핀이 없습니다</p>
        <p className="text-sm mt-2">영상 리뷰 탭에서 장면에 핀을 꽂으면 여기 모입니다</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <MapPin size={20} className="text-amber-400" aria-hidden />
        <h1 className="text-xl font-bold text-white">코치 핀</h1>
        <span className="text-xs text-gray-500 tabular-nums">{filtered.length} / {playable.length}</span>
      </div>

      {/* 필터 */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 space-y-3">
        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">라벨</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button type="button" onClick={() => setLabel(null)}
              className="px-3 py-1.5 min-h-[36px] text-xs font-bold transition-colors" style={chip(label === null, false)}>
              전체
            </button>
            {allLabels.map(l => {
              const n = labelCounts.get(l) ?? 0
              const active = label === l
              const off = !active && n === 0
              return (
                <button key={l} type="button" disabled={off}
                  onClick={() => setLabel(active ? null : l)}
                  className="px-3 py-1.5 min-h-[36px] text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                  style={chip(active, off)}
                  title={off ? '현재 선택한 경기에 이 라벨의 핀이 없습니다' : undefined}
                >
                  {l}<span className="text-[10px] opacity-70 tabular-nums">{n}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-gray-500">경기</div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button type="button" onClick={() => setGameId(null)}
              className="px-3 py-1.5 min-h-[36px] text-xs font-bold transition-colors" style={chip(gameId === null, false)}>
              전체
            </button>
            {gameOptions.map(g => {
              const active = gameId === g.id
              return (
                <button key={g.id} type="button"
                  onClick={() => setGameId(active ? null : g.id)}
                  className="px-3 py-1.5 min-h-[36px] text-xs font-bold transition-colors inline-flex items-center gap-1.5"
                  style={chip(active, false)}
                >
                  {g.name}<span className="text-[10px] opacity-70 tabular-nums">{g.count}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {clips.length === 0 ? (
        <div className="text-center py-16 text-gray-500">조건에 맞는 핀이 없습니다</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <HighlightsPlayer
              clips={clips}
              currentIdx={idx}
              onIndexChange={setIdx}
              hideScoreboard
              captionOverride={{
                primary: current?.label ?? '',
                secondary: current ? `${current.game.date} vs ${current.game.opponent}` : undefined,
              }}
            />
          </div>
          <div className="lg:col-span-4 bg-gray-900 border border-gray-800 rounded-xl p-3">
            <ul className="space-y-1.5 max-h-[60vh] overflow-y-auto">
              {filtered.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setIdx(i)}
                    className={`w-full text-left px-2 py-2 min-h-[44px] rounded-lg cursor-pointer transition-colors
                      ${i === idx ? 'bg-blue-600/30 border border-blue-500/50' : 'hover:bg-gray-800'}`}
                  >
                    <div className="text-sm font-bold text-white truncate">{p.label}</div>
                    <div className="text-xs text-gray-500 truncate">{p.game.date} vs {p.game.opponent}</div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 타입 체크 + 린트**

Run: `npx tsc --noEmit`
Expected: `src/` 에러 0건

Run: `npx eslint "src/app/(main)/[org]/[team]/pins/page.tsx" src/components/highlights/HighlightsPlayer.tsx`
Expected: 출력 없음

- [ ] **Step 5: 수동 확인**

`http://localhost:3021/paranalgae/youth/pins`:

1. 핀이 없으면 안내 화면 → **통과**
2. Task 7 에서 꽂은 핀이 보임 → **통과**
3. 라벨 칩 클릭 → 해당 라벨만 필터됨 → **통과**
4. 경기 칩 클릭 → 라벨 칩 개수가 갱신되고 0개 라벨은 회색 비활성 → **통과**
5. 재생기 하단 캡션에 선수명 대신 라벨이 뜸 → **통과**
6. 375px 폭 가로 스크롤 없음 → **통과**

- [ ] **Step 6: 커밋**

```bash
git add src/components/highlights/HighlightsPlayer.tsx "src/app/(main)/[org]/[team]/pins/page.tsx"
git commit -m "feat(pins): 핀 모아보기 페이지 + HighlightsPlayer 캡션 override"
```

---

## Task 9: 네비게이션 진입점

**Files:**
- Modify: `src/components/layout/TabNav.tsx`

**Interfaces:**
- Consumes: Task 7·8 의 라우트
- Produces: 없음 (UI 진입점)

- [ ] **Step 1: 탭 추가**

`src/components/layout/TabNav.tsx` 수정:

(a) lucide 아이콘 import 에 `MapPin` 추가 (기존 import 줄에 이어붙임).

(b) `TAB_DEFS` 의 `/highlights` 줄 **다음에** 공개 탭 추가:

```tsx
  { path: '/pins',        label: '코치 핀',   icon: MapPin,        exact: false, also: '' },
```

(c) `EDIT_ONLY_PATH` 상수 아래에 리뷰 탭 정의 추가:

```tsx
const REVIEW_PATH = '/review'
```

(d) `editTab` 정의 **다음에** 리뷰 탭을 추가하고 `allTabs` 를 교체:

```tsx
  const reviewTab = {
    href: `${prefix}${REVIEW_PATH}`,
    label: '영상 리뷰',
    icon: MapPin,
    exact: false,
    also: '',
  }

  const allTabs = isEditMode ? [...tabs, editTab, reviewTab] : tabs
```

- [ ] **Step 2: 타입 체크 + 린트**

Run: `npx tsc --noEmit`
Expected: `src/` 에러 0건

Run: `npx eslint src/components/layout/TabNav.tsx`
Expected: 출력 없음

- [ ] **Step 3: 수동 확인**

1. 편집모드 아님 → 하단 탭에 "코치 핀" 보이고 "영상 리뷰" 안 보임 → **통과**
2. 편집모드 진입 → "경기 기록" + "영상 리뷰" 둘 다 나타남 → **통과**
3. 375px 폭에서 탭 줄이 **가로로 스크롤**되고 페이지 자체는 가로 스크롤이 없음 → **통과**
   (TabNav 탭 컨테이너에는 이미 `overflow-x-auto [&::-webkit-scrollbar]:hidden` 이 있어
    탭이 늘어나도 레이아웃이 깨지지 않는다. 추가 작업 불필요 — 동작만 확인한다.)
4. 각 탭 클릭 시 해당 페이지로 이동하고 활성 표시가 맞음 → **통과**

- [ ] **Step 4: 커밋**

```bash
git add src/components/layout/TabNav.tsx
git commit -m "feat(pins): 코치 핀 / 영상 리뷰 네비게이션 진입점"
```

---

## Task 10: 최종 검증 및 배포

**Files:** 없음 (검증만)

- [ ] **Step 1: 전체 테스트**

Run: `node --test src/lib/hangul.test.ts`
Expected: `# fail 0`

- [ ] **Step 2: 타입 체크**

Run: `npx tsc --noEmit`
Expected: `src/` 에러 0건

- [ ] **Step 3: 린트**

Run: `npx eslint src/`
Expected: 이번 작업으로 새로 생긴 에러 없음
(`HighlightsPlayerPicker.tsx` 와 `PlayerHighlightsBrowser.tsx` 의 `react-hooks/set-state-in-effect`
 에러는 기존 것이므로 무시한다)

- [ ] **Step 4: 프로덕션 빌드**

Run: `npm run build`
Expected: exit 0, `Compiled successfully`
(`globals.css` 의 Pretendard `@import` 경고는 기존 이슈이며 빌드를 막지 않는다)

- [ ] **Step 5: 배포**

```bash
git push origin master
```

Vercel 자동 배포. 배포 후 프로덕션에서 Task 7·8 의 수동 확인 항목을 다시 한 번 훑는다.

---

## 남은 이슈 (이 계획 범위 밖)

- **기존 대회 mutation API 무인증**: `/api/events`, `/api/minutes` 등은 여전히 서버 가드가 없다.
  이제 `verifyTeamPin` 이 생겼으니 별도 작업으로 소급 적용할 수 있다.
- **Pretendard 폰트 미로딩 가능성**: `globals.css` 의 `@import` 가 `@import "tailwindcss"` 뒤에 있어
  무효 CSS 가 된다. 한글이 폴백 폰트로 표시되고 있을 수 있다. 전역 타이포에 영향을 주는 변경이라
  별도 확인 후 처리.
