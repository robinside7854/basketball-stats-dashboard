'use client'
// 인스타 카드 생성 스튜디오 — 라운드(경기 날짜) 선택 + 9장 미리보기 + PNG 저장(html-to-image).
// 라운드는 URL(?date=)로 서버 재조회, 표지 Vol/헤드라인은 로컬 상태.
import { useState, useRef } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import type { RoundMagazineData } from '@/lib/social/weeklyData'
import type { CutSheetGame } from '@/lib/social/cutSheet'
import { CoverCard, ScoreboardCard, LeaderCard, BestCard, QuarterStandingsCard, MilestoneCard, IG_W, IG_H } from './SocialCards'
import SocialCutSheet from './SocialCutSheet'

const PREVIEW_W = 320
const SCALE = PREVIEW_W / IG_W
const PREVIEW_H = Math.round(IG_H * SCALE)
const DOW = ['일', '월', '화', '수', '목', '금', '토']
function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} (${DOW[d.getDay()]})`
}

export default function SocialCardStudio({ data, roundDates, cutSheet }: { data: RoundMagazineData; roundDates: string[]; cutSheet: CutSheetGame[] }) {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const [vol, setVol] = useState('1')
  const [headline, setHeadline] = useState('')
  const [busy, setBusy] = useState(false)

  const refs = useRef<Record<string, HTMLDivElement | null>>({})

  const selectRound = (date: string) => {
    const p = new URLSearchParams(sp.toString())
    p.set('date', date)
    router.push(`${pathname}?${p.toString()}`)
  }

  const cards = [
    { id: 'cover', label: '1. 표지', node: <CoverCard data={data} vol={vol} headline={headline} /> },
    { id: 'score', label: '2. 스코어보드', node: <ScoreboardCard data={data} /> },
    { id: 'pts', label: '3. 득점 TOP3', node: <LeaderCard data={data} title="득점" metric="POINTS" unit="점" leaders={data.ptsTop} /> },
    { id: 'reb', label: '4. 리바운드 TOP3', node: <LeaderCard data={data} title="리바운드" metric="REBOUNDS" unit="개" leaders={data.rebTop} /> },
    { id: 'ast', label: '5. 어시스트 TOP3', node: <LeaderCard data={data} title="어시스트" metric="ASSISTS" unit="개" leaders={data.astTop} /> },
    { id: 'def', label: '6. 수비 TOP3', node: <LeaderCard data={data} title="수비" metric="STEALS + BLOCKS" unit="" leaders={data.defTop} /> },
    { id: 'best', label: '7. 이 날의 BEST', node: <BestCard data={data} /> },
    { id: 'quarter', label: '8. 분기 누적 순위', node: <QuarterStandingsCard data={data} /> },
    { id: 'ms', label: '9. 마일스톤', node: <MilestoneCard data={data} /> },
  ]

  async function savePng(id: string, idx: number) {
    const el = refs.current[id]
    if (!el) return
    const { toPng } = await import('html-to-image')
    const dataUrl = await toPng(el, { width: IG_W, height: IG_H, pixelRatio: 1, cacheBust: true, backgroundColor: '#0A0A0A' })
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `miracle-${data.date}-${idx + 1}-${id}.png`
    a.click()
  }

  async function saveAll() {
    setBusy(true)
    try {
      for (let i = 0; i < cards.length; i++) {
        await savePng(cards[i].id, i)
        await new Promise(r => setTimeout(r, 400))
      }
      toast.success('9장 PNG 저장 완료')
    } catch (e) {
      toast.error(`저장 실패: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  const inp = 'px-3 py-2 rounded-md text-sm bg-[var(--mm-panel)] border border-[var(--mm-rule)] text-[var(--mm-ink)]'

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-jersey font-black uppercase text-3xl lg:text-4xl text-[var(--mm-ink)] tracking-tight">인스타 카드 생성기</h1>
        <p className="text-[var(--mm-muted)] text-sm mt-1">라운드(경기 날짜)를 골라 4:5(1080×1350) 매거진 카드로. 각 카드 <b>PNG 저장</b> 또는 <b>전체 저장</b>.</p>
      </div>

      {/* 컨트롤 */}
      <div className="flex flex-wrap items-end gap-3 p-4 rounded-md border border-[var(--mm-rule)] bg-[var(--mm-panel)]">
        <label className="flex flex-col gap-1 text-xs font-bold text-[var(--mm-muted)]">라운드 (경기 날짜)
          <select value={data.date} onChange={e => selectRound(e.target.value)} className={`${inp} cursor-pointer`}>
            {roundDates.length === 0 && <option value={data.date}>{fmtDate(data.date)}</option>}
            {roundDates.map(d => <option key={d} value={d}>{fmtDate(d)}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-[var(--mm-muted)]">Vol.
          <input value={vol} onChange={e => setVol(e.target.value)} className={`${inp} w-20`} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-[var(--mm-muted)] flex-1 min-w-[220px]">표지 헤드라인 (선택)
          <input value={headline} onChange={e => setHeadline(e.target.value)} placeholder="예: 3연승, 1위 교체" className={inp} />
        </label>
        <button onClick={saveAll} disabled={busy} className="px-4 py-2 rounded-md text-sm font-black uppercase tracking-wider bg-[color:var(--color-hoop-orange-500)] text-white cursor-pointer disabled:opacity-50 min-h-[40px]">
          {busy ? '저장 중…' : '전체 저장 (9장)'}
        </button>
      </div>

      {/* 카드 미리보기 그리드 */}
      <div className="flex flex-wrap gap-5">
        {cards.map((c, i) => (
          <div key={c.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between" style={{ width: PREVIEW_W }}>
              <span className="text-sm font-bold text-[var(--mm-ink)]">{c.label}</span>
              <button onClick={() => savePng(c.id, i)} className="text-xs font-black uppercase tracking-wider px-2.5 py-1 rounded-md border border-[var(--mm-rule)] text-[var(--mm-ink-soft)] hover:text-[var(--mm-ink)] hover:border-[var(--mm-ink-soft)] cursor-pointer">PNG 저장</button>
            </div>
            <div style={{ width: PREVIEW_W, height: PREVIEW_H, overflow: 'hidden', borderRadius: 8, border: '1px solid var(--mm-rule)' }}>
              <div style={{ transform: `scale(${SCALE})`, transformOrigin: 'top left', width: IG_W, height: IG_H }}>
                <div ref={el => { refs.current[c.id] = el }} style={{ width: IG_W, height: IG_H }}>
                  {c.node}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-[var(--mm-muted)] leading-relaxed">
        · 규격 4:5(1080×1350) · 다크+옐로 고정 테마 · 선수 사진은 Supabase 공개 URL(CORS 허용 시 export 반영).
        7번(이 날의 BEST)은 종합 지표 자동 선정입니다. 템플릿 디테일은 수정요청으로 반복 조정.
      </p>

      {/* 릴스 컷 시트 */}
      <SocialCutSheet games={cutSheet} dateLabel={data.dateLabel} />
    </div>
  )
}
