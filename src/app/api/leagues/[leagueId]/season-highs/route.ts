// GET /api/leagues/[leagueId]/season-highs
//
// 시즌(또는 특정 분기) 내 각 카테고리별 라운드 최고 기록 낸 선수 1인 반환.
// personal-highs 는 "선수별 개인 최고" 라 별도 유지 · 여기는 "카테고리별 리그 리더".
//
// Query:
//   quarterId?: 특정 분기 필터 (없으면 시즌 전체)
//
// 응답:
//   {
//     quarter: { id, year, quarter } | null,
//     categoryHighs: [
//       { category: 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK' | 'FG3M',
//         label: string,
//         value: number,
//         player: { player_id, name, number, photo_url, position },
//         date: string   // YYYY-MM-DD
//       }
//     ]
//   }
//
// 계산: 라운드(=일자) 단위 stats 에서 각 카테고리 top1 (동률이면 최근 일자 우선).
//   - 친선전(is_exhibition) 제외
//   - is_started=true 만 (마감 여부와 무관하게 시작된 게임 전체 포함)
//   - +1(plus_one) 선수 득점 가중 적용

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/admin'
import { canViewStats } from '@/lib/auth/guard'

const SHOT_TYPES = ['shot_3p', 'shot_2p_mid', 'shot_layup', 'shot_post'] as const

type CategoryKey = 'pts' | 'reb' | 'ast' | 'stl' | 'blk' | 'fg3m' | 'fga' | 'fgm'

interface CategoryHigh {
  category: 'PTS' | 'REB' | 'AST' | 'STL' | 'BLK' | 'FG3M' | 'FGA' | 'FGM'
  label: string
  value: number
  player: {
    player_id: string
    name: string
    number: number | null
    position: string | null
    photo_url: string | null
  }
  date: string
}

type PlayerRow = {
  id: string
  name: string
  number: number | null
  position: string | null
  photo_url: string | null
  plus_one: boolean | null
  is_guest: boolean | null
}

type GameRow = {
  id: string
  date: string
  quarter_id: string | null
  plus_one_player_id: string | null
}

