-- =============================================
-- 080_standard_ft_rules.sql
-- 표준 룰의 자유투 배점을 실제 동호회 관행에 맞춤
-- =============================================
-- 배경
--   075/077 에서 표준 룰의 자유투를 전부 1점으로 잡았다(FIBA/NBA 기준).
--   그런데 국내 동호회 자체전은 대부분 미라클과 같은 방식을 쓴다 —
--   2점슛 파울은 자유투 1구에 2점, 3점슛 파울은 2점 + 1점.
--   기본값이 반대로 잡혀 있으면 새 동호회를 붙일 때마다 룰을 고쳐야 하고,
--   그건 "무설정으로 동작한다"는 표준화 목표와 어긋난다.
--
-- 변경 (표준 룰 기본값)
--   ft_2pt    1 → 2    2점슛 파울 자유투 1구
--   ft_3pt_1  1 → 2    3점슛 파울 첫 구
--   ft_3pt_2  1        (유지) 3점슛 파울 둘째 구
--   free_throw 1       (유지) 일반 자유투
--
-- plus_one_bonus 는 0 을 유지한다 — 미라클의 만 50세 이상 가산 룰은
-- 팀 구성에 따른 고유 규정이지 표준이 아니다.
--
-- 다른 방식을 쓰는 동호회는 온보딩 때 rules 로 예외를 준다(사용자 확정 2026-08-04).
--
-- 영향 범위
--   · 앞으로 만들어지는 시즌의 기본값
--   · pana-basket-senior — 경기 0건인 스텁이라 표준값으로 함께 갱신
--   · miracle — 이미 명시 값(2/2/1/1)이 있어 영향 없음
-- =============================================

ALTER TABLE leagues ALTER COLUMN rules SET DEFAULT '{
  "event_points": {
    "shot_3p": 3, "shot_2p_mid": 2, "shot_layup": 2, "shot_post": 2,
    "ft_2pt": 2, "ft_3pt_1": 2, "ft_3pt_2": 1, "free_throw": 1,
    "and_one": 1
  },
  "plus_one_bonus": { "amount": 0, "applies_to": ["shot_3p", "shot_2p_mid", "shot_layup", "shot_post"] },
  "round_unit": "game",
  "qualification": { "min_round_ratio": 0.3 },
  "period": { "count": 4, "minutes": 10 },
  "tracking": { "fouls": true, "minutes": true }
}'::jsonb;

-- 기존 표준룰 시즌(경기 0건)도 새 기본값으로 맞춘다.
-- 경기가 기록된 시즌은 건드리지 않는다 — 배점을 바꾸면 과거 기록의 득점이 소급 변경된다.
UPDATE leagues l
   SET rules = l.rules
     || '{"event_points": {
            "shot_3p": 3, "shot_2p_mid": 2, "shot_layup": 2, "shot_post": 2,
            "ft_2pt": 2, "ft_3pt_1": 2, "ft_3pt_2": 1, "free_throw": 1,
            "and_one": 1
          }}'::jsonb
 WHERE (l.rules -> 'event_points' ->> 'ft_2pt') = '1'
   AND NOT EXISTS (SELECT 1 FROM league_games g WHERE g.league_id = l.id);
