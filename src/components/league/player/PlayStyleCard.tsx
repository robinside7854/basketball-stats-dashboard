'use client'
// 선수 카드 「플레이스타일」 탭의 머리(한눈에 태그)와 수비·리바운드 영역 (2026-10-26).
//   계산은 전부 lib/stats/playStyle.ts — 여기서는 보여 주기만 한다. 막대는 쓰지 않는다(2026-10-25 운영진).
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

function Box({ title, headline, children }: { title: string; headline: string; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2.5" style={{ background: 'var(--mm-panel-alt)', border: '1px solid var(--mm-rule)' }}>
      <p className="text-xs font-black" style={{ color: 'var(--mm-muted)' }}>{title}</p>
      <p className="font-bold mt-0.5 break-keep" style={{ color: 'var(--mm-ink)', fontSize: '18px', letterSpacing: '-0.005em' }}>{headline}</p>
      <div className="mt-1.5 space-y-0.5 text-xs font-bold tabular-nums" style={{ color: 'var(--mm-ink-soft)' }}>{children}</div>
    </div>
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
  const z = d.blocked.zones
  const rimProtector = style.tags.some(t => t.key === 'rim-protector')
  return (
    <section aria-labelledby="ps-def-title">
      <p id="ps-def-title" className="font-jersey text-xs font-bold mb-2" style={{ color: 'var(--mm-yellow-strong)' }}>수비 · 리바운드</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Box title="수비 성향" headline={DEF_HEAD[d.lean]}>
          <p>블록 하루 {d.blk_per_day} · {top(d.blk_pct)}</p>
          <p>스틸 하루 {d.stl_per_day} · {top(d.stl_pct)}</p>
        </Box>
        <Box title="림 프로텍팅" headline={d.blocked.total === 0 ? '아직 블록이 없어요' : rimProtector ? '림 프로텍터' : d.rim_share == null ? '막은 위치를 아직 몰라요' : d.rim_share >= 60 ? '골밑에서 막는 편' : '골밑 밖에서도 막는 편'}>
          {d.blocked.total > 0 ? (
            <>
              <p>막아낸 슛 {d.blocked.total}개 — 골밑 {z.rim} · 미드 {z.mid} · 3점 {z.three}{d.blocked.unknown > 0 ? ` · 위치 모름 ${d.blocked.unknown}` : ''}</p>
              {d.rim_share != null && <p>골밑(레이업·포스트) 슛 비중 {d.rim_share}%</p>}
            </>
          ) : <p>블록이 쌓이면 어디서 막는지 보여 드려요</p>}
        </Box>
        <Box title="리바운드 성향" headline={r.lean ? REB_HEAD[r.lean] : '리바운드 표본이 적어요'}>
          <p>공격 리바 하루 {r.oreb_per_day} · {top(r.oreb_pct)}</p>
          <p>수비 리바 하루 {r.dreb_per_day} · {top(r.dreb_pct)}</p>
          {r.oreb_share != null && r.league_oreb_share != null && (
            <p>내 리바운드 중 공격 리바 {r.oreb_share}% (리그 {r.league_oreb_share}%)</p>
          )}
        </Box>
      </div>
      <p className="text-xs mt-2 break-keep" style={{ color: 'var(--mm-muted)' }}>
        상위 % = 순위 자격 선수 중 하루 평균 순서 · 막아낸 슛 위치는 블록 직전 상대가 놓친 슛으로 판단해요(친선전 제외)
      </p>
    </section>
  )
}
