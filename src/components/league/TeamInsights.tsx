'use client'
// 미라클모닝 브랜드 (E안) — TeamInsights
// 팀 하이라이트 · Four Factors · Advanced 팀 평가
// mm-* 팔레트 · font-jersey · rounded 최소 · 그라디언트 제거
import { useEffect, useState } from 'react'
import { Trophy, ShieldCheck, Flame, HandCoins, Target, Activity, Zap, TrendingUp } from 'lucide-react'
import { accentOrInk } from '@/lib/util/contrastColor'

type DayRecord = { date: string; value: number; vs: string; score: string } | null

type Insights = {
  team_total: Record<string, number>
  opp_total: Record<string, number>
  game_count: number
  day_count: number
  records: {
    most_points_day:  DayRecord
    fewest_allowed:   DayRecord
    biggest_win:      DayRecord
    most_ast_day:     DayRecord
    most_3pm_day:     DayRecord
    most_stl_blk_day: DayRecord
    most_reb_day:     DayRecord
  }
  four_factors: {
    efg:  { team: number; opp: number }
    tov:  { team: number; opp: number }
    orb:  { team: number; opp: number }
    ftr:  { team: number; opp: number }
  } | null
  advanced: {
    ortg: number; drtg: number; net_rtg: number; pace: number
    team_poss: number; opp_poss: number
  } | null
}

interface Props {
  leagueId: string
  teamId: string
  quarterId: string | 'all'
  teamColor: string
}

