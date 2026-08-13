'use client'
// HighlightsPlayerPicker — 리그 하이라이트 랜딩의 "선수별 보기" 진입
// UI 는 PlayerPickerGrid(공용)가 전부 담당하고, 여기서는 리그 스코프의
// 데이터 출처와 라우팅 경로만 정한다.
import PlayerPickerGrid from './PlayerPickerGrid'

interface Props {
  leagueId: string
  orgSlug: string
}

export default function HighlightsPlayerPicker({ leagueId, orgSlug }: Props) {
  return (
    <PlayerPickerGrid
      endpoint={`/api/leagues/${leagueId}/players`}
      hrefBase={`/league/${orgSlug}/${leagueId}/highlights/player`}
    />
  )
}
