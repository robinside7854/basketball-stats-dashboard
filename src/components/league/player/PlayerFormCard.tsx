'use client'
// 선수 카드 「최근 트렌드 → 요즘 흐름」 (2026-10-24) — 계산은 전부 서버(lib/stats/playerForm.ts), 여기선 그리기만.
//   참고: 토스 소비 리포트(문장 한 줄) · 달다방 주기 리포트(「최근 N회 기준」 + 판정 상자) · 다음 날씨(「어제보다」).
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { CONSISTENCY_LABEL, FORM_STATS, MIN_DAYS, formHeadline, type Consistency, type PlayerForm } from '@/lib/stats/playerForm'

const TONE: Record<Consistency, { bg: string; fg: string; dots: number }> = {
  steady: { bg: 'var(--mm-yellow-soft)', fg: 'var(--mm-ink)', dots: 3 },
  normal: { bg: 'var(--mm-panel-alt)', fg: 'var(--mm-ink-soft)', dots: 2 },
  swingy: { bg: 'var(--mm-panel-alt)', fg: 'var(--mm-muted)', dots: 1 },
}

function Dots({ n }: { n: number }) {
  return (
    <span aria-hidden className="inline-flex gap-0.5">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: i < n ? 'var(--mm-yellow-strong)' : 'var(--mm-rule)' }} />
      ))}
    </span>
  )
}

export default function PlayerFormCard({ form }: { form: PlayerForm }) {
  const head = form.compare ? formHeadline(form.compare) : null
  const last = form.last
  const lastDate = last ? last.date.slice(5).replace('-', '/') : null
  const unitOf = (k: string) => FORM_STATS.find(s => s.key === k)!.unit

  return (
    <div className="px-5 py-4 space-y-4">
      {/* ① 문장 한 줄 — 숫자만 강조 */}
      {head ? (
        <div>
          <p className="text-lg font-black leading-snug break-keep" style={{ color: 'var(--mm-ink)' }}>
            {head.lead}<span style={{ color: 'var(--mm-yellow-strong)' }}>{head.diff}</span>{head.tail}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--mm-muted)' }}>
            {form.compare!.curLabel} 하루 평균 {form.compare!.cur.pts}점 · {form.compare!.prevLabel} {form.compare!.prev.pts}점
          </p>
        </div>
      ) : (
        <p className="text-sm" style={{ color: 'var(--mm-muted)' }}>비교할 지난 분기 기록이 없어요.</p>
      )}

      {/* ②③ 부문별 평소 범위 + 꾸준함 */}
      <div>
        <p className="text-xs mb-1.5" style={{ color: 'var(--mm-muted)' }}>최근 {form.days}일 기준 · 평소 = 가운데 절반의 날</p>
        <ul className="divide-y" style={{ borderTop: '1px solid var(--mm-rule)', borderBottom: '1px solid var(--mm-rule)', borderColor: 'var(--mm-rule)' }}>
          {form.stats.map(s => {
            const meta = FORM_STATS.find(f => f.key === s.key)!
            const tone = s.consistency ? TONE[s.consistency] : null
            return (
              <li key={s.key} className="flex items-center gap-3 py-2.5" style={{ borderColor: 'var(--mm-rule)' }}>
                <span className="w-9 shrink-0 text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>{meta.label}</span>
                <span className="flex-1 min-w-0 text-sm tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>
                  평소 <b style={{ color: 'var(--mm-ink)' }}>{s.low}~{s.high}{meta.unit}</b>
                  <span className="text-xs ml-1.5" style={{ color: 'var(--mm-muted)' }}>최고 {s.max}</span>
                </span>
                {tone ? (
                  <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-1 text-xs font-bold" style={{ background: tone.bg, color: tone.fg, borderRadius: 'var(--mm-radius-chip)' }}
                    title={`경기당 흔들림 ${s.cv}`}>
                    <Dots n={tone.dots} />{CONSISTENCY_LABEL[s.consistency!]}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs" style={{ color: 'var(--mm-muted)' }}>판정 보류</span>
                )}
              </li>
            )
          })}
        </ul>
        <p className="text-xs mt-1.5" style={{ color: 'var(--mm-muted)' }}>
          꾸준함은 그날 뛴 경기 수를 나눈 <b>경기당</b> 기록으로 봐요. {MIN_DAYS}일 미만이거나 평균이 작으면 판정하지 않아요.
        </p>
      </div>

      {/* ④ 지난 경기일 — 평소 범위와 비교 */}
      {last && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5" style={{ background: 'var(--mm-panel-alt)', borderRadius: 'var(--mm-radius-card)' }}>
          <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>지난 경기일 {lastDate}</span>
          {FORM_STATS.map(s => {
            const v = last.values[s.key], d = last.vs[s.key]
            const Icon = d === 'up' ? ArrowUp : d === 'down' ? ArrowDown : Minus
            const word = d === 'up' ? '평소보다 좋음' : d === 'down' ? '평소보다 낮음' : '평소 수준'
            return (
              <span key={s.key} className="inline-flex items-center gap-1 text-sm tabular-nums" style={{ color: 'var(--mm-ink)' }}>
                {s.label} <b>{v}{unitOf(s.key)}</b>
                <Icon size={14} aria-label={word} style={{ color: d === 'up' ? 'var(--mm-live)' : d === 'down' ? 'var(--mm-series-3)' : 'var(--mm-muted)' }} />
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
