import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('opponent_teams')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: Request) {
  const supabase = createClient()
  const body = await req.json()
  const { data, error } = await supabase.from('opponent_teams').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
