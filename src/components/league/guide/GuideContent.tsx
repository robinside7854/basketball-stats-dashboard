import { MEMBER_GUIDE } from '@/lib/guide/memberGuide'

// 회원 이용 가이드 본문 — `/guide` 페이지가 그린다(그림 유무는 페이지가 파일을 보고 넘긴다).
//   ⚠ 문장 하나 = 한 줄(마침표에서 줄을 나눈다, 2026-11-10 운영진) · 줄 사이 여백은 작게.
//   ⚠ PC: 그림 묶음마다 「문장 왼쪽 · 그림 오른쪽」 — 문장이 다른 그림 사이에 끼지 않게 묶음 단위로 그린다.
//   ⚠ 줄바꿈: 전체에 `break-keep`. 문구를 바꾸면 360~1440 폭에서 어절 가운데 꺾임 0 을 다시 잰다.
const card = { background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card, 12px)', boxShadow: 'var(--mm-shadow-sm)' } as const
const lineCls = 'text-[15px] lg:text-[18px] leading-[1.6]'

function Lines({ lines }: { lines: string[] }) {
  return (
    <ul className="space-y-1 lg:space-y-1.5">
      {lines.map((l, k) => (
        <li key={k} className={`flex gap-2 ${lineCls}`} style={{ color: 'var(--mm-ink)' }}>
          <span aria-hidden className="shrink-0" style={{ color: 'var(--mm-muted)' }}>·</span>
          <span>{l}</span>
        </li>
      ))}
    </ul>
  )
}

export default function GuideContent({ images }: { images: string[] }) {
  const has = new Set(images)
  return (
    <div className="mx-auto w-full max-w-[1080px] space-y-4 lg:space-y-6 break-keep">
      <div>
        <h2 className="font-black text-[28px] lg:text-[32px] leading-none text-[color:var(--mm-ink)] tracking-tight">이용 가이드</h2>
        <p className="mt-2 text-sm lg:text-base" style={{ color: 'var(--mm-muted)' }}>처음 오셨다면 위에서부터 차례로 읽어 보세요.</p>
      </div>

      <nav aria-label="가이드 목차" className="flex flex-wrap gap-2">
        {MEMBER_GUIDE.map((s, i) => (
          <a key={s.id} href={`#${s.id}`} className="mm-press px-3 py-2 lg:px-4 lg:py-2.5 text-sm lg:text-base font-bold whitespace-nowrap"
            style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}>
            {i + 1}. {s.title}
          </a>
        ))}
      </nav>

      {MEMBER_GUIDE.map((s, i) => (
        <section key={s.id} id={s.id} className="scroll-mt-20 p-4 md:p-5 lg:p-8" style={card}>
          <h3 className="flex items-center gap-2 lg:gap-3 font-black text-xl lg:text-[26px]" style={{ color: 'var(--mm-ink)' }}>
            <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 lg:w-9 lg:h-9 text-sm lg:text-base"
              style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '999px' }}>{i + 1}</span>
            <span>{s.title}</span>
          </h3>
          {s.summary && <p className="mt-1 lg:mt-2 text-sm lg:text-base" style={{ color: 'var(--mm-muted)' }}>{s.summary}</p>}

          {s.groups.length > 0 && (
            <div className="mt-4 lg:mt-6 space-y-6 lg:space-y-8">
              {s.groups.map((g, j) => {
                const img = g.image && has.has(g.image) ? g.image : null
                return (
                  <div key={j} className={img ? 'space-y-3 lg:space-y-0 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10 lg:items-start' : ''}>
                    <Lines lines={g.lines} />
                    {img && (
                      <figure className="mx-auto w-full max-w-[390px] lg:max-w-none">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/guide/${img}.png`} alt={g.caption ?? ''} loading="lazy"
                          className="w-full h-auto" style={{ border: '1px solid var(--mm-rule)', borderRadius: '12px' }} />
                        {g.caption && <figcaption className="mt-1 text-center text-xs" style={{ color: 'var(--mm-muted)' }}>{g.caption}</figcaption>}
                      </figure>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* 자주 묻는 질문 — 질문마다 칸 · Q(위) / A(아래, 옅은 바탕) */}
          {s.faqs && (
            <ol className="mt-4 lg:mt-6 space-y-3">
              {s.faqs.map((f, j) => (
                <li key={j} className="p-3 md:p-4" style={{ border: '1px solid var(--mm-rule)', borderRadius: '10px' }}>
                  <p className={`flex gap-2 font-bold ${lineCls}`} style={{ color: 'var(--mm-ink)' }}>
                    <span className="shrink-0 font-black" style={{ color: 'var(--mm-yellow-strong, #b8860b)' }}>Q{j + 1}.</span>
                    <span>{f.q}</span>
                  </p>
                  <div className="mt-2 flex gap-2 p-3" style={{ background: 'var(--mm-panel-alt)', borderRadius: '8px' }}>
                    <span className={`shrink-0 font-black ${lineCls}`} style={{ color: 'var(--mm-muted)' }}>A.</span>
                    <div className="space-y-0.5">
                      {f.a.map((l, k) => <p key={k} className={lineCls} style={{ color: 'var(--mm-ink)' }}>{l}</p>)}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  )
}
