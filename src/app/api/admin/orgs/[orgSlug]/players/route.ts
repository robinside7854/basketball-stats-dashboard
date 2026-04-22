import { createClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ orgSlug: string }> }
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orgSlug } = await params
  const supabase = createClient()

  // org_slug에 해당하는 팀 ID 목록 조회
  const { data: teams } = await supabase
    .from('teams')
    .select('id')
    .eq('org_slug', orgSlug)

  if (!teams || teams.length === 0) return NextResponse.json([])

  const teamIds = teams.map(t => t.id)

  const { data: players, error } = await supabase
    .from('players')
    .select('id, name, number, position, team_type')
    .in('team_id', teamIds)
    .eq('is_active', true)
    .order('number')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(players ?? [])
}
