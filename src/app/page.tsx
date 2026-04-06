'use client'
import { useEffect, useState } from 'react'
import GameBoxScoreModal from '@/components/GameBoxScoreModal'
import PlayerDetailModal from '@/components/roster/PlayerDetailModal'

interface RecentGame {
  id: string
  date: string
  opponent: string
  our_score: number
  opponent_score: number
  is_complete: boolean
  round?: string
  tournament?: { name: string } | null
}

interface Leader {
  player_id: string
  player_name: string
  player_number: number
  value: number
}

interface GameRecord {
  game_id: string
  date: string
  opponent: string
  round: string | null
  our_score: number
  opponent_score: number
  tournament_name: string | null
  value: number
}

interface GameInfo {
  game_id: string
  date: string
  opponent: string
  our_score: number
  opponent_score: number
  round?: string | null
  tournament_name?: string | null
}

interface DashboardData {
  recentGames: RecentGame[]
  seasonRecord: { wins: number; losses: number; total: number }
  leaders: { ppg: Leader | null; rpg: Leader | null; apg: Leader | null; fg3_pct: Leader | null; ts_pct: Leader | null } | null
  teamAvg: { pts_avg: number; opp_avg: number; fg_pct: number; fg3_pct: number; ft_pct: number } | null
  teamRecords: {
    maxScore: GameRecord
    maxOppScore: GameRecord
    max3pm: GameRecord
    maxTov: GameRecord
    maxMargin: GameRecord | null
  } | null
}

function GameRecordCard({ icon, title, value, unit, record, onClick }: {
  icon: string; title: string; value: number; unit: string; record: GameRecord; onClick: () => void
}) {
  return (
    <div
      className="bg-gray-900 border border-gray-700/60 rounded-xl p-4 cursor-pointer hover:border-blue-500 transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-xs text-gray-400">{title}</span>
      </div>
      <div className="text-2xl font-black font-mono text-white mb-2">
        {value}<span className="text-xs font-sans font-normal text-gray-400 ml-1">{unit}</span>
      </div>
      <div className="text-xs space-y-0.5">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-gray-300">{record.date}</span>
          {record.round && <span className="text-gray-400">· {record.round}</span>}
        </div>
        <div className="text-gray-300">
          vs {record.opponent}
          {record.tournament_name && <span className="text-gray-400 ml-1">({record.tournament_name})</span>}
        </div>
        <div className="text-gray-400">
          {record.our_score} - {record.opponent_score}
        </div>
      </div>
    </div>
  )
}

