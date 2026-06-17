'use client'
import { useState } from 'react'
import { Share2, Crown, Check } from 'lucide-react'

interface Team { id: string; name: string; color: string }
interface Pick { team_id: string; player_id: string; player_name: string; pick_number: number }
interface Leader { team_id: string; leader_player_id: string | null }

interface Props {
  teams: Team[]
  picks: Pick[]
  leaders: Leader[]
  playerNames: Record<string, string>
}

export default function DraftSummaryCard({ teams, picks, leaders, playerNames }: Props) {
  const [copied, setCopied] = useState(false)

  const rosters = teams.map(t => {
    const leaderId = leaders.find(l => l.team_id === t.id)?.leader_player_id
    const teamPicks = picks.filter(p => p.team_id === t.id).sort((a, b) => a.pick_number - b.pick_number)
    return { team: t, leaderName: leaderId ? (playerNames[leaderId] ?? '팀장') : null, picks: teamPicks }
  })

  function buildText(): string {
    let s = '🏀 드래프트 결과\n'
    for (const r of rosters) {
      s += `\n[${r.team.name}]\n`
      if (r.leaderName) s += `  👑 ${r.leaderName} (팀장)\n`
      r.picks.forEach((p, i) => { s += `  ${i + 1}. ${p.player_name}\n` })
    }
    return s
  }

  async function share() {
    const text = buildText()
    const url = typeof window !== 'undefined' ? window.location.href : ''
    try {
      if (navigator.share) { await navigator.share({ title: '드래프트 결과', text, url }); return }
    } catch { /* 취소 등 무시 */ }
    try {
      await navigator.clipboard.writeText(text + (url ? `\n${url}` : ''))
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <div className="bg-gradient-to-b from-gray-900 to-gray-950 border border-emerald-700/40 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-800 flex items-center gap-2">
        <p className="text-base font-bold text-white">🏆 드래프트 결과 요약</p>
        <button onClick={share} className="ml-auto inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white cursor-pointer">
          {copied ? <><Check size={14} /> 복사됨</> : <><Share2 size={14} /> 공유</>}
        </button>
      </div>
      <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {rosters.map(r => (
          <div key={r.team.id} className="bg-gray-900/70 rounded-xl border border-gray-800 overflow-hidden" style={{ borderTopColor: r.team.color, borderTopWidth: 3 }}>
            <div className="px-3 py-2 flex items-center gap-2 border-b border-gray-800">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: r.team.color }} />
              <span className="font-bold text-white">{r.team.name}</span>
              <span className="ml-auto text-[11px] text-gray-500">{r.picks.length + (r.leaderName ? 1 : 0)}명</span>
            </div>
            <div className="p-2 space-y-1">
              {r.leaderName && (
                <div className="flex items-center gap-2 text-sm px-2 py-1 rounded bg-amber-500/10">
                  <Crown size={13} className="text-amber-400" />
                  <span className="text-amber-200 font-bold">{r.leaderName}</span>
                  <span className="text-[10px] text-amber-400/70">팀장</span>
                </div>
              )}
              {r.picks.map((p, i) => (
                <div key={p.player_id} className="flex items-center gap-2 text-sm px-2 py-1">
                  <span className="text-gray-600 font-display w-5 text-center">{i + 1}</span>
                  <span className="text-gray-100">{p.player_name}</span>
                </div>
              ))}
              {r.picks.length === 0 && !r.leaderName && <p className="text-xs text-gray-600 px-2 py-1">기록 없음</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
