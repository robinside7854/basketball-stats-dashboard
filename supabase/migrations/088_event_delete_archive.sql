-- 088 · 기록 삭제 시 자동 스냅샷
--
-- 배경: 2026-08-07, 파란날개 대회 기록 화면의 "초기화"(resetGame)가 game_events 161건과
--       player_minutes 30건을 하드 DELETE 했다. 소프트 삭제도 백업 테이블도 없어서
--       일일 백업을 새 프로젝트로 복원해 되살려야 했다.
--
-- 대책: 라우트가 아니라 테이블에 트리거를 건다. 어떤 경로로 지워지든(앱·SQL 에디터·
--       스크립트) 지워진 행이 *_archive 에 그대로 남는다.
--
-- 아카이브 테이블은 원본 컬럼 + archived_at + archive_txid 순서여야 한다
--   (트리거가 `select ($1).*, now(), txid_current()` 로 밀어넣기 때문).
-- FK 를 일부러 복사하지 않는다 — 선수가 지워져도 아카이브는 살아남아야 한다.

CREATE OR REPLACE FUNCTION public.archive_deleted_row()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE format(
    'INSERT INTO public.%I SELECT ($1).*, now(), txid_current()',
    TG_TABLE_NAME || '_archive'
  ) USING OLD;
  RETURN OLD;
END;
$$;

-- 리그 트리는 경기 참조 컬럼 이름이 다르다(league_game_id) — 인덱스를 걸 컬럼을 함께 적는다.
DO $$
DECLARE
  rec RECORD;
  t   TEXT;
BEGIN
  FOR rec IN
    SELECT * FROM (VALUES
      ('game_events',          'game_id'),         -- 대회(파란날개) 트리
      ('player_minutes',       'game_id'),
      ('league_game_events',   'league_game_id'),  -- 리그(미라클) 트리 — 같은 초기화 버튼이 있다
      ('league_player_minutes','league_game_id')
    ) AS v(tbl, gcol)
  LOOP
    t := rec.tbl;
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I (LIKE public.%I INCLUDING DEFAULTS)',
      t || '_archive', t
    );
    EXECUTE format(
      'ALTER TABLE public.%I
         ADD COLUMN IF NOT EXISTS archived_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
         ADD COLUMN IF NOT EXISTS archive_txid BIGINT',
      t || '_archive'
    );
    -- 아카이브는 서버(service role) 전용이다. RLS 켜고 정책을 두지 않으면
    -- anon/authenticated 로는 한 행도 읽히지 않는다.
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t || '_archive');

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (%I, archived_at DESC)',
      'idx_' || t || '_archive_game', t || '_archive', rec.gcol
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (archived_at DESC)',
      'idx_' || t || '_archive_at', t || '_archive'
    );

    EXECUTE format('DROP TRIGGER IF EXISTS trg_archive_delete ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_archive_delete AFTER DELETE ON public.%I
         FOR EACH ROW EXECUTE FUNCTION public.archive_deleted_row()',
      t
    );
  END LOOP;
END;
$$;
