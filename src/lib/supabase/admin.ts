import { createClient as supabaseCreateClient } from '@supabase/supabase-js'

// Service Role 클라이언트 — 서버사이드 전용, RLS 우회
export function createClient() {
  return supabaseCreateClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
