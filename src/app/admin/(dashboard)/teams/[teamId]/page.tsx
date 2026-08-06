import { createClient } from '@/lib/supabase/admin'
import { notFound } from 'next/navigation'
import TeamDetailClient from './TeamDetailClient'

// 조직(org) 상세 페이지(/admin/orgs/[orgSlug])가 하던 일 — 팀 이름·PIN 편집, 대회 목록
// 진입 — 을 팀 하나로 좁혀 이곳에 합쳤다. org_slug 는 파란날개처럼 여러 팀이 공유할 수
// 있어 "어느 팀인지"를 특정하지 못했다 — teams.id 는 유일하므로 그 문제가 없다.
export default async function AdminTeamDetailPage({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params
  const supabase = createClient()

  const { data: team, error } = await supabase.from('teams').select('*').eq('id', teamId).maybeSingle()
  // 조회 에러를 "팀 없음"과 같이 취급하면 진짜 장애(네트워크·권한)가 404 뒤에 숨는다.
  if (error) throw new Error(`팀 조회 실패: ${error.message}`)
  if (!team) notFound()

  // 예전 org 상세 페이지는 "대회" 통계를 레거시 tournaments 테이블에서 세었다 —
  // 지금 화면에서 "리그"·"대회"는 leagues.mode 를 가리키는 말이라 다른 개념이다.
  // 두 어휘를 섞으면 숫자가 안 맞아 보이므로, 대회 수는 아래 대회 목록(leagues 테이블)
  // 에서 클라이언트가 직접 센다.
  const { count: playerCount, error: playersError } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('team_id', team.id)
    .eq('is_active', true)
  if (playersError) throw new Error(`선수 수 조회 실패: ${playersError.message}`)

  return <TeamDetailClient team={team} playerCount={playerCount ?? 0} />
}
