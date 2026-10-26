'use client'
// 미라클모닝 브랜드 (E안) — TeamInsights
// 공격 리바운드 · 팀 하이라이트 · 승리 4요소 · 효율 (2026-10-26 열 이름 한글화 · 공격 리바를 맨 위로)
// mm-* 팔레트 · font-jersey · rounded 최소 · 그라디언트 제거
import { useEffect, useState } from 'react'
import { Trophy, ShieldCheck, Flame, HandCoins, Target, Activity, Zap, TrendingUp } from 'lucide-react'
import { accentOrInk } from '@/lib/util/contrastColor'
import { ShimmerRows } from '@/components/league/teams/TeamsSkeleton'

/** 하루치 최다 기록 카드는 경기일이 이만큼 쌓여야 뜻이 있다 — 분기 초엔 「최다」가 전부 같은 하루라 7장이 비슷하다 */
const MIN_DAYS_FOR_HIGHLIGHTS = 3

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
  // 받은 응답에 요청 키를 붙여 두고, 키가 다르면 로딩으로 본다(effect 안에서 setLoading 을 부르지 않게)
  const reqKey = `${leagueId}|${teamId}|${quarterId}`
  const [got, setGot] = useState<{ key: string; d: Insights | null } | null>(null)

  useEffect(() => {
    let cancelled = false
    const qp = quarterId !== 'all' ? `?quarterId=${quarterId}` : ''
    fetch(`/api/leagues/${leagueId}/teams/${teamId}/insights${qp}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setGot({ key: reqKey, d }) })
      .catch(() => { if (!cancelled) setGot({ key: reqKey, d: null }) })
    return () => { cancelled = true }
  }, [leagueId, teamId, quarterId, reqKey])
  const loading = got?.key !== reqKey
  const data = loading ? null : got!.d

  if (loading) return <ShimmerRows rows={3} height={64} />
  if (!data || data.game_count === 0) {
    return (
      <p className="text-xs py-3 text-center" style={{ color: 'var(--mm-muted)' }}>
        아직 마감된 경기가 없어요.
      </p>
    )
  }

  const { records, four_factors: ff, advanced: adv } = data

  // 단일 일자 기록 카드 — 부문색 없이 중립 accent 하나로 통일
  const recordCards: { key: string; label: string; record: DayRecord; icon: React.ReactNode; suffix?: string }[] = [
    { key: 'pts',     label: '최다 득점 일자',  record: records.most_points_day,  icon: <Flame size={14} />,       suffix: '점' },
    { key: 'allowed', label: '최소 실점 일자',  record: records.fewest_allowed,   icon: <ShieldCheck size={14} />, suffix: '점 허용' },
    { key: 'win',     label: '최대 승점차',     record: records.biggest_win,      icon: <Trophy size={14} />,      suffix: '점 차' },
    { key: 'ast',     label: '최다 어시스트',   record: records.most_ast_day,     icon: <HandCoins size={14} />,   suffix: '개' },
    { key: '3pm',     label: '최다 3점슛',      record: records.most_3pm_day,     icon: <Target size={14} />,      suffix: '개' },
    { key: 'stlblk',  label: '최다 스틸+블록',  record: records.most_stl_blk_day, icon: <Zap size={14} />,         suffix: '회' },
    { key: 'reb',     label: '최다 리바운드',   record: records.most_reb_day,     icon: <Activity size={14} />,    suffix: '개' },
  ]

  // 승리 4요소 (Four Factors — Dean Oliver). 화면 이름은 스탯 탭 한글과 맞춘다
  const ffRows = ff ? [
    { label: '유효야투',   tooltip: '3점을 1.5개로 쳐 준 야투율 — (야투 성공 + 0.5×3점 성공) / 야투 시도', team: ff.efg.team,  opp: ff.efg.opp,  suffix: '%', higherBetter: true  },
    { label: '턴오버 비율', tooltip: '공격 기회 중 턴오버로 끝난 비율',                                  team: ff.tov.team,  opp: ff.tov.opp,  suffix: '%', higherBetter: false },
    { label: '공리 비율',  tooltip: '빗나간 우리 슛을 우리가 다시 잡은 비율',                            team: ff.orb.team,  opp: ff.orb.opp,  suffix: '%', higherBetter: true  },
    { label: '자유투 유도', tooltip: '야투 시도 대비 자유투 시도 — 얼마나 파울을 얻어내는가',              team: ff.ftr.team, opp: ff.ftr.opp, suffix: '%', higherBetter: true },
  ] : []

  // 공용 섹션 헤드라인 스타일
  const sectionHeadCls = 'font-bold text-sm mb-3'
  const sectionSubCls = 't-label ml-2'

  return (
    <div className="space-y-6">

      {/* ── G2. 공격 리바운드 — 잡은 것 vs 허용한 것 (2026-10-25 운영진) ──
          허용 = 이 팀 경기에서 상대가 잡은 공격 리바운드(opp_total.oreb, 이벤트의 team_id 기준). 친선 제외 — insights API 와 같은 경기 집합. */}
      {(() => {
        const gc = data.game_count
        const ours = data.team_total.oreb ?? 0
        const allowed = data.opp_total.oreb ?? 0
        const per = (v: number) => (gc > 0 ? (v / gc).toFixed(1) : '0.0')
        const better = ours > allowed
        return (
          <div>
            <p className={sectionHeadCls} style={{ color: 'var(--mm-ink)' }}>
              공격 리바운드
              <span className={sectionSubCls} style={{ color: 'var(--mm-muted)' }}>{gc}경기 · 경기당 · 누적</span>
            </p>
            <div className="grid grid-cols-2 gap-2.5 max-w-3xl mx-auto">
              {[
                { label: '잡은 공격 리바', v: ours, color: better ? 'var(--mm-positive)' : 'var(--mm-ink)' },
                { label: '허용한 공격 리바', v: allowed, color: better ? 'var(--mm-ink)' : 'var(--mm-negative)' },
              ].map(c => (
                <div key={c.label} className="p-3 text-center" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}>
                  <div className="font-jersey font-black tabular-nums leading-none" style={{ color: c.color, fontSize: '28px' }}>{per(c.v)}</div>
                  <div className="t-label mt-2" style={{ color: 'var(--mm-ink)' }}>{c.label}</div>
                  <div className="text-xs mt-0.5 tabular-nums" style={{ color: 'var(--mm-muted)' }}>경기당 · 누적 {c.v}개</div>
                </div>
              ))}
            </div>
            <p className="text-xs mt-1.5 text-center" style={{ color: 'var(--mm-muted)' }}>
              허용 = 우리 경기에서 상대가 잡은 공격 리바운드 · 차이 {ours - allowed > 0 ? '+' : ''}{ours - allowed}개
            </p>
          </div>
        )
      })()}

      {/* ── F. 팀 하이라이트 ───────────────────────────────────── */}
      <div>
        <p className={sectionHeadCls} style={{ color: 'var(--mm-ink)' }}>
          팀 하이라이트
          <span className={sectionSubCls} style={{ color: 'var(--mm-muted)' }}>
            하루 최고 기록 · {data.day_count}일 · {data.game_count}경기
          </span>
        </p>
        {/* 폰 2열: 카드 7장이면 마지막 한 장이 왼쪽 반만 차고 오른쪽이 비었다 → 그 한 장만 가운데로.
            칸이 좁아(약 140px) 「10-08 · vs 챗지피…」가 잘리지 않게 폰 안쪽 여백을 한 단계 줄였다 */}
        {data.day_count < MIN_DAYS_FOR_HIGHLIGHTS ? (
          <p className="text-xs py-2" style={{ color: 'var(--mm-muted)' }}>경기일이 더 쌓이면 보여요.</p>
        ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 max-sm:[&>:last-child:nth-child(odd)]:col-span-2 max-sm:[&>:last-child:nth-child(odd)]:justify-self-center max-sm:[&>:last-child:nth-child(odd)]:w-[calc(50%-5px)]">
          {recordCards.filter(c => c.record).map(c => (
            <div
              key={c.key}
              className="p-3 sm:p-5 rounded-md"
              style={{
                background: 'var(--mm-panel-alt)',
                border: '1px solid var(--mm-rule)',
              }}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <span style={{ color: 'var(--mm-ink-soft)' }}>{c.icon}</span>
                <span className="t-label" style={{ color: 'var(--mm-ink)' }}>
                  {c.label}
                </span>
              </div>
              <div
                className="font-jersey font-black tabular-nums leading-none"
                style={{ color: 'var(--mm-ink)', fontSize: 'clamp(24px, 4.2vw, 30px)' }}
              >
                {c.record!.value}
                <span className="t-label ml-1" style={{ color: 'var(--mm-muted)' }}>
                  {c.suffix}
                </span>
              </div>
              <div className="t-label mt-1.5 truncate" style={{ color: 'var(--mm-ink-soft)' }}>
                {c.record!.date.slice(5)} · vs {c.record!.vs}
              </div>
              <div className="t-label tabular-nums" style={{ color: 'var(--mm-muted)' }}>
                {c.record!.score}
              </div>
            </div>
          ))}
        </div>
        )}
      </div>

      {/* ── G. Four Factors ────────────────────────────────────── */}
      {ff && (
        <div>
          <p className={sectionHeadCls} style={{ color: 'var(--mm-ink)' }}>
            승리 4요소
            <span className={sectionSubCls} style={{ color: 'var(--mm-muted)' }}>
              왼쪽 우리 팀 · 오른쪽 상대
            </span>
          </p>
          {/* 막대 비교는 폭을 묶어 가운데로 — 전폭이면 가운데 항목명과 양끝 숫자가 너무 멀다 */}
          <div className="space-y-1.5 max-w-3xl mx-auto">
            {ffRows.map(row => {
              const max = Math.max(row.team, row.opp, 1)
              const teamWins = row.higherBetter ? row.team > row.opp : row.team < row.opp
              return (
                <div key={row.label} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2" title={row.tooltip}>
                  {/* 좌: 우리 팀 */}
                  <div className="flex items-center justify-end gap-2 min-h-[28px]">
                    <span
                      className="t-num text-sm font-bold"
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
                    <span className="t-label" style={{ color: 'var(--mm-ink)' }}>
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
                      className="t-num text-sm font-bold"
                      style={{ color: !teamWins ? 'var(--mm-ink)' : 'var(--mm-muted)' }}
                    >
                      {row.opp}{row.suffix}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <p className="mt-2 italic text-xs" style={{ color: 'var(--mm-muted)' }}>
            ※ 턴오버 비율은 낮을수록, 나머지는 높을수록 좋아요. 항목에 마우스를 올리면 뜻이 나와요.
          </p>
        </div>
      )}

      {/* ── H. Advanced Team Metrics ───────────────────────────── */}
      {adv && (
        <div>
          <p className={sectionHeadCls} style={{ color: 'var(--mm-ink)' }}>
            <TrendingUp size={14} className="inline mr-1 mb-0.5" style={{ color: 'var(--mm-ink-soft)' }} />
            팀 효율
            <span className={sectionSubCls} style={{ color: 'var(--mm-muted)' }}>
              공격 100번당 득실 · 경기 속도 = 평균 공격 횟수
            </span>
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {/* ORtg */}
            <div
              className="p-3 sm:p-5 rounded-md"
              style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
            >
              <div className="t-label" style={{ color: 'var(--mm-ink-soft)' }}>
                공격 효율
              </div>
              <div
                className="font-jersey font-black tabular-nums leading-none mt-1"
                style={{ color: 'var(--mm-ink)', fontSize: 'clamp(28px, 5vw, 36px)' }}
              >
                {adv.ortg}
              </div>
              <div className="t-label mt-1.5" style={{ color: 'var(--mm-muted)' }}>
                공격 100번당 득점
              </div>
            </div>
            {/* DRtg */}
            <div
              className="p-3 sm:p-5 rounded-md"
              style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
            >
              <div className="t-label" style={{ color: 'var(--mm-ink-soft)' }}>
                수비 효율
              </div>
              <div
                className="font-jersey font-black tabular-nums leading-none mt-1"
                style={{ color: 'var(--mm-ink)', fontSize: 'clamp(28px, 5vw, 36px)' }}
              >
                {adv.drtg}
              </div>
              <div className="t-label mt-1.5" style={{ color: 'var(--mm-muted)' }}>
                공격 100번당 실점 · 낮을수록 좋음
              </div>
            </div>
            {/* 효율 차 — 부호에 따라 positive/negative */}
            <div
              className="p-3 sm:p-5 rounded-md"
              style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
            >
              <div className="t-label" style={{ color: 'var(--mm-ink-soft)' }}>
                효율 차
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
              <div className="t-label mt-1.5" style={{ color: 'var(--mm-muted)' }}>
                공격 효율 − 수비 효율
              </div>
            </div>
            {/* Pace */}
            <div
              className="p-3 sm:p-5 rounded-md"
              style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}
            >
              <div className="t-label" style={{ color: 'var(--mm-ink-soft)' }}>
                경기 속도
              </div>
              <div
                className="font-jersey font-black tabular-nums leading-none mt-1"
                style={{ color: 'var(--mm-ink)', fontSize: 'clamp(28px, 5vw, 36px)' }}
              >
                {adv.pace}
              </div>
              <div className="t-label mt-1.5" style={{ color: 'var(--mm-muted)' }}>
                한 경기 평균 공격 횟수
              </div>
            </div>
          </div>
          <p className="mt-2 italic text-xs" style={{ color: 'var(--mm-muted)' }}>
            공격 횟수 = 야투 시도 + 0.44×자유투 시도 + 턴오버 (추정). 우리 팀 누적 {adv.team_poss}번 / 상대 누적 {adv.opp_poss}번.
          </p>
        </div>
      )}
    </div>
  )
}
