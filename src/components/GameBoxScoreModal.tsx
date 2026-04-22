'use client'
import { useEffect, useMemo, useState } from 'react'
import { X, Play } from 'lucide-react'
import PlayerDetailModal from '@/components/roster/PlayerDetailModal'
import type { PlayerBoxScore } from '@/types/database'
import { extractYouTubeId } from '@/lib/youtube/utils'

interface GameInfo {
  game_id: string
  date: string
  opponent: string
  our_score: number
  opponent_score: number
  round?: string | null
  tournament_name?: string | null
}

interface TimelineEvent {
  id: string
  quarter: number
  video_timestamp: number | null
  type: string
  result: string | null
  points: number | null
  player_id: string | null
  player_name: string | null
  player_number: string | null
  related_player_id: string | null
  related_player_name: string | null
}

interface FourFactors {
  efg_pct: number
  tov_pct: number
  orb_pct: number
  ft_rate: number
}

interface Props {
  gameInfo: GameInfo
  onClose: () => void
  onPlayerClick?: (playerId: string) => void
}

function Pct({ val }: { val: number }) {
  return <span className={val >= 50 ? 'text-green-400' : val > 0 ? 'text-yellow-400' : 'text-gray-600'}>{val > 0 ? `${val.toFixed(1)}%` : '-'}</span>
}

