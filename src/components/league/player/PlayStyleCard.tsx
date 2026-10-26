'use client'
// 선수 카드 「플레이스타일」 탭의 머리(한눈에 태그)와 수비·리바운드 영역 (2026-10-26).
//   계산은 전부 lib/stats/playStyle.ts — 여기서는 보여 주기만 한다. 막대는 쓰지 않는다(2026-10-25 운영진).
import { Shield, Hand, ArrowBigUp, ArrowBigDown } from 'lucide-react'
import InfoTip from '@/components/league/ui/InfoTip'
import type { PlayStyle, StyleTag } from '@/lib/stats/playStyle'

const SIDE_LABEL: Record<StyleTag['side'], string> = { offense: '공격', defense: '수비', rebound: '리바운드' }

const top = (pct: number) => `상위 ${Math.max(1, 100 - pct)}%`

export function PlayStyleTags({ style }: { style: PlayStyle }) {
  if (style.tags.length === 0) return null
  return (
    <div>
      <p className="font-jersey text-xs font-bold mb-2" style={{ color: 'var(--mm-yellow-strong)' }}>한눈에 보는 플레이스타일</p>
      <ul className="flex flex-wrap gap-1.5" aria-label="플레이스타일 요약">
        {style.tags.map(t => (
          <li key={t.key} className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-sm font-black"
            style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)' }}>
            <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>{SIDE_LABEL[t.side]}</span>
            {t.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

// 2026-10-26 운영진: 설명 글 대신 아이콘·그림으로 — 순위는 5칸 점, 막은 위치는 미니 코트, 리바운드는 고리 그래프.
function Box({ title, headline, children }: { title: string; headline: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2.5" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}>
      <p className="text-xs font-black" style={{ color: 'var(--mm-muted)' }}>{title}</p>
      <p className="font-bold mt-0.5 break-keep" style={{ color: 'var(--mm-ink)', fontSize: '18px', letterSpacing: '-0.005em' }}>{headline}</p>
      <div className="mt-2.5">{children}</div>
    </div>
  )
}

/** 백분위 → 5칸 점(상위 20% 마다 한 칸) */
function TierDots({ pct, label }: { pct: number; label: string }) {
  const filled = pct >= 80 ? 5 : pct >= 60 ? 4 : pct >= 40 ? 3 : pct >= 20 ? 2 : 1
  return (
    <span className="inline-flex gap-1" role="img" aria-label={`${label} ${top(pct)}`} title={top(pct)}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className="block w-2 h-2 rounded-full"
          style={i < filled ? { background: 'var(--mm-yellow-strong)' } : { border: '1.5px solid var(--mm-rule)' }} />
      ))}
    </span>
  )
}

/** 아이콘 + 하루 평균 + 순위 점 한 칸 */
function StatTile({ icon, label, value, pct }: { icon: React.ReactNode; label: string; value: number; pct: number }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span aria-hidden className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)' }}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>{label}</p>
        <p className="font-jersey font-black tabular-nums leading-none" style={{ color: 'var(--mm-ink)', fontSize: '20px' }}>{value}</p>
        <div className="mt-1"><TierDots pct={pct} label={label} /></div>
      </div>
    </div>
  )
}

/** 막아낸 슛 위치 — 반코트 그림에 골밑·미드·3점 칸을 막은 개수만큼 진하게 */
function BlockCourt({ zones, unknown }: { zones: Record<'rim' | 'mid' | 'three', number>; unknown: number }) {
  const max = Math.max(1, zones.rim, zones.mid, zones.three)
  const fill = (n: number) => `color-mix(in srgb, var(--mm-yellow-strong) ${n === 0 ? 0 : 18 + Math.round((n / max) * 72)}%, transparent)`
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 160 112" className="w-40 shrink-0" role="img"
        aria-label={`막아낸 슛 위치 — 골밑 ${zones.rim}개, 미드 ${zones.mid}개, 3점 ${zones.three}개`}>
        {/* 3점 바깥 */}
        <rect x="1" y="1" width="158" height="110" fill={fill(zones.three)} stroke="var(--mm-rule)" />
        {/* 3점 라인 안 = 미드 */}
        <path d="M14 1 V40 A66 66 0 0 0 146 40 V1 Z" fill={fill(zones.mid)} stroke="var(--mm-ink-soft)" strokeWidth="1" />
        {/* 페인트 = 골밑 */}
        <rect x="56" y="1" width="48" height="56" fill={fill(zones.rim)} stroke="var(--mm-ink-soft)" strokeWidth="1" />
        <circle cx="80" cy="12" r="4" fill="none" stroke="var(--mm-ink)" strokeWidth="1.5" />
        {([[80, 36, zones.rim, 80, 50, '골밑'], [32, 28, zones.mid, 32, 41, '미드'], [22, 104, zones.three, 22, 88, '3점']] as const).map(([x, y, n, lx, ly, l]) => (
          <g key={l}>
            <text x={x} y={y} textAnchor="middle" fontSize="15" fontWeight="900" fill="var(--mm-ink)" className="font-jersey tabular-nums">{n}</text>
            <text x={lx} y={ly} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--mm-ink-soft)">{l}</text>
          </g>
        ))}
      </svg>
      {unknown > 0 && (
        <span className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }} title="위치를 알 수 없는 블록">? {unknown}</span>
      )}
    </div>
  )
}

