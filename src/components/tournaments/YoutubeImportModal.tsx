'use client'
import { useState } from 'react'
import { X, Youtube, ChevronDown, ChevronUp, CheckSquare, Square, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { TournamentGroup, GameData } from '@/app/api/youtube/import/route'

// ── 타입 ─────────────────────────────────────────────────────────────
interface GroupState {
  action: 'create' | 'link'
  linked_id: string
  tournament_type: 'pro' | 'amateur'
  expanded: boolean
}

interface GameState {
  selected: boolean
  our_score: string
  opponent_score: string
}

interface Props {
  team: string
  onClose: () => void
  onSaved: () => void
}

const TYPE_LABELS = { pro: '선출부', amateur: '비선출부' }
const ROUND_BADGE: Record<string, string> = {
  '결승': 'bg-[var(--mm-yellow)]/20 text-[var(--mm-yellow-strong)] border-[var(--mm-yellow)]/40',
  '4강': 'bg-[var(--mm-panel-alt)] text-[var(--mm-ink-soft)] border-[var(--mm-rule)]',
  '준결승': 'bg-[var(--mm-panel-alt)] text-[var(--mm-ink-soft)] border-[var(--mm-rule)]',
  '8강': 'bg-[var(--mm-panel-alt)] text-[var(--mm-ink-soft)] border-[var(--mm-rule)]',
  '16강': 'bg-[var(--mm-panel-alt)] text-[var(--mm-ink-soft)] border-[var(--mm-rule)]',
  '조별예선': 'bg-[var(--mm-panel-alt)] text-[var(--mm-ink-soft)] border-[var(--mm-rule)]',
}

export default function YoutubeImportModal({ team, onClose, onSaved }: Props) {
  const [after, setAfter] = useState('')
  const [before, setBefore] = useState(new Date().toISOString().split('T')[0])
  const [channelHandle, setChannelHandle] = useState('basket-lab')
  const [teamName, setTeamName] = useState('파란날개')
  const [loading, setLoading] = useState(false)
  const [registering, setRegistering] = useState(false)
  const [groups, setGroups] = useState<TournamentGroup[]>([])
  const [groupStates, setGroupStates] = useState<Record<string, GroupState>>({})
  const [gameStates, setGameStates] = useState<Record<string, GameState>>({})
  const [totalFound, setTotalFound] = useState<number | null>(null)

  // ── 영상 불러오기 ────────────────────────────────────────────────
  async function fetchVideos() {
    if (!after) { toast.error('시작 날짜를 입력해주세요'); return }
    setLoading(true)
    setGroups([])
    setGroupStates({})
    setGameStates({})

    const params = new URLSearchParams({ after, before, team, channel: channelHandle, teamName })
    const res = await fetch(`/api/youtube/import?${params}`)
    const data = await res.json()

    if (!res.ok) {
      toast.error(data.error ?? '불러오기 실패')
      setLoading(false)
      return
    }

    const fetched: TournamentGroup[] = data.groups ?? []
    setGroups(fetched)
    setTotalFound(data.total ?? 0)

    // 초기 상태 설정
    const gs: Record<string, GroupState> = {}
    const vs: Record<string, GameState> = {}

    fetched.forEach(g => {
      gs[g.tournament_name] = {
        action: g.existing_tournament ? 'link' : 'create',
        linked_id: g.existing_tournament?.id ?? '',
        tournament_type: 'amateur',
        expanded: true,
      }
      g.games.forEach(game => {
        // 기등록 경기는 기본 선택 해제
        vs[game.video_id] = { selected: !game.already_registered, our_score: '', opponent_score: '' }
      })
    })

    setGroupStates(gs)
    setGameStates(vs)
    setLoading(false)
  }

  // ── 그룹 상태 업데이트 헬퍼 ──────────────────────────────────────
  function updateGroup(name: string, patch: Partial<GroupState>) {
    setGroupStates(prev => ({ ...prev, [name]: { ...prev[name], ...patch } }))
  }

  function updateGame(videoId: string, patch: Partial<GameState>) {
    setGameStates(prev => ({ ...prev, [videoId]: { ...prev[videoId], ...patch } }))
  }

  function toggleAllInGroup(games: GameData[], selected: boolean) {
    setGameStates(prev => {
      const next = { ...prev }
      games.forEach(g => { next[g.video_id] = { ...next[g.video_id], selected } })
      return next
    })
  }

  // ── 선택된 경기 수 ───────────────────────────────────────────────
  const selectedCount = Object.values(gameStates).filter(s => s.selected).length

  // ── 일괄 등록 ───────────────────────────────────────────────────
  async function handleRegister() {
    setRegistering(true)
    let totalRegistered = 0
    let errorCount = 0

    for (const group of groups) {
      const gs = groupStates[group.tournament_name]
      if (!gs) continue

      const selectedGames = group.games.filter(g => gameStates[g.video_id]?.selected)
      if (selectedGames.length === 0) continue

      // 대회 ID 확보
      let tournamentId: string

      if (gs.action === 'link' && gs.linked_id) {
        tournamentId = gs.linked_id
      } else {
        // 새 대회 생성
        const res = await fetch('/api/tournaments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: group.tournament_name,
            year: group.year,
            type: gs.tournament_type,
            team_type: team,
          }),
        })
        if (!res.ok) {
          toast.error(`대회 생성 실패: ${group.tournament_name}`)
          errorCount++
          continue
        }
        const saved = await res.json()
        tournamentId = saved.id
      }

      // 경기 등록
      for (const game of selectedGames) {
        const vs = gameStates[game.video_id]
        const res = await fetch('/api/games', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tournament_id: tournamentId,
            date: game.date,
            opponent: game.opponent,
            round: game.round || null,
            youtube_url: game.url,
            our_score: parseInt(vs?.our_score || '0') || 0,
            opponent_score: parseInt(vs?.opponent_score || '0') || 0,
          }),
        })
        if (res.ok) totalRegistered++
        else errorCount++
      }
    }

    setRegistering(false)

    if (totalRegistered > 0) {
      toast.success(`${totalRegistered}경기 등록 완료${errorCount > 0 ? ` (${errorCount}건 실패)` : ''}`)
      onSaved()
    } else {
      toast.error('등록된 경기가 없습니다')
    }
  }

  // ── 렌더 ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-[var(--mm-ink)]/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-3xl h-[100dvh] sm:h-auto sm:max-h-[90vh] bg-[var(--mm-panel)] border-0 sm:border border-[var(--mm-rule)] rounded-none sm:rounded-2xl flex flex-col shadow-2xl overflow-hidden">

        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 pt-safe-or-4 pb-4 border-b border-[var(--mm-rule)] shrink-0">
          <div className="flex items-center gap-2">
            <Youtube size={18} className="text-red-500" aria-hidden="true" />
            <span className="font-semibold">YouTube에서 경기 가져오기</span>
            <span className="text-xs text-[var(--mm-muted)]">@{channelHandle} · {teamName}</span>
          </div>
          <button onClick={onClose} className="text-[var(--mm-muted)] hover:text-[var(--mm-ink)] rounded-lg hover:bg-[var(--mm-panel-alt)] transition-colors inline-flex items-center justify-center min-h-11 min-w-11 cursor-pointer">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* 채널 설정 */}
        <div className="px-5 pt-4 pb-3 border-b border-[var(--mm-rule)] shrink-0">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs text-[var(--mm-muted)] mb-1 block">YouTube 채널 핸들</label>
              <Input
                value={channelHandle}
                onChange={e => setChannelHandle(e.target.value.replace(/^@/, ''))}
                placeholder="basket-lab"
                className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-[var(--mm-muted)] mb-1 block">팀명 (영상 제목 검색어)</label>
              <Input
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                placeholder="파란날개"
                className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]"
              />
            </div>
          </div>
        </div>

        {/* 기간 입력 */}
        <div className="px-5 py-4 border-b border-[var(--mm-rule)] shrink-0">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="text-xs text-[var(--mm-muted)] mb-1 block">시작일 *</label>
              <Input
                type="date"
                value={after}
                onChange={e => setAfter(e.target.value)}
                className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]"
              />
            </div>
            <span className="text-[var(--mm-muted)] pb-2">~</span>
            <div className="flex-1">
              <label className="text-xs text-[var(--mm-muted)] mb-1 block">종료일</label>
              <Input
                type="date"
                value={before}
                onChange={e => setBefore(e.target.value)}
                className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]"
              />
            </div>
            <Button
              onClick={fetchVideos}
              disabled={loading || !after}
              className="bg-red-600 hover:bg-red-700 text-white shrink-0 cursor-pointer"
            >
              {loading
                ? <><Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden="true" />불러오는 중</>
                : <><Youtube size={14} className="mr-1.5" aria-hidden="true" />영상 불러오기</>
              }
            </Button>
          </div>
          {totalFound !== null && (
            <p className="text-xs text-[var(--mm-muted)] mt-2">
              {totalFound === 0
                ? '해당 기간에 파란날개 영상이 없습니다'
                : (() => {
                    const alreadyCount = groups.flatMap(g => g.games).filter(g => g.already_registered).length
                    const newCount = totalFound - alreadyCount
                    return (
                      <span>
                        {totalFound}개 영상 발견 · {groups.length}개 대회 그룹
                        {alreadyCount > 0 && (
                          <span className="ml-2">
                            <span className="text-[var(--mm-positive)]">{alreadyCount}개 이미 등록됨</span>
                            {newCount > 0 && <span className="text-[var(--mm-ink)] ml-1">· 신규 {newCount}개</span>}
                          </span>
                        )}
                      </span>
                    )
                  })()
              }
            </p>
          )}
        </div>

        {/* 결과 목록 */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {groups.length === 0 && !loading && totalFound !== null && totalFound === 0 && (
            <div className="text-center py-12 text-[var(--mm-muted)]">
              <Youtube size={32} className="mx-auto mb-3 opacity-30" aria-hidden="true" />
              <p>해당 기간에 완료된 라이브 스트림이 없습니다</p>
              <p className="text-xs mt-1 text-[var(--mm-muted)]">날짜 범위를 조정하거나 YouTube 채널을 확인해주세요</p>
            </div>
          )}

          {groups.map(group => {
            const gs = groupStates[group.tournament_name]
            if (!gs) return null
            const allSelected = group.games.every(g => gameStates[g.video_id]?.selected)
            const noneSelected = group.games.every(g => !gameStates[g.video_id]?.selected)
            const groupSelectedCount = group.games.filter(g => gameStates[g.video_id]?.selected).length

            return (
              <div key={group.tournament_name} className="border border-[var(--mm-rule)] rounded-xl overflow-hidden">
                {/* 대회 헤더 */}
                <div className="bg-[var(--mm-panel-alt)] px-4 py-3">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-[var(--mm-ink)] text-sm leading-snug">{group.tournament_name}</p>
                      <p className="text-xs text-[var(--mm-muted)] mt-0.5">
                        {group.year}년 · {group.games.length}경기
                        {group.existing_tournament && (
                          <span className="ml-2 text-[var(--mm-positive)]">✓ DB에 동일 대회 있음</span>
                        )}
                      </p>
                    </div>
                    <button
                      onClick={() => updateGroup(group.tournament_name, { expanded: !gs.expanded })}
                      className="text-[var(--mm-muted)] hover:text-[var(--mm-ink)] p-1 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] rounded"
                    >
                      {gs.expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                    </button>
                  </div>

                  {/* 대회 액션 */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex rounded-lg overflow-hidden border border-[var(--mm-rule)] text-xs">
                      <button
                        onClick={() => updateGroup(group.tournament_name, { action: 'create' })}
                        className={`px-3 py-1.5 transition-colors cursor-pointer ${gs.action === 'create' ? 'bg-[var(--mm-ink)] text-[var(--mm-panel)]' : 'text-[var(--mm-muted)] hover:text-[var(--mm-ink)]'}`}
                      >
                        새 대회 생성
                      </button>
                      <button
                        onClick={() => updateGroup(group.tournament_name, { action: 'link' })}
                        className={`px-3 py-1.5 transition-colors cursor-pointer ${gs.action === 'link' ? 'bg-[var(--mm-ink)] text-[var(--mm-panel)]' : 'text-[var(--mm-muted)] hover:text-[var(--mm-ink)]'}`}
                      >
                        기존 대회에 추가
                      </button>
                    </div>

                    {gs.action === 'create' && (
                      <Select
                        value={gs.tournament_type}
                        onValueChange={v => updateGroup(group.tournament_name, { tournament_type: v as 'pro' | 'amateur' })}
                      >
                        <SelectTrigger className="h-7 text-xs bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)]">
                          <SelectItem value="pro">선출부</SelectItem>
                          <SelectItem value="amateur">비선출부</SelectItem>
                        </SelectContent>
                      </Select>
                    )}

                    {gs.action === 'link' && group.existing_tournament && (
                      <span className="text-xs text-[var(--mm-positive)] bg-green-900/30 border border-green-700/50 px-2.5 py-1 rounded-lg">
                        → {group.existing_tournament.name} ({group.existing_tournament.year}) · {TYPE_LABELS[group.existing_tournament.type as keyof typeof TYPE_LABELS] ?? group.existing_tournament.type}
                      </span>
                    )}

                    {gs.action === 'link' && !group.existing_tournament && (
                      <span className="text-xs text-orange-400">DB에 일치하는 대회 없음 → ID 직접 입력 필요</span>
                    )}
                  </div>
                </div>

                {/* 경기 목록 */}
                {gs.expanded && (
                  <div>
                    {/* 전체 선택 */}
                    <div className="flex items-center gap-2 px-4 py-2 border-t border-[var(--mm-rule)] bg-[var(--mm-panel-alt)]/50">
                      <button
                        onClick={() => toggleAllInGroup(group.games, !allSelected)}
                        className="flex items-center gap-1.5 text-xs text-[var(--mm-muted)] hover:text-[var(--mm-ink)] transition-colors cursor-pointer"
                      >
                        {allSelected ? <CheckSquare size={14} className="text-[var(--mm-yellow-strong)]" aria-hidden="true" /> : noneSelected ? <Square size={14} aria-hidden="true" /> : <CheckSquare size={14} className="text-[var(--mm-yellow-strong)]/50" aria-hidden="true" />}
                        전체 선택 ({groupSelectedCount}/{group.games.length})
                      </button>
                    </div>

                    <div className="divide-y divide-[var(--mm-rule)]">
                      {group.games.map(game => {
                        const vs = gameStates[game.video_id]
                        if (!vs) return null
                        return (
                          <div key={game.video_id} className={`px-4 py-3 transition-colors ${vs.selected ? '' : 'opacity-40'}`}>
                            <div className="flex items-start gap-3">
                              {/* 선택 체크박스 */}
                              <button
                                onClick={() => updateGame(game.video_id, { selected: !vs.selected })}
                                className="mt-0.5 shrink-0 text-[var(--mm-muted)] hover:text-[var(--mm-yellow-strong)] transition-colors cursor-pointer"
                              >
                                {vs.selected ? <CheckSquare size={16} className="text-[var(--mm-yellow-strong)]" aria-hidden="true" /> : <Square size={16} aria-hidden="true" />}
                              </button>

                              <div className="flex-1 min-w-0">
                                {/* 경기 메타 */}
                                <div className="flex items-center gap-2 flex-wrap mb-2">
                                  {game.round && (
                                    <span className={`text-xs px-2 py-0.5 rounded border font-medium ${ROUND_BADGE[game.round] ?? 'bg-[var(--mm-panel-alt)] text-[var(--mm-ink-soft)] border-[var(--mm-rule)]'}`}>
                                      {game.round}
                                    </span>
                                  )}
                                  <span className="text-xs text-[var(--mm-muted)]">{game.date}</span>
                                  <span className="text-sm font-medium">vs {game.opponent}</span>
                                  {game.already_registered && (
                                    <span className="text-xs px-2 py-0.5 rounded border bg-green-900/30 text-[var(--mm-positive)] border-green-700/50 font-medium">
                                      ✓ 이미 등록됨
                                    </span>
                                  )}
                                  <a
                                    href={game.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-red-500 hover:text-red-400 flex items-center gap-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mm-yellow-strong)] rounded"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <Youtube size={11} aria-hidden="true" /> 영상
                                  </a>
                                </div>

                                {/* 점수 입력 */}
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-[var(--mm-muted)] shrink-0">점수</span>
                                  <Input
                                    type="number"
                                    min={0}
                                    placeholder="우리팀"
                                    value={vs.our_score}
                                    onChange={e => updateGame(game.video_id, { our_score: e.target.value })}
                                    className="h-7 w-20 text-xs bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] px-2"
                                  />
                                  <span className="text-[var(--mm-muted)] text-sm">:</span>
                                  <Input
                                    type="number"
                                    min={0}
                                    placeholder="상대팀"
                                    value={vs.opponent_score}
                                    onChange={e => updateGame(game.video_id, { opponent_score: e.target.value })}
                                    className="h-7 w-20 text-xs bg-[var(--mm-panel-alt)] border-[var(--mm-rule)] text-[var(--mm-ink)] px-2"
                                  />
                                  <span className="text-xs text-[var(--mm-muted)]">(생략 가능)</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* 하단 액션 */}
        {groups.length > 0 && (
          <div className="px-5 py-4 border-t border-[var(--mm-rule)] shrink-0 flex items-center justify-between gap-3">
            <p className="text-sm text-[var(--mm-muted)]">
              <span className="text-[var(--mm-ink)] font-semibold">{selectedCount}경기</span> 선택됨
              <span className="text-[var(--mm-muted)] ml-2">· 점수는 나중에 수정 가능</span>
            </p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={onClose} className="border-[var(--mm-rule)] text-[var(--mm-ink-soft)] cursor-pointer">
                취소
              </Button>
              <Button
                onClick={handleRegister}
                disabled={registering || selectedCount === 0}
                className="bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 disabled:opacity-50 cursor-pointer"
              >
                {registering
                  ? <><Loader2 size={14} className="mr-1.5 animate-spin" aria-hidden="true" />등록 중...</>
                  : `${selectedCount}경기 등록`
                }
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