export default function HomePage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [gameModal, setGameModal] = useState<GameInfo | null>(null)
  const [playerModal, setPlayerModal] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(setData)
  }, [])

  function openGame(info: GameInfo) {
    setGameModal(info)
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-32 text-gray-500">
        <div className="text-center">
          <div className="text-4xl mb-4">🏀</div>
          <p>로딩 중...</p>
        </div>
      </div>
    )
  }

  const { recentGames, seasonRecord, leaders, teamAvg, teamRecords } = data
  const winPct = seasonRecord.total > 0
    ? Math.round((seasonRecord.wins / seasonRecord.total) * 1000) / 10
    : 0

  const hasData = seasonRecord.total > 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">홈</h1>
        <p className="text-sm text-gray-500 mt-1">파란날개 농구팀 시즌 현황</p>
      </div>

      {!hasData && (
        <div className="text-center py-24 text-gray-500">
          <div className="text-5xl mb-4">🏀</div>
          <p className="text-lg font-medium mb-2">아직 경기 기록이 없습니다</p>
          <p className="text-sm">대회 관리에서 대회와 경기를 추가하고 기록을 시작하세요</p>
        </div>
      )}

      {hasData && (
        <>
          {/* 시즌 성적 + 팀 평균 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center hover:border-green-700/60 transition-colors duration-200">
              <div className="text-xs text-gray-400 mb-1">승</div>
              <div className="text-3xl font-black font-mono text-green-400">{seasonRecord.wins}</div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center hover:border-red-800/60 transition-colors duration-200">
              <div className="text-xs text-gray-400 mb-1">패</div>
              <div className="text-3xl font-black font-mono text-red-400">{seasonRecord.losses}</div>
            </div>
            <div className="bg-gray-900 border border-amber-500/30 rounded-xl p-4 text-center hover:border-amber-500/60 transition-colors duration-200">
              <div className="text-xs text-gray-400 mb-1">승률</div>
              <div className="text-3xl font-black font-mono text-amber-400">{winPct}<span className="text-sm font-normal text-gray-400">%</span></div>
            </div>
            {teamAvg && (
              <>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center hover:border-blue-700/60 transition-colors duration-200">
                  <div className="text-xs text-gray-400 mb-1">평균 득점</div>
                  <div className="text-2xl font-black font-mono text-white">{teamAvg.pts_avg}<span className="text-xs font-sans font-normal text-gray-400 ml-1">PPG</span></div>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center hover:border-red-800/60 transition-colors duration-200">
                  <div className="text-xs text-gray-400 mb-1">평균 실점</div>
                  <div className="text-2xl font-black font-mono text-red-400">{teamAvg.opp_avg}<span className="text-xs font-sans font-normal text-gray-400 ml-1">PPG</span></div>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center hover:border-blue-700/60 transition-colors duration-200">
                  <div className="text-xs text-gray-400 mb-1">야투율</div>
                  <div className="text-2xl font-black font-mono text-white">{teamAvg.fg_pct}<span className="text-xs font-sans font-normal text-gray-400 ml-1">%</span></div>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center hover:border-blue-700/60 transition-colors duration-200">
                  <div className="text-xs text-gray-400 mb-1">3점율</div>
                  <div className="text-2xl font-black font-mono text-white">{teamAvg.fg3_pct}<span className="text-xs font-sans font-normal text-gray-400 ml-1">%</span></div>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 text-center hover:border-blue-700/60 transition-colors duration-200">
                  <div className="text-xs text-gray-400 mb-1">자유투율</div>
                  <div className="text-2xl font-black font-mono text-white">{teamAvg.ft_pct}<span className="text-xs font-sans font-normal text-gray-400 ml-1">%</span></div>
                </div>
              </>
            )}
          </div>

          {/* 최근 경기 */}
          {recentGames.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-gray-300">최근 경기</h2>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {recentGames.map(g => {
                  const isWin = g.our_score > g.opponent_score
                  const isDraw = g.our_score === g.opponent_score
                  return (
                    <div
                      key={g.id}
                      onClick={() => openGame({
                        game_id: g.id,
                        date: g.date,
                        opponent: g.opponent,
                        our_score: g.our_score,
                        opponent_score: g.opponent_score,
                        round: g.round,
                        tournament_name: g.tournament?.name ?? null,
                      })}
                      className={`shrink-0 bg-gray-900 border rounded-xl p-4 w-44 text-center cursor-pointer hover:border-blue-500 transition-colors
                        ${isWin ? 'border-green-700/50' : isDraw ? 'border-gray-600' : 'border-red-700/50'}`}
                    >
                      <div className={`text-xs font-bold mb-2 px-2 py-0.5 rounded-full inline-block
                        ${isWin ? 'bg-green-900/50 text-green-400' : isDraw ? 'bg-gray-700 text-gray-400' : 'bg-red-900/50 text-red-400'}`}>
                        {isWin ? '승' : isDraw ? '무' : '패'}
                      </div>
                      <div className="text-xs text-gray-400 mb-1">{g.date}</div>
                      <div className="text-xs text-white mb-2 truncate font-medium">vs {g.opponent}</div>
                      <div className="text-xl font-black font-mono text-white">
                        {g.our_score}
                        <span className="text-gray-400 mx-1 font-sans font-normal text-sm">-</span>
                        {g.opponent_score}
                      </div>
                      {g.round && <div className="text-xs text-gray-400 mt-1">{g.round}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 부문별 리더 */}
          {leaders && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-gray-300">부문별 리더</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: '득점왕', unit: 'PPG', icon: '🏀', data: leaders.ppg },
                  { label: '리바운드왕', unit: 'RPG', icon: '💪', data: leaders.rpg },
                  { label: '어시스트왕', unit: 'APG', icon: '🤝', data: leaders.apg },
                  { label: '3점슛왕', unit: '3P%', icon: '🎯', data: leaders.fg3_pct },
                  { label: 'TS%', unit: '%', icon: '📊', data: leaders.ts_pct },
                ].map(({ label, unit, icon, data: leader }) => {
                  if (!leader) return null
                  return (
                    <div
                      key={label}
                      onClick={() => setPlayerModal(leader.player_id)}
                      className="bg-gray-900 border border-blue-700/50 rounded-xl p-5 text-center cursor-pointer hover:border-blue-500 hover:bg-gray-800/80 transition-colors duration-200"
                    >
                      <div className="text-2xl mb-2">{icon}</div>
                      <div className="text-xs text-gray-400 mb-1">{label}</div>
                      <div className="font-semibold text-blue-400 mb-1 text-sm">
                        #{leader.player_number} {leader.player_name}
                      </div>
                      <div className="text-2xl font-black font-mono text-amber-400">
                        {leader.value.toFixed(1)}
                        <span className="text-xs font-sans font-normal text-gray-400 ml-1">{unit}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 팀 기록 */}
          {teamRecords && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-gray-300">팀 기록</h2>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <GameRecordCard
                  icon="🔥" title="최다 득점 경기"
                  value={teamRecords.maxScore.value} unit="점"
                  record={teamRecords.maxScore}
                  onClick={() => openGame(teamRecords.maxScore)}
                />
                <GameRecordCard
                  icon="😰" title="최다 실점 경기"
                  value={teamRecords.maxOppScore.value} unit="점"
                  record={teamRecords.maxOppScore}
                  onClick={() => openGame(teamRecords.maxOppScore)}
                />
                <GameRecordCard
                  icon="🎯" title="3점슛 최다 경기"
                  value={teamRecords.max3pm.value} unit="개"
                  record={teamRecords.max3pm}
                  onClick={() => openGame(teamRecords.max3pm)}
                />
                <GameRecordCard
                  icon="😅" title="턴오버 파티"
                  value={teamRecords.maxTov.value} unit="개"
                  record={teamRecords.maxTov}
                  onClick={() => openGame(teamRecords.maxTov)}
                />
                {teamRecords.maxMargin && (
                  <GameRecordCard
                    icon="💪" title="최대 점수차 승리"
                    value={teamRecords.maxMargin.value} unit="점차"
                    record={teamRecords.maxMargin}
                    onClick={() => openGame(teamRecords.maxMargin!)}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* 박스스코어 모달 */}
      {gameModal && (
        <GameBoxScoreModal
          gameInfo={gameModal}
          onClose={() => setGameModal(null)}
          onPlayerClick={(playerId) => {
            setGameModal(null)
            setPlayerModal(playerId)
          }}
        />
      )}

      {/* 플레이어 카드 모달 */}
      {playerModal && (
        <PlayerDetailModal
          playerId={playerModal}
          onClose={() => setPlayerModal(null)}
        />
      )}
    </div>
  )
}
