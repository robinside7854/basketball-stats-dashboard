import type React from 'react'
import type { LeaguePlayer } from '@/types/league'

// YouTube 영상 제목 규칙. 서버(`lib/youtube/syncYoutubeForLeague`)의 TitleRule 과 같은 축이다.
//   'legacy'  `260919 경기1`              → 그날 1번 슬롯의 대표 영상
//   'quarter' `260905 지피티vs빅현욱 1Q`  → 그 대진의 1쿼터 영상
// **둘 다 살아 있다.** 업로더의 습관이 날마다 달라서, 평소에는 서버가 그날 제목을 보고 고르고
// 어긋난 날에만 운영자가 토스트 버튼으로 다른 쪽을 고른다.
export type YtTitleRule = 'quarter' | 'legacy'

export type ScheduleDate = { id: string; date: string }

export type ResumeEntry = {
  date: string
  gameId: string
  slotNum: number | null
  quarter: number
  /** 영상 재생 위치(초). 영상이 없거나 못 읽었으면 null */
  videoTime: number | null
  /** 그 시각에 재생 중이던 영상 — 돌아왔을 때 다른 영상이면 위치를 옮기지 않는다 */
  videoUrl: string | null
  savedAt: number
}
export type GameSlot = {
  id: string; slot_num: number; date: string; is_complete: boolean; is_started: boolean
  is_exhibition?: boolean
  /** 이 경기에서만 +1 로 치는 선수 (110). 전역 플래그·배타 지정에 더해진다. */
  plus_one_extra_ids?: string[] | null
  /** 선수별 +1 유효 쿼터 (113). 키가 없으면 전 쿼터. `{ "<playerId>": [1,2] }` */
  plus_one_quarters?: Record<string, number[]> | null
  /**
   * 화면 좌우를 뒤집어 그릴 쿼터 (118). `[2,4]` 형태.
   * ⚠ **표시 전용.** home_team_id/away_team_id 와 기록·점수에는 영향이 없다.
   */
  sides_swapped_quarters?: number[] | null
  home_score: number; away_score: number
  /** 대회 상대팀 최종 점수(112) — 마감할 때 손으로 넣는다. null 이면 아직 안 넣은 것. */
  opponent_score_manual?: number | null
  youtube_url?: string | null; youtube_start_offset?: number
  home_team_id?: string | null; away_team_id?: string | null
  quarter_id?: string | null
  home_team?: { id: string; name: string; color: string; is_external?: boolean } | null
  away_team?: { id: string; name: string; color: string; is_external?: boolean } | null
}
export type MinRow = {
  id: string; league_player_id: string; league_game_id: string; out_time: number | null
  /** 선발은 in_time 0 으로 들어간다(doStartGame). 「지난 경기와 같은 선발」이 이걸로 고른다. */
  in_time?: number | null; quarter?: number | null; created_at?: string | null
}
/** 파울 집계용 — /events 응답 중 쓰는 필드만 */
export type FoulRow = { type: string; league_player_id: string | null; team_id: string | null; quarter?: number | null }
export type RosterPlayer = LeaguePlayer & { team_id?: string; is_regular?: boolean }
export type IrregularPlayer = LeaguePlayer & { team_id: string | null; is_regular: boolean | null }

/** 쿼터 번호 → 그 쿼터 영상 */
export type QuarterVideoMap = Record<number, { url: string; start_offset: number }>

/** 지금 화면에서 재생해야 할 영상 (computeActiveVideo 참고) */
export type ActiveVideo = {
  url: string
  startOffset: number
  source: 'quarter' | 'representative'
  /** 폴백 중일 때 그 영상이 몇 쿼터 것인지. 못 알아내면 null — 틀린 번호를 말하느니 안 말한다. */
  representativeQuarter: number | null
}

/** useState 세터 */
export type Setter<T> = React.Dispatch<React.SetStateAction<T>>

/** 「이어서 기록하기」용 지금 장면 — useResumeSession 의 resumeSnapRef */
export type ResumeSnap = { on: boolean; date: string; gameId: string; slotNum: number | null; quarter: number; videoUrl: string | null }
