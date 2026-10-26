/**
 * 스탯 용어집 — 표 헤더 · 컬럼 라벨에 툴팁으로 설명 표시.
 *
 * key: 대문자 약어. 특수문자 포함 가능.
 * short: 라벨용 짧은 문자열.
 * long: 한국어 풀네임.
 * formula: 공식 (선택).
 * description: 1-2줄 설명.
 */

import { MIN_ATTEMPTS_PER_DAY, STATS_MIN_ROUND_RATIO } from './eligibility'

export interface StatDef {
  short: string
  long: string
  formula?: string
  description: string
  /** 'low' = 낮을수록 좋은 지표 (라이트 유저가 헷갈리는 것만 명시). 생략 = 높을수록 좋음(기본 가정). */
  direction?: 'low'
}

export const GLOSSARY: Record<string, StatDef> = {
  // ── 기본 카운팅 ────────────────────────────
  GP:   { short: 'GP',   long: '경기 수',        description: '해당 시즌/분기 참가 경기 수' },
  R:    { short: 'R',    long: '출전일 수',      description: '경기한 날 수 (하루 = 1R). 하루 평균 스탯의 분모' },
  G:    { short: 'G',    long: '게임 슬롯 수',   description: '개별 경기 슬롯 기준 참가 수 (하루 여러 경기면 별개)' },
  PTS:  { short: 'PTS',  long: '득점 (누적)',    description: '해당 기간 누적 득점' },
  // 교체가 기록된 경기가 11%뿐이라 대부분 "경기 끝까지 뛴 것으로 본" 값이다 —
  // 값 옆의 * 가 그 표시다. 숫자를 믿을지 판단할 수 있도록 설명에 명시한다.
  MIN:  { short: 'MIN',  long: '출전 시간 (분)',
          description: '누적 출전 시간. 교체를 기록한 경기는 그 값을 쓰고, 교체 기록이 없으면 경기 끝까지 뛴 것으로 본다(이 리그는 5대5 고정이라 교체가 드물다). * 는 그렇게 계산된 경기가 섞였다는 표시 — 실제로 교체됐는데 기록이 안 됐다면 그만큼 많게 나온다' },
  REB:  { short: 'REB',  long: '리바운드',       formula: 'OREB + DREB', description: '누적 리바운드 (공격+수비)' },
  OREB: { short: 'OR',   long: '공격 리바운드',  description: '누적 공격 리바운드' },
  DREB: { short: 'DR',   long: '수비 리바운드',  description: '누적 수비 리바운드' },
  AST:  { short: 'AST',  long: '어시스트',       description: '팀 동료의 성공한 야투를 도운 마지막 패스' },
  STL:  { short: 'STL',  long: '스틸',           description: '상대의 공을 빼앗은 횟수' },
  BLK:  { short: 'BLK',  long: '블록',           description: '상대 슛을 저지한 횟수' },
  TOV:  { short: 'TOV',  long: '턴오버',         description: '공을 상대에게 넘긴 횟수 · 낮을수록 좋음', direction: 'low' },
  FGM:  { short: 'FG',   long: '야투 성공',      description: '2점 + 3점 야투 성공' },
  '3PM': { short: '3P',  long: '3점 성공',       description: '3점 야투 성공' },
  FTM:  { short: 'FT',   long: '자유투 성공',    description: '자유투 성공' },

  // ── 평균 (Per Game) ──────────────────────
  PPG:  { short: 'PPG',  long: '하루 평균 득점',    formula: 'PTS / R', description: '경기한 날 하루에 평균 몇 점 넣는지 (하루 여러 경기를 합친 값)' },
  RPG:  { short: 'RPG',  long: '하루 평균 리바운드', formula: 'REB / R', description: '경기한 날 하루 평균 리바운드' },
  APG:  { short: 'APG',  long: '하루 평균 어시스트', formula: 'AST / R', description: '경기한 날 하루 평균 어시스트' },
  SPG:  { short: 'SPG',  long: '하루 평균 스틸',    formula: 'STL / R', description: '경기한 날 하루 평균 스틸' },
  BPG:  { short: 'BPG',  long: '하루 평균 블록',    formula: 'BLK / R', description: '경기한 날 하루 평균 블록' },
  TOPG: { short: 'TOPG', long: '하루 평균 턴오버',  formula: 'TOV / R', description: '경기한 날 하루 평균 턴오버 · 낮을수록 좋음', direction: 'low' },
  ORpg: { short: 'ORpg', long: '하루 평균 공격리바', formula: 'OREB / R', description: '경기한 날 하루 평균 공격 리바운드' },
  DRpg: { short: 'DRpg', long: '하루 평균 수비리바', formula: 'DREB / R', description: '경기한 날 하루 평균 수비 리바운드' },
  // 리그 표의 하루 평균 컬럼은 한국어 라벨로 보인다(2026-10-12 — PPG 같은 약어·「경기당」 금지).
  //   라벨을 그대로 term 으로 넘기므로 같은 설명을 한국어 키로도 건다. 약어는 툴팁 안에만 남긴다.
  득점:   { short: '득점',   long: '하루 평균 득점 (PPG)',    formula: 'PTS / R', description: '경기한 날 하루에 평균 몇 점 넣는지 (하루 여러 경기를 합친 값)' },
  리바:   { short: '리바',   long: '하루 평균 리바운드 (RPG)', formula: 'REB / R', description: '경기한 날 하루 평균 리바운드' },
  공리:   { short: '공리',   long: '하루 평균 공격 리바운드',  formula: 'OREB / R', description: '경기한 날 하루 평균 공격 리바운드' },
  수리:   { short: '수리',   long: '하루 평균 수비 리바운드',  formula: 'DREB / R', description: '경기한 날 하루 평균 수비 리바운드' },
  어시:   { short: '어시',   long: '하루 평균 어시스트 (APG)', formula: 'AST / R', description: '경기한 날 하루 평균 어시스트' },
  스틸:   { short: '스틸',   long: '하루 평균 스틸 (SPG)',    formula: 'STL / R', description: '경기한 날 하루 평균 스틸' },
  블록:   { short: '블록',   long: '하루 평균 블록 (BPG)',    formula: 'BLK / R', description: '경기한 날 하루 평균 블록' },
  턴오버: { short: '턴오버', long: '하루 평균 턴오버 (TOPG)', formula: 'TOV / R', description: '경기한 날 하루 평균 턴오버 · 낮을수록 좋음', direction: 'low' },

  // ── 슈팅 % ────────────────────────────
  'FG%': { short: 'FG%', long: '야투 성공률',    formula: 'FGM / FGA', description: '전체 야투 성공률 (2점+3점)' },
  '2P%': { short: '2P%', long: '2점 성공률',    formula: '(FGM - 3PM) / (FGA - 3PA)', description: '2점 야투만의 성공률' },
  '3P%': { short: '3P%', long: '3점 성공률',    formula: '3PM / 3PA', description: '3점 야투 성공률' },
  'FT%': { short: 'FT%', long: '자유투 성공률', formula: 'FTM / FTA', description: '자유투 성공률' },
  'eFG%': { short: 'eFG%', long: '유효 야투율', formula: '(FGM + 0.5 × 3PM) / FGA',
            description: '3점은 2점보다 1.5배 값지다는 점을 반영한 야투 성공률. 3점을 많이 넣는 선수는 FG% 보다 높게 나온다. 넣은 슛 개수로만 계산해 +1 가산점·자유투 룰의 영향을 받지 않는다' },
  'TS%': { short: 'TS%', long: '진실 야투율',   formula: 'PTS / (2 × (FGA + 0.44 × FTA))',
           description: '2점·3점·자유투를 전부 합쳐, 슛 기회 한 번에 점수를 얼마나 뽑았는지 보는 성공률. 슈팅 효율을 숫자 하나로 볼 때 쓴다. 득점으로 계산하므로 +1 가산점·자유투 1구 2점이 들어가 프로 기준보다 높게 나온다' },
  FTr:   { short: 'FTr', long: '자유투 유도율', formula: 'FTA / FGA',
           description: '야투 시도 대비 자유투 시도 비율. 골밑 침투/파울 유도 지표' },

  // ── 야투 존별 비중 ─────────────────
  DS: { short: 'DS', long: '골밑 비중',    formula: '골밑슛 시도 / FGA', description: '전체 야투 중 골밑슛(포스트/덩크) 시도 비중' },
  LU: { short: 'LU', long: '레이업 비중',  formula: '레이업 / FGA', description: '전체 야투 중 레이업 비중' },
  MD: { short: 'MD', long: '미들 비중',    formula: '미들슛 시도 / FGA', description: '전체 야투 중 미드레인지 비중' },
  '3P share': { short: '3P', long: '3점 비중', formula: '3PA / FGA', description: '전체 야투 중 3점 시도 비중' },

  // ── Advanced ─────────────────────────
  PIE:    { short: 'PIE', long: 'Player Impact Estimate',
            formula: '(PTS + FGM + FTM − FGA − FTA + DREB + ORB/2 + AST + STL + BLK/2 − PF − TO) ÷ 게임 총 임팩트(양팀 합)',
            description: 'NBA 공식 임팩트 지표 · 본인 임팩트를 그 경기 전체 임팩트(양팀 합)로 나눈 값. 높을수록 그 경기에서 결정적 · 참여 게임 수 많고 기여 높을수록 커짐' },
  // 공식은 파란날개 시즌 스탯(stats/page.tsx 의 withEff) · calculator.ts 의 calcGameScore 와 같아야 한다.
  EFF:    { short: 'EFF', long: '효율 지수',
            formula: '(PTS + REB + AST + STL + BLK) − (놓친 야투 + 놓친 자유투 + TOV) · 경기당',
            description: '한 경기에서 팀에 보탠 것에서 까먹은 것을 뺀 값. 클수록 좋고, 0 아래면 놓친 슛·실책이 기여보다 많았다는 뜻' },
  // statDef() 가 대문자로 다시 찾으므로 화면에서는 'GmSc' 로 불러도 이 항목이 잡힌다.
  GMSC:   { short: 'GmSc', long: '게임 스코어',
            formula: 'PTS + 0.4×FGM − 0.7×FGA − 0.4×(FTA−FTM) + 0.7×OR + 0.3×DR + STL + 0.7×AST + 0.7×BLK − 0.4×PF − TOV',
            description: '한 경기 활약을 숫자 하나로 요약한 값(존 홀린저 공식). 득점에 리바운드·도움·수비를 더하고 놓친 슛·파울·실책을 뺀다. 클수록 그 경기 기여가 컸다 · NBA 기준으로는 10 이 평균' },
  'A/T':  { short: 'A/T', long: '어시-턴오버 비율', formula: 'AST / TOV',
            description: '어시스트를 실책으로 나눈 값. 1 보다 크면 실책보다 도움이 많다는 뜻 · 높을수록 공을 안정적으로 다룬다. 턴오버가 0이면 나눌 수 없어 「—」로 보이고 순위에서 뺀다' },
  'AST%': { short: 'AST%', long: '어시스트 사용률', formula: 'AST / (POSS + AST) × 100',
            description: '본인 볼 소유 중 어시스트로 마무리한 비중' },
  'TOV%': { short: 'TOV%', long: '턴오버 사용률', formula: 'TOV / POSS × 100',
            description: '본인 볼 소유 중 턴오버로 마무리한 비중. 낮을수록 좋음', direction: 'low' },
  'USG%': { short: 'USG%', long: '사용률', formula: '100 × (FGA + 0.44 × FTA + TOV) / 팀 소유권',
            description: '팀 공격 가운데 이 선수가 슛·자유투·실책으로 마무리한 몫. 높으면 공격이 이 선수에게 몰린다는 뜻이지, 잘했다는 뜻은 아니다' },
  A1:     { short: 'A1',   long: 'And-One 횟수', description: '야투 성공과 동시에 파울을 얻어낸 앤드원 횟수' },
  'A1%':  { short: 'A1%',  long: 'And-One 비율', formula: 'A1 / FGM × 100',
            description: '야투 성공 중 앤드원 비율' },
  'ORB%': { short: 'ORB%', long: '공격 리바운드 비중', formula: 'OREB / REB × 100',
            description: '본인 리바운드 중 공격 리바운드 비중' },
  'DRB%': { short: 'DRB%', long: '수비 리바운드 비중', formula: 'DREB / REB × 100',
            description: '본인 리바운드 중 수비 리바운드 비중' },
  'TRB%': { short: 'TRB%', long: '팀 대비 리바운드', formula: 'REB / 팀 REB × 100',
            description: '본인 출전 경기에서 본인 팀 총 리바운드 대비 본인 비중' },

  // ── 팀 4대 지표 ────────────────────
  ORtg: { short: 'ORtg', long: '공격 효율', formula: 'PTS / POSS × 100',
          description: '100 소유당 득점. 페이스 무관한 공격력' },
  DRtg: { short: 'DRtg', long: '수비 효율', formula: '실점 / 상대 POSS × 100',
          description: '100 소유당 실점. 낮을수록 좋음', direction: 'low' },
  NetRtg: { short: 'NET', long: '순 효율', formula: 'ORtg - DRtg',
            description: '득실 효율 차이. +5 이상이면 강팀' },
  Pace: { short: 'Pace', long: '페이스', formula: '(팀 POSS + 상대 POSS) / 2 / GP',
          description: '평균 소유권 수 (경기 템포)' },

  // ── 기타 ───────────────────────────
  W:     { short: 'W', long: '승리', description: '해당 팀/선수 참가 승리 수' },
  L:     { short: 'L', long: '패배', description: '해당 팀/선수 참가 패배 수' },
  D:     { short: 'D', long: '무승부', description: '해당 팀/선수 참가 무승부 수' },
  GF:    { short: 'GF', long: '득점 총합', description: '경기 득점 총합' },
  GA:    { short: 'GA', long: '실점 총합', description: '경기 실점 총합' },
  GD:    { short: 'GD', long: '득실 차', formula: 'GF - GA', description: '득점 - 실점 차이' },
  Streak: { short: 'STREAK', long: '연승/연패', description: '현재 연속 결과 (W3 = 3연승)' },
}

