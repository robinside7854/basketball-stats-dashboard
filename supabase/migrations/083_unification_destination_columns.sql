-- =============================================
-- 083_unification_destination_columns.sql
-- 대회형→리그형 통일 단계 A — 목적지 컬럼 준비
-- =============================================
-- 배경
--   파란날개(대회형)를 리그 구조로 옮긴다. 레거시 테이블에만 있는 필드를
--   그냥 두고 옮기면 실제로 값이 있는 기록이 사라진다. 실측 결과:
--     games.venue        50중 33건
--     games.round        43건 (조별예선·8강·결승 …)
--     games.ai_mvp       44건
--     tournaments.type   12건 (amateur 7 / pro 5)
--     tournaments.description 12건 전부
--     players.height_cm  68명 전원 (164~195)
--     players.is_pro     7명 (화면에 '선출' 배지로 노출 중)
--     players.is_active  비활성 3명
--   버리는 것: players.weight_kg(0건) · games.notes(0건) · game_events.notes(0건)
--
-- 이 마이그레이션은 ADD COLUMN 과 COMMENT 만 한다.
--   데이터 이동 없음. 기존 행·기존 INSERT 문 전부 그대로 동작한다
--   (전부 nullable 이거나 기본값 보유).
-- =============================================

-- ── 경기 ─────────────────────────────────────
-- round_label 로 이름을 바꾼 이유: league_games 에는 이미 round_num(일정 슬롯
--   번호)이 있다. 레거시의 round('8강','결승')를 같은 이름으로 넣으면 두 개념이
--   한 이름을 두고 싸운다.
ALTER TABLE league_games ADD COLUMN IF NOT EXISTS venue       TEXT;
ALTER TABLE league_games ADD COLUMN IF NOT EXISTS round_label TEXT;
ALTER TABLE league_games ADD COLUMN IF NOT EXISTS ai_mvp      JSONB;

COMMENT ON COLUMN league_games.venue       IS '경기장. 대회형에서 주로 쓴다(리그형은 홈코트 고정이라 비는 경우가 많다).';
COMMENT ON COLUMN league_games.round_label IS '토너먼트 라운드 표기(조별예선·16강·8강·4강·준결승·결승). 일정 슬롯 번호인 round_num 과 다른 개념.';
COMMENT ON COLUMN league_games.ai_mvp      IS 'AI 가 쓴 경기 MVP 코멘트(jsonb). 레거시 games.ai_mvp 에서 이관.';

-- ── 선수 ─────────────────────────────────────
-- is_pro / is_active 는 NOT NULL + 기본값으로 둔다. 기존 리그 선수 45명은
--   자동으로 '비선출·활동중'이 되는데, 이는 현재 화면이 암묵적으로 가정하던 값과 같다.
ALTER TABLE league_players ADD COLUMN IF NOT EXISTS height_cm INTEGER;
ALTER TABLE league_players ADD COLUMN IF NOT EXISTS is_pro    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE league_players ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN league_players.height_cm IS '키(cm). 레거시 players.height_cm 에서 이관 — 68명 전원 실측값 보유.';
COMMENT ON COLUMN league_players.is_pro    IS '선출(선수 출신) 여부. 명단 화면에 배지로 노출.';
COMMENT ON COLUMN league_players.is_active IS '활동 중 여부. false 면 명단에서 내리되 과거 기록은 유지한다.';

-- ── 세그먼트(대회) ───────────────────────────
-- 대회는 새 테이블을 만들지 않고 league_quarters(kind='tournament') 로 담는다.
--   076 이 이미 kind 를 일반화하며 'tournament' 를 값으로 넣어 뒀다 — 설계는 그때 끝나 있었다.
ALTER TABLE league_quarters ADD COLUMN IF NOT EXISTS tournament_type TEXT;
ALTER TABLE league_quarters ADD COLUMN IF NOT EXISTS description     TEXT;

-- ⚠ Postgres 에서 큰따옴표는 문자열이 아니라 식별자다. 주석 안에 작은따옴표를
--   써야 하므로 '' 로 이스케이프한다.
COMMENT ON COLUMN league_quarters.tournament_type IS '대회 성격(''pro''|''amateur''). kind=''tournament'' 일 때만 의미가 있다.';
COMMENT ON COLUMN league_quarters.description     IS '대회 설명. 레거시 tournaments.description 에서 이관.';

-- ── 이관 추적용 임시 컬럼 ────────────────────
-- ⚠ 단계 D(레거시 정리)에서 전부 제거한다. 영구 스키마가 아니다.
--   두 가지 때문에 둔다:
--   1) 멱등성 — 이관 스크립트를 두 번 돌려도 중복이 안 생긴다(있으면 갱신).
--   2) 대조 가능성 — 총합만 맞고 개별 행이 어긋나는 사고를 잡으려면
--      원본 행과 사본 행을 1:1 로 맞춰볼 수 있어야 한다.
ALTER TABLE league_games       ADD COLUMN IF NOT EXISTS legacy_id UUID;
ALTER TABLE league_players     ADD COLUMN IF NOT EXISTS legacy_id UUID;
ALTER TABLE league_quarters    ADD COLUMN IF NOT EXISTS legacy_id UUID;
ALTER TABLE league_teams       ADD COLUMN IF NOT EXISTS legacy_id UUID;
ALTER TABLE league_game_events ADD COLUMN IF NOT EXISTS legacy_id UUID;

COMMENT ON COLUMN league_games.legacy_id       IS '[임시·단계D에서 제거] 이관 원본 games.id';
COMMENT ON COLUMN league_players.legacy_id     IS '[임시·단계D에서 제거] 이관 원본 players.id';
COMMENT ON COLUMN league_quarters.legacy_id    IS '[임시·단계D에서 제거] 이관 원본 tournaments.id';
COMMENT ON COLUMN league_teams.legacy_id       IS '[임시·단계D에서 제거] 이관 원본 teams.id 또는 외부팀 생성 근거';
COMMENT ON COLUMN league_game_events.legacy_id IS '[임시·단계D에서 제거] 이관 원본 game_events.id';

-- 부분 유니크 인덱스 — 같은 원본 행이 두 번 복사되는 걸 DB 가 막는다.
--   스크립트의 "있으면 갱신" 로직이 경합이나 버그로 뚫려도 여기서 걸린다.
--   WHERE 절로 NULL(기존 리그 데이터 전체)은 인덱스 밖에 둔다 — 기존 행 45명·271경기는
--   legacy_id 가 전부 NULL 이므로 이 제약의 영향을 받지 않는다.
CREATE UNIQUE INDEX IF NOT EXISTS league_games_legacy_id_uniq       ON league_games(legacy_id)       WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS league_players_legacy_id_uniq     ON league_players(legacy_id)     WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS league_quarters_legacy_id_uniq    ON league_quarters(legacy_id)    WHERE legacy_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS league_game_events_legacy_id_uniq ON league_game_events(legacy_id) WHERE legacy_id IS NOT NULL;
-- league_teams 는 유니크를 걸지 않는다 — 외부 상대팀은 같은 레거시 근거(teams.id)를
--   여러 리그에 걸쳐 만들 수 있어 1:1 이 아니다.
