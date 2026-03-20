import { createClient } from '@/lib/supabase/client'
import { createServerClient } from '@/lib/supabase/server'
// GET uses anon client (read-only), PUT/DELETE use server client (bypasses RLS)
import { NextResponse } from 'next/server'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createClient()
  const { data, error } = await supabase.from('games').select('*, tournament:tournaments(*)').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServerClient()
  const body = await req.json()
  const { data, error } = await supabase.from('games').update(body).eq('id', id).select('*, tournament:tournaments(*)').single()
  if (error) {
    console.error('[PUT /api/games/[id]] Supabase error:', error)
    return NextResponse.json({ error: error.message, code: error.code, details: error.details }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = createServerClient()
  const { error } = await supabase.from('games').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
