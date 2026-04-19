# 🏀 Basketball Stats Dashboard

파란날개 농구팀을 위한 실시간 경기 기록 및 통계 대시보드입니다.  
YouTube 영상 연동, AI 기반 MVP/X-FACTOR 선정, 선수 커리어 통계까지 한 번에 관리합니다.

---

## 주요 기능

### 🏠 홈 대시보드
- 시즌 전체 승/패/승률 요약
- 연승·연패 스트릭 뱃지
- 팀 평균 득점·실점·야투율·3점율·자유투율
- 부문별 리더 (득점왕·리바운드왕·어시스트왕·3점슛왕·TS%)
- 팀 기록 (최다 득점 경기, 최다 실점, 3점슛 최다, 턴오버 최다, 최대 점수차 승리)
- 최근 경기 결과 카드 (클릭 시 박스스코어 팝업)

### 🏆 대회 관리
- 대회(Tournament) 생성·수정·삭제
- 대회별 경기 추가·관리 (날짜, 상대팀, 라운드, YouTube URL)
- YouTube 일괄 임포트 모달 (링크 붙여넣기 → 자동 경기 매핑)
- 경기 완료 처리 (최종 점수 자동 기록)

### 📹 실시간 경기 기록
- YouTube 영상과 동기화된 실시간 스탯 입력
- 쿼터 전환 및 라인업 교체 패널
- 이벤트 입력 패드: 2점·3점·자유투·리바운드·어시스트·스틸·블록·턴오버·파울
- 상대팀 실점 자동 팝업 (2점/3점 단위 빠른 입력)
- **세션 복구**: 기록 중 이탈 후 재접속 시 마지막 경기·YouTube 재생 시점 자동 복원
- 기록 중 선수 즉석 추가 (이름·등번호 입력 후 바로 로스터 등록)
- 경기 완료 시 최종 점수 확인 팝업

### 📊 박스스코어
- 대회별·경기별 전체 스탯 조회 (PTS/REB/AST/STL/BLK/TOV/FGA/FGM/3PA/3PM/FTA/FTM/eFG%/TS%)
- 더블더블(DD) / 트리플더블(TD) 뱃지 자동 표시
- **AI MVP / X-FACTOR 선정** (Claude Sonnet 기반)
  - 힌트 모달: 수동으로 MVP·X-FACTOR 후보 지정 + 경기 메모 주입
  - 힌트 지정 선수에게 보너스 점수 부여 (AI가 반영)
  - AI 코멘트: 대회 평균 대비·시즌 평균(연도 전체) 대비 구분 명시
  - 캐시 조회(GET) → AI 재생성(POST) → 초기화(DELETE)
  - 전체 경기 AI 일괄 선정 버튼 (순차 진행 + 진행 표시)

### 👥 선수 로스터
- 선수 카드 목록 (이름·등번호·포지션)
- **선수 상세 모달**
  - 커리어 하이 자동 계산: PTS·REB·AST·STL·BLK·FG%(4경기 이상)
  - 커리어 하이 기록 시 날짜·상대·라운드·승패·대회명 표시
  - AI 수상 배지: MVP·X-FACTOR 누적 횟수
  - 경기별 스탯 히스토리
- 선수 추가·수정·삭제

### 📈 팀 통계
- 시즌 통산 팀·선수 평균 스탯 테이블
- 경기별 득실점 추이 차트

### 📋 게임로그
- 전체 경기 목록 (날짜·상대·점수·대회·라운드)
- 경기 클릭 시 박스스코어 팝업

### 🆚 상대팀 분석
- 상대팀별 전적 및 평균 실점 현황

---

## 기술 스택

| 구분 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (App Router) |
| 언어 | TypeScript |
| 스타일 | Tailwind CSS |
| DB / Auth | Supabase (PostgreSQL + RLS) |
| AI | Anthropic Claude Sonnet (`claude-sonnet-4-6`) |
| 영상 | YouTube IFrame API |
| 상태관리 | Zustand |
| 배포 | Vercel (master push → 자동 배포) |

---

## 환경 변수 설정

프로젝트 루트에 `.env.local` 파일을 생성하고 아래 값을 입력합니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ANTHROPIC_API_KEY=your_anthropic_api_key
EDIT_MODE_PIN=your_pin_number
```

---

## 로컬 실행

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000) 접속 후 팀을 선택하면 시작됩니다.

---

## 편집 모드 (Edit Mode)

기록 입력·경기 추가·선수 관리 등 데이터를 변경하려면 **편집 모드 PIN** 인증이 필요합니다.  
`EDIT_MODE_PIN` 환경 변수에 설정한 번호를 입력하면 편집 기능이 활성화됩니다.

---

## 배포

- GitHub `master` 브랜치에 push하면 Vercel이 자동으로 빌드·배포합니다.
- Supabase 테이블 및 RLS 설정은 별도 마이그레이션 스크립트를 통해 관리합니다.
