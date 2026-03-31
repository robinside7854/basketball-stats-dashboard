import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get('teamId')
  let query = supabase.from('opponent_games').select('*').order('date', { ascending: false })
  if (teamId) query = query.eq('opponent_team_id', teamId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = createClient()
  const body = await req.json()
  const { data, error } = await supabase.from('opponent_games').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
