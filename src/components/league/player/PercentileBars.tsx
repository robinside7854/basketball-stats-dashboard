'use client'
// 선수 카드 「세부 능력치」 — 묶음(득점·슈팅·리바운드·플레이메이킹·수비)마다 백분위 막대 (2026-10-14).
// 출처: kbl-stats `app/components/PercentileBars.tsx` 의 배치(라벨 · 값 · 막대 · 백분위 숫자).
// 막대 길이 = 백분위, 색 = 낮음 빨강 · 50 회색 · 높음 초록(divergingFill). 숫자는 막대 밖에 둔다.
// 계산은 서버(`detail` 라우트 → lib/stats/percentileBars.ts) — 여기서는 그리기만.
import { ChevronRight } from 'lucide-react'
import { divergingFill, percentileTone, MIN_ATTEMPTS_PER_DAY, type PercentileBarsResult } from '@/lib/stats/percentileBars'

export default function PercentileBars({ data }: { data: PercentileBarsResult }) {
  if (data.groups.length === 0) return null
  return (
    // (2026-10-15) 접어 둔다 — 같은 탭의 순위 칩·6축 레이더와 같은 데이터라 처음부터 펼치면 같은 숫자를 세 번 보게 된다.
    //   레이더가 요약, 이 막대는 「왜 그 축이 그만큼인가」를 보고 싶을 때 여는 세부다.
    <details className="mt-3 group">
      <summary
        className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 min-h-11 py-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mm-yellow-strong)]"
      >
        <span className="inline-flex items-center gap-1.5 text-sm font-black" style={{ color: 'var(--mm-ink)' }}>
          <ChevronRight size={16} aria-hidden className="transition-transform duration-200 group-open:rotate-90" />
          세부 능력치
        </span>
        <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>
          리그 백분위 · 하루 평균 · 비교 {data.sample}명
        </span>
      </summary>
      {!data.qualified && (
        <p className="mb-2 text-xs" style={{ color: 'var(--mm-muted)' }}>
          출전일이 순위 기준(열린 날의 30%)에 못 미쳐 백분위는 비워 둡니다.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {data.groups.map(g => (
          <div key={g.key} className="rounded-sm px-3 py-2.5" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}>
            <h4 className="flex items-baseline justify-between text-sm font-black tabular-nums" style={{ color: 'var(--mm-ink)' }}>
              {g.label}
              <span className="text-xs font-bold" style={{ color: 'var(--mm-ink-soft)' }} aria-label={g.groupPct === null ? '묶음 백분위 없음' : `묶음 평균 백분위 ${g.groupPct}`}>
                {g.groupPct === null ? '–' : g.groupPct}
              </span>
            </h4>
            <ul className="mt-1.5 space-y-1.5 tabular-nums">
              {g.rows.map(r => (
                <li
                  key={r.key}
                  className="grid grid-cols-[5.5rem_3rem_minmax(1.5rem,1fr)_1.75rem] items-center gap-x-2 text-xs"
                  aria-label={`${r.label} ${r.valueText}, ${r.pct === null ? '백분위 없음(시도 부족 또는 출전일 부족)' : `백분위 ${r.pct}`}${r.lowerIsBetter ? ' — 낮을수록 좋음' : ''}`}
                >
                  <span className="whitespace-nowrap font-bold" style={{ color: 'var(--mm-ink-soft)' }} aria-hidden>
                    {r.label}{r.lowerIsBetter && <span style={{ color: 'var(--mm-muted)' }}> ↓</span>}
                  </span>
                  <span className="text-right" style={{ color: 'var(--mm-ink)' }} aria-hidden>{r.valueText}</span>
                  <span className="relative block h-2 overflow-hidden rounded-sm" style={{ background: 'var(--mm-rule)' }} aria-hidden>
                    {r.pct !== null && (
                      <span
                        className="absolute inset-y-0 left-0 block rounded-sm"
                        style={{ width: `${Math.max(2, r.pct)}%`, background: divergingFill(percentileTone(r.pct)) }}
                      />
                    )}
                  </span>
                  <span className="text-right font-black" style={{ color: 'var(--mm-ink)' }} aria-hidden>{r.pct === null ? '–' : r.pct}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: 'var(--mm-muted)' }}>
        {([[-1, '하위'], [0, '중간'], [1, '상위']] as const).map(([t, label]) => (
          <span key={label} className="inline-flex items-center gap-1">
            <span aria-hidden className="block h-2 w-5 rounded-sm" style={{ background: divergingFill(t) }} />
            {label}
          </span>
        ))}
        <span>
          표본이 작다(약 {data.sample}명) — 몇 명 차이로 크게 움직입니다. 실책(↓)은 적을수록 높은 백분위 ·
          성공률은 하루 평균 야투 {MIN_ATTEMPTS_PER_DAY.fg} · 3점 {MIN_ATTEMPTS_PER_DAY.fg3} · 자유투 {MIN_ATTEMPTS_PER_DAY.ft}개 이상 시도했을 때만(스탯 탭과 같은 기준)
        </span>
      </p>
    </details>
  )
}
