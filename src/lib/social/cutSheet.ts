// 릴스 컷 시트 — 라운드의 하이라이트/클러치 클립을 '유튜브 링크(그 시점 점프) + 시작~끝 + 상황'
// 목록으로. 앱은 영상을 저장하지 않고 유튜브 URL + 타임스탬프만 가지므로, 이를 CapCut 편집용
// 컷 시트로 뽑아준다. (실제 트리밍/합치기는 유튜브 약관상 사용자가 편집 툴에서 수행)
import { createClient } from '@/lib/supabase/admin'
import { loadRoundDetail } from '@/lib/highlights/loader'

export type CutClip = {
  start: number
  durationSec: number
  timeLabel: string          // mm:ss (클립 시작)
  player: string
  team: string
  teamColor: string
  typeLabel: string          // 3점 / 레이업 …
  points: number
  assist: string | null
  isClutch: boolean
  clutchKind: string | null
  scoreLabel: string         // 슛 직후 스코어 (home-away)
  youtubeUrl: string         // 시작 시점으로 점프하는 링크
}
export type CutSheetGame = {
  videoId: string
  youtubeUrl: string
  label: string              // 홈 vs 원정
  clips: CutClip[]
}

const SHOT_KO: Record<string, string> = {
  shot_3p: '3점', shot_2p_mid: '미드레인지', shot_layup: '레이업', shot_post: '골밑',
  and_one: '앤드원', free_throw: '자유투', ft_2pt: '자유투', ft_3pt_1: '자유투', ft_3pt_2: '자유투',
}
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export async function getRoundCutSheet(leagueId: string, date: string): Promise<CutSheetGame[]> {
  const sb = createClient()
  const detail = await loadRoundDetail(sb, leagueId, date)
  const byVideo = new Map<string, CutSheetGame>()
  for (const c of detail.clips) {
    if (!c.video_id || !c.video_url) continue
    if (!byVideo.has(c.video_id)) {
      byVideo.set(c.video_id, { videoId: c.video_id, youtubeUrl: c.video_url, label: `${c.home_team_name} vs ${c.away_team_name}`, clips: [] })
    }
    const start = c.clip_start ?? c.video_timestamp
    const end = c.clip_end ?? start + 6
    byVideo.get(c.video_id)!.clips.push({
      start,
      durationSec: Math.max(1, Math.round(end - start)),
      timeLabel: mmss(start),
      player: c.player_name,
      team: c.team_name,
      teamColor: c.team_color,
      typeLabel: SHOT_KO[c.shot_type] ?? c.shot_type,
      points: c.points,
      assist: c.assist_player_name ?? null,
      isClutch: c.is_clutch ?? false,
      clutchKind: c.clutch_kind ?? null,
      scoreLabel: `${c.score_home_after}-${c.score_away_after}`,
      youtubeUrl: `https://www.youtube.com/watch?v=${c.video_id}&t=${Math.floor(start)}s`,
    })
  }
  for (const g of byVideo.values()) g.clips.sort((a, b) => a.start - b.start)
  return [...byVideo.values()]
}
