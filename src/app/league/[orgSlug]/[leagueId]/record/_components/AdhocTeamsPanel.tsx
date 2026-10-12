import { Loader2, UserPlus, X } from 'lucide-react'
import type { LeagueTeam } from '@/types/league'
import type { Setter } from '../_lib/types'

// 이 날짜 전용 임시팀 관리 — 친선전은 상시 3팀이 아니라 그날 짠 팀으로 한다.
//   만든 팀은 이 날짜의 친선 슬롯에서만 보이고, 순위·명단·드래프트·일정에는 등장하지 않는다.
//   (친선 경기일 때만 그린다 — 호출부가 selectedSlot.is_exhibition 으로 거른다)
export default function AdhocTeamsPanel({
  selectedDate, adhocTeams, newTeamName, setNewTeamName, newTeamColor, setNewTeamColor,
  creatingTeam, createAdhocTeam, deletingTeamId, deleteAdhocTeam,
}: {
  selectedDate: string
  adhocTeams: LeagueTeam[]
  newTeamName: string
  setNewTeamName: Setter<string>
  newTeamColor: string
  setNewTeamColor: Setter<string>
  creatingTeam: boolean
  createAdhocTeam: () => Promise<void>
  deletingTeamId: string | null
  deleteAdhocTeam: (teamId: string, name: string) => Promise<void>
}) {
  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px dashed var(--mm-rule)' }}>
      <div className="flex items-baseline gap-2 flex-wrap mb-2">
        <span className="t-label" style={{ color: 'var(--mm-muted)' }}>
          임시팀
        </span>
        <span className="text-xs" style={{ color: 'var(--mm-muted)' }}>
          {selectedDate} 전용 · 같은 날 다른 친선 경기에서도 그대로 씁니다
        </span>
      </div>

      {adhocTeams.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5 mb-2 list-none p-0 m-0">
          {adhocTeams.map(t => (
            <li
              key={t.id}
              className="inline-flex items-center gap-1.5 pl-2.5 text-xs font-bold min-h-[44px]"
              style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
            >
              <span
                aria-hidden
                className="w-2.5 h-2.5 shrink-0"
                style={{ background: t.color, borderRadius: '9999px' }}
              />
              {t.name}
              <button
                type="button"
                onClick={() => deleteAdhocTeam(t.id, t.name)}
                disabled={deletingTeamId === t.id}
                aria-label={`임시팀 ${t.name} 삭제`}
                title="삭제 (경기에 배정돼 있으면 막힙니다)"
                className="inline-flex items-center justify-center w-11 h-11 shrink-0 cursor-pointer transition-colors duration-200 hover:opacity-70 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                style={{ color: 'var(--mm-muted)' }}
              >
                {deletingTeamId === t.id
                  ? <Loader2 size={14} className="animate-spin" aria-hidden />
                  : <X size={14} strokeWidth={2.5} aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs mb-2" style={{ color: 'var(--mm-muted)' }}>
          아직 만든 팀이 없습니다 — 아래에서 이름을 넣어 두 팀을 만드세요 (예: 흰팀 / 검은팀)
        </p>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <label htmlFor="adhoc-team-name" className="sr-only">임시팀 이름</label>
        <input
          id="adhoc-team-name"
          value={newTeamName}
          onChange={e => setNewTeamName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !creatingTeam) { e.preventDefault(); createAdhocTeam() } }}
          placeholder="팀 이름 (예: 흰팀)"
          maxLength={20}
          className="px-2.5 py-1.5 text-xs min-h-[44px] w-[160px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)', borderRadius: '4px' }}
        />
        <label htmlFor="adhoc-team-color" className="sr-only">임시팀 색상</label>
        <input
          id="adhoc-team-color"
          type="color"
          value={newTeamColor}
          onChange={e => setNewTeamColor(e.target.value)}
          title="임시팀 색상 — 박스스코어·기록 화면에서 두 팀을 가르는 색"
          className="w-11 h-11 shrink-0 cursor-pointer p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
        />
        <button
          type="button"
          onClick={createAdhocTeam}
          disabled={creatingTeam || newTeamName.trim().length === 0}
          className="inline-flex items-center gap-1.5 cursor-pointer shrink-0 text-xs font-bold px-3 py-1.5 min-h-[44px] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '4px' }}
        >
          {creatingTeam
            ? <Loader2 size={14} className="animate-spin" aria-hidden />
            : <UserPlus size={14} strokeWidth={2.5} aria-hidden />}
          팀 만들기
        </button>
      </div>
    </div>
  )
}
