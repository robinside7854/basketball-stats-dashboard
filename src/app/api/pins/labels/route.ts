import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import type { LabelOption } from '@/types/coachPin'

// GET /api/pins/labels?org=xxx&team=youth → 많이 쓴 라벨 순
// 자동완성 후보. 페이지 진입 시 한 번만 받아 클라이언트에서 필터링한다.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const org = searchParams.get('org')
  const team = searchParams.get('team')
  if (!org || !team) return NextResponse.json({ error: 'org, team 필요' }, { status: 400 })

  const supabase = createClient()
  const { data: teamRow } = await supabase
    .from('teams').select('id').eq('org_slug', org).eq('sub_slug', team).maybeSingle()
  if (!teamRow) return NextResponse.json([])

  const { data, error } = await supabase
    .from('coach_pins').select('label').eq('team_id', teamRow.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Postgres GROUP BY 를 supabase-js 로 직접 표현하기 번거로워 앱에서 집계한다.
  // 팀당 핀 수는 수백 단위라 문제되지 않는다.
  const counts = new Map<string, number>()
  for (const row of (data ?? []) as { label: string }[]) {
    counts.set(row.label, (counts.get(row.label) ?? 0) + 1)
  }
  const out: LabelOption[] = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  return NextResponse.json(out)
}
