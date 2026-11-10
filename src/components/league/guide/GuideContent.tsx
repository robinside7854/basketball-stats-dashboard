import { MEMBER_GUIDE } from '@/lib/guide/memberGuide'

// 회원 이용 가이드 본문 — `/guide` 페이지가 그린다(그림 유무는 페이지가 파일을 보고 넘긴다).
//   ⚠ 줄바꿈: 한국어 문장이 어절 가운데서 꺾이지 않게 전체에 `break-keep`(word-break: keep-all).
//   문구를 바꾸면 360·390·768·1280 폭에서 어절 가운데 꺾임이 없는지 다시 잰다.
const card = { background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card, 12px)', boxShadow: 'var(--mm-shadow-sm)' } as const

export default function GuideContent({ images }: { images: string[] }) {
  const has = new Set(images)
  return (
    <div className="space-y-4 lg:space-y-5 max-w-[760px] break-keep">
      <div>
        <h2 className="font-black text-[28px] lg:text-[32px] leading-none text-[color:var(--mm-ink)] tracking-tight">이용 가이드</h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--mm-muted)' }}>처음 오셨다면 위에서부터 차례로 읽어 보세요.</p>
      </div>

      <nav aria-label="가이드 목차" className="flex flex-wrap gap-2">
        {MEMBER_GUIDE.map((s, i) => (
          <a key={s.id} href={`#${s.id}`} className="mm-press px-3 py-2 text-sm font-bold whitespace-nowrap"
            style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}>
            {i + 1}. {s.title}
          </a>
        ))}
      </nav>

      {MEMBER_GUIDE.map((s, i) => (
        <section key={s.id} id={s.id} className="scroll-mt-20 p-4 md:p-5" style={card}>
          <h3 className="flex items-center gap-2 font-black text-xl" style={{ color: 'var(--mm-ink)' }}>
            <span className="shrink-0 inline-flex items-center justify-center w-7 h-7 text-sm"
              style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '999px' }}>{i + 1}</span>
            <span>{s.title}</span>
          </h3>
          {s.summary && <p className="mt-1 text-sm" style={{ color: 'var(--mm-muted)' }}>{s.summary}</p>}

          {s.steps.length > 0 && (
            <ol className="mt-4 space-y-4">
              {s.steps.map((st, j) => (
                <li key={j} className="space-y-2">
                  <p className="text-[15px] leading-relaxed" style={{ color: 'var(--mm-ink)' }}>{st.text}</p>
                  {st.image && has.has(st.image) && (
                    <figure className="mx-auto max-w-[390px]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`/guide/${st.image}.png`} alt={st.caption ?? ''} loading="lazy"
                        className="w-full h-auto" style={{ border: '1px solid var(--mm-rule)', borderRadius: '12px' }} />
                      {st.caption && <figcaption className="mt-1 text-center text-xs" style={{ color: 'var(--mm-muted)' }}>{st.caption}</figcaption>}
                    </figure>
                  )}
                </li>
              ))}
            </ol>
          )}

          {/* 자주 묻는 질문 — 질문마다 칸을 나누고, Q(위) · A(아래, 옅은 바탕)로 갈라 보인다 */}
          {s.faqs && (
            <ol className="mt-4 space-y-3">
              {s.faqs.map((f, j) => (
                <li key={j} className="p-3 md:p-4" style={{ border: '1px solid var(--mm-rule)', borderRadius: '10px' }}>
                  <p className="flex gap-2 font-bold text-[15px] leading-relaxed" style={{ color: 'var(--mm-ink)' }}>
                    <span className="shrink-0 font-black" style={{ color: 'var(--mm-yellow-strong, #b8860b)' }}>Q{j + 1}.</span>
                    <span>{f.q}</span>
                  </p>
                  <p className="mt-2 flex gap-2 p-3 text-[15px] leading-relaxed" style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', borderRadius: '8px' }}>
                    <span className="shrink-0 font-black" style={{ color: 'var(--mm-muted)' }}>A.</span>
                    <span>{f.a}</span>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      ))}
    </div>
  )
}
