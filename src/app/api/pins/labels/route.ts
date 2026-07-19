import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LabelOption } from '@/types/coachPin'

const PAGE = 1000

// 팀 핀 라벨 전체 페이지네이션 조회 (Supabase 1000행 캡 대비)
// coach_pins_team_label_idx (team_id, label) 를 타도록 label 오름차순 정렬 유지.
async function fetchAllLabels(
  supabase: SupabaseClient,
  teamId: string,
): Promise<{ label: string }[] | null> {
  const rows: { label: string }[] = []
  for (let pg = 0; ; pg++) {
    const { data: chunk, error } = await supabase
      .from('coach_pins')
      .select('label')
      .eq('team_id', teamId)
      .order('label', { ascending: true })
      .range(pg * PAGE, (pg + 1) * PAGE - 1)
    if (error) return null
    if (chunk && chunk.length > 0) rows.push(...(chunk as { label: string }[]))
    if (!chunk || chunk.length < PAGE) break
  }
  return rows
}

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

  const data = await fetchAllLabels(supabase, teamRow.id)
  if (data === null) return NextResponse.json({ error: '라벨 조회에 실패했습니다' }, { status: 500 })

  // Postgres GROUP BY 를 supabase-js 로 직접 표현하기 번거로워 앱에서 집계한다.
  // 팀당 핀 수는 수백~수천 단위라 문제되지 않는다.
  const counts = new Map<string, number>()
  for (const row of data) {
    counts.set(row.label, (counts.get(row.label) ?? 0) + 1)
  }
  const out: LabelOption[] = [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  return NextResponse.json(out)
}
