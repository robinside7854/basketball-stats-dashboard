'use client'
// 릴스 컷 시트 — 라운드 하이라이트/클러치 클립을 '유튜브 시점 링크 + 시작~길이 + 상황' 목록으로.
// CapCut 등에서 해당 구간만 잘라 이어붙여 릴스 제작. (앱은 영상 미저장 → 편집은 사용자가)
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { ExternalLink, Copy, Film } from 'lucide-react'
import type { CutSheetGame } from '@/lib/social/cutSheet'

export default function SocialCutSheet({ games, dateLabel }: { games: CutSheetGame[]; dateLabel: string }) {
  const [clutchOnly, setClutchOnly] = useState(false)

  const view = useMemo(
    () => games.map(g => ({ ...g, clips: clutchOnly ? g.clips.filter(c => c.isClutch) : g.clips })).filter(g => g.clips.length > 0),
    [games, clutchOnly],
  )
  const totalClips = view.reduce((s, g) => s + g.clips.length, 0)

  function copyText() {
    const lines: string[] = [`🎬 미라클모닝 릴스 컷 시트 · ${dateLabel}${clutchOnly ? ' · 클러치만' : ''}`, '']
    for (const g of view) {
      lines.push(`■ ${g.label}  (${g.youtubeUrl})`)
      for (const c of g.clips) {
        lines.push(`- ${c.timeLabel} (${c.durationSec}초) ${c.player} ${c.typeLabel}${c.assist ? ` (어시 ${c.assist})` : ''}${c.isClutch ? ' [🔥클러치]' : ''} ${c.scoreLabel} → ${c.youtubeUrl}`)
      }
      lines.push('')
    }
    navigator.clipboard.writeText(lines.join('\n')).then(
      () => toast.success('컷 시트 텍스트 복사됨'),
      () => toast.error('복사 실패 — 브라우저 권한 확인'),
    )
  }

  return (
    <div className="space-y-3 border-t border-[var(--mm-rule)] pt-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Film size={18} className="text-[color:var(--color-hoop-orange-500)]" />
          <h2 className="font-jersey font-black uppercase text-2xl text-[var(--mm-ink)] tracking-tight">릴스 컷 시트</h2>
          <span className="text-xs text-[var(--mm-muted)] font-bold">{dateLabel} · {totalClips}개 클립</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setClutchOnly(v => !v)}
            aria-pressed={clutchOnly}
            className="px-2.5 py-1.5 text-xs font-black uppercase tracking-wider rounded-md border cursor-pointer transition-colors flex items-center gap-1.5 min-h-[40px]"
            style={{ background: 'var(--mm-panel)', color: clutchOnly ? 'var(--mm-ink)' : 'var(--mm-muted)', borderColor: clutchOnly ? 'var(--color-hoop-orange-500)' : 'var(--mm-rule)' }}>
            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: clutchOnly ? 'var(--color-hoop-orange-500)' : 'transparent', border: `1px solid ${clutchOnly ? 'var(--color-hoop-orange-500)' : 'var(--mm-muted)'}` }} />
            클러치만
          </button>
          <button onClick={copyText} className="px-3 py-1.5 text-xs font-black uppercase tracking-wider rounded-md bg-[var(--mm-ink)] text-[var(--mm-panel)] cursor-pointer flex items-center gap-1.5 min-h-[40px]">
            <Copy size={13} /> 텍스트 복사
          </button>
        </div>
      </div>

      <p className="text-xs text-[var(--mm-muted)] leading-relaxed">
        각 클립의 <b className="text-[var(--mm-ink-soft)]">시작 시점 유튜브 링크</b> + 길이입니다. CapCut/프리미어에 해당 유튜브 영상을 올린 뒤,
        아래 시간(mm:ss)부터 표시된 길이만큼 잘라 순서대로 이어붙이면 릴스가 됩니다. (앱은 영상을 저장하지 않아 자동 추출은 불가)
      </p>

      {view.length === 0 ? (
        <div className="text-sm text-[var(--mm-muted)] py-6">이 라운드에 {clutchOnly ? '클러치 ' : '하이라이트 '}클립이 없습니다. (유튜브 URL·타임스탬프가 기록된 경기가 있어야 표시됩니다)</div>
      ) : view.map(g => (
        <div key={g.videoId} className="rounded-md border border-[var(--mm-rule)] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--mm-panel-alt)] border-b border-[var(--mm-rule)]">
            <span className="font-jersey font-black uppercase text-sm text-[var(--mm-ink)]">{g.label}</span>
            <a href={g.youtubeUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-[color:var(--color-hoop-orange-500)] hover:underline flex items-center gap-1 cursor-pointer">
              유튜브 열기 <ExternalLink size={12} />
            </a>
          </div>
          <ul>
            {g.clips.map((c, i) => (
              <li key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--mm-rule)] last:border-b-0 text-sm">
                <span className="font-jersey font-black tabular-nums text-[var(--mm-ink)] w-14 shrink-0">{c.timeLabel}</span>
                <span className="text-xs text-[var(--mm-muted)] tabular-nums w-10 shrink-0">{c.durationSec}초</span>
                <span className="inline-flex items-center gap-1.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: c.teamColor }} />
                  <span className="font-bold text-[var(--mm-ink)] truncate">{c.player}</span>
                </span>
                <span className="text-[var(--mm-ink-soft)] shrink-0">{c.typeLabel}</span>
                {c.assist && <span className="text-xs text-[var(--mm-muted)] truncate hidden sm:inline">어시 {c.assist}</span>}
                {c.isClutch && <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)' }}>클러치</span>}
                <span className="text-xs text-[var(--mm-muted)] tabular-nums ml-auto shrink-0">{c.scoreLabel}</span>
                <a href={c.youtubeUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[color:var(--color-hoop-orange-500)] hover:opacity-80 cursor-pointer" title="이 시점부터 재생">
                  <ExternalLink size={16} />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
