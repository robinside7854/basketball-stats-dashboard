'use client'
// 명경기 박스스코어 팝업.
//
// 왜 페이지 이동이 아니라 팝업인가: 명경기는 **훑어보는 목록**이다. 박스스코어를 보려고
//   날짜 페이지로 나가면 돌아오는 길이 뒤로가기뿐이고, 여러 경기를 비교하려면 그걸 반복해야 한다.
//   팝업이면 목록 자리를 잃지 않는다. (2026-08-14 사용자 피드백)
//
// 상단에 '이 경기의 주인공'을 사진과 함께 둔다. 표만 먼저 보이면 숫자를 읽어야 누가 활약했는지
//   알 수 있다. 얼굴이 먼저 오면 경기가 한 줄로 기억된다.
import { useEffect, useState } from 'react'
import { X, Loader2, User } from 'lucide-react'
import type { ClassicGame } from '@/lib/stats/classicGames'

interface BoxRow {
  player_id: string
  name: string
  pts: number; reb: number; ast: number; stl: number; blk: number
}

interface Props {
  leagueId: string
  game: ClassicGame
  onClose: () => void
}

export default function ClassicBoxscoreModal({ leagueId, game, onClose }: Props) {
  const [rows, setRows] = useState<BoxRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ESC 로 닫기 — 팝업은 키보드로도 빠져나갈 수 있어야 한다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/leagues/${leagueId}/stats/${game.gameId}`)
      .then(async r => {
        if (!r.ok) throw new Error(r.status === 401 ? '회원 전용입니다' : '박스스코어를 불러오지 못했습니다')
        return r.json()
      })
      .then((d: { boxScores?: BoxRow[] }) => {
        if (cancelled) return
        // 0점·0스탯 행은 뺀다 — 명단 전원을 나열하면 팝업이 길어져 팝업으로 만든 의미가 없다.
        const played = (d.boxScores ?? []).filter(r => r.pts + r.reb + r.ast + r.stl + r.blk > 0)
        setRows(played.sort((a, b) => b.pts - a.pts))
      })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : '불러오지 못했습니다') })
    return () => { cancelled = true }
  }, [leagueId, game.gameId])

  const hero = game.hero

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${game.homeName} 대 ${game.awayName} 박스스코어`}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative z-10 w-full sm:max-w-lg max-h-[92vh] sm:max-h-[85vh] flex flex-col overflow-hidden mm-modal-in"
        style={{
          background: 'var(--mm-panel)',
          border: '1px solid var(--mm-rule)',
          borderRadius: 'var(--mm-radius-card)',
        }}
      >
        {/* 헤더 — 스코어 */}
        <div className="flex items-center justify-between gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--mm-rule)' }}>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: 'var(--mm-muted)' }}>
              박스스코어
            </p>
            <p className="font-bold text-[15px] truncate" style={{ color: 'var(--mm-ink)' }}>
              {game.homeName} {game.homeScore} : {game.awayScore} {game.awayName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-md cursor-pointer transition-colors hover:bg-[color:var(--mm-panel-alt)]"
            style={{ color: 'var(--mm-ink-soft)' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* 이 경기의 주인공 */}
        {hero && (
          <div className="flex items-center gap-3 px-4 py-3" style={{ background: 'var(--mm-yellow-soft)', borderBottom: '1px solid var(--mm-rule)' }}>
            <div
              className="shrink-0 w-14 h-14 rounded-full overflow-hidden flex items-center justify-center"
              style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
            >
              {hero.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={hero.photoUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <User size={20} aria-hidden style={{ color: 'var(--mm-muted)' }} />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: 'var(--mm-yellow-strong)' }}>
                이 경기의 주인공 · {hero.role}
              </p>
              <p className="font-bold text-[17px] truncate" style={{ color: 'var(--mm-ink)' }}>{hero.name}</p>
              <p className="text-[12px]" style={{ color: 'var(--mm-ink-soft)' }}>{hero.line}</p>
            </div>
          </div>
        )}

        {/* 표 */}
        <div className="overflow-y-auto">
          {error ? (
            <p className="px-4 py-6 text-center text-[13px]" style={{ color: 'var(--mm-muted)' }} role="status">{error}</p>
          ) : !rows ? (
            <div className="flex justify-center py-8"><Loader2 size={20} className="animate-spin" style={{ color: 'var(--mm-muted)' }} /></div>
          ) : rows.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px]" style={{ color: 'var(--mm-muted)' }}>기록된 스탯이 없습니다</p>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                  <th className="text-left px-4 py-2 text-[11px] font-black uppercase" style={{ color: 'var(--mm-muted)', letterSpacing: '0.1em' }}>선수</th>
                  {['PTS', 'REB', 'AST', 'STL', 'BLK'].map(h => (
                    <th key={h} className="text-center px-2 py-2 text-[11px] font-black uppercase" style={{ color: 'var(--mm-muted)', letterSpacing: '0.1em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.player_id} style={{ borderBottom: '1px solid var(--mm-rule)' }}>
                    <td className="px-4 py-2 font-bold truncate max-w-[120px]" style={{ color: 'var(--mm-ink)' }}>{r.name}</td>
                    {([r.pts, r.reb, r.ast, r.stl, r.blk]).map((v, i) => (
                      <td
                        key={i}
                        className="text-center px-2 py-2 tabular-nums"
                        style={{ color: v > 0 ? 'var(--mm-ink)' : 'var(--mm-muted)', fontWeight: i === 0 ? 800 : 400 }}
                      >
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
