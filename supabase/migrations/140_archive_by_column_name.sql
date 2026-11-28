-- 2026-11-28: 138 에서 league_game_events 에 device 칸을 더하자 삭제 보관 트리거(칸 순서로 복사)가
-- 보관 표와 칸 수가 어긋나 모든 기록 삭제·「취소」가 실패했다. 보관을 칸 이름으로 맞추게 바꾼다.
ALTER TABLE league_game_events_archive ADD COLUMN IF NOT EXISTS device text;

CREATE OR REPLACE FUNCTION public.archive_deleted_row()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  EXECUTE format(
    'INSERT INTO public.%I SELECT * FROM jsonb_populate_record(NULL::public.%I, $1)',
    TG_TABLE_NAME || '_archive', TG_TABLE_NAME || '_archive'
  ) USING (to_jsonb(OLD) || jsonb_build_object('archived_at', now(), 'archive_txid', txid_current()));
  RETURN OLD;
END;
$function$;
