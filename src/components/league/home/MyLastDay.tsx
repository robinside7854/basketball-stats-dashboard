'use client'
// 홈 맨 위 「지난 토요일 나」 (2026-10-26 점검 MVP 1) — 앱을 연 회원에게 첫 화면에서 「내 얘기」를 숫자로.
//   점검 결과: 홈·박스스코어·스탯·내 기록 어디에도 「그날 내가 몇 점」이 첫 화면에 없었다(10/14 「내 카드」 삭제 이후).
//   그때 카드가 느렸던 이유(/auth/dashboard 전체 기간 계산)를 피해, 홈이 이미 받는 그날 박스스코어 한 번에서 만든다
//   (HomeMeContext — 요청 추가 없음). 개인 데이터라 브라우저에서만 그린다(홈 나머지는 사용자 공용 서버 캐시).
//   막대 없이 숫자만(2026-10-25 운영진).
import Link from 'next/link'
import { ArrowRight, PlayCircle } from 'lucide-react'
import { useHomeMe } from './HomeMeContext'

function shortDate(date: string): string {
  const d = new Date(date + 'T00:00:00')
  const days = ['일', '월', '화', '수', '목', '금', '토']
  return `${d.getMonth() + 1}/${d.getDate()} (${days[d.getDay()]})`
}

export default function MyLastDay({ base }: { base: string }) {
  const { isMember, serverMember, status, day } = useHomeMe()
  // 회원이 아니면 자리도 잡지 않는다. 회원인데 아직 받는 중이면 같은 높이의 자리.
  if (!serverMember) return null
  if (!isMember || status === 'loading' || status === 'idle') {
    return <div aria-hidden className="mm-shimmer h-[132px]" style={{ borderRadius: 'var(--mm-radius-card)' }} />
  }
  if (status === 'error' || !day) return null

  const line = day.line
  const cardStyle = {
    background: 'radial-gradient(80% 160% at 100% 0%, var(--mm-yellow-soft), transparent 62%), var(--mm-panel)',
    border: '1px solid var(--mm-rule)',
    borderRadius: 'var(--mm-radius-card)',
    boxShadow: 'var(--mm-edge-light), var(--mm-shadow-sm)',
  } as const

  if (!line) {
    return (
      <section aria-label="지난 경기일 내 기록" className="px-4 py-3.5 lg:px-6 flex items-center justify-between gap-3" style={cardStyle}>
        <p className="text-sm font-bold break-keep" style={{ color: 'var(--mm-ink-soft)' }}>
          {shortDate(day.date)}엔 내 기록이 없어요
        </p>
        <Link href={`${base}/me`} className="mm-press inline-flex items-center gap-1 min-h-[44px] text-xs font-black whitespace-nowrap" style={{ color: 'var(--mm-ink)' }}>
          내 기록 <ArrowRight size={14} aria-hidden />
        </Link>
      </section>
    )
  }

  const { w, l, d } = day.record
  const games = w + l + d
  const big: Array<[string, number]> = [['득점', line.pts], ['리바', line.reb], ['어시', line.ast]]
  const extras = [
    line.stl > 0 ? `스틸 ${line.stl}` : null,
    line.blk > 0 ? `블록 ${line.blk}` : null,
    line.fg3m > 0 ? `3점 ${line.fg3m}개` : null,
  ].filter(Boolean)

  return (
    <section aria-labelledby="my-last-day-title" className="px-4 pt-3.5 pb-3 lg:px-6 lg:pt-4" style={cardStyle}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="my-last-day-title" className="t-label" style={{ color: 'var(--mm-yellow-strong)' }}>
          {shortDate(day.date)} · 나
        </h2>
        {day.ptsRank != null && day.dayPlayers > 1 && (
          <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>
            그날 득점 <b style={{ color: 'var(--mm-ink)' }}>{day.ptsRank}위</b> / {day.dayPlayers}명
          </span>
        )}
      </div>

      <dl className="mt-1.5 grid grid-cols-3 gap-2">
        {big.map(([label, v]) => (
          <div key={label} className="min-w-0">
            <dt className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>{label}</dt>
            <dd className="font-jersey font-black tabular-nums leading-none mt-0.5" style={{ color: 'var(--mm-ink)', fontSize: 'clamp(30px, 9vw, 40px)' }}>{v}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-2 text-xs font-bold tabular-nums break-keep" style={{ color: 'var(--mm-ink-soft)' }}>
        {games > 0 ? (
          <>
            {games}경기{' '}
            <span style={{ color: 'var(--mm-positive)' }}>{w}승</span>{' '}
            <span style={{ color: 'var(--mm-negative)' }}>{l}패</span>
            {d > 0 && <> {d}무</>}
          </>
        ) : <>{line.gp}경기</>}
        {extras.length > 0 && <> · {extras.join(' · ')}</>}
        {line.fga > 0 && <> · 야투 {line.fgm}/{line.fga}</>}
      </p>

      <div className="mt-2.5 flex flex-wrap gap-2">
        <Link
          href={`${base}/boxscore/${day.date}?hl=mine`}
          className="mm-press inline-flex items-center gap-1.5 px-3 min-h-[40px] text-xs font-black"
          style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', border: '1px solid var(--mm-black)', borderRadius: 'var(--mm-radius-ctl)' }}
        >
          <PlayCircle size={15} aria-hidden /> 내 하이라이트
        </Link>
        <Link
          href={`${base}/boxscore/${day.date}?me=1`}
          className="mm-press inline-flex items-center gap-1 px-3 min-h-[40px] text-xs font-black"
          style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}
        >
          그날 기록표에서 보기 <ArrowRight size={14} aria-hidden />
        </Link>
      </div>
    </section>
  )
}
