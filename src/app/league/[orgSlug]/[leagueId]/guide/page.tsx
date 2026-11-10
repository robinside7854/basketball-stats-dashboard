import fs from 'node:fs'
import path from 'node:path'
import { isLeaguePrivateGated } from '@/lib/auth/guard'
import { MEMBER_GUIDE } from '@/lib/guide/memberGuide'

// 회원용 이용 가이드 (2026-11-10 운영진) — 본문 정본은 lib/guide/memberGuide.ts.
//   그림은 public/guide/*.png 가 있을 때만 그린다(아직 안 찍은 장은 글만).
export const metadata = { title: '온볼 — 이용 가이드' }

function hasImage(name: string): boolean {
  try { return fs.existsSync(path.join(process.cwd(), 'public', 'guide', `${name}.png`)) } catch { return false }
}

export default async function GuidePage({ params }: { params: Promise<{ orgSlug: string; leagueId: string }> }) {
  const { leagueId } = await params
  if (await isLeaguePrivateGated(leagueId)) return null

  return (
    <div className="space-y-4 lg:space-y-5 max-w-[760px]">
      <div>
        <h2 className="font-black text-[28px] lg:text-[32px] leading-none text-[color:var(--mm-ink)] tracking-tight">이용 가이드</h2>
        <p className="mt-2 text-sm" style={{ color: 'var(--mm-muted)' }}>처음 오셨다면 위에서부터 차례로 읽어 보세요.</p>
      </div>

      <nav aria-label="가이드 목차" className="flex flex-wrap gap-2">
        {MEMBER_GUIDE.map((s, i) => (
          <a key={s.id} href={`#${s.id}`} className="mm-press px-3 py-2 text-sm font-bold"
            style={{ background: 'var(--mm-panel)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-ctl)' }}>
            {i + 1}. {s.title}
          </a>
        ))}
      </nav>

      {MEMBER_GUIDE.map((s, i) => (
        <section key={s.id} id={s.id} className="scroll-mt-20 p-4 md:p-5"
          style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card, 12px)', boxShadow: 'var(--mm-shadow-sm)' }}>
          <h3 className="font-black text-xl" style={{ color: 'var(--mm-ink)' }}>
            <span className="inline-flex items-center justify-center w-7 h-7 mr-2 text-sm align-middle"
              style={{ background: 'var(--mm-yellow)', color: 'var(--mm-black)', borderRadius: '999px' }}>{i + 1}</span>
            {s.title}
          </h3>
          {s.summary && <p className="mt-1 text-sm" style={{ color: 'var(--mm-muted)' }}>{s.summary}</p>}
          <ol className="mt-4 space-y-4">
            {s.steps.map((st, j) => (
              <li key={j} className="space-y-2">
                <p className="text-[15px] leading-relaxed" style={{ color: 'var(--mm-ink)' }}>{st.text}</p>
                {st.image && hasImage(st.image) && (
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
        </section>
      ))}
    </div>
  )
}
