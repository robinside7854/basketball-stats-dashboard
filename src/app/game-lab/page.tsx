import type { Metadata } from 'next'
import GameLab from '@/components/game/GameLab'

// 미라클 후프스 0단계 — 손맛 시험판 (2026-11-13, docs/miracle-hoops-game-design.md)
// 선수 데이터가 없는 네모 캐릭터 시험판이라 로그인 없이 연다. 검색엔진에는 올리지 않는다.
// 1단계(우리 선수)부터는 리그 안 주소 + 비밀 주소/회원 확인으로 옮긴다.
export const metadata: Metadata = {
  title: '온볼 — 농구게임 시험판',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <GameLab />
}
