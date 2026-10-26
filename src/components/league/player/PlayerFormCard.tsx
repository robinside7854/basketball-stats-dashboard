'use client'
// 선수 카드 「요즘 흐름」 (2026-10-24) — 계산은 전부 서버(lib/stats/playerForm.ts), 여기선 그리기만.
//   참고: 토스 소비 리포트(문장 한 줄) · 달다방 주기 리포트(「최근 N회 기준」 + 판정 상자) · 다음 날씨(「어제보다」).
// (2026-10-26) 카드 첫 화면 = 「요약」 탭으로 조각을 나눴다 —
//   PlayerLastDayCard(맨 위 지난 경기일 한 줄) · PlayerFormHeadline(흐름 문장) · PlayerFormRanges(평소 범위·꾸준함).
//   판정(평소보다 ↑/−/↓)은 서버의 form.last 그대로다 — 화면에서 다시 재지 않는다.
import { ArrowDown, ArrowUp, Minus } from 'lucide-react'
import { CONSISTENCY_LABEL, FORM_STATS, MIN_DAYS, formHeadline, type Consistency, type PlayerForm } from '@/lib/stats/playerForm'

const TONE: Record<Consistency, { bg: string; fg: string; dots: number }> = {
  steady: { bg: 'var(--mm-yellow-soft)', fg: 'var(--mm-ink)', dots: 3 },
  normal: { bg: 'var(--mm-panel-alt)', fg: 'var(--mm-ink-soft)', dots: 2 },
  swingy: { bg: 'var(--mm-panel-alt)', fg: 'var(--mm-muted)', dots: 1 },
}

const VS_WORD = { up: '평소보다 많이', same: '평소 수준', down: '평소보다 적게' } as const
const VS_COLOR = { up: 'var(--mm-live)', same: 'var(--mm-muted)', down: 'var(--mm-series-3)' } as const
const VS_ICON = { up: ArrowUp, same: Minus, down: ArrowDown } as const

function Dots({ n }: { n: number }) {
  return (
    <span aria-hidden className="inline-flex gap-0.5">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: i < n ? 'var(--mm-yellow-strong)' : 'var(--mm-rule)' }} />
      ))}
    </span>
  )
}

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']
function dayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  const w = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
  return `${m}월 ${d}일 (${w})`
}

/** 요약 탭 맨 위 — 지난 경기일 득점·리바·어시 + 평소보다 ↑/−/↓ + 그날 팀 전적 */
export function PlayerLastDayCard({ form, record }: {
  form: PlayerForm
  /** 그날 내 팀 전적(하루 합산) — 없으면 줄을 생략 */
  record?: { wins: number; losses: number; draws: number } | null
}) {
  const last = form.last
  if (!last) return null
  const rec = record && record.wins + record.losses + record.draws > 0
    ? `팀 ${record.wins}승 ${record.losses}패${record.draws > 0 ? ` ${record.draws}무` : ''}`
    : null
  return (
    <section
      aria-label="지난 경기일 기록"
      className="px-3 py-2.5"
      style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card)' }}
    >
      <p className="flex flex-wrap items-baseline gap-x-2 text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>
        <span style={{ color: 'var(--mm-ink)' }}>지난 경기일 · {dayLabel(last.date)}</span>
        {rec && <span className="tabular-nums">{rec}</span>}
      </p>
      <div className="grid grid-cols-3 gap-2 mt-1.5">
        {FORM_STATS.map(s => {
          const d = last.vs[s.key]
          const Icon = VS_ICON[d]
          return (
            <div key={s.key} className="min-w-0">
              <p className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>{s.label}</p>
              <p className="font-jersey font-black text-2xl leading-none tabular-nums mt-0.5" style={{ color: 'var(--mm-ink)' }}>
                {last.values[s.key]}<span className="text-sm font-bold ml-0.5" style={{ color: 'var(--mm-ink-soft)' }}>{s.unit}</span>
              </p>
              <p className="inline-flex items-center gap-0.5 text-xs font-bold mt-1 break-keep" style={{ color: VS_COLOR[d] }}>
                <Icon size={13} aria-hidden />{VS_WORD[d]}
              </p>
            </div>
          )
        })}
      </div>
    </section>
  )
}

/** 요즘 흐름 문장 한 줄 — 숫자만 강조. 비교할 지난 분기가 없으면 아무것도 그리지 않는다 */
export function PlayerFormHeadline({ form }: { form: PlayerForm }) {
  const head = form.compare ? formHeadline(form.compare) : null
  if (!head) return null
  return (
    <div>
      <p className="text-xs font-black mb-1" style={{ color: 'var(--mm-yellow-strong)' }}>요즘 흐름</p>
      <p className="text-base font-black leading-snug break-keep" style={{ color: 'var(--mm-ink)' }}>
        {head.lead}<span style={{ color: 'var(--mm-yellow-strong)' }}>{head.diff}</span>{head.tail}
      </p>
      <p className="text-xs mt-1" style={{ color: 'var(--mm-muted)' }}>
        {form.compare!.curLabel} 하루 평균 {form.compare!.cur.pts}점 · {form.compare!.prevLabel} {form.compare!.prev.pts}점
      </p>
    </div>
  )
}

/** 부문별 평소 범위 + 꾸준함 */
export function PlayerFormRanges({ form }: { form: PlayerForm }) {
  return (
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
                  title={`흔들림 ${s.cv} (경기 하나 기준)`}>
                  <Dots n={tone.dots} />{CONSISTENCY_LABEL[s.consistency!]}
                </span>
              ) : (
                <span className="shrink-0 text-xs" style={{ color: 'var(--mm-muted)' }}>판정 보류</span>
              )}
            </li>
          )
        })}
      </ul>
      <p className="text-xs mt-1.5 break-keep" style={{ color: 'var(--mm-muted)' }}>
        평소 범위는 하루 기록, 꾸준함만 그날 뛴 경기 수로 나눈 <b>경기 하나</b> 기준이에요. {MIN_DAYS}일 미만이거나 평균이 작으면 판정하지 않아요.
      </p>
    </div>
  )
}
