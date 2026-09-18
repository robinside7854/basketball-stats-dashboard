// 승패 표현 공용 컴포넌트 (2026-07-19)
//   · ResultChips: WIN / LOSE / DRAW 컬러 라벨 (녹/적/회)
//   · ScoreTable:  득점 / 실점 / 마진 3열 미니 테이블
// 홈 팀 승률 + 라운드 요약 카드에서 공통 사용.

// WIN/LOSE/DRAW 컬러 정의 — 배경/전경 쌍 (캐주얼 전환, 2026-08-06)
// 채움+흰글씨 대신 틴트 배경 + 진한 전경 텍스트로. bg/fg 모두 globals.css 의
// --mm-positive/negative/neutral-bg·fg 토큰(라이트/다크 각각 7:1+ 대비 검증됨)을 그대로 사용.
const RESULT_COLORS = {
  win:  { bg: 'var(--mm-positive-bg)', fg: 'var(--mm-positive-fg)' },
  lose: { bg: 'var(--mm-negative-bg)', fg: 'var(--mm-negative-fg)' },
  draw: { bg: 'var(--mm-neutral-bg)',  fg: 'var(--mm-neutral-fg)' },
} as const

// 1위 행 배경(--mm-yellow-soft)은 라이트=크림 / 다크=반투명노랑(거의 흑)으로 테마마다 뒤집힌다.
// 일반 행과 동일한 테마 토큰을 사용해 양 테마 모두 대비 확보. 1위 강조는 상위 컴포넌트의
// 배경 틴트 + 좌측 노랑 바 + 큰 글자가 담당한다.
const RESULT_COLORS_TOP = RESULT_COLORS

type ChipVariant = 'win' | 'lose' | 'draw'

interface ResultChipProps {
  label: 'WIN' | 'LOSE' | 'DRAW'
  count: number
  variant: ChipVariant
  isTop?: boolean
  compact?: boolean  // 라운드 카드용 조금 작게
}

export function ResultChip({ label, count, variant, isTop = false, compact = false }: ResultChipProps) {
  const c = isTop ? RESULT_COLORS_TOP[variant] : RESULT_COLORS[variant]
  // compact 는 이제 패딩만 줄인다 — 글자 크기는 양쪽 다 바닥값(13.6px) 위에 둔다.
  // 예전엔 10/11px 라벨 + 12/13px 숫자였고, 홈 화면 12px 미만 27건의 큰 몫이었다.
  const pad = compact ? '2px 6px' : '3px 8px'
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap"
      style={{
        background: c.bg,
        color: c.fg,
        padding: pad,
        borderRadius: 'var(--mm-radius-chip)',
        lineHeight: 1.15,
      }}
    >
      {/* 라벨은 보조(500) · 숫자가 주인공(700). 자간 벌림은 뺐다 — 영문 3~4글자에선
          읽기를 돕지 않고 좁은 칩만 넓힌다. */}
      <span className="text-xs font-medium">{label}</span>
      <span className="text-sm font-black t-num">{count}</span>
    </span>
  )
}

interface ResultChipsProps {
  wins: number
  losses: number
  draws: number
  isTop?: boolean
  compact?: boolean
}

export function ResultChips({ wins, losses, draws, isTop = false, compact = false }: ResultChipsProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <ResultChip label="WIN" count={wins} variant="win" isTop={isTop} compact={compact} />
      <ResultChip label="LOSE" count={losses} variant="lose" isTop={isTop} compact={compact} />
      {draws > 0 && <ResultChip label="DRAW" count={draws} variant="draw" isTop={isTop} compact={compact} />}
    </div>
  )
}

// ── 상대전적 (2026-08-10) ────────────────────────────────────────────
// "우리가 저 팀한테 몇 승 몇 패인가" — 전체 승률만으로는 안 보이는 정보다.
// 승률 58%인 팀이 특정 상대에게만 계속 지고 있을 수 있고, 동호회에서 제일 많이
// 오가는 이야기가 그것이다.
//
// 표현 원칙:
//   · 상대 '이름'이 주인공이다. WIN/LOSE 라벨을 반복하면 위의 전체 전적 칩과 뒤섞여
//     무엇이 전체이고 무엇이 상대별인지 구분이 안 된다. 여기서는 이름 + 숫자만 쓴다.
//   · 무승부는 있을 때만 붙인다(3-1 vs 3-1-2). 없는 0을 늘 보여주면 눈이 피로하다.
//   · 색은 우세/열세/호각 세 가지로만. 상대 팀 컬러를 쓰면 흰색·연한 팀 컬러가
//     라이트 모드에서 사라진다(accentOrInk 를 또 태우느니 의미색이 낫다).
interface HeadToHeadProps {
  records: Array<{ key: string; name: string; wins: number; losses: number; draws: number }>
}

