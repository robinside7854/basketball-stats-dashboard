// 동호회 운영 설정 · 기능 스위치 — 정본 (2026-11-10 온볼 플랫폼화 2단계, docs/onball-platform-design.md)
//
// 원칙: **기능은 하나, 동호회마다 다른 점은 설정으로.** 설정이 비어 있으면 지금 미라클 동작과 같아야 한다.
//   · settings / features 는 teams 표의 jsonb 칸(마이그레이션 134). 칸이 아직 없어도 돈다 — select('*') 로 읽고 없으면 기본값.
//   · 기능 스위치를 따로 적지 않은 동호회는 **지금 판정**(월렛 이름이 있으면 월렛 켬 등)을 그대로 쓴다.
//   · 화면·라우트에서 기본값을 다시 적지 말 것 — 이 파일의 loadClub() 하나로 읽는다.
import { cache } from 'react'
import { createClient } from '@/lib/supabase/admin'

export const WEEKDAY_LABELS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'] as const

export interface ClubSettings {
  /** 경기 요일 0(일)~6(토) — 참가신청 창·마감·문구 */
  game_weekday: number
  /** 참가 정원 — null 이면 안내 안 함 */
  capacity: number | null
  /** 한 날 팀 수 */
  team_count: number
  /** 대진 자동 배정 방식 — winner_stays = 승자 잔류·2연속 휴식(미라클) · none = 손으로 */
  rotation: 'winner_stays' | 'none'
  /** 파울 기록 여부 */
  record_fouls: boolean
  /** 소속 방식 */
  roster_mode: Array<'quarter_draft' | 'monthly_regular' | 'fixed'>
  /** 입금자명에 쓸 수 없는 낱말(입금 알림 글에 늘 들어 있는 통장 이름 등) */
  bank_reserved_words: string[]
}

export { FEATURE_KEYS, FEATURE_LABELS, type FeatureKey, type ClubFeatures } from './features'
import type { ClubFeatures } from './features'

/** 지금 미라클 동작 = 기본값 */
export const DEFAULT_SETTINGS: ClubSettings = {
  game_weekday: 6,
  capacity: 18,
  team_count: 3,
  rotation: 'winner_stays',
  record_fouls: false,
  roster_mode: ['quarter_draft', 'monthly_regular'],
  bank_reserved_words: ['모임통장'],
}

export interface ClubRow {
  id: string
  name: string
  org_slug: string
  sub_slug: string | null
  logo_url: string | null
  accent_color: string | null
  is_public: boolean | null
  is_active: boolean | null
  wallet_name: string | null
  settings?: Partial<ClubSettings> | null
  features?: Partial<ClubFeatures> | null
}

export interface Club {
  row: ClubRow
  /** 리그 시스템(새) · 팀 시스템(옛 — 파란날개) */
  system: 'league' | 'legacy'
  settings: ClubSettings
  features: ClubFeatures
  /** settings·features 칸이 DB 에 있는가(마이그레이션 134) — 없으면 화면은 읽기 전용 */
  configurable: boolean
}

type LeagueMeta = { id: string; mode: string | null; rsvp_rules: { game_weekday?: number; capacity?: number } | null; youtube_channel: string | null }

/** 저장된 값이 없을 때의 기능 판정 — 2026-11-10 까지 코드 곳곳에서 하던 판정 그대로 */
function inferFeatures(row: ClubRow, leagues: LeagueMeta[]): ClubFeatures {
  const isLeague = leagues.length > 0
  return {
    wallet: !!row.wallet_name,
    rsvp: leagues.some(l => !!l.rsvp_rules),
    draft: isLeague,
    youtube: leagues.some(l => !!l.youtube_channel),
    tournament: leagues.some(l => l.mode === 'tournament'),
    uniform_photos: isLeague,
    bank_auto: !!row.wallet_name,
    monthly_roster: isLeague,
  }
}

export function buildClub(row: ClubRow, leagues: LeagueMeta[]): Club {
  const rsvp = leagues.find(l => l.rsvp_rules)?.rsvp_rules ?? null
  const settings: ClubSettings = {
    ...DEFAULT_SETTINGS,
    // 이미 시즌 설정에 있던 값은 그걸 기본으로(옛 칸 → 새 칸 순서로 읽는다)
    ...(rsvp?.game_weekday != null ? { game_weekday: rsvp.game_weekday } : {}),
    ...(rsvp?.capacity != null ? { capacity: rsvp.capacity } : {}),
    ...(row.settings ?? {}),
  }
  const features: ClubFeatures = { ...inferFeatures(row, leagues), ...(row.features ?? {}) }
  return {
    row,
    system: leagues.length > 0 ? 'league' : 'legacy',
    settings,
    features,
    configurable: row.settings !== undefined,
  }
}

/** 동호회(teams 한 줄) 하나 — 한 요청 안에서는 한 번만 읽는다 */
export const loadClub = cache(async function loadClub(teamId: string): Promise<Club | null> {
  const sb = createClient()
  const [{ data: row }, { data: leagues }] = await Promise.all([
    sb.from('teams').select('*').eq('id', teamId).maybeSingle(),
    sb.from('leagues').select('id, mode, rsvp_rules, youtube_channel').eq('team_id', teamId),
  ])
  if (!row) return null
  return buildClub(row as ClubRow, (leagues ?? []) as LeagueMeta[])
})

/** 「지난 토요일」 같은 문구용 */
export function weekdayLabel(n: number): string {
  return WEEKDAY_LABELS[((n % 7) + 7) % 7]
}