function formatTime(sec: number | null | undefined): string {
  if (sec == null || !isFinite(sec) || sec < 0) return '--:--'
  const s = Math.floor(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`
  return `${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`
}

type EventStyle = { badge: string; badgeClass: string; label: string; labelClass: string }
function formatEvent(e: TimelineEvent): EventStyle | null {
  const made = e.result === 'made'
  const playerLabel = e.player_name ? `${e.player_name}` : '선수'
  const assist = e.related_player_name ? ` · A: ${e.related_player_name}` : ''

  switch (e.type) {
    case 'shot_3p':
      return {
        badge: made ? '3P+' : '3P-',
        badgeClass: made ? 'bg-purple-900/60 text-purple-300' : 'bg-gray-800 text-gray-500',
        label: `${playerLabel} 3점슛 ${made ? '성공' : '실패'}${made ? assist : ''}`,
        labelClass: made ? 'text-white' : 'text-gray-500',
      }
    case 'shot_2p_mid':
    case 'shot_2p_drive':
    case 'shot_layup':
    case 'shot_post': {
      const names: Record<string, string> = { shot_2p_mid: '중거리', shot_2p_drive: '드라이브', shot_layup: '레이업', shot_post: '골밑슛' }
      return {
        badge: made ? '2P+' : '2P-',
        badgeClass: made ? 'bg-green-900/60 text-green-300' : 'bg-gray-800 text-gray-500',
        label: `${playerLabel} ${names[e.type]} ${made ? '성공' : '실패'}${made ? assist : ''}`,
        labelClass: made ? 'text-white' : 'text-gray-500',
      }
    }
    case 'free_throw':
      return {
        badge: made ? 'FT+' : 'FT-',
        badgeClass: made ? 'bg-blue-900/60 text-blue-300' : 'bg-gray-800 text-gray-500',
        label: `${playerLabel} 자유투 ${made ? '성공' : '실패'}`,
        labelClass: made ? 'text-white' : 'text-gray-500',
      }
    case 'oreb':
      return { badge: 'OREB', badgeClass: 'bg-orange-900/60 text-orange-300', label: `${playerLabel} 공격 리바운드`, labelClass: 'text-white' }
    case 'dreb':
      return { badge: 'DREB', badgeClass: 'bg-orange-900/60 text-orange-300', label: `${playerLabel} 수비 리바운드`, labelClass: 'text-white' }
    case 'steal':
      return { badge: 'STL', badgeClass: 'bg-green-900/60 text-green-300', label: `${playerLabel} 스틸`, labelClass: 'text-white' }
    case 'block':
      return { badge: 'BLK', badgeClass: 'bg-indigo-900/60 text-indigo-300', label: `${playerLabel} 블락`, labelClass: 'text-white' }
    case 'turnover':
      return { badge: 'TOV', badgeClass: 'bg-red-900/60 text-red-300', label: `${playerLabel} 턴오버`, labelClass: 'text-white' }
    case 'foul':
      return { badge: 'PF', badgeClass: 'bg-yellow-900/60 text-yellow-300', label: `${playerLabel} 파울`, labelClass: 'text-white' }
    case 'opp_score':
      return {
        badge: `OPP+${e.points ?? 2}`,
        badgeClass: 'bg-red-950/60 text-red-400 border border-red-900/40',
        label: `상대팀 득점 ${e.points ?? 2}점`,
        labelClass: 'text-red-300',
      }
    case 'sub_in':
      return { badge: 'IN', badgeClass: 'bg-teal-900/60 text-teal-300', label: `${playerLabel} 교체 투입`, labelClass: 'text-gray-400' }
    case 'sub_out':
      return { badge: 'OUT', badgeClass: 'bg-gray-800 text-gray-400', label: `${playerLabel} 교체 퇴장`, labelClass: 'text-gray-400' }
    case 'assist':
      return { badge: 'AST', badgeClass: 'bg-blue-900/60 text-blue-300', label: `${playerLabel} 어시스트`, labelClass: 'text-white' }
    default:
      return null
  }
}

function FactorBar({ label, value, suffix, max, help }: { label: string; value: number; suffix: string; max: number; help: string }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-gray-400 font-medium">{label}</span>
        <span className="text-sm font-bold font-mono text-white">{value.toFixed(suffix === '%' ? 1 : 3)}{suffix}</span>
      </div>
      <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-gray-600 mt-1">{help}</p>
    </div>
  )
}

export default function GameBoxScoreModal({ gameInfo, onClose, onPlayerClick }: Props) {
  const [boxScores, setBoxScores] = useState<PlayerBoxScore[]>([])
  const [teamTotals, setTeamTotals] = useState<Partial<PlayerBoxScore>>({})
  const [fourFactors, setFourFactors] = useState<FourFactors | null>(null)
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [game, setGame] = useState<{ youtube_url: string | null; youtube_start_offset: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [internalPlayerModal, setInternalPlayerModal] = useState<string | null>(null)
  const [tab, setTab] = useState<'box' | 'timeline'>('box')
  const [jumpTo, setJumpTo] = useState<number | null>(null)

  function handlePlayerClick(playerId: string) {
    if (onPlayerClick) onPlayerClick(playerId)
    else setInternalPlayerModal(playerId)
  }

  useEffect(() => {
    fetch(`/api/stats/${gameInfo.game_id}`)
      .then(r => r.json())
      .then(d => {
        setBoxScores(d.boxScores || [])
        setTeamTotals(d.teamTotals || {})
        setFourFactors(d.fourFactors || null)
        setEvents(d.events || [])
        setGame(d.game || null)
        setLoading(false)
      })
  }, [gameInfo.game_id])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  const videoId = useMemo(() => game?.youtube_url ? extractYouTubeId(game.youtube_url) : null, [game])

  const timelineEvents = useMemo(
    () => events.filter(e => e.type !== 'quarter_start' && e.type !== 'quarter_end'),
    [events]
  )

  const isWin = gameInfo.our_score > gameInfo.opponent_score

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div className="relative z-10 w-full max-w-4xl h-[100dvh] sm:h-auto sm:max-h-[90vh] bg-gray-950 border-0 sm:border border-gray-800 rounded-none sm:rounded-2xl flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${isWin ? 'bg-green-900/60 text-green-400' : 'bg-red-900/60 text-red-400'}`}>
              {isWin ? '승' : '패'}
            </span>
            <div className="min-w-0">
              <span className="text-white font-bold">
                {gameInfo.our_score}
                <span className="text-gray-500 mx-2 font-normal">vs</span>
                {gameInfo.opponent_score}
              </span>
              <span className="ml-2 text-gray-400 text-sm">vs {gameInfo.opponent}</span>
            </div>
            <div className="text-xs text-gray-400 truncate hidden sm:block">
              {gameInfo.date}
              {gameInfo.round && ` · ${gameInfo.round}`}
              {gameInfo.tournament_name && ` · ${gameInfo.tournament_name}`}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-gray-800 shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex border-b border-gray-800 shrink-0 bg-gray-950">
          {([
            { id: 'box', label: '박스스코어' },
            { id: 'timeline', label: `타임라인${timelineEvents.length > 0 ? ` (${timelineEvents.length})` : ''}` },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-2.5 text-xs font-bold border-b-2 transition-colors ${tab === t.id ? 'border-blue-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="overflow-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-500">
              <div className="text-center"><div className="text-3xl mb-3">🏀</div><p>로딩 중...</p></div>
            </div>
          ) : tab === 'box' ? (
            <div className="p-4 space-y-5">
              {boxScores.length === 0 ? (
                <div className="text-center py-16 text-gray-500">기록된 데이터가 없습니다</div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-center border-collapse">
                      <thead>
                        <tr className="bg-gray-800 text-gray-400">
                          <th className="px-2 py-2 text-left">#</th>
                          <th className="px-2 py-2 text-left">이름</th>
                          <th className="px-2 py-2">PTS</th>
                          <th className="px-2 py-2">REB</th>
                          <th className="px-2 py-2">AST</th>
                          <th className="px-2 py-2">STL</th>
                          <th className="px-2 py-2">BLK</th>
                          <th className="px-2 py-2">TOV</th>
                          <th className="px-2 py-2" title="Hollinger Game Score">GmSc</th>
                          <th className="px-2 py-2">FG</th>
                          <th className="px-2 py-2">FG%</th>
                          <th className="px-2 py-2">3P</th>
                          <th className="px-2 py-2">3P%</th>
                          <th className="px-2 py-2">FT</th>
                          <th className="px-2 py-2">FT%</th>
                        </tr>
                      </thead>
                      <tbody>
                        {boxScores.map(s => (
                          <tr key={s.player_id} className="border-b border-gray-700/40 transition-colors hover:bg-gray-800/60">
                            <td className="px-2 py-2 font-bold text-blue-400 text-left">{s.player_number}</td>
                            <td className="px-2 py-2 text-left font-medium whitespace-nowrap">
                              <button
                                onClick={() => handlePlayerClick(s.player_id)}
                                className="hover:text-blue-400 hover:underline underline-offset-2 transition-colors cursor-pointer"
                              >
                                {s.player_name}
                              </button>
                              {s.double_double && <span className="ml-1 text-xs bg-yellow-600 px-1 rounded">DD</span>}
                              {s.triple_double && <span className="ml-1 text-xs bg-blue-600 px-1 rounded">TD</span>}
                            </td>
                            <td className="px-2 py-2 font-bold text-white">{s.pts}</td>
                            <td className="px-2 py-2">{s.reb}</td>
                            <td className="px-2 py-2 text-blue-400">{s.ast}</td>
                            <td className="px-2 py-2 text-green-400">{s.stl}</td>
                            <td className="px-2 py-2 text-purple-400">{s.blk}</td>
                            <td className="px-2 py-2 text-red-400">{s.tov}</td>
                            <td className="px-2 py-2 font-bold text-amber-300">{s.game_score?.toFixed(1) ?? '-'}</td>
                            <td className="px-2 py-2 text-gray-300">{s.fgm}-{s.fga}</td>
                            <td className="px-2 py-2"><Pct val={s.fg_pct} /></td>
                            <td className="px-2 py-2 text-gray-300">{s.fg3m}-{s.fg3a}</td>
                            <td className="px-2 py-2"><Pct val={s.fg3_pct} /></td>
                            <td className="px-2 py-2 text-gray-300">{s.ftm}-{s.fta}</td>
                            <td className="px-2 py-2"><Pct val={s.ft_pct} /></td>
                          </tr>
                        ))}
                        <tr className="bg-gray-800/60 font-bold border-t-2 border-blue-500/50">
                          <td colSpan={2} className="px-2 py-2 text-left text-blue-400">팀 합계</td>
                          <td className="px-2 py-2 text-white">{teamTotals.pts ?? 0}</td>
                          <td className="px-2 py-2">{teamTotals.reb ?? 0}</td>
                          <td className="px-2 py-2 text-blue-400">{teamTotals.ast ?? 0}</td>
                          <td className="px-2 py-2 text-green-400">{teamTotals.stl ?? 0}</td>
                          <td className="px-2 py-2 text-purple-400">{teamTotals.blk ?? 0}</td>
                          <td className="px-2 py-2 text-red-400">{teamTotals.tov ?? 0}</td>
                          <td className="px-2 py-2 text-gray-500">-</td>
                          <td className="px-2 py-2 text-gray-300">{teamTotals.fgm ?? 0}-{teamTotals.fga ?? 0}</td>
                          <td className="px-2 py-2"><Pct val={teamTotals.fga ? Math.round((teamTotals.fgm! / teamTotals.fga) * 1000) / 10 : 0} /></td>
                          <td className="px-2 py-2 text-gray-300">{teamTotals.fg3m ?? 0}-{teamTotals.fg3a ?? 0}</td>
                          <td className="px-2 py-2"><Pct val={teamTotals.fg3a ? Math.round((teamTotals.fg3m! / teamTotals.fg3a) * 1000) / 10 : 0} /></td>
                          <td className="px-2 py-2 text-gray-300">{teamTotals.ftm ?? 0}-{teamTotals.fta ?? 0}</td>
                          <td className="px-2 py-2"><Pct val={teamTotals.fta ? Math.round((teamTotals.ftm! / teamTotals.fta) * 1000) / 10 : 0} /></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {fourFactors && (
                    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                      <div className="flex items-baseline justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-300">팀 효율 분석 (Four Factors)</h3>
                        <span className="text-[10px] text-gray-600">Dean Oliver</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <FactorBar label="eFG% (실야투율)" value={fourFactors.efg_pct} suffix="%" max={70} help="3점 가중한 슛 효율" />
                        <FactorBar label="TOV% (턴오버율)" value={fourFactors.tov_pct} suffix="%" max={30} help="점유당 턴오버 비율" />
                        <FactorBar label="ORB% (공격RB 비중)" value={fourFactors.orb_pct} suffix="%" max={60} help="리바운드 중 공격 비율" />
                        <FactorBar label="FT/FGA (자유투 유도)" value={fourFactors.ft_rate} suffix="" max={0.5} help="FGA 대비 FTA" />
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-gray-600 text-center">이름 클릭 시 선수 상세 정보가 열립니다</p>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              {videoId ? (
                <div className="bg-black shrink-0">
                  <div className="aspect-video max-h-[320px] mx-auto">
                    <iframe
                      key={`${videoId}-${jumpTo ?? 'init'}`}
                      src={`https://www.youtube.com/embed/${videoId}?start=${Math.floor(jumpTo ?? game?.youtube_start_offset ?? 0)}${jumpTo != null ? '&autoplay=1' : ''}`}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </div>
              ) : (
                <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 text-xs text-gray-500 shrink-0">
                  이 경기에는 YouTube 영상이 등록되지 않아 재생 점프를 사용할 수 없습니다.
                </div>
              )}
              <div className="p-4">
                {timelineEvents.length === 0 ? (
                  <div className="text-center py-16 text-gray-500">이벤트가 없습니다</div>
                ) : (
                  <ol className="space-y-1">
                    {timelineEvents.map(e => {
                      const style = formatEvent(e)
                      if (!style) return null
                      const canJump = videoId != null && e.video_timestamp != null && e.video_timestamp > 0
                      return (
                        <li key={e.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-gray-900/60 transition-colors">
                          <span className="text-[10px] text-gray-600 font-mono w-8 shrink-0 text-center">Q{e.quarter}</span>
                          <span className="text-[10px] text-gray-500 font-mono w-14 shrink-0 text-right">{formatTime(e.video_timestamp)}</span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded w-12 shrink-0 text-center ${style.badgeClass}`}>{style.badge}</span>
                          <span className={`text-xs flex-1 min-w-0 truncate ${style.labelClass}`}>{style.label}</span>
                          {canJump && (
                            <button
                              onClick={() => setJumpTo(e.video_timestamp!)}
                              className="shrink-0 p-1 rounded text-gray-500 hover:text-blue-400 hover:bg-gray-800 transition-colors"
                              title="영상 이 시점으로 이동"
                            >
                              <Play size={12} />
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {internalPlayerModal && (
        <PlayerDetailModal
          playerId={internalPlayerModal}
          onClose={() => setInternalPlayerModal(null)}
        />
      )}
    </div>
  )
}
