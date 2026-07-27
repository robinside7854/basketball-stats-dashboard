'use client'
// 인스타 매거진 카드 — 4:5 (1080×1350) 고정 캔버스, 다크 배경 + 옐로 액센트(고정색).
import type { RoundMagazineData, SocialLeader, LeaderDetail, RoundStanding } from '@/lib/social/weeklyData'
import type { UpcomingEntry } from '@/lib/stats/milestones'

export const IG_W = 1080
export const IG_H = 1350

const C = {
  bg: '#0A0A0A', panel: '#17171A', rule: '#2E2E33',
  ink: '#FAFAFA', muted: '#9CA3AF',
  yellow: '#EAB308', yellowSoft: 'rgba(234,179,8,0.14)', onYellow: '#0A0A0A',
  pos: '#34D399', neg: '#F87171',
}
const JERSEY = 'var(--font-barlow-condensed), "Barlow Condensed", "Oswald", sans-serif'
const ellip = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const

function Shell({ kicker, children, footer = true }: { kicker: string; children: React.ReactNode; footer?: boolean }) {
  return (
    <div style={{ width: IG_W, height: IG_H, background: C.bg, color: C.ink, position: 'relative', overflow: 'hidden', fontFamily: 'Pretendard, system-ui, sans-serif' }}>
      <div aria-hidden style={{ position: 'absolute', inset: 0, opacity: 0.05, background: `repeating-linear-gradient(90deg, transparent 0 108px, ${C.yellow} 108px 110px)` }} />
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '46px 60px 0' }}>
        <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 30, letterSpacing: '0.14em', color: C.yellow, textTransform: 'uppercase' }}>Miracle Weekly</span>
        <span style={{ fontFamily: JERSEY, fontWeight: 800, fontSize: 26, letterSpacing: '0.06em', color: C.muted }}>{kicker}</span>
      </div>
      <div style={{ position: 'relative', padding: '22px 60px 0', height: footer ? IG_H - 178 : IG_H - 100, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      {footer && (
        <div style={{ position: 'absolute', left: 60, right: 60, bottom: 40, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${C.rule}`, paddingTop: 16 }}>
          <span style={{ color: C.muted, fontSize: 22, fontWeight: 700 }}>미라클모닝농구단</span>
          <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 24, color: C.yellow, letterSpacing: '0.1em' }}>@MIRACLE_MORNING</span>
        </div>
      )}
    </div>
  )
}

function Avatar({ url, name, size, radius = 16 }: { url: string | null; name: string; size: number; radius?: number }) {
  const initial = (name ?? '?').trim()[0] ?? '?'
  return (
    <div style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', background: C.panel, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.rule}` }}>
      {url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={url} alt={name} crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top', display: 'block' }} />
        : <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: size * 0.42, color: C.muted }}>{initial}</span>}
    </div>
  )
}

function TeamChip({ name, color, size = 24 }: { name: string; color: string; size?: number }) {
  if (!name) return null
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 999, padding: '4px 14px 4px 10px', maxWidth: '100%' }}>
      <span style={{ width: size * 0.55, height: size * 0.55, borderRadius: 4, background: color, flexShrink: 0 }} />
      <span style={{ fontSize: size, fontWeight: 800, color: C.muted, ...ellip }}>{name}</span>
    </span>
  )
}

function TitleBlock({ title, metric }: { title: string; metric: string }) {
  return (
    <div style={{ marginBottom: 20, flexShrink: 0 }}>
      <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 72, lineHeight: 1, color: C.ink, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>{title}</div>
      <div style={{ marginTop: 8, display: 'inline-block', background: C.yellow, color: C.onYellow, fontFamily: JERSEY, fontWeight: 900, fontSize: 24, letterSpacing: '0.06em', padding: '5px 14px', borderRadius: 8, textTransform: 'uppercase' }}>{metric}</div>
    </div>
  )
}

function DetailBox({ d }: { d: LeaderDetail }) {
  return (
    <div style={{ flex: 1, background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '14px 8px', textAlign: 'center', minWidth: 0 }}>
      <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 46, color: C.yellow, lineHeight: 1 }}>{d.value}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: C.muted, marginTop: 6, ...ellip }}>{d.label}</div>
    </div>
  )
}