/** 리바운드 고리 — 노랑 = 공격 리바 비중, 검은 눈금 = 리그 평균 */
function ReboundRing({ share, league }: { share: number; league: number | null }) {
  const R = 30, C = 2 * Math.PI * R
  const tick = league != null ? (league / 100) * 360 - 90 : null
  return (
    <svg viewBox="0 0 80 80" className="w-20 h-20 shrink-0" role="img"
      aria-label={`내 리바운드 중 공격 리바운드 ${share}%${league != null ? `, 리그 평균 ${league}%` : ''}`}>
      <circle cx="40" cy="40" r={R} fill="none" stroke="var(--mm-rule)" strokeWidth="9" />
      <circle cx="40" cy="40" r={R} fill="none" stroke="var(--mm-yellow-strong)" strokeWidth="9"
        strokeDasharray={`${(share / 100) * C} ${C}`} transform="rotate(-90 40 40)" />
      {tick != null && (
        <line x1="40" y1="4" x2="40" y2="16" stroke="var(--mm-ink)" strokeWidth="2.5" transform={`rotate(${tick + 90} 40 40)`} />
      )}
      <text x="40" y="45" textAnchor="middle" fontSize="16" fontWeight="900" fill="var(--mm-ink)" className="font-jersey tabular-nums">{share}%</text>
    </svg>
  )
}

const DEF_HEAD: Record<PlayStyle['defense']['lean'], string> = {
  rim: '골밑을 지키는 수비', perimeter: '볼을 뺏는 외곽 수비', balanced: '골밑·외곽 고루', quiet: '수비 기록이 적은 편',
}
const REB_HEAD: Record<NonNullable<PlayStyle['rebound']['lean']>, string> = {
  offense: '공격 리바운드에 적극적', defense: '수비 리바운드 위주', balanced: '공격·수비 고루',
}

export function PlayStyleDefense({ style }: { style: PlayStyle }) {
  const d = style.defense, r = style.rebound
  const rimProtector = style.tags.some(t => t.key === 'rim-protector')
  return (
    <section aria-labelledby="ps-def-title">
      <div className="flex items-center gap-1 mb-2">
        <p id="ps-def-title" className="font-jersey text-xs font-bold" style={{ color: 'var(--mm-yellow-strong)' }}>수비 · 리바운드</p>
        <InfoTip label="수비·리바운드 보는 법" text="점 5칸 = 순위 자격 선수 중 하루 평균 순위(한 칸 = 상위 20%). 막아낸 슛 위치는 블록 직전 상대가 놓친 슛으로 판단해요(친선전 제외, ? = 위치 모름). 리바운드 고리의 노랑은 내 리바운드 중 공격 리바운드 비중, 검은 눈금은 리그 평균이에요." />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Box title="수비 성향" headline={DEF_HEAD[d.lean]}>
          <div className="grid grid-cols-2 gap-2">
            <StatTile icon={<Shield size={18} />} label="블록" value={d.blk_per_day} pct={d.blk_pct} />
            <StatTile icon={<Hand size={18} />} label="스틸" value={d.stl_per_day} pct={d.stl_pct} />
          </div>
        </Box>
        <Box title="림 프로텍팅" headline={d.blocked.total === 0 ? '아직 블록이 없어요' : rimProtector ? '림 프로텍터' : d.rim_share == null ? '막은 위치를 아직 몰라요' : d.rim_share >= 60 ? '골밑에서 막는 편' : '골밑 밖에서도 막는 편'}>
          {d.blocked.total > 0 && <BlockCourt zones={d.blocked.zones} unknown={d.blocked.unknown} />}
        </Box>
        <Box title="리바운드 성향" headline={r.lean ? REB_HEAD[r.lean] : '리바운드 표본이 적어요'}>
          <div className="flex items-center gap-3">
            {r.oreb_share != null && <ReboundRing share={r.oreb_share} league={r.league_oreb_share} />}
            <div className="grid gap-2">
              <StatTile icon={<ArrowBigUp size={18} />} label="공격 리바" value={r.oreb_per_day} pct={r.oreb_pct} />
              <StatTile icon={<ArrowBigDown size={18} />} label="수비 리바" value={r.dreb_per_day} pct={r.dreb_pct} />
            </div>
          </div>
        </Box>
      </div>
    </section>
  )
}
