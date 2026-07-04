// 공유용 박스스코어 이미지 컴포넌트
//
// 팀 카톡방에 공유할 목적으로 UI 크롬 없이 클린한 레이아웃으로 렌더.
// html-to-image 로 PNG 변환하여 다운로드.
//
// 사용:
//   1) DailyBoxscoreModal 에서 이 컴포넌트를 hidden 위치에 렌더
//   2) toPng() 로 캡처
//   3) 다운로드 트리거
//
// 폭 고정 1080px — KakaoTalk 공유 시 모바일 화면에서 잘 보이는 크기

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
}

type TeamRecord = { id: string; name: string; color: string | null; W: number; L: number; D: number; PF: number; PA: number }

interface Props {
  dateLabel: string
  games: GameSummary[]
  dailyStats: PlayerRow[]
  teamRecords: TeamRecord[]
  leagueName: string
}

export default function ShareableBoxscore({ dateLabel, games, dailyStats, teamRecords, leagueName }: Props) {
  // 완료 경기만 노출
  const completed = games.filter(g => g.is_complete)

  // 스탯 정렬: PTS 내림차순
  const sortedStats = [...dailyStats].sort((a, b) => b.pts - a.pts)

  // 상위 리더 계산
  const topOf = (key: keyof PlayerRow): PlayerRow | undefined => {
    const list = [...dailyStats].filter(p => (p[key] as number) > 0)
      .sort((a, b) => (b[key] as number) - (a[key] as number))
    return list[0]
  }
  const topPts  = topOf('pts')
  const topReb  = topOf('reb')
  const topAst  = topOf('ast')
  const topStl  = topOf('stl')
  const topBlk  = topOf('blk')

  return (
    // 폭 1080px 고정 — 카톡 공유 대응 · 다크 배경 · 넉넉한 패딩
    <div
      style={{
        width: '1080px',
        backgroundColor: '#0a0f1c',
        color: '#ffffff',
        fontFamily: "'Fira Sans', system-ui, -apple-system, sans-serif",
        padding: '40px',
        boxSizing: 'border-box',
      }}
    >
      {/* 헤더 */}
      <div style={{ borderBottom: '2px solid #1e293b', paddingBottom: '20px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '32px', fontWeight: 900, letterSpacing: '-0.02em' }}>{dateLabel} 박스스코어</div>
          <div style={{ fontSize: '16px', color: '#94a3b8' }}>· {leagueName}</div>
        </div>
        <div style={{ marginTop: '6px', color: '#64748b', fontSize: '14px' }}>
          완료 {completed.length}경기 · 전체 스탯
        </div>
      </div>

      {/* 팀 전적 요약 (승자 순 정렬 · 트로피) */}
      {teamRecords.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px' }}>
            일일 전적
          </div>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {[...teamRecords].sort((a, b) => (b.W - b.L) - (a.W - a.L) || (b.PF - b.PA) - (a.PF - a.PA)).map((r, idx) => (
              <div key={r.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: '10px',
                padding: '12px 18px', borderRadius: '14px',
                backgroundColor: idx === 0 ? '#1e293b' : '#0f172a',
                border: idx === 0 ? `2px solid ${r.color ?? '#64748b'}` : '1px solid #1e293b',
              }}>
                {idx === 0 && <Trophy size={18} style={{ color: '#fbbf24', fill: '#fbbf24' }} />}
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: r.color ?? '#64748b' }} />
                <div style={{ fontSize: '17px', fontWeight: 900 }}>{r.name}</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#10b981' }}>{r.W}승</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#ef4444' }}>{r.L}패</div>
                {r.D > 0 && <div style={{ fontSize: '13px', color: '#94a3b8' }}>{r.D}무</div>}
                <div style={{ fontSize: '13px', color: '#64748b' }}>({r.PF}-{r.PA})</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 경기 결과 그리드 */}
      {completed.length > 0 && (
        <div style={{ marginBottom: '28px' }}>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px' }}>
            경기 결과
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
            {completed.map(g => {
              const homeWin = g.home_score > g.away_score
              const awayWin = g.away_score > g.home_score
              return (
                <div key={g.id} style={{
                  padding: '14px 16px', borderRadius: '12px',
                  backgroundColor: '#0f172a', border: '1px solid #1e293b',
                }}>
                  <div style={{ color: '#475569', fontSize: '11px', fontWeight: 700, marginBottom: '6px' }}>#{g.slot_num}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: g.home_team?.color ?? '#64748b' }} />
                      {homeWin && <Trophy size={12} style={{ color: '#fbbf24', fill: '#fbbf24', flexShrink: 0 }} />}
                      <div style={{
                        fontSize: '14px',
                        fontWeight: homeWin ? 900 : 500,
                        color: homeWin ? '#ffffff' : '#64748b',
                        textDecoration: awayWin ? 'line-through' : 'none',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{g.home_team?.name ?? '?'}</div>
                    </div>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: homeWin ? '#ffffff' : '#475569', fontVariantNumeric: 'tabular-nums' }}>{g.home_score}</div>
                    <div style={{ color: '#334155', fontSize: '11px' }}>:</div>
                    <div style={{ fontSize: '20px', fontWeight: 900, color: awayWin ? '#ffffff' : '#475569', fontVariantNumeric: 'tabular-nums' }}>{g.away_score}</div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: awayWin ? 900 : 500,
                        color: awayWin ? '#ffffff' : '#64748b',
                        textDecoration: homeWin ? 'line-through' : 'none',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        textAlign: 'right',
                      }}>{g.away_team?.name ?? '?'}</div>
                      {awayWin && <Trophy size={12} style={{ color: '#fbbf24', fill: '#fbbf24', flexShrink: 0 }} />}
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: g.away_team?.color ?? '#64748b' }} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 당일 리더 */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px' }}>
          당일 리더
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
          {[
            { label: '득점',    p: topPts, val: topPts?.pts, unit: '점' },
            { label: '리바',    p: topReb, val: topReb?.reb, unit: '개' },
            { label: '어시',    p: topAst, val: topAst?.ast, unit: '개' },
            { label: '스틸',    p: topStl, val: topStl?.stl, unit: '개' },
            { label: '블락',    p: topBlk, val: topBlk?.blk, unit: '개' },
          ].map(({ label, p, val, unit }) => (
            <div key={label} style={{
              padding: '14px', borderRadius: '12px',
              backgroundColor: '#0f172a', border: '1px solid #1e293b',
            }}>
              <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700, marginBottom: '4px' }}>{label}</div>
              {p ? (
                <>
                  <div style={{ fontSize: '20px', fontWeight: 900, color: '#ffffff', marginBottom: '2px' }}>{p.name}</div>
                  <div style={{ fontSize: '18px', fontWeight: 900, color: p.team_color ?? '#94a3b8' }}>{val}{unit}</div>
                </>
              ) : (
                <div style={{ fontSize: '14px', color: '#475569' }}>—</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 전체 선수 스탯 테이블 */}
      {sortedStats.length > 0 && (
        <div>
          <div style={{ color: '#64748b', fontSize: '13px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '10px' }}>
            전체 선수 스탯 ({sortedStats.length}명 · PTS 내림차순)
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #1e293b' }}>
                <th style={{ padding: '10px 8px', textAlign: 'left', color: '#94a3b8', fontWeight: 700 }}>선수</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>G</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>PTS</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>REB</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>AST</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>STL</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>BLK</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>TOV</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>FG</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>3P</th>
                <th style={{ padding: '10px 8px', textAlign: 'center', color: '#94a3b8', fontWeight: 700 }}>FT</th>
              </tr>
            </thead>
            <tbody>
              {sortedStats.map((p, i) => (
                <tr key={p.player_id} style={{ borderBottom: '1px solid #172137', backgroundColor: i % 2 === 0 ? 'transparent' : '#0d1424' }}>
                  <td style={{ padding: '9px 8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: p.team_color ?? '#64748b' }} />
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>{p.name}</div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>{p.team_name ?? ''}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '9px 8px', textAlign: 'center', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{p.gp ?? '—'}</td>
                  <td style={{ padding: '9px 8px', textAlign: 'center', color: '#fbbf24', fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{p.pts}</td>
                  <td style={{ padding: '9px 8px', textAlign: 'center', color: '#ffffff', fontVariantNumeric: 'tabular-nums' }}>{p.reb}</td>
                  <td style={{ padding: '9px 8px', textAlign: 'center', color: '#ffffff', fontVariantNumeric: 'tabular-nums' }}>{p.ast}</td>
                  <td style={{ padding: '9px 8px', textAlign: 'center', color: '#ffffff', fontVariantNumeric: 'tabular-nums' }}>{p.stl}</td>
                  <td style={{ padding: '9px 8px', textAlign: 'center', color: '#ffffff', fontVariantNumeric: 'tabular-nums' }}>{p.blk}</td>
                  <td style={{ padding: '9px 8px', textAlign: 'center', color: '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{p.tov}</td>
                  <td style={{ padding: '9px 8px', textAlign: 'center', color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>
                    {p.fgm}/{p.fga}
                    {p.fga > 0 && <span style={{ color: '#64748b', fontSize: '11px', marginLeft: '3px' }}>({Math.round(p.fgm / p.fga * 100)}%)</span>}
                  </td>
                  <td style={{ padding: '9px 8px', textAlign: 'center', color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>
                    {p.fg3m}/{p.fg3a}
                    {p.fg3a > 0 && <span style={{ color: '#64748b', fontSize: '11px', marginLeft: '3px' }}>({Math.round(p.fg3m / p.fg3a * 100)}%)</span>}
                  </td>
                  <td style={{ padding: '9px 8px', textAlign: 'center', color: '#cbd5e1', fontVariantNumeric: 'tabular-nums' }}>{p.ftm}/{p.fta}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 푸터 */}
      <div style={{ marginTop: '28px', paddingTop: '16px', borderTop: '1px solid #1e293b', textAlign: 'center' }}>
        <div style={{ fontSize: '12px', color: '#475569', letterSpacing: '0.08em' }}>
          basketball-stats-dashboard
        </div>
      </div>
    </div>
  )
}