// 팀 순위표 (표지 · 분기 누적 공용) — 남은 높이를 채움
function StandingsTable({ standings, emptyText }: { standings: RoundStanding[]; emptyText: string }) {
  const cols = '84px 1fr 190px 140px 140px'
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, alignItems: 'center', padding: '0 22px 10px', color: C.muted, fontFamily: JERSEY, fontWeight: 800, fontSize: 24, letterSpacing: '0.06em', flexShrink: 0 }}>
        <span>순위</span><span>팀</span><span style={{ textAlign: 'center' }}>승-무-패</span><span style={{ textAlign: 'center' }}>승률</span><span style={{ textAlign: 'center' }}>마진</span>
      </div>
      {standings.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 30, padding: 30 }}>{emptyText}</div>
      ) : standings.map(s => {
        const first = s.rank === 1
        return (
          <div key={s.key} style={{ flex: 1, display: 'grid', gridTemplateColumns: cols, alignItems: 'center', background: first ? C.yellowSoft : C.panel, border: `1px solid ${first ? C.yellow : C.rule}`, borderRadius: 16, padding: '0 22px', marginBottom: 14, minHeight: 0, overflow: 'hidden' }}>
            <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 58, color: first ? C.yellow : C.muted }}>{s.rank}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
              <span style={{ width: 20, height: 20, borderRadius: 5, background: s.color, flexShrink: 0 }} />
              <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 50, color: C.ink, textTransform: 'uppercase', ...ellip }}>{s.name}</span>
            </span>
            <span style={{ textAlign: 'center', fontFamily: JERSEY, fontWeight: 900, fontSize: 44, color: C.ink }}>{s.wins}-{s.draws}-{s.losses}</span>
            <span style={{ textAlign: 'center', fontFamily: JERSEY, fontWeight: 900, fontSize: 44, color: first ? C.yellow : C.ink }}>{s.winRate}%</span>
            <span style={{ textAlign: 'center', fontFamily: JERSEY, fontWeight: 900, fontSize: 44, color: s.margin > 0 ? C.pos : s.margin < 0 ? C.neg : C.muted }}>{s.margin > 0 ? `+${s.margin}` : s.margin}</span>
          </div>
        )
      })}
    </div>
  )
}

// ── 1. 표지 — 날짜 + 라운드 순위 ─────────────
export function CoverCard({ data, vol, headline }: { data: RoundMagazineData; vol: string; headline: string }) {
  return (
    <Shell kicker={`VOL.${vol || '1'}`}>
      <div style={{ flexShrink: 0, marginBottom: 20 }}>
        <div style={{ color: C.muted, fontFamily: JERSEY, fontWeight: 800, fontSize: 30, letterSpacing: '0.1em' }}>ROUND RESULT</div>
        <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 104, lineHeight: 0.95, color: C.yellow }}>{data.dateLabel}</div>
        {headline && <div style={{ marginTop: 6, fontSize: 40, fontWeight: 800, color: C.ink, ...ellip }}>{headline}</div>}
      </div>
      <StandingsTable standings={data.standings} emptyText="이 날의 순위 데이터가 없습니다." />
    </Shell>
  )
}

// ── 2. 스코어보드 ────────────────────────────
export function ScoreboardCard({ data }: { data: RoundMagazineData }) {
  const games = data.games
  return (
    <Shell kicker={data.dateLabel}>
      <TitleBlock title="스코어보드" metric={`${games.length}경기`} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
        {games.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 30 }}>이 날 완료된 경기가 없습니다.</div>
        ) : games.map((g, i) => {
          const hw = g.homeScore > g.awayScore, aw = g.awayScore > g.homeScore
          return (
            <div key={i} style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 16, background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '0 26px', minHeight: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', minWidth: 0 }}>
                <span style={{ fontWeight: 800, fontSize: 32, color: hw ? C.ink : C.muted, ...ellip }}>{g.homeName}</span>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: g.homeColor, flexShrink: 0 }} />
              </div>
              <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 50, whiteSpace: 'nowrap' }}>
                <span style={{ color: hw ? C.yellow : C.ink }}>{g.homeScore}</span>
                <span style={{ color: C.muted, margin: '0 12px' }}>:</span>
                <span style={{ color: aw ? C.yellow : C.ink }}>{g.awayScore}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: g.awayColor, flexShrink: 0 }} />
                <span style={{ fontWeight: 800, fontSize: 32, color: aw ? C.ink : C.muted, ...ellip }}>{g.awayName}</span>
              </div>
            </div>
          )
        })}
      </div>
    </Shell>
  )
}

