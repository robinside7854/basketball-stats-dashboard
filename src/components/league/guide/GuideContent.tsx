'use client'
import { useClub } from '@/contexts/ClubContext'
import { sectionVisible, faqVisible } from '@/lib/guide/featureFilter'
import { MEMBER_GUIDE, lineText, type GuideSection, type GuideGroup, type GuideLine } from '@/lib/guide/memberGuide'
import ShareLeagueButton from '@/components/league/ShareLeagueButton'
import GuideFaqTabs from './GuideFaqTabs'
import { Zap } from 'lucide-react'
import { ICONS, GREEN, IconTile } from './guideKit'

// 회원 이용 가이드 — `/guide` 페이지(와 잠금 화면)가 그린다. 2026-11-10 운영진 「글로 쭉 쓰면 읽기 싫다 · 도식화 · 그림 배치 잘」:
//   그림 묶음마다 「아이콘 단계 줄 + 폰 화면 그림」 한 덩어리. PC 는 좌우 번갈아(지그재그), 폰은 단계 → 그림 순.
//   문장마다 아이콘 타일(각진 네모) · 저절로 되는 일은 초록 타일 + 모서리 ⚡ + 초록 글자 · 팁(tip)은 아래 노란 상자에 모은다.
//   ⚠ 문장 하나 = 한 줄 · 전체 `break-keep`. 문구를 바꾸면 360~1440 폭에서 어절 가운데 꺾임 0 을 다시 잰다.
const CARD = { background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card, 12px)', boxShadow: 'var(--mm-shadow-sm)' } as const
const lineCls = 'text-[14px] sm:text-[15px] lg:text-[17px] leading-[1.5]'

type Obj = { t: string; icon?: keyof typeof ICONS; auto?: boolean; tip?: boolean }
const asObj = (l: GuideLine): Obj => (typeof l === 'string' ? { t: l } : l)

