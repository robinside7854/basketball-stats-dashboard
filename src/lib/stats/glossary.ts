/**
 * 스탯 용어집 — 표 헤더 · 컬럼 라벨에 툴팁으로 설명 표시.
 *
 * key: 대문자 약어. 특수문자 포함 가능.
 * short: 라벨용 짧은 문자열.
 * long: 한국어 풀네임.
 * formula: 공식 (선택).
 * description: 1-2줄 설명.
 */

export interface StatDef {
  short: string
  long: string
  formula?: string
  description: string
}

export const GLOSSARY: Record<string, StatDef> = {
  // ── 기본 카운팅 ────────────────────────────
  GP:   { short: 'GP',   long: '경기 수',        description: '해당 시즌/분기 참가 경기 수' },
  R:    { short: 'R',    long: '라운드 수',      description: '경기일 기준 참가 라운드 수 (하루 = 1R)' },
  G:    { short: 'G',    long: '게임 슬롯 수',   description: '개별 경기 슬롯 기준 참가 수 (하루 여러 경기면 별개)' },
  PTS:  { short: 'PTS',  long: '득점 (누적)',    description: '해당 기간 누적 득점' },
  REB:  { short: 'REB',  long: '리바운드',       formula: 'OREB + DREB', description: '누적 리바운드 (공격+수비)' },
  OREB: { short: 'OR',   long: '공격 리바운드',  description: '누적 공격 리바운드' },
  DREB: { short: 'DR',   long: '수비 리바운드',  description: '누적 수비 리바운드' },
  AST:  { short: 'AST',  long: '어시스트',       description: '팀 동료의 성공한 야투를 도운 마지막 패스' },
  STL:  { short: 'STL',  long: '스틸',           description: '상대의 공을 빼앗은 횟수' },
  BLK:  { short: 'BLK',  long: '블락',           description: '상대 슛을 저지한 횟수' },
  TOV:  { short: 'TOV',  long: '턴오버',         description: '공을 상대에게 넘긴 횟수' },
  FGM:  { short: 'FG',   long: '야투 성공',      description: '2점 + 3점 야투 성공' },
  '3PM': { short: '3P',  long: '3점 성공',       description: '3점 야투 성공' },
  FTM:  { short: 'FT',   long: '자유투 성공',    description: '자유투 성공' },

  // ── 평균 (Per Game) ──────────────────────
  PPG:  { short: 'PPG',  long: '경기당 득점',    formula: 'PTS / GP', description: '경기당 평균 득점' },
  RPG:  { short: 'RPG',  long: '경기당 리바운드', formula: 'REB / GP', description: '경기당 평균 리바운드' },
  APG:  { short: 'APG',  long: '경기당 도움',    formula: 'AST / GP', description: '경기당 평균 어시스트' },
  SPG:  { short: 'SPG',  long: '경기당 스틸',    formula: 'STL / GP', description: '경기당 평균 스틸' },
  BPG:  { short: 'BPG',  long: '경기당 블락',    formula: 'BLK / GP', description: '경기당 평균 블락' },
  TOPG: { short: 'TOPG', long: '경기당 턴오버',  formula: 'TOV / GP', description: '경기당 평균 턴오버' },
  ORpg: { short: 'ORpg', long: '경기당 공격리바', formula: 'OREB / GP', description: '경기당 평균 공격 리바운드' },
  DRpg: { short: 'DRpg', long: '경기당 수비리바', formula: 'DREB / GP', description: '경기당 평균 수비 리바운드' },

  // ── 슈팅 % ────────────────────────────
  'FG%': { short: 'FG%', long: '야투 성공률',    formula: 'FGM / FGA', description: '전체 야투 성공률 (2점+3점)' },
  '2P%': { short: '2P%', long: '2점 성공률',    formula: '(FGM - 3PM) / (FGA - 3PA)', description: '2점 야투만의 성공률' },
  '3P%': { short: '3P%', long: '3점 성공률',    formula: '3PM / 3PA', description: '3점 야투 성공률' },
  'FT%': { short: 'FT%', long: '자유투 성공률', formula: 'FTM / FTA', description: '자유투 성공률' },
  'eFG%': { short: 'eFG%', long: '유효 야투율', formula: '(FGM + 0.5 × 3PM) / FGA',
            description: '3점 성공을 1.5배 가중한 실효 야투율. 3점 슈터 우대 지표' },
  'TS%': { short: 'TS%', long: '진실 야투율',   formula: 'PTS / (2 × (FGA + 0.44 × FTA))',
           description: '2점·3점·자유투를 모두 고려한 최고의 슈팅 효율 지표' },
  FTr:   { short: 'FTr', long: '자유투 유도율', formula: 'FTA / FGA',
           description: '야투 시도 대비 자유투 시도 비율. 골밑 침투/파울 유도 지표' },

  // ── 야투 존별 비중 ─────────────────
  DS: { short: 'DS', long: '골밑 비중',    formula: '골밑슛 시도 / FGA', description: '전체 야투 중 골밑슛(포스트/덩크) 시도 비중' },
  LU: { short: 'LU', long: '레이업 비중',  formula: '(레이업+드라이브) / FGA', description: '전체 야투 중 레이업·드라이브 비중' },
  MD: { short: 'MD', long: '미들 비중',    formula: '미들슛 시도 / FGA', description: '전체 야투 중 미드레인지 비중' },
  '3P share': { short: '3P', long: '3점 비중', formula: '3PA / FGA', description: '전체 야투 중 3점 시도 비중' },

  // ── Advanced ─────────────────────────
  'A/T':  { short: 'A/T', long: '어시-턴오버 비율', formula: 'AST / TOV',
            description: '볼 소유 안정성 지표. 높을수록 좋음' },
  'AST%': { short: 'AST%', long: '어시스트 사용률', formula: 'AST / (POSS + AST) × 100',
            description: '본인 볼 소유 중 어시스트로 마무리한 비중' },
  'TOV%': { short: 'TOV%', long: '턴오버 사용률', formula: 'TOV / POSS × 100',
            description: '본인 볼 소유 중 턴오버로 마무리한 비중. 낮을수록 좋음' },
  'USG%': { short: 'USG%', long: '사용률', formula: '100 × (FGA + 0.44 × FTA + TOV) / 팀 소유권',
            description: '본인이 팀 공격에서 볼을 마무리한 비중. 팀의 에이스 지표' },
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
          description: '100 소유당 실점. 낮을수록 좋음' },
  NetRtg: { short: 'NET', long: '순 효율', formula: 'ORtg - DRtg',
            description: '득실 효율 차이. +5 이상이면 강팀' },
  Pace: { short: 'Pace', long: '페이스', formula: '(팀 POSS + 상대 POSS) / 2 / GP',
          description: '경기당 소유권 수 (경기 템포)' },

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
