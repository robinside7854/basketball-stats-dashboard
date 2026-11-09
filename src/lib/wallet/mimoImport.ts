// 미모바스켓 잔액 옮기기 (2026-11-09 운영진 — docs/mimo-onboarding-plan.md §5)
//   미모 users 표에서 뽑은 「이름 · 포인트 잔액 · 남은 비정규 티켓」을 붙여 넣으면:
//   ① 미리보기 — 온볼 회원과 이름으로 짝짓고(띄어쓰기·대소문자 무시), 지금 온볼 잔액과 나란히 보여 준다.
//   ② 옮기기 — 짝이 맞은 사람만: 잔액은 장부 `opening` 1줄(=「입금한 돈」으로 친다 — 운영진 결정, 환불 대상),
//      비정규 티켓은 0P 짜리 티켓 행으로. 이미 옮긴 사람은 건너뛴다(두 번 눌러도 두 번 들어가지 않는다).
//   ⚠ 이름이 같은 회원이 둘이면 옮기지 않는다(조용히 틀리느니 「확인 필요」로 남긴다).
import { createClient } from '@/lib/supabase/admin'

type SB = ReturnType<typeof createClient>

export const MIMO_REF = 'mimo_import'
export const MIMO_ACTOR = '미모바스켓 이관'

export interface MimoRow { name: string; balance: number; tickets: number }
export type MimoStatus = 'ok' | 'not_found' | 'dup_name' | 'already' | 'empty'
export interface MimoPreview extends MimoRow {
  status: MimoStatus
  player_id: string | null
  onball_name: string | null
  onball_balance: number | null
}

const norm = (s: string) => s.normalize('NFC').replace(/\s+/g, '').toLowerCase()

/** 붙여 넣은 글 → 줄. 쉼표·탭 구분, 숫자의 쉼표·P·원은 지운다. 머리글 줄(잔액이 숫자가 아님)은 건너뛴다. */
export function parseMimoText(text: string): MimoRow[] {
  const out: MimoRow[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const cells = line.includes('\t') ? line.split('\t') : line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/)
    const clean = cells.map(c => c.trim().replace(/^"|"$/g, ''))
    const name = clean[0]
    const num = (v: string | undefined) => Number((v ?? '').replace(/[,P원\s]/g, ''))
    const balance = num(clean[1])
    if (!name || !clean[1] || !Number.isFinite(balance)) continue
    const tickets = clean[2] != null && clean[2] !== '' ? num(clean[2]) : 0
    out.push({ name, balance: Math.trunc(balance), tickets: Number.isFinite(tickets) ? Math.max(0, Math.trunc(tickets)) : 0 })
  }
  return out
}

export async function previewMimo(sb: SB, teamId: string, rows: MimoRow[]): Promise<MimoPreview[]> {
  const [{ data: players }, { data: bals }, { data: done }, { data: doneT }] = await Promise.all([
    sb.from('league_players').select('id, name, is_guest').eq('team_id', teamId),
    sb.from('wallet_balances').select('league_player_id, balance').eq('team_id', teamId),
    sb.from('wallet_ledger').select('league_player_id').eq('team_id', teamId).eq('ref_type', MIMO_REF),
    sb.from('wallet_tickets').select('league_player_id').eq('team_id', teamId).eq('actor_label', MIMO_ACTOR),
  ])
  const byName = new Map<string, Array<{ id: string; name: string }>>()
  for (const p of (players ?? []) as Array<{ id: string; name: string; is_guest: boolean | null }>) {
    if (p.is_guest) continue
    const k = norm(p.name)
    byName.set(k, [...(byName.get(k) ?? []), { id: p.id, name: p.name }])
  }
  const balance = new Map(((bals ?? []) as Array<{ league_player_id: string; balance: number }>).map(b => [b.league_player_id, b.balance]))
  const imported = new Set([...(done ?? []), ...(doneT ?? [])].map(r => (r as { league_player_id: string }).league_player_id))
  return rows.map(r => {
    const hits = byName.get(norm(r.name)) ?? []
    const p = hits.length === 1 ? hits[0] : null
    const status: MimoStatus = hits.length === 0 ? 'not_found' : hits.length > 1 ? 'dup_name'
      : imported.has(p!.id) ? 'already' : r.balance <= 0 && r.tickets <= 0 ? 'empty' : 'ok'
    return { ...r, status, player_id: p?.id ?? null, onball_name: p?.name ?? null, onball_balance: p ? (balance.get(p.id) ?? 0) : null }
  })
}

/** 짝이 맞은(ok) 줄만 옮긴다. 돌려준 값: 옮긴 사람 수 · 잔액 합 · 티켓 합 · 실패 줄. */
export async function applyMimo(sb: SB, teamId: string, rows: MimoRow[], actor: string) {
  const preview = await previewMimo(sb, teamId, rows)
  let people = 0, points = 0, tickets = 0
  const failed: Array<{ name: string; error: string }> = []
  for (const r of preview) {
    if (r.status !== 'ok' || !r.player_id) continue
    if (r.balance > 0) {
      const { error } = await sb.rpc('wallet_apply', {
        p_team_id: teamId, p_player_id: r.player_id, p_kind: 'opening', p_amount: r.balance,
        p_memo: '미모바스켓 잔액 이관', p_ref_type: MIMO_REF, p_ref_id: null, p_actor: actor,
      })
      if (error) { failed.push({ name: r.name, error: error.message }); continue }
      points += r.balance
    }
    if (r.tickets > 0) {
      const { error } = await sb.from('wallet_tickets').insert(Array.from({ length: r.tickets }, () => ({
        team_id: teamId, league_player_id: r.player_id, kind: 'non_regular', price: 0, status: 'active', actor_label: MIMO_ACTOR,
      })))
      if (error) { failed.push({ name: r.name, error: `티켓 — ${error.message}` }); continue }
      tickets += r.tickets
    }
    people++
  }
  return { people, points, tickets, failed }
}
