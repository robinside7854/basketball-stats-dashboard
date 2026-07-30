'use client'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useTeam, TEAM_LABELS } from '@/contexts/TeamContext'
import { useOrg } from '@/contexts/OrgContext'
import {
  Flame,
  AlertTriangle,
  Dumbbell,
  Handshake,
  Target,
  BarChart3,
  Snowflake,
  Frown,
  Shield,
  Trophy,
  type LucideIcon,
} from 'lucide-react'
import { Basketball } from '@/components/league/BasketballIcons'

const GameBoxScoreModal = dynamic(() => import('@/components/GameBoxScoreModal'), { ssr: false })
const PlayerDetailModal = dynamic(() => import('@/components/roster/PlayerDetailModal'), { ssr: false })

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
  player_number: string
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
  seasonRecord: { wins: number; losses: number; total: number; incompleteCount: number }
  streak: { count: number; type: 'win' | 'loss' | null }
  leaders: { ppg: Leader | null; rpg: Leader | null; apg: Leader | null; fg3_pct: Leader | null; ts_pct: Leader | null } | null
  teamAvg: { pts_avg: number; opp_avg: number; fg_pct: number; fg3_pct: number; ft_pct: number } | null
  teamRecords: {
    maxScore: GameRecord
    maxOppScore: GameRecord
    minScore: GameRecord | null
    minOppScore: GameRecord | null
    max3pm: GameRecord
    maxTov: GameRecord
    maxMargin: GameRecord | null
  } | null
}

function GameRecordCard({ icon: Icon, title, value, unit, record, onClick }: {
  icon: LucideIcon; title: string; value: number; unit: string; record: GameRecord; onClick: () => void
}) {
  return (
    <div
      className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-4 cursor-pointer hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] transition-shadow duration-200"
      onClick={onClick}
    >
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-5 w-5 text-[var(--mm-ink-soft)]" aria-hidden />
        <span className="text-xs text-[var(--mm-muted)]">{title}</span>
      </div>
      <div className="text-2xl font-black font-mono text-[var(--mm-ink)] mb-2">
        {value}<span className="text-xs font-sans font-normal text-[var(--mm-muted)] ml-1">{unit}</span>
      </div>
      <div className="text-xs space-y-0.5">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-[var(--mm-ink-soft)]">{record.date}</span>
          {record.round && <span className="text-[var(--mm-muted)]">· {record.round}</span>}
        </div>
        <div className="text-[var(--mm-ink-soft)]">
          vs {record.opponent}
          {record.tournament_name && <span className="text-[var(--mm-muted)] ml-1">({record.tournament_name})</span>}
        </div>
        <div className="text-[var(--mm-muted)]">
          {record.our_score} - {record.opponent_score}
        </div>
      </div>
    </div>
  )
}

