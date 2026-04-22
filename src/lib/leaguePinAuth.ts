import { createClient } from '@/lib/supabase/admin'

export async function verifyLeaguePin(req: Request, leagueId: string): Promise<boolean> {
  const pin = req.headers.get('X-League-Pin')
  if (!pin) return false
  const supabase = createClient()
  const { data } = await supabase
    .from('leagues')
    .select('id')
    .eq('id', leagueId)
    .eq('edit_pin', pin)
    .maybeSingle()
  return !!data
}
