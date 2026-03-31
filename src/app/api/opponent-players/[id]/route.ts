import { createClient } from '@/lib/supabase/client'
import { NextResponse } from 'next/server'

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { error } = await supabase.from('opponent_players').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
