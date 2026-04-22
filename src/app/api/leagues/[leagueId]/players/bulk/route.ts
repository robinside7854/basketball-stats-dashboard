import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { verifyLeaguePin } from '@/lib/leaguePinAuth'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> }
) {
  const { leagueId } = await params
  if (!await verifyLeaguePin(req, leagueId)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { players } = await req.json()
  if (!Array.isArray(players) || players.length === 0) {
    return NextResponse.json({ error: '선수 목록이 비어 있습니다' }, { status: 400 })
  }

  const rows = players
    .filter((p: { name?: string }) => p.name?.trim())
    .map((p: { name: string; number?: number | null; position?: string | null }) => ({
      league_id: leagueId,
      name: p.name.trim(),
      number: p.number ?? null,
      position: p.position?.trim() || null,
    }))

  if (rows.length === 0) return NextResponse.json({ error: '유효한 선수가 없습니다' }, { status: 400 })

  const supabase = createClient()
  const { data, error } = await supabase.from('league_players').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ inserted: data?.length ?? 0 }, { status: 201 })
}
