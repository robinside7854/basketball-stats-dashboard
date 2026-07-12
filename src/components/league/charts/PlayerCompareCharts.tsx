'use client'
// Recharts 를 초기 번들에서 분리하기 위한 별도 모듈 (dynamic import 대상)
// PlayerCompareModal 이 모달 진입 시점에만 로드
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer, Legend } from 'recharts'

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
  return (
    <ResponsiveContainer width="100%" height={240}>
      <RadarChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
        <PolarGrid stroke="#374151" />
        <PolarAngleAxis dataKey="stat" tick={{ fill: '#d1d5db', fontSize: 11, fontWeight: 600 }} />
        <Radar name={player1Name} dataKey={player1Name} stroke={color1} fill={color1} fillOpacity={0.25} strokeWidth={2} />
        <Radar name={player2Name} dataKey={player2Name} stroke={color2} fill={color2} fillOpacity={0.25} strokeWidth={2} />
        <Legend wrapperStyle={{ fontSize: 11, color: '#9ca3af' }} />
      </RadarChart>
    </ResponsiveContainer>
  )
}
