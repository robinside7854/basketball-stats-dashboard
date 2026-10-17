# PC 클로드로 숏폼 이어 만들기 — 인수인계

> PC(내 컴퓨터)의 Claude Code 에서 이 파일을 먼저 읽게 한다.
> 클라우드 세션(2026-10-17)에서 만든 `미라클 리포트 10/17 v1` 을 이어 받는다.

## 1. 재료 두 군데

| 무엇 | 어디 |
|---|---|
| 스타일 지시·사실 검증·화면 원본(reel.html)·대본(plan.json) | 이 저장소 `docs/shortform/` (브랜치 `ccr-ccc4796a-foqrwq`) |
| 작업 폴더 통째(목소리 wav·폰트 포함) | 채팅으로 받은 `miracle-1017-reel.zip` |

zip 을 푼 폴더가 곧 스킬의 reel 폴더다(plan.json · reel.html · voice/ · assets/fonts/ · FILM.md).
`out/` 은 비어 있다 — 렌더하면 다시 생긴다.

## 2. PC 에 필요한 것

- Claude Code + **Super Video Agent 플러그인**(클라우드와 같은 1.13.0 이상)
- Node 22 이상, FFmpeg
- 스킬 첫 실행 전 `node <스킬폴더>/scripts/setup.mjs` 한 번 (브라우저 설치)
- 목소리를 다시 만들 때만: 환경 변수 `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`
  (지금 voice/ 에 1.2배 목소리가 이미 있으므로 **다시 안 만들면 키 없이도 렌더된다**)
- 데이터 조회: Supabase MCP(`basketball-stats`, project_ref `oqszhjmvcaoerqdcntbj`) 연결

## 3. PC 에서 시킬 말 (복사해서 붙여넣기)

```
docs/shortform/README.md 와 docs/shortform/HANDOFF-PC.md 를 먼저 읽어줘.
그다음 내려받은 miracle-1017-reel 폴더(경로: <여기에 폴더 경로>)를
Super Video Agent 스킬의 reel 폴더로 써서 이어서 작업해줘.
FILM.md 의 Owner requests 와 Stage report 를 먼저 읽고,
render.mjs 로 지금 상태가 그대로 렌더되는지부터 확인해줘.
```

## 4. PC 에서 하면 좋은 것 — 실제 경기 영상

클라우드에서는 유튜브가 봇 확인으로 다운로드를 막았다. **PC(가정 인터넷)에서는 대개 받아진다.**
`yt-dlp` 로 아래 구간을 받아 그래픽 자리에 넣고, 스코어판·이름표를 그 위에 올리면 레퍼런스와 같은 모양이 된다.

| 장면(plan 줄 id) | 영상 | 구간(초) | 내용 |
|---|---|---|---|
| ld3 | https://www.youtube.com/watch?v=ug9SnvQH0nc | 85–96 | 변원식 3점 (91.5초 성공) |
| bh1 | https://www.youtube.com/watch?v=Uj9kwwNbET8 | 88–97 | 김성현 3점 (94.3초) |
| bh1 | https://www.youtube.com/watch?v=ug9SnvQH0nc | 373–383 | 김성현 레이업 (379.8초) |
| cg3 | https://www.youtube.com/watch?v=r8qi_J8WX1I | 160–191 | 천세원 공격리바 4개 (164.6~188.0초) |
| cg4·cg5 | https://www.youtube.com/watch?v=3nAJ6Ea2i3o | 622–640 | 홍상진 역전 레이업 (633.9초, 13→16) |

시각은 DB `league_game_events.video_timestamp` 값이다. 기록원이 누른 시각이라 1~2초 어긋날 수 있으니
받은 뒤 프레임을 보고 맞춘다.

## 5. 지켜야 할 것 (요약 — 자세한 건 README)

- 결과물은 **내려받는 mp4**. 사이트 배포·master 병합 없음.
- 캐스터 톤 · 자연스러운 연결 · 함께 만든 기록은 함께 · 비교는 차트로.
- 숫자는 DB 로 확인한 것만. 메모와 다르면 DB 값을 쓰고 알린다.
- 1분 미만 목표. 길면 나레이션 속도(최대 1.3배) → 그래도 넘치면 문장 다듬기.
  (10/17 은 사용자가 1.2배·71초로 확정)
- 대본은 목소리 만들기 전에 한 번 확인받는다.
