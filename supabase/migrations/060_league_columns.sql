-- 060_league_columns.sql
--
-- 매거진/칼럼 시스템 스키마
--
-- 목적:
--   주간/월간/분기 리포트를 Claude AI 로 자동 생성 후 관리자 검토 → 발행.
--   선수 이름 · 팀명 · 게임 참조를 마커 형태로 저장 → 렌더 시 클릭 가능 링크로 변환.
--
-- 저장 형식:
--   body_md 는 마크다운 · 선수/팀/게임 참조는 {{p:이름}} / {{t:팀명}} / {{g:YYYY-MM-DD}}
--
-- 발행 워크플로우:
--   generate → status=draft → 관리자 검토 → publish → status=published

CREATE TABLE IF NOT EXISTS league_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID NOT NULL REFERENCES leagues(id) ON DELETE CASCADE,

  -- 리포트 기간
  period_type TEXT NOT NULL CHECK (period_type IN ('weekly', 'monthly', 'quarterly')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- 제목/부제
  title TEXT NOT NULL,
  subtitle TEXT,

  -- 표지
  --   cover_type: 'player' = 선수 프로필 사진 (변형 금지), 'banner' = AI 생성 배너, 'both' = 둘 다
  --   cover_player_id: player 타입일 때 표지 주인공 선수 (반드시 원본 photo_url 그대로 노출)
  --   cover_banner_url: banner 타입일 때 AI 로 생성한 배경 이미지
  cover_type TEXT DEFAULT 'both' CHECK (cover_type IN ('player', 'banner', 'both')),
  cover_player_id UUID REFERENCES league_players(id) ON DELETE SET NULL,
  cover_banner_url TEXT,

  -- 본문 (마크다운 · 참조 마커 포함)
  body_md TEXT NOT NULL,

  -- 메타 (사용된 원본 통계, hero 선수 id, 생성 파라미터 등)
  meta JSONB DEFAULT '{}',

  -- 발행 상태
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,

  -- 편집 이력
  created_by TEXT,        -- 관리자 email 등 (선택)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_league_columns_league_status
  ON league_columns (league_id, status);
CREATE INDEX IF NOT EXISTS idx_league_columns_published_at
  ON league_columns (published_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_league_columns_period
  ON league_columns (league_id, period_type, period_start);

-- RLS: 공개 발행물만 익명 read, draft 는 서비스 role 만
ALTER TABLE league_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "league_columns_public_read_published"
  ON league_columns
  FOR SELECT
  USING (status = 'published');

-- (관리자/편집자 정책은 서비스 role 이 API 를 통해 접근 · anon key 는 아무것도 못 쓰거나 못 읽음)
