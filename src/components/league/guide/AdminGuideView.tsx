'use client'
import { useClub } from '@/contexts/ClubContext'
import { sectionVisible } from '@/lib/guide/featureFilter'
// 어드민 가이드 — 매뉴얼처럼 도식화(2026-11-10 운영진 「글로 쭉 쓰면 읽기 싫다 · 도형·아이콘 적극」).
//   본문 정본 lib/guide/adminGuide.ts — 흐름도(flow) · 갈래 흐름(lanes) · 카드(cards) · 상태표(status) · 자주 묻는 질문(faq).
//   색 = 누가 하나: 자동(초록 번개) · 어드민(노랑 손) · 회원(회색 사람). 맨 위 범례와 같은 색을 모든 칸이 쓴다.
//   ⚠ 가로 스크롤 금지 — 흐름도는 폰에서 세로(↓), PC(lg↑)에서 가로(→). 글은 어절 단위로만 꺾는다(break-keep).
import type { CSSProperties } from 'react'
import { ArrowDown, ArrowRight, ChevronRight, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { ADMIN_GUIDE, type AdminSection, type FlowStep, type GuideBlock, type IconKey } from '@/lib/guide/adminGuide'
import { ICONS, GREEN, WHO, WhoBadge, IconTile as IconDot } from './guideKit'
import GuideFaqTabs from './GuideFaqTabs'

const CARD: CSSProperties = { background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', borderRadius: 'var(--mm-radius-card, 12px)', boxShadow: 'var(--mm-shadow-sm)' }

function Path({ path }: { path: string[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-xs font-bold">
      {path.map((p, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <ChevronRight size={12} aria-hidden style={{ color: 'var(--mm-muted)' }} />}
          <span className="px-2 py-0.5" style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', border: '1px solid var(--mm-rule)', borderRadius: 6 }}>{p}</span>
        </span>
      ))}
    </span>
  )
}

function BlockTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="mb-2 text-sm lg:text-base font-black" style={{ color: 'var(--mm-ink-soft)' }}>{children}</h4>
}

/** 흐름도 — 폰 세로(↓) · PC 가로(→) */
function Flow({ steps }: { steps: FlowStep[] }) {
  return (
    <ol className="flex flex-col lg:flex-row lg:items-stretch gap-1.5 lg:gap-1">
      {steps.map((s, i) => {
        const w = WHO[s.who]
        return (
          <li key={i} className="contents">
            {i > 0 && (
              <span aria-hidden className="flex justify-center lg:items-center lg:px-0.5" style={{ color: 'var(--mm-muted)' }}>
                <ArrowDown size={18} className="lg:hidden" /><ArrowRight size={18} className="hidden lg:block" />
              </span>
            )}
            <div className="lg:flex-1 min-w-0 flex lg:flex-col items-center lg:items-start gap-3 lg:gap-2 p-3"
              style={{ background: w.bg, border: `1.5px solid ${w.edge}`, borderRadius: 8 }}>
              <IconDot icon={s.icon} who={s.who} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {s.when && <span className="text-xs font-black tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>{s.when}</span>}
                  <WhoBadge who={s.who} small />
                </div>
                <div className="mt-0.5 font-black text-[15px] lg:text-base" style={{ color: 'var(--mm-ink)' }}>{s.title}</div>
                {s.desc && <div className="text-xs lg:text-sm" style={{ color: 'var(--mm-ink-soft)' }}>{s.desc}</div>}
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/** 갈래 흐름 — 줄마다 「누가」 이름표 + 작은 알약들을 → 로 잇는다(폰에서도 줄바꿈만) */
function Lanes({ lanes }: { lanes: { label: string; icon: IconKey; steps: FlowStep[] }[] }) {
  return (
    <div className="space-y-2">
      {lanes.map(l => (
        <div key={l.label} className="grid gap-2 lg:grid-cols-[120px_minmax(0,1fr)] lg:items-center p-3"
          style={{ border: '1px solid var(--mm-rule)', borderRadius: 12 }}>
          <div className="flex items-center gap-2">
            <IconDot icon={l.icon} size={32} />
            <span className="font-black text-base" style={{ color: 'var(--mm-ink)' }}>{l.label}</span>
          </div>
          <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
            {l.steps.map((s, i) => {
              const w = WHO[s.who]
              const I = ICONS[s.icon]
              return (
                <li key={i} className="inline-flex items-center gap-1.5">
                  {i > 0 && <ArrowRight size={16} aria-hidden style={{ color: 'var(--mm-muted)' }} />}
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5" style={{ background: w.bg, border: `1.5px solid ${w.edge}`, borderRadius: 6 }}>
                    <I size={15} strokeWidth={2.4} aria-hidden style={{ color: s.who === 'auto' ? GREEN : 'var(--mm-ink)' }} />
                    <span className="text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>{s.title}</span>
                    {s.desc && <span className="text-xs" style={{ color: 'var(--mm-ink-soft)' }}>· {s.desc}</span>}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      ))}
    </div>
  )
}

function Cards({ items }: { items: Extract<GuideBlock, { kind: 'cards' }>['items'] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(c => (
        <li key={c.title} className="flex gap-3 p-3" style={{ border: '1px solid var(--mm-rule)', borderRadius: 8, background: 'var(--mm-panel)' }}>
          <IconDot icon={c.icon} who={c.who} size={36} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-black text-[15px]" style={{ color: 'var(--mm-ink)' }}>{c.title}</span>
              {c.who && <WhoBadge who={c.who} small />}
            </div>
            <p className="mt-0.5 text-sm leading-snug" style={{ color: 'var(--mm-ink-soft)' }}>{c.desc}</p>
            {c.path && <div className="mt-1.5"><Path path={c.path} /></div>}
          </div>
        </li>
      ))}
    </ul>
  )
}

const TONE = {
  ok: { Icon: CheckCircle2, color: GREEN },
  warn: { Icon: AlertTriangle, color: 'var(--mm-yellow-strong)' },
  bad: { Icon: XCircle, color: 'var(--mm-live-bg)' },
} as const

// 상태표 — 「제목 / 설명 → 할 일」을 한 덩어리로 왼쪽에 붙인다(2026-11-10 운영진 — PC 에서 할 일이 오른쪽 끝으로 벌어져 읽기 어려웠다).
function Status({ items }: { items: Extract<GuideBlock, { kind: 'status' }>['items'] }) {
  return (
    <ul className="grid gap-1.5 lg:grid-cols-2">
      {items.map(r => {
        const t = TONE[r.tone]
        return (
          <li key={r.title} className="flex gap-2.5 p-3"
            style={{ border: '1px solid var(--mm-rule)', borderLeft: `4px solid ${t.color}`, borderRadius: 6 }}>
            <t.Icon size={20} aria-hidden className="shrink-0 mt-0.5" style={{ color: t.color }} />
            <div className="min-w-0">
              <div className="font-black text-[15px]" style={{ color: 'var(--mm-ink)' }}>{r.title}</div>
              <div className="text-sm" style={{ color: 'var(--mm-ink-soft)' }}>{r.desc}</div>
              <div className="mt-1 inline-flex items-start gap-1 text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>
                <ArrowRight size={15} aria-hidden className="shrink-0 mt-[3px]" style={{ color: t.color }} />
                <span>{r.action}</span>
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function Block({ b }: { b: GuideBlock }) {
  if (b.kind === 'faq') return <div className="-mt-2"><GuideFaqTabs faqs={b.faqs} /></div>
  return (
    <div>
      {b.title && <BlockTitle>{b.title}</BlockTitle>}
      {b.kind === 'flow' && <Flow steps={b.steps} />}
      {b.kind === 'lanes' && <Lanes lanes={b.lanes} />}
      {b.kind === 'cards' && <Cards items={b.items} />}
      {b.kind === 'status' && <Status items={b.items} />}
    </div>
  )
}

function Section({ s, n }: { s: AdminSection; n: number }) {
  const I = ICONS[s.icon]
  return (
    <section id={s.id} className="scroll-mt-20 p-4 md:p-5 lg:p-7" style={CARD}>
      <header className="flex items-start gap-3">
        <span className="shrink-0 inline-flex items-center justify-center w-11 h-11 lg:w-12 lg:h-12" aria-hidden
          style={{ background: 'var(--mm-ink)', color: 'var(--mm-panel)', borderRadius: 8 }}>
          <I size={22} strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-black text-xl lg:text-2xl leading-tight" style={{ color: 'var(--mm-ink)' }}>
            <span className="tabular-nums mr-1.5" style={{ color: 'var(--mm-muted)' }}>{String(n).padStart(2, '0')}</span>{s.title}
          </h3>
          <p className="mt-0.5 text-sm lg:text-base" style={{ color: 'var(--mm-ink-soft)' }}>{s.summary}</p>
          {s.where && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-black" style={{ color: 'var(--mm-muted)' }}>어디서</span>
              <Path path={s.where} />
            </div>
          )}
        </div>
      </header>
      <div className="mt-4 lg:mt-5 space-y-5">
        {s.blocks.map((b, i) => <Block key={i} b={b} />)}
      </div>
    </section>
  )
}

export default function AdminGuideView() {
  // 켜진 기능의 장·질문만(2026-11-10 플랫폼화 3단계)
  const feats = useClub().features
  const sections = ADMIN_GUIDE.filter(sec => sectionVisible(sec.id, feats))
  return (
    <div className="mx-auto w-full max-w-[1080px] space-y-4 lg:space-y-5 break-keep">
      <div>
        <h2 className="font-black text-[28px] lg:text-[32px] leading-none tracking-tight" style={{ color: 'var(--mm-ink)' }}>어드민 가이드</h2>
        <p className="mt-2 text-sm lg:text-base" style={{ color: 'var(--mm-muted)' }}>노란 칸만 어드민이 해요. 초록 칸은 저절로 돼요.</p>
      </div>

      {/* 범례 + 목차 */}
      <div className="p-3 lg:p-4 space-y-3" style={CARD}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-black mr-1" style={{ color: 'var(--mm-muted)' }}>색 읽는 법</span>
          {(['auto', 'admin', 'member'] as const).map(w => (
            <span key={w} className="inline-flex items-center gap-1.5 text-sm font-bold" style={{ color: 'var(--mm-ink)' }}>
              <WhoBadge who={w} />{w === 'auto' ? '저절로' : w === 'admin' ? '어드민이 할 일' : '회원이 하는 일'}
            </span>
          ))}
        </div>
        <nav aria-label="가이드 목차" className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
          {sections.map((s, i) => {
            const I = ICONS[s.icon]
            return (
              <a key={s.id} href={`#${s.id}`} className="mm-press flex items-center gap-2 min-h-11 px-2.5 py-2 text-sm font-bold"
                style={{ background: 'var(--mm-panel-alt)', color: 'var(--mm-ink)', borderRadius: 10 }}>
                <I size={16} aria-hidden className="shrink-0" style={{ color: 'var(--mm-ink-soft)' }} />
                <span><span className="tabular-nums" style={{ color: 'var(--mm-muted)' }}>{i + 1}.</span> {s.title}</span>
              </a>
            )
          })}
        </nav>
      </div>

      {sections.map((s, i) => <Section key={s.id} s={s} n={i + 1} />)}
    </div>
  )
}