export default function TeamInsights({ leagueId, teamId, quarterId, teamColor }: Props) {
  const [data, setData] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const qp = quarterId !== 'all' ? `?quarterId=${quarterId}` : ''
    fetch(`/api/leagues/${leagueId}/teams/${teamId}/insights${qp}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => setData(d))
      .finally(() => setLoading(false))
  }, [leagueId, teamId, quarterId])

  if (loading) {
    return (
      <p className="text-xs py-3" style={{ color: 'var(--mm-muted)' }}>
        불러오는 중...
      </p>
    )
  }
  if (!data || data.game_count === 0) {
    return (
      <p className="text-xs py-3 text-center" style={{ color: 'var(--mm-muted)' }}>
        완료된 경기가 없어 인사이트를 계산할 수 없습니다.
      </p>
    )
  }

  const { records, four_factors: ff, advanced: adv } = data

  // 단일 일자 기록 카드 — 부문색 없이 중립 accent 하나로 통일
  const recordCards: { key: string; label: string; record: DayRecord; icon: React.ReactNode; suffix?: string }[] = [
    { key: 'pts',     label: '최다 득점 일자',  record: records.most_points_day,  icon: <Flame size={14} />,       suffix: '점' },
    { key: 'allowed', label: '최소 실점 일자',  record: records.fewest_allowed,   icon: <ShieldCheck size={14} />, suffix: '점 허용' },
    { key: 'win',     label: '최대 승점차',     record: records.biggest_win,      icon: <Trophy size={14} />,      suffix: '점 차' },
    { key: 'ast',     label: '최다 어시스트',   record: records.most_ast_day,     icon: <HandCoins size={14} />,   suffix: 'AST' },
    { key: '3pm',     label: '최다 3점슛',      record: records.most_3pm_day,     icon: <Target size={14} />,      suffix: '3PM' },
    { key: 'stlblk',  label: '최다 STL+BLK',    record: records.most_stl_blk_day, icon: <Zap size={14} />,         suffix: '회' },
    { key: 'reb',     label: '최다 리바운드',   record: records.most_reb_day,     icon: <Activity size={14} />,    suffix: 'REB' },
  ]

  // Four Factors (Dean Oliver / Basketball Reference)
  const ffRows = ff ? [
    { label: 'eFG%',      tooltip: '유효 야투율 — (FGM + 0.5×3PM) / FGA',           team: ff.efg.team,  opp: ff.efg.opp,  suffix: '%', higherBetter: true  },
    { label: 'TOV%',      tooltip: '턴오버 비율 — TOV / (FGA + 0.44×FTA + TOV)',     team: ff.tov.team,  opp: ff.tov.opp,  suffix: '%', higherBetter: false },
    { label: 'ORB%',      tooltip: '공격리바운드 점유율 — ORB / (ORB + opp DRB)',    team: ff.orb.team,  opp: ff.orb.opp,  suffix: '%', higherBetter: true  },
    { label: 'FT/FGA',    tooltip: '자유투 시도 비율 — FTA / FGA (얼마나 라인까지 가는가)', team: ff.ftr.team, opp: ff.ftr.opp, suffix: '%', higherBetter: true },
  ] : []

  // 공용 섹션 헤드라인 스타일
  const sectionHeadCls = 'font-bold text-[13px] mb-3'
  const sectionSubCls = 'text-[11px] ml-2 font-bold uppercase tracking-[0.16em]'

  return (
    <div className="space-y-6">

      {/* ── F. 팀 하이라이트 ───────────────────────────────────── */}
      <div>
        <p className={sectionHeadCls} style={{ color: 'var(--mm-ink)' }}>
          팀 하이라이트
          <span className={sectionSubCls} style={{ color: 'var(--mm-muted)' }}>
            라운드 단위 최고 기록 · {data.day_count}R · {data.game_count}G
          </span>
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {recordCards.filter(c => c.record).map(c => (
            <div
              key={c.key}
              className="p-4 sm:p-5 rounded-md"
              style={{
                background: 'var(--mm-panel-alt)',
                border: '1px solid var(--mm-rule)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span style={{ color: 'var(--mm-ink-soft)' }}>{c.icon}</span>
                <span
                  className="font-bold uppercase tracking-[0.16em]"
                  style={{ color: 'var(--mm-ink)', fontSize: '10px' }}
                >
                  {c.label}
                </span>
              </div>
              <div
                className="font-jersey font-black tabular-nums leading-none"
                style={{ color: 'var(--mm-ink)', fontSize: 'clamp(24px, 4.2vw, 30px)' }}
              >
                {c.record!.value}
                <span
                  className="ml-1 font-bold uppercase tracking-[0.12em]"
                  style={{ color: 'var(--mm-muted)', fontSize: '11px' }}
                >
                  {c.suffix}
                </span>
              </div>
              <div
                className="mt-1.5 truncate font-bold uppercase tracking-[0.12em]"
                style={{ color: 'var(--mm-ink-soft)', fontSize: '10px' }}
              >
                {c.record!.date.slice(5)} · vs {c.record!.vs}
              </div>
              <div
                className="font-mono tabular-nums"
                style={{ color: 'var(--mm-muted)', fontSize: '10px' }}
              >
                {c.record!.score}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── G. Four Factors ────────────────────────────────────── */}
      {ff && (
        <div>
          <p className={sectionHeadCls} style={{ color: 'var(--mm-ink)' }}>
            Four Factors
            <span className={sectionSubCls} style={{ color: 'var(--mm-muted)' }}>
              Dean Oliver 표준 · 좌: 우리 팀 · 우: 상대(디펜스)
            </span>
          </p>
          <div className="space-y-1.5">
            {ffRows.map(row => {
              const max = Math.max(row.team, row.opp, 1)
              const teamWins = row.higherBetter ? row.team > row.opp : row.team < row.opp
              return (
                <div key={row.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2" title={row.tooltip}>
                  {/* 좌: 우리 팀 */}
                  <div className="flex items-center justify-end gap-2 min-h-[28px]">
                    <span
                      className="text-sm tabular-nums font-jersey font-black"
                      style={{ color: teamWins ? accentOrInk(teamColor) : 'var(--mm-muted)' }}
                    >
                      {row.team}{row.suffix}
                    </span>
                    <div
                      className="h-5 rounded-l-sm transition-all"
                      style={{
                        width: `${(row.team / max) * 100}%`,
                        backgroundColor: teamColor,
                        opacity: teamWins ? 1 : 0.45,
                        minWidth: row.team > 0 ? 2 : 0,
                      }}
                    />
                  </div>
                  {/* 중앙 라벨 */}
                  <div className="text-center px-2 min-w-[60px]">
                    <span
                      className="font-bold uppercase tracking-[0.16em]"
                      style={{ color: 'var(--mm-ink)', fontSize: '11px' }}
                    >
                      {row.label}
                    </span>
                  </div>
                  {/* 우: 상대 (디펜시브) */}
                  <div className="flex items-center justify-start gap-2 min-h-[28px]">
                    <div
                      className="h-5 rounded-r-sm transition-all"
                      style={{
                        width: `${(row.opp / max) * 100}%`,
                        backgroundColor: 'var(--mm-ink-soft)',
                        opacity: !teamWins ? 1 : 0.45,
                        minWidth: row.opp > 0 ? 2 : 0,
                      }}
                    />
                    <span
                      className="text-sm tabular-nums font-jersey font-black"
                      style={{ color: !teamWins ? 'var(--mm-ink)' : 'var(--mm-muted)' }}
                    >
                      {row.opp}{row.suffix}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <p
            className="mt-2 italic"
            style={{ color: 'var(--mm-muted)', fontSize: '10px' }}
          >
            ※ TOV%는 낮을수록 좋고, 나머지는 높을수록 좋음. 라벨에 마우스를 올리면 공식이 표시됩니다.
          </p>
        </div>
      )}

      {/* ── H. Advanced Team Metrics ───────────────────────────── */}
      {adv && (
        <div>
          <p className={sectionHeadCls} style={{ color: 'var(--mm-ink)' }}>
            <TrendingUp size={12} className="inline mr-1 mb-0.5" style={{ color: 'var(--mm-ink-soft)' }} />
            Advanced 팀 평가
            <span className={sectionSubCls} style={{ color: 'var(--mm-muted)' }}>
              100 포제션당 득실 · Pace = 경기당 평균 포제션
            </span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* ORtg */}
            <div
              className="p-4 sm:p-5 rounded-md"
              style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
            >
              <div
                className="font-bold uppercase tracking-[0.20em]"
                style={{ color: 'var(--mm-ink-soft)', fontSize: '11px' }}
              >
                ORtg
              </div>
              <div
                className="font-jersey font-black tabular-nums leading-none mt-1"
                style={{ color: 'var(--mm-ink)', fontSize: 'clamp(28px, 5vw, 36px)' }}
              >
                {adv.ortg}
              </div>
              <div
                className="mt-1.5 font-bold uppercase tracking-[0.12em]"
                style={{ color: 'var(--mm-muted)', fontSize: '10px' }}
              >
                100 포제션당 득점
              </div>
            </div>
            {/* DRtg */}
            <div
              className="p-4 sm:p-5 rounded-md"
              style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
            >
              <div
                className="font-bold uppercase tracking-[0.20em]"
                style={{ color: 'var(--mm-ink-soft)', fontSize: '11px' }}
              >
                DRtg
              </div>
              <div
                className="font-jersey font-black tabular-nums leading-none mt-1"
                style={{ color: 'var(--mm-ink)', fontSize: 'clamp(28px, 5vw, 36px)' }}
              >
                {adv.drtg}
              </div>
              <div
                className="mt-1.5 font-bold uppercase tracking-[0.12em]"
                style={{ color: 'var(--mm-muted)', fontSize: '10px' }}
              >
                100 포제션당 실점
              </div>
            </div>
            {/* Net Rtg — 부호에 따라 emerald/red 데이터 강조 예외 허용 */}
            <div
              className="p-4 sm:p-5 rounded-md"
              style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
            >
              <div
                className="font-bold uppercase tracking-[0.20em]"
                style={{ color: 'var(--mm-ink-soft)', fontSize: '11px' }}
              >
                Net Rtg
              </div>
              <div
                className="font-jersey font-black tabular-nums leading-none mt-1"
                style={{
                  color: adv.net_rtg > 0 ? 'var(--mm-positive)' : adv.net_rtg < 0 ? 'var(--mm-negative)' : 'var(--mm-ink)',
                  fontSize: 'clamp(28px, 5vw, 36px)',
                }}
              >
                {adv.net_rtg >= 0 ? '+' : ''}{adv.net_rtg}
              </div>
              <div
                className="mt-1.5 font-bold uppercase tracking-[0.12em]"
                style={{ color: 'var(--mm-muted)', fontSize: '10px' }}
              >
                ORtg − DRtg
              </div>
            </div>
            {/* Pace */}
            <div
              className="p-4 sm:p-5 rounded-md"
              style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
            >
              <div
                className="font-bold uppercase tracking-[0.20em]"
                style={{ color: 'var(--mm-ink-soft)', fontSize: '11px' }}
              >
                Pace
              </div>
              <div
                className="font-jersey font-black tabular-nums leading-none mt-1"
                style={{ color: 'var(--mm-ink)', fontSize: 'clamp(28px, 5vw, 36px)' }}
              >
                {adv.pace}
              </div>
              <div
                className="mt-1.5 font-bold uppercase tracking-[0.12em]"
                style={{ color: 'var(--mm-muted)', fontSize: '10px' }}
              >
                경기당 평균 포제션
              </div>
            </div>
          </div>
          <p
            className="mt-2 italic"
            style={{ color: 'var(--mm-muted)', fontSize: '10px' }}
          >
            포제션 = FGA + 0.44×FTA + TOV (Dean Oliver 추정). 우리 팀 누적 {adv.team_poss} / 상대 누적 {adv.opp_poss}.
          </p>
        </div>
      )}
    </div>
  )
}