// ── 3~6. 리더 — 1위 hero + 상세박스 + 소속 ─────
export function LeaderCard({ data, title, metric, unit, leaders }: { data: RoundMagazineData; title: string; metric: string; unit: string; leaders: SocialLeader[] }) {
  const [first, ...rest] = leaders
  return (
    <Shell kicker={data.dateLabel}>
      <TitleBlock title={title} metric={metric} />
      {!first ? (
        <div style={{ color: C.muted, fontSize: 30 }}>집계된 기록이 없습니다.</div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          {/* 1위 HERO */}
          <div style={{ flex: 3, display: 'flex', flexDirection: 'column', background: C.yellowSoft, border: `2px solid ${C.yellow}`, borderRadius: 20, padding: 22, minHeight: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', gap: 22, flex: 1, minHeight: 0, alignItems: 'center' }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <Avatar url={first.photo_url} name={first.name} size={240} radius={16} />
                <span style={{ position: 'absolute', top: 8, left: 8, background: C.yellow, color: C.onYellow, fontFamily: JERSEY, fontWeight: 900, fontSize: 34, width: 52, height: 52, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>1</span>
              </div>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={{ marginBottom: 8, maxWidth: '100%' }}><TeamChip name={first.teamName} color={first.teamColor} size={24} /></div>
                <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 68, lineHeight: 1, color: C.ink, textTransform: 'uppercase', ...ellip }}>{first.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
                  <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 120, lineHeight: 0.9, color: C.yellow }}>{first.value}</span>
                  {unit && <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 40, color: C.ink }}>{unit}</span>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 14, flexShrink: 0 }}>
              {first.details.map(d => <DetailBox key={d.label} d={d} />)}
            </div>
          </div>
          {/* 2~3위 */}
          {rest.map((p, i) => (
            <div key={p.id} style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 18, background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 16, padding: '0 22px', minHeight: 0, overflow: 'hidden' }}>
              <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 52, width: 46, textAlign: 'center', color: C.muted, flexShrink: 0 }}>{i + 2}</span>
              <Avatar url={p.photo_url} name={p.name} size={120} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 48, color: C.ink, textTransform: 'uppercase', lineHeight: 1.05, ...ellip }}>{p.name}</div>
                <div style={{ marginTop: 4, maxWidth: '100%' }}><TeamChip name={p.teamName} color={p.teamColor} size={20} /></div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                {p.details.map(d => (
                  <div key={d.label} style={{ textAlign: 'center', minWidth: 84 }}>
                    <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 32, color: C.muted, lineHeight: 1 }}>{d.value}</div>
                    <div style={{ fontSize: 18, color: C.muted, marginTop: 4, whiteSpace: 'nowrap' }}>{d.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 120 }}>
                <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 76, color: C.ink }}>{p.value}</span>
                {unit && <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 26, color: C.yellow, marginLeft: 6 }}>{unit}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  )
}

// ── 7. 이 날의 BEST — 5지표 + AI 자동선정 + 소속 ─
export function BestCard({ data }: { data: RoundMagazineData }) {
  const b = data.best
  const stats: [string, number][] = b ? [['득점', b.line.pts], ['리바운드', b.line.reb], ['어시스트', b.line.ast], ['스틸', b.line.stl], ['블록', b.line.blk]] : []
  return (
    <Shell kicker={data.dateLabel}>
      <TitleBlock title="이 날의 BEST" metric="MVP" />
      {!b ? (
        <div style={{ color: C.muted, fontSize: 30 }}>집계된 기록이 없습니다.</div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
          <Avatar url={b.photo_url} name={b.name} size={320} radius={22} />
          <div style={{ marginTop: 18, maxWidth: '100%' }}><TeamChip name={b.teamName} color={b.teamColor} size={26} /></div>
          <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 88, marginTop: 12, color: C.ink, textTransform: 'uppercase', ...ellip, maxWidth: '100%' }}>{b.name}</div>
          <div style={{ display: 'flex', gap: 12, marginTop: 24, width: '100%' }}>
            {stats.map(([label, v]) => (
              <div key={label} style={{ flex: 1, background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 14, padding: '18px 4px', textAlign: 'center', minWidth: 0 }}>
                <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 58, color: C.yellow, lineHeight: 1 }}>{v}</div>
                <div style={{ color: C.muted, fontSize: 21, fontWeight: 700, marginTop: 6, ...ellip }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ color: C.muted, fontSize: 22, marginTop: 24, textAlign: 'center' }}>AI 자동 선정 · 종합 지표(득점·리바·어시·수비 가중) 기준</div>
        </div>
      )}
    </Shell>
  )
}

// ── 8. 분기 누적 순위 (BEST 다음, 마일스톤 앞) ─
export function QuarterStandingsCard({ data }: { data: RoundMagazineData }) {
  return (
    <Shell kicker={data.dateLabel}>
      <TitleBlock title="분기 누적 순위" metric={`${data.quarterLabel} · ${data.dateLabel}까지`} />
      <StandingsTable standings={data.quarterStandings} emptyText="분기 누적 순위 데이터가 없습니다." />
    </Shell>
  )
}

// ── 9. 마일스톤 체이서 ─────────────────────
export function MilestoneCard({ data }: { data: RoundMagazineData }) {
  const ms: UpcomingEntry[] = data.milestones.slice(0, 4)
  return (
    <Shell kicker={data.dateLabel}>
      <TitleBlock title="마일스톤" metric="다음 경기 주목" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0 }}>
        {ms.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 30 }}>임박한 통산 기록이 없습니다.</div>
        ) : ms.map(m => (
          <div key={m.player_id} style={{ flex: 1, background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 16, padding: '0 30px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, gap: 16 }}>
              <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 54, color: C.ink, ...ellip }}>{m.name}</span>
              <span style={{ color: C.yellow, fontFamily: JERSEY, fontWeight: 900, fontSize: 40, whiteSpace: 'nowrap', flexShrink: 0 }}>통산 {m.target}까지 -{m.distance}</span>
            </div>
            <div style={{ height: 18, borderRadius: 10, background: C.bg, overflow: 'hidden', border: `1px solid ${C.rule}` }}>
              <div style={{ width: `${Math.min(100, Math.max(4, m.percent))}%`, height: '100%', background: C.yellow }} />
            </div>
            <div style={{ color: C.muted, fontSize: 24, fontWeight: 700, marginTop: 10 }}>현재 {m.current}점 · {m.percent}%</div>
          </div>
        ))}
      </div>
    </Shell>
  )
}
