'use client'
// 인스타 매거진 카드 — 4:5 (1080×1350) 고정 캔버스, 다크 배경 + 옐로 액센트(고정색).
// 앱 테마(라이트/다크)와 무관하게 카드 색은 고정 — 인스타 그리드 일관성 + export 예측성.
import type { RoundMagazineData, SocialLeader, LeaderDetail } from '@/lib/social/weeklyData'
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

// ── 공용 ────────────────────────────────
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
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 999, padding: '4px 14px 4px 10px' }}>
      <span style={{ width: size * 0.55, height: size * 0.55, borderRadius: 4, background: color }} />
      <span style={{ fontSize: size, fontWeight: 800, color: C.muted }}>{name}</span>
    </span>
  )
}

function TitleBlock({ title, metric }: { title: string; metric: string }) {
  return (
    <div style={{ marginBottom: 20, flexShrink: 0 }}>
      <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 72, lineHeight: 1, color: C.ink, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>{title}</div>
      <div style={{ marginTop: 8, display: 'inline-block', background: C.yellow, color: C.onYellow, fontFamily: JERSEY, fontWeight: 900, fontSize: 26, letterSpacing: '0.08em', padding: '5px 14px', borderRadius: 8, textTransform: 'uppercase' }}>{metric}</div>
    </div>
  )
}

function DetailBox({ d, big = false }: { d: LeaderDetail; big?: boolean }) {
  return (
    <div style={{ flex: 1, background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 12, padding: big ? '16px 10px' : '12px 8px', textAlign: 'center', minWidth: 0 }}>
      <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: big ? 48 : 40, color: C.yellow, lineHeight: 1 }}>{d.value}</div>
      <div style={{ fontSize: big ? 22 : 20, fontWeight: 700, color: C.muted, marginTop: 6, whiteSpace: 'nowrap' }}>{d.label}</div>
    </div>
  )
}

// ── 1. 표지 — 날짜 + 팀 순위(승패·승률·마진) ─
export function CoverCard({ data, vol, headline }: { data: RoundMagazineData; vol: string; headline: string }) {
  return (
    <Shell kicker={`VOL.${vol || '1'}`}>
      <div style={{ flexShrink: 0, marginBottom: 22 }}>
        <div style={{ color: C.muted, fontFamily: JERSEY, fontWeight: 800, fontSize: 30, letterSpacing: '0.1em' }}>ROUND RESULT</div>
        <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 108, lineHeight: 0.95, color: C.yellow }}>{data.dateLabel}</div>
        {headline && <div style={{ marginTop: 8, fontSize: 40, fontWeight: 800, color: C.ink }}>{headline}</div>}
      </div>
      {/* 순위표 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 200px 150px 150px', alignItems: 'center', padding: '0 22px 12px', color: C.muted, fontFamily: JERSEY, fontWeight: 800, fontSize: 24, letterSpacing: '0.06em' }}>
          <span>순위</span><span>팀</span><span style={{ textAlign: 'center' }}>승-무-패</span><span style={{ textAlign: 'center' }}>승률</span><span style={{ textAlign: 'center' }}>마진</span>
        </div>
        {data.standings.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 30, padding: 30 }}>이 날의 순위 데이터가 없습니다.</div>
        ) : data.standings.map(s => {
          const first = s.rank === 1
          return (
            <div key={s.key} style={{ flex: 1, display: 'grid', gridTemplateColumns: '90px 1fr 200px 150px 150px', alignItems: 'center', background: first ? C.yellowSoft : C.panel, border: `1px solid ${first ? C.yellow : C.rule}`, borderRadius: 16, padding: '0 22px', marginBottom: 14, minHeight: 0 }}>
              <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 60, color: first ? C.yellow : C.muted }}>{s.rank}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
                <span style={{ width: 20, height: 20, borderRadius: 5, background: s.color, flexShrink: 0 }} />
                <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 52, color: C.ink, textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
              </span>
              <span style={{ textAlign: 'center', fontFamily: JERSEY, fontWeight: 900, fontSize: 46, color: C.ink }}>{s.wins}-{s.draws}-{s.losses}</span>
              <span style={{ textAlign: 'center', fontFamily: JERSEY, fontWeight: 900, fontSize: 46, color: first ? C.yellow : C.ink }}>{s.winRate}%</span>
              <span style={{ textAlign: 'center', fontFamily: JERSEY, fontWeight: 900, fontSize: 46, color: s.margin > 0 ? C.pos : s.margin < 0 ? C.neg : C.muted }}>{s.margin > 0 ? `+${s.margin}` : s.margin}</span>
            </div>
          )
        })}
      </div>
    </Shell>
  )
}

// ── 2. 스코어보드 — 그 날 전 경기 ─────────────
export function ScoreboardCard({ data }: { data: RoundMagazineData }) {
  const games = data.games
  return (
    <Shell kicker={data.dateLabel}>
      <TitleBlock title="스코어보드" metric={`${games.length}경기`} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {games.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 30 }}>이 날 완료된 경기가 없습니다.</div>
        ) : games.map((g, i) => {
          const hw = g.homeScore > g.awayScore, aw = g.awayScore > g.homeScore
          return (
            <div key={i} style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 16, background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '0 26px', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end', minWidth: 0 }}>
                <span style={{ fontWeight: 800, fontSize: 34, color: hw ? C.ink : C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.homeName}</span>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: g.homeColor, flexShrink: 0 }} />
              </div>
              <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 52, whiteSpace: 'nowrap' }}>
                <span style={{ color: hw ? C.yellow : C.ink }}>{g.homeScore}</span>
                <span style={{ color: C.muted, margin: '0 12px' }}>:</span>
                <span style={{ color: aw ? C.yellow : C.ink }}>{g.awayScore}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: g.awayColor, flexShrink: 0 }} />
                <span style={{ fontWeight: 800, fontSize: 34, color: aw ? C.ink : C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.awayName}</span>
              </div>
            </div>
          )
        })}
      </div>
    </Shell>
  )
}

// ── 3~6. 리더 — 1위 확대(hero) + 상세박스 + 소속 ─
export function LeaderCard({ data, title, metric, unit, leaders }: { data: RoundMagazineData; title: string; metric: string; unit: string; leaders: SocialLeader[] }) {
  const [first, ...rest] = leaders
  return (
    <Shell kicker={data.dateLabel}>
      <TitleBlock title={title} metric={metric} />
      {!first ? (
        <div style={{ color: C.muted, fontSize: 30 }}>집계된 기록이 없습니다.</div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 1위 HERO */}
          <div style={{ flex: 3, display: 'flex', flexDirection: 'column', background: C.yellowSoft, border: `2px solid ${C.yellow}`, borderRadius: 20, padding: 24, minHeight: 0 }}>
            <div style={{ display: 'flex', gap: 24, flex: 1, minHeight: 0 }}>
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <Avatar url={first.photo_url} name={first.name} size={300} radius={18} />
                <span style={{ position: 'absolute', top: 10, left: 10, background: C.yellow, color: C.onYellow, fontFamily: JERSEY, fontWeight: 900, fontSize: 40, width: 60, height: 60, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>1</span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
                <div style={{ marginBottom: 10 }}><TeamChip name={first.teamName} color={first.teamColor} size={26} /></div>
                <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 92, lineHeight: 1, color: C.ink, textTransform: 'uppercase' }}>{first.name}</div>
                <div style={{ marginTop: 10 }}>
                  <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 150, lineHeight: 0.9, color: C.yellow }}>{first.value}</span>
                  {unit && <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 44, color: C.ink, marginLeft: 8 }}>{unit}</span>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              {first.details.map(d => <DetailBox key={d.label} d={d} big />)}
            </div>
          </div>
          {/* 2~3위 */}
          {rest.map((p, i) => (
            <div key={p.id} style={{ flex: 2, display: 'flex', alignItems: 'center', gap: 20, background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 16, padding: '0 24px', minHeight: 0 }}>
              <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 56, width: 50, textAlign: 'center', color: C.muted }}>{i + 2}</span>
              <Avatar url={p.photo_url} name={p.name} size={130} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 52, color: C.ink, textTransform: 'uppercase', lineHeight: 1.05 }}>{p.name}</div>
                <div style={{ marginTop: 6 }}><TeamChip name={p.teamName} color={p.teamColor} size={20} /></div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                {p.details.map(d => (
                  <div key={d.label} style={{ textAlign: 'center', minWidth: 90 }}>
                    <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 34, color: C.muted, lineHeight: 1 }}>{d.value}</div>
                    <div style={{ fontSize: 18, color: C.muted, marginTop: 4, whiteSpace: 'nowrap' }}>{d.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 130 }}>
                <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 84, color: C.ink }}>{p.value}</span>
                {unit && <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 28, color: C.yellow, marginLeft: 6 }}>{unit}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  )
}

