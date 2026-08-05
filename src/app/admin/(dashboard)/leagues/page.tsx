'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, ExternalLink, Trophy, Layers, Trash2, Loader2, Settings, Shield } from 'lucide-react'
import { toast } from 'sonner'

type Team = {
  id: string; name: string; org_slug: string; sub_slug: string
  accent_color: string | null; is_public: boolean
}

type League = {
  id: string; name: string; org_slug: string; status: string
  season_year: number; season_type: string; start_date: string
  team_id: string; mode: 'league' | 'tournament'
  teams: Team | null
}

const statusLabel: Record<string, string> = { upcoming: '예정', active: '진행 중', completed: '완료' }
const statusColor: Record<string, string> = {
  upcoming: 'bg-[var(--mm-yellow-soft)] text-[var(--mm-yellow-strong)]',
  active: 'bg-[var(--mm-positive)]/10 text-[var(--mm-positive)]',
  completed: 'bg-[var(--mm-panel-alt)] text-[var(--mm-muted)]',
}

// 운영 종류(mode) — 한 팀 안에서도 리그와 대회는 규칙·참가자가 다른 별개 운영 단위라,
// 아이콘+라벨+테두리 색을 모두 다르게 줘서 실수로 잘못된 곳을 클릭하지 않게 한다.
//
// 라벨은 회원 화면과 같은 말을 쓴다 — 회원 화면에서 '대회'는 토너먼트를 가리키므로
// (미라클모닝 대회 · 대회 보드 · 대회별 성적), 어드민만 '시즌/토너먼트'로 부르면
// 같은 것을 가리키는 어휘가 두 벌이 된다.
const modeMeta: Record<League['mode'], { label: string; icon: typeof Trophy; className: string }> = {
  league: {
    label: '리그',
    icon: Layers,
    className: 'bg-[var(--mm-panel-alt)] text-[var(--mm-ink)] border border-[var(--mm-rule)]',
  },
  tournament: {
    label: '대회',
    icon: Trophy,
    className: 'bg-[var(--mm-yellow-soft)] text-[var(--mm-yellow-strong)] border border-[var(--mm-yellow-strong)]/30',
  },
}

// 팀 카드 요약용 — 총 개수만 보면 그 팀이 리그를 하는지 대회를 나가는지 알 수 없다.
function countByMode(list: League[], mode: League['mode']): number {
  return list.filter(l => l.mode === mode).length
}

// 팀 그룹 하나 = { 팀 정보, 그 팀이 굴리는 대회 목록 }
type TeamGroup = { team: Team | null; teamId: string; leagues: League[] }

function groupByTeam(leagues: League[]): TeamGroup[] {
  const order: string[] = []
  const map = new Map<string, TeamGroup>()
  for (const l of leagues) {
    const key = l.team_id ?? l.teams?.id ?? l.org_slug
    if (!map.has(key)) {
      map.set(key, { team: l.teams, teamId: key, leagues: [] })
      order.push(key)
    }
    map.get(key)!.leagues.push(l)
  }
  return order.map(key => map.get(key)!)
}

