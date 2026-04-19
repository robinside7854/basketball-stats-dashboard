import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'
import { getTeamId } from '@/lib/supabase/get-team-id'

export async function GET(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const team = searchParams.get('team')
  let query = supabase.from('tournaments').select('*').order('year', { ascending: false })
  if (team) {
    const teamId = await getTeamId(team)
    if (!teamId) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    query = query.eq('team_id', teamId)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const team = searchParams.get('team')
  const body = await req.json()
  if (team && !body.team_id) {
    const teamId = await getTeamId(team)
    if (!teamId) return NextResponse.json({ error: 'Team not found' }, { status: 404 })
    body.team_id = teamId
  }
  const { data, error } = await supabase.from('tournaments').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