// ── 7. 이번 라운드 BEST — 5지표 + AI 자동선정 + 소속 ─
export function BestCard({ data }: { data: RoundMagazineData }) {
  const b = data.best
  const stats: [string, number][] = b ? [['득점', b.line.pts], ['리바운드', b.line.reb], ['어시스트', b.line.ast], ['스틸', b.line.stl], ['블록', b.line.blk]] : []
  return (
    <Shell kicker={data.dateLabel}>
      <TitleBlock title="이 날의 BEST" metric="MVP" />
      {!b ? (
        <div style={{ color: C.muted, fontSize: 30 }}>집계된 기록이 없습니다.</div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <Avatar url={b.photo_url} name={b.name} size={380} radius={24} />
          <div style={{ marginTop: 20 }}><TeamChip name={b.teamName} color={b.teamColor} size={28} /></div>
          <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 100, marginTop: 14, color: C.ink, textTransform: 'uppercase' }}>{b.name}</div>
          <div style={{ display: 'flex', gap: 14, marginTop: 28, width: '100%' }}>
            {stats.map(([label, v]) => (
              <div key={label} style={{ flex: 1, background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 14, padding: '20px 6px', textAlign: 'center' }}>
                <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 60, color: C.yellow, lineHeight: 1 }}>{v}</div>
                <div style={{ color: C.muted, fontSize: 22, fontWeight: 700, marginTop: 6 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ color: C.muted, fontSize: 22, marginTop: 26 }}>AI 자동 선정 · 종합 지표(득점·리바·어시·수비 가중) 기준</div>
        </div>
      )}
    </Shell>
  )
}

// ── 8. 마일스톤 체이서 ─────────────────────
export function MilestoneCard({ data }: { data: RoundMagazineData }) {
  const ms: UpcomingEntry[] = data.milestones.slice(0, 4)
  return (
    <Shell kicker={data.dateLabel}>
      <TitleBlock title="마일스톤" metric="다음 경기 주목" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {ms.length === 0 ? (
          <div style={{ color: C.muted, fontSize: 30 }}>임박한 통산 기록이 없습니다.</div>
        ) : ms.map(m => (
          <div key={m.player_id} style={{ flex: 1, background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 16, padding: '0 30px', display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 56, color: C.ink }}>{m.name}</span>
              <span style={{ color: C.yellow, fontFamily: JERSEY, fontWeight: 900, fontSize: 42 }}>통산 {m.target}득점까지 -{m.distance}</span>
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
