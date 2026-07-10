// NBA.com 오마주 — Player of the Week (에디토리얼 히어로)
// 좌측: 카피 (eyebrow / 헤드라인 / dek / athlete card)
// 우측: 이 주 PPG 큰 숫자 (Bebas 100px+ tabular)
// 서버 컴포넌트 — 계산은 홈 페이지에서 넘겨받음.

export type NbaHeroData = {
  name: string
  number: number | null
  pts: number      // 이 주 누적 득점
  gp: number       // 이 주 경기 수
  ppg: number      // 이 주 평균
  teamName?: string | null
  teamColor?: string | null
} | null

type Props = {
  data: NbaHeroData
  rangeLabel: string  // 예: "지난 7일" 또는 "3/29 ~ 4/4"
}

function initials(name: string): string {
  // 한글: 첫 2자 (예: "구범준" → "구범"). 로마자: 첫 2자.
  return name.slice(0, 2)
}

export default function NbaHero({ data, rangeLabel }: Props) {
  if (!data) return null
  const accent = data.teamColor ?? undefined
  return (
    <article className="grid md:grid-cols-[1.4fr_1fr] border border-gray-800 bg-gray-950">
      {/* 좌: 에디토리얼 카피 */}
      <div className="p-6 md:p-8">
        <p className="text-[11px] font-black text-amber-400 tracking-[0.22em] uppercase mb-2">
          Player of the Week
        </p>
        <h1 className="font-display text-[clamp(36px,6vw,64px)] leading-[0.92] uppercase tracking-tight text-white mb-3" style={{ textWrap: 'balance' }}>
          {data.name}의 <span className="text-amber-400">골든 위크</span>
        </h1>
        <p className="text-sm text-gray-400 max-w-md mb-6 leading-relaxed">
          지난 {data.gp}경기 평균 {data.ppg}점 · 시즌 임팩트 상승.
        </p>
        <div className="flex items-center gap-3.5 pt-4 border-t border-gray-800">
          <div
            className="shrink-0 w-14 h-14 rounded-full bg-gray-800 border-2 flex items-center justify-center font-display text-xl text-white"
            style={accent ? { borderColor: accent } : { borderColor: '#f59e0b' }}
          >
            {initials(data.name)}
          </div>
          <div className="min-w-0">
            <div className="font-display text-[22px] uppercase tracking-wide text-white truncate">
              {data.name}
              {data.number != null && (
                <span className="text-gray-500 text-[15px] font-sans ml-1.5">#{data.number}</span>
              )}
            </div>
            <div className="text-[11px] tracking-[0.14em] uppercase text-gray-500 font-bold mt-0.5">
              {data.teamName ?? '리그'} · {rangeLabel}
            </div>
          </div>
        </div>
      </div>

      {/* 우: 스탯 패널 */}
      <aside className="p-6 md:p-8 bg-gray-900 border-t md:border-t-0 md:border-l border-gray-800">
        <div className="text-[11px] font-black text-gray-500 tracking-[0.22em] uppercase">Weekly Avg</div>
        <div className="font-display leading-[0.85] tabular-nums tracking-tight text-white mt-1.5"
             style={{ fontSize: 'clamp(72px, 12vw, 108px)' }}>
          {data.ppg.toFixed(1)}
          <span className="text-[22px] text-gray-500 tracking-[0.16em] ml-1.5 align-baseline">PPG</span>
        </div>
        <div className="grid grid-cols-3 gap-2.5 mt-4 pt-4 border-t border-gray-800">
          <div className="text-[11px] tracking-widest uppercase text-gray-500 font-bold">
            PTS
            <strong className="block font-display text-[22px] text-white mt-0.5 tabular-nums font-normal">
              {data.pts}
            </strong>
          </div>
          <div className="text-[11px] tracking-widest uppercase text-gray-500 font-bold">
            GP
            <strong className="block font-display text-[22px] text-white mt-0.5 tabular-nums font-normal">
              {data.gp}
            </strong>
          </div>
          <div className="text-[11px] tracking-widest uppercase text-gray-500 font-bold">
            PPG
            <strong className="block font-display text-[22px] text-white mt-0.5 tabular-nums font-normal">
              {data.ppg.toFixed(1)}
            </strong>
          </div>
        </div>
      </aside>
    </article>
  )
}
