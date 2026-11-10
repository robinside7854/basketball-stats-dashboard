// GET/PATCH /api/admin/clubs/[teamId] — CEO 콘솔 동호회 상세 (2026-11-10 온볼 플랫폼화 1·2단계)
//   GET  = 기본 정보 · 운영 설정 · 기능 스위치 · 시즌 · 사람(어드민·가입 대기)
//   PATCH { name?, is_public?, logo_url?, accent_color?, settings?, features? }
//     settings·features 는 마이그레이션 135 칸이 있어야 저장된다(없으면 503 — 화면은 읽기 전용).
import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { createClient } from '@/lib/supabase/admin'
import { requireCeoSession } from '@/lib/auth/ceo'
import { loadClub, FEATURE_KEYS, type ClubSettings, type ClubFeatures } from '@/lib/club/settings'

type Ctx = { params: Promise<{ teamId: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  if (!await requireCeoSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { teamId } = await params
  const club = await loadClub(teamId)
  if (!club) return NextResponse.json({ error: '동호회를 찾을 수 없어요' }, { status: 404 })
  const sb = createClient()
  const [leaguesR, accR, lpR, pR, tourR] = await Promise.all([
    sb.from('leagues').select('id, name, slug, org_slug, mode, season_year, status, games_per_round, rules, rsvp_rules, youtube_channel').eq('team_id', teamId).order('season_year', { ascending: false }),
    sb.from('league_user_accounts').select('id, login_id, status, role, league_player_id, league_players(name)').eq('team_id', teamId),
    sb.from('league_players').select('id', { count: 'exact', head: true }).eq('team_id', teamId).eq('is_guest', false).neq('is_active', false),
    sb.from('players').select('id', { count: 'exact', head: true }).eq('team_id', teamId).neq('is_active', false),
    sb.from('tournaments').select('id, name, year').eq('team_id', teamId).order('year', { ascending: false }),
  ])
  type Acc = { id: string; login_id: string; status: string; role: string | null; league_players: { name: string } | { name: string }[] | null }
  const accs = (accR.data ?? []) as unknown as Acc[]
  const nameOf = (a: Acc) => (Array.isArray(a.league_players) ? a.league_players[0]?.name : a.league_players?.name) ?? a.login_id
  return NextResponse.json({
    club: {
      ...club.row,
      settings: club.settings, features: club.features, system: club.system, configurable: club.configurable,
      wallet_rules: (club.row as unknown as { wallet_rules?: unknown }).wallet_rules ?? null,
      wallet_bank: (club.row as unknown as { wallet_bank?: unknown }).wallet_bank ?? null,
    },
    seasons: leaguesR.data ?? [],
    people: {
      members: club.system === 'league' ? (lpR.count ?? 0) : (pR.count ?? 0),
      accounts: accs.filter(a => a.status === 'approved').length,
      pending: accs.filter(a => a.status === 'pending').length,
      admins: accs.filter(a => a.status === 'approved' && a.role === 'admin').map(a => ({ id: a.id, name: nameOf(a) })),
    },
    legacy_tournaments: tourR.data ?? [],
  }, { headers: { 'Cache-Control': 'no-store' } })
}

function cleanSettings(raw: unknown): Partial<ClubSettings> | string {
  if (!raw || typeof raw !== 'object') return '운영 설정 형식이 맞지 않아요'
  const r = raw as Record<string, unknown>
  const out: Partial<ClubSettings> = {}
  if ('game_weekday' in r) { const n = Number(r.game_weekday); if (!Number.isInteger(n) || n < 0 || n > 6) return '경기 요일이 맞지 않아요'; out.game_weekday = n }
  if ('capacity' in r) { if (r.capacity === null || r.capacity === '') out.capacity = null; else { const n = Number(r.capacity); if (!Number.isInteger(n) || n < 2 || n > 200) return '정원은 2~200 사이로'; out.capacity = n } }
  if ('team_count' in r) { const n = Number(r.team_count); if (!Number.isInteger(n) || n < 2 || n > 12) return '팀 수는 2~12 사이로'; out.team_count = n }
  if ('rotation' in r) { if (r.rotation !== 'winner_stays' && r.rotation !== 'none') return '대진 방식이 맞지 않아요'; out.rotation = r.rotation }
  if ('record_fouls' in r) out.record_fouls = r.record_fouls === true
  if ('roster_mode' in r) {
    const ok = ['quarter_draft', 'monthly_regular', 'fixed']
    if (!Array.isArray(r.roster_mode) || r.roster_mode.some(v => !ok.includes(String(v)))) return '소속 방식이 맞지 않아요'
    out.roster_mode = r.roster_mode as ClubSettings['roster_mode']
  }
  if ('bank_reserved_words' in r) {
    if (!Array.isArray(r.bank_reserved_words)) return '입금자명 금지어 형식이 맞지 않아요'
    out.bank_reserved_words = r.bank_reserved_words.map(v => String(v).trim()).filter(v => v.length >= 2).slice(0, 10)
  }
  return out
}

export async function PATCH(req: Request, { params }: Ctx) {
  if (!await requireCeoSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { teamId } = await params
  const club = await loadClub(teamId)
  if (!club) return NextResponse.json({ error: '동호회를 찾을 수 없어요' }, { status: 404 })
  const body = await req.json().catch(() => ({})) as Record<string, unknown>
  const update: Record<string, unknown> = {}
  if (typeof body.name === 'string') { const n = body.name.trim(); if (n.length < 1 || n.length > 40) return NextResponse.json({ error: '이름은 1~40자' }, { status: 400 }); update.name = n }
  if (typeof body.is_public === 'boolean') update.is_public = body.is_public
  if ('logo_url' in body) update.logo_url = typeof body.logo_url === 'string' && body.logo_url.trim() ? body.logo_url.trim().slice(0, 500) : null
  if (typeof body.accent_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.accent_color)) update.accent_color = body.accent_color
  if ('settings' in body || 'features' in body) {
    if (!club.configurable) return NextResponse.json({ error: 'DB 준비가 필요해요(마이그레이션 135)' }, { status: 503 })
    if ('settings' in body) {
      const s = cleanSettings(body.settings)
      if (typeof s === 'string') return NextResponse.json({ error: s }, { status: 400 })
      update.settings = { ...(club.row.settings ?? {}), ...s }
    }
    if ('features' in body) {
      const f = body.features as Record<string, unknown> | null
      if (!f || typeof f !== 'object') return NextResponse.json({ error: '기능 스위치 형식이 맞지 않아요' }, { status: 400 })
      const out: Partial<ClubFeatures> = { ...(club.row.features ?? {}) }
      for (const k of FEATURE_KEYS) if (k in f) out[k] = f[k] === true
      update.features = out
    }
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: '바꿀 것이 없어요' }, { status: 400 })
  const { error } = await createClient().from('teams').update(update).eq('id', teamId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // 동호회 설정은 그 동호회의 모든 시즌 화면이 읽는다
  const { data: ls } = await createClient().from('leagues').select('id').eq('team_id', teamId)
  for (const l of ls ?? []) revalidateTag(`league-${l.id}`, 'max')
  return NextResponse.json({ ok: true })
}
