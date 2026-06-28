'use client'
// 드래프트 완료 화면 — 모든 클라이언트에 한 번에 표시.
//
// - 큰 축하 헤더 (트로피 + 리그 이름 + 분기)
// - 팀별 카드 — 색상 강조, 순번 픽 리스트
// - 통계: 총 픽 수, 진행 시간
// - "이미지로 저장" PNG 다운로드 (html-to-image)
// - "닫기" 로 일반 사용자 dismiss; 감독관 노출은 부모가 제어

import { useEffect, useRef, useState } from 'react'
import { Trophy, Download, X, Users, Clock, Crown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Confetti from './Confetti'

interface Team { id: string; name: string; color: string }
interface Pick {
  pick_number: number
  round_number: number
  team_id: string
  player_id: string
  player_name: string
  player_number: number | null
  player_position: string | null
  picked_at: string
}
interface Leader {
  team_id: string
  leader_player_id: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  title: string                 // "MIRACLE DRAFT 2026.3Q 완료!"
  teams: Team[]
  picks: Pick[]
  draftOrder: string[]
  startedAt: string | null
  completedAt: string | null
  /** 분기별 팀장 — `league_team_quarter_leaders` rows. team 카드 상단 👑 영역에 표시 */
  leaders?: Leader[]
  /** player id → 이름 매핑 (팀장 이름 표시용). 누락된 ID 는 "팀장" 라벨로 fallback */
  playerNames?: Record<string, string>
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return '—'
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime()
  if (!Number.isFinite(ms) || ms <= 0) return '—'
  const totalSec = Math.floor(ms / 1000)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}분 ${s}초`
  return `${s}초`
}

export default function DraftFinalResult({ open, onClose, title, teams, picks, draftOrder, startedAt, completedAt, leaders, playerNames }: Props) {
  const captureRef = useRef<HTMLDivElement | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [trigger, setTrigger] = useState<number | null>(null)

  // 마운트 시 폭죽 — 1회 burst (Confetti 가 자체적으로 stop. trigger 가 같은 값이면 재발화 X)
  useEffect(() => {
    if (open) {
      setTrigger(Date.now())
    } else {
      setTrigger(null) // 닫힐 때 canvas 정리
    }
  }, [open])

  if (!open) return null

  const teamMap = Object.fromEntries(teams.map(t => [t.id, t]))
  const orderedTeams = [
    ...draftOrder.map(id => teamMap[id]).filter(Boolean) as Team[],
    ...teams.filter(t => !draftOrder.includes(t.id)),
  ]
  const picksByTeam: Record<string, Pick[]> = {}
  for (const p of picks) (picksByTeam[p.team_id] ||= []).push(p)
  for (const tid of Object.keys(picksByTeam)) picksByTeam[tid].sort((a, b) => a.pick_number - b.pick_number)
  const duration = formatDuration(startedAt, completedAt)
  // 팀장 매핑 — team_id → leader_player_id (있는 경우만)
  const leaderByTeam: Record<string, string | null> = {}
  for (const l of leaders ?? []) {
    if (l.leader_player_id) leaderByTeam[l.team_id] = l.leader_player_id
  }
  const nameMap = playerNames ?? {}

  async function downloadPng() {
    if (!captureRef.current) return
    setDownloading(true)
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(captureRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        backgroundColor: '#0a0a0f',
      })
      const a = document.createElement('a')
      const safeName = title.replace(/[^a-zA-Z0-9가-힣0-9.\-_]/g, '_').slice(0, 80)
      a.href = dataUrl
      a.download = `${safeName || 'draft-result'}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (e) {
      console.error('[final-result] PNG export failed', e)
      alert('이미지 저장에 실패했습니다. 화면 캡처를 사용해 주세요.')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/85 backdrop-blur-sm p-3 sm:p-6"
      style={{
        paddingTop: 'max(0.75rem, env(safe-area-inset-top))',
        paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
      }}>
      {/* 1회 burst — 3.5s (3차 스태거 200+ particle). trigger 가 같은 값이면 재발화 X */}
      <Confetti trigger={trigger} durationMs={3500} />
      <div className="relative max-w-4xl mx-auto">
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          aria-label="닫기"
          className="absolute -top-1 right-0 sm:top-2 sm:right-2 z-10 w-10 h-10 rounded-full bg-gray-900/80 border border-gray-700 text-gray-200 hover:bg-gray-800 cursor-pointer flex items-center justify-center transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          <X size={18} />
        </button>

        {/* 캡처 대상 영역 */}
        <div
          ref={captureRef}
          className="rounded-2xl border-2 border-amber-600/60 p-5 sm:p-8 lg:p-10 space-y-5 sm:space-y-7"
          style={{
            background: 'linear-gradient(180deg, #1a1208 0%, #0a0a0f 70%, #050505 100%)',
            boxShadow: '0 0 64px rgba(245,158,11,0.18)',
          }}
        >
          {/* 헤더 */}
          <div className="text-center space-y-2 sm:space-y-3">
            <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-amber-400 to-orange-600 shadow-[0_0_30px_rgba(245,158,11,0.6)]">
              <Trophy className="w-9 h-9 sm:w-11 sm:h-11 text-white" />
            </div>
            <p className="text-xs sm:text-sm font-black uppercase tracking-[0.3em] text-amber-300">DRAFT COMPLETE</p>
            <h1 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white break-keep text-balance leading-tight"
              style={{ textShadow: '0 2px 12px rgba(245,158,11,0.4)' }}>
              {title}
            </h1>
            <div className="flex items-center justify-center gap-3 flex-wrap text-sm sm:text-base text-amber-100/90">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/50 border border-amber-700/40">
                <Users size={14} /> {teams.length}팀
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/50 border border-amber-700/40 tabular-nums">
                #{picks.length}픽
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/50 border border-amber-700/40 tabular-nums">
                <Clock size={14} /> {duration}
              </span>
            </div>
          </div>

          {/* 팀별 로스터 카드 그리드 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {orderedTeams.map((t, idx) => {
              const list = picksByTeam[t.id] ?? []
              const leaderId = leaderByTeam[t.id]
              const leaderName = leaderId ? (nameMap[leaderId] ?? '팀장') : null
              // 팀 인원수 — 팀장이 있으면 +1 (팀장이 픽으로도 들어갈 수 있어 중복 방지)
              const leaderIsPicked = leaderId && list.some(p => p.player_id === leaderId)
              const totalMembers = list.length + (leaderName && !leaderIsPicked ? 1 : 0)
              return (
                <div
                  key={t.id}
                  className="rounded-xl border-2 p-3 sm:p-4 min-w-0 backdrop-blur-sm"
                  style={{
                    borderColor: t.color,
                    background: `linear-gradient(180deg, ${t.color}1A 0%, rgba(10,10,15,0.85) 90%)`,
                    boxShadow: `0 0 0 1px ${t.color}33, 0 4px 24px ${t.color}26`,
                  }}
                >
                  <div className="flex items-center gap-2 mb-3 min-w-0">
                    <span className="text-xl sm:text-2xl font-black tabular-nums shrink-0"
                      style={{ color: t.color, fontFamily: 'var(--font-bebas, system-ui, sans-serif)' }}>
                      {idx + 1}
                    </span>
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                    <h3 className="text-base sm:text-lg lg:text-xl font-black text-white truncate break-keep min-w-0">{t.name}</h3>
                    <span className="ml-auto text-xs sm:text-sm font-mono tabular-nums text-gray-300 shrink-0">{totalMembers}명</span>
                  </div>
                  {/* 팀장 라인 — 카드 최상단에 강조 표시 */}
                  {leaderName && (
                    <div
                      className="flex items-center gap-2 px-2.5 py-2 mb-2 rounded-lg border min-w-0"
                      style={{
                        background: `linear-gradient(90deg, ${t.color}26 0%, rgba(245,158,11,0.10) 100%)`,
                        borderColor: `${t.color}66`,
                      }}
                    >
                      <Crown size={14} className="text-amber-300 shrink-0" />
                      <span
                        className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: t.color, color: '#0a0a0a' }}
                      >
                        팀장
                      </span>
                      <span className="text-white font-bold text-sm sm:text-base truncate break-keep min-w-0">
                        {leaderName}
                      </span>
                    </div>
                  )}
                  {list.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-4">{leaderName ? '추가 픽 없음' : '픽 없음'}</p>
                  ) : (
                    <div className="space-y-1">
                      {list.map(p => (
                        <div key={p.pick_number} className="flex items-center gap-1.5 min-w-0">
                          <span className="text-[10px] sm:text-xs font-mono tabular-nums w-8 shrink-0 text-gray-400">#{p.pick_number}</span>
                          {p.player_number != null && (
                            <span className="text-amber-300 font-mono font-bold w-8 shrink-0 text-xs sm:text-sm tabular-nums">#{p.player_number}</span>
                          )}
                          <span className="text-white font-bold text-sm sm:text-base truncate min-w-0 break-keep flex-1">{p.player_name}</span>
                          {p.player_position && (
                            <span className="text-[10px] sm:text-xs text-gray-300 font-mono shrink-0">
                              {p.player_position.split(',').map(s => s.trim()).join('·')}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* 푸터 */}
          <div className="text-center text-xs sm:text-sm text-gray-400 pt-2">
            Generated by 미라클 농구 드래프트 시스템 · {new Date().toLocaleDateString('ko-KR')}
          </div>
        </div>

        {/* 액션 — 캡처 영역 바깥 */}
        <div className="mt-4 flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
          <Button
            onClick={downloadPng}
            disabled={downloading}
            className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-black text-base sm:text-lg h-12 sm:h-14 px-6 sm:px-8 shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <Download size={18} className="mr-2" />
            {downloading ? '저장 중...' : '이미지로 저장'}
          </Button>
          <Button
            onClick={onClose}
            variant="outline"
            className="bg-gray-900 border-gray-700 text-gray-100 hover:bg-gray-800 text-base sm:text-lg h-12 sm:h-14 px-5 sm:px-6 font-bold"
          >
            닫기
          </Button>
        </div>
      </div>
    </div>
  )
}
