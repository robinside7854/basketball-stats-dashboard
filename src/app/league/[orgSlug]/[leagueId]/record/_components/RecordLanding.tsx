import { CalendarDays, Play } from 'lucide-react'
import type { ScheduleDate } from '../_lib/types'

// ── 날짜 미선택 ───────────────────────────────────────────
//   날짜 목록은 「일정」 탭 하나로 합쳤다 (2026-10-11, 운영진 결정).
//   종전엔 일정 탭과 이 화면이 같은 날짜 목록을 두 벌 갖고 있어 "어디서 시작하지"가 갈렸다.
//   일정 카드의 「기록하기」가 `?date=` 로 들어온다. 주소만 치고 들어온 경우를 위해
//   경기일(오늘 이전 가장 최근 · 없으면 가장 가까운 다음 날짜) 바로가기 하나만 남긴다.
export default function RecordLanding({
  orgSlug, leagueId, scheduleDates, selectDate,
}: {
  orgSlug: string
  leagueId: string
  scheduleDates: ScheduleDate[]
  selectDate: (date: string) => void
}) {
  // 렌더 중 Date.now() — 분리 전(page.tsx)과 같은 코드다. 분리 전에는 컴파일러 린트가 이 큰 컴포넌트를
  //   분석하지 못해 드러나지 않았을 뿐이다. 오늘 날짜 바로가기용이라 렌더마다 다시 계산돼도 무해하다.
  // eslint-disable-next-line react-hooks/purity
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  const sorted = [...scheduleDates].map(sd => sd.date).sort()
  const pick = [...sorted].reverse().find(d => d <= today) ?? sorted.find(d => d > today) ?? null
  const pd = pick ? new Date(pick + 'T00:00:00') : null
  return (
    <div className="mm-brand space-y-4">
      <h2 className="font-black text-3xl" style={{ color: 'var(--mm-ink)', letterSpacing: '-0.005em' }}>
        경기 기록
      </h2>
      <div
        className="p-5 space-y-3"
        style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
      >
        <p className="text-sm" style={{ color: 'var(--mm-ink-soft)' }}>
          「일정」 탭의 날짜 카드에서 <b>기록하기</b>를 누르면 그날 경기로 바로 들어옵니다.
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          {pick && pd && (
            <button
              onClick={() => selectDate(pick)}
              className="inline-flex items-center gap-1.5 px-4 min-h-11 text-sm font-bold cursor-pointer"
              style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-yellow)', borderRadius: '4px' }}
            >
              <Play size={14} aria-hidden />
              {pd.getMonth() + 1}월 {pd.getDate()}일 기록하기
            </button>
          )}
          <a
            href={`/league/${orgSlug}/${leagueId}/schedule`}
            className="inline-flex items-center gap-1.5 px-4 min-h-11 text-sm font-bold"
            style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: '4px' }}
          >
            <CalendarDays size={14} aria-hidden />
            일정에서 다른 날짜 고르기
          </a>
        </div>
      </div>
    </div>
  )
}
