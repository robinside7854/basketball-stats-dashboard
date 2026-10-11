-- =============================================
-- 079_backfill_event_points.sql
-- 저장된 event points 를 룰 계산값으로 교정
-- =============================================
-- 배경
--   득점 계산이 세 갈래로 갈라져 있었고(타입계산 / 저장값 / 저장값우선),
--   미라클 이벤트 3,253건 중 6건에서 저장값이 룰과 어긋났다.
--     · 구범준 shot_post·shot_layup 2건 — 저장 2, 룰 3 (플러스원 미반영)
--     · 변원식 ft_3pt_1 4건            — 저장 1, 룰 2 (3점파울 자유투 1구는 2점)
--   사용자 확인(2026-08-04): 저장값이 잘못됐고 룰이 정본이다.
--
--   단계 2 에서 읽기 경로를 전부 룰 계산으로 통일했으므로, 저장값도 맞춰 두어
--   'points 컬럼'이 두 번째 진실로 남지 않게 한다.
--
-- 미라클 시즌 총득점: 7,108 → 7,114
-- =============================================

UPDATE league_game_events e
   SET points = sub.correct_points
  FROM (
    SELECT ev.id,
           (r.event_points ->> ev.type)::int
             + CASE WHEN ev.is_p1 AND r.bonus_types ? ev.type THEN r.bonus_amount ELSE 0 END
             AS correct_points
      FROM (
        SELECT e2.id, e2.type, e2.result, g.league_id,
               ((g.plus_one_player_id IS NOT NULL AND e2.league_player_id = g.plus_one_player_id)
                OR (g.plus_one_player_id IS NULL AND p.plus_one)) AS is_p1
          FROM league_game_events e2
          JOIN league_games   g ON g.id = e2.league_game_id
          JOIN league_players p ON p.id = e2.league_player_id
         WHERE e2.result = 'made'
      ) ev
      JOIN (
        SELECT id AS league_id,
               rules -> 'event_points'                        AS event_points,
               (rules -> 'plus_one_bonus' ->> 'amount')::int   AS bonus_amount,
               rules -> 'plus_one_bonus' -> 'applies_to'       AS bonus_types
          FROM leagues
      ) r ON r.league_id = ev.league_id
     WHERE (r.event_points ->> ev.type) IS NOT NULL
  ) sub
 WHERE e.id = sub.id
   AND e.points IS DISTINCT FROM sub.correct_points;
