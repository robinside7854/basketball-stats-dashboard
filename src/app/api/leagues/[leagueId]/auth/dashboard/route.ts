// GET /api/leagues/[leagueId]/auth/dashboard
//   로그인 유저 개인 화면(/me) 데이터 — **나에게만 있는 것만** 준다 (2026-10-15 정리).
//     · (출석률·마일스톤 체이서는 2026-11-10 응답에서 뺐다 — 화면에서 쓰지 않는다. milestoneChasers 는 빈 배열로 둔다)
//     · 베스트샷 `pinned_clips` · 최근 하이라이트 바로가기 `weekly` · 마지막 출전 `last_played`
//   하루 평균·순위·야투율·트렌드·진행 중 연속 기록은 **선수 카드**(players/[id]/detail)가 정본이다.
//     종전엔 여기서도 따로 세어(순위 자격까지 다른 식으로) 카드와 숫자가 갈렸다 — /me 는 카드를 여는 버튼만 둔다.
//   친선전은 제외(computeLeagueStats · computePerDayStats). 단 last_played 만 친선일 포함 — computeLastPlayed 머리 주석.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { getApprovedSession } from '@/lib/auth/guard'
import { loadClipsByEventIds } from '@/lib/highlights/loader'
import { resolveTeamId } from '@/lib/league/teamScope'
import { computeLastPlayed } from '@/lib/stats/lastPlayed'
import type { HighlightClip } from '@/lib/highlights/types'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  // 쿠키 서명만 믿지 않고 DB 에서 status='approved' 를 매 요청 재확인한다.
  //   이 프로젝트의 원칙이다 — 인증 쿠키가 30일짜리라, 승인을 취소하거나 회원을 내보내도
  //   토큰만 검사하면 그 사람이 최대 30일간 계속 들어온다. 다른 스탯 라우트는 전부
  //   이 규칙을 따르는데 이 라우트만 빠져 있었다(2026-08-05 전수 점검에서 발견).
  const session = await getApprovedSession(leagueId)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const sb = createClient()
  const pid = session.pid

  // (2026-11-10 리뷰) 출석률·마일스톤 체이서는 화면에서 뺀 지 오래라(출석률 카드·마일스톤 보기 삭제, R6) 더는 계산하지 않는다.
  //   종전엔 /me 를 열 때마다 리그 전체 집계 캐시와 분기·경기일 표를 읽었다. 필요해지면 git 기록에서 되살린다.
  const [pinnedClips, lastPlayed] = await Promise.all([
    loadPinnedClips(sb, leagueId, pid),
    // 마지막 출전일(친선 포함) — 내 이벤트만 읽는 가벼운 조회. 실패해도 null
    computeLastPlayed(sb, leagueId, pid),
  ])

  // 2) "최근 하이라이트" · 이 선수가 최근 참여한 라운드로 바로 연결
  //    (2026-10-14) 마지막 출전일(computeLastPlayed)을 그대로 쓴다 — 「어시스트로만 이름이 남은 날」도 출전으로 친다.
  const weekly: { available: boolean; date?: string } = lastPlayed
    ? { available: true, date: lastPlayed.date }
    : { available: false }

  return NextResponse.json({
    pinned_clips: pinnedClips,
    last_played: lastPlayed,
    weekly,
    milestoneChasers: [],
  })
}


/** 내 베스트샷 핀(최대 3) → 재생 가능한 클립. 실패해도 대시보드 전체를 막지 않는다. */
async function loadPinnedClips(
  sb: ReturnType<typeof createClient>, leagueId: string, pid: string,
): Promise<HighlightClip[]> {
  try {
    // 선수는 팀 소유(087) — league_id 가 아니라 team_id 로 찾는다
    const { data } = await sb
      .from('league_players')
      .select('pinned_event_ids')
      .eq('id', pid)
      .eq('team_id', await resolveTeamId(leagueId))
      .maybeSingle()
    const ids = ((data as { pinned_event_ids: string[] | null } | null)?.pinned_event_ids ?? [])
    if (ids.length === 0) return []
    const clips = await loadClipsByEventIds(sb, leagueId, ids)
    const byId = new Map(clips.map(c => [c.event_id, c]))
    // 핀 순서 유지(개수 제한 없음 — 2026-11-02)
    return ids.map(id => byId.get(id)).filter((c): c is HighlightClip => !!c)
  } catch {
    return []
  }
}
