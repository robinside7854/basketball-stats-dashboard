'use client'
// 선수 비교 모달(PlayerCompareModal)의 레이더 — 리그 백분위 두 계열.
// 2026-10-12 리뉴얼 5단계: recharts → 자체 인라인 SVG(`components/league/ui/charts.tsx`). 범례·색·축은 그대로.
import { RadarChart } from '@/components/league/ui/charts'

type RadarDataPoint = { stat: string } & Record<string, number | string>

interface PlayerCompareRadarChartProps {
  data: RadarDataPoint[]
  player1Name: string
  player2Name: string
  color1: string
  color2: string
}

export default function PlayerCompareRadarChart({
  data, player1Name, player2Name, color1, color2,
}: PlayerCompareRadarChartProps) {
  const vals = (key: string) => data.map(d => Number(d[key]) || 0)
  return (
    <RadarChart
      axes={data.map(d => d.stat)}
      series={[
        { name: player1Name, values: vals(player1Name), stroke: color1, fill: color1, fillOpacity: 0.25 },
        { name: player2Name, values: vals(player2Name), stroke: color2, fill: color2, fillOpacity: 0.25 },
      ]}
      max={100}
      height={240}
      label="리그 백분위 비교"
    />
  )
}
