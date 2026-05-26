'use client'
import { useEffect, useState } from 'react'
import { Trophy, ShieldCheck, Flame, HandCoins, Target, Activity, Zap, TrendingUp } from 'lucide-react'

type DayRecord = { date: string; value: number; vs: string; score: string } | null

type Insights = {
  team_total: Record<string, number>
  opp_total: Record<string, number>
  game_count: number
  day_count: number
  records: {
    most_points_day:  DayRecord
    fewest_allowed:   DayRecord
    biggest_win:      DayRecord
    most_ast_day:     DayRecord
    most_3pm_day:     DayRecord
    most_stl_blk_day: DayRecord
    most_reb_day:     DayRecord
  }
  four_factors: {
    efg:  { team: number; opp: number }
    tov:  { team: number; opp: number }
    orb:  { team: number; opp: number }
    ftr:  { team: number; opp: number }
  } | null
  advanced: {
    ortg: number; drtg: number; net_rtg: number; pace: number
    team_poss: number; opp_poss: number
  } | null
}

interface Props {
  leagueId: string
  teamId: string
  quarterId: string | 'all'
  teamColor: string
}

export default function TeamInsights({ leagueId, teamId, quarterId, teamColor }: Props) {
  const [data, setData] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const qp = quarterId !== 'all' ? `?quarterId=${quarterId}` : ''
    fetch(`/api/leagues/${leagueId}/teams/${teamId}/insights${qp}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }, [leagueId, teamId, quarterId])

  if (loading) return <p className="text-xs text-gray-500 py-3">불러오는 중...</p>
  if (!data || data.game_count === 0) {
    return <p className="text-xs text-gray-500 py-3 text-center">완료된 경기가 없어 인사이트를 계산할 수 없습니다.</p>
  }

  const { records, four_factors: ff, advanced: adv } = data

  // 단일 일자 기록 카드
  const recordCards: { key: string; label: string; record: DayRecord; icon: React.ReactNode; color: string; suffix?: string; vsLabel?: string }[] = [
    { key: 'pts',     label: '최다 득점 일자',  record: records.most_points_day, icon: <Flame size={14} />,       color: '#f97316', suffix: '점' },
    { key: 'allowed', label: '최소 실점 일자',  record: records.fewest_allowed,  icon: <ShieldCheck size={14} />, color: '#22c55e', suffix: '점 허용', vsLabel: 'vs' },
    { key: 'win',     label: '최대 승점차',     record: records.biggest_win,     icon: <Trophy size={14} />,      color: '#facc15', suffix: '점 차' },
    { key: 'ast',     label: '최다 어시스트',   record: records.most_ast_day,    icon: <HandCoins size={14} />,   color: '#3b82f6', suffix: 'AST' },
    { key: '3pm',     label: '최다 3점슛',      record: records.most_3pm_day,    icon: <Target size={14} />,      color: '#eab308', suffix: '3PM' },
    { key: 'stlblk',  label: '최다 STL+BLK',    record: records.most_stl_blk_day, icon: <Zap size={14} />,        color: '#a855f7', suffix: '회' },
    { key: 'reb',     label: '최다 리바운드',   record: records.most_reb_day,    icon: <Activity size={14} />,    color: '#06b6d4', suffix: 'REB' },
  ]

  // Four Factors (Dean Oliver / Basketball Reference)
  const ffRows = ff ? [
    { label: 'eFG%',      tooltip: '유효 야투율 — (FGM + 0.5×3PM) / FGA',           team: ff.efg.team,  opp: ff.efg.opp,  suffix: '%', higherBetter: true  },
    { label: 'TOV%',      tooltip: '턴오버 비율 — TOV / (FGA + 0.44×FTA + TOV)',     team: ff.tov.team,  opp: ff.tov.opp,  suffix: '%', higherBetter: false },
    { label: 'ORB%',      tooltip: '공격리바운드 점유율 — ORB / (ORB + opp DRB)',    team: ff.orb.team,  opp: ff.orb.opp,  suffix: '%', higherBetter: true  },
    { label: 'FT/FGA',    tooltip: '자유투 시도 비율 — FTA / FGA (얼마나 라인까지 가는가)', team: ff.ftr.team, opp: ff.ftr.opp, suffix: '%', higherBetter: true },
  ] : []

  return (
    <div className="space-y-6">

      {/* ── F. 팀 하이라이트 ───────────────────────────────────── */}
      <div>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
          팀 하이라이트
          <span className="text-[10px] text-gray-600 ml-2 font-normal">라운드 단위 최고 기록 · {data.day_count}R · {data.game_count}G</span>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {recordCards.filter(c => c.record).map(c => (
            <div key={c.key} className="bg-gray-800/60 rounded-xl p-3 border border-gray-700/40">
              <div className="flex items-center gap-1.5 mb-1">
                <span style={{ color: c.color }}>{c.icon}</span>
                <span className="text-[10px] font-bold text-white">{c.label}</span>
              </div>
              <div className="text-2xl font-black tabular-nums" style={{ color: c.color }}>
                {c.record!.value}
                <span className="text-[11px] ml-1 font-medium text-gray-400">{c.suffix}</span>
              </div>
              <div className="text-[10px] text-gray-500 mt-1 truncate">{c.record!.date.slice(5)} · vs {c.record!.vs}</div>
              <div className="text-[10px] text-gray-600 font-mono">{c.record!.score}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── G. Four Factors ────────────────────────────────────── */}
      {ff && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
            Four Factors
            <span className="text-[10px] text-gray-600 ml-2 font-normal">Dean Oliver / Basketball Reference 표준 — 좌: 우리 팀, 우: 상대(우리 디펜스)</span>
          </p>
          <div className="space-y-1.5">
            {ffRows.map(row => {
              const max = Math.max(row.team, row.opp, 1)
              const teamWins = row.higherBetter ? row.team > row.opp : row.team < row.opp
              return (
                <div key={row.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2" title={row.tooltip}>
                  {/* 좌: 우리 팀 */}
                  <div className="flex items-center justify-end gap-2 min-h-[28px]">
                    <span className="text-sm tabular-nums font-bold" style={teamWins ? { color: teamColor } : { color: '#9ca3af' }}>
                      {row.team}{row.suffix}
                    </span>
                    <div className="h-5 rounded-l-md transition-all" style={{
                      width: `${(row.team / max) * 100}%`,
                      backgroundColor: teamColor,
                      opacity: teamWins ? 1 : 0.55,
                      minWidth: row.team > 0 ? 2 : 0,
                    }} />
                  </div>
                  {/* 중앙 라벨 */}
                  <div className="text-center px-2 min-w-[60px]">
                    <span className="text-[11px] text-gray-400 font-bold">{row.label}</span>
                  </div>
                  {/* 우: 상대 (디펜시브) */}
                  <div className="flex items-center justify-start gap-2 min-h-[28px]">
                    <div className="h-5 rounded-r-md transition-all" style={{
                      width: `${(row.opp / max) * 100}%`,
                      backgroundColor: '#71717a',
                      opacity: !teamWins ? 1 : 0.55,
                      minWidth: row.opp > 0 ? 2 : 0,
                    }} />
                    <span className={`text-sm tabular-nums font-bold ${!teamWins ? 'text-gray-200' : 'text-gray-500'}`}>
                      {row.opp}{row.suffix}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-[10px] text-gray-600 mt-2 italic">
            ※ TOV%는 낮을수록 좋고, 나머지는 높을수록 좋음. 라벨에 마우스를 올리면 공식이 표시됩니다.
          </p>
        </div>
      )}

      {/* ── H. Advanced Team Metrics ───────────────────────────── */}
      {adv && (
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
            <TrendingUp size={12} className="inline mr-1 mb-0.5" />
            Advanced 팀 평가
            <span className="text-[10px] text-gray-600 ml-2 font-normal">100 포제션당 득실 · Pace = 경기당 평균 포제션</span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div className="bg-gradient-to-br from-green-900/40 to-gray-800/40 rounded-xl p-3 border border-green-800/30">
              <div className="text-[10px] font-bold text-green-400 uppercase">ORtg</div>
              <div className="text-2xl font-black text-green-300 tabular-nums">{adv.ortg}</div>
              <div className="text-[10px] text-gray-500">100 포제션당 득점</div>
            </div>
            <div className="bg-gradient-to-br from-red-900/40 to-gray-800/40 rounded-xl p-3 border border-red-800/30">
              <div className="text-[10px] font-bold text-red-400 uppercase">DRtg</div>
              <div className="text-2xl font-black text-red-300 tabular-nums">{adv.drtg}</div>
              <div className="text-[10px] text-gray-500">100 포제션당 실점</div>
            </div>
            <div className={`bg-gradient-to-br ${adv.net_rtg >= 0 ? 'from-blue-900/40' : 'from-orange-900/40'} to-gray-800/40 rounded-xl p-3 border ${adv.net_rtg >= 0 ? 'border-blue-800/30' : 'border-orange-800/30'}`}>
              <div className={`text-[10px] font-bold ${adv.net_rtg >= 0 ? 'text-blue-400' : 'text-orange-400'} uppercase`}>Net Rtg</div>
              <div className={`text-2xl font-black tabular-nums ${adv.net_rtg >= 0 ? 'text-blue-300' : 'text-orange-300'}`}>
                {adv.net_rtg >= 0 ? '+' : ''}{adv.net_rtg}
              </div>
              <div className="text-[10px] text-gray-500">ORtg − DRtg</div>
            </div>
            <div className="bg-gradient-to-br from-purple-900/40 to-gray-800/40 rounded-xl p-3 border border-purple-800/30">
              <div className="text-[10px] font-bold text-purple-400 uppercase">Pace</div>
              <div className="text-2xl font-black text-purple-300 tabular-nums">{adv.pace}</div>
              <div className="text-[10px] text-gray-500">경기당 평균 포제션</div>
            </div>
          </div>
          <p className="text-[10px] text-gray-600 mt-2 italic">
            포제션 = FGA + 0.44×FTA + TOV (Dean Oliver 추정). 우리 팀 누적 {adv.team_poss} / 상대 누적 {adv.opp_poss}.
          </p>
        </div>
      )}
    </div>
  )
}