/** 소문자·특수문자 정규화하여 조회. */
export function statDef(key: string): StatDef | null {
  return GLOSSARY[key] ?? GLOSSARY[key.toUpperCase()] ?? null
}

// ─────────────────────────────────────────────
// 「숫자 읽는 법」 시트 (2026-10-14) — 스탯 탭 머리의 ⓘ 버튼이 연다. 팀 탭도 같은 시트를 쓴다(2026-10-15).
//   ⚠ 용어 설명을 화면마다 따로 두지 말 것 — 팀 탭의 옛 「이 표 읽는 법」 상자가 여기와 겹쳐 지웠다.
//   종전 스탯 탭의 「이 표 읽는 법」 접힘 상자 항목을 여기로 옮기고, 우리 리그만의 규칙을 더했다.
//   개발 용어 없이 운영진·회원이 읽는 문장으로 쓴다. 숫자 기준은 eligibility.ts 의 상수를 그대로 읽는다 —
//   기준을 바꿨는데 설명만 옛 숫자로 남는 일을 막는다.
// ─────────────────────────────────────────────

export interface GuideEntry {
  term: string
  text: string
  /** 계산식 (있으면 작은 글씨로 함께 보인다) */
  formula?: string
}

export interface GuideSection {
  title: string
  items: GuideEntry[]
}