type EventRow = {
  league_player_id: string | null
  related_player_id: string | null
  type: string
  result: string | null
  league_game_id: string
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ leagueId: string }> },
) {
  const { leagueId } = await params
  // 스탯 게이팅 — 승인 회원 또는 편집 PIN 전용 (2026-07-28)
  if (!(await canViewStats(req, leagueId))) {
    return NextResponse.json({ error: 'login_required' }, { status: 401 })
  }
  const sp = new URL(req.url).searchParams
  const quarterId = sp.get('quarterId')
  const supabase = createClient()

  // 1-3) 선수 메타 · 게임 · 분기 메타 병렬 실행 — 서로 독립적.
  let gQuery = supabase
    .from('league_games')
    .select('id, date, quarter_id, plus_one_player_id')
    .eq('league_id', leagueId)
    .eq('is_started', true)
    .eq('is_exhibition', false)
  if (quarterId) gQuery = gQuery.eq('quarter_id', quarterId)

  const quarterMetaQuery = quarterId
    ? supabase.from('league_quarters').select('id, year, quarter').eq('id', quarterId).single()
    : Promise.resolve({ data: null } as { data: { id: string; year: number; quarter: number } | null })

  const [
    { data: playerRows },
    { data: gamesRaw },
    quarterMetaRes,
  ] = await Promise.all([
    supabase
      .from('league_players')
      .select('id, name, number, position, photo_url, plus_one, is_guest')
      .eq('league_id', leagueId),
    gQuery,
    quarterMetaQuery,
  ])

  const players = (playerRows ?? []) as PlayerRow[]
  const plusOneSet = new Set(players.filter(p => p.plus_one).map(p => p.id))
  const playerMeta = new Map<string, PlayerRow>()
  for (const p of players) playerMeta.set(p.id, p)
  const games = (gamesRaw ?? []) as GameRow[]
  const quarterInfo = (quarterMetaRes?.data ?? null) as { id: string; year: number; quarter: number } | null

  const gameIds = games.map(g => g.id)
  if (gameIds.length === 0) {
    return NextResponse.json({ quarter: quarterInfo, categoryHighs: [] })
  }

  const gameById = new Map<string, GameRow>()
  for (const g of games) gameById.set(g.id, g)

  // 4) 이벤트 페이지네이션
  const events: EventRow[] = []
  const PAGE = 1000
  for (let pg = 0; ; pg++) {
    const { data: chunk } = await supabase
      .from('league_game_events')
      .select('league_player_id, related_player_id, type, result, league_game_id')
      .in('league_game_id', gameIds)
      .not('league_player_id', 'is', null)
      .order('id', { ascending: true })
      .range(pg * PAGE, (pg + 1) * PAGE - 1)
    if (!chunk || chunk.length === 0) break
    events.push(...(chunk as EventRow[]))
    if (chunk.length < PAGE) break
  }

  // 5) per-(pid, date) 스탯 집계 — 라운드(일자) 단위
  //    같은 날 여러 슬롯이 있으면 하루 스탯으로 합산
  type DayStat = Record<CategoryKey, number>
  const emptyDay = (): DayStat => ({ pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fg3m: 0, fga: 0, fgm: 0 })
  const dayStats = new Map<string, Map<string, DayStat>>() // pid → date → stats

  const ensure = (pid: string, date: string): DayStat => {
    let byDate = dayStats.get(pid)
    if (!byDate) { byDate = new Map(); dayStats.set(pid, byDate) }
    let s = byDate.get(date)
    if (!s) { s = emptyDay(); byDate.set(date, s) }
    return s
  }

  for (const e of events) {
    const pid = e.league_player_id
    if (!pid) continue
    const g = gameById.get(e.league_game_id)
    if (!g) continue
    const date = g.date
    // +1 선수 득점 가중: 게임별 지정 우선 → 없으면 시즌 플래그
    const gpo = g.plus_one_player_id
    const isP1 = gpo !== null ? pid === gpo : plusOneSet.has(pid)
    const made = e.result === 'made'
    const s = ensure(pid, date)

    switch (e.type) {
      case 'shot_3p':
        s.fga++
        if (made) { s.fgm++; s.fg3m++; s.pts += isP1 ? 4 : 3 }
        break
      case 'shot_2p_mid':
      case 'shot_layup':
      case 'shot_post':
        s.fga++
        if (made) { s.fgm++; s.pts += isP1 ? 3 : 2 }
        break
      case 'and_one':
        if (made) s.pts += 1
        break
      case 'ft_2pt':
      case 'ft_3pt_1':
        if (made) s.pts += 2
        break
      case 'free_throw':
      case 'ft_3pt_2':
        if (made) s.pts += 1
        break
      case 'oreb':
      case 'dreb':
        s.reb++
        break
      case 'steal': s.stl++; break
      case 'block': s.blk++; break
    }
    // 어시스트 (related_player_id)
    if (made && e.related_player_id && (SHOT_TYPES as readonly string[]).includes(e.type)) {
      const asDay = ensure(e.related_player_id, date)
      asDay.ast++
    }
  }

  // 6) 카테고리별 top1 (동률: 최근 date 우선)
  //    게스트 선수도 카테고리 리더가 될 수 있음 (시즌 커리어하이 성격 · 어워드 아님)
  const categories: { key: CategoryKey; category: CategoryHigh['category']; label: string }[] = [
    { key: 'pts',  category: 'PTS',  label: '득점' },
    { key: 'reb',  category: 'REB',  label: '리바운드' },
    { key: 'ast',  category: 'AST',  label: '어시스트' },
    { key: 'stl',  category: 'STL',  label: '스틸' },
    { key: 'blk',  category: 'BLK',  label: '블락' },
    { key: 'fg3m', category: 'FG3M', label: '3점 성공' },
    { key: 'fga',  category: 'FGA',  label: '야투 시도' },
    { key: 'fgm',  category: 'FGM',  label: '야투 성공' },
  ]

  const categoryHighs: CategoryHigh[] = []
  for (const c of categories) {
    let bestValue = 0
    let bestPid: string | null = null
    let bestDate: string | null = null
    for (const [pid, byDate] of dayStats.entries()) {
      for (const [date, s] of byDate.entries()) {
        const v = s[c.key]
        if (v <= 0) continue
        // 큰 값이 우선. 동률이면 date 문자열 desc 비교 (YYYY-MM-DD 는 문자열 비교로 시간순 정렬됨)
        if (
          v > bestValue ||
          (v === bestValue && (bestDate === null || date > bestDate))
        ) {
          bestValue = v
          bestPid = pid
          bestDate = date
        }
      }
    }
    if (bestPid && bestDate) {
      const meta = playerMeta.get(bestPid)
      if (meta) {
        categoryHighs.push({
          category: c.category,
          label: c.label,
          value: bestValue,
          player: {
            player_id: bestPid,
            name: meta.name,
            number: meta.number,
            position: meta.position,
            photo_url: meta.photo_url,
          },
          date: bestDate,
        })
      }
    }
  }

  return NextResponse.json({ quarter: quarterInfo, categoryHighs })
}
