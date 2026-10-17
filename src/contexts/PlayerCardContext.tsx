'use client'
// 선수 카드(PlayerQuickViewModal) 하나를 리그 레이아웃에 한 번만 띄운다 (2026-10-14).
//
// 왜: 화면마다 선수 이름을 누르면 선수 카드가 떠야 하는데(사용자 요청 — 모바일·PC 공통),
//   종전엔 화면마다 자기 모달을 따로 들고 있어 어떤 표는 열리고 어떤 표는 안 열렸다.
//   이제 이름 자리는 `<PlayerName>`(또는 `useOpenPlayerCard()`) 하나로 이 카드를 연다.
//
// - 모달 코드는 처음 열 때 받는다(next/dynamic) — 열지 않는 화면은 비용 0.
// - 프로바이더 밖(비공개 리그 게이트·리그 트리 바깥)에서는 `useOpenPlayerCard()` 가 null —
//   `<PlayerName>` 은 그때 평범한 글자로 그린다.
// - (2026-10-17) 어드민·CEO 는 이 전역 카드에서도 「편집」(이름·포지션·사진·+1)이 열린다 — 삭제는 팀 명단 편집기에서만.
// - (2026-10-15) 카드는 **연 화면의 분기**로 열린다(quarterId) — 스탯 탭에서 4분기를 보다 이름을 누르면 카드도 4분기.
//   없거나 'all' 이면 전체 기간. 카드 안 「나와 비교」는 카드를 닫고 이 프로바이더가 비교 시트를 띄운다
//   (카드 안에 겹쳐 띄우면 두 창이 Esc·Tab 을 서로 빼앗는다 — Sheet 의 usePlayerCardOpen 주석).
import { createContext, useCallback, useContext, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useLeagueEditMode } from '@/contexts/LeagueEditModeContext'
import type { PlayerTabKey } from '@/components/league/player/PlayerMiniTabs'

const PlayerQuickViewModal = dynamic(() => import('@/components/league/PlayerQuickViewModal'), { ssr: false })
const PlayerCompareModal = dynamic(() => import('@/components/league/PlayerCompareModal'), { ssr: false })

export type OpenPlayerCardArgs = {
  playerId: string
  /** 카드가 데이터를 받기 전 머리에 바로 보일 이름 */
  playerName?: string
  /** 카드를 연 화면의 분기 — 카드가 이 분기로 열린다. 없거나 'all' 이면 전체 기간 */
  quarterId?: string | null
  /** 처음 열 미니 탭 — 없으면 이 리그에서 마지막으로 본 탭(데이터가 없으면 시즌 스탯) */
  tab?: PlayerTabKey
}

type OpenFn = (args: OpenPlayerCardArgs) => void

// 여는 함수(늘 같은 값)와 열림 상태를 나눈다 — 카드를 열고 닫을 때 화면의 이름 수백 개가 다시 그려지지 않게.
const OpenContext = createContext<OpenFn | null>(null)
const OpenStateContext = createContext(false)

export function PlayerCardProvider({ leagueId, children }: { leagueId: string; children: React.ReactNode }) {
  const [current, setCurrent] = useState<{ id: string; name: string; quarterId: string | null; tab?: PlayerTabKey } | null>(null)
  const { isEditMode, leagueHeaders } = useLeagueEditMode()
  const router = useRouter()
  const [compare, setCompare] = useState<{ ids: [string, string]; quarterId: string | null } | null>(null)
  const open = useCallback((args: OpenPlayerCardArgs) => {
    if (!args.playerId) return
    const q = args.quarterId && args.quarterId !== 'all' ? args.quarterId : null
    setCurrent({ id: args.playerId, name: args.playerName ?? '', quarterId: q, tab: args.tab })
  }, [])
  return (
    <OpenContext.Provider value={open}>
    <OpenStateContext.Provider value={current !== null}>
      {children}
      {current && (
        // 다른 모달(z-50~z-100) 위에서 이름을 눌러도 카드가 그 뒤에 깔리지 않게 한 층 위에 둔다.
        //   로그인 모달(z-80)은 카드가 스스로 닫힌 뒤 열리므로 겹치지 않는다.
        <div className="relative z-[110]">
          <PlayerQuickViewModal
            leagueId={leagueId}
            playerId={current.id}
            playerName={current.name}
            initialQuarterId={current.quarterId}
            initialTab={current.tab}
            onClose={() => setCurrent(null)}
            isEditMode={isEditMode}
            leagueHeaders={leagueHeaders}
            onSaved={() => router.refresh()}
            onCompare={(ids, quarterId) => { setCurrent(null); setCompare({ ids, quarterId }) }}
          />
        </div>
      )}
      {compare && (
        <PlayerCompareModal
          leagueId={leagueId}
          initialIds={compare.ids}
          quarterId={compare.quarterId}
          onClose={() => setCompare(null)}
        />
      )}
    </OpenStateContext.Provider>
    </OpenContext.Provider>
  )
}

/** 선수 카드 열기 — 프로바이더 밖이면 null */
export function useOpenPlayerCard(): ((args: OpenPlayerCardArgs) => void) | null {
  return useContext(OpenContext)
}

/**
 * 선수 카드가 지금 떠 있는가 — 자기 focus trap·Esc 를 가진 모달은 이 동안 그것을 쉬어야 한다
 * (두 trap 이 Tab 을 서로 빼앗고, Esc 한 번에 둘 다 닫힌다).
 */
export function usePlayerCardOpen(): boolean {
  return useContext(OpenStateContext)
}
