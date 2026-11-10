// 가이드 화면 공용 조각 — 회원 가이드(GuideContent) · 어드민 가이드(AdminGuideView)가 같은 아이콘·색·표시를 쓴다.
//   ⚠ 내용 아이콘 = 각진 네모 + 테두리(채우지 않음), 「자동·어드민·회원」 = 색 채운 동그란 알약 — 둘이 겹쳐 보이지 않게(2026-11-10 운영진).
import {
  Calendar, Check, X, Users, UserPlus, Lock, PenLine, Video, Ticket, Wallet, Landmark, Smartphone, Bell, GripVertical,
  MousePointerClick, Undo2, Crown, Shirt, AlertTriangle, CheckCircle2, KeyRound, ShieldCheck, Receipt, Copy, BatteryCharging,
  ListChecks, ArrowLeftRight, Zap, Coins, RefreshCw, Home, Settings, Link2, Search, IdCard, BarChart3, Star, PlayCircle,
  Maximize2, Clock, Gift, Lightbulb, User, Trophy, Hand,
  type LucideIcon,
} from 'lucide-react'
import type { IconKey, Who } from '@/lib/guide/memberGuide'

export const ICONS: Record<IconKey, LucideIcon> = {
  calendar: Calendar, check: Check, x: X, users: Users, userPlus: UserPlus, lock: Lock, pen: PenLine, video: Video,
  ticket: Ticket, wallet: Wallet, bank: Landmark, phone: Smartphone, bell: Bell, drag: GripVertical, tap: MousePointerClick,
  undo: Undo2, crown: Crown, shirt: Shirt, alert: AlertTriangle, ok: CheckCircle2, key: KeyRound, shield: ShieldCheck,
  receipt: Receipt, copy: Copy, battery: BatteryCharging, list: ListChecks, swap: ArrowLeftRight, zap: Zap, coins: Coins,
  refresh: RefreshCw, home: Home, gear: Settings, link: Link2, search: Search, card: IdCard, chart: BarChart3, star: Star,
  play: PlayCircle, expand: Maximize2, clock: Clock, gift: Gift, idea: Lightbulb, user: User, trophy: Trophy,
}

export const GREEN = '#059669'
export const WHO: Record<Who, { label: string; Icon: LucideIcon; fg: string; bg: string; edge: string; dot: string; dotFg: string }> = {
  auto: { label: '자동', Icon: Zap, fg: GREEN, bg: `color-mix(in srgb, ${GREEN} 9%, var(--mm-panel))`, edge: `color-mix(in srgb, ${GREEN} 45%, transparent)`, dot: GREEN, dotFg: '#fff' },
  admin: { label: '어드민', Icon: Hand, fg: 'var(--mm-ink)', bg: 'var(--mm-yellow-soft)', edge: 'var(--mm-yellow-strong)', dot: 'var(--mm-yellow)', dotFg: 'var(--mm-black)' },
  member: { label: '회원', Icon: User, fg: 'var(--mm-ink-soft)', bg: 'var(--mm-panel-alt)', edge: 'var(--mm-rule)', dot: 'var(--mm-ink-soft)', dotFg: 'var(--mm-panel)' },
}

export function WhoBadge({ who, small = false }: { who: Who; small?: boolean }) {
  const w = WHO[who]
  return (
    <span className={`inline-flex items-center gap-1 font-black whitespace-nowrap ${small ? 'text-[11px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5'}`}
      style={{ background: w.dot, color: w.dotFg, borderRadius: 999 }}>
      <w.Icon size={small ? 11 : 12} strokeWidth={3} aria-hidden />{w.label}
    </span>
  )
}

/** 내용 아이콘 — 각진 네모 + 테두리. who 가 있으면 테두리 색만 그 색 */
export function IconTile({ icon, who, size = 40 }: { icon: IconKey; who?: Who; size?: number }) {
  const I = ICONS[icon]
  const w = who ? WHO[who] : null
  return (
    <span className="shrink-0 inline-flex items-center justify-center" aria-hidden
      style={{ width: size, height: size, borderRadius: 6, background: 'var(--mm-panel)', border: `2px solid ${w ? w.edge : 'var(--mm-rule)'}`, color: who === 'auto' ? GREEN : 'var(--mm-ink)' }}>
      <I size={Math.round(size * 0.5)} strokeWidth={2.2} />
    </span>
  )
}
