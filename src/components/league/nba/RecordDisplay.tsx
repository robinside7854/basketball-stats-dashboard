// 승패 표현 공용 컴포넌트 (2026-07-19)
//   · HeadToHead: 상대전적 칩 (홈 팀 승률 카드)
// 2026-10-12: ResultChips · ScoreTable 은 쓰는 곳이 없어져 지웠다 —
//   승패는 viz.tsx 의 RecordBar, 득실은 MarginFigure 로 옮겼다.

// WIN/LOSE/DRAW 컬러 정의 — 배경/전경 쌍 (캐주얼 전환, 2026-08-06)
// 채움+흰글씨 대신 틴트 배경 + 진한 전경 텍스트로. bg/fg 모두 globals.css 의
// --mm-positive/negative/neutral-bg·fg 토큰(라이트/다크 각각 7:1+ 대비 검증됨)을 그대로 사용.
const RESULT_COLORS = {
  win:  { bg: 'var(--mm-positive-bg)', fg: 'var(--mm-positive-fg)' },
  lose: { bg: 'var(--mm-negative-bg)', fg: 'var(--mm-negative-fg)' },
  draw: { bg: 'var(--mm-neutral-bg)',  fg: 'var(--mm-neutral-fg)' },
} as const

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
