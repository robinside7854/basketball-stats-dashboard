'use client'
// TeamHighlightsPlayerPicker — 팀(대회) 하이라이트 랜딩의 "선수별 보기" 진입
// UI 는 PlayerPickerGrid(공용)와 완전히 동일하고, 데이터 출처(/api/players)와
// 라우팅 경로만 팀 스코프다.
import PlayerPickerGrid from './PlayerPickerGrid'

interface Props {
  org: string
  team: string
}

export default function TeamHighlightsPlayerPicker({ org, team }: Props) {
  return (
    <PlayerPickerGrid
      endpoint={`/api/players?team=${encodeURIComponent(team)}&org=${encodeURIComponent(org)}`}
      hrefBase={`/${org}/${team}/highlights/player`}
    />
  )
}