export default function TeamHomePage() {
  const team = useTeam()
  const org = useOrg()
  const [data, setData] = useState<DashboardData | null>(null)
  const [gameModal, setGameModal] = useState<GameInfo | null>(null)
  const [playerModal, setPlayerModal] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/dashboard?team=${team}`).then(r => r.json()).then(setData)
  }, [team])

  if (!data) {
    return (
      <div className="flex items-center justify-center py-32 text-[var(--mm-muted)]">
        <div className="text-center">
          <Basketball size={40} className="mx-auto mb-4 text-[var(--mm-muted)]" />
          <p>로딩 중...</p>
        </div>
      </div>
    )
  }

  const { recentGames, seasonRecord, streak, leaders, teamAvg, teamRecords } = data
  const winPct = seasonRecord.total > 0
    ? Math.round((seasonRecord.wins / seasonRecord.total) * 1000) / 10
    : 0
  const incompleteCount = seasonRecord.incompleteCount ?? 0

  const hasData = seasonRecord.total > 0 || incompleteCount > 0

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-[var(--mm-ink)]">{TEAM_LABELS[team]} 홈</h1>
          {streak?.type && streak.count > 0 && (
            <span className={`inline-flex items-center gap-1 text-sm font-bold px-3 py-1 rounded-full border ${
              streak.type === 'win'
                ? 'bg-[rgba(16,185,129,0.12)] text-[var(--mm-positive)] border-[#10B981]/50'
                : 'bg-[rgba(220,38,38,0.12)] text-[var(--mm-negative)] border-[#EF4444]/50'
            }`}>
              {streak.count}연{streak.type === 'win' ? '승' : '패'}
              {streak.type === 'win'
                ? <Flame className="h-3.5 w-3.5" aria-hidden />
                : <Frown className="h-3.5 w-3.5" aria-hidden />}
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--mm-muted)] mt-1">파란날개 {TEAM_LABELS[team]} 시즌 현황</p>
      </div>

      {!hasData && (
        <div className="text-center py-24 text-[var(--mm-muted)]">
          <Basketball size={48} className="mx-auto mb-4 text-[var(--mm-muted)]" />
          <p className="text-lg font-medium mb-2">아직 경기 기록이 없습니다</p>
          <p className="text-sm">대회 관리에서 대회와 경기를 추가하고 기록을 시작하세요</p>
        </div>
      )}

      {hasData && (
        <>
          {/* 시즌 성적 + 팀 평균 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
            <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-4 text-center hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] transition-shadow duration-200">
              <div className="text-xs text-[var(--mm-muted)] mb-1">승</div>
              <div className="text-3xl font-black font-mono text-[var(--mm-positive)]">{seasonRecord.wins}</div>
            </div>
            <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-4 text-center hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] transition-shadow duration-200">
              <div className="text-xs text-[var(--mm-muted)] mb-1">패</div>
              <div className="text-3xl font-black font-mono text-[var(--mm-negative)]">{seasonRecord.losses}</div>
            </div>
            <div className="bg-[var(--mm-panel)] border border-amber-500/30 rounded-xl p-4 text-center hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] transition-shadow duration-200">
              <div className="text-xs text-[var(--mm-muted)] mb-1">승률</div>
              <div className="text-3xl font-black font-mono text-amber-400">{winPct}<span className="text-sm font-normal text-[var(--mm-muted)]">%</span></div>
            </div>
            {teamAvg && (
              <>
                <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-4 text-center hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] transition-shadow duration-200">
                  <div className="text-xs text-[var(--mm-muted)] mb-1">평균 득점</div>
                  <div className="text-2xl font-black font-mono text-[var(--mm-ink)]">{teamAvg.pts_avg}<span className="text-xs font-sans font-normal text-[var(--mm-muted)] ml-1">PPG</span></div>
                </div>
                <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-4 text-center hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] transition-shadow duration-200">
                  <div className="text-xs text-[var(--mm-muted)] mb-1">평균 실점</div>
                  <div className="text-2xl font-black font-mono text-[var(--mm-negative)]">{teamAvg.opp_avg}<span className="text-xs font-sans font-normal text-[var(--mm-muted)] ml-1">PPG</span></div>
                </div>
                <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-4 text-center hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] transition-shadow duration-200">
                  <div className="text-xs text-[var(--mm-muted)] mb-1">야투율</div>
                  <div className="text-2xl font-black font-mono text-[var(--mm-ink)]">{teamAvg.fg_pct}<span className="text-xs font-sans font-normal text-[var(--mm-muted)] ml-1">%</span></div>
                </div>
                <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-4 text-center hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] transition-shadow duration-200">
                  <div className="text-xs text-[var(--mm-muted)] mb-1">3점율</div>
                  <div className="text-2xl font-black font-mono text-[var(--mm-ink)]">{teamAvg.fg3_pct}<span className="text-xs font-sans font-normal text-[var(--mm-muted)] ml-1">%</span></div>
                </div>
                <div className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl p-4 text-center hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] transition-shadow duration-200">
                  <div className="text-xs text-[var(--mm-muted)] mb-1">자유투율</div>
                  <div className="text-2xl font-black font-mono text-[var(--mm-ink)]">{teamAvg.ft_pct}<span className="text-xs font-sans font-normal text-[var(--mm-muted)] ml-1">%</span></div>
                </div>
              </>
            )}
          </div>

          {/* 미완료 경기 알림 */}
          {incompleteCount > 0 && (
            <div className="flex items-center justify-between gap-3 bg-[var(--mm-yellow-soft)] border border-[color:var(--mm-yellow)]/40 rounded-xl px-4 py-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--mm-yellow-strong)]" aria-hidden />
                <div>
                  <p className="text-sm font-semibold text-[var(--mm-yellow-strong)]">
                    기록 미완료 경기 {incompleteCount}경기
                  </p>
                  <p className="text-xs text-[var(--mm-yellow-strong)] mt-0.5">
                    승/패/승률은 기록 완료된 경기({seasonRecord.total}경기)만 반영됩니다
                  </p>
                </div>
              </div>
              <Link
                href={`/${org}/${team}/record`}
                className="shrink-0 text-xs font-bold bg-[var(--mm-yellow)] hover:bg-[color:var(--mm-yellow-strong)] text-[var(--mm-black)] px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
              >
                기록하러 가기 →
              </Link>
            </div>
          )}

          {/* 최근 경기 */}
          {recentGames.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-[var(--mm-ink)]">최근 경기</h2>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {recentGames.map(g => {
                  const isWin = g.our_score > g.opponent_score
                  const isDraw = g.our_score === g.opponent_score
                  return (
                    <div
                      key={g.id}
                      onClick={() => setGameModal({
                        game_id: g.id,
                        date: g.date,
                        opponent: g.opponent,
                        our_score: g.our_score,
                        opponent_score: g.opponent_score,
                        round: g.round,
                        tournament_name: g.tournament?.name ?? null,
                      })}
                      className={`shrink-0 bg-[var(--mm-panel)] border rounded-xl p-4 w-44 text-center cursor-pointer hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] transition-shadow
                        ${isWin ? 'border-[#10B981]/50' : isDraw ? 'border-[var(--mm-rule)]' : 'border-[#EF4444]/50'}`}
                    >
                      <div className={`text-xs font-bold mb-2 px-2 py-0.5 rounded-full inline-block
                        ${isWin ? 'bg-[rgba(16,185,129,0.12)] text-[var(--mm-positive)]' : isDraw ? 'bg-[var(--mm-panel-alt)] text-[var(--mm-neutral-strong)]' : 'bg-[rgba(220,38,38,0.12)] text-[var(--mm-negative)]'}`}>
                        {isWin ? '승' : isDraw ? '무' : '패'}
                      </div>
                      <div className="text-xs text-[var(--mm-muted)] mb-1">{g.date}</div>
                      <div className="text-xs text-[var(--mm-ink)] mb-2 truncate font-medium">vs {g.opponent}</div>
                      <div className="text-xl font-black font-mono text-[var(--mm-ink)]">
                        {g.our_score}
                        <span className="text-[var(--mm-muted)] mx-1 font-sans font-normal text-sm">-</span>
                        {g.opponent_score}
                      </div>
                      {g.round && <div className="text-xs text-[var(--mm-muted)] mt-1">{g.round}</div>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 부문별 리더 */}
          {leaders && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-[var(--mm-ink)]">부문별 리더</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[
                  { label: '득점왕', unit: 'PPG', icon: Trophy, data: leaders.ppg },
                  { label: '리바운드왕', unit: 'RPG', icon: Dumbbell, data: leaders.rpg },
                  { label: '어시스트왕', unit: 'APG', icon: Handshake, data: leaders.apg },
                  { label: '3점슛왕', unit: '3P%', icon: Target, data: leaders.fg3_pct },
                  { label: 'TS%', unit: '%', icon: BarChart3, data: leaders.ts_pct },
                ].map(({ label, unit, icon: Icon, data: leader }) => {
                  if (!leader) return null
                  return (
                    <div
                      key={label}
                      onClick={() => setPlayerModal(leader.player_id)}
                      className="bg-[var(--mm-panel)] border border-[color:var(--mm-yellow)]/50 rounded-xl p-5 text-center cursor-pointer hover:shadow-[0_10px_36px_-8px_rgba(0,0,0,0.20)] hover:bg-[var(--mm-panel-alt)] transition-shadow duration-200"
                    >
                      <Icon className="h-6 w-6 mx-auto mb-2 text-[var(--mm-yellow-strong)]" aria-hidden />
                      <div className="text-xs text-[var(--mm-muted)] mb-1">{label}</div>
                      <div className="font-semibold text-[var(--mm-ink)] mb-1 text-sm">
                        #{leader.player_number} {leader.player_name}
                      </div>
                      <div className="text-2xl font-black font-mono text-amber-400">
                        {leader.value.toFixed(1)}
                        <span className="text-xs font-sans font-normal text-[var(--mm-muted)] ml-1">{unit}</span>
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
              <h2 className="text-lg font-semibold mb-3 text-[var(--mm-ink)]">팀 기록</h2>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <GameRecordCard
                  icon={Flame} title="최다 득점 경기"
                  value={teamRecords.maxScore.value} unit="점"
                  record={teamRecords.maxScore}
                  onClick={() => setGameModal(teamRecords.maxScore)}
                />
                {teamRecords.minScore && (
                  <GameRecordCard
                    icon={Snowflake} title="최저 득점 경기"
                    value={teamRecords.minScore.value} unit="점"
                    record={teamRecords.minScore}
                    onClick={() => setGameModal(teamRecords.minScore!)}
                  />
                )}
                <GameRecordCard
                  icon={Frown} title="최다 실점 경기"
                  value={teamRecords.maxOppScore.value} unit="점"
                  record={teamRecords.maxOppScore}
                  onClick={() => setGameModal(teamRecords.maxOppScore)}
                />
                {teamRecords.minOppScore && (
                  <GameRecordCard
                    icon={Shield} title="최저 실점 경기"
                    value={teamRecords.minOppScore.value} unit="점"
                    record={teamRecords.minOppScore}
                    onClick={() => setGameModal(teamRecords.minOppScore!)}
                  />
                )}
                <GameRecordCard
                  icon={Target} title="3점슛 최다 경기"
                  value={teamRecords.max3pm.value} unit="개"
                  record={teamRecords.max3pm}
                  onClick={() => setGameModal(teamRecords.max3pm)}
                />
                <GameRecordCard
                  icon={AlertTriangle} title="턴오버 파티"
                  value={teamRecords.maxTov.value} unit="개"
                  record={teamRecords.maxTov}
                  onClick={() => setGameModal(teamRecords.maxTov)}
                />
                {teamRecords.maxMargin && (
                  <GameRecordCard
                    icon={Dumbbell} title="최대 점수차 승리"
                    value={teamRecords.maxMargin.value} unit="점차"
                    record={teamRecords.maxMargin}
                    onClick={() => setGameModal(teamRecords.maxMargin!)}
                  />
                )}
              </div>
            </div>
          )}
        </>
      )}

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

      {playerModal && (
        <PlayerDetailModal
          playerId={playerModal}
          onClose={() => setPlayerModal(null)}
        />
      )}
    </div>
  )
}
