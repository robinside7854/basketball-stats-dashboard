'use client'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Plus, ChevronDown, ChevronUp, Pencil, Trash2, Youtube } from 'lucide-react'
import { Button } from '@/components/ui/button'
import TournamentForm from '@/components/tournaments/TournamentForm'
import GameForm from '@/components/tournaments/GameForm'
import YoutubeImportModal from '@/components/tournaments/YoutubeImportModal'
import type { Tournament, Game } from '@/types/database'
import { useEditMode } from '@/contexts/EditModeContext'
import { useTeam } from '@/contexts/TeamContext'
import { useOrg } from '@/contexts/OrgContext'
import { ArrowUpDown } from 'lucide-react'

const TYPE_LABELS: Record<string, string> = { pro: '선출부', amateur: '비선출부' }

const ROUND_ORDER: Record<string, number> = {
  '결승': 5, '4강': 4, '8강': 3, '16강': 2, '조별예선': 1,
}

function sortGamesByRound(games: Game[]): Game[] {
  return [...games].sort((a, b) => {
    const ra = ROUND_ORDER[a.round ?? ''] ?? 0
    const rb = ROUND_ORDER[b.round ?? ''] ?? 0
    if (rb !== ra) return rb - ra
    return (b.date ?? '').localeCompare(a.date ?? '')
  })
}

function getTournamentSummary(games: Game[]): { record: string; placement: string } | null {
  const played = games.filter(g => g.our_score > 0 || g.opponent_score > 0)
  if (played.length === 0) return null

  const wins = played.filter(g => g.our_score > g.opponent_score).length
  const losses = played.filter(g => g.our_score < g.opponent_score).length
  const record = `${wins}승 ${losses}패`

  const roundGames = played.filter(g => g.round).sort((a, b) =>
    (ROUND_ORDER[b.round!] ?? 0) - (ROUND_ORDER[a.round!] ?? 0)
  )
  if (roundGames.length === 0) return { record, placement: '' }

  const topGame = roundGames[0]
  const won = topGame.our_score > topGame.opponent_score

  let placement = ''
  if (topGame.round === '결승') {
    placement = won ? '🏆 우승' : '준우승'
  } else if (!won) {
    placement = `${topGame.round} 탈락`
  }

  return { record, placement }
}