function Steps({ lines }: { lines: GuideLine[] }) {
  const all = lines.map(asObj)
  const steps = all.filter(l => !l.tip)
  const tips = all.filter(l => l.tip)
  return (
    <div className="space-y-3">
      <ol className="space-y-2.5">
        {steps.map((l, k) => (
          <li key={k} className="relative flex items-start gap-2 sm:gap-3">
            {/* 단계 사이 잇는 세로선 — 아이콘 타일 가운데를 지나간다 */}
            {k < steps.length - 1 && (
              <span aria-hidden className="absolute left-[13px] sm:left-[15px] top-7 sm:top-8 -bottom-2.5 w-0.5" style={{ background: 'var(--mm-rule)' }} />
            )}
            {/* 저절로 되는 일 = 초록 타일 + 모서리 ⚡ — 글 옆에 「자동」 알약을 붙이면 폰에서 문장이 두 줄로 넘어갔다 */}
            <span className="relative shrink-0">
              {l.icon ? <span className="sm:hidden"><IconTile icon={l.icon} who={l.auto ? 'auto' : undefined} size={28} /></span> : null}
              {l.icon ? <span className="hidden sm:inline"><IconTile icon={l.icon} who={l.auto ? 'auto' : undefined} size={32} /></span> : null}
              {!l.icon && <span aria-hidden className="w-7 h-7 sm:w-8 sm:h-8 inline-flex items-center justify-center text-sm font-black" style={{ border: '2px solid var(--mm-rule)', borderRadius: 6, color: 'var(--mm-ink-soft)' }}>{k + 1}</span>}
              {l.auto && (
                <span aria-label="자동" className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center w-4 h-4" style={{ background: GREEN, color: '#fff', borderRadius: 999 }}>
                  <Zap size={10} strokeWidth={3} aria-hidden />
                </span>
              )}
            </span>
            <p className={`pt-0.5 sm:pt-1 ${lineCls}`} style={{ color: l.auto ? GREEN : 'var(--mm-ink)', fontWeight: l.auto ? 700 : undefined }}>{l.t}</p>
          </li>
        ))}
      </ol>
      {tips.length > 0 && (
        <ul className="space-y-1.5 p-3" style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow-strong)', borderRadius: 8 }}>
          {tips.map((l, k) => {
            const I = ICONS[l.icon ?? 'idea']
            return (
              <li key={k} className={`flex items-start gap-2 ${lineCls}`} style={{ color: 'var(--mm-ink)' }}>
                <I size={18} aria-hidden className="shrink-0 mt-[3px]" style={{ color: 'var(--mm-ink-soft)' }} />
                <span>{l.t}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// 그림 가로·세로(px) — 불러오기 전에도 틀 크기를 잡는다(지연 로딩 때 틀이 0 폭으로 접혔다). 그림을 바꾸면 같이 고친다.
const IMG_SIZE: Record<string, [number, number]> = { 'boxscore': [780, 2200], 'guest-sheet': [780, 1600], 'highlights': [780, 1696], 'last-day': [780, 424], 'leaderboard': [780, 2300], 'me': [780, 1240], 'player-card': [780, 1800], 'rsvp-board': [780, 1998], 'rsvp-card': [780, 730], 'signup': [780, 1020], 'teams': [780, 1800], 'wallet-charge': [780, 970], 'wallet-ticket': [780, 1000], 'wallet': [780, 864] }

/** 폰 화면 그림 — 둥근 테두리 액자 + 설명 한 줄. 세로로 긴 그림은 높이(폰 600 · PC 520)에 맞춰 폭을 줄인다 */
function Shot({ image, caption }: { image: string; caption?: string }) {
  const [w, h] = IMG_SIZE[image] ?? [3, 4]
  return (
    <figure className="mx-auto w-full max-w-[300px] lg:max-w-[280px]">
      <div className="mx-auto p-1.5 w-[min(100%,calc(600px*var(--r)+12px))] lg:w-[min(100%,calc(520px*var(--r)+12px))]"
        style={{ background: 'var(--mm-ink)', borderRadius: 22, ['--r' as string]: String(w / h) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/guide/${image}.png`} alt={caption ?? ''} loading="lazy" width={w} height={h} className="block w-full h-auto" style={{ borderRadius: 16, aspectRatio: `${w} / ${h}` }} />
      </div>
      {caption && <figcaption className="mt-2 text-center text-xs lg:text-sm" style={{ color: 'var(--mm-muted)' }}>{caption}</figcaption>}
    </figure>
  )
}

function Group({ g, flip, has }: { g: GuideGroup; flip: boolean; has: Set<string> }) {
  const img = g.image && has.has(g.image) ? g.image : null
  const body = (
    <div className="min-w-0">
      {g.title && <h4 className="mb-3 font-black text-base lg:text-lg" style={{ color: 'var(--mm-ink)' }}>{g.title}</h4>}
      <Steps lines={g.lines} />
    </div>
  )
  if (!img) return body
  // PC: 그림 묶음마다 좌우를 번갈아 놓는다(지그재그) — 글과 그림이 한 줄에 짝지어 읽힌다
  return (
    <div className={`grid gap-5 lg:gap-10 lg:items-center ${flip ? 'lg:grid-cols-[280px_minmax(0,1fr)]' : 'lg:grid-cols-[minmax(0,1fr)_280px]'}`}>
      {flip ? <><div className="order-2 lg:order-1"><Shot image={img} caption={g.caption} /></div><div className="order-1 lg:order-2">{body}</div></>
        : <>{body}<Shot image={img} caption={g.caption} /></>}
    </div>
  )
}

// images 를 안 넘기면 본문에 적힌 그림 전부(잠금 화면처럼 파일 목록을 못 읽는 곳)
const ALL_IMAGES = MEMBER_GUIDE.flatMap(s => s.groups.map(g => g.image).filter((x): x is string => !!x))

export default function GuideContent({ images = ALL_IMAGES, top, sections = MEMBER_GUIDE, title = '이용 가이드', subtitle = '위에서부터 차례로 읽어 보세요.', share = true }: {
  images?: string[]; top?: React.ReactNode
  sections?: GuideSection[]; title?: string; subtitle?: string; share?: boolean
}) {
  const has = new Set(images)
  // 켜진 기능의 장·질문만(2026-11-10 플랫폼화 3단계)
  const feats = useClub().features
  sections = sections.filter(sec => sectionVisible(sec.id, feats))
    .map(sec => sec.faqs ? { ...sec, faqs: sec.faqs.filter(q => faqVisible(q.cat, feats)) } : sec)
  let n = 0
  return (
    <div className="mx-auto w-full max-w-[1080px] space-y-4 lg:space-y-5 break-keep">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-black text-[28px] lg:text-[32px] leading-none text-[color:var(--mm-ink)] tracking-tight">{title}</h2>
          <p className="mt-2 text-sm lg:text-base" style={{ color: 'var(--mm-muted)' }}>{subtitle}</p>
        </div>
        {/* 팀원에게 이 가이드 링크 보내기(2026-11-10 운영진) — 폰은 공유 창, 안 되면 링크 복사 */}
        {share && <ShareLeagueButton leagueName={title} label="가이드 공유" />}
      </div>
      {top}

      {/* 보는 법 + 목차 */}
      <div className="p-3 lg:p-4 space-y-3" style={CARD}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>
          <span className="text-xs font-black" style={{ color: 'var(--mm-muted)' }}>보는 법</span>
          <span className="inline-flex items-center gap-2">
            <span className="relative inline-flex"><IconTile icon="zap" who="auto" size={24} />
              <span aria-hidden className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center w-4 h-4" style={{ background: GREEN, color: '#fff', borderRadius: 999 }}><Zap size={10} strokeWidth={3} /></span>
            </span>
            <span><span style={{ color: GREEN }}>초록</span>은 저절로 돼요</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center w-6 h-6" style={{ background: 'var(--mm-yellow-soft)', border: '1px solid var(--mm-yellow-strong)', borderRadius: 6 }}>
              {(() => { const I = ICONS.idea; return <I size={14} aria-hidden /> })()}
            </span>알아 두면 좋아요
          </span>
        </div>
        <nav aria-label="가이드 목차" className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {sections.map((s, i) => {
            const I = ICONS[s.icon ?? 'list']
            return (
              <a key={s.id} href={`#${s.id}`} className="mm-press flex items-center gap-2 min-h-11 px-2.5 py-2 text-sm lg:text-base font-bold"
                style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', borderRadius: 8 }}>
                <I size={16} aria-hidden className="shrink-0" style={{ color: 'var(--mm-ink-soft)' }} />
                <span><span className="tabular-nums" style={{ color: 'var(--mm-muted)' }}>{i + 1}.</span> {s.title}</span>
              </a>
            )
          })}
        </nav>
      </div>

      {sections.map((s, i) => {
        const I = ICONS[s.icon ?? 'list']
        return (
          <section key={s.id} id={s.id} className="scroll-mt-20 p-3.5 md:p-5 lg:p-7" style={CARD}>
            <header className="flex items-start gap-3">
              <span className="shrink-0 inline-flex items-center justify-center w-11 h-11 lg:w-12 lg:h-12" aria-hidden
                style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)', borderRadius: 8 }}>
                <I size={22} strokeWidth={2.4} />
              </span>
              <div className="min-w-0">
                <h3 className="font-black text-xl lg:text-2xl leading-tight" style={{ color: 'var(--mm-ink)' }}>
                  <span className="tabular-nums mr-1.5" style={{ color: 'var(--mm-muted)' }}>{String(i + 1).padStart(2, '0')}</span>{s.title}
                </h3>
                {s.summary && <p className="mt-0.5 text-sm lg:text-base" style={{ color: 'var(--mm-ink-soft)' }}>{s.summary}</p>}
              </div>
            </header>

            {s.groups.length > 0 && (
              <div className="mt-5 lg:mt-6 space-y-6 lg:space-y-8">
                {s.groups.map((g, j) => {
                  const flip = g.image && has.has(g.image) ? (n++ % 2 === 1) : false
                  return (
                    <div key={j} className={j > 0 ? 'pt-6 lg:pt-8' : ''} style={j > 0 ? { borderTop: '1px dashed var(--mm-rule)' } : undefined}>
                      <Group g={g} flip={flip} has={has} />
                    </div>
                  )
                })}
              </div>
            )}

            {/* 자주 묻는 질문 — 카테고리별(GuideFaqTabs) */}
            {s.faqs && <GuideFaqTabs faqs={s.faqs} />}
          </section>
        )
      })}
    </div>
  )
}

export { lineText }
