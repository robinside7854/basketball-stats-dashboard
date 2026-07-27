// GET /api/leagues/[leagueId]/push — 푸시 설정 상태 + VAPID 공개키 + 구독 수
// 클라이언트가 알림 UI 노출 여부와 구독에 필요한 공개키를 받아간다.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { isPushConfigured, getVapidPublicKey } from '@/lib/push/config'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  const configured = isPushConfigured()

  let count = 0
  if (configured) {
    const sb = createClient()
    const { count: c } = await sb
      .from('league_push_subscriptions')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)
    count = c ?? 0
  }

  return NextResponse.json({
    configured,
    publicKey: configured ? getVapidPublicKey() : '',
    count,
  })
}