export default function TournamentsPage() {
  const team = useTeam()
  const org = useOrg()
  const { isEditMode } = useEditMode()
  const [tournaments, setTournaments] = useState<Tournament[]>([])
  const [games, setGames] = useState<Record<string, Game[]>>({})
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showTForm, setShowTForm] = useState(false)
  const [editT, setEditT] = useState<Tournament | null>(null)
  const [showGForm, setShowGForm] = useState<string | null>(null)
  const [editG, setEditG] = useState<Game | null>(null)
  const [showYtImport, setShowYtImport] = useState(false)
  const [sortDesc, setSortDesc] = useState(true)

  async function fetchTournaments() {
    const res = await fetch(`/api/tournaments?team=${team}`)
    setTournaments(await res.json())
  }

  async function fetchGames(tournamentId: string) {
    const res = await fetch(`/api/games?tournamentId=${tournamentId}`)
    const data = await res.json()
    setGames(prev => ({ ...prev, [tournamentId]: data }))
  }

  useEffect(() => { fetchTournaments() }, [team])

  async function toggleExpand(id: string) {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (!games[id]) await fetchGames(id)
  }

  async function deleteT(id: string) {
    if (!confirm('대회를 삭제하시겠습니까? 관련 경기 데이터도 모두 삭제됩니다.')) return
    await fetch(`/api/tournaments/${id}`, { method: 'DELETE' })
    toast.success('대회 삭제 완료'); fetchTournaments()
  }

  async function deleteG(id: string, tournamentId: string) {
    if (!confirm('경기를 삭제하시겠습니까?')) return
    await fetch(`/api/games/${id}`, { method: 'DELETE' })
    toast.success('경기 삭제 완료'); fetchGames(tournamentId)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-jersey font-black uppercase text-2xl text-[var(--mm-ink)] tracking-tight">대회 관리</h1>
          <button
            onClick={() => setSortDesc(v => !v)}
            className="flex items-center gap-1.5 px-2.5 py-1 min-h-9 rounded-lg text-xs font-medium bg-[var(--mm-panel)] border border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] hover:border-[var(--mm-ink-soft)] transition-colors cursor-pointer"
            title="정렬 순서 변경"
          >
            <ArrowUpDown size={13} />
            {sortDesc ? '최신순' : '오래된순'}
          </button>
        </div>
        {isEditMode && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowYtImport(true)}
              className="border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] cursor-pointer"
            >
              <Youtube size={15} className="mr-1.5 text-red-400" /> YouTube 가져오기
            </Button>
            <Button onClick={() => { setEditT(null); setShowTForm(true) }} className="bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:brightness-95 cursor-pointer">
              <Plus size={16} className="mr-2" /> 대회 추가
            </Button>
          </div>
        )}
      </div>

      {tournaments.length === 0 ? (
        <div className="text-center py-20 text-[var(--mm-muted)]">
          <p>등록된 대회가 없습니다. 대회를 먼저 추가하세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {[...tournaments].sort((a, b) => sortDesc ? b.year - a.year : a.year - b.year).map(t => {
            const tGames = games[t.id] || []
            const summary = getTournamentSummary(tGames)
            const sorted = sortGamesByRound(tGames)

            return (
              <div key={t.id} className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl overflow-hidden">
                <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => toggleExpand(t.id)}>
                  <div className="flex items-center gap-3">
                    {expanded === t.id ? <ChevronUp size={18} className="text-[var(--mm-muted)]" /> : <ChevronDown size={18} className="text-[var(--mm-muted)]" />}
                    <div>
                      <span className="font-semibold text-[var(--mm-ink)]">{t.name}</span>
                      <span className="ml-3 text-sm text-[var(--mm-ink-soft)]">{t.year}년 · {TYPE_LABELS[t.type]}</span>
                      {summary && (
                        <span className="ml-3 text-sm text-[var(--mm-ink-soft)]">
                          {summary.record}
                          {summary.placement && (
                            <span className={`ml-2 font-semibold ${summary.placement.includes('우승') ? 'text-[var(--mm-yellow-strong)]' : 'text-[var(--mm-ink)]'}`}>
                              · {summary.placement}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                  {isEditMode && (
                    <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                      <Button size="sm" variant="outline" onClick={() => { setEditT(t); setShowTForm(true) }} className="h-8 border-[var(--mm-rule)] text-[var(--mm-ink-soft)] cursor-pointer">
                        <Pencil size={12} />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => deleteT(t.id)} className="h-8 border-[var(--mm-rule)] text-red-400 cursor-pointer">
                        <Trash2 size={12} />
                      </Button>
                      <Button size="sm" onClick={() => { setEditG(null); setShowGForm(t.id) }} className="h-8 bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:brightness-95 cursor-pointer">
                        <Plus size={12} className="mr-1" /> 경기
                      </Button>
                    </div>
                  )}
                </div>

                {expanded === t.id && (
                  <div className="border-t border-[var(--mm-rule)]">
                    {sorted.length === 0 ? (
                      <p className="text-center py-6 text-[var(--mm-muted)] text-sm">등록된 경기가 없습니다</p>
                    ) : (
                      <div className="divide-y divide-[var(--mm-rule)]">
                        {sorted.map(g => (
                          <div key={g.id} className="flex items-center justify-between px-6 py-3 flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              {g.round && (
                                <span className="text-xs bg-[var(--mm-panel-alt)] text-[var(--mm-ink-soft)] px-2 py-0.5 rounded font-medium border border-[var(--mm-rule)]">{g.round}</span>
                              )}
                              <span className="text-sm text-[var(--mm-ink-soft)]">{g.date}</span>
                              <span className="font-medium text-[var(--mm-ink)]">vs {g.opponent}</span>
                              {g.venue && <span className="text-xs text-[var(--mm-muted)]">@ {g.venue}</span>}
                              {(g.our_score > 0 || g.opponent_score > 0) && (
                                <span className={`text-sm font-bold ${g.our_score > g.opponent_score ? 'text-green-400' : 'text-red-400'}`}>
                                  {g.our_score} - {g.opponent_score} ({g.our_score > g.opponent_score ? 'W' : 'L'})
                                </span>
                              )}
                              {g.is_complete && <span className="text-xs text-green-400 font-semibold">✓ 완료</span>}
                              {g.youtube_url && (
                                <a
                                  href={g.youtube_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="text-xs text-[var(--mm-yellow-strong)] hover:brightness-90 underline cursor-pointer"
                                >
                                  ▶ 영상
                                </a>
                              )}
                            </div>
                            {isEditMode && (
                              <div className="flex gap-2 flex-shrink-0">
                                <Button size="sm" variant="outline" onClick={() => { setEditG(g); setShowGForm(t.id) }} className="h-7 border-[var(--mm-rule)] text-[var(--mm-ink-soft)] cursor-pointer">
                                  <Pencil size={11} />
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => deleteG(g.id, t.id)} className="h-7 border-[var(--mm-rule)] text-red-400 cursor-pointer">
                                  <Trash2 size={11} />
                                </Button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showYtImport && (
        <YoutubeImportModal
          team={team}
          onClose={() => setShowYtImport(false)}
          onSaved={() => { setShowYtImport(false); fetchTournaments() }}
        />
      )}

      {showTForm && (
        <TournamentForm tournament={editT} teamType={team} org={org} onClose={() => setShowTForm(false)}
          onSaved={() => { setShowTForm(false); fetchTournaments(); toast.success('저장 완료') }} />
      )}
      {showGForm && (
        <GameForm tournamentId={showGForm} game={editG} onClose={() => { setShowGForm(null); setEditG(null) }}
          onSaved={() => { fetchGames(showGForm); setShowGForm(null); setEditG(null); toast.success('경기 저장 완료') }} />
      )}
    </div>
  )
}
