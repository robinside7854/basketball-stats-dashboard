'use client'
import { useState } from 'react'
import { Share2, Crown, Check, Trophy } from 'lucide-react'
import { seededShuffle } from '@/lib/draft/shuffle'

interface Team { id: string; name: string; color: string }
interface Pick { team_id: string; player_id: string; player_name: string; pick_number: number }
interface Leader { team_id: string; leader_player_id: string | null }

interface Props {
  teams: Team[]
  picks: Pick[]
  leaders: Leader[]
  playerNames: Record<string, string>
  /**
   * 픽 순서(번호)를 드러낼지. 기본 false = 발표 모드 — 번호 없이 고정 시드로 섞은 명단만.
   * 공유 텍스트도 같이 바뀐다. 카드만 숨기고 복사본에 순서가 남으면 숨긴 의미가 없다.
   */
  showOrder?: boolean
}

export default function DraftSummaryCard({ teams, picks, leaders, playerNames, showOrder = false }: Props) {
  const [copied, setCopied] = useState(false)

  const rosters = teams.map(t => {
    const leaderId = leaders.find(l => l.team_id === t.id)?.leader_player_id
    const mine = picks.filter(p => p.team_id === t.id)
    const teamPicks = showOrder
      ? [...mine].sort((a, b) => a.pick_number - b.pick_number)
      : seededShuffle(mine, t.id)
    return { team: t, leaderName: leaderId ? (playerNames[leaderId] ?? '팀장') : null, picks: teamPicks }
  })

  function buildText(): string {
    let s = '🏀 드래프트 결과\n'
    for (const r of rosters) {
      s += `\n[${r.team.name}]\n`
      if (r.leaderName) s += `  👑 ${r.leaderName} (팀장)\n`
      r.picks.forEach((p, i) => { s += showOrder ? `  ${i + 1}. ${p.player_name}\n` : `  · ${p.player_name}\n` })
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
        <p className="inline-flex items-center gap-1.5 text-base font-bold text-white"><Trophy size={16} className="text-amber-300" aria-hidden /> 드래프트 결과 요약</p>
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
              <span className="ml-auto text-sm text-gray-500">{r.picks.length + (r.leaderName ? 1 : 0)}명</span>
            </div>
            <div className="p-2 space-y-1">
              {r.leaderName && (
                <div className="flex items-center gap-2 text-sm px-2 py-1 rounded bg-amber-500/10">
                  <Crown size={14} className="text-amber-400" />
                  <span className="text-amber-200 font-bold">{r.leaderName}</span>
                  <span className="text-sm text-amber-400/70">팀장</span>
                </div>
              )}
              {r.picks.map((p, i) => (
                <div key={p.player_id} className="flex items-center gap-2 text-sm px-2 py-1">
                  {showOrder && <span className="t-num text-gray-400 w-5 text-center">{i + 1}</span>}
                  <span className="text-gray-100">{p.player_name}</span>
                </div>
              ))}
              {r.picks.length === 0 && !r.leaderName && <p className="text-xs text-gray-400 px-2 py-1">기록 없음</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
