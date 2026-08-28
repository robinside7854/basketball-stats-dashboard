// 공유용 박스스코어 이미지 컴포넌트
//
// 팀 카톡방에 공유할 목적으로 UI 크롬(탭·필터·스크롤·인터랙션) 없이 클린한 레이아웃으로 렌더.
// html-to-image 로 PNG 변환하여 다운로드.
//
// 콘텐츠는 DailyBoxscoreModal 의 "전체 스탯" 탭 + 상단 스코어보드와 1:1 매칭:
//   - 헤더 (날짜 · 리그 · 진행/완료 요약)
//   - 스코어보드 (완료 + 진행중 + 예정 카드 · 팀 record chips)
//   - 당일 스탯 리더 7개 (득점 · 리바 · 어시 · 블락 · 스틸 · FG% · 3P%)
//   - 전체 선수 스탯 테이블 (14 컬럼: G, PTS, REB, OR, DR, AST, STL, BLK, TOV, FG, FG%, 3P, 3P%, FT)
//
// 폭 고정 1080px — KakaoTalk 공유 시 모바일 화면에서 잘 보이는 크기
// 톤: mm-brand 다크 팔레트 (docs/mm-brand-style.md 참조)

import { Trophy } from 'lucide-react'

type PlayerRow = {
  player_id: string; name: string; number: number | null
  team_id: string | null; team_name: string | null; team_color: string | null
  gp?: number  // daily stat 에만 있음
  pts: number; reb: number; oreb: number; dreb: number
  ast: number; stl: number; blk: number; tov: number
  fgm: number; fga: number; fg3m: number; fg3a: number; ftm: number; fta: number
  fg_pct?: number | null; fg3_pct?: number | null
}

type GameSummary = {
  id: string; slot_num: number
  home_team: { id: string; name: string; color: string } | null
  away_team: { id: string; name: string; color: string } | null
  home_score: number; away_score: number
  is_complete: boolean
  is_started?: boolean
}

type TeamRecord = { id: string; name: string; color: string | null; W: number; L: number; D: number; PF: number; PA: number }

interface Props {
  dateLabel: string
  games: GameSummary[]
  dailyStats: PlayerRow[]
  teamRecords: TeamRecord[]
  leagueName: string
}

// mm-brand 다크 팔레트 (globals.css `.dark` 값 하드코딩 — inline style 은 CSS 변수 접근 불가)
const C = {
  ground:      '#0A0A0A',
  panel:       '#171717',
  panelAlt:    '#0F0F0F',
  ink:         '#FAFAFA',
  inkSoft:     '#D4D4D4',
  muted:       '#A1A1AA',
  rule:        '#262626',
  yellow:      '#FDE047',
  yellowStrong:'#FACC15',
  yellowSoft:  'rgba(253,224,71,0.10)',
  black:       '#000000',
  live:        '#EF4444',
  emerald:     '#059669',
  red:         '#DC2626',
  orAccent:    '#EA580C',  // OR (오펜시브 리바)
  drAccent:    '#3B82F6',  // DR (디펜시브 리바)
}

const FONT_BODY   = "'Pretendard Variable', Pretendard, system-ui, -apple-system, sans-serif"
const FONT_JERSEY = "'Barlow Condensed', 'Bebas Neue', system-ui, -apple-system, sans-serif"

