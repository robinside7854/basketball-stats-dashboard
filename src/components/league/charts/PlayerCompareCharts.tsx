'use client'
// 선수 비교 모달(PlayerCompareModal)의 레이더 — 6축(공격·수비·리바운드·슈팅·리딩·효율) 두 계열 (2026-10-14).
//   선수 카드와 같은 HexRadar · 같은 정의(lib/stats/hexRadar.ts). 두 선수 모두 detail 기본 기간(전체)이라 모집단이 같다.
import HexRadar from '@/components/league/charts/HexRadar'
import type { HexRadarResult } from '@/lib/stats/hexRadar'

interface PlayerCompareRadarChartProps {
  data1: HexRadarResult
  data2: HexRadarResult
  player1Name: string
  player2Name: string
  color1: string
  color2: string
}

export default function PlayerCompareRadarChart({
  data1, data2, player1Name, player2Name, color1, color2,
}: PlayerCompareRadarChartProps) {
  return (
    <HexRadar
      title="능력치 비교"
      height={250}
      entries={[
        { name: player1Name, color: color1, data: data1 },
        { name: player2Name, color: color2, data: data2 },
      ]}
    />
  )
}
