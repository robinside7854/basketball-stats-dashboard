'use client'
// 인스타 위클리 매거진 카드 — 4:5 (1080×1350) 고정 캔버스, 다크 배경 + 옐로 액센트(고정색).
// 앱 테마(라이트/다크)와 무관하게 카드 색은 고정 — 인스타 그리드 일관성 + export 예측성.
import type { WeeklyMagazineData, SocialLeader } from '@/lib/social/weeklyData'
import type { UpcomingEntry } from '@/lib/stats/milestones'

export const IG_W = 1080
export const IG_H = 1350

// 고정 팔레트
const C = {
  bg: '#0A0A0A', panel: '#17171A', rule: '#2E2E33',
  ink: '#FAFAFA', muted: '#9CA3AF',
  yellow: '#EAB308', yellowSoft: 'rgba(234,179,8,0.14)', onYellow: '#0A0A0A',
  pos: '#34D399',
}
const JERSEY = 'var(--font-barlow-condensed), "Barlow Condensed", "Oswald", sans-serif'

function fmtWeek(from: string, to: string): string {
  const f = new Date(from + 'T00:00:00'), t = new Date(to + 'T00:00:00')
  const m = (d: Date) => `${d.getMonth() + 1}.${d.getDate()}`
  return from === to ? m(f) : `${m(f)} – ${m(t)}`
}