const RATIO_PCT = Math.round(STATS_MIN_ROUND_RATIO * 100)
const A = MIN_ATTEMPTS_PER_DAY

// 2026-10-19 운영진: "너무 길고 지루하다" → 한 줄씩 가볍게. 계산식은 꼭 필요한 두 개만 남겼다.
export const READING_GUIDE: GuideSection[] = [
  {
    title: '기본',
    items: [
      { term: '하루 평균', text: '하루에 몇 경기를 뛰든 그날을 한 번으로 쳐서 나눈 평균이에요.', formula: '누적 ÷ 출전일' },
      { term: '출전', text: '뛴 날 수예요.' },
      { term: '누적', text: '기간 동안 모두 더한 값이에요. 실력 비교는 하루 평균으로 보세요.' },
      { term: '공리 · 수리', text: '공격 리바운드 · 수비 리바운드예요.' },
      { term: '턴오버', text: '이건 낮을수록 좋아요.' },
    ],
  },
  {
    title: '슛',
    items: [
      { term: '야투율', text: '던진 슛 중 들어간 비율이에요(자유투 제외).' },
      { term: '2점률', text: '3점을 뺀 2점슛만의 성공률이에요.' },
      { term: '유효야투 (eFG%)', text: '3점의 가치를 1.5배로 쳐 준 야투율이에요.', formula: '(넣은 슛 + 0.5 × 넣은 3점) ÷ 던진 슛' },
      { term: '진실야투 (TS%)', text: '자유투까지 합쳐 슛 한 번에 몇 점 뽑았나예요. +1 가산점이 들어가서 프로보다 높게 나와요.' },
      { term: '슛 분포', text: '던진 슛이 골밑·레이업·미드·3점에 어떻게 나뉘었나예요. 정렬하면 3점 비중 순이에요.' },
    ],
  },
  {
    title: '고급',
    items: [
      { term: '어시/턴오버', text: '어시스트를 턴오버로 나눈 값이에요. 1보다 크면 실수보다 도움이 많아요. 턴오버가 0이면 「—」로 보여요.' },
      { term: '앤드원', text: '슛을 넣으면서 파울까지 얻어 낸 횟수예요.' },
      { term: '리바 비중', text: '내가 뛴 경기에서 우리 팀 리바운드 중 내가 잡은 몫이에요.' },
      { term: '공격 점유 (USG%)', text: '팀 공격이 나로 끝난 비율이에요. 높다고 잘한 건 아니에요.' },
    ],
  },
  {
    title: '우리 리그 규칙',
    items: [
      { term: '+1 가산점', text: '지정된 선수는 슛을 넣을 때마다 1점을 더 받아요.' },
      { term: '자유투', text: '2점슛 파울은 1구에 2점, 3점슛 파울은 2점 + 1점이에요.' },
      { term: '친선전', text: '순위·스탯에는 안 들어가요. 박스스코어에서만 보여요.' },
      { term: '순위 기준', text: `열린 날의 ${RATIO_PCT}% 이상 뛰어야 순위에 들어요. 기준에 못 미쳐도 내 기록은 맨 위에 보여요. 성공률은 하루 평균 야투 ${A.fg}개 · 3점 ${A.fg3}개 · 자유투 ${A.ft}개 이상 던져야 해요.` },
    ],
  },
]
