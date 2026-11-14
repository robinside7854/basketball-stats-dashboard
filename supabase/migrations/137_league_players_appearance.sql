-- 137: 미라클 후프스 — 선수 외모(픽셀 캐릭터용). 프로필 사진에서 뽑은 특징만 저장한다(사진 자체는 저장하지 않음).
-- 모양 예: {"skin":"medium","hair":"short","hairColor":"black","facial":"none","glasses":false,"headband":false}
-- 비어 있으면(null) 게임은 기본 캐릭터 그대로.
alter table league_players add column if not exists appearance jsonb;