export default function ShareableBoxscore({ dateLabel, games, dailyStats, teamRecords, leagueName }: Props) {
  const completed = games.filter(g => g.is_complete)
  const ongoing   = games.filter(g => g.is_started && !g.is_complete)
  const upcoming  = games.filter(g => !g.is_started && !g.is_complete)
  const recordedCount = completed.length + ongoing.length
  const allDoneBadge  = recordedCount > 0 && recordedCount === completed.length

  // PTS 내림차순 정렬 (모달 기본 정렬과 동일)
  const sortedStats = [...dailyStats].sort((a, b) => b.pts - a.pts)

  // 당일 스탯 리더 — 모달과 동일한 7개 항목, 동일 임계값
  const MIN_FGA = 3, MIN_FG3A = 2
  const byPts   = [...dailyStats].sort((a, b) => b.pts - a.pts)[0]
  const byReb   = [...dailyStats].sort((a, b) => b.reb - a.reb)[0]
  const byAst   = [...dailyStats].sort((a, b) => b.ast - a.ast)[0]
  const byBlk   = [...dailyStats].sort((a, b) => b.blk - a.blk)[0]
  const byStl   = [...dailyStats].sort((a, b) => b.stl - a.stl)[0]
  const byFgPct = [...dailyStats].filter(p => p.fga >= MIN_FGA).sort((a, b) => (b.fg_pct ?? 0) - (a.fg_pct ?? 0))[0]
  const byFg3   = [...dailyStats].filter(p => p.fg3a >= MIN_FG3A).sort((a, b) => b.fg3m - a.fg3m)[0]

  const leaders: {
    label: string; player?: PlayerRow; value: string | null; sub: string
  }[] = [
    { label: '득점',     player: byPts,   value: byPts   ? `${byPts.pts}점`    : null, sub: `${byPts?.gp ?? 0}경기` },
    { label: '리바운드', player: byReb,   value: byReb   ? `${byReb.reb}개`    : null, sub: `OR ${byReb?.oreb ?? 0} / DR ${byReb?.dreb ?? 0}` },
    { label: '어시스트', player: byAst,   value: byAst   ? `${byAst.ast}개`    : null, sub: `${byAst?.gp ?? 0}경기` },
    { label: '블락',     player: byBlk,   value: byBlk   ? `${byBlk.blk}개`    : null, sub: `${byBlk?.gp ?? 0}경기` },
    { label: '스틸',     player: byStl,   value: byStl   ? `${byStl.stl}개`    : null, sub: `${byStl?.gp ?? 0}경기` },
    { label: '야투율',   player: byFgPct, value: byFgPct?.fg_pct != null ? `${byFgPct.fg_pct}%` : null, sub: byFgPct ? `${byFgPct.fgm}/${byFgPct.fga}` : '' },
    { label: '3점슛',    player: byFg3,   value: byFg3   ? `${byFg3.fg3m}개`   : null, sub: byFg3 && byFg3.fg3a > 0 ? `${byFg3.fg3_pct}%` : '' },
  ]

  // 승자 순 정렬된 팀 record chips
  const sortedRecords = [...teamRecords].sort(
    (a, b) => (b.W - b.L) - (a.W - a.L) || (b.PF - b.PA) - (a.PF - a.PA)
  )

  return (
    // 폭 1080px 고정 — 카톡 공유 대응 · mm-brand 다크 · 넉넉한 패딩
    <div
      style={{
        width: '1080px',
        backgroundColor: C.ground,
        color: C.ink,
        fontFamily: FONT_BODY,
        padding: '40px',
        boxSizing: 'border-box',
      }}
    >
      {/* Header — 실제 모달과 동일한 정보 밀도 */}
      <div style={{ borderBottom: `1px solid ${C.rule}`, paddingBottom: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{
            fontFamily: FONT_JERSEY,
            fontSize: '38px', fontWeight: 900,
            textTransform: 'uppercase', letterSpacing: '-0.005em',
            color: C.ink,
          }}>
            {dateLabel} 박스스코어
          </div>
          {allDoneBadge && (
            <span style={{
              backgroundColor: C.yellow, color: C.black,
              padding: '4px 10px', fontSize: '11px', fontWeight: 900,
              textTransform: 'uppercase', letterSpacing: '0.18em',
            }}>완료</span>
          )}
        </div>
        <div style={{ marginTop: '6px', color: C.inkSoft, fontSize: '14px' }}>
          <span style={{ color: C.muted }}>· {leagueName}</span>
          <span style={{ margin: '0 8px', color: C.rule }}>|</span>
          진행 {recordedCount}경기
          <span style={{ color: C.yellowStrong, fontWeight: 700 }}> · {completed.length}완료</span>
          {ongoing.length > 0 && <span style={{ color: C.muted }}> · {ongoing.length}진행중</span>}
          {upcoming.length > 0 && <span style={{ color: C.muted }}> · {upcoming.length}예정</span>}
        </div>
      </div>

      {/* 스코어보드 카드 그리드 — 완료 + 진행중 + 예정 모두 표시 (모달 DailyScoreboard 와 동일) */}
      {games.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{
            color: C.muted, fontSize: '12px', fontWeight: 900,
            letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '10px',
          }}>
            경기별 스코어
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {[...completed, ...ongoing, ...upcoming].map(g => {
              const homeWin = g.is_complete && g.home_score > g.away_score
              const awayWin = g.is_complete && g.away_score > g.home_score
              const draw    = g.is_complete && g.home_score === g.away_score
              const bgColor = g.is_complete ? C.panel : (g.is_started ? C.yellowSoft : C.panelAlt)
              return (
                <div key={g.id} style={{
                  padding: '12px 14px',
                  backgroundColor: bgColor,
                  border: `1px solid ${C.rule}`,
                  position: 'relative', overflow: 'hidden',
                }}>
                  {/* 상단 라벨 라인 */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ color: C.muted, fontSize: '11px', fontFamily: FONT_BODY, fontWeight: 700 }}>#{g.slot_num}</div>
                    {g.is_complete && (
                      <span style={{
                        backgroundColor: C.yellow, color: C.black,
                        padding: '2px 6px', fontSize: '10px', fontWeight: 900,
                        textTransform: 'uppercase', letterSpacing: '0.18em',
                      }}>완료</span>
                    )}
                    {!g.is_complete && g.is_started && (
                      <span style={{
                        backgroundColor: C.live, color: '#fff',
                        padding: '2px 6px', fontSize: '10px', fontWeight: 900,
                        textTransform: 'uppercase', letterSpacing: '0.18em',
                      }}>진행 중</span>
                    )}
                    {!g.is_started && !g.is_complete && (
                      <span style={{
                        color: C.muted, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase',
                      }}>예정</span>
                    )}
                  </div>
                  {/* 스코어 라인 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: g.home_team?.color ?? C.muted }} />
                      {homeWin && <Trophy size={14} style={{ color: C.yellowStrong, fill: C.yellowStrong, flexShrink: 0 }} />}
                      <div style={{
                        fontFamily: FONT_JERSEY, fontSize: '15px',
                        fontWeight: homeWin ? 900 : 700,
                        color: homeWin ? C.ink : (g.is_complete ? (draw ? C.inkSoft : C.muted) : C.inkSoft),
                        textDecoration: (g.is_complete && !homeWin && !draw) ? 'line-through' : 'none',
                        textTransform: 'uppercase',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{g.home_team?.name ?? '미정'}</div>
                    </div>
                    <div style={{
                      fontFamily: FONT_JERSEY, fontSize: '22px', fontWeight: 900,
                      color: homeWin ? C.ink : (g.is_complete ? (draw ? C.inkSoft : C.muted) : C.inkSoft),
                      fontVariantNumeric: 'tabular-nums',
                    }}>{g.home_score}</div>
                    <div style={{ color: C.muted, fontSize: '11px', fontWeight: 700 }}>:</div>
                    <div style={{
                      fontFamily: FONT_JERSEY, fontSize: '22px', fontWeight: 900,
                      color: awayWin ? C.ink : (g.is_complete ? (draw ? C.inkSoft : C.muted) : C.inkSoft),
                      fontVariantNumeric: 'tabular-nums',
                    }}>{g.away_score}</div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                      <div style={{
                        fontFamily: FONT_JERSEY, fontSize: '15px',
                        fontWeight: awayWin ? 900 : 700,
                        color: awayWin ? C.ink : (g.is_complete ? (draw ? C.inkSoft : C.muted) : C.inkSoft),
                        textDecoration: (g.is_complete && !awayWin && !draw) ? 'line-through' : 'none',
                        textTransform: 'uppercase',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        textAlign: 'right',
                      }}>{g.away_team?.name ?? '미정'}</div>
                      {awayWin && <Trophy size={14} style={{ color: C.yellowStrong, fill: C.yellowStrong, flexShrink: 0 }} />}
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: g.away_team?.color ?? C.muted }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 팀별 일일 전적 (완료 경기 기반) */}
      {sortedRecords.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <div style={{
            color: C.muted, fontSize: '12px', fontWeight: 900,
            letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '10px',
          }}>
            일일 전적
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {sortedRecords.map((r, idx) => (
              <div key={r.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '8px 12px',
                backgroundColor: idx === 0 ? C.yellowSoft : C.panel,
                border: idx === 0 ? `1px solid ${C.yellow}` : `1px solid ${C.rule}`,
              }}>
                {idx === 0 && <Trophy size={14} style={{ color: C.yellowStrong, fill: C.yellowStrong }} />}
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: r.color ?? C.muted }} />
                <div style={{ fontFamily: FONT_JERSEY, fontSize: '15px', fontWeight: 900, color: C.ink, textTransform: 'uppercase' }}>{r.name}</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: C.emerald, fontVariantNumeric: 'tabular-nums' }}>{r.W}승</div>
                {r.D > 0 && <div style={{ fontSize: '12px', color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{r.D}무</div>}
                <div style={{ fontSize: '13px', fontWeight: 700, color: C.red, fontVariantNumeric: 'tabular-nums' }}>{r.L}패</div>
                <div style={{ fontSize: '12px', color: C.muted, fontVariantNumeric: 'tabular-nums' }}>({r.PF}-{r.PA})</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 당일 스탯 리더 — 7개 카드 (모달과 완전 동일) */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{
          color: C.yellowStrong, fontSize: '12px', fontWeight: 900,
          letterSpacing: '0.20em', textTransform: 'uppercase', marginBottom: '10px',
        }}>
          당일 스탯 리더
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '8px' }}>
          {leaders.map(({ label, player, value, sub }) => (
            <div key={label} style={{
              padding: '12px',
              backgroundColor: C.panelAlt, border: `1px solid ${C.rule}`,
              display: 'flex', flexDirection: 'column', gap: '2px',
            }}>
              <div style={{
                color: C.muted, fontSize: '11px', fontWeight: 900,
                letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '4px',
              }}>{label}</div>
              {player ? (
                <>
                  <div style={{
                    fontFamily: FONT_JERSEY, fontSize: '18px', fontWeight: 900,
                    color: C.ink, letterSpacing: '-0.005em', textTransform: 'uppercase',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    lineHeight: 1.1,
                  }}>{player.name}</div>
                  <div style={{
                    fontFamily: FONT_JERSEY, fontSize: '16px', fontWeight: 900,
                    color: C.yellowStrong, fontVariantNumeric: 'tabular-nums',
                  }}>{value ?? ''}</div>
                  {sub && <div style={{ fontSize: '11px', color: C.muted }}>{sub}</div>}
                </>
              ) : (
                <div style={{ fontSize: '13px', color: C.muted }}>—</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 전체 선수 스탯 테이블 — 14 컬럼 (모달의 StatTable 과 동일) */}
      {sortedStats.length > 0 && (
        <div>
          <div style={{
            color: C.muted, fontSize: '12px', fontWeight: 900,
            letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: '10px',
          }}>
            전체 선수 스탯 ({sortedStats.length}명 · PTS 내림차순)
          </div>
          <table style={{
            width: '100%', borderCollapse: 'collapse', fontSize: '13px',
            backgroundColor: C.panel, border: `1px solid ${C.rule}`,
          }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${C.rule}`, backgroundColor: C.panelAlt }}>
                {[
                  { label: '선수 / 팀', align: 'left' as const, minWidth: '160px' },
                  { label: 'G' },   { label: 'PTS' }, { label: 'REB' },
                  { label: 'OR' },  { label: 'DR' },  { label: 'AST' },
                  { label: 'STL' }, { label: 'BLK' }, { label: 'TOV' },
                  { label: 'FG' },  { label: 'FG%' },
                  { label: '3P' },  { label: '3P%' },
                  { label: 'FT' },
                ].map((h, i) => (
                  <th key={h.label} style={{
                    padding: '10px 8px',
                    textAlign: h.align ?? 'center',
                    color: C.muted,
                    fontFamily: FONT_JERSEY, fontSize: '11px', fontWeight: 900,
                    letterSpacing: '0.18em', textTransform: 'uppercase',
                    minWidth: h.minWidth,
                    borderLeft: i === 0 ? 'none' : `1px solid ${C.rule}`,
                  }}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedStats.map((p, i) => {
                const rowBg = i % 2 === 0 ? C.panel : C.panelAlt
                const fgPct  = p.fga  > 0 ? (p.fg_pct  ?? Math.round((p.fgm  / p.fga)  * 1000) / 10) : null
                const fg3Pct = p.fg3a > 0 ? (p.fg3_pct ?? Math.round((p.fg3m / p.fg3a) * 1000) / 10) : null
                return (
                  <tr key={p.player_id} style={{ borderBottom: `1px solid ${C.rule}`, backgroundColor: rowBg }}>
                    <td style={{ padding: '9px 8px', textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: p.team_color ?? C.muted, flexShrink: 0 }} />
                        <div>
                          <div style={{
                            fontFamily: FONT_JERSEY, fontSize: '14px', fontWeight: 900,
                            color: C.ink, textTransform: 'uppercase', letterSpacing: '-0.005em',
                          }}>{p.name}</div>
                          {p.team_name && (
                            <div style={{ fontSize: '11px', color: C.muted, lineHeight: 1, marginTop: '2px' }}>{p.team_name}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: C.inkSoft, fontFamily: FONT_JERSEY, fontVariantNumeric: 'tabular-nums' }}>{p.gp ?? '—'}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: C.ink,     fontFamily: FONT_JERSEY, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{p.pts}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: C.inkSoft, fontFamily: FONT_JERSEY, fontVariantNumeric: 'tabular-nums' }}>{p.reb}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: C.orAccent, fontFamily: FONT_JERSEY, fontVariantNumeric: 'tabular-nums' }}>{p.oreb}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: C.drAccent, fontFamily: FONT_JERSEY, fontVariantNumeric: 'tabular-nums' }}>{p.dreb}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: C.inkSoft, fontFamily: FONT_JERSEY, fontVariantNumeric: 'tabular-nums' }}>{p.ast}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: C.inkSoft, fontFamily: FONT_JERSEY, fontVariantNumeric: 'tabular-nums' }}>{p.stl}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: C.inkSoft, fontFamily: FONT_JERSEY, fontVariantNumeric: 'tabular-nums' }}>{p.blk}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: C.muted,   fontFamily: FONT_JERSEY, fontVariantNumeric: 'tabular-nums' }}>{p.tov}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: C.inkSoft, fontFamily: FONT_JERSEY, fontVariantNumeric: 'tabular-nums' }}>{p.fgm}/{p.fga}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: C.inkSoft, fontFamily: FONT_JERSEY, fontVariantNumeric: 'tabular-nums' }}>{fgPct != null ? `${fgPct}%` : '—'}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: C.inkSoft, fontFamily: FONT_JERSEY, fontVariantNumeric: 'tabular-nums' }}>{p.fg3m}/{p.fg3a}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: C.inkSoft, fontFamily: FONT_JERSEY, fontVariantNumeric: 'tabular-nums' }}>{fg3Pct != null ? `${fg3Pct}%` : '—'}</td>
                    <td style={{ padding: '9px 8px', textAlign: 'center', color: C.inkSoft, fontFamily: FONT_JERSEY, fontVariantNumeric: 'tabular-nums' }}>{p.ftm}/{p.fta}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 푸터 */}
      <div style={{ marginTop: '28px', paddingTop: '14px', borderTop: `1px solid ${C.rule}`, textAlign: 'center' }}>
        <div style={{
          fontFamily: FONT_JERSEY, fontSize: '12px', color: C.muted,
          letterSpacing: '0.20em', textTransform: 'uppercase',
        }}>
          basketball-stats-dashboard
        </div>
      </div>
    </div>
  )
}