// ── 공용 셸 ────────────────────────────────
function Shell({ kicker, children, footer = true }: { kicker: string; children: React.ReactNode; footer?: boolean }) {
  return (
    <div style={{ width: IG_W, height: IG_H, background: C.bg, color: C.ink, position: 'relative', overflow: 'hidden', fontFamily: 'Pretendard, system-ui, sans-serif' }}>
      {/* 코트 라인 모티브 (은은) */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, opacity: 0.05, background: `repeating-linear-gradient(90deg, transparent 0 108px, ${C.yellow} 108px 110px)` }} />
      {/* 상단 브랜드 스트립 */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '52px 64px 0' }}>
        <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 30, letterSpacing: '0.14em', color: C.yellow, textTransform: 'uppercase' }}>Miracle Weekly</span>
        <span style={{ fontFamily: JERSEY, fontWeight: 800, fontSize: 26, letterSpacing: '0.06em', color: C.muted }}>{kicker}</span>
      </div>
      <div style={{ position: 'relative', padding: '28px 64px 0', height: footer ? IG_H - 200 : IG_H - 120, boxSizing: 'border-box' }}>
        {children}
      </div>
      {footer && (
        <div style={{ position: 'absolute', left: 64, right: 64, bottom: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${C.rule}`, paddingTop: 20 }}>
          <span style={{ color: C.muted, fontSize: 22, fontWeight: 700 }}>매주 발행 · 미라클모닝농구단</span>
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

function TitleBlock({ title, metric }: { title: string; metric: string }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 76, lineHeight: 1, color: C.ink, textTransform: 'uppercase', letterSpacing: '-0.01em' }}>{title}</div>
      <div style={{ marginTop: 10, display: 'inline-block', background: C.yellow, color: C.onYellow, fontFamily: JERSEY, fontWeight: 900, fontSize: 28, letterSpacing: '0.08em', padding: '6px 16px', borderRadius: 8, textTransform: 'uppercase' }}>{metric}</div>
    </div>
  )
}

// ── 1. 표지 ────────────────────────────────
export function CoverCard({ data, vol, headline }: { data: WeeklyMagazineData; vol: string; headline: string }) {
  const cover = data.best
  return (
    <Shell kicker={fmtWeek(data.from, data.to)} footer={false}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 150, lineHeight: 0.92, color: C.yellow, textTransform: 'uppercase', letterSpacing: '-0.02em' }}>
            VOL.<span style={{ color: C.ink }}>{vol || '1'}</span>
          </div>
          <div style={{ marginTop: 24, fontSize: 46, fontWeight: 800, lineHeight: 1.25, color: C.ink, maxWidth: 900 }}>
            {headline || '이번 주 리그 리캡'}
          </div>
        </div>
        {cover && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 36 }}>
            <Avatar url={cover.photo_url} name={cover.name} size={360} radius={20} />
            <div style={{ paddingBottom: 12 }}>
              <div style={{ color: C.muted, fontFamily: JERSEY, fontWeight: 900, fontSize: 30, letterSpacing: '0.14em' }}>THIS WEEK BEST</div>
              <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 96, lineHeight: 1, color: C.ink }}>{cover.name}</div>
              <div style={{ marginTop: 12, color: C.yellow, fontFamily: JERSEY, fontWeight: 900, fontSize: 44 }}>
                {cover.line.pts}점 · {cover.line.reb}리바 · {cover.line.ast}어시
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  )
}

// ── 2. 스코어보드 ────────────────────────────
export function ScoreboardCard({ data }: { data: WeeklyMagazineData }) {
  const rounds = data.scoreboard.slice(0, 2)
  return (
    <Shell kicker={fmtWeek(data.from, data.to)}>
      <TitleBlock title="스코어보드" metric="THIS WEEK" />
      {rounds.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 30, marginTop: 40 }}>이번 주 완료된 경기가 없습니다.</div>
      ) : rounds.map(r => (
        <div key={r.date} style={{ marginBottom: 28 }}>
          <div style={{ color: C.muted, fontFamily: JERSEY, fontWeight: 800, fontSize: 26, letterSpacing: '0.08em', marginBottom: 12 }}>{r.label}</div>
          {r.games.slice(0, 4).map((g, i) => {
            const homeWin = g.homeScore > g.awayScore, awayWin = g.awayScore > g.homeScore
            return (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 20, background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 12, padding: '18px 26px', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'flex-end' }}>
                  <span style={{ fontWeight: 800, fontSize: 34, color: homeWin ? C.ink : C.muted }}>{g.homeName}</span>
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: g.homeColor }} />
                </div>
                <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 52, color: C.ink, whiteSpace: 'nowrap' }}>
                  <span style={{ color: homeWin ? C.yellow : C.ink }}>{g.homeScore}</span>
                  <span style={{ color: C.muted, margin: '0 12px' }}>:</span>
                  <span style={{ color: awayWin ? C.yellow : C.ink }}>{g.awayScore}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, background: g.awayColor }} />
                  <span style={{ fontWeight: 800, fontSize: 34, color: awayWin ? C.ink : C.muted }}>{g.awayName}</span>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </Shell>
  )
}

// ── 3~6. TOP 3 (지표별) ─────────────────────
export function LeaderCard({ data, title, metric, unit, leaders }: { data: WeeklyMagazineData; title: string; metric: string; unit: string; leaders: SocialLeader[] }) {
  return (
    <Shell kicker={fmtWeek(data.from, data.to)}>
      <TitleBlock title={title} metric={metric} />
      {leaders.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 30, marginTop: 40 }}>집계된 기록이 없습니다.</div>
      ) : leaders.map((p, i) => {
        const rank = i + 1, first = rank === 1
        return (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 28, background: first ? C.yellowSoft : C.panel, border: `1px solid ${first ? C.yellow : C.rule}`, borderRadius: 16, padding: '20px 28px', marginBottom: 18 }}>
            <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 64, width: 60, textAlign: 'center', color: first ? C.yellow : C.muted }}>{rank}</span>
            <Avatar url={p.photo_url} name={p.name} size={120} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 56, lineHeight: 1.05, color: C.ink, textTransform: 'uppercase' }}>{p.name}</div>
              {p.sub && <div style={{ color: C.muted, fontSize: 26, fontWeight: 700, marginTop: 4 }}>{p.sub}</div>}
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 84, lineHeight: 1, color: C.ink }}>{p.value}</span>
              <span style={{ color: C.yellow, fontFamily: JERSEY, fontWeight: 900, fontSize: 32, marginLeft: 8 }}>{unit}</span>
            </div>
          </div>
        )
      })}
    </Shell>
  )
}

// ── 7. 이번 주 BEST (시즌하이/클러치 자리 · v1) ─
export function BestCard({ data }: { data: WeeklyMagazineData }) {
  const b = data.best
  return (
    <Shell kicker={fmtWeek(data.from, data.to)}>
      <TitleBlock title="이번 주 BEST" metric="HIGHLIGHT" />
      {!b ? (
        <div style={{ color: C.muted, fontSize: 30, marginTop: 40 }}>집계된 기록이 없습니다.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 20 }}>
          <Avatar url={b.photo_url} name={b.name} size={420} radius={24} />
          <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 96, marginTop: 28, color: C.ink }}>{b.name}</div>
          <div style={{ display: 'flex', gap: 18, marginTop: 28, flexWrap: 'wrap', justifyContent: 'center' }}>
            {[['득점', b.line.pts], ['리바운드', b.line.reb], ['어시스트', b.line.ast], ['수비', b.line.stl + b.line.blk]].map(([label, v]) => (
              <div key={label as string} style={{ background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 14, padding: '18px 30px', textAlign: 'center', minWidth: 150 }}>
                <div style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 68, color: C.yellow, lineHeight: 1 }}>{v}</div>
                <div style={{ color: C.muted, fontSize: 24, fontWeight: 700, marginTop: 6 }}>{label}</div>
              </div>
            ))}
          </div>
          <div style={{ color: C.muted, fontSize: 24, marginTop: 30 }}>풀 하이라이트는 유튜브에서 · 프로필 링크</div>
        </div>
      )}
    </Shell>
  )
}

// ── 8. 마일스톤 체이서 ─────────────────────
export function MilestoneCard({ data }: { data: WeeklyMagazineData }) {
  const ms: UpcomingEntry[] = data.milestones.slice(0, 4)
  return (
    <Shell kicker={fmtWeek(data.from, data.to)}>
      <TitleBlock title="마일스톤" metric="다음 경기 주목" />
      {ms.length === 0 ? (
        <div style={{ color: C.muted, fontSize: 30, marginTop: 40 }}>임박한 통산 기록이 없습니다.</div>
      ) : ms.map(m => (
        <div key={m.player_id} style={{ background: C.panel, border: `1px solid ${C.rule}`, borderRadius: 16, padding: '24px 30px', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontFamily: JERSEY, fontWeight: 900, fontSize: 52, color: C.ink }}>{m.name}</span>
            <span style={{ color: C.yellow, fontFamily: JERSEY, fontWeight: 900, fontSize: 40 }}>통산 {m.target}득점까지 -{m.distance}</span>
          </div>
          <div style={{ height: 18, borderRadius: 10, background: C.bg, overflow: 'hidden', border: `1px solid ${C.rule}` }}>
            <div style={{ width: `${Math.min(100, Math.max(4, m.percent))}%`, height: '100%', background: C.yellow }} />
          </div>
          <div style={{ color: C.muted, fontSize: 24, fontWeight: 700, marginTop: 10 }}>현재 {m.current}점 · {m.percent}%</div>
        </div>
      ))}
    </Shell>
  )
}
