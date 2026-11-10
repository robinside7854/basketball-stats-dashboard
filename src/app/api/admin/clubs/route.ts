// GET /api/admin/clubs — CEO 콘솔 동호회 목록 (2026-11-10 온볼 플랫폼화 1단계)
//   리그 시스템(미라클)·옛 팀 시스템(파란날개)을 **한 목록**으로 준다. 동호회 = teams 한 줄.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { requireCeoSession } from '@/lib/auth/ceo'
import { buildClub, type ClubRow } from '@/lib/club/settings'
import { CLUB_TEMPLATES } from '@/lib/club/features'
import { parseRosterPaste } from '@/lib/club/rosterPaste'
import { birthFromYymmdd } from '@/lib/auth/loginId'
import { hashPassword } from '@/lib/auth/password'
import { logAudit } from '@/lib/audit'
import { randomInt } from 'node:crypto'

export async function GET() {
  if (!await requireCeoSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = createClient()
  const [teamsR, leaguesR, lpR, pR, accR, tourR] = await Promise.all([
    sb.from('teams').select('*').order('created_at', { ascending: true }),
    sb.from('leagues').select('id, team_id, name, mode, season_year, status, rsvp_rules, youtube_channel'),
    sb.from('league_players').select('team_id, is_guest, is_active'),
    sb.from('players').select('team_id, is_active'),
    sb.from('league_user_accounts').select('team_id, status, role'),
    sb.from('tournaments').select('team_id'),
  ])
  if (teamsR.error) return NextResponse.json({ error: teamsR.error.message }, { status: 500 })
  type L = { id: string; team_id: string | null; name: string; mode: string | null; season_year: number | null; status: string | null; rsvp_rules: { game_weekday?: number; capacity?: number } | null; youtube_channel: string | null }
  const leagues = (leaguesR.data ?? []) as L[]
  const count = <T extends { team_id: string | null }>(rows: T[] | null, id: string, f: (r: T) => boolean = () => true) =>
    (rows ?? []).filter(r => r.team_id === id && f(r)).length
  const clubs = ((teamsR.data ?? []) as ClubRow[]).map(row => {
    const ls = leagues.filter(l => l.team_id === row.id)
    const club = buildClub(row, ls)
    const isLeague = club.system === 'league'
    return {
      id: row.id, name: row.name, org_slug: row.org_slug, sub_slug: row.sub_slug, logo_url: row.logo_url,
      accent_color: row.accent_color, is_public: row.is_public, is_active: row.is_active,
      system: club.system, features: club.features,
      members: isLeague
        ? count(lpR.data as Array<{ team_id: string | null; is_guest: boolean | null; is_active: boolean | null }>, row.id, r => !r.is_guest && r.is_active !== false)
        : count(pR.data as Array<{ team_id: string | null; is_active: boolean | null }>, row.id, r => r.is_active !== false),
      accounts: count(accR.data as Array<{ team_id: string | null; status: string }>, row.id, r => r.status === 'approved'),
      admins: count(accR.data as Array<{ team_id: string | null; status: string; role: string | null }>, row.id, r => r.status === 'approved' && r.role === 'admin'),
      pending: count(accR.data as Array<{ team_id: string | null; status: string }>, row.id, r => r.status === 'pending'),
      seasons: ls.map(l => ({ id: l.id, name: l.name, mode: l.mode, season_year: l.season_year, status: l.status })),
      legacy_tournaments: count(tourR.data as Array<{ team_id: string | null }>, row.id),
    }
  })
  return NextResponse.json({ clubs })
}

// POST /api/admin/clubs — 새 동호회 만들기 마법사 (2026-11-10 온볼 플랫폼화 4단계)
//   { name, org_slug, is_public, template, team_names[], roster_text, admins: [{ name, birth6 }] }
//   한 번에: 동호회(teams) → 첫 시즌(leagues) → 경기 팀(league_teams) → 명단(league_players) → 어드민 계정.
//   리그 시스템으로만 만든다(편집 PIN 없음 — teams.edit_pin 은 NOT NULL 이라 아무도 모르는 값을 넣어 둔다).
//   중간에 실패하면 만든 것을 거꾸로 지운다(반쯤 만든 동호회를 남기지 않는다).
const SLUG_RE = /^[a-z][a-z0-9-]{1,29}$/
const RESERVED = new Set(['admin', 'api', 'league', 'guide', 'youth', 'senior', 'login', 'new'])

export async function POST(req: Request) {
  if (!await requireCeoSession()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!b) return NextResponse.json({ error: '요청이 올바르지 않아요' }, { status: 400 })

  const name = typeof b.name === 'string' ? b.name.normalize('NFC').trim().slice(0, 40) : ''
  const orgSlug = typeof b.org_slug === 'string' ? b.org_slug.trim().toLowerCase() : ''
  const template = b.template === 'record_only' ? 'record_only' : b.template === 'miracle' ? 'miracle' : null
  const isPublic = b.is_public === true
  const teamNames = (Array.isArray(b.team_names) ? b.team_names : [])
    .map(x => typeof x === 'string' ? x.normalize('NFC').trim().slice(0, 20) : '').filter(Boolean)
  const { rows: roster, problems } = parseRosterPaste(typeof b.roster_text === 'string' ? b.roster_text : '')
  const admins = (Array.isArray(b.admins) ? b.admins : []) as Array<{ name?: unknown; birth6?: unknown }>

  const errors: string[] = []
  if (!name) errors.push('동호회 이름을 넣어 주세요')
  if (!SLUG_RE.test(orgSlug) || RESERVED.has(orgSlug)) errors.push('주소는 영문 소문자로 시작하고 영문·숫자·하이픈 2~30자예요')
  if (!template) errors.push('견본을 골라 주세요')
  if (teamNames.length < 2 || teamNames.length > 6) errors.push('팀은 2~6개예요')
  if (new Set(teamNames).size !== teamNames.length) errors.push('팀 이름이 겹쳐요')
  if (problems.length) errors.push(...problems)
  if (roster.length > 200) errors.push('명단은 한 번에 200명까지예요')
  const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, '')
  const adminRows: Array<{ name: string; birth6: string; birth: string }> = []
  for (const a of admins) {
    const an = typeof a.name === 'string' ? a.name.normalize('NFC').trim() : ''
    const ab = typeof a.birth6 === 'string' ? a.birth6.trim() : ''
    if (!an) continue
    const birth = birthFromYymmdd(ab)
    if (!birth) { errors.push(`${an} — 생년월일 6자리가 날짜가 아니에요`); continue }
    if (!roster.some(r => norm(r.name) === norm(an))) { errors.push(`${an} — 명단에 없는 이름이에요`); continue }
    adminRows.push({ name: an, birth6: ab, birth })
  }
  if (adminRows.length === 0) errors.push('어드민을 한 명 이상 정해 주세요')
  if (errors.length) return NextResponse.json({ error: errors.join(' · ') }, { status: 400 })

  const sb = createClient()
  const { data: dup } = await sb.from('teams').select('id').eq('org_slug', orgSlug).limit(1)
  if (dup?.length) return NextResponse.json({ error: `이미 쓰는 주소예요 — ${orgSlug}` }, { status: 409 })

  const tpl = CLUB_TEMPLATES[template!]
  const created: { team?: string; league?: string } = {}
  const undo = async () => {
    if (created.league) {
      await sb.from('league_user_accounts').delete().eq('league_id', created.league)
      await sb.from('league_players').delete().eq('league_id', created.league)
      await sb.from('league_teams').delete().eq('league_id', created.league)
      await sb.from('leagues').delete().eq('id', created.league)
    }
    if (created.team) await sb.from('teams').delete().eq('id', created.team)
  }
  const failWith = async (msg: string) => { await undo(); return NextResponse.json({ error: msg }, { status: 500 }) }

  const { data: team, error: tErr } = await sb.from('teams').insert({
    org_slug: orgSlug, sub_slug: 'main', name, is_active: true, is_public: isPublic,
    edit_pin: String(randomInt(1000, 10000)),
    settings: { ...tpl.settings, team_count: teamNames.length },
    features: tpl.features,
  }).select('id').single()
  if (tErr || !team) return failWith('동호회를 만들지 못했어요')
  created.team = team.id

  const year = new Date(Date.now() + 9 * 3600_000).getUTCFullYear()
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10)
  const { data: league, error: lErr } = await sb.from('leagues').insert({
    team_id: team.id, org_slug: orgSlug, slug: String(year), name: `${name} ${year}`,
    season_year: year, start_date: today, mode: 'league',
  }).select('id').single()
  if (lErr || !league) return failWith('첫 시즌을 만들지 못했어요')
  created.league = league.id

  const { error: ltErr } = await sb.from('league_teams').insert(teamNames.map(n => ({ league_id: league.id, name: n, is_external: false })))
  if (ltErr) return failWith('경기 팀을 만들지 못했어요')

  const adminBirth = new Map(adminRows.map(a => [norm(a.name), a.birth]))
  const players: Array<{ id: string; name: string }> = []
  if (roster.length) {
    const { data: ps, error: pErr } = await sb.from('league_players').insert(roster.map(r => ({
      league_id: league.id, team_id: team.id, name: r.name, position: r.position,
      birth_date: adminBirth.get(norm(r.name)) ?? (r.birth6 ? birthFromYymmdd(r.birth6) : null),
    }))).select('id, name')
    if (pErr) return failWith('명단을 넣지 못했어요')
    players.push(...(ps ?? []))
  }

  const now = new Date().toISOString()
  for (const a of adminRows) {
    const p = players.find(x => norm(x.name) === norm(a.name))
    if (!p) return failWith(`${a.name} 어드민 계정을 만들지 못했어요`)
    const { error: aErr } = await sb.from('league_user_accounts').insert({
      league_id: league.id, team_id: team.id, league_player_id: p.id, login_id: p.name,
      password_hash: hashPassword(a.birth6), status: 'approved', role: 'admin',
      approved_at: now, approved_by: 'CEO(동호회 만들기)',
    })
    if (aErr) return failWith(`${a.name} 어드민 계정을 만들지 못했어요`)
  }

  await logAudit({ req, action: 'club.create', targetTable: 'teams', targetId: team.id, leagueId: league.id,
    detail: { template, teams: teamNames.length, players: players.length, admins: adminRows.map(a => a.name) } })

  return NextResponse.json({ team_id: team.id, league_id: league.id, path: `/league/${orgSlug}/${league.id}` }, { status: 201 })
}
