'use client'
// 동호회 운영 설정 · 기능 스위치를 화면에 내려 주는 통로 (2026-11-10 온볼 플랫폼화 3단계)
//   리그 레이아웃(서버)이 loadClub() 결과를 넘긴다. 프로바이더 밖(시험 화면 등)에서는 종전처럼 전부 켬 + 미라클 기본값.
import { createContext, useContext } from 'react'
import { ALL_FEATURES_ON, DEFAULT_SETTINGS, type ClubFeatures, type ClubSettings } from '@/lib/club/features'

type ClubCtx = { features: ClubFeatures; settings: ClubSettings }
const Ctx = createContext<ClubCtx>({ features: ALL_FEATURES_ON, settings: DEFAULT_SETTINGS })

export function ClubProvider({ value, children }: { value: ClubCtx | null; children: React.ReactNode }) {
  return <Ctx.Provider value={value ?? { features: ALL_FEATURES_ON, settings: DEFAULT_SETTINGS }}>{children}</Ctx.Provider>
}

export function useClub(): ClubCtx {
  return useContext(Ctx)
}
