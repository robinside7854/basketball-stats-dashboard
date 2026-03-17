import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const supabase = createClient()
  const { searchParams } = new URL(req.url)
  const tournamentId = searchParams.get('tournamentId')
  let query = supabase.from('games').select('*, tournament:tournaments(*)').order('date', { ascending: false })
  if (tournamentId) query = query.eq('tournament_id', tournamentId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = createClient()
  const body = await req.json()
  const { data, error } = await supabase.from('games').insert(body).select('*, tournament:tournaments(*)').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
