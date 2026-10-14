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
// - 편집 전용 카드(팀 명단 편집기 — isEditMode·저장 콜백)는 이 전역 카드가 아니라 그 화면 자기 모달을 쓴다.
import { createContext, useCallback, useContext, useState } from 'react'
import dynamic from 'next/dynamic'

const PlayerQuickViewModal = dynamic(() => import('@/components/league/PlayerQuickViewModal'), { ssr: false })

export type OpenPlayerCardArgs = {
  playerId: string
  /** 카드가 데이터를 받기 전 머리에 바로 보일 이름 */
  playerName?: string
  /** 예약 — 지금 카드는 자기 데이터로 사진을 그린다 */
  photoUrl?: string | null
  /** 예약 — 지금 카드는 자기 분기 선택을 쓴다 */
  quarterId?: string | null
}

type OpenFn = (args: OpenPlayerCardArgs) => void

// 여는 함수(늘 같은 값)와 열림 상태를 나눈다 — 카드를 열고 닫을 때 화면의 이름 수백 개가 다시 그려지지 않게.
const OpenContext = createContext<OpenFn | null>(null)
const OpenStateContext = createContext(false)

export function PlayerCardProvider({ leagueId, children }: { leagueId: string; children: React.ReactNode }) {
  const [current, setCurrent] = useState<{ id: string; name: string } | null>(null)
  const open = useCallback((args: OpenPlayerCardArgs) => {
    if (!args.playerId) return
    setCurrent({ id: args.playerId, name: args.playerName ?? '' })
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
            onClose={() => setCurrent(null)}
          />
        </div>
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