export function HeadToHead({ records }: HeadToHeadProps) {
  if (records.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* 한글 라벨이라 uppercase·자간 벌림은 효과 없이 가독성만 깎는다 → t-label */}
      <span className="t-label shrink-0">상대전적</span>
      {records.map(r => {
        // 우세/열세 판정은 승패만 본다 — 무승부는 어느 쪽으로도 기울지 않는다.
        const c = r.wins > r.losses ? RESULT_COLORS.win
          : r.wins < r.losses ? RESULT_COLORS.lose
          : RESULT_COLORS.draw
        const score = r.draws > 0 ? `${r.wins}-${r.losses}-${r.draws}` : `${r.wins}-${r.losses}`
        return (
          <span
            key={r.key}
            className="inline-flex items-center gap-1 whitespace-nowrap max-w-full"
            style={{
              background: c.bg,
              color: c.fg,
              padding: '2px 7px',
              borderRadius: 'var(--mm-radius-chip)',
              lineHeight: 1.15,
            }}
            aria-label={`${r.name} 상대 ${r.wins}승 ${r.losses}패${r.draws > 0 ? ` ${r.draws}무` : ''}`}
          >
            {/* 상한을 9ch → 7.5rem 로. ch 는 영문 '0' 폭 기준이라 한글은 9ch 에 4~5자만
                들어갔고, 팀명이 거의 항상 잘렸다(CLAUDE.md 의 ch 단위 함정). */}
            <span className="truncate text-xs font-medium max-w-[7.5rem]">
              {r.name}
            </span>
            <span className="text-sm font-black t-num">
              {score}
            </span>
          </span>
        )
      })}
    </div>
  )
}

interface ScoreTableProps {
  ptsFor: number
  ptsAgainst: number
  isTop?: boolean
  compact?: boolean
}

export function ScoreTable({ ptsFor, ptsAgainst, isTop = false, compact = false }: ScoreTableProps) {
  const diff = ptsFor - ptsAgainst
  // 텍스트는 항상 테마 토큰 사용 (1위 행 배경이 다크모드에서 어두워져도 대비 유지 · 2026-07-26 수정).
  const diffColor = diff > 0 ? 'var(--mm-positive)' : diff < 0 ? 'var(--mm-negative)' : 'var(--mm-muted)'
  const valueColor = 'var(--mm-ink)'
  // 1위 강조는 테마 인식 토큰으로만 (프레임을 살짝 진하게) — 하드코딩 rgba(0,0,0) 제거
  const tableBorder = isTop ? 'var(--mm-ink-soft)' : 'var(--mm-rule)'
  const cells: Array<{ label: string; value: string; color: string }> = [
    { label: '득점', value: String(ptsFor), color: valueColor },
    { label: '실점', value: String(ptsAgainst), color: valueColor },
    { label: '마진', value: diff > 0 ? `+${diff}` : String(diff), color: diffColor },
  ]
  // 라벨 9/10px 은 홈 화면에서 가장 작은 글자였다(순위 카드마다 3칸 × 9행).
  // compact 는 패딩만 줄이고, 라벨은 바닥값 t-label, 값만 한 단계 차이를 둔다.
  const cellPad = compact ? '3px 5px' : '4px 6px'
  return (
    <div
      className="grid grid-cols-3 overflow-hidden"
      style={{
        border: `1px solid ${tableBorder}`,
        borderRadius: '4px',
      }}
      role="table"
      aria-label={`득점 ${ptsFor} · 실점 ${ptsAgainst} · 마진 ${diff > 0 ? '+' : ''}${diff}`}
    >
      {cells.map((cell, i) => (
        <div
          key={cell.label}
          className="text-center"
          style={{
            padding: cellPad,
            borderRight: i < cells.length - 1 ? `1px solid var(--mm-rule)` : undefined,
          }}
          role="cell"
        >
          <div className="t-label">{cell.label}</div>
          <div
            className={`t-num font-black ${compact ? 'text-sm' : 'text-base'}`}
            style={{ color: cell.color, lineHeight: 1.1, marginTop: '2px' }}
          >
            {cell.value}
          </div>
        </div>
      ))}
    </div>
  )
}