export default function AdminLeaguesPage() {
  const [leagues, setLeagues] = useState<League[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setLoadError(null)
    const res = await fetch('/api/leagues')
    if (res.ok) {
      setLeagues(await res.json())
    } else {
      // 조회 실패를 빈 목록처럼 보여주면 "대회가 하나도 없다"로 오인한다 — 반드시 에러로 표시.
      const d = await res.json().catch(() => ({}))
      setLoadError(d.error ?? '대회 목록을 불러오지 못했습니다')
    }
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function deleteLeague(league: League) {
    if (!confirm(`"${league.name}" 리그를 삭제하시겠습니까?\n경기, 선수, 팀 데이터가 모두 삭제됩니다.`)) return
    setDeletingId(league.id)
    const res = await fetch(`/api/leagues/${league.id}`, { method: 'DELETE' })
    setDeletingId(null)
    if (res.ok) {
      toast.success('대회가 삭제되었습니다')
      load()
    } else {
      const d = await res.json().catch(() => ({}))
      toast.error(d.error ?? '삭제 실패')
    }
  }

  const leagueCount = leagues.filter(l => l.mode === 'league').length
  const tournamentCount = leagues.filter(l => l.mode === 'tournament').length
  const teamGroups = groupByTeam(leagues)
  const totalTeams = teamGroups.length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--mm-ink)]">팀 관리</h1>
          <p className="text-[var(--mm-muted)] text-sm mt-1">팀별 리그·대회를 한 곳에서 관리합니다</p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-4 text-right">
            <div>
              <p className="text-xs text-[var(--mm-muted)]">팀</p>
              <p className="text-xl font-bold text-[var(--mm-ink)]">{loading ? '—' : totalTeams}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--mm-muted)]">리그</p>
              <p className="text-xl font-bold text-[var(--mm-ink)]">{loading ? '—' : leagueCount}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--mm-muted)]">대회</p>
              <p className="text-xl font-bold text-[var(--mm-ink)]">{loading ? '—' : tournamentCount}</p>
            </div>
          </div>
          <Link
            href="/admin/leagues/new"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--mm-ink)] text-[var(--mm-panel)] hover:opacity-90 text-sm font-medium transition-colors cursor-pointer min-h-11"
          >
            <Plus size={15} />
            새 대회 생성
          </Link>
        </div>
      </div>

      <div className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={24} className="animate-spin text-[var(--mm-muted)]" />
          </div>
        ) : loadError ? (
          <div className="text-center py-16 border border-dashed border-[var(--mm-negative)]/40 rounded-xl text-[var(--mm-negative)]">
            <p>{loadError}</p>
            <button
              onClick={load}
              className="mt-3 text-sm underline underline-offset-2 cursor-pointer"
            >
              다시 시도
            </button>
          </div>
        ) : totalTeams === 0 ? (
          <div className="text-center py-16 border border-dashed border-[var(--mm-rule)] rounded-xl text-[var(--mm-muted)]">
            <Trophy size={32} className="mx-auto mb-3 text-[var(--mm-muted)]" />
            <p>아직 생성된 대회가 없습니다</p>
            <p className="text-sm mt-1">새 대회 생성 버튼을 눌러 시작하세요</p>
          </div>
        ) : (
          teamGroups.map(group => (
            <div key={group.teamId} className="bg-[var(--mm-panel)] border border-[var(--mm-rule)] rounded-xl overflow-hidden">
              {/* 팀 헤더 — 미라클모닝농구단처럼 대회가 여러 개여도 팀은 한 번만 나온다 */}
              <div className="flex items-center gap-3 px-5 py-3.5 bg-[var(--mm-panel-alt)] border-b border-[var(--mm-rule)]">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: group.team?.accent_color ?? 'var(--mm-muted)' }}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-[var(--mm-ink)]">{group.team?.name ?? '(팀 정보 없음)'}</p>
                    {group.team && !group.team.is_public && (
                      <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[var(--mm-panel)] text-[var(--mm-muted)] border border-[var(--mm-rule)]">
                        <Shield size={10} />
                        비공개
                      </span>
                    )}
                  </div>
                  {group.team && (
                    <p className="text-xs text-[var(--mm-muted)] mt-0.5 font-mono">/{group.team.org_slug}/{group.team.sub_slug}</p>
                  )}
                </div>
                {/* 종류별로 나눠 보여준다 — 총 개수만 보면 그 팀이 리그를 하는지 대회를 나가는지 알 수 없다 */}
                <span className="text-xs text-[var(--mm-muted)] shrink-0">
                  {countByMode(group.leagues, 'league')}개 리그 · {countByMode(group.leagues, 'tournament')}개 대회
                </span>
              </div>

              {/* 대회 목록 — 같은 팀이라도 시즌 / 토너먼트는 뱃지+아이콘으로 구분해서
                  관리 링크를 잘못 눌러 엉뚱한 대회를 수정하는 일을 막는다 */}
              <div className="divide-y divide-[var(--mm-rule)]">
                {group.leagues.map(league => {
                  const meta = modeMeta[league.mode] ?? modeMeta.league
                  const ModeIcon = meta.icon
                  return (
                    <div key={league.id} className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--mm-panel-alt)] transition-colors">
                      <ModeIcon size={16} className="text-[var(--mm-muted)] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-[var(--mm-ink)]">{league.name}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.className}`}>
                            {meta.label}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[league.status] ?? 'bg-[var(--mm-panel-alt)] text-[var(--mm-muted)]'}`}>
                            {statusLabel[league.status] ?? league.status}
                          </span>
                        </div>
                        <p className="text-sm text-[var(--mm-muted)] mt-0.5">
                          {league.season_year}시즌 · {league.season_type === 'quarterly' ? '분기별' : '연간'} · 시작일 {league.start_date}
                        </p>
                        <p className="text-xs text-[var(--mm-muted)] mt-0.5 font-mono">/league/{league.org_slug}/{league.id.slice(0, 8)}…</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link
                          href={`/admin/leagues/${league.id}`}
                          className="flex items-center gap-1 text-xs text-[var(--mm-yellow-strong)] hover:opacity-80 px-2.5 py-1.5 rounded-lg border border-[var(--mm-yellow-strong)]/30 bg-[var(--mm-yellow-soft)] hover:border-[var(--mm-yellow-strong)]/60 transition-colors cursor-pointer min-h-11"
                        >
                          <Settings size={12} />
                          관리
                        </Link>
                        <Link
                          href={`/league/${league.org_slug}/${league.id}`}
                          target="_blank"
                          className="flex items-center gap-1 text-xs text-[var(--mm-muted)] hover:text-[var(--mm-ink)] px-2.5 py-1.5 rounded-lg border border-[var(--mm-rule)] hover:border-[var(--mm-muted)] transition-colors cursor-pointer min-h-11"
                        >
                          <ExternalLink size={12} />
                          대시보드
                        </Link>
                        <button
                          onClick={() => deleteLeague(league)}
                          disabled={deletingId === league.id}
                          className="p-2.5 rounded-lg text-[var(--mm-muted)] hover:text-[var(--mm-negative)] hover:bg-[var(--mm-panel-alt)] transition-colors disabled:opacity-40 cursor-pointer min-h-11 min-w-11 flex items-center justify-center"
                          title="대회 삭제"
                          aria-label={`${league.name} 삭제`}
                        >
                          {deletingId === league.id
                            ? <Loader2 size={15} className="animate-spin" />
                            : <Trash2 size={15} />}
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
