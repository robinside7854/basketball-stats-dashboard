'use client'
// 상단 스티키 현황 바의 "다음 차례" 칩 — 빔 프로젝터에서 "지금 누구, 다음 누구"가 항상 보이게.
//
// 스네이크 방향을 직접 계산한다. 서버(drafts/current/route.ts computeCurrentTeam)와 같은 규칙:
//   짝수 라운드(round % 2 === 0)면 draft_order 를 뒤집어 읽는다.
// 서버는 "현재" 팀만 내려주므로 다음 2팀은 클라이언트가 같은 규칙으로 앞서 나가야 한다.

import { ChevronRight } from 'lucide-react'
import { teamInk } from '@/lib/util/contrastColor'

interface Team { id: string; name: string; color: string }

/** 스네이크 규칙을 적용해 (라운드, 인덱스) 위치의 팀 id 를 돌려준다 */
function teamIdAt(draftOrder: string[], method: 'snake' | 'linear', round: number, idx: number): string {
  if (method === 'snake' && round % 2 === 0) return draftOrder[draftOrder.length - 1 - idx]
  return draftOrder[idx]
}

/**
 * 현재 픽 다음에 올 팀 id 를 순서대로 최대 `count` 개 돌려준다.
 * poolSize 를 주면 남은 픽 수를 넘어서 표시하지 않는다(마지막 픽에서 "다음"이 헛돌지 않게).
 */
export function nextUpTeamIds({
  draftOrder,
  method,
  currentRound,
  currentPickIndex,
  picksMade,
  poolSize,
  count = 2,
}: {
  draftOrder: string[]
  method: 'snake' | 'linear'
  currentRound: number
  currentPickIndex: number
  picksMade: number
  poolSize?: number | null
  count?: number
}): string[] {
  const n = draftOrder.length
  if (n === 0) return []
  if (currentPickIndex < 0 || currentPickIndex >= n) return []
  // 현재 픽을 제외하고 몇 번의 픽이 더 남았나 — 풀 크기를 모르면 제한하지 않는다
  const remaining = poolSize != null ? Math.max(0, poolSize - picksMade - 1) : count
  const want = Math.min(count, remaining)
  const out: string[] = []
  let round = currentRound
  let idx = currentPickIndex
  for (let k = 0; k < want; k++) {
    idx += 1
    if (idx >= n) { idx = 0; round += 1 }
    out.push(teamIdAt(draftOrder, method, round, idx))
  }
  return out
}

/**
 * "다음: 굿모닝 › 빅현욱" 칩.
 * 390px 에서도 한 줄을 유지해야 하므로 이름은 truncate, 두 번째 팀은 sm 이상에서만 보인다.
 */
export default function DraftNextUpChips({
  teams,
  draftOrder,
  method,
  currentRound,
  currentPickIndex,
  picksMade,
  poolSize,
}: {
  teams: Team[]
  draftOrder: string[]
  method: 'snake' | 'linear'
  currentRound: number
  currentPickIndex: number
  picksMade: number
  poolSize?: number | null
}) {
  const ids = nextUpTeamIds({ draftOrder, method, currentRound, currentPickIndex, picksMade, poolSize })
  if (ids.length === 0) return null
  const byId = Object.fromEntries(teams.map(t => [t.id, t]))

  return (
    <div className="flex items-center gap-1 min-w-0 shrink" aria-label="다음 픽 순서">
      <span className="text-sm text-[var(--mm-muted)] font-bold shrink-0">다음</span>
      {ids.map((id, i) => {
        const t = byId[id]
        return (
          <span
            key={`${id}-${i}`}
            className={`inline-flex items-center gap-1 min-w-0 ${i === 0 ? '' : 'hidden sm:inline-flex'}`}
          >
            {i > 0 && <ChevronRight size={14} className="text-[var(--mm-muted)] shrink-0" aria-hidden />}
            <span className="w-2.5 h-2.5 rounded-full shrink-0 border" style={{ backgroundColor: teamInk(t?.color).bg, borderColor: teamInk(t?.color).border }} aria-hidden />
            <span className="text-sm font-bold text-[var(--mm-ink-soft)] truncate min-w-0 max-w-[5.5rem] lg:max-w-none">
              {t?.name ?? '?'}
            </span>
          </span>
        )
      })}
    </div>
  )
}
