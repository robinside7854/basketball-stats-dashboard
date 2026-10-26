'use client'
// 선수 카드 「플레이스타일」 탭의 머리(한눈에 태그)와 수비·리바운드 영역 (2026-10-26).
//   계산은 전부 lib/stats/playStyle.ts — 여기서는 보여 주기만 한다. 막대는 쓰지 않는다(2026-10-25 운영진).
import { Shield, Hand, ArrowBigUp, ArrowBigDown } from 'lucide-react'
import InfoTip from '@/components/league/ui/InfoTip'
import type { PlayStyle, StyleTag } from '@/lib/stats/playStyle'

const SIDE_LABEL: Record<StyleTag['side'], string> = { offense: '공격', defense: '수비', rebound: '리바운드' }

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
function Box({ title, headline, children, wide = false }: { title: string; headline: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`px-3 py-2.5${wide ? ' sm:col-span-2' : ''}`} style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}>
      <p className="text-xs font-black" style={{ color: 'var(--mm-muted)' }}>{title}</p>
      <p className="font-bold mt-0.5 break-keep" style={{ color: 'var(--mm-ink)', fontSize: '18px', letterSpacing: '-0.005em' }}>{headline}</p>
      <div className="mt-2.5">{children}</div>
    </div>
  )
}

/** 아이콘 + 하루 평균 + 리그 순위(「3위 / 42명」) */
function StatTile({ icon, label, value, rank, style }: { icon: React.ReactNode; label: string; value: number; rank: number; style: PlayStyle }) {
  const rankText = style.ranked ? `${rank}위` : '순위 밖'
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span aria-hidden className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center" style={{ background: 'var(--mm-panel)', border: '1px solid var(--mm-rule)', color: 'var(--mm-ink)' }}>{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-bold" style={{ color: 'var(--mm-muted)' }}>{label} <span className="tabular-nums">{value}</span></p>
        <p className="font-jersey font-black tabular-nums leading-none mt-0.5" style={{ color: style.ranked && rank <= 3 ? 'var(--mm-yellow-strong)' : 'var(--mm-ink)', fontSize: '20px' }}>
          {rankText}{style.ranked && <span className="text-xs font-bold ml-1" style={{ color: 'var(--mm-muted)' }}>/ {style.pool_size}명</span>}
        </p>
      </div>
    </div>
  )
}

/** 막아낸 슛 위치 — 반코트 그림에 골밑·미드·3점 칸을 막은 개수만큼 진하게. 위치를 모르는 블록은 넣지 않는다 */
function BlockCourt({ zones }: { zones: Record<'rim' | 'mid' | 'three', number> }) {
  const max = Math.max(1, zones.rim, zones.mid, zones.three)
  const fill = (n: number) => `color-mix(in srgb, var(--mm-yellow-strong) ${n === 0 ? 0 : 15 + Math.round((n / max) * 60)}%, transparent)`
  const spots = [
    { n: zones.rim, l: '골밑', x: 80, y: 32 },
    { n: zones.mid, l: '미드', x: 33, y: 26 },
    { n: zones.three, l: '3점', x: 22, y: 92 },
  ]
  return (
    <svg viewBox="0 0 160 112" className="w-full max-w-[320px] mx-auto block" role="img"
      aria-label={`막아낸 슛 위치 — 골밑 ${zones.rim}개, 미드 ${zones.mid}개, 3점 ${zones.three}개`}>
      <rect x="1" y="1" width="158" height="110" fill={fill(zones.three)} stroke="var(--mm-rule)" />
      <path d="M14 1 V40 A66 66 0 0 0 146 40 V1 Z" fill={fill(zones.mid)} stroke="var(--mm-ink-soft)" strokeWidth="1" />
      <rect x="56" y="1" width="48" height="56" fill={fill(zones.rim)} stroke="var(--mm-ink-soft)" strokeWidth="1" />
      <circle cx="80" cy="8" r="3.5" fill="none" stroke="var(--mm-ink)" strokeWidth="1.2" />
      {spots.map(p => (
        <g key={p.l}>
          {/* 글자 뒤 바탕 — 진한 칸 위에서도 읽히게 */}
          <rect x={p.x - 17} y={p.y - 11} width="34" height="28" rx="3" fill="var(--mm-panel)" opacity="0.9" />
          <text x={p.x} y={p.y} textAnchor="middle" fontSize="9" fontWeight="800" fill="var(--mm-ink)">{p.l}</text>
          <text x={p.x} y={p.y + 13} textAnchor="middle" fontSize="13" fontWeight="900" fill="var(--mm-ink)" className="font-jersey tabular-nums">{p.n}</text>
        </g>
      ))}
    </svg>
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
        <InfoTip label="수비·리바운드 보는 법" text="숫자 = 하루 평균, 순위 = 순위 자격 선수 중 하루 평균 순위. 막아낸 슛 위치는 블록 직전 상대가 놓친 슛으로 판단해요(친선전 제외, 판단이 안 되는 블록은 그림에서 뺐어요). 리바운드 고리의 노랑은 내 리바운드 중 공격 리바운드 비중, 검은 눈금은 리그 평균이에요." />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Box title="수비 성향" headline={DEF_HEAD[d.lean]}>
          <div className="grid grid-cols-2 gap-2">
            <StatTile icon={<Shield size={18} />} label="블록" value={d.blk_per_day} rank={d.blk_rank} style={style} />
            <StatTile icon={<Hand size={18} />} label="스틸" value={d.stl_per_day} rank={d.stl_rank} style={style} />
          </div>
        </Box>
        <Box title="리바운드 성향" headline={r.lean ? REB_HEAD[r.lean] : '리바운드 표본이 적어요'}>
          <div className="flex items-center gap-3">
            {r.oreb_share != null && <ReboundRing share={r.oreb_share} league={r.league_oreb_share} />}
            <div className="grid gap-2">
              <StatTile icon={<ArrowBigUp size={18} />} label="공격 리바" value={r.oreb_per_day} rank={r.oreb_rank} style={style} />
              <StatTile icon={<ArrowBigDown size={18} />} label="수비 리바" value={r.dreb_per_day} rank={r.dreb_rank} style={style} />
            </div>
          </div>
        </Box>
        <Box wide title="림 프로텍팅" headline={d.blocked.total === 0 ? '아직 블록이 없어요' : rimProtector ? '림 프로텍터' : d.rim_share == null ? '막은 위치를 아직 몰라요' : d.rim_share >= 60 ? '골밑에서 막는 편' : '골밑 밖에서도 막는 편'}>
          {d.blocked.total > 0 && d.rim_share != null && <BlockCourt zones={d.blocked.zones} />}
        </Box>
      </div>
    </section>
  )
}
